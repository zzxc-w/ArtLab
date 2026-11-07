import {buildRamp,mixLinear,normalizeHex} from './color';
import {getLightVector,sampleRamp,shadeValue,type Vector3} from './lighting';
import type {LightSettings,Ramp,ShadowStyle} from './types';

export type PortraitRGB=readonly [number,number,number];
/** Asset color keys identify surfaces; they never tint the user's paint. */
export const FLAT_SOURCE_COLORS:readonly PortraitRGB[]=[
 [251,185,159],[145,96,187],[79,183,180],[243,189,71],
 [65,60,70],[159,152,157],[255,254,248]
];
export const FIXED_PORTRAIT_COLORS=['#413C46','#9F989D','#FFFEF8'] as const;
export const PORTRAIT_INK='#17131D';
const DEFAULT_BASES=['#EFB898','#64577E','#6E9A9F','#DCAC62'];
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
const inkRGB:PortraitRGB=[23,19,29];
const brightness=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;

function nearestFill(r:number,g:number,b:number):number {
 let id=0,best=Infinity;
 for(let i=0;i<FLAT_SOURCE_COLORS.length;i++){
  const c=FLAT_SOURCE_COLORS[i],distance=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;
  if(distance<best){id=i;best=distance;}
 }
 return id;
}

/** Decode one flat illustration, with hard material ownership and a separate
 * line layer. Small generated fill variations are deliberately discarded.
 * Only a local dark stroke may become ink; broad painted values are not read
 * back into the albedo or lighting. No material mask is blurred into another.
 */
export function decodePortraitImage(source:Uint8ClampedArray,width:number,height:number):{materials:Uint8Array;ink:Uint8Array;alpha:Uint8Array} {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||source.length!==width*height*4)throw new Error('Portrait pixels do not match their dimensions.');
 const count=width*height,materials=new Uint8Array(count),ink=new Uint8Array(count),alpha=new Uint8Array(count);
 const lightness=new Float32Array(count),initial=new Uint8Array(count);
 for(let i=0;i<count;i++){
  const p=i*4,a=source[p+3];alpha[i]=a>=250?255:a;
  initial[i]=a===0?255:nearestFill(source[p],source[p+1],source[p+2]);
  lightness[i]=brightness(source[p],source[p+1],source[p+2]);
 }
 const radius=Math.max(2,Math.min(5,Math.round(height/400)));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,p=i*4;if(alpha[i]===0){materials[i]=255;continue;}
  const r=source[p],g=source[p+1],b=source[p+2],current=initial[i];
  let localMaximum=lightness[i],candidateBits=1<<current;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
   const j=yy*width+xx;if(alpha[j]<96)continue;
   localMaximum=Math.max(localMaximum,lightness[j]);candidateBits|=1<<initial[j];
  }
  materials[i]=current;
  // Uniform charcoal panels and flat-fill variations are not linework.
  if(localMaximum-lightness[i]<22)continue;
  let best=Infinity,bestId=current,bestInk=0;
  for(let id=0;id<7;id++){
   if(!(candidateBits&(1<<id)))continue;
   const base=FLAT_SOURCE_COLORS[id],dr=inkRGB[0]-base[0],dg=inkRGB[1]-base[1],db=inkRGB[2]-base[2];
   const amount=clamp(((r-base[0])*dr+(g-base[1])*dg+(b-base[2])*db)/(dr*dr+dg*dg+db*db));
   const residual=((base[0]+amount*dr-r)**2+(base[1]+amount*dg-g)**2+(base[2]+amount*db-b)**2)/3;
   const score=residual+amount*30;
   if(score<best){best=score;bestId=id;bestInk=amount;}
  }
  if(bestInk>.16&&best-bestInk*30<180){materials[i]=bestId;ink[i]=Math.round(clamp(bestInk)*255);}
 }
 return {materials,ink,alpha};
}

/** Backdrop and extra study swatches cannot replace fixed costume neutrals. */
export function buildPortraitRamps(editable:readonly Ramp[],light:LightSettings):Ramp[] {
 const colors=DEFAULT_BASES.map((base,id)=>editable[id]||editable[0]||buildRamp(base,light));
 return [...colors,...FIXED_PORTRAIT_COLORS.map(base=>buildRamp(base,light))];
}

/** Paint an albedo directly from its semantic color. In particular, black and
 * white need no division by a source color and a disabled key returns the exact
 * chosen base, regardless of normal, cast shadow, bounce or finish. */
export function samplePortraitSurface(materialId:number,ramps:readonly Ramp[],light:LightSettings,shading:'cel'|'smooth',shadowStyle:ShadowStyle,normal:Vector3,occlusion=0):string {
 const ramp=ramps[materialId]||ramps[0];if(!ramp)return '#808080';
 if(light.strength<=0)return normalizeHex(ramp.base)||'#808080';
 const response=shadeValue(normal,light),shadow=clamp(occlusion)*clamp(light.strength);
 const amount=response*(1-shadow*.9);
 let result=sampleRamp(ramp,amount,shading,shadowStyle);
 const bounce=clamp(light.bounce)*clamp(light.strength)*clamp((.35-amount)/.35)*.45*(1-shadow*.6);
 if(bounce>0)result=mixLinear(result,ramp.reflected,bounce);
 return result;
}

/** Heights use image-pixel units; positive z points toward the viewer. */
export function normalFromHeight(depth:Float32Array,width:number,height:number,x:number,y:number):Vector3 {
 if(width<1||height<1||depth.length!==width*height||x<0||x>=width||y<0||y>=height)return {x:0,y:0,z:1};
 const left=Math.max(0,x-1),right=Math.min(width-1,x+1),top=Math.max(0,y-1),bottom=Math.min(height-1,y+1);
 const gx=(depth[y*width+right]-depth[y*width+left])/Math.max(1,right-left),gy=(depth[bottom*width+x]-depth[top*width+x])/Math.max(1,bottom-top);
 if(!Number.isFinite(gx)||!Number.isFinite(gy))return {x:0,y:0,z:1};
 const length=Math.hypot(gx,gy,1);return {x:-gx/length,y:-gy/length,z:1/length};
}

let previousWidth=-1,previousHeight=-1,previousDirection=NaN,previousElevation=NaN;
let previousRay:Array<{dx:number;dy:number;dz:number}>=[];
function shadowRay(width:number,height:number,light:LightSettings):typeof previousRay {
 if(width===previousWidth&&height===previousHeight&&light.direction===previousDirection&&light.elevation===previousElevation)return previousRay;
 const source=getLightVector(light),projection=Math.hypot(source.x,source.y),distance=Math.max(4,Math.min(96,height*.06));
 const steps=20;
 previousRay=projection<1e-6?[]:Array.from({length:steps},(_,i)=>{
  const length=(i+1)*distance/steps;return {dx:source.x/projection*length,dy:source.y/projection*length,dz:source.z/projection*length};
 });previousWidth=width;previousHeight=height;previousDirection=light.direction;previousElevation=light.elevation;return previousRay;
}

/** Trace toward the source, so a raised object on the right casts to its left.
 * A small bounded ray set keeps the portrait practical on tablet CPUs. */
export function portraitOcclusion(depth:Float32Array,coverage:Uint8Array,width:number,height:number,x:number,y:number,light:LightSettings):number {
 if(light.strength<=0||x<0||x>=width||y<0||y>=height||depth.length!==width*height||coverage.length!==width*height)return 0;
 const index=y*width+x;if(coverage[index]<96)return 0;
 const origin=depth[index];let result=0;
 for(const step of shadowRay(width,height,light)){
  const xx=Math.round(x+step.dx),yy=Math.round(y+step.dy);if(xx<0||xx>=width||yy<0||yy>=height)break;
  const sample=yy*width+xx;if(sample===index||coverage[sample]<96)continue;
  result=Math.max(result,clamp((depth[sample]-origin-step.dz-.35)/1.5));if(result===1)return 1;
 }
 return result;
}
