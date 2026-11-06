import type { Ramp, Study } from './types';
import { readableInk } from './color';
import { parseStudyJSON, serializeStudy } from './library';

const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
const maxFile=20*1024*1024,maxMetadata=200_000,encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const crc32=(data:Uint8Array)=>{let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
const concat=(parts:Uint8Array[])=>{const result=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;};
function chunk(type:string,data:Uint8Array):Uint8Array {
  const result=new Uint8Array(12+data.length),view=new DataView(result.buffer);view.setUint32(0,data.length);result.set(encoder.encode(type),4);result.set(data,8);view.setUint32(8+data.length,crc32(result.subarray(4,8+data.length)));return result;
}
interface Chunk {type:string;data:Uint8Array;bytes:Uint8Array}
function chunks(png:Uint8Array):Chunk[] {
  if(png.length>maxFile||png.length<33||!signature.every((byte,i)=>png[i]===byte))throw new Error('This PNG is invalid or larger than 20 MB.');
  const result:Chunk[]=[],view=new DataView(png.buffer,png.byteOffset,png.byteLength);let at=8,ended=false;
  while(at+12<=png.length){
    const length=view.getUint32(at);if(at+12+length>png.length)throw new Error('This PNG is incomplete. Choose the original image.');
    const type=String.fromCharCode(...png.subarray(at+4,at+8));if(!/^[A-Za-z]{4}$/.test(type))throw new Error('This PNG has an invalid chunk.');
    const data=png.subarray(at+8,at+8+length),expected=view.getUint32(at+8+length);
    if(crc32(png.subarray(at+4,at+8+length))!==expected)throw new Error('This PNG is corrupted. Try exporting it again.');
    if(!result.length&&(type!=='IHDR'||length!==13))throw new Error('This PNG has an invalid header.');
    if(result.length&&type==='IHDR')throw new Error('This PNG has duplicate headers.');
    result.push({type,data,bytes:png.subarray(at,at+length+12)});at+=length+12;
    if(type==='IEND'){if(length)throw new Error('This PNG has an invalid end marker.');ended=true;break;}
  }
  if(!ended||at!==png.length)throw new Error('This PNG is incomplete or has unexpected trailing data.');return result;
}
const isArtLab=(entry:Chunk)=>entry.type==='tEXt'&&entry.data.length>=7&&String.fromCharCode(...entry.data.subarray(0,7))==='ArtLab\0';
/** Insert ASCII-escaped UTF-8 JSON into a standard PNG tEXt chunk. */
export function embedPNGMetadata(png:Uint8Array,json:string):Uint8Array {
  parseStudyJSON(json);
  const escaped=json.replace(/[^\x00-\x7f]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`),payload=encoder.encode('ArtLab\0'+escaped);
  if(payload.length>maxMetadata)throw new Error('Palette metadata is too large to embed.');
  const entries=chunks(png),parts=[signature,entries[0].bytes,chunk('tEXt',payload),...entries.slice(1).filter(entry=>!isArtLab(entry)).map(entry=>entry.bytes)];return concat(parts);
}
export function readPNGMetadata(png:Uint8Array):string|null {
  let json:string|null=null;
  for(const entry of chunks(png))if(isArtLab(entry)){
    if(json!==null||entry.data.length>maxMetadata)throw new Error('This PNG contains invalid or excessive ArtLab metadata.');
    try{json=decoder.decode(entry.data.subarray(7));}catch{throw new Error('The palette metadata could not be decoded.');}
  }
  return json;
}
export async function readPaletteFile(file:File):Promise<Study|null> {
  if(!file.size||file.size>maxFile)throw new Error('Choose a palette or image smaller than 20 MB.');
  if(/\.json$/i.test(file.name)||file.type==='application/json'){
    if(file.size>maxMetadata)throw new Error('ArtLab JSON palettes must be smaller than 200 KB.');return parseStudyJSON(await file.text());
  }
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(signature.every((byte,i)=>bytes[i]===byte)){const json=readPNGMetadata(bytes);return json===null?null:parseStudyJSON(json);}
  return null;
}

export async function exportPalettePNG(study:Study,ramps:Ramp[]):Promise<Blob> {
  const metadata=serializeStudy(study);study=parseStudyJSON(metadata);ramps=ramps.map(ramp=>({...ramp}));
  if(ramps.length!==study.colors.length)throw new Error('The palette preview is not ready. Try exporting again.');
  const canvas=document.createElement('canvas'),width=1460,header=174,row=126,padding=52,nameWidth=210,cellWidth=(width-padding*2-nameWidth)/5;
  canvas.width=width;canvas.height=header+row*study.colors.length+72;
  const context=canvas.getContext('2d');if(!context)throw new Error('PNG export is unavailable in this browser.');
  context.fillStyle='#1D2123';context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle='#D9BF8B';context.font='600 28px "Segoe UI", Arial, sans-serif';context.fillText('ArtLab',padding,56);
  context.fillStyle='#929D96';context.font='13px "Segoe UI", Arial, sans-serif';context.fillText('COLOR & LIGHT STUDIO  /  2.0',padding+117,54);
  context.fillStyle='#ECEDE6';context.font='500 29px "Segoe UI", Arial, sans-serif';context.fillText(study.name,padding,108,width-padding*2);
  const roles:(keyof Ramp)[]=['base','highlight','halftone','shadow','reflected'];
  const labels=['BASE','HIGHLIGHT','HALFTONE','SHADOW','REFLECTED LIGHT'];
  context.font='600 11px "Segoe UI", Arial, sans-serif';context.fillStyle='#93A096';context.fillText('MATERIAL',padding,154);
  labels.forEach((label,i)=>context.fillText(label,padding+nameWidth+cellWidth*i+12,154));
  study.colors.forEach((color,index)=>{
    const y=header+row*index,ramp=ramps[index];context.strokeStyle='#39413F';context.beginPath();context.moveTo(padding,y-7);context.lineTo(width-padding,y-7);context.stroke();
    context.fillStyle=color.hex;context.fillRect(padding,y+20,13,13);context.fillStyle='#DCE0D7';context.font='500 18px "Segoe UI", Arial, sans-serif';context.fillText(color.name,padding+25,y+33,nameWidth-38);
    context.font='12px "Segoe UI", Arial, sans-serif';context.fillStyle='#839187';context.fillText(color.locked?'LOCKED BASE':'BASE COLOR',padding+25,y+58);
    roles.forEach((role,i)=>{const x=padding+nameWidth+cellWidth*i+5,hex=ramp[role];if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error('A palette color is invalid.');context.fillStyle=hex;context.fillRect(x,y+6,cellWidth-10,row-25);context.fillStyle=readableInk(hex);context.font='500 15px "Segoe UI", Arial, sans-serif';context.fillText(hex.toUpperCase(),x+14,y+row-41);});
  });
  context.fillStyle='#8B988E';context.font='12px "Segoe UI", Arial, sans-serif';context.fillText('ArtLab 2.0  ·  Editable palette data included. Import this PNG in ArtLab to restore the study.',padding,canvas.height-28);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('This browser could not export the PNG.')),'image/png'));
  const bytes=embedPNGMetadata(new Uint8Array(await blob.arrayBuffer()),metadata);
  return new Blob([Uint8Array.from(bytes).buffer],{type:'image/png'});
}
