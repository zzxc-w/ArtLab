import type {LightSettings,Ramp,Study} from './types';
import {getLightVector} from './lighting';
import {decodePortraitImage,buildPortraitRamps,samplePortraitSurface,portraitOcclusion,canCastPortraitShadow,PORTRAIT_INK} from './portrait-model';
import {buildPortraitGeometry} from './portrait-geometry';
type PortraitMap={width:number;height:number;materials:Uint8Array;ink:Uint8Array;alpha:Uint8Array;depth:Float32Array;normals:Float32Array;surfaces:Uint8Array};
type CastMap={values:Uint8Array;samples:number};
type Quality='interactive'|'final';
type DrawOptions={export?:boolean;interactive?:boolean};
const PREVIEW_EDGE=820,INTERACTIVE_EDGE=480,CAST_LEVELS=64;
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
const linear=(v:number)=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
const encoded=(v:number)=>Math.round(clamp(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)*255);
const linearBytes=Float32Array.from({length:256},(_,i)=>linear(i));
const rgb=(hex:string):[number,number,number]=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const gray=(r:number,g:number,b:number)=>encoded(.2126*linearBytes[r]+.7152*linearBytes[g]+.0722*linearBytes[b]);
let original:HTMLImageElement|null=null,loading:Promise<void>|null=null,error:string|null=null;
const maps=new Map<number,PortraitMap>(),rendered=new Map<string,HTMLCanvasElement>(),casts=new Map<string,CastMap>(),colorTables=new Map<string,Uint8Array>();
let stats={quality:'final' as Quality,renderMs:0,pixelCount:0,castSamples:0};
export function portraitStatus():{ready:boolean;error:string|null}{return {ready:original!==null&&maps.has(PREVIEW_EDGE),error};}
export function portraitRenderStats():typeof stats{return {...stats};}
export function preloadPortrait():Promise<void>{
 if(loading)return loading;
 loading=(async()=>{try{
  const image=new Image();image.decoding='async';
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('The illustration could not be loaded.'));image.src=new URL('./assets/portrait-flats.png',import.meta.url).href;});
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('The illustration file is empty.');
  original=image;mapFor(PREVIEW_EDGE);
 }catch(cause){original=null;error=cause instanceof Error?cause.message:'The illustration could not be loaded.';}})();return loading;
}
export function buildPortraitDepth(materials:Uint8Array,alpha:Uint8Array,width:number,height:number):Float32Array{return buildPortraitGeometry(materials,alpha,width,height).depth;}
function mapFor(edge:number):PortraitMap|null{
 const known=maps.get(edge);if(known)return known;if(!original)return null;
 const scale=Math.min(1,edge/Math.max(original.naturalWidth,original.naturalHeight)),width=Math.max(1,Math.round(original.naturalWidth*scale)),height=Math.max(1,Math.round(original.naturalHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Canvas illustration rendering is unavailable.');
 context.drawImage(original,0,0,width,height);
 const decoded=decodePortraitImage(context.getImageData(0,0,width,height).data,width,height),geometry=buildPortraitGeometry(decoded.materials,decoded.alpha,width,height),map={width,height,...decoded,...geometry};
 maps.set(edge,map);while(maps.size>2){const old=[...maps.keys()].find(key=>key!==PREVIEW_EDGE&&key!==edge);if(old===undefined)break;maps.delete(old);}return map;
}
function castMap(map:PortraitMap,light:LightSettings,interactive=false):CastMap{
 if(light.strength===0)return {values:new Uint8Array(map.width*map.height),samples:0};
 const cacheKey=JSON.stringify([map.width,map.height,light.direction,light.elevation,interactive]),known=casts.get(cacheKey);if(known)return {...known,samples:0};
 const values=new Uint8Array(map.width*map.height);
 // Form shadows come from each continuous surface normal. Only another
 // raised object may cast over it; no terrain ray can shadow its own surface.
 const stride=interactive?4:2,cw=Math.ceil(map.width/stride),ch=Math.ceil(map.height/stride),coarse=new Uint8Array(cw*ch),surface=new Uint8Array(cw*ch);let samples=0;
 for(let cy=0;cy<ch;cy++)for(let cx=0;cx<cw;cx++){
  const x=Math.min(map.width-1,cx*stride+Math.floor(stride/2)),y=Math.min(map.height-1,cy*stride+Math.floor(stride/2)),index=y*map.width+x,c=cy*cw+cx;
  surface[c]=map.surfaces[index];if(map.alpha[index]<180||!canCastPortraitShadow(surface[c],1))continue;
  coarse[c]=Math.round(clamp(portraitOcclusion(map.depth,map.alpha,map.width,map.height,x,y,light,map.surfaces))*255);samples++;
 }
 // Receiver-local penumbra removes ray-grid stair steps without changing ink
 // or material ownership. No filter is applied to the categorical color map.
 const softened=coarse.slice();
 for(let y=1;y<ch-1;y++)for(let x=1;x<cw-1;x++){
  const index=y*cw+x;let total=coarse[index]*4,weight=4;
  for(const offset of [-1,1,-cw,cw])if(surface[index+offset]===surface[index]){total+=coarse[index+offset];weight++;}
  softened[index]=Math.round(total/weight);
 }
 for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
  const index=y*map.width+x;if(map.alpha[index]===0||!canCastPortraitShadow(map.surfaces[index],1))continue;
  const px=clamp((x-stride/2)/stride,0,cw-1),py=clamp((y-stride/2)/stride,0,ch-1),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(cw-1,x0+1),y1=Math.min(ch-1,y0+1),tx=px-x0,ty=py-y0;
  const a=softened[y0*cw+x0]*(1-tx)+softened[y0*cw+x1]*tx,b=softened[y1*cw+x0]*(1-tx)+softened[y1*cw+x1]*tx;values[index]=Math.round(a*(1-ty)+b*ty);
 }
 const result={values,samples};casts.set(cacheKey,result);while(casts.size>3)casts.delete(casts.keys().next().value!);return result;
}
function colorTable(study:Study,editable:Ramp[]):Uint8Array{
 const ramps=buildPortraitRamps(editable,study.light),cacheKey=JSON.stringify([ramps,study.light.strength,study.light.bounce,study.shading,study.shadowStyle,study.values]),known=colorTables.get(cacheKey);if(known)return known;
 const table=new Uint8Array(ramps.length*257*(CAST_LEVELS+1)*3),light={...study.light,direction:0,elevation:45},k=Math.SQRT1_2;
 // Color response is independent of source direction. Warm/cool color and
 // gamma calculations happen once per paint/finish change, not every drag.
 for(let id=0;id<ramps.length;id++)for(let slot=0;slot<=256;slot++){
  const dot=slot/256,normal={x:Math.sqrt(Math.max(0,1-dot*dot)),y:-k*dot,z:k*dot};
  let lit=rgb(samplePortraitSurface(id,ramps,light,study.shading,study.shadowStyle,normal,0)),shadow=rgb(samplePortraitSurface(id,ramps,light,study.shading,study.shadowStyle,normal,1));
  if(study.values){const a=gray(...lit),b=gray(...shadow);lit=[a,a,a];shadow=[b,b,b];}
  for(let cast=0;cast<=CAST_LEVELS;cast++)for(let channel=0;channel<3;channel++){
   const amount=cast/CAST_LEVELS,value=cast===0?lit[channel]:cast===CAST_LEVELS?shadow[channel]:encoded(linearBytes[lit[channel]]*(1-amount)+linearBytes[shadow[channel]]*amount);
   table[((id*257+slot)*(CAST_LEVELS+1)+cast)*3+channel]=value;
  }
 }
 colorTables.set(cacheKey,table);while(colorTables.size>3)colorTables.delete(colorTables.keys().next().value!);return table;
}
function paint(map:PortraitMap,study:Study,editable:Ramp[],interactive:boolean):HTMLCanvasElement{
 const start=performance.now(),quality:Quality=interactive?'interactive':'final',scale=interactive?Math.min(1,INTERACTIVE_EDGE/map.height):1,width=Math.round(map.width*scale),height=Math.round(map.height*scale);
 const key=JSON.stringify([map.width,map.height,width,height,editable.slice(0,4),study.light,study.shading,study.shadowStyle,study.values]),known=rendered.get(key);
 if(known){stats={quality,renderMs:performance.now()-start,pixelCount:width*height,castSamples:0};return known;}
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d')!,pixels=context.createImageData(width,height),out=pixels.data,colors=colorTable(study,editable),light=getLightVector(study.light),occlusion=castMap(map,study.light,interactive),inkColor=rgb(PORTRAIT_INK);
 if(study.values){const value=gray(...inkColor);inkColor.fill(value);}
 const sx=map.width/width,sy=map.height/height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const mx=Math.min(map.width-1,Math.floor((x+.5)*sx)),my=Math.min(map.height-1,Math.floor((y+.5)*sy)),index=my*map.width+mx,p=(y*width+x)*4;if(map.alpha[index]===0)continue;
  const n=index*3,dot=clamp(map.normals[n]*light.x+map.normals[n+1]*light.y+map.normals[n+2]*light.z),slot=Math.round(dot*256),cast=Math.round(occlusion.values[index]*CAST_LEVELS/255),id=map.materials[index],offset=((id*257+slot)*(CAST_LEVELS+1)+cast)*3,ink=map.ink[index]/255;
  out[p]=ink===0?colors[offset]:Math.round(colors[offset]*(1-ink)+inkColor[0]*ink);
  out[p+1]=ink===0?colors[offset+1]:Math.round(colors[offset+1]*(1-ink)+inkColor[1]*ink);
  out[p+2]=ink===0?colors[offset+2]:Math.round(colors[offset+2]*(1-ink)+inkColor[2]*ink);
  out[p+3]=map.alpha[index];
 }
 context.putImageData(pixels,0,0);rendered.set(key,canvas);while(rendered.size>4)rendered.delete(rendered.keys().next().value!);stats={quality,renderMs:performance.now()-start,pixelCount:width*height,castSamples:occlusion.samples};return canvas;
}
export function portraitProjection(width:number,height:number,options?:DrawOptions):{x:number;y:number;width:number;height:number;sourceWidth:number;sourceHeight:number}{
 const sourceWidth=original?.naturalWidth||1024,sourceHeight=original?.naturalHeight||1536,margin=options?.export?12:20,scale=Math.max(.01,Math.min((width-margin*2)/sourceWidth,(height-margin*2)/sourceHeight))*1.25,w=sourceWidth*scale,h=sourceHeight*scale;
 return {x:(width-w)/2,y:margin,width:w,height:h,sourceWidth,sourceHeight};
}
export function inspectPortrait(u:number,v:number,width:number,height:number):{material:number;ink:number;alpha:number;normal:{x:number;y:number;z:number};depth:number;surface:number;x:number;y:number}|null{
 const map=maps.get(PREVIEW_EDGE);if(!map)return null;
 const sx=Math.min(map.width-1,Math.max(0,Math.floor(clamp(u)*map.width))),sy=Math.min(map.height-1,Math.max(0,Math.floor(clamp(v)*map.height))),index=sy*map.width+sx,n=index*3,projection=portraitProjection(width,height);
 return {material:map.materials[index],ink:map.ink[index]/255,alpha:map.alpha[index]/255,normal:{x:map.normals[n],y:map.normals[n+1],z:map.normals[n+2]},depth:map.depth[index],surface:map.surfaces[index],x:projection.x+u*projection.width,y:projection.y+v*projection.height};
}
export function inspectPortraitLighting(u:number,v:number,light:LightSettings):{surface:number;occlusion:number;normalDot:number}|null{
 const map=maps.get(PREVIEW_EDGE);if(!map)return null;const x=Math.min(map.width-1,Math.floor(clamp(u)*map.width)),y=Math.min(map.height-1,Math.floor(clamp(v)*map.height)),index=y*map.width+x,n=index*3,key=getLightVector(light);
 return {surface:map.surfaces[index],occlusion:castMap(map,light).values[index]/255,normalDot:clamp(map.normals[n]*key.x+map.normals[n+1]*key.y+map.normals[n+2]*key.z)};
}
export function drawPortrait(context:CanvasRenderingContext2D,study:Study,ramps:Ramp[],width:number,height:number,options?:DrawOptions):boolean{
 const map=mapFor(options?.export?Math.min(1800,Math.max(width,height)*1.5):PREVIEW_EDGE);
 if(!map){context.save();context.fillStyle=study.values?'#BDBDBD':'#BAC2BB';context.textAlign='center';context.font='14px system-ui,sans-serif';context.fillText(error?'The illustration could not be loaded.':'Loading illustration…',width/2,height/2);if(error){context.font='12px system-ui,sans-serif';context.fillText('Reload ArtLab to try again.',width/2,height/2+25);}context.restore();return false;}
 const art=paint(map,study,ramps,!options?.export&&!!options?.interactive),projection=portraitProjection(width,height,options);
 context.save();context.beginPath();context.rect(0,0,width,height);context.clip();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(art,projection.x,projection.y,projection.width,projection.height);context.restore();return true;
}
