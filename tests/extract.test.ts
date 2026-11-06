import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractColors,extractImageColors} from '../src/extract.ts';
const pixels=(colors:number[][])=>new Uint8ClampedArray(colors.flat());
test('image color extraction finds dominant distinct colors deterministically',()=>{
  const samples=pixels([...Array(100).fill([240,30,40,255]),...Array(40).fill([20,90,220,255]),...Array(20).fill([245,220,80,255])]);
  const result=extractColors(samples,3);assert.deepEqual(result,['#F01E28','#145ADC','#F5DC50']);assert.deepEqual(extractColors(samples,3),result);
});
test('transparent pixels are ignored and near-identical colors do not fill duplicate slots',()=>{
  const samples=pixels([[255,0,255,0],[0,255,0,100],[100,150,180,255],[101,150,181,255],[100,150,180,255]]),result=extractColors(samples,8);
  assert.equal(result.length,1);assert.match(result[0],/^#[0-9A-F]{6}$/);assert.deepEqual(extractColors(pixels([[250,40,90,0]]),5),[]);
  assert.deepEqual(extractColors(pixels([[0,0,0,255],[255,255,255,255]]),2),['#000000','#FFFFFF']);
});
test('extraction clamps palette sizes and rejects incomplete pixels',()=>{
  assert.equal(extractColors(pixels([[255,0,0,255],[0,255,0,255]]),0).length,1);assert.throws(()=>extractColors(new Uint8ClampedArray(3),5),/RGBA/);
});
test('oversized PNG dimensions and unsupported vector images are rejected before decoding',async()=>{
  const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);new DataView(bytes.buffer).setUint32(16,100000);new DataView(bytes.buffer).setUint32(20,100000);
  await assert.rejects(()=>extractImageColors(new File([bytes],'bomb.png',{type:'image/png'}),5),/40 megapixels/);
  await assert.rejects(()=>extractImageColors(new File(['<svg/>'],'vector.svg',{type:'image/svg+xml'}),5),/raster image/);
  await assert.rejects(()=>extractImageColors(new File([],'empty.png',{type:'image/png'}),5),/20 MB/);
});
