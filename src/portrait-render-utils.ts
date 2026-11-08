import {canCastPortraitShadow} from './portrait-model';

const clamp=(v:number,low=0,high=1)=>Math.max(low,Math.min(high,v));
const linear=(byte:number)=>{const v=byte/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const encoded=(v:number)=>Math.round(clamp(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)*255);
const decoded=Float64Array.from({length:256},(_,i)=>linear(i));
// At 16-bit linear precision, the maximum transfer-curve error is below one
// display byte. Flat paint and equal/end-point colors bypass the lookup.
const encoding=Uint8Array.from({length:65536},(_,i)=>encoded(i/65535));

/** Blend surface illumination in linear light without per-pixel powers. */
export function mixPortraitByte(a:number,b:number,weightByte:number):number {
 if(a===b||weightByte<=0)return a;
 if(weightByte>=255)return b;
 const weight=weightByte/255,value=decoded[a]*(1-weight)+decoded[b]*weight;
 return encoding[Math.round(clamp(value)*65535)];
}

/** Reconstruct a cast only from samples belonging to the same receiving
 * surface. A neighboring hair/background zero must not punch holes in cloth.
 * Null asks the caller to trace the exact fine pixel when coverage is absent. */
export function sampleReceiverCast(values:Uint8Array,owners:Uint8Array,width:number,height:number,x:number,y:number,receiver:number):number|null {
 if(!canCastPortraitShadow(receiver,1))return 0;
 if(width<1||height<1||values.length!==width*height||owners.length!==values.length||!Number.isFinite(x)||!Number.isFinite(y))return null;
 const px=clamp(x,0,width-1),py=clamp(y,0,height-1),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),tx=px-x0,ty=py-y0;
 const a=y0*width+x0,b=y0*width+x1,c=y1*width+x0,d=y1*width+x1;
 const wa=(1-tx)*(1-ty),wb=tx*(1-ty),wc=(1-tx)*ty,wd=tx*ty;
 let total=0,weight=0;
 if(owners[a]===receiver){total+=values[a]*wa;weight+=wa;}
 if(owners[b]===receiver){total+=values[b]*wb;weight+=wb;}
 if(owners[c]===receiver){total+=values[c]*wc;weight+=wc;}
 if(owners[d]===receiver){total+=values[d]*wd;weight+=wd;}
 return weight>1e-8?Math.round(total/weight):null;
}
