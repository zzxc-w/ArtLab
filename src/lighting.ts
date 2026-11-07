import {mixLinear,normalizeHex} from './color';
import type {LightSettings,Ramp,ShadowStyle} from './types';

export interface Vector3 { x:number; y:number; z:number }
const clamp=(value:number,min=0,max=1,fallback=min)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:fallback));
const wrap=(degrees:number)=>((degrees+180)%360+360)%360-180;

/** A direction TO the light: x right, y down the canvas, z toward the viewer.
 * Screen angle 0 is above, +90 is right, and -90 is left. Elevation tilts
 * from the screen plane toward the viewer, independently of that screen angle.
 */
export function getLightVector(light:Pick<LightSettings,'direction'|'elevation'>):Vector3 {
  const direction=wrap(Number.isFinite(light.direction)?light.direction:0)*Math.PI/180;
  const elevation=clamp(light.elevation,10,80,45)*Math.PI/180;
  const projected=Math.cos(elevation);
  return {x:Math.sin(direction)*projected,y:-Math.cos(direction)*projected,z:Math.sin(elevation)};
}

/** Lambert diffuse response, blended toward the base stop as key strength fades.
 * A disabled key returns exactly 0.5: all faces use their base rather than
 * keeping a directionally painted shadow with no source to explain it.
 */
export function shadeValue(normal:Vector3,light:Pick<LightSettings,'direction'|'elevation'|'strength'>):number {
  const strength=clamp(light.strength,0,1,.5);
  if(strength===0)return .5;
  const length=Math.hypot(normal.x,normal.y,normal.z);
  if(!Number.isFinite(length)||length<1e-12)return .5;
  const key=getLightVector(light);
  const diffuse=clamp((normal.x*key.x+normal.y*key.y+normal.z*key.z)/length);
  return clamp(.5+(diffuse-.5)*strength);
}

type Stop={at:number;color:string};
const smoothstep=(value:number)=>value*value*(3-2*value);

/** Map a geometric response onto the same ramp displayed in the color desk.
 * Smooth transitions mix in linear light; no additional display-space tint is
 * introduced. Reflected-light rims are sampled separately by the renderer.
 */
export function sampleRamp(ramp:Ramp,amount:number,shading:'cel'|'smooth',shadowStyle:ShadowStyle='anime'):string {
  const value=clamp(amount,0,1,.5);
  const base=normalizeHex(ramp.base)||'#808080';
  const shadow=normalizeHex(ramp.shadow)||base,halftone=normalizeHex(ramp.halftone)||base,highlight=normalizeHex(ramp.highlight)||halftone;
  if(value===.5)return base;
  if(shading==='cel'){
    if(shadowStyle==='graphic')return value<.5?shadow:value<.95?base:highlight;
    const thresholds=shadowStyle==='luminous'?[.2,.6,.94]:shadowStyle==='soft'?[.28,.65,.9]:[.38,.72,.9];
    return value<thresholds[0]?shadow:value<thresholds[1]?base:value<thresholds[2]?halftone:highlight;
  }
  const stops:Stop[]=shadowStyle==='graphic'
    ?[{at:0,color:shadow},{at:.32,color:shadow},{at:.5,color:base},{at:.93,color:base},{at:1,color:highlight}]
    :[{at:0,color:shadow},{at:.5,color:base},{at:shadowStyle==='luminous'?.66:shadowStyle==='soft'?.82:.78,color:halftone},{at:1,color:highlight}];
  for(let index=1;index<stops.length;index++){
    const left=stops[index-1],right=stops[index];
    if(value<=right.at){
      const t=clamp((value-left.at)/(right.at-left.at));
      return mixLinear(left.color,right.color,shadowStyle==='soft'?smoothstep(t):t);
    }
  }
  return highlight;
}

/** Screen-clock angle for an offset from the model/viewport center. */
export function screenToLightDirection(dx:number,dy:number):number {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<1e-9)return 0;
  return wrap(Math.atan2(dx,-dy)*180/Math.PI);
}

/** Position of the visible source guide on an inset ellipse. This guide edits
 * the screen angle only; front depth is controlled separately. Keeping it on
 * the perimeter leaves the portrait clear even with a nearly frontal key.
 */
export function lightHandlePosition(direction:number,elevation:number,width:number,height:number,pad=30):{x:number;y:number} {
  const w=clamp(width,1,100000,1),h=clamp(height,1,100000,1),inset=clamp(pad,0,Math.min(w,h)/2,30);
  const key=getLightVector({direction,elevation}),projected=Math.hypot(key.x,key.y);
  return {x:w/2+(key.x/projected)*Math.max(0,w/2-inset),y:h/2+(key.y/projected)*Math.max(0,h/2-inset)};
}
