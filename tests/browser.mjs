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
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.artlabDiagnostics);await page.waitForTimeout(300);
 const state=()=>page.evaluate(()=>window.artlabDiagnostics());const art=()=>page.locator('#preview').screenshot();
 const settlePreview=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const setLight=async(key,value)=>{await page.locator('#light-'+key).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);await settlePreview();};
 const rawArtHash=()=>page.locator('#preview').evaluate(async canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;const digest=await crypto.subtle.digest('SHA-256',pixels);return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');});
 const restoreStudy=async study=>{await page.locator('#palette-file').setInputFiles({name:'restore-browser-study.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'artlab',version:2,study}))});await page.waitForFunction(expected=>{const actual=window.artlabDiagnostics().study;return Object.entries(expected).every(([key,value])=>key==='light'?Object.entries(value).every(([field,v])=>actual.light[field]===v):key==='colors'?value.length===actual.colors.length&&value.every((color,index)=>Object.entries(color).every(([field,v])=>actual.colors[index][field]===v)):actual[key]===value);},study);await settlePreview();};
 await check('standalone ArtLab starts with five editable materials and five-role ramps',async()=>{const a=await state();assert.equal(a.study.colors.length,5);assert.equal(a.ramps.length,5);assert.ok(a.ramps.every(r=>Object.keys(r).length===5));await page.screenshot({path:new URL('desktop.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});});
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
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('artlab.study.v2')||'null')?.shadowStyle===id,id);await page.reload();await page.waitForFunction(()=>window.artlabDiagnostics);
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
   await page.mouse.move(canvas.x+canvas.width-64,canvas.y+canvas.height/2,{steps:8});await page.mouse.up();await settlePreview();const dragged=await state();assert.ok(Math.abs(dragged.study.light.direction-90)<=1);assert.ok(dragged.lightVector.x>0);assert.ok(Math.abs(dragged.lightVector.y)<.02);assert.equal(Number(await page.locator('#light-direction').inputValue()),dragged.study.light.direction);
   await handle.press('ArrowLeft');assert.equal((await state()).study.light.direction,dragged.study.light.direction-5);const z=(await state()).lightVector.z;await handle.press('ArrowUp');assert.equal((await state()).study.light.elevation,45);assert.ok((await state()).lightVector.z>z);
   await settlePreview();const marker=await handle.boundingBox();await setLight('elevation',70);const depth=await state(),deeperMarker=await handle.boundingBox();assert.equal(depth.study.light.elevation,70);assert.ok(Math.abs(depth.lightVector.z-Math.sin(70*Math.PI/180))<1e-8);assert.ok(Math.abs(marker.x-deeperMarker.x)<.1&&Math.abs(marker.y-deeperMarker.y)<.1,'Depth does not relocate the angle guide');assert.match(await page.locator('#light-description').textContent(),/front depth 70/);
   for(const subject of ['portrait','spheres'])for(const finish of ['cel','smooth']){
    await page.locator(`[data-preview="${subject}"]`).click();await page.locator(`[data-shading="${finish}"]`).click();await setLight('elevation',35);
    await setLight('strength',1);await setLight('direction',-90);const litLeft=await rawArtHash();await setLight('direction',90);assert.notEqual(await rawArtHash(),litLeft,`${subject}/${finish} shades toward the actual key`);
    await setLight('strength',0);await setLight('direction',-90);const keyOffLeft=await rawArtHash();const leftDebug=await page.locator('#preview').evaluate(canvas=>{window.artlabKeyOffPixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);return {png:canvas.toDataURL(),light:window.artlabDiagnostics().study.light};});await setLight('direction',90);const keyOffRight=await rawArtHash();
    if(keyOffRight!==keyOffLeft){const rightDebug=await page.locator('#preview').evaluate(canvas=>{const a=window.artlabKeyOffPixels,b=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);let count=0,maximum=0,significant=0,left=canvas.width,top=canvas.height,right=-1,bottom=-1;for(let i=0;i<b.data.length;i+=4){const difference=Math.max(...[0,1,2,3].map(channel=>Math.abs(a.data[i+channel]-b.data[i+channel])));maximum=Math.max(maximum,difference);if(difference>0)count++;if(difference>2){significant++;const p=i/4,x=p%canvas.width,y=Math.floor(p/canvas.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}return {png:canvas.toDataURL(),light:window.artlabDiagnostics().study.light,diff:{count,maximum,significant,left,right,top,bottom,width:canvas.width,height:canvas.height}};});await writeFile(new URL('key-off-left.png',out),Buffer.from(leftDebug.png.split(',')[1],'base64'));await writeFile(new URL('key-off-right.png',out),Buffer.from(rightDebug.png.split(',')[1],'base64'));console.log(JSON.stringify({subject,finish,leftLight:leftDebug.light,rightLight:rightDebug.light,diff:rightDebug.diff}));}
    assert.equal(keyOffRight,keyOffLeft,`${subject}/${finish} has no unexplained left/right shading at zero key strength`);assert.match(await page.locator('#light-description').textContent(),/Key off/);
   }
  }finally{await restoreStudy(before);}
 });
 await check('cel smooth portrait and materials previews all render distinct artwork and values mode is grayscale',async()=>{
  const cel=hash(await art());await page.locator('[data-shading="smooth"]').click();await page.waitForTimeout(80);assert.notEqual(hash(await art()),cel);await page.locator('[data-preview="spheres"]').click();await page.waitForTimeout(80);const spheres=hash(await art());assert.notEqual(spheres,cel);await page.locator('#values').check();
  const gray=await page.locator('#preview').evaluate(canvas=>{const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let colored=0;for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])>1)colored++;return colored;});assert.equal(gray,0);await page.locator('#values').uncheck();await page.locator('[data-preview="portrait"]').click();await page.locator('[data-shading="cel"]').click();
 });
 await check('library saves and reloads complete studies and survives browser reload',async()=>{
  await page.locator('#save-open').click();await page.locator('#save-name').fill('Anime dusk');await page.locator('#save-form button[type=submit]').click();assert.equal((await state()).libraryCount,1);await page.reload();await page.waitForFunction(()=>window.artlabDiagnostics);assert.equal((await state()).study.name,'Anime dusk');await page.locator('#library-open').click();await page.getByRole('button',{name:'Load',exact:true}).click();assert.equal((await state()).study.name,'Anime dusk');
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
  await page.locator('#theme').selectOption('light');await page.screenshot({path:new URL('light.png',out).pathname.replace(/^\/([A-Z]:)/,'$1')});assert.equal((await state()).theme,'light');await page.reload();await page.waitForFunction(()=>window.artlabDiagnostics);assert.equal((await state()).theme,'light');await page.locator('#theme').selectOption('system');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal((await state()).theme,'dark');
 });
 await check('tablet portrait and phone drawers respect safe areas and fit without horizontal overflow',async()=>{
  for(const viewport of [{width:1180,height:820},{width:820,height:1180},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(70);if(viewport.width<=1050){await page.locator('#colors-open').click();assert.ok(await page.locator('#hex').isVisible());await page.locator('#colors-panel [data-close-panel]').click();await page.locator('#lighting-open').click();assert.ok(await page.locator('#light-temperature').isVisible());await page.locator('#lighting-panel [data-close-panel]').click();}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:new URL(`layout-${viewport.width}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')});}
 });
 await check('offline service worker caches only ArtLab and supports a disconnected reload',async()=>{
  await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('ready'));await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.artlabDiagnostics);assert.ok((await state()).study.colors.length);const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(k=>k.startsWith('artlab:')));assert.ok(keys.every(k=>k.startsWith('artlab:')));await context.setOffline(false);
 });
 assert.deepEqual(errors,[]);checks.push('no JavaScript or asset errors');await writeFile(new URL('browser-report.json',out),JSON.stringify({url,checks,errors},null,2));console.log(`PASS ${checks.length} browser checks`);
}finally{await browser.close();}
