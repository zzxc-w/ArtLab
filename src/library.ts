import type { LightSettings, SavedPalette, Study, Swatch } from './types';

export const defaultLight:LightSettings={temperature:.25,strength:.5,shadow:.55,hueShift:8,saturation:1,bounce:.25,ambient:'#7895B8',direction:-35};
export const lightingPresets=[
  {id:'studio',name:'Soft studio',description:'Quiet neutral light. A clear place to begin.',light:{...defaultLight,temperature:.05,strength:.35,shadow:.48,hueShift:4,bounce:.18}},
  {id:'sunlight',name:'Sunlight',description:'Warm key light with a cool sky fill.',light:{...defaultLight,temperature:.48,strength:.62,shadow:.58,hueShift:10,bounce:.3,ambient:'#8AAED2',direction:-40}},
  {id:'moonlight',name:'Moonlight',description:'Cool blue light, deep shadows, restrained color.',light:{...defaultLight,temperature:-.8,strength:.35,shadow:.78,hueShift:-14,saturation:.82,bounce:.16,ambient:'#665E95',direction:35}},
  {id:'sunset',name:'Sunset',description:'Amber highlights and a violet reflected light.',light:{...defaultLight,temperature:.95,strength:.72,shadow:.68,hueShift:18,saturation:1.1,bounce:.38,ambient:'#9678B0',direction:-65}},
  {id:'overcast',name:'Overcast',description:'Soft, cool light with a narrow value range.',light:{...defaultLight,temperature:-.2,strength:.24,shadow:.34,hueShift:3,saturation:.92,bounce:.2,ambient:'#A8B8C8',direction:-25}}
];

export function createDefaultStudy():Study {
  return {name:'Untitled color study',colors:[
    {id:'skin',name:'Skin',hex:'#EFB898',locked:false},
    {id:'hair',name:'Hair',hex:'#64577E',locked:false},
    {id:'cloth',name:'Cloth',hex:'#6E9A9F',locked:false},
    {id:'accent',name:'Accent',hex:'#DCAC62',locked:false},
    {id:'backdrop',name:'Backdrop',hex:'#394957',locked:false}
  ],selected:'skin',light:{...defaultLight},shading:'cel',preview:'portrait',values:false,theme:'system'};
}
const studyKey='artlab.study.v2',libraryKey='artlab.library.v2';
const ranges:Record<Exclude<keyof LightSettings,'ambient'>,[number,number]>={temperature:[-1,1],strength:[0,1],shadow:[0,1],hueShift:[-45,45],saturation:[0,1.5],bounce:[0,1],direction:[-180,180]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9_-]{1,64}$/i.test(v);
const validName=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=40&&!/[\u0000-\u001f\u007f]/.test(v);
const hex=(v:unknown):string|null=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toUpperCase():null;
function validLight(v:unknown):v is LightSettings {
  return object(v)&&!!hex(v.ambient)&&Object.entries(ranges).every(([key,[min,max]])=>typeof v[key]==='number'&&Number.isFinite(v[key])&&(v[key] as number)>=min&&(v[key] as number)<=max);
}
function validStudy(v:unknown):v is Study {
  if(!object(v)||!validName(v.name)||!Array.isArray(v.colors)||v.colors.length<1||v.colors.length>8||!validLight(v.light))return false;
  if(!['cel','smooth'].includes(String(v.shading))||!['portrait','spheres'].includes(String(v.preview))||!['system','light','dark'].includes(String(v.theme))||typeof v.values!=='boolean')return false;
  const ids=new Set<string>();
  for(const color of v.colors){if(!object(color)||!validId(color.id)||ids.has(color.id)||!validName(color.name)||!hex(color.hex)||typeof color.locked!=='boolean')return false;ids.add(color.id);}
  return typeof v.selected==='string'&&ids.has(v.selected);
}
function sanitizeStudy(v:Study):Study {
  return {name:v.name.trim(),colors:v.colors.map(c=>({id:c.id,name:c.name.trim(),hex:hex(c.hex)!,locked:c.locked})),selected:v.selected,light:{...Object.fromEntries(Object.keys(ranges).map(k=>[k,v.light[k as keyof LightSettings]])),ambient:hex(v.light.ambient)!} as LightSettings,shading:v.shading,preview:v.preview,values:v.values,theme:v.theme};
}
/** Repair local preferences field by field; strict file imports use parseStudyJSON. */
export function validateStudy(value:unknown):Study {
  const result=createDefaultStudy();if(!object(value))return result;
  if(validName(value.name))result.name=value.name.trim();
  if(Array.isArray(value.colors)){
    const ids=new Set<string>(),colors:Swatch[]=[];
    for(const candidate of value.colors.slice(0,8)){
      if(!object(candidate)||!hex(candidate.hex))continue;
      let id=validId(candidate.id)?candidate.id:`color-${colors.length+1}`;
      let suffix=1;while(ids.has(id))id=`color-${colors.length+1}-${suffix++}`;
      ids.add(id);colors.push({id,name:validName(candidate.name)?candidate.name.trim():`Color ${colors.length+1}`,hex:hex(candidate.hex)!,locked:candidate.locked===true});
    }
    if(colors.length)result.colors=colors;
  }
  if(typeof value.selected==='string'&&result.colors.some(c=>c.id===value.selected))result.selected=value.selected;else result.selected=result.colors[0].id;
  if(object(value.light)){
    for(const [key,[min,max]] of Object.entries(ranges)){const v=value.light[key];if(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max)Object.assign(result.light,{[key]:v});}
    if(hex(value.light.ambient))result.light.ambient=hex(value.light.ambient)!;
  }
  if(value.shading==='cel'||value.shading==='smooth')result.shading=value.shading;
  if(value.preview==='portrait'||value.preview==='spheres')result.preview=value.preview;
  if(value.theme==='system'||value.theme==='light'||value.theme==='dark')result.theme=value.theme;
  if(typeof value.values==='boolean')result.values=value.values;
  return result;
}
export function serializeStudy(study:Study):string {
  if(!validStudy(study))throw new Error('This palette contains invalid values. Check the colors and lighting controls.');
  return JSON.stringify({format:'artlab',version:2,study:sanitizeStudy(study)},null,2);
}
export function parseStudyJSON(text:string):Study {
  if(text.length>200_000)throw new Error('Palette metadata is too large. Use an ArtLab JSON file under 200 KB.');
  let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('This is not valid JSON. Choose an ArtLab palette file.');}
  if(!object(value)||value.format!=='artlab'||value.version!==2||!validStudy(value.study))throw new Error('This is not a valid ArtLab 2 palette. It needs 1–8 colors and valid lighting settings.');
  return sanitizeStudy(value.study);
}
export function loadStudy():Study {
  try{return validateStudy(JSON.parse(localStorage.getItem(studyKey)||'null'));}catch{return createDefaultStudy();}
}
export function saveStudy(study:Study):void {
  if(!validStudy(study))throw new Error('Check the palette values before saving. Export a valid JSON copy to keep your work.');
  try{localStorage.setItem(studyKey,JSON.stringify(sanitizeStudy(study)));}catch{throw new Error('This browser could not save the study. Export JSON to keep a copy.');}
}
export function makeSavedPalette(study:Study):SavedPalette {
  const id=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`palette-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  return {id,name:study.name.trim(),createdAt:new Date().toISOString(),study:parseStudyJSON(serializeStudy(study))};
}
export function loadLibrary():SavedPalette[] {
  try{
    const values:unknown=JSON.parse(localStorage.getItem(libraryKey)||'[]');if(!Array.isArray(values))return [];
    const ids=new Set<string>();return values.slice(0,30).filter((v):v is SavedPalette=>object(v)&&validId(v.id)&&!ids.has(v.id)&&!!ids.add(v.id)&&validName(v.name)&&typeof v.createdAt==='string'&&Number.isFinite(Date.parse(v.createdAt))&&validStudy(v.study)).map(v=>({id:v.id,name:v.name.trim(),createdAt:v.createdAt,study:sanitizeStudy(v.study)}));
  }catch{return [];}
}
export function saveLibrary(library:SavedPalette[]):void {
  if(library.length>30)throw new Error('Your library holds 30 palettes. Export or remove one before saving another.');
  const ids=new Set<string>();
  const entries=library.map(entry=>{
    if(!validId(entry.id)||ids.has(entry.id)||!validName(entry.name)||!Number.isFinite(Date.parse(entry.createdAt)))throw new Error('A library entry is invalid. Export a copy of your current palette.');
    ids.add(entry.id);return {id:entry.id,name:entry.name.trim(),createdAt:entry.createdAt,study:parseStudyJSON(serializeStudy(entry.study))};
  });
  try{localStorage.setItem(libraryKey,JSON.stringify(entries));}catch{throw new Error('The palette library could not be saved. Browser storage may be full or disabled; export JSON instead.');}
}
