import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultStudy,defaultLight,lightingPresets,validateStudy,parseStudyJSON,serializeStudy,loadStudy,saveStudy,loadLibrary,saveLibrary,makeSavedPalette} from '../src/library.ts';

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
    (s:any)=>s.selected='missing',(s:any)=>s.name='x'.repeat(41),(s:any)=>s.theme='unknown'
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
