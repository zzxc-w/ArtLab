import type { Harmony, LightSettings, Ramp, Swatch } from './types';

export interface RGB { r:number; g:number; b:number }
export interface HSV { h:number; s:number; v:number }
export interface Oklab { L:number; a:number; b:number }
const bounded=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
const hue=(value:number)=>((value%360)+360)%360;
const channels=(rgb:RGB)=>[rgb.r,rgb.g,rgb.b];
const object=(c:number[]):RGB=>({r:c[0],g:c[1],b:c[2]});

export function normalizeHex(value:string):string|null {
  if(typeof value!=='string')return null;
  let text=value.trim().replace(/^#/,'');
  if(/^[\da-f]{3}$/i.test(text))text=[...text].map(c=>c+c).join('');
  return /^[\da-f]{6}$/i.test(text)?'#'+text.toUpperCase():null;
}
export function hexToRgb(value:string):RGB {
  const hex=normalizeHex(value);if(!hex)throw new TypeError('Use a three- or six-digit HEX color.');
  return {r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)};
}
export function rgbToHex(rgb:RGB):string {
  return '#'+channels(rgb).map(c=>Math.round(bounded(c,0,255)).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function rgbToHsv(rgb:RGB):HSV {
  const [r,g,b]=channels(rgb).map(c=>bounded(c/255)),maximum=Math.max(r,g,b),minimum=Math.min(r,g,b),delta=maximum-minimum;
  let h=0;
  if(delta>1e-12)h=maximum===r?60*((g-b)/delta%6):maximum===g?60*((b-r)/delta+2):60*((r-g)/delta+4);
  return {h:hue(h),s:maximum===0?0:delta/maximum*100,v:maximum*100};
}
export function hsvToRgb(hsv:HSV):RGB {
  const h=hue(Number.isFinite(hsv.h)?hsv.h:0)/60,s=bounded(hsv.s/100),v=bounded(hsv.v/100),c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c;
  const values=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
  return object(values.map(value=>(value+m)*255));
}

// IEC sRGB transfer: mixing encoded sRGB directly produces overly dark blends.
export function srgbToLinear(value:number):number {const c=bounded(value);return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}
export function linearToSrgb(value:number):number {const c=bounded(value);return c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;}
const toLinear=(rgb:RGB)=>channels(rgb).map(c=>srgbToLinear(c/255));
const fromLinear=(rgb:number[])=>object(rgb.map(c=>linearToSrgb(c)*255));
export function mixLinear(a:string,b:string,amount:number):string {
  const x=toLinear(hexToRgb(a)),y=toLinear(hexToRgb(b)),t=bounded(amount);
  return rgbToHex(fromLinear(x.map((value,i)=>value*(1-t)+y[i]*t)));
}

// Björn Ottosson's D65 linear-sRGB/Oklab matrices, updated 2021-01-25.
// Primary reference: https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
export function rgbToOklab(rgb:RGB):Oklab {
  const [r,g,b]=toLinear(rgb);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return {L:.2104542553*l+.7936177850*m-.0040720468*s,a:1.9779984951*l-2.4285922050*m+.4505937099*s,b:.0259040371*l+.7827717662*m-.8086757660*s};
}
function labToLinear(lab:Oklab):number[] {
  const l=(lab.L+.3963377774*lab.a+.2158037573*lab.b)**3;
  const m=(lab.L-.1055613458*lab.a-.0638541728*lab.b)**3;
  const s=(lab.L-.0894841775*lab.a-1.2914855480*lab.b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s];
}
export function oklabToRgb(lab:Oklab):RGB {
  const L=bounded(lab.L),a=Number.isFinite(lab.a)?lab.a:0,b=Number.isFinite(lab.b)?lab.b:0;
  if(L<1e-8)return {r:0,g:0,b:0};if(L>1-1e-8)return {r:255,g:255,b:255};
  let linear=labToLinear({L,a,b});
  const inGamut=(rgb:number[])=>rgb.every(c=>c>=-1e-10&&c<=1+1e-10);
  if(!inGamut(linear)){
    // Reduce OKLCH chroma at constant hue/lightness instead of clipping channels.
    let low=0,high=1;
    for(let i=0;i<24;i++){const scale=(low+high)/2;if(inGamut(labToLinear({L,a:a*scale,b:b*scale})))low=scale;else high=scale;}
    linear=labToLinear({L,a:a*low,b:b*low});
  }
  return fromLinear(linear);
}
export function luminance(hex:string):number {const [r,g,b]=toLinear(hexToRgb(hex));return .2126*r+.7152*g+.0722*b;}
export function contrastRatio(a:string,b:string):number {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function readableInk(background:string):string {
  const dark='#151A1C',light='#FFFFFF',darkRatio=contrastRatio(background,dark),lightRatio=contrastRatio(background,light);
  // Preserve the studio's charcoal ink when possible; borderline midtones need
  // true black to meet normal-text contrast instead of merely choosing less bad.
  if(Math.max(darkRatio,lightRatio)<4.5)return '#000000';
  return darkRatio>=lightRatio?dark:light;
}

function perceptualColor(hex:string,L:number,rotation:number,saturation:number):string {
  const lab=rgbToOklab(hexToRgb(hex)),C=Math.hypot(lab.a,lab.b)*saturation,H=Math.atan2(lab.b,lab.a)+rotation*Math.PI/180;
  return rgbToHex(oklabToRgb({L,a:C*Math.cos(H),b:C*Math.sin(H)}));
}
function limitLuminance(hex:string,target:number,above:boolean):string {
  const value=luminance(hex);
  if(above?value>=target:value<=target)return hex;
  const linear=toLinear(hexToRgb(hex));let low=0,high=1,best=above?'#FFFFFF':'#000000';
  // Quantize inside the search so the exported HEX values retain their ordering.
  for(let i=0;i<20;i++){
    const t=(low+high)/2;
    const candidate=rgbToHex(fromLinear(linear.map(c=>above?c+(1-c)*t:c*t)));
    const fits=above?luminance(candidate)>=target:luminance(candidate)<=target;
    if(above){if(fits){high=t;best=candidate;}else low=t;}
    else if(fits){low=t;best=candidate;}else high=t;
  }
  return best;
}

/** Artist-oriented ramps: linear-light tinting plus perceptual hue/chroma edits.
 * Base is the unmodified material anchor. This is not a spectral light simulator.
 */
export function buildRamp(baseHex:string,settings:LightSettings):Ramp {
  const base=normalizeHex(baseHex);if(!base)throw new TypeError('Invalid base color.');
  const temperature=bounded(settings.temperature,-1,1),strength=bounded(settings.strength),shadowDepth=bounded(settings.shadow);
  const drift=bounded(settings.hueShift,-45,45),saturation=bounded(settings.saturation,0,1.5),bounce=bounded(settings.bounce);
  const ambient=normalizeHex(settings.ambient)||'#7184AD';
  const key=mixLinear('#FFFFFF',temperature<0?'#A9C8FF':'#FFD0A0',Math.abs(temperature)*.8);
  const baseL=rgbToOklab(hexToRgb(base)).L,baseY=luminance(base);
  const halftoneL=baseL+(1-baseL)*.20*strength;
  const highlightL=baseL+(1-baseL)*.64*strength;
  const shadowL=baseL*(1-.75*shadowDepth);
  let halftone=perceptualColor(mixLinear(base,key,.15*strength),halftoneL,drift*.25,saturation);
  halftone=limitLuminance(halftone,baseY,true);
  let highlight=perceptualColor(mixLinear(base,key,.44*strength),highlightL,-drift*.12,saturation*.78);
  highlight=limitLuminance(highlight,luminance(halftone),true);
  let shadow=perceptualColor(mixLinear(base,ambient,.14*shadowDepth),shadowL,drift,saturation);
  shadow=limitLuminance(shadow,baseY*(1-.68*shadowDepth),false);
  let reflected=shadow;
  if(bounce>0){
    const reflectedL=Math.min(halftoneL,shadowL+(.08+.16*shadowDepth)*bounce);
    reflected=perceptualColor(mixLinear(shadow,ambient,.65*bounce),reflectedL,drift*.4,saturation);
    reflected=limitLuminance(reflected,luminance(shadow),true);
    reflected=limitLuminance(reflected,luminance(halftone),false);
    if(luminance(reflected)<luminance(shadow))reflected=shadow;
  }
  return {base,highlight,halftone,shadow,reflected};
}

export function generateHarmony(colors:Swatch[],selectedId:string,mode:Harmony):Swatch[] {
  const anchor=colors.find(color=>color.id===selectedId)||colors[0];if(!anchor)return [];
  const hsv=rgbToHsv(hexToRgb(anchor.hex));
  const offsets:Record<Harmony,number[]>={analogous:[-30,30,-60,60,-90,90,150],complementary:[180,180,0,180,0,180,0],split:[150,210,150,210,0,150,210],triadic:[120,240,120,240,0,120,240],monochrome:[0,0,0,0,0,0,0]};
  let generated=0;
  return colors.map(color=>{
    if(color.id===anchor.id||color.locked)return {...color};
    const index=generated++,offset=offsets[mode][index%offsets[mode].length];
    const s=mode==='monochrome'?bounded(hsv.s*(.65+.12*(index%4)),0,100):bounded(hsv.s*(.86+.07*(index%3)),0,100);
    const v=mode==='monochrome'?bounded(94-(index%7)*11,10,100):bounded(hsv.v*(.82+.09*(index%3))+8,12,100);
    return {...color,hex:rgbToHex(hsvToRgb({h:hsv.h+offset,s,v}))};
  });
}
