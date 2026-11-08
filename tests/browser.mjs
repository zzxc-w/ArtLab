import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url=process.env.TEST_URL||'http://127.0.0.1:4180/';
const out=new URL('../test-results/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[],check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
 // Pixel comparisons repeatedly read the preview. Keep its Canvas2D backend
 // stable instead of letting Chrome switch GPU/CPU after several readbacks.
 await context.addInitScript(()=>{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,options){return getContext.call(this,kind,kind==='2d'&&this.id==='preview'?{...options,willReadFrequently:true}:options);};});
 const page=await context.newPage();
 const portraitResponses=[],paintedPortraitResponses=[];
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(/\/portrait-flats(?:-[^/]+)?\.png$/.test(path))portraitResponses.push({url:response.url(),status:response.status()});if(/\/game-portrait(?:-[^/]+)?\.png$/.test(path))paintedPortraitResponses.push(response.url());});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const waitForStudy=async()=>{await page.waitForFunction(()=>window.artlabDiagnostics);await page.waitForFunction(()=>{const portrait=window.artlabDiagnostics?.().portrait;return portrait?.ready||portrait?.error;});const portrait=await page.evaluate(()=>window.artlabDiagnostics().portrait);assert.ok(!portrait.error,`Portrait decoding failed: ${portrait.error}`);assert.equal(portrait.ready,true);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 await page.goto(url);await waitForStudy();
 const state=()=>page.evaluate(()=>window.artlabDiagnostics());const art=()=>page.locator('#preview').screenshot();
 const settlePreview=async()=>{await page.waitForFunction(()=>window.artlabDiagnostics?.().portrait?.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const setLight=async(key,value)=>{await page.locator('#light-'+key).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);await settlePreview();};
 const setLive=async enabled=>{const control=page.locator('#live-lighting');if(await control.isChecked()!==enabled)await control.setChecked(enabled);await settlePreview();};
 const rawArtHash=()=>page.locator('#preview').evaluate(async canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;const digest=await crypto.subtle.digest('SHA-256',pixels);return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');});
 const saveArt=async name=>{const png=await page.locator('#preview').evaluate(canvas=>canvas.toDataURL());await writeFile(new URL(name,out),Buffer.from(png.split(',')[1],'base64'));};
 const restoreStudy=async study=>{await page.locator('#palette-file').setInputFiles({name:'restore-browser-study.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'artlab',version:2,study}))});await page.waitForFunction(expected=>{const actual=window.artlabDiagnostics().study;return Object.entries(expected).every(([key,value])=>key==='light'?Object.entries(value).every(([field,v])=>actual.light[field]===v):key==='colors'?value.length===actual.colors.length&&value.every((color,index)=>Object.entries(color).every(([field,v])=>actual.colors[index][field]===v)):actual[key]===value);},study);await settlePreview();};
 // Fixed source-art landmarks, chosen from visible material interiors rather
 // than searching the renderer's own labels for a convenient matching pixel.
 const materialLandmarks=[
  {name:'cheek',material:0,u:.48,v:.25},
  {name:'forehead',material:0,u:.45,v:.15},
  {name:'neck',material:0,u:.50,v:.34},
  {name:'hair crown',material:1,u:.50,v:.07},
  {name:'front bangs',material:1,u:.35,v:.15},
  {name:'left hair lock',material:1,u:.31,v:.32},
  {name:'back ponytail',material:1,u:.736,v:.152},
  {name:'long right hair',material:1,u:.89,v:.55},
  {name:'coat collar',material:2,u:.38,v:.39},
  {name:'coat sleeve',material:2,u:.82,v:.72},
  {name:'lower coat front',material:2,u:.50,v:.70},
  {name:'gold hair clip',material:3,u:.675,v:.123},
  {name:'gold earring',material:3,u:.594,v:.272},
  {name:'gold side clip',material:3,u:.673,v:.246},
  {name:'gold coat buckle',material:3,u:.58,v:.382},
  {name:'charcoal inner costume',material:4,u:.33,v:.58},
  {name:'gray shoulder armor',material:5,u:.74,v:.46},
 ];
 const materialSamples=(landmarks=materialLandmarks,alignGeometry=false)=>page.locator('#preview').evaluate((canvas,{landmarks,alignGeometry})=>{
  const context=canvas.getContext('2d'),bounds=canvas.getBoundingClientRect();
  return landmarks.map(landmark=>{
   let probe=window.artlabPortraitProbe?.(landmark.u,landmark.v);
   if(!probe)return {...landmark,probe:null};
   const x=Math.round(probe.x*canvas.width/bounds.width),y=Math.round(probe.y*canvas.height/bounds.height);
   if(x<0||y<0||x>=canvas.width||y>=canvas.height)return {...landmark,probe,pixel:null};
   if(alignGeometry){const origin=window.artlabPortraitProbe(0,0),end=window.artlabPortraitProbe(1,1),u=((x+.5)*bounds.width/canvas.width-origin.x)/(end.x-origin.x),v=((y+.5)*bounds.height/canvas.height-origin.y)/(end.y-origin.y);probe=window.artlabPortraitProbe(u,v);}
   return {...landmark,probe,pixel:Array.from(context.getImageData(x,y,1,1).data)};
  });
 },{landmarks,alignGeometry});
 const rgb=hex=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));
 const assertInterior=(sample,hex)=>{
  assert.ok(sample.probe,`${sample.name} has a decoded material probe`);
  assert.equal(sample.probe.material,sample.material,`${sample.name} belongs to its visible source material`);
  assert.ok(sample.probe.alpha>.99,`${sample.name} is an opaque interior`);
  assert.equal(sample.probe.ink,0,`${sample.name} avoids authored linework`);
  assert.ok(sample.pixel,`${sample.name} remains inside the visible portrait`);
  const expected=rgb(hex),difference=Math.max(...expected.map((value,index)=>Math.abs(value-sample.pixel[index])));
  assert.ok(difference<=1,`${sample.name} is the actual base ${hex}, received ${sample.pixel.slice(0,3)} (maximum channel error ${difference})`);
  assert.equal(sample.pixel[3],255);
 };
 await check('standalone ArtLab starts with five editable materials and five-role ramps',async()=>{const a=await state();assert.equal(a.study.colors.length,5);assert.equal(a.ramps.length,5);assert.ok(a.ramps.every(r=>Object.keys(r).length===5));await page.screenshot({path:new URL('desktop.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});});
 await check('the unlit flat-color portrait is bundled and fully decoded without loading the painted source',async()=>{
  const bytes=await readFile(new URL('../src/assets/portrait-flats.png',import.meta.url));assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1536);
  const portrait=(await state()).portrait;assert.equal(portrait.ready,true);assert.ok(!portrait.error);assert.ok(portraitResponses.some(response=>response.status===200),'The local unlit portrait asset loaded successfully');assert.deepEqual(paintedPortraitResponses,[],'The obsolete painted artwork is not a runtime dependency');await saveArt('flat-portrait-default.png');
 });
 await check('manual lighting is the default and keeps dragging sliders and exports separate from the applied preview',async()=>{
  const before=(await state()).study;
  try{
   assert.equal((await state()).liveLighting,false);assert.equal(await page.locator('#live-lighting').isChecked(),false);assert.equal(await page.locator('#key-light').isDisabled(),true);
   await page.locator('.art-stage').scrollIntoViewIfNeeded();await settlePreview();
   const initial=await state(),picture=await rawArtHash(),handle=await page.locator('#key-light').boundingBox(),canvas=await page.locator('#preview').boundingBox();
   await page.locator('#color-list [data-select="hair"]').click();await settlePreview();assert.equal((await state()).previewDraws,initial.previewDraws,'Selecting a portrait swatch does not repaint unchanged artwork');await page.locator('#color-list [data-select="skin"]').click();await settlePreview();
   assert.ok(handle&&canvas);await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width-64,canvas.y+canvas.height/2,{steps:4});await page.mouse.up();
   await page.locator('#key-light').evaluate(button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));await settlePreview();
   assert.deepEqual((await state()).study.light,initial.study.light,'An inactive source cannot be dragged or moved with a key');assert.deepEqual((await state()).draftLight,initial.draftLight);
   await page.locator('[data-preset="moonlight"]').click();await settlePreview();assert.deepEqual((await state()).appliedLight,initial.appliedLight,'A manual preset queues its light without changing the preview');assert.equal((await state()).pendingLighting,true);assert.equal((await state()).previewDraws,initial.previewDraws);await page.locator('#reset-light').click();await settlePreview();assert.deepEqual((await state()).appliedLight,initial.appliedLight,'Reset is also deferred in manual mode');assert.equal((await state()).previewDraws,initial.previewDraws);
   await page.locator('#ambient').evaluate(input=>{input.value='#123abc';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});await settlePreview();assert.equal((await state()).draftLight.ambient,'#123ABC');
   await setLight('direction',initial.study.light.direction===85?-85:85);await setLight('temperature',-.65);await setLight('strength',.91);
   const pending=await state();assert.equal(pending.pendingLighting,true);assert.deepEqual(pending.study.light,initial.study.light);assert.deepEqual(pending.appliedLight,initial.study.light);assert.equal(await rawArtHash(),picture,'Changing pending lighting does not redraw a different image');assert.equal(pending.previewDraws,initial.previewDraws,'Pending slider edits do not render the expensive preview');
   assert.equal(pending.draftLight.temperature,-.65);assert.equal(pending.draftLight.strength,.91);assert.equal(await page.locator('#apply-lighting').isEnabled(),true);
   await page.locator('.export-menu summary').click();const waiting=page.waitForEvent('download');await page.locator('[data-export="json"]').click();const exported=await waiting,path=new URL('manual-applied-light.json',out).pathname.replace(/^\/([A-Z]:)/,'$1');await exported.saveAs(path);const json=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(json.study.light,initial.study.light,'Portable palettes export the applied light rather than unseen pending edits');assert.equal(Object.hasOwn(json.study,'draftLight'),false);
   await page.locator('#hex').fill('#E96F53');await page.locator('#hex').press('Tab');await settlePreview();const colored=await state();assert.equal(colored.study.colors[0].hex,'#E96F53');assert.notEqual(await rawArtHash(),picture,'Color edits remain visible while live lighting is off');assert.deepEqual(colored.appliedLight,initial.study.light);assert.deepEqual(colored.draftLight,pending.draftLight);assert.equal(colored.pendingLighting,true);
   const coloredPicture=await rawArtHash();await page.locator('#discard-lighting').click();await settlePreview();const discarded=await state();assert.equal(discarded.pendingLighting,false);assert.deepEqual(discarded.draftLight,discarded.appliedLight);assert.deepEqual(discarded.appliedLight,initial.study.light);assert.equal(discarded.previewDraws,colored.previewDraws,'Discarding pending settings does no canvas work');assert.equal(await rawArtHash(),coloredPicture);assert.equal(await page.locator('#apply-lighting').isDisabled(),true);
   for(const [key,value] of Object.entries(pending.draftLight)){if(key==='ambient'){await page.locator('#ambient').evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);}else await setLight(key,value);}await settlePreview();assert.deepEqual((await state()).draftLight,pending.draftLight);assert.equal((await state()).previewDraws,colored.previewDraws);
   const drawCount=colored.previewDraws;await page.locator('#apply-lighting').click();await settlePreview();const applied=await state();assert.deepEqual(applied.study.light,pending.draftLight);assert.deepEqual(applied.appliedLight,pending.draftLight);assert.equal(applied.pendingLighting,false);assert.ok(applied.previewDraws>drawCount);assert.equal(applied.previewQuality,'final');assert.equal(await page.locator('#apply-lighting').isDisabled(),true);
   await saveArt('manual-lighting-applied.png');
  }finally{await restoreStudy(before);await setLive(false);}
 });
 await check('live lighting is optional remembered and explicitly applies pending settings when enabled',async()=>{
  const before=(await state()).study;
  try{
   await setLive(false);await page.reload();await waitForStudy();assert.equal((await state()).liveLighting,false);assert.equal(await page.locator('#key-light').isDisabled(),true);
   await setLight('direction',before.light.direction===72?-72:72);const draft=(await state()).draftLight;assert.equal((await state()).pendingLighting,true);
   await setLive(true);const active=await state();assert.equal(active.liveLighting,true);assert.equal(active.pendingLighting,false);assert.deepEqual(active.appliedLight,draft);assert.equal(await page.locator('#key-light').isEnabled(),true);
   await page.waitForFunction(direction=>JSON.parse(localStorage.getItem('artlab.study.v2')||'null')?.light.direction===direction,draft.direction);await page.reload();await waitForStudy();assert.equal((await state()).liveLighting,true);assert.deepEqual((await state()).appliedLight,draft);assert.equal(await page.locator('#live-lighting').isChecked(),true);
   const light=(await state()).appliedLight;await setLive(false);assert.deepEqual((await state()).appliedLight,light,'Disabling interactivity freezes the current illumination rather than turning it off');assert.equal((await state()).pendingLighting,false);
  }finally{await restoreStudy(before);await setLive(true);}
 });
 await check('base-colors toggle restores key strength and every material interior displays its exact editable base without region leakage',async()=>{
  const before=(await state()).study,flatColors=['#FF8A47','#FFFFFF','#000000','#00FFFF'],edits=['#58C5FF','#FF4B82','#A3EE68','#824DFF'],fixedColors={4:'#413C46',5:'#9F989D'},materialReport={flats:{},edits:[]};
  try{
   await setLight('strength',.73);await page.locator('#base-colors').click();await settlePreview();assert.equal((await state()).study.light.strength,0);assert.equal(await page.locator('#base-colors').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#light-description').textContent(),/exact base colors/i);await page.locator('#base-colors').click();await settlePreview();assert.equal((await state()).study.light.strength,.73);assert.equal(await page.locator('#base-colors').getAttribute('aria-pressed'),'false');
   const flat={...before,preview:'portrait',values:false,colors:before.colors.map((color,index)=>({...color,hex:flatColors[index]||color.hex})),light:{...before.light,strength:0}};
   for(const finish of ['cel','smooth']){
    await restoreStudy({...flat,shading:finish});const samples=await materialSamples();for(const sample of samples)assertInterior(sample,flatColors[sample.material]||fixedColors[sample.material]);materialReport.flats[finish]=samples;await saveArt(`flat-base-${finish}.png`);
   }
   for(let index=0;index<4;index++){
    await restoreStudy(flat);const color=before.colors[index];await page.locator(`#color-list [data-select="${color.id}"]`).click();await settlePreview();const previousSamples=await materialSamples();
    const previous=await rawArtHash();await page.locator('#preview').evaluate(canvas=>{window.artlabMaterialPixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;});
    await page.locator('#hex').fill(edits[index]);await page.locator('#hex').press('Tab');await settlePreview();assert.notEqual(await rawArtHash(),previous,`${color.name} changes the portrait itself`);
    const changedPixels=await page.locator('#preview').evaluate(canvas=>{const current=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,previous=window.artlabMaterialPixels;let changed=0;for(let i=0;i<current.length;i+=4)if(Math.max(Math.abs(current[i]-previous[i]),Math.abs(current[i+1]-previous[i+1]),Math.abs(current[i+2]-previous[i+2]))>8)changed++;return changed;});assert.ok(changedPixels>=40,`${color.name} visibly affects a material region (${changedPixels} pixels)`);
    const samples=await materialSamples();for(let point=0;point<samples.length;point++){const sample=samples[point];assertInterior(sample,sample.material===index?edits[index]:flatColors[sample.material]||fixedColors[sample.material]);if(sample.material!==index)assert.deepEqual(sample.pixel,previousSamples[point].pixel,`Editing ${color.name} does not recolor ${sample.name}`);}materialReport.edits.push({material:color.name,hex:edits[index],samples});
    const after=(await state()).study;assert.equal(after.colors[index].hex,edits[index]);for(let other=0;other<before.colors.length;other++)if(other!==index)assert.deepEqual(after.colors[other],flat.colors[other],'Other base materials remain intact');
   }
   await restoreStudy(flat);await setLight('direction',-90);const left=await rawArtHash(),leftSamples=await materialSamples();await setLight('direction',90);assert.equal(await rawArtHash(),left,'Flat portrait pixels are independent of the disabled source direction');assert.deepEqual(await materialSamples(),leftSamples,'Material base colors do not retain directional painted shading');
   await writeFile(new URL('flat-material-report.json',out),JSON.stringify(materialReport,null,2));
   await restoreStudy(before);await setLight('strength',1);await setLight('direction',-55);await saveArt('flat-cel-left.png');await setLight('direction',55);await saveArt('flat-cel-right.png');await page.locator('[data-shadow-style="soft"]').click();await settlePreview();await saveArt('flat-painted.png');
  }finally{await restoreStudy(before);}
 });
 await check('neighboring faces of one hair lock have local opposing normals and reverse their actual shading with the key',async()=>{
  const before=(await state()).study,pair=[{name:'left face of front fringe',material:1,u:.345,v:.17},{name:'right face of front fringe',material:1,u:.3725,v:.17}],brightness=sample=>sample.pixel[0]*.2126+sample.pixel[1]*.7152+sample.pixel[2]*.0722;
  try{
   await restoreStudy({...before,preview:'portrait',values:false,shading:'smooth',shadowStyle:'soft',colors:before.colors.map((color,index)=>index===1?{...color,hex:'#A0A0A0'}:color),light:{...before.light,temperature:0,hueShift:0,saturation:1,bounce:0,ambient:'#808080',shadow:.8,strength:1,elevation:25,direction:-90}});
   const normals=await materialSamples(pair,true);for(const sample of normals){assert.equal(sample.probe.material,1);assert.equal(sample.probe.ink,0);assert.equal(sample.probe.alpha,1);assert.ok(Math.abs(Math.hypot(...Object.values(sample.probe.normal))-1)<1e-5,'The local surface normal is normalized');}
   assert.ok(normals[0].probe.normal.x<-.2&&normals[1].probe.normal.x>.2,'Two nearby faces of the same drawn fringe point in opposite horizontal directions');
   const left=await materialSamples(pair,true);await saveArt('hair-lock-left.png');await setLight('direction',90);const right=await materialSamples(pair,true);await saveArt('hair-lock-right.png');
   await writeFile(new URL('hair-lock-report.json',out),JSON.stringify({left,right},null,2));
   assert.ok(brightness(left[0])>brightness(right[0])+10,'The left-facing lock is visibly brighter under the left source');assert.ok(brightness(right[1])>brightness(left[1])+10,'The right-facing lock is visibly brighter under the right source');
   for(const direction of [-90,90]){await setLight('direction',direction);const hairCasts=await page.evaluate(points=>points.map(point=>({name:point.name,...window.artlabPortraitLightProbe(point.u,point.v)})),materialLandmarks.filter(point=>point.material===1));for(const point of hairCasts)assert.equal(point.occlusion,0,`${point.name} receives its form shading without a contradictory terrain self-shadow`);}
  }finally{await restoreStudy(before);}
 });
 await check('HEX RGB HSV and saturation/value gestures update the same color',async()=>{
  await page.locator('#hex').fill('#336699');await page.locator('#hex').press('Tab');assert.equal((await state()).study.colors[0].hex,'#336699');assert.equal(await page.locator('#rgb-r').inputValue(),'51');
  await page.locator('#rgb-r').fill('150');await page.locator('#rgb-r').press('Tab');assert.equal((await state()).study.colors[0].hex,'#966699');
  const r=await page.locator('#sv-picker').boundingBox();await page.mouse.move(r.x+30,r.y+30);await page.mouse.down();await page.mouse.move(r.x+r.width*.7,r.y+r.height*.3,{steps:6});await page.mouse.up();assert.ok(Math.abs(Number(await page.locator('#hsv-s').inputValue())-70)<2);
  await page.locator('#hex').fill('nothex');await page.locator('#hex').press('Tab');assert.equal(await page.locator('#hex').inputValue(),(await state()).study.colors[0].hex);
 });
 await check('harmony generation keeps selected and locked anchors while changing unlocked colors',async()=>{
  await page.getByRole('button',{name:'Lock Hair',exact:true}).click();const before=(await state()).study;await page.locator('#generate').click();const after=(await state()).study;assert.equal(after.colors[0].hex,before.colors[0].hex);assert.equal(after.colors[1].hex,before.colors[1].hex);assert.notEqual(after.colors[2].hex,before.colors[2].hex);await page.locator('#undo').click();assert.deepEqual((await state()).study.colors,before.colors);await page.locator('#redo').click();assert.deepEqual((await state()).study.colors,after.colors);
 });
 await check('lighting presets and every control alter derived colors without changing base anchors',async()=>{
  const base=(await state()).study.colors.map(c=>c.hex),images=new Set();for(const id of ['sunlight','moonlight','sunset','overcast']){await page.locator(`[data-preset="${id}"]`).click();await page.waitForTimeout(50);images.add(hash(await art()));assert.deepEqual((await state()).study.colors.map(c=>c.hex),base);}assert.equal(images.size,4);
  const before=(await state()).ramps;await page.locator('#light-shadow').evaluate(el=>{el.value='.9';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});assert.notDeepEqual((await state()).ramps,before);
 });
 await check('all eight palette looks are distinct and preserve locked colors and the complete lighting setup',async()=>{
  const before=(await state()).study,drawer=page.locator('.palette-style-browser'),wasOpen=await drawer.evaluate(element=>element.open);
  if(!wasOpen)await drawer.locator('summary').click();
  try{
   const buttons=page.locator('[data-palette-style]'),ids=await buttons.evaluateAll(elements=>elements.map(element=>element.dataset.paletteStyle));assert.equal(ids.length,8);assert.equal(new Set(ids).size,8);
   const palettes=new Set();assert.equal(before.colors.find(color=>color.id==='hair').locked,true);
   for(const id of ids){
    await page.locator(`[data-palette-style="${id}"]`).click();const after=(await state()).study;palettes.add(JSON.stringify(after.colors.map(color=>color.hex)));
    assert.deepEqual(after.light,before.light,`${id} leaves all light controls alone`);assert.equal(after.shadowStyle,before.shadowStyle);assert.equal(after.shading,before.shading);assert.equal(after.selected,before.selected);
    for(let i=0;i<before.colors.length;i++){assert.equal(after.colors[i].id,before.colors[i].id);assert.equal(after.colors[i].name,before.colors[i].name);assert.equal(after.colors[i].locked,before.colors[i].locked);if(before.colors[i].locked)assert.equal(after.colors[i].hex,before.colors[i].hex);}
   }
   assert.equal(palettes.size,8);
  }finally{await restoreStudy(before);if(!wasOpen)await drawer.locator('summary').click();}
 });
 await check('four shadow finishes retain base colors and source position and persist after reload',async()=>{
  const before=(await state()).study,expectedShading={anime:'cel',soft:'smooth',graphic:'cel',luminous:'smooth'},ramps=new Set();
  try{
   for(const id of ['anime','soft','graphic','luminous']){
    await page.locator(`[data-shadow-style="${id}"]`).click();const applied=await state();assert.deepEqual(applied.study.colors,before.colors);assert.equal(applied.study.shadowStyle,id);assert.equal(applied.study.shading,expectedShading[id]);ramps.add(JSON.stringify(applied.ramps));
    for(const field of ['temperature','direction','elevation'])assert.equal(applied.study.light[field],before.light[field],`${id} preserves ${field}`);
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('artlab.study.v2')||'null')?.shadowStyle===id,id);await page.reload();await waitForStudy();
    const restored=(await state()).study;assert.equal(restored.shadowStyle,id);assert.equal(restored.shading,expectedShading[id]);assert.deepEqual(restored.colors,before.colors);assert.deepEqual(restored.light,applied.study.light);
   }
   assert.equal(ramps.size,4,'Each finish produces its own lighting ramp');
  }finally{await restoreStudy(before);}
 });
 await check('visible source drag keyboard and depth control share one light vector and a disabled key leaves no directional shadows',async()=>{
  const before=(await state()).study;
  try{
   await setLight('direction',-35);await setLight('elevation',40);await setLight('strength',1);await page.locator('.art-stage').scrollIntoViewIfNeeded();await settlePreview();
   const handle=page.locator('#key-light'),box=await handle.boundingBox(),canvas=await page.locator('#preview').boundingBox();assert.ok(box&&canvas);
   const start=(await state()).study.light.direction;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();assert.equal((await state()).study.light.direction,start,'Grabbing the guide does not move the light');
   await page.mouse.move(canvas.x+canvas.width-64,canvas.y+canvas.height/2,{steps:8});await page.waitForFunction(()=>window.artlabDiagnostics().previewQuality==='interactive');assert.equal((await state()).previewQuality,'interactive','Dragging uses the lightweight preview');await page.mouse.up();await settlePreview();const dragged=await state();assert.equal(dragged.previewQuality,'final','Releasing the source restores full preview quality');assert.ok(Math.abs(dragged.study.light.direction-90)<=1);assert.ok(dragged.lightVector.x>0);assert.ok(Math.abs(dragged.lightVector.y)<.02);assert.equal(Number(await page.locator('#light-direction').inputValue()),dragged.study.light.direction);
   await handle.press('ArrowLeft');assert.equal((await state()).study.light.direction,dragged.study.light.direction-5);const z=(await state()).lightVector.z;await handle.press('ArrowUp');assert.equal((await state()).study.light.elevation,45);assert.ok((await state()).lightVector.z>z);
   await settlePreview();const marker=await handle.boundingBox();await setLight('elevation',70);const depth=await state(),deeperMarker=await handle.boundingBox();assert.equal(depth.study.light.elevation,70);assert.ok(Math.abs(depth.lightVector.z-Math.sin(70*Math.PI/180))<1e-8);assert.ok(Math.abs(marker.x-deeperMarker.x)<.1&&Math.abs(marker.y-deeperMarker.y)<.1,'Depth does not relocate the angle guide');assert.match(await page.locator('#light-description').textContent(),/front depth 70/);
   for(const subject of ['portrait','spheres'])for(const finish of ['cel','smooth']){
    await page.locator(`[data-preview="${subject}"]`).click();await page.locator(`[data-shading="${finish}"]`).click();await setLight('elevation',35);
    await setLight('strength',1);await setLight('direction',-90);const litLeft=await rawArtHash();await setLight('direction',90);assert.notEqual(await rawArtHash(),litLeft,`${subject}/${finish} shades toward the actual key`);
    await setLight('strength',0);await setLight('direction',-90);const keyOffLeft=await rawArtHash(),keyOffDraws=(await state()).previewDraws;const leftDebug=await page.locator('#preview').evaluate(canvas=>{window.artlabKeyOffPixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);return {png:canvas.toDataURL(),light:window.artlabDiagnostics().study.light};});await setLight('direction',90);const keyOffRight=await rawArtHash();assert.equal((await state()).previewDraws,keyOffDraws,`${subject}/${finish} does no canvas work for a disabled source move`);
    if(keyOffRight!==keyOffLeft){const rightDebug=await page.locator('#preview').evaluate(canvas=>{const a=window.artlabKeyOffPixels,b=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);let count=0,maximum=0,significant=0,left=canvas.width,top=canvas.height,right=-1,bottom=-1;for(let i=0;i<b.data.length;i+=4){const difference=Math.max(...[0,1,2,3].map(channel=>Math.abs(a.data[i+channel]-b.data[i+channel])));maximum=Math.max(maximum,difference);if(difference>0)count++;if(difference>2){significant++;const p=i/4,x=p%canvas.width,y=Math.floor(p/canvas.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return {png:canvas.toDataURL(),light:window.artlabDiagnostics().study.light,diff:{count,maximum,significant,left,right,top,bottom,width:canvas.width,height:canvas.height}};});await writeFile(new URL('key-off-left.png',out),Buffer.from(leftDebug.png.split(',')[1],'base64'));await writeFile(new URL('key-off-right.png',out),Buffer.from(rightDebug.png.split(',')[1],'base64'));console.log(JSON.stringify({subject,finish,leftLight:leftDebug.light,rightLight:rightDebug.light,diff:rightDebug.diff}));}
    assert.equal(keyOffRight,keyOffLeft,`${subject}/${finish} has no unexplained left/right shading at zero key strength`);assert.match(await page.locator('#light-description').textContent(),/Key off/);if(subject==='portrait'){const keyOffCast=await page.evaluate(()=>window.artlabPortraitLightProbe(.48,.25));assert.equal(keyOffCast.occlusion,0,'A disabled source cannot retain a cached cast shadow');}
   }
  }finally{await restoreStudy(before);}
 });
 await check('cel smooth portrait and materials previews all render distinct artwork and values mode is grayscale',async()=>{
  const cel=hash(await art());await page.locator('[data-shading="smooth"]').click();await settlePreview();assert.notEqual(hash(await art()),cel);await page.locator('[data-preview="spheres"]').click();await settlePreview();const spheres=hash(await art());assert.notEqual(spheres,cel);await page.locator('#values').check();await settlePreview();
  const gray=await page.locator('#preview').evaluate(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let colored=0;for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])>1)colored++;return colored;});assert.equal(gray,0);await page.locator('#values').uncheck();await page.locator('[data-preview="portrait"]').click();await page.locator('[data-shading="cel"]').click();
 });
 await check('library saves and reloads complete studies and survives browser reload',async()=>{
  await page.locator('#save-open').click();await page.locator('#save-name').fill('Anime dusk');await page.locator('#save-form button[type=submit]').click();assert.equal((await state()).libraryCount,1);await page.reload();await waitForStudy();assert.equal((await state()).study.name,'Anime dusk');await page.locator('#library-open').click();await page.getByRole('button',{name:'Load',exact:true}).click();assert.equal((await state()).study.name,'Anime dusk');
 });
 let palettePNG;
 await check('palette PNG JSON and illustration exports download valid portable files',async()=>{
  for(const type of ['json','png','preview']){await page.locator('.export-menu summary').click();const promise=page.waitForEvent('download');await page.locator(`[data-export="${type}"]`).click();const d=await promise,p=new URL(type==='png'?'palette.png':type==='json'?'palette.json':'illustration.png',out).pathname.replace(/^\/([A-Z]:)/,'$1');await d.saveAs(p);const bytes=await readFile(p);if(type==='json')assert.equal(JSON.parse(bytes.toString()).format,'artlab');else{assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.ok(bytes.length>1000);}if(type==='png')palettePNG=p;}
 });
 await check('ArtLab PNG restores exact editable colors locks and lighting',async()=>{
  const before=(await state()).study;await page.locator('#hex').fill('#112233');await page.locator('#hex').press('Tab');await page.locator('#palette-file').setInputFiles(palettePNG);await page.waitForTimeout(150);assert.deepEqual((await state()).study,before);
 });
 await check('whitespace-only names remain saveable exportable and usable after autosave',async()=>{
  const before=(await state()).study,count=(await state()).libraryCount;
  await page.locator('#color-name').fill('   ');await page.locator('#color-name').press('Tab');await page.locator('#study-name').fill('   ');await page.locator('#study-name').press('Tab');
  const repaired=(await state()).study;assert.ok(repaired.name.trim().length);assert.ok(repaired.colors.find(c=>c.id===repaired.selected).name.trim().length);
  await page.waitForFunction(()=>{const saved=JSON.parse(localStorage.getItem('artlab.study.v2')||'null');return saved&&saved.name.trim().length&&saved.colors.every(c=>c.name.trim().length);});
  assert.match(await page.locator('#save-status').textContent(),/saved/i);
  await page.locator('.export-menu summary').click();const pending=page.waitForEvent('download');await page.locator('[data-export="json"]').click();const download=await pending,path=new URL('valid-names.json',out).pathname.replace(/^\/([A-Z]:)/,'$1');await download.saveAs(path);const exported=JSON.parse(await readFile(path,'utf8'));assert.ok(exported.study.name.trim().length);assert.ok(exported.study.colors.every(c=>c.name.trim().length));
  await page.locator('#save-open').click();await page.locator('#save-name').fill('Whitespace repaired');await page.locator('#save-form button[type=submit]').click();assert.equal((await state()).libraryCount,count+1);
  await page.locator('#library-open').click();await page.getByRole('button',{name:'Remove Whitespace repaired',exact:true}).click();assert.equal((await state()).libraryCount,count);await page.locator('[data-close="library-dialog"]').click();
  await page.locator('#palette-file').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'artlab',version:2,study:before}))});await page.waitForFunction(name=>window.artlabDiagnostics().study.name===name,before.name);
 });
 await check('a slower earlier palette import cannot overwrite the latest chosen file',async()=>{
  const before=(await state()).study,latest=structuredClone(before);latest.name='Latest file wins';latest.colors[0].hex='#102938';
  await page.evaluate(()=>{const original=File.prototype.arrayBuffer;window.artlabRestoreFileReader=()=>{File.prototype.arrayBuffer=original;delete window.artlabReleaseSlow;};File.prototype.arrayBuffer=function(){if(this.name==='delayed-artlab.png')return new Promise((resolve,reject)=>{window.artlabReleaseSlow=()=>original.call(this).then(resolve,reject);});return original.call(this);};});
  try{
   await page.locator('#palette-file').setInputFiles({name:'delayed-artlab.png',mimeType:'image/png',buffer:await readFile(palettePNG)});await page.waitForFunction(()=>typeof window.artlabReleaseSlow==='function');
   await page.locator('#palette-file').setInputFiles({name:'latest.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'artlab',version:2,study:latest}))});await page.waitForFunction(()=>window.artlabDiagnostics().study.name==='Latest file wins');
   await page.evaluate(()=>window.artlabReleaseSlow());await page.waitForTimeout(150);assert.deepEqual((await state()).study,latest);assert.equal(await page.locator('#extract-dialog').evaluate(dialog=>dialog.open),false);
  }finally{await page.evaluate(()=>window.artlabRestoreFileReader());}
  await page.locator('#palette-file').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'artlab',version:2,study:before}))});await page.waitForFunction(name=>window.artlabDiagnostics().study.name===name,before.name);
 });
 await check('local image extraction keeps locked materials and never requires upload',async()=>{
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=60;const x=c.getContext('2d');x.fillStyle='#e44b4b';x.fillRect(0,0,60,60);x.fillStyle='#497bbd';x.fillRect(60,0,60,60);return c.toDataURL();});
  const before=(await state()).study.colors;await page.locator('#extract-open').click();await page.locator('#image-file').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});await page.locator('#use-extracted').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#use-extracted').disabled);await page.locator('#use-extracted').click();const after=(await state()).study.colors;assert.equal(after[1].hex,before[1].hex);assert.notEqual(after[0].hex,before[0].hex);
 });
 await check('dark light and device themes remain usable and remembered',async()=>{
  await page.locator('#theme').selectOption('light');await page.screenshot({path:new URL('light.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});assert.equal((await state()).theme,'light');await page.reload();await waitForStudy();assert.equal((await state()).theme,'light');await page.locator('#theme').selectOption('system');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal((await state()).theme,'dark');
 });
 await check('tablet portrait and phone drawers respect safe areas and fit without horizontal overflow',async()=>{
  for(const viewport of [{width:1180,height:820},{width:820,height:1180},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(70);if(viewport.width<=1050){await page.locator('#colors-open').click();assert.ok(await page.locator('#hex').isVisible());await page.locator('#colors-panel [data-close-panel]').click();await page.locator('#lighting-open').click();assert.ok(await page.locator('#light-temperature').isVisible());await page.locator('#lighting-panel [data-close-panel]').click();}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:new URL(`layout-${viewport.width}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')});}
 });
 await check('offline service worker caches only ArtLab and supports a disconnected reload',async()=>{
  await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('ready'));
  const portraitURL=portraitResponses.find(response=>response.status===200)?.url;assert.ok(portraitURL);assert.ok(await page.evaluate(async portraitURL=>{for(const key of await caches.keys())if(key.startsWith('artlab:')&&await(await caches.open(key)).match(portraitURL))return true;return false;},portraitURL),'The unlit flat-color portrait asset is included in the offline cache');
  await context.setOffline(true);await page.reload();await waitForStudy();assert.ok((await state()).study.colors.length);assert.equal((await state()).portrait.ready,true);const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(k=>k.startsWith('artlab:')));assert.ok(keys.every(k=>k.startsWith('artlab:')));await context.setOffline(false);
 });
 await check('a missing flat portrait has a clear error while editing and Materials work and blank illustration exports are refused',async()=>{
  // Deliberately bypass the worker so a prior successful offline cache cannot
  // hide a failed illustration request in this isolated failure-path check.
  const failureContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:true});
  try{
   await failureContext.addInitScript(()=>{window.artlabDrawnMessages=[];const fillText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(this.canvas.id==='preview')window.artlabDrawnMessages.push(String(text));return fillText.call(this,text,...args);};});
   const failurePage=await failureContext.newPage(),uncaught=[],downloads=[];let aborted=0;
   failurePage.on('pageerror',error=>uncaught.push(error.message));failurePage.on('download',download=>downloads.push(download));
   await failurePage.route('**/*portrait-flats*.png',route=>{aborted++;return route.abort('failed');});
   await failurePage.goto(url);await failurePage.waitForFunction(()=>window.artlabDiagnostics?.().portrait?.error);await failurePage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const failed=await failurePage.evaluate(()=>({portrait:window.artlabDiagnostics().portrait,messages:window.artlabDrawnMessages,toast:document.querySelector('#toast').textContent}));
   assert.ok(aborted>0,'The actual runtime flat asset request was intercepted');assert.equal(failed.portrait.ready,false);assert.match(failed.portrait.error,/could not be loaded/i);assert.ok(failed.messages.some(text=>/could not be loaded/i.test(text)));assert.ok(failed.messages.some(text=>/Reload ArtLab/i.test(text)));assert.match(failed.toast,/could not be loaded/i);
   await failurePage.locator('#hex').fill('#3579C1');await failurePage.locator('#hex').press('Tab');assert.equal(await failurePage.evaluate(()=>window.artlabDiagnostics().study.colors[0].hex),'#3579C1');
   await failurePage.locator('[data-preview="spheres"]').click();await failurePage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await failurePage.evaluate(()=>window.artlabDiagnostics().study.preview),'spheres');
   const chromatic=await failurePage.locator('#preview').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>24)count++;return count;});assert.ok(chromatic>1000,'The independent Materials renderer still draws colored shapes');
   await failurePage.locator('.export-menu summary').click();const pending=failurePage.waitForEvent('download');await failurePage.locator('[data-export="preview"]').click();const download=await pending,path=new URL('portrait-failure-materials.png',out).pathname.replace(/^\/([A-Z]:)/,'$1');await download.saveAs(path);const bytes=await readFile(path);assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),1800);assert.equal(bytes.readUInt32BE(20),1800);
   await failurePage.locator('[data-preview="portrait"]').click();await failurePage.locator('.export-menu summary').click();const previousDownloads=downloads.length;await failurePage.locator('[data-export="preview"]').click();await failurePage.waitForFunction(()=>!document.querySelector('[data-export="preview"]').disabled&&/could not be loaded/i.test(document.querySelector('#toast').textContent));await failurePage.waitForTimeout(150);assert.equal(downloads.length,previousDownloads,'A missing portrait never downloads blank artwork');assert.deepEqual(uncaught,[]);
   await failurePage.screenshot({path:new URL('portrait-failure.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});
  }finally{await failureContext.close();}
 });
 assert.deepEqual(errors,[]);checks.push('no JavaScript or asset errors');await writeFile(new URL('browser-report.json',out),JSON.stringify({url,checks,errors},null,2));console.log(`PASS ${checks.length} browser checks`);
}finally{await browser.close();}
