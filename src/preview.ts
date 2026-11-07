import type { Ramp, Study } from './types';
import { getLightVector, shadeValue, sampleRamp } from './lighting';

type RGB = [number,number,number];
type Vec3 = {x:number;y:number;z:number};
type Box = {x:number;y:number;w:number;h:number};
type Field = 'round'|'face'|'hair'|'neck'|'cloth'|'flat';
type Surface = {width:number;height:number;normals:Float32Array};
const TAU=Math.PI*2;
const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
const parse=(hex:string):RGB=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const linear=(value:number)=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const encoded=(value:number)=>Math.round(clamp(value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055)*255);
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>encoded(linear(v)*(1-t)+linear(b[i])*t)) as RGB;
const gray=(c:RGB):RGB=>{const y=encoded(.2126*linear(c[0])+.7152*linear(c[1])+.0722*linear(c[2]));return [y,y,y];};
const css=(c:RGB)=>`rgb(${c.map(v=>Math.round(v)).join(',')})`;
const normalized=(x:number,y:number,z:number):Vec3=>{const length=Math.hypot(x,y,z)||1;return {x:x/length,y:y/length,z:z/length};};
const fallback:Ramp={base:'#C5B8A5',highlight:'#F2DAB1',halftone:'#D8B994',shadow:'#665B70',reflected:'#847C91'};
const normalCache=new Map<string,Surface>();
const imageCache=new Map<string,HTMLCanvasElement>();

// Analytic normal fields give the drawing rounded volumes. Every material uses
// the same key vector: no object receives an unrelated diagonal shadow stripe.
function normalAt(u:number,v:number,field:Field,tilt?:Vec3):Vec3 {
  if(field==='flat')return tilt?normalized(tilt.x,tilt.y,tilt.z):{x:0,y:0,z:1};
  const x=(u-.5)*2,y=(v-.5)*2;
  let nx=x*.86,ny=y*.74,nz=Math.sqrt(Math.max(.025,1-x*x*.82-y*y*.62));
  if(field==='face'){
    nx=x*.82;ny=y*.58;nz=Math.sqrt(Math.max(.07,1-x*x*.72-y*y*.44));
    const bridge=Math.exp(-(((x-.035)/.13)**2)-(((y-.15)/.40)**2));
    nx+=bridge*(x-.035)*3.5;ny+=bridge*(y-.15)*.9;
    const cheeks=Math.exp(-(((Math.abs(x)-.47)/.30)**2)-(((y-.34)/.28)**2));nz+=cheeks*.13;
  }else if(field==='hair'){
    nx=x*.9;ny=y*.62-.09;nz=Math.sqrt(Math.max(.035,1-x*x*.80-y*y*.49));
  }else if(field==='neck'){
    nx=x*.82;ny=.04;nz=Math.sqrt(Math.max(.12,1-x*x*.68));
  }else if(field==='cloth'){
    nx=x*.76;ny=-.18+y*.22;nz=Math.sqrt(Math.max(.15,1-x*x*.58));
    nx+=Math.sin((x+.2)*8)*Math.max(0,v-.35)*.075;
  }
  if(tilt){nx+=tilt.x;ny+=tilt.y;nz+=tilt.z;}
  return normalized(nx,ny,nz);
}

function normalSurface(box:Box,field:Field,resolution:number,tilt?:Vec3):Surface {
  const factor=Math.min(1.8,resolution,600/Math.max(box.w,box.h));
  const width=Math.max(12,Math.round(box.w*factor)),height=Math.max(12,Math.round(box.h*factor));
  const key=JSON.stringify([width,height,field,tilt]),known=normalCache.get(key);if(known)return known;
  const normals=new Float32Array(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=normalAt((x+.5)/width,(y+.5)/height,field,tilt),offset=(y*width+x)*3;
    normals[offset]=n.x;normals[offset+1]=n.y;normals[offset+2]=n.z;
  }
  const surface={width,height,normals};normalCache.set(key,surface);
  if(normalCache.size>26)normalCache.delete(normalCache.keys().next().value!);
  return surface;
}

/** Local anime material study. The drawn forms share the source vector/depth
 * used by the visible handle and sphere study, with local hair/nose/chin casts.
 */
export function renderPreview(canvas:HTMLCanvasElement,study:Study,ramps:Ramp[],options?:{width?:number;height?:number;export?:boolean}):void {
  const width=clamp(options?.width??(canvas.clientWidth||680),1,4096),height=clamp(options?.height??(canvas.clientHeight||640),1,4096);
  const dpr=options?.export?1:Math.min(window.devicePixelRatio||1,2);
  const targetWidth=Math.max(1,Math.round(width*dpr)),targetHeight=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==targetWidth)canvas.width=targetWidth;if(canvas.height!==targetHeight)canvas.height=targetHeight;
  const context=canvas.getContext('2d');if(!context)return;
  const ctx:CanvasRenderingContext2D=context;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const key=getLightVector(study.light),strength=clamp(study.light.strength),bounce=clamp(study.light.bounce);
  const lightTheme=study.theme==='light'||study.theme==='system'&&matchMedia('(prefers-color-scheme:light)').matches;
  const painted=study.shading==='smooth';
  const rgb=(value:RGB)=>study.values?gray(value):value;
  const color=(hex:string)=>css(rgb(parse(hex)));
  const fixed=(hex:string,alpha=1)=>{const value=rgb(parse(hex));return `rgba(${value.join(',')},${alpha})`;};
  const ramp=(index:number)=>ramps[index]||ramps[0]||fallback;
  const ink=fixed(lightTheme?'#30333A':'#1D202B'),lineOpacity=painted?.64:1;
  const shade=(r:Ramp,n:Vec3)=>sampleRamp(r,shadeValue(n,study.light),study.shading,study.shadowStyle);
  const inkFrom=(r:Ramp)=>css(rgb(mix(parse(r.shadow),[23,28,39],.5)));

  ctx.fillStyle=fixed(lightTheme?'#F1F0EA':'#232A2D');ctx.fillRect(0,0,width,height);
  const bg=ctx.createRadialGradient(width*.52,height*.38,0,width*.5,height*.5,Math.max(width,height)*.8);
  bg.addColorStop(0,color(ramp(4).halftone));bg.addColorStop(1,color(ramp(4).shadow));
  ctx.globalAlpha=lightTheme?.12:.23;ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.globalAlpha=1;

  // Color lookup is evaluated only 256 times per material; the pixel loop then
  // performs a dot product, retaining responsive iPad interaction.
  const tables=new Map<Ramp,RGB[]>();
  function lookup(r:Ramp):RGB[]{
    const known=tables.get(r);if(known)return known;
    const perpendicular=normalized(key.y,-key.x,0);
    const table=Array.from({length:256},(_,i)=>{
      const dot=i/255,side=Math.sqrt(Math.max(0,1-dot*dot));
      const n={x:key.x*dot+perpendicular.x*side,y:key.y*dot+perpendicular.y*side,z:key.z*dot};
      return rgb(parse(shade(r,n)));
    });tables.set(r,table);return table;
  }
  function raster(r:Ramp,box:Box,field:Field,resolution:number,tilt?:Vec3):HTMLCanvasElement {
    const normals=normalSurface(box,field,resolution,tilt);
    const cacheKey=JSON.stringify([normals.width,normals.height,field,tilt,r,study.light,study.shading,study.shadowStyle,study.values]),known=imageCache.get(cacheKey);if(known)return known;
    const image=document.createElement('canvas');image.width=normals.width;image.height=normals.height;
    const c=image.getContext('2d')!,pixels=c.createImageData(image.width,image.height),table=lookup(r),reflected=rgb(parse(r.reflected));
    for(let i=0;i<image.width*image.height;i++){
      const p=i*3,nx=normals.normals[p],ny=normals.normals[p+1],nz=normals.normals[p+2],diffuse=Math.max(0,nx*key.x+ny*key.y+nz*key.z);
      let value=table[Math.round(clamp(diffuse)*255)];
      if(strength>0&&bounce>0&&diffuse<.30&&nz<.63){const amount=bounce*strength*(1-diffuse/.30)*clamp((.63-nz)/.6)*.63;value=mix(value,reflected,amount);}
      const offset=i*4;pixels.data[offset]=value[0];pixels.data[offset+1]=value[1];pixels.data[offset+2]=value[2];pixels.data[offset+3]=255;
    }
    c.putImageData(pixels,0,0);imageCache.set(cacheKey,image);if(imageCache.size>30)imageCache.delete(imageCache.keys().next().value!);return image;
  }
  const path=(d:string)=>new Path2D(d);
  const line=(d:string,stroke:string,lineWidth=1.8,alpha=1)=>{ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(path(d));ctx.restore();};
  const flat=(d:string,fill:string,stroke?:string,lineWidth=1.8)=>{const p=path(d);ctx.fillStyle=fill;ctx.fill(p);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.stroke(p);}};

  if(study.preview==='spheres'){
    const count=Math.max(1,Math.min(8,study.colors.length)),columns=count<=3?count:count<=6?3:4,rows=Math.ceil(count/columns);
    const availableWidth=Math.min(width-40,940),cellWidth=availableWidth/columns,cellHeight=Math.min((height-70)/rows,290),radius=Math.max(14,Math.min(cellWidth*.36,cellHeight*.33,118));
    const top=(height-cellHeight*rows)/2;
    for(let i=0;i<count;i++){
      const row=Math.floor(i/columns),remaining=Math.min(columns,count-row*columns),offset=(width-cellWidth*remaining)/2;
      const x=offset+cellWidth*(i%columns+.5),y=top+cellHeight*(row+.43),r=ramp(i);
      ctx.globalAlpha=.12+.12*strength;ctx.fillStyle=fixed('#101920');ctx.beginPath();ctx.ellipse(x-key.x*strength*radius*.48,y+radius*1.16-key.y*strength*radius*.12,radius*.82,radius*.13,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
      const size=Math.min(380,Math.max(100,Math.round(radius*2*dpr))),cacheKey=JSON.stringify(['sphere',size,r,study.light,study.shading,study.shadowStyle,study.values]);
      let image=imageCache.get(cacheKey);
      if(!image){
        image=document.createElement('canvas');image.width=image.height=size;
        const c=image.getContext('2d')!,pixels=c.createImageData(size,size),table=lookup(r),reflected=rgb(parse(r.reflected));
        for(let py=0;py<size;py++)for(let px=0;px<size;px++){
          const nx=((px+.5)/size-.5)*2,ny=((py+.5)/size-.5)*2,radial=nx*nx+ny*ny;if(radial>1)continue;
          const nz=Math.sqrt(1-radial),diffuse=Math.max(0,nx*key.x+ny*key.y+nz*key.z);
          let value=table[Math.round(clamp(diffuse)*255)];
          if(diffuse<.3&&nz<.5&&bounce>0&&strength>0)value=mix(value,reflected,bounce*strength*(1-diffuse/.3)*(1-nz/.5)*.6);
          const p=(py*size+px)*4;pixels.data[p]=value[0];pixels.data[p+1]=value[1];pixels.data[p+2]=value[2];pixels.data[p+3]=Math.round(clamp((1-Math.sqrt(radial))*size*.65)*255);
        }
        c.putImageData(pixels,0,0);imageCache.set(cacheKey,image);if(imageCache.size>30)imageCache.delete(imageCache.keys().next().value!);
      }
      ctx.drawImage(image,x-radius,y-radius,radius*2,radius*2);
      const active=study.colors[i]?.id===study.selected;
      ctx.strokeStyle=fixed(active?(lightTheme?'#8B6936':'#D9BF8B'):(lightTheme?'#5D6C61':'#AEBEAE'),active?.9:.18);
      ctx.lineWidth=active?2:1;ctx.beginPath();ctx.arc(x,y,radius+5,0,TAU);ctx.stroke();
      ctx.fillStyle=color(r.base);ctx.beginPath();ctx.roundRect(x-radius*.29,y+radius*1.49,radius*.58,8,4);ctx.fill();
    }
    return;
  }

  // Original anime bust: larger almond eyes, delicate facial marks, layered
  // bangs and long separated locks, readable in cel and softly painted views.
  const artHeight=height-(options?.export?0:28),scale=Math.max(.06,Math.min((width-24)/560,(artHeight-14)/680));
  const resolution=Math.max(.55,Math.min(1.8,scale*dpr));
  ctx.save();ctx.translate(width/2,artHeight/2+8);ctx.scale(scale,scale);ctx.translate(-340,-388);
  const skin=ramp(0),hair=ramp(1),cloth=ramp(2),accent=ramp(3),backdrop=ramp(4);
  const feature=inkFrom(skin),hairInk=inkFrom(hair),clothInk=inkFrom(cloth);
  const faceBox:Box={x:251,y:150,w:183,h:249};
  const face='M253 219 C253 177 293 150 340 150 C389 149 428 176 432 218 L428 294 C424 327 405 354 379 375 L350 396 Q341 402 331 395 L301 374 C276 354 258 328 254 296Z';
  const hairBack='M216 266 C184 226 189 157 221 115 C244 77 287 60 337 65 C393 55 440 83 464 128 C486 173 484 232 463 279 C453 330 469 403 469 468 Q474 538 495 592 L453 578 L440 620 Q407 607 386 577 L284 580 Q260 613 225 619 L224 578 L185 598 Q211 536 209 463 C212 400 224 325 216 266Z';
  const frontBangs='M211 248 C190 197 201 141 232 107 C263 72 300 63 339 68 C382 54 429 84 450 116 Q478 157 470 219 L448 252 Q437 209 413 189 Q405 222 379 249 Q389 216 388 185 Q367 232 331 254 Q342 218 345 188 Q314 227 281 247 Q292 218 302 192 Q272 219 247 271 L231 292 Q215 278 211 248Z';
  const leftLock='M228 228 Q247 224 266 252 C248 312 250 368 263 418 Q275 462 260 505 L247 475 L231 518 Q210 465 211 406 Q204 340 214 277Z';
  const rightLock='M434 223 Q459 226 470 252 C466 305 454 340 449 380 Q440 439 454 485 L434 466 L420 506 Q402 462 413 412 Q423 354 416 300Z';
  const neck='M306 366 Q339 388 375 363 L380 426 Q391 439 411 444 L339 488 L274 446 Q302 436 306 413Z';
  const body='M275 423 Q303 447 339 449 Q376 447 405 421 L455 443 Q505 464 524 519 L556 688 Q471 714 341 713 Q213 715 125 689 L157 521 Q174 473 222 449Z';

  function form(d:string,r:Ramp,box:Box,field:Field='round',tilt?:Vec3,outline=true){
    const shape=path(d);ctx.save();ctx.clip(shape);const image=raster(r,box,field,resolution,tilt);ctx.drawImage(image,box.x,box.y,box.w,box.h);ctx.restore();
    if(outline){ctx.save();ctx.globalAlpha=lineOpacity;ctx.strokeStyle=inkFrom(r);ctx.lineWidth=painted?1.35:2.1;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(shape);ctx.restore();}
  }
  const offset=(height:number)=>({x:-key.x/(key.z+.4)*height,y:-key.y/(key.z+.4)*height});
  function cast(occluder:string,receiver:string,r:Ramp,height:number,opacity=.85){
    if(strength<.001)return;const delta=offset(height);
    ctx.save();ctx.clip(path(receiver));ctx.globalAlpha=strength*opacity;
    if(painted)ctx.filter=`blur(${Math.max(.6,scale*2.8)}px)`;
    ctx.translate(delta.x,delta.y);ctx.fillStyle=color(r.shadow);ctx.fill(path(occluder));ctx.restore();
  }

  ctx.fillStyle=color(backdrop.base);ctx.globalAlpha=lightTheme?.15:.32;ctx.beginPath();ctx.ellipse(340,358,252,286,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
  ctx.strokeStyle=fixed(lightTheme?'#6D7F71':'#DBDCC9',.16);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(340,358,264,298,0,0,TAU);ctx.stroke();
  line('M112 376H144 M128 360V392 M530 172H562 M546 156V188',fixed(lightTheme?'#516954':'#C8D4BC',.22),1);
  ctx.fillStyle=fixed('#0A111B',.10+.08*strength);ctx.beginPath();ctx.ellipse(340-key.x*strength*36,700-key.y*strength*5,198,13,0,0,TAU);ctx.fill();
  form(hairBack,hair,{x:185,y:60,w:311,h:562},'hair',{x:0,y:0,z:-.08});
  line('M232 291 Q221 421 226 519 Q230 560 242 580 M265 351 Q250 469 273 566 M445 301 Q460 416 443 540 M412 355 Q422 459 403 569',hairInk,painted?1:1.7,painted?.34:.55);
  form(neck,skin,{x:274,y:364,w:138,h:126},'neck');cast(face,neck,skin,15,.92);
  form(body,cloth,{x:125,y:422,w:431,h:293},'cloth');
  cast(leftLock,body,cloth,16,.65);cast(rightLock,body,cloth,16,.65);
  form('M164 518 Q183 485 217 473 L234 537 Q209 606 216 707 Q163 700 125 689Z',cloth,{x:125,y:473,w:110,h:235},'cloth',{x:-.34,y:.05,z:-.10},false);
  form('M460 473 Q504 486 524 519 L556 688 Q517 702 469 707 Q477 618 452 547Z',cloth,{x:451,y:473,w:105,h:235},'cloth',{x:.34,y:.04,z:-.10},false);
  line('M218 480 Q238 533 225 588 M455 480 Q439 532 452 588 M154 627 Q183 636 211 632 M471 635 Q502 639 531 627',clothInk,painted?1.2:2,painted?.28:.5);
  const leftCollar='M276 423 L339 449 L314 495 L254 449Z',rightCollar='M405 421 L339 449 L365 496 L426 447Z';
  cast(leftCollar,body,cloth,10,.72);cast(rightCollar,body,cloth,10,.72);
  form(leftCollar,cloth,{x:253,y:421,w:88,h:76},'flat',{x:-.18,y:-.47,z:.88});
  form(rightCollar,cloth,{x:338,y:419,w:90,h:79},'flat',{x:.25,y:-.45,z:.86});
  line('M264 446 L313 484 M415 444 L365 485',color(accent.halftone),1.7,.72);
  form('M333 480 Q308 466 285 478 L294 515 Q318 510 340 495Z',accent,{x:284,y:471,w:59,h:46},'round',{x:-.25,y:0,z:.25});
  form('M343 480 Q371 464 391 477 L382 516 Q360 509 338 496Z',accent,{x:338,y:470,w:55,h:48},'round',{x:.25,y:0,z:.25});
  form('M329 478 Q340 471 350 479 L352 497 Q340 503 329 495Z',accent,{x:328,y:474,w:26,h:29},'round');
  form('M334 499 L327 552 L343 541 L352 553 L347 500Z',accent,{x:327,y:497,w:26,h:58},'cloth');
  line('M304 483 L332 490 M376 482 L349 489',inkFrom(accent),1.5,.45);
  form('M254 266 Q233 249 232 276 Q233 303 257 309 L265 285Z',skin,{x:232,y:260,w:35,h:51},'round',{x:-.4,y:0,z:0});
  form('M424 259 Q445 245 449 270 Q449 294 426 303 L417 279Z',skin,{x:416,y:253,w:35,h:51},'round',{x:.4,y:0,z:0});
  form(face,skin,faceBox,'face');
  cast(frontBangs,face,skin,14,.88);cast(leftLock,face,skin,8,.60);cast(rightLock,face,skin,8,.60);
  if(strength>.001){
    const nose=offset(13),length=Math.hypot(nose.x,nose.y),nx=length>0?nose.x/length:0,ny=length>0?nose.y/length:1;
    ctx.save();ctx.clip(path(face));ctx.globalAlpha=strength*(painted?.5:.72);if(painted)ctx.filter=`blur(${Math.max(.5,scale*1.7)}px)`;
    flat(`M342 296 Q344 308 349 313 Q${349+nose.x*.75} ${316+nose.y*.65} ${346+nose.x} ${311+nose.y} L${345+nose.x-nx*2-ny*4} ${306+nose.y-ny*2+nx*4}Z`,color(skin.shadow));ctx.restore();
  }
  const skinL=.2126*linear(parse(skin.base)[0])+.7152*linear(parse(skin.base)[1])+.0722*linear(parse(skin.base)[2]);
  const facialInk=skinL<.06?css(rgb(mix(parse(skin.halftone),[217,202,196],.22))):feature;
  if(painted){for(const [x,y] of [[288,313],[396,307]]){
    const glow=ctx.createRadialGradient(x,y,1,x,y,27);glow.addColorStop(0,css(rgb(mix(parse(skin.base),parse(accent.base),.14))));glow.addColorStop(1,`rgba(${rgb(parse(skin.base)).join(',')},0)`);
    ctx.save();ctx.clip(path(face));ctx.globalAlpha=.17;ctx.fillStyle=glow;ctx.fillRect(x-28,y-28,56,56);ctx.restore();
  }}
  const eyes=[{x:298,y:278,left:true,d:'M272 279 Q290 261 321 275 Q309 295 281 286Z'}, {x:389,y:275,left:false,d:'M365 273 Q387 256 412 271 Q399 291 371 283Z'}];
  for(const eye of eyes){
    const n=normalAt((eye.x-faceBox.x)/faceBox.w,(eye.y-faceBox.y)/faceBox.h,'face'),amount=shadeValue(n,study.light);
    const white=mix([250,247,238],parse(skin.shadow),clamp((.6-amount)*strength*.85));flat(eye.d,css(rgb(white)));
    ctx.save();ctx.clip(path(eye.d));
    const iris=ctx.createLinearGradient(eye.x,eye.y-13,eye.x,eye.y+14);iris.addColorStop(0,color(accent.shadow));iris.addColorStop(.55,color(shade(accent,n)));iris.addColorStop(1,color(accent.highlight));
    ctx.fillStyle=iris;ctx.beginPath();ctx.ellipse(eye.x,eye.y,9.3,13.2,0,0,TAU);ctx.fill();ctx.strokeStyle=color(accent.shadow);ctx.lineWidth=1.1;ctx.stroke();
    ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(eye.x+.4,eye.y-1,3.4,9,0,0,TAU);ctx.fill();
    if(strength>.01){ctx.fillStyle=fixed('#FFFDF2',.35+.65*strength);ctx.beginPath();ctx.ellipse(eye.x+key.x*4,eye.y+key.y*5,3,3.8,-.4,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(eye.x-key.x*4,eye.y-key.y*3,1.3,0,TAU);ctx.fill();}ctx.restore();
    line(eye.left?'M271 278 Q290 260 321 275':'M365 273 Q387 255 413 270',hairInk,painted?2.7:3.7);
    line(eye.left?'M273 278 L268 271 M277 274 L274 268':'M409 268 L414 262 M412 270 L418 265',hairInk,painted?1.7:2.4,.92);
    line(eye.left?'M281 288 Q299 296 314 284':'M372 285 Q391 292 406 278',facialInk,1.1,.65);
    line(eye.left?'M278 253 Q298 244 318 252':'M369 250 Q389 241 409 247',hairInk,painted?1.9:2.4,.88);
    line(eye.left?'M278 266 Q299 252 319 265':'M370 263 Q390 250 409 259',color(skin.shadow),1.1,.25+.35*strength);
  }
  line('M342 294 L339 309 Q343 314 348 311',facialInk,painted?1.1:1.5,.67);
  line('M328 349 Q340 354 354 347',facialInk,painted?1.2:1.7,.78);
  line('M337 359 Q345 360 350 356',color(skin.reflected),1.2,.65);
  form(frontBangs,hair,{x:199,y:62,w:274,h:233},'hair');
  form(leftLock,hair,{x:208,y:225,w:66,h:295},'hair',{x:-.16,y:0,z:.2});
  form(rightLock,hair,{x:410,y:222,w:62,h:287},'hair',{x:.18,y:0,z:.2});
  line('M332 76 Q296 98 279 137 Q262 168 247 200 M345 76 Q367 91 385 120 Q405 146 415 174 M292 107 Q278 139 266 161 M373 108 Q383 136 385 158',hairInk,painted?1:1.65,painted?.31:.55);
  line('M225 267 Q219 356 232 430 Q238 467 241 482 M447 261 Q452 324 436 386 Q426 428 431 459',hairInk,painted?1:1.7,painted?.35:.6);
  const leftGlow=clamp(-key.x*.8-key.y*.35+.1)*strength,rightGlow=clamp(key.x*.8-key.y*.35+.1)*strength;
  line('M238 151 Q262 113 302 105 M251 166 Q269 143 290 131',color(hair.highlight),painted?5:4,leftGlow*(painted?.22:.5));
  line('M390 101 Q427 124 440 160 M400 127 Q421 148 425 167',color(hair.highlight),painted?5:4,rightGlow*(painted?.22:.5));
  line('M226 305 Q224 358 238 403',color(hair.reflected),painted?4:2.6,bounce*strength*clamp(key.x+.35)*.7);
  line('M451 298 Q449 348 433 395',color(hair.reflected),painted?4:2.6,bounce*strength*clamp(-key.x+.35)*.7);
  const accessory=shade(accent,normalized(-.45,-.15,.88));line('M240 197 L260 179 M245 208 L267 187',color(accessory),3.4,.95);
  ctx.strokeStyle=color(shade(accent,normalized(.72,0,.7)));ctx.lineWidth=2.7;ctx.beginPath();ctx.ellipse(443,305,5.2,8,0,0,TAU);ctx.stroke();
  ctx.fillStyle=color(accent.base);ctx.beginPath();ctx.arc(442,316,2.8,0,TAU);ctx.fill();ctx.restore();
}
