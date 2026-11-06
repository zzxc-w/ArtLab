import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {embedPNGMetadata,readPNGMetadata,readPaletteFile} from '../src/io.ts';
import {createDefaultStudy,serializeStudy,parseStudyJSON} from '../src/library.ts';
const crc=(bytes:Uint8Array)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
const chunk=(name:string,data:Uint8Array)=>{const output=Buffer.alloc(data.length+12);output.writeUInt32BE(data.length);output.write(name,4);output.set(data,8);output.writeUInt32BE(crc(output.subarray(4,-4)),output.length-4);return output;};
const png=()=>{const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]));};
test('PNG palette metadata round-trips Unicode studies without changing image data',()=>{
  const study=createDefaultStudy();study.name='夕焼け 🌅';study.colors[0].locked=true;const original=png(),embedded=embedPNGMetadata(original,serializeStudy(study)),metadata=readPNGMetadata(embedded);
  assert.ok(metadata);assert.deepEqual(parseStudyJSON(metadata),study);assert.equal(readPNGMetadata(original),null);assert.equal(readPNGMetadata(embedPNGMetadata(embedded,serializeStudy(study))),metadata);
  assert.ok(Buffer.from(embedded).includes(Buffer.from('IDAT')));assert.deepEqual(original,png(),'Input bytes are not mutated');
});
test('invalid and corrupted PNGs cannot smuggle palette metadata',()=>{
  assert.throws(()=>readPNGMetadata(new Uint8Array(3)),/invalid/);const corrupt=png();corrupt[20]^=1;assert.throws(()=>readPNGMetadata(corrupt),/corrupted/);assert.throws(()=>readPNGMetadata(png().slice(0,-2)),/incomplete/);assert.throws(()=>embedPNGMetadata(png(),'{}'),/ArtLab 2/);
});
test('palette files restore exact JSON and ArtLab PNGs while generic images route to extraction',async()=>{
  const study=createDefaultStudy(),json=serializeStudy(study),encoded=embedPNGMetadata(png(),json);
  assert.deepEqual(await readPaletteFile(new File([json],'palette.json',{type:'application/json'})),study);
  assert.deepEqual(await readPaletteFile(new File([encoded],'palette.png',{type:'image/png'})),study);
  assert.equal(await readPaletteFile(new File([png()],'image.png',{type:'image/png'})),null);assert.equal(await readPaletteFile(new File(['jpeg'],'image.jpg',{type:'image/jpeg'})),null);
  await assert.rejects(()=>readPaletteFile(new File(['{}'],'bad.json')),/ArtLab 2/);
});
