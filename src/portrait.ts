import { hexToRgb, rgbToOklab } from './color';
import { getLightVector, sampleRamp } from './lighting';
import type { Ramp, Study } from './types';

type RGB = [number,number,number];
type Point = {x:number;y:number};
type Region = Point & {rx:number;ry:number};
type PortraitMap = {
  width:number;height:number;source:Uint8ClampedArray;material:Uint8Array;
  normals:Int8Array;weights:Uint8Array;
};

const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
const linear=(value:number)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
const encoded=(value:number)=>Math.round(clamp(value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055)*255);
const linearBytes=Float32Array.from({length:256},(_,i)=>linear(i));
const parse=(hex:string):RGB=>{const rgb=hexToRgb(hex);return [rgb.r,rgb.g,rgb.b];};
const luminance=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;
const anchors=['#EFB898','#64577E','#6E9A9F','#DCAC62'];
const anchorLinear=anchors.map(hex=>parse(hex).map(value=>linearBytes[value]) as RGB);
const anchorLab=anchors.map(hex=>rgbToOklab(hexToRgb(hex)));
const fallback:Ramp={base:'#C5B8A5',highlight:'#F2DAB1',halftone:'#D8B994',shadow:'#665B70',reflected:'#847C91'};

// Coordinates are relative to the original illustration, never the viewport.
// A small set of volumes is deliberately independent of the painted details:
// changing the key moves the actual light response while preserving fine art.
const face:Region={x:.447,y:.229,rx:.178,ry:.112};
const neck:Region={x:.516,y:.337,rx:.078,ry:.056};
const head:Region={x:.487,y:.185,rx:.307,ry:.188};
const body:Region={x:.50,y:.71,rx:.46,ry:.39};
const nose:Point={x:.383,y:.256};
const chin:Point={x:.450,y:.329};

let original:HTMLImageElement|null=null;
let loading:Promise<void>|null=null;
let error:string|null=null;
const maps=new Map<number,PortraitMap>();
const rendered=new Map<string,HTMLCanvasElement>();

export function portraitStatus():{ready:boolean;error:string|null} {
  return {ready:original!==null&&maps.has(820),error};
}

/** This local bundled image is also included in ArtLab's offline cache. The
 * promise resolves on failure as well: callers can paint the explicit error
 * state instead of leaving an empty preview or producing a rejected export. */
export function preloadPortrait():Promise<void> {
  if(loading)return loading;
  loading=(async()=>{
    try{
      const image=new Image();image.decoding='async';
      await new Promise<void>((resolve,reject)=>{
        image.onload=()=>resolve();image.onerror=()=>reject(new Error('The illustration could not be loaded.'));
        image.src=new URL('./assets/game-portrait.png',import.meta.url).href;
      });
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('The illustration file is empty.');
      original=image;mapFor(820);
    }catch(cause){
      original=null;error=cause instanceof Error?cause.message:'The illustration could not be loaded.';
    }
  })();
  return loading;
}

function elliptical(x:number,y:number,region:Region):number {
  return ((x-region.x)/region.rx)**2+((y-region.y)/region.ry)**2;
}

function classify(r:number,g:number,b:number,x:number,y:number):number {
  const lab=rgbToOklab({r,g,b}),chroma=Math.hypot(lab.a,lab.b);
  // Keep ink, the whites of the eyes, and the neutral costume panels intact.
  // They are relit as neutral surfaces rather than mistaken for skin highlights.
  const facePoint=elliptical(x,y,face),neckPoint=elliptical(x,y,neck);
  const eyeWhite=y>.175&&y<.242&&x>.31&&x<.545&&lab.L>.84&&chroma<.038;
  if(eyeWhite||lab.L<.23)return 4;
  const gold=chroma>.045&&lab.b>.026&&lab.b>lab.a*1.25;
  // Pale strands remain part of the same broad hair mass. Purely hue-based
  // labels otherwise turn every textured gray highlight into an isolated white
  // fragment when the surrounding hair receives a cel shadow.
  const hairCrown=y<.375&&x>.145&&x<.86;
  const longHair=y>.31&&(x<.30&&y<.65||x>.82||x>.39&&x<.56&&y<.67);
  if(!gold&&(hairCrown&&lab.b<.014&&lab.a>-.004||longHair&&chroma>.023&&lab.a>.005&&lab.b<.012))return 1;
  if(chroma<.006||chroma<.035&&lab.L>.84)return 4;
  // The coat is an intentionally desaturated blue-green. Its small chroma is
  // still meaningful; a generic "nearly gray" cutoff would disable its color
  // control. Ivory armor and the warm charcoal undershirt remain neutral.
  if(lab.a<-.0055&&lab.b<.005&&chroma>.008)return 2;
  if(chroma<.027&&lab.a>=0&&lab.b>-.005&&(lab.L>.67||lab.L<.60))return 4;
  if(facePoint>1.3&&neckPoint>1.2&&lab.a>0&&lab.b>0&&chroma<.045)return 4;
  let material=0,best=Infinity;
  for(let i=0;i<anchorLab.length;i++){
    const anchor=anchorLab[i],anchorChroma=Math.hypot(anchor.a,anchor.b);
    // Chroma direction identifies a material under its intrinsic highlights
    // and folds; lightness carries texture and must not identify the material.
    const a=lab.a/chroma-anchor.a/anchorChroma,b=lab.b/chroma-anchor.b/anchorChroma;
    let distance=a*a+b*b+.08*(chroma-anchorChroma)**2;
    if(i===0&&facePoint>1.4&&neckPoint>1.25)distance+=.36;
    if(i===0&&(facePoint<1.1||neckPoint<.95))distance-=.05;
    if(i===3&&(facePoint<1.1||neckPoint<.95))distance+=.025;
    if(i===1&&y<.40)distance-=.035;
    if(i===2&&y>.36)distance-=.025;
    if(distance<best){best=distance;material=i;}
  }
  return material===1&&!hairCrown&&!longHair?4:material;
}

function cleanMaterials(source:Uint8ClampedArray,initial:Uint8Array,width:number,height:number):Uint8Array {
  let material=initial;
  for(let pass=0;pass<2;pass++){
    const next=material.slice();
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const index=y*width+x,p=index*4,current=material[index];if(source[p+3]<80||current===3)continue;
      // Preserve real eye whites/highlight pinpoints and tiny gold hardware.
      if(Math.min(source[p],source[p+1],source[p+2])>221&&Math.max(source[p],source[p+1],source[p+2])-Math.min(source[p],source[p+1],source[p+2])<23)continue;
      const counts=[0,0,0,0,0];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const neighbor=index+dy*width+dx;if(source[neighbor*4+3]>80)counts[material[neighbor]]++;
      }
      let winner=current;for(let id=0;id<5;id++)if(counts[id]>counts[winner])winner=id;
      if(winner!==3&&counts[winner]>=5&&(current===4||counts[current]<3))next[index]=winner;
    }
    material=next;
  }
  return material;
}

function smooth(value:number):number {const t=clamp(value);return t*t*(3-2*t);}

// Geometry is a spatial field. A neutral stitch and its colored cloth share
// the same normal; a noisy color label can never turn into a lighting hole.
function normal(x:number,y:number):[number,number,number] {
  const u=clamp((x-body.x)/body.rx,-1.2,1.2),v=clamp((y-body.y)/body.ry,-1.2,1.2);
  let nx=u*.61,ny=-.13+v*.23,nz=Math.sqrt(Math.max(.23,1-u*u*.48));
  const hu=clamp((x-head.x)/head.rx,-1.2,1.2),hv=clamp((y-head.y)/head.ry,-1.2,1.2);
  const headAmount=1-smooth((y-.35)/.09);
  nx=nx*(1-headAmount)+hu*.80*headAmount;
  ny=ny*(1-headAmount)+(hv*.68-.08)*headAmount;
  nz=nz*(1-headAmount)+Math.sqrt(Math.max(.07,1-hu*hu*.66-hv*hv*.47))*headAmount;
  const faceAmount=(1-smooth((elliptical(x,y,face)-.75)/.55))*(1-smooth((y-.325)/.035));
  const fu=clamp((x-face.x)/face.rx,-1.2,1.2),fv=clamp((y-face.y)/face.ry,-1.2,1.2);
  const bridge=Math.exp(-(((x-nose.x)/.025)**2)-(((y-nose.y)/.062)**2));
  const fx=fu*.67-.16+bridge*(x-nose.x)*13,fy=fv*.48+bridge*(y-nose.y)*3;
  const fz=Math.sqrt(Math.max(.18,1-fu*fu*.55-fv*fv*.31))+bridge*.20;
  nx=nx*(1-faceAmount)+fx*faceAmount;ny=ny*(1-faceAmount)+fy*faceAmount;nz=nz*(1-faceAmount)+fz*faceAmount;
  const neckAmount=(1-smooth((elliptical(x,y,neck)-.5)/.8))*smooth((y-.31)/.035);
  const nu=clamp((x-neck.x)/neck.rx,-1,1);
  nx=nx*(1-neckAmount)+nu*.68*neckAmount;ny=ny*(1-neckAmount)+.035*neckAmount;nz=nz*(1-neckAmount)+Math.sqrt(Math.max(.2,1-nu*nu*.62))*neckAmount;
  const length=Math.hypot(nx,ny,nz)||1;return [nx/length,ny/length,nz/length];
}

function materialWeights(material:Uint8Array,width:number,height:number):Uint8Array {
  const weights=new Uint8Array(width*height*4),temporary=new Float32Array(width*height),radius=Math.max(2,Math.round(height/205)),diameter=radius*2+1;
  for(let id=0;id<4;id++){
    for(let y=0;y<height;y++){
      let sum=0;for(let dx=-radius;dx<=radius;dx++)if(dx>=0&&dx<width&&material[y*width+dx]===id)sum++;
      for(let x=0;x<width;x++){
        temporary[y*width+x]=sum/diameter;
        const remove=x-radius,add=x+radius+1;if(remove>=0&&material[y*width+remove]===id)sum--;if(add<width&&material[y*width+add]===id)sum++;
      }
    }
    for(let x=0;x<width;x++){
      let sum=0;for(let dy=-radius;dy<=radius;dy++)if(dy>=0&&dy<height)sum+=temporary[dy*width+x];
      for(let y=0;y<height;y++){
        const index=y*width+x;
        weights[index*4+id]=Math.round(clamp(sum/diameter)*255);
        const remove=y-radius,add=y+radius+1;if(remove>=0)sum-=temporary[remove*width+x];if(add<height)sum+=temporary[add*width+x];
      }
    }
  }
  return weights;
}

function mapFor(edge:number):PortraitMap|null {
  const known=maps.get(edge);if(known)return known;if(!original)return null;
  const scale=Math.min(1,edge/Math.max(original.naturalWidth,original.naturalHeight));
  const width=Math.max(1,Math.round(original.naturalWidth*scale)),height=Math.max(1,Math.round(original.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas illustration rendering is unavailable.');
  ctx.drawImage(original,0,0,width,height);
  const source=ctx.getImageData(0,0,width,height).data,count=width*height;
  let material:Uint8Array=new Uint8Array(count);
  const normals=new Int8Array(count*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x,p=index*4;if(source[p+3]===0){material[index]=4;continue;}
    material[index]=classify(source[p],source[p+1],source[p+2],(x+.5)/width,(y+.5)/height);
  }
  material=cleanMaterials(source,material,width,height);
  const weights=materialWeights(material,width,height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x,p=index*4,n=index*3;if(source[p+3]===0)continue;
    const vector=normal((x+.5)/width,(y+.5)/height);
    normals[n]=Math.round(vector[0]*127);normals[n+1]=Math.round(vector[1]*127);normals[n+2]=Math.round(vector[2]*127);
  }
  const map={width,height,source,material,normals,weights};maps.set(edge,map);
  // One interactive map and one export map are enough; avoid accumulating
  // full-resolution copies on iPad when several PNGs are exported.
  while(maps.size>2){const key=[...maps.keys()].find(value=>value!==820&&value!==edge);if(key===undefined)break;maps.delete(key);}
  return map;
}

type LightRatio=[number,number,number,number];
function lightingRatio(color:RGB,base:RGB):LightRatio {
  const baseY=Math.max(.002,luminance(...base)),valueY=luminance(...color),rawGain=Math.max(.003,valueY/baseY);
  const gain=clamp(rawGain,.10,2.8);
  // A common luminance response carries the volume. Restrained chromatic
  // ratios retain the ramp's warm/cool character without tearing neighboring
  // desaturated and colored fragments apart.
  return [0,1,2].map(channel=>gain*(.78+.22*clamp(color[channel]/Math.max(.002,base[channel])/rawGain,.35,2.2))).concat(gain) as LightRatio;
}

function paint(map:PortraitMap,study:Study,ramps:Ramp[]):HTMLCanvasElement {
  const strength=clamp(study.light.strength),key=getLightVector(study.light);
  const cacheKey=JSON.stringify([map.width,map.height,ramps,study.shading,study.shadowStyle,study.values,{...study.light,...(strength===0?{direction:0,elevation:45}:{})}]);
  const known=rendered.get(cacheKey);if(known)return known;
  const canvas=document.createElement('canvas');canvas.width=map.width;canvas.height=map.height;
  const ctx=canvas.getContext('2d')!;const pixels=ctx.createImageData(map.width,map.height),output=pixels.data;
  const materials=Array.from({length:4},(_,i)=>ramps[i]||ramps[0]||fallback);
  const bases=materials.map(ramp=>parse(ramp.base).map(channel=>linearBytes[channel]) as RGB);
  const recolor=bases.map((base,id)=>base.map((channel,c)=>channel/anchorLinear[id][c]) as RGB);
  // At the original anchors, a disabled key reconstructs the original drawing
  // exactly, independent of material-label uncertainty or source direction.
  const originalColors=materials.every((ramp,id)=>ramp.base.toUpperCase()===anchors[id]);
  const sourceExact=originalColors&&strength===0;
  const tables=materials.map((ramp,id)=>Array.from({length:257},(_,i):LightRatio=>{
    if(strength===0||i===128)return [1,1,1,1];
    const value=parse(sampleRamp(ramp,i/256,study.shading,study.shadowStyle)).map(channel=>linearBytes[channel]) as RGB;
    return lightingRatio(value,bases[id]);
  }));
  const reflected=materials.map((ramp,id)=>lightingRatio(parse(ramp.reflected).map(channel=>linearBytes[channel]) as RGB,bases[id]));
  const bounce=clamp(study.light.bounce),castScale=map.height*.011;
  const shiftX=strength>0?-key.x/(key.z+.48)*castScale:0,shiftY=strength>0?-key.y/(key.z+.48)*castScale:0;
  const {width,height,source,normals,weights}=map;
  for(let index=0;index<width*height;index++){
    const p=index*4;if(source[p+3]===0)continue;const n=index*3;
    if(sourceExact&&!study.values){output[p]=source[p];output[p+1]=source[p+1];output[p+2]=source[p+2];output[p+3]=source[p+3];continue;}
    const x=index%width,y=Math.floor(index/width),u=(x+.5)/width,v=(y+.5)/height;
    const nx=normals[n]/127,ny=normals[n+1]/127,nz=normals[n+2]/127,length=Math.hypot(nx,ny,nz)||1;
    const diffuse=strength===0?.5:Math.max(0,(nx*key.x+ny*key.y+nz*key.z)/length);
    // Canonical shadeValue response, with its shared vector outside the loop.
    let response=.5+(diffuse-.5)*strength;
    if(strength>0&&weights[p]>.35*255){
      let cast=0;
      if(elliptical(u,v,face)<1.12){
        const sx=Math.round(x-shiftX),sy=Math.round(y-shiftY);
        if(sx>=0&&sx<width&&sy>=0&&sy<height)cast=weights[(sy*width+sx)*4+1]/255*.48;
        const noseX=nose.x+shiftX/width*.9,noseY=nose.y+shiftY/height*.9;
        if(Math.abs(key.x)>.2&&((u-noseX)/.009)**2+((v-noseY)/.025)**2<1)cast=Math.max(cast,.20*Math.abs(key.x));
      }else if(v>chin.y&&v<chin.y+.055&&Math.abs(u-chin.x-shiftX/width)<.06)cast=.24*clamp((-key.y+.1)/.8);
      response*=1-cast*strength*.56;
    }
    const responseIndex=Math.round(clamp(response)*256);
    const zone=v>.38?2:elliptical(u,v,face)<1.15?0:1;
    const neutralGain=tables[zone][responseIndex][3];
    let total=0;for(let id=0;id<4;id++)total+=weights[p+id]/255;
    const normalization=total>1?1/total:1,neutralWeight=Math.max(0,1-total);
    let rr=neutralWeight*neutralGain,rg=rr,rb=rr;
    const reflectedAmount=strength>0&&diffuse<.32&&nz<.74?bounce*strength*(1-diffuse/.32)*clamp((.74-nz)/.6)*.34:0;
    for(let id=0;id<4;id++){
      const weight=weights[p+id]/255*normalization;if(weight===0)continue;
      const light=tables[id][responseIndex],reflect=reflected[id],base=recolor[id];
      rr+=weight*base[0]*(light[0]*(1-reflectedAmount)+reflect[0]*reflectedAmount);
      rg+=weight*base[1]*(light[1]*(1-reflectedAmount)+reflect[1]*reflectedAmount);
      rb+=weight*base[2]*(light[2]*(1-reflectedAmount)+reflect[2]*reflectedAmount);
    }
    let r=linearBytes[source[p]]*rr,g=linearBytes[source[p+1]]*rg,b=linearBytes[source[p+2]]*rb;
    // Continuous monotonic shoulder preserves highlight hue and fine detail.
    // It leaves the ordinary tonal range untouched and cannot create a band
    // when the source detail crosses 1.0 under a bright key or recoloring.
    const peak=Math.max(r,g,b);
    if(!sourceExact&&peak>.88){const target=.88+.12*(1-Math.exp(-(peak-.88)/.12)),factor=target/peak;r*=factor;g*=factor;b*=factor;}
    if(study.values){const gray=encoded(luminance(r,g,b));output[p]=output[p+1]=output[p+2]=gray;}
    else{output[p]=encoded(r);output[p+1]=encoded(g);output[p+2]=encoded(b);}
    output[p+3]=source[p+3];
  }
  ctx.putImageData(pixels,0,0);rendered.set(cacheKey,canvas);
  while(rendered.size>3)rendered.delete(rendered.keys().next().value!);
  return canvas;
}

/** Draw an original game-illustration study without replacing its linework
 * with vector shapes. Returns false while loading or after a recoverable error. */
export function drawPortrait(ctx:CanvasRenderingContext2D,study:Study,ramps:Ramp[],width:number,height:number,options?:{export?:boolean}):boolean {
  const map=mapFor(options?.export?Math.min(1800,Math.max(width,height)*1.5):820);
  if(!map){
    ctx.save();ctx.fillStyle=study.values?'#BDBDBD':'#BAC2BB';ctx.textAlign='center';ctx.font='14px system-ui, sans-serif';
    ctx.fillText(error?'The illustration could not be loaded.':'Loading illustration…',width/2,height/2);
    if(error){ctx.font='12px system-ui, sans-serif';ctx.fillText('Reload ArtLab to try again.',width/2,height/2+25);}
    ctx.restore();return false;
  }
  const art=paint(map,study,ramps),margin=options?.export?12:20;
  const scale=Math.min((width-margin*2)/art.width,(height-margin*2)/art.height)*1.25;
  const w=art.width*scale,h=art.height*scale;
  ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(art,(width-w)/2,margin,w,h);ctx.restore();
  return true;
}
