import type { Ramp, Study } from './types';

type Box = { x:number; y:number; w:number; h:number };
type RGB = [number,number,number];
const TAU=Math.PI*2;
const clamp=(n:number,a=0,b=1)=>Math.min(b,Math.max(a,n));
const parse=(hex:string):RGB=>{
  const value=/^#[\da-f]{6}$/i.test(hex)?hex:'#B8AA98';
  return [parseInt(value.slice(1,3),16),parseInt(value.slice(3,5),16),parseInt(value.slice(5,7),16)];
};
const linear=(n:number)=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
const encoded=(n:number)=>Math.round(clamp(n<=.0031308?12.92*n:1.055*n**(1/2.4)-.055)*255);
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>encoded(linear(v)*(1-t)+linear(b[i])*t)) as RGB;
const rgb=(c:RGB)=>`rgb(${c.map(n=>Math.round(clamp(n,0,255))).join(',')})`;
const gray=(c:RGB):RGB=>{const y=encoded(.2126*linear(c[0])+.7152*linear(c[1])+.0722*linear(c[2]));return [y,y,y];};
const fallback:Ramp={base:'#C5B8A5',highlight:'#F2DAB1',halftone:'#D8B994',shadow:'#665B70',reflected:'#847C91'};
const sphereCache=new Map<string,HTMLCanvasElement>();

/** Direction 0 lights from above; -90 from the left; +90 from the right. */
export function renderPreview(canvas:HTMLCanvasElement,study:Study,ramps:Ramp[],options?:{width?:number;height?:number;export?:boolean}):void {
  const width=clamp(options?.width??(canvas.clientWidth||680),1,4096);
  const height=clamp(options?.height??(canvas.clientHeight||640),1,4096);
  const dpr=options?.export?1:Math.min(window.devicePixelRatio||1,2);
  const targetWidth=Math.max(1,Math.round(width*dpr)),targetHeight=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==targetWidth)canvas.width=targetWidth;
  if(canvas.height!==targetHeight)canvas.height=targetHeight;
  const context=canvas.getContext('2d');if(!context)return;
  const ctx:CanvasRenderingContext2D=context;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const lightTheme=study.theme==='light'||(study.theme==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);
  const color=(hex:string)=>rgb(study.values?gray(parse(hex)):parse(hex));
  const fixed=(hex:string)=>{
    if(!study.values)return hex;
    const c=gray(parse(hex.slice(0,7))),alpha=hex.length===9?parseInt(hex.slice(7),16)/255:1;
    return `rgba(${c.join(',')},${alpha})`;
  };
  const ramp=(index:number)=>ramps[index]||ramps[0]||fallback;
  const angle=(study.light.direction-90)*Math.PI/180,lx=Math.cos(angle),ly=Math.sin(angle);
  const ink=fixed(lightTheme?'#293237':'#1B2027');
  ctx.fillStyle=fixed(lightTheme?'#F1F0E9':'#252B2D');ctx.fillRect(0,0,width,height);
  const background=ctx.createRadialGradient(width*.5,height*.35,0,width*.5,height*.5,Math.max(width,height)*.7);
  background.addColorStop(0,color(ramp(4).halftone));background.addColorStop(1,color(ramp(4).shadow));
  ctx.globalAlpha=lightTheme?.12:.25;ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.globalAlpha=1;

  const path=(d:string)=>new Path2D(d);
  function form(d:string,r:Ramp,b:Box,outline=true) {
    const shape=path(d),cx=b.x+b.w/2,cy=b.y+b.h/2,span=Math.hypot(b.w,b.h);
    ctx.save();ctx.clip(shape);
    if(study.shading==='smooth'){
      const g=ctx.createLinearGradient(cx+lx*span*.52,cy+ly*span*.52,cx-lx*span*.48,cy-ly*span*.48);
      g.addColorStop(0,color(r.highlight));g.addColorStop(.30,color(r.halftone));g.addColorStop(.58,color(r.base));g.addColorStop(1,color(r.shadow));
      ctx.fillStyle=g;ctx.fillRect(b.x-10,b.y-10,b.w+20,b.h+20);
    }else{
      ctx.fillStyle=color(r.halftone);ctx.fill(shape);
      ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);
      ctx.fillStyle=color(r.base);ctx.fillRect(-span,-span,span*1.13,span*2);
      ctx.fillStyle=color(r.shadow);ctx.beginPath();ctx.moveTo(-span,-span);ctx.lineTo(span*.03,-span);ctx.bezierCurveTo(-span*.08,-span*.35,span*.08,span*.18,-span*.18,span);ctx.lineTo(-span,span);ctx.closePath();ctx.fill();
      ctx.fillStyle=color(r.highlight);ctx.beginPath();ctx.moveTo(span*.38,-span);ctx.bezierCurveTo(span*.26,-span*.1,span*.45,span*.2,span*.38,span);ctx.lineTo(span,span);ctx.lineTo(span,-span);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    // Reflected light is a restrained rim on the side opposite the key.
    if(study.light.bounce>.01){
      ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);ctx.beginPath();ctx.rect(-span,-span,span*.82,span*2);ctx.clip();ctx.rotate(-angle);ctx.translate(-cx,-cy);
      ctx.strokeStyle=color(r.reflected);ctx.lineWidth=2+study.light.bounce*12;ctx.stroke(shape);ctx.restore();
    }
    ctx.restore();
    if(outline){ctx.strokeStyle=ink;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(shape);}
  }
  function line(d:string,stroke:string,lineWidth=2,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(path(d));ctx.restore();}
  function flat(d:string,fill:string,stroke?:string,lineWidth=1.8){const p=path(d);ctx.fillStyle=fill;ctx.fill(p);if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.stroke(p);}}

  if(study.preview==='spheres'){
    const count=Math.max(1,Math.min(8,study.colors.length)),columns=count<=3?count:count<=6?3:4,rows=Math.ceil(count/columns);
    const contentWidth=Math.min(width-48,920),cellWidth=contentWidth/columns,cellHeight=Math.min((height-64)/rows,280);
    const radius=Math.max(16,Math.min(cellWidth*.35,cellHeight*.34,110));
    const top=(height-cellHeight*rows)/2;
    for(let i=0;i<count;i++){
      const row=Math.floor(i/columns),remaining=Math.min(columns,count-row*columns),offset=(width-cellWidth*remaining)/2;
      const x=offset+cellWidth*(i%columns+.5),y=top+cellHeight*(row+.43);
      ctx.fillStyle=fixed(lightTheme?'#29323716':'#070B1070');ctx.beginPath();ctx.ellipse(x-lx*radius*.23,y+radius*1.16,radius*.8,radius*.13,0,0,TAU);ctx.fill();
      const size=Math.min(360,Math.max(96,Math.round(radius*2*dpr))),r=ramp(i);
      const key=JSON.stringify([size,r,study.shading,study.values,study.light.direction,study.light.bounce]);
      let image=sphereCache.get(key);
      if(!image){
        image=document.createElement('canvas');image.width=image.height=size;
        const sphere=image.getContext('2d')!,pixels=sphere.createImageData(size,size);
        const stops=[parse(r.shadow),parse(r.base),parse(r.halftone),parse(r.highlight)];
        const lookup:RGB[]=Array.from({length:256},(_,index)=>{
          const t=index/255,segment=t<.35?0:t<.7?1:2,start=segment===0?0:segment===1?.35:.7,end=segment===0?.35:segment===1?.7:1;
          const c=mix(stops[segment],stops[segment+1],(t-start)/(end-start));return study.values?gray(c):c;
        });
        const reflected=study.values?gray(parse(r.reflected)):parse(r.reflected),cel=stops.map(c=>study.values?gray(c):c);
        for(let py=0;py<size;py++)for(let px=0;px<size;px++){
          const nx=((px+.5)/size-.5)*2,ny=((py+.5)/size-.5)*2,radial=nx*nx+ny*ny;if(radial>1)continue;
          const nz=Math.sqrt(1-radial),diffuse=nx*lx*.67+ny*ly*.67+nz*.7424,t=clamp((diffuse+.15)/1.15);
          let c=study.shading==='cel'?cel[t<.25?0:t<.5?1:t<.83?2:3]:lookup[Math.round(t*255)];
          if(diffuse<.15&&nz<.4&&study.light.bounce>.01)c=mix(c,reflected,study.light.bounce*(1-nz/.4)*.7);
          const o=(py*size+px)*4;pixels.data[o]=c[0];pixels.data[o+1]=c[1];pixels.data[o+2]=c[2];pixels.data[o+3]=Math.round(clamp((1-Math.sqrt(radial))*size*.5)*255);
        }
        sphere.putImageData(pixels,0,0);sphereCache.set(key,image);if(sphereCache.size>12)sphereCache.delete(sphereCache.keys().next().value!);
      }
      ctx.drawImage(image,x-radius,y-radius,radius*2,radius*2);
      ctx.strokeStyle=fixed(study.colors[i]?.id===study.selected?(lightTheme?'#8B6936':'#D9BF8B'):(lightTheme?'#57665A44':'#C5CBB222'));
      ctx.lineWidth=study.colors[i]?.id===study.selected?2:1;ctx.beginPath();ctx.arc(x,y,radius+5,0,TAU);ctx.stroke();
      ctx.fillStyle=color(r.base);ctx.beginPath();ctx.roundRect(x-radius*.28,y+radius*1.52,radius*.56,8,4);ctx.fill();
    }
    return;
  }

  // A drawn material study, not a 3D or physically calibrated skin renderer.
  // Palette order intentionally maps to skin, hair, cloth, accent, backdrop.
  const scale=Math.max(.08,Math.min((width-30)/620,(height-22)/620));
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.translate(-340,-330);
  const skin=ramp(0),hair=ramp(1),cloth=ramp(2),accent=ramp(3),backdrop=ramp(4);
  const skinRGB=parse(skin.base),skinValue=.2126*linear(skinRGB[0])+.7152*linear(skinRGB[1])+.0722*linear(skinRGB[2]);
  const featureRGB=skinValue<.08?mix(parse(skin.shadow),[205,198,191],.2):mix(parse(skin.shadow),[25,23,30],.55);
  const feature=rgb(study.values?gray(featureRGB):featureRGB);
  ctx.fillStyle=color(backdrop.base);ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(340,314,252,0,TAU);ctx.fill();ctx.globalAlpha=1;
  ctx.strokeStyle=fixed(lightTheme?'#FFFFFF82':'#E1D8B81A');ctx.lineWidth=1;ctx.beginPath();ctx.arc(340,314,263,0,TAU);ctx.stroke();
  line('M123 346 H157 M140 329 V363 M518 157 H552 M535 140 V174',fixed(lightTheme?'#54655B3D':'#D4D8C93D'),1);
  ctx.save();ctx.globalAlpha=.15;ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(340-lx*36,607,186,19,0,0,TAU);ctx.fill();ctx.restore();

  const backHair='M214 302 C187 255 190 181 219 138 C242 98 284 81 329 83 C384 75 425 98 451 137 C484 184 485 257 459 310 L469 397 Q431 427 387 417 L277 418 Q239 419 205 392Z';
  form(backHair,hair,{x:194,y:80,w:290,h:345});
  const neck='M302 307 Q337 325 376 305 L381 384 Q391 402 417 411 L339 465 L266 415 Q297 401 304 381Z';
  form(neck,skin,{x:265,y:306,w:154,h:161});
  const jacket='M278 386 Q298 414 341 428 Q378 413 394 385 L446 405 Q488 425 507 473 L536 594 Q482 620 342 622 Q210 619 146 594 L173 473 Q186 430 232 408Z';
  form(jacket,cloth,{x:146,y:385,w:390,h:237});
  flat('M278 385 L342 428 L307 467 L260 418Z',color(cloth.highlight),ink);
  flat('M394 385 L342 428 L374 464 L416 415Z',color(cloth.base),ink);
  line('M342 430 L342 616',color(cloth.shadow),2.4,.7);
  line('M205 473 Q235 488 249 526 M474 472 Q448 490 435 525 M174 565 Q199 574 222 575 M456 573 Q482 575 510 565',color(cloth.shadow),2.3,.6);
  const tie='M332 432 L351 431 L359 449 L345 468 L327 449Z';
  form(tie,accent,{x:327,y:431,w:32,h:39});
  form('M340 461 L350 461 L368 542 L346 564 L325 542Z',accent,{x:325,y:461,w:43,h:104});
  line('M243 415 Q219 439 214 465 M434 415 Q460 438 466 466',color(accent.halftone),3.2,.8);

  form('M244 244 Q225 229 223 250 Q224 281 250 290 L260 270Z',skin,{x:222,y:237,w:40,h:55});
  form('M435 236 Q458 223 461 247 Q462 270 440 282 L426 266Z',skin,{x:426,y:230,w:36,h:54});
  line('M233 250 Q239 247 245 265 M451 242 Q441 244 439 259',color(skin.shadow),2);
  const face='M248 189 C251 144 300 120 345 123 C395 120 432 144 439 186 L440 252 Q434 297 412 322 Q392 346 359 367 Q347 375 332 365 Q296 346 272 316 Q248 289 244 251Z';
  form(face,skin,{x:244,y:123,w:198,h:253});
  ctx.save();ctx.clip(path(face));
  ctx.globalAlpha=study.shading==='cel'?.65:.3;
  flat('M246 185 Q318 221 435 177 L438 210 Q331 236 247 212Z',color(skin.shadow));
  ctx.globalAlpha=.75;
  const noseOffset=-lx*8;
  flat(`M350 252 L${355+noseOffset} 281 Q361 290 ${369+noseOffset} 281 L361 272Z`,color(skin.shadow));
  ctx.restore();

  // Narrow eyes and a long jaw keep the reference in an adult anime register.
  flat('M278 249 Q297 236 320 245 Q305 260 283 253Z',study.values?'#F4F4F4':'#F7EEDB');
  flat('M367 244 Q389 231 410 240 Q394 255 370 249Z',study.values?'#F4F4F4':'#F7EEDB');
  for(const [x,y] of [[303,247],[390,243]]){
    ctx.fillStyle=color(accent.shadow);ctx.beginPath();ctx.ellipse(x,y,7,8,0,0,TAU);ctx.fill();
    ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(x+1,y,3.3,7,0,0,TAU);ctx.fill();
    ctx.fillStyle='#FFF9EB';if(study.values)ctx.fillStyle='#FAFAFA';ctx.beginPath();ctx.arc(x-2,y-3,1.8,0,TAU);ctx.fill();
  }
  line('M276 248 Q295 235 320 244 M367 242 Q388 230 411 239',ink,3.2);
  line('M282 255 Q297 261 313 254 M373 252 Q392 257 405 246',color(skin.shadow),1.4,.8);
  line('M278 228 Q296 218 320 225 M370 223 Q390 215 408 221',color(hair.shadow),3.5);
  line('M347 252 L341 279 Q347 286 355 282',feature,1.8,.75);
  line('M328 317 Q345 324 365 313',feature,2.1,.85);
  line('M338 329 Q348 331 356 326',color(skin.reflected),1.6,.65);

  const crown='M212 223 Q198 160 232 121 Q268 79 329 84 Q392 70 435 113 Q467 141 468 206 L434 217 Q431 179 404 154 Q376 177 346 183 L363 159 Q319 194 273 201 L292 174 Q262 193 246 228 L234 266Z';
  form(crown,hair,{x:201,y:79,w:269,h:192});
  form('M231 185 Q250 188 264 214 Q243 267 267 317 L248 350 Q219 309 218 266 Q212 216 231 185Z',hair,{x:217,y:185,w:53,h:166});
  form('M430 180 Q455 183 463 211 Q463 278 439 324 L412 349 Q435 290 423 245Z',hair,{x:412,y:180,w:53,h:169});
  line('M241 135 Q270 110 311 110 M253 161 Q278 134 307 126 M387 105 Q428 127 441 167',color(hair.highlight),3.5,.55);
  line('M236 231 Q229 273 249 311 M446 220 Q454 264 433 310',color(hair.reflected),2.5,.6);
  // One small earring anchors the accent color without adding another material.
  ctx.strokeStyle=color(accent.highlight);ctx.lineWidth=3.3;ctx.beginPath();ctx.ellipse(448,278,5.5,9,0,0,TAU);ctx.stroke();
  ctx.fillStyle=color(accent.base);ctx.beginPath();ctx.arc(447,290,3.5,0,TAU);ctx.fill();
  ctx.restore();
}
