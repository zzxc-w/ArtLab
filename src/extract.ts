import { rgbToHex, rgbToOklab } from './color';

interface Sample { r:number;g:number;b:number;weight:number;L:number;a:number;labB:number }
const distance=(a:{L:number;a:number;labB:number},b:{L:number;a:number;labB:number})=>(a.L-b.L)**2+(a.a-b.a)**2+(a.labB-b.labB)**2;
/** Deterministic dominant-color clustering in perceptual OKLab space. */
export function extractColors(pixels:Uint8ClampedArray,count:number):string[] {
  if(pixels.length%4)throw new Error('Image pixels must contain complete RGBA values.');
  const target=Number.isFinite(count)?Math.max(1,Math.min(8,Math.round(count))):5;
  const bins=new Map<number,{r:number;g:number;b:number;weight:number}>();
  for(let i=0;i<pixels.length;i+=4){
    const alpha=pixels[i+3]/255;if(alpha<.5)continue;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2],key=(r>>4)*256+(g>>4)*16+(b>>4),bin=bins.get(key)||{r:0,g:0,b:0,weight:0};
    bin.r+=r*alpha;bin.g+=g*alpha;bin.b+=b*alpha;bin.weight+=alpha;bins.set(key,bin);
  }
  const samples:Sample[]=[...bins.entries()].sort((a,b)=>a[0]-b[0]).map(([,bin])=>{
    const r=bin.r/bin.weight,g=bin.g/bin.weight,b=bin.b/bin.weight,lab=rgbToOklab({r,g,b});return {r,g,b,weight:bin.weight,L:lab.L,a:lab.a,labB:lab.b};
  });
  if(!samples.length)return [];
  const ranked=[...samples].sort((a,b)=>b.weight-a.weight),centers:Sample[]=[{...ranked[0]}];
  while(centers.length<Math.min(target,samples.length)){
    let next:Sample|undefined,best=0;
    for(const sample of samples){const score=Math.min(...centers.map(center=>distance(sample,center)))*Math.sqrt(sample.weight);if(score>best){best=score;next=sample;}}
    if(!next||best<1e-9)break;centers.push({...next});
  }
  for(let iteration=0;iteration<12;iteration++){
    const sums=centers.map(()=>({L:0,a:0,labB:0,r:0,g:0,b:0,weight:0}));
    for(const sample of samples){
      let nearest=0,best=Infinity;centers.forEach((center,i)=>{const d=distance(sample,center);if(d<best){best=d;nearest=i;}});
      const sum=sums[nearest];sum.weight+=sample.weight;sum.L+=sample.L*sample.weight;sum.a+=sample.a*sample.weight;sum.labB+=sample.labB*sample.weight;sum.r+=sample.r*sample.weight;sum.g+=sample.g*sample.weight;sum.b+=sample.b*sample.weight;
    }
    let movement=0;
    for(let i=0;i<centers.length;i++)if(sums[i].weight){const sum=sums[i],next={...sum,L:sum.L/sum.weight,a:sum.a/sum.weight,labB:sum.labB/sum.weight,r:sum.r/sum.weight,g:sum.g/sum.weight,b:sum.b/sum.weight};movement+=distance(centers[i],next);centers[i]=next;}
    if(movement<1e-10)break;
  }
  const result:Sample[]=[];
  for(const center of centers.sort((a,b)=>b.weight-a.weight))if(!result.some(other=>distance(center,other)<.035**2))result.push(center);
  return result.map(c=>rgbToHex({r:c.r,g:c.g,b:c.b}));
}

const imageLimit=20*1024*1024,pixelLimit=40_000_000;
function imageDimensions(bytes:Uint8Array):{width:number;height:number}|null {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return {width:view.getUint32(16),height:view.getUint32(20)};
  if(bytes.length>=10&&String.fromCharCode(...bytes.subarray(0,3))==='GIF')return {width:view.getUint16(6,true),height:view.getUint16(8,true)};
  if(bytes.length>=30&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP'){
    const kind=String.fromCharCode(...bytes.subarray(12,16));
    if(kind==='VP8X')return {width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
    if(kind==='VP8L'&&bytes[20]===47)return {width:1+((bytes[21]|bytes[22]<<8)&16383),height:1+((bytes[22]>>6|bytes[23]<<2|bytes[24]<<10)&16383)};
    if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return {width:view.getUint16(26,true)&16383,height:view.getUint16(28,true)&16383};
  }
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    for(let at=2;at+8<bytes.length;){
      if(bytes[at]!==255){at++;continue;}const marker=bytes[at+1];if(marker===216||marker===217||marker===1){at+=2;continue;}if(marker===218)break;
      const length=view.getUint16(at+2);if(length<2||at+2+length>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:view.getUint16(at+7),height:view.getUint16(at+5)};at+=2+length;
    }
  }
  return null;
}
export async function extractImageColors(file:File,count:number):Promise<{colors:string[];preview:string}> {
  if(!file.size||file.size>imageLimit)throw new Error('Choose an image smaller than 20 MB.');
  if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name))throw new Error('Choose a PNG, JPEG, WebP, or another raster image.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(/<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0,4096))))throw new Error('Choose a PNG, JPEG, WebP, or another raster image.');
  const dimensions=imageDimensions(bytes);
  if(dimensions&&(!dimensions.width||!dimensions.height||dimensions.width*dimensions.height>pixelLimit))throw new Error('This image is too large to decode safely. Resize it below 40 megapixels.');
  const source=URL.createObjectURL(file),image=new Image();
  try{
    image.src=source;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>pixelLimit)throw new Error('Resize this image below 40 megapixels before extracting colors.');
    const scale=Math.min(1,192/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image extraction is unavailable in this browser.');context.drawImage(image,0,0,canvas.width,canvas.height);
    const colors=extractColors(context.getImageData(0,0,canvas.width,canvas.height).data,count);if(!colors.length)throw new Error('This image has no opaque colors to extract.');
    return {colors,preview:canvas.toDataURL('image/png')};
  }catch(error){if(error instanceof Error&&/Resize|unavailable|opaque/.test(error.message))throw error;throw new Error('This image could not be read. Try exporting it as PNG or JPEG.');}
  finally{URL.revokeObjectURL(source);image.src='';}
}
