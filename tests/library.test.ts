import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultStudy,defaultLight,lightingPresets,validateStudy,parseStudyJSON,serializeStudy,loadStudy,saveStudy,loadLibrary,saveLibrary,makeSavedPalette} from '../src/library.ts';
import {embedPNGMetadata,readPaletteFile} from '../src/io.ts';
import {deflateSync} from 'node:zlib';

const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete (globalThis as Record<string,unknown>).localStorage;});
function memory(){const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)}});return data;}
test('ArtLab JSON round-trips a complete editable study without unrelated fields',()=>{
  const study=createDefaultStudy();study.name='夕焼け <study>';study.colors[1].locked=true;study.light={...defaultLight,temperature:-1,hueShift:-45};study.preview='spheres';study.theme='light';
  assert.deepEqual(parseStudyJSON(serializeStudy(study)),study);
  const document=JSON.parse(serializeStudy(study));assert.equal(document.format,'artlab');assert.equal(document.version,2);assert.deepEqual(Object.keys(document).sort(),['format','study','version']);
  for(const preset of lightingPresets)assert.doesNotThrow(()=>serializeStudy({...study,light:preset.light}));
});
test('strict imports reject malformed JSON, unsupported schemas and unsafe study values',()=>{
  assert.throws(()=>parseStudyJSON('{oops'),/valid JSON/);assert.throws(()=>parseStudyJSON('{}'),/ArtLab 2/);assert.throws(()=>parseStudyJSON(' '.repeat(200001)),/too large/);
  for(const change of [
    (s:any)=>s.colors=[],(s:any)=>s.colors=Array(9).fill(s.colors[0]),(s:any)=>s.colors[1].id=s.colors[0].id,
    (s:any)=>s.light.shadow=2,(s:any)=>s.light.ambient='javascript:test',(s:any)=>s.colors[0].locked='true',
    (s:any)=>s.selected='missing',(s:any)=>s.name='x'.repeat(41),(s:any)=>s.theme='unknown',
    (s:any)=>s.light.elevation=9,(s:any)=>s.light.elevation=81,(s:any)=>s.light.elevation='45',
    (s:any)=>s.light.elevation=null,(s:any)=>s.shadowStyle='unknown',(s:any)=>s.shadowStyle=null
  ]){const study=createDefaultStudy();change(study);assert.throws(()=>parseStudyJSON(JSON.stringify({format:'artlab',version:2,study})),/ArtLab 2/);}
});
test('stored studies repair corrupt controls and colors into a valid usable study',()=>{
  const study=validateStudy({colors:[{id:'same',name:'First',hex:'#aabbcc',locked:true},{id:'same',name:'Second',hex:'#123456'},{id:'invalid id',hex:'no'}],selected:'gone',light:{shadow:NaN,bounce:2,temperature:-.4},values:'yes',theme:'dark'});
  assert.equal(study.colors.length,2);assert.equal(new Set(study.colors.map(c=>c.id)).size,2);assert.equal(study.selected,study.colors[0].id);assert.equal(study.colors[0].hex,'#AABBCC');assert.equal(study.light.shadow,defaultLight.shadow);assert.equal(study.light.temperature,-.4);assert.equal(study.values,false);assert.equal(study.theme,'dark');assert.doesNotThrow(()=>serializeStudy(study));
  assert.deepEqual(validateStudy(null),createDefaultStudy());
});
test('local study and palette library stay independent of FoldLight and clone saved entries',()=>{
  const data=memory();data.set('foldlight.study.v2','keep me');const study=createDefaultStudy();study.name='My colors';saveStudy(study);assert.deepEqual(loadStudy(),study);
  const saved=makeSavedPalette(study);saveLibrary([saved]);study.colors[0].hex='#000000';assert.notEqual(saved.study.colors[0].hex,study.colors[0].hex);assert.deepEqual(loadLibrary(),[saved]);assert.equal(data.get('foldlight.study.v2'),'keep me');
  assert.throws(()=>saveLibrary(Array(31).fill(saved)),/30 palettes/);assert.throws(()=>saveLibrary([saved,saved]),/invalid/);
  data.set('artlab.study.v2','{broken');data.set('artlab.library.v2','{broken');assert.deepEqual(loadStudy(),createDefaultStudy());assert.deepEqual(loadLibrary(),[]);
});
test('storage failures keep startup usable and explain how to retain a palette',()=>{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage disabled');}});
  assert.deepEqual(loadStudy(),createDefaultStudy());assert.deepEqual(loadLibrary(),[]);assert.throws(()=>saveStudy(createDefaultStudy()),/Export JSON/);assert.throws(()=>saveLibrary([]),/export JSON/i);
});

function legacyStudy(shading:'cel'|'smooth'='cel'){
  const study:any=createDefaultStudy();study.name='Legacy palette';study.shading=shading;study.colors[1].locked=true;
  delete study.light.elevation;delete study.shadowStyle;return study;
}
test('pre-update version 2 studies migrate added light depth and shadow style without losing edits',()=>{
  for(const shading of ['cel','smooth'] as const){
    const old=legacyStudy(shading),restored=parseStudyJSON(JSON.stringify({format:'artlab',version:2,study:old}));
    assert.equal(restored.light.elevation,45);assert.equal(restored.shadowStyle,shading==='smooth'?'soft':'anime');
    assert.deepEqual(restored.colors,old.colors);assert.equal(restored.name,old.name);assert.equal(restored.shading,shading);
    const {elevation,...previousLight}=restored.light;assert.deepEqual(previousLight,old.light);
    assert.deepEqual(parseStudyJSON(serializeStudy(restored)),restored);
  }
});
test('legacy local study and saved library entries migrate independently of FoldLight',()=>{
  const data=memory(),old=legacyStudy('smooth');data.set('artlab.study.v2',JSON.stringify(old));
  data.set('artlab.library.v2',JSON.stringify([{id:'legacy',name:'Saved before update',createdAt:'2026-11-06T00:00:00.000Z',study:old}]));
  data.set('foldlight.study.v2','keep me');
  const current=loadStudy(),library=loadLibrary();assert.equal(current.shadowStyle,'soft');assert.equal(current.light.elevation,45);
  assert.equal(library.length,1);assert.equal(library[0].study.shadowStyle,'soft');assert.equal(library[0].study.light.elevation,45);
  assert.deepEqual(library[0].study.colors,old.colors);assert.equal(data.get('foldlight.study.v2'),'keep me');
  saveStudy(current);saveLibrary(library);assert.deepEqual(loadLibrary(),library);
});
test('invalid new stored fields repair to defaults while strict imports reject them',()=>{
  const old=legacyStudy('smooth');old.light.elevation=1000;old.shadowStyle='bad';
  const repaired=validateStudy(old);assert.equal(repaired.light.elevation,45);assert.equal(repaired.shadowStyle,'soft');
  assert.throws(()=>parseStudyJSON(JSON.stringify({format:'artlab',version:2,study:old})),/ArtLab 2/);
  for(const elevation of [10,45,80])for(const shadowStyle of ['anime','soft','graphic','luminous'] as const){
    const study=createDefaultStudy();study.light.elevation=elevation;study.shadowStyle=shadowStyle;
    assert.deepEqual(parseStudyJSON(serializeStudy(study)),study);
  }
});
test('original ArtLab palette PNG metadata remains importable after the additive schema update',async()=>{
  const crc=(bytes:Uint8Array)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
  const chunk=(name:string,data:Uint8Array)=>{const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);bytes.write(name,4);bytes.set(data,8);bytes.writeUInt32BE(crc(bytes.subarray(4,-4)),bytes.length-4);return bytes;};
  const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  const png=new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]));
  const old=legacyStudy(),json=JSON.stringify({format:'artlab',version:2,study:old}),embedded=embedPNGMetadata(png,json);
  const restored=await readPaletteFile(new File([embedded],'old-palette.png',{type:'image/png'}));
  assert.ok(restored);assert.equal(restored.light.elevation,45);assert.equal(restored.shadowStyle,'anime');assert.deepEqual(restored.colors,old.colors);
});
