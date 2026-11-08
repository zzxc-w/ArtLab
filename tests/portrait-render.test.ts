import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hexToRgb,mixLinear} from '../src/color.ts';
import {sampleReceiverCast,mixPortraitByte} from '../src/portrait-render-utils.ts';

test('coarse cast resampling does not create checkerboard holes by mixing other receiving surfaces',()=>{
 const values=new Uint8Array([255,0,0,255]),owners=new Uint8Array([2,1,3,2]);
 for(const x of [.1,.25,.5,.75,.9])for(const y of [.1,.25,.5,.75,.9]){
  assert.equal(sampleReceiverCast(values,owners,2,2,x,y,2),255,'A fully shadowed body remains shadowed between its own samples, regardless of unshadowed head/neck neighbors');
 }
 assert.equal(sampleReceiverCast(values,owners,2,2,1,0,2),null,'A position supported only by a different surface asks the caller for an exact cast instead of inventing a zero');
 assert.equal(sampleReceiverCast(values,owners,2,2,.5,.5,0),null,'Missing face samples require an exact face query');
 for(const hair of [1,4,5])assert.equal(sampleReceiverCast(values,owners,2,2,.5,.5,hair),0,'Hair form shading cannot acquire another receiver\'s cast');
});

test('receiver cast interpolation stays continuous within a receiving surface and preserves edge samples',()=>{
 const values=new Uint8Array([0,64,128,192]),owners=new Uint8Array(4).fill(2);
 assert.equal(sampleReceiverCast(values,owners,2,2,.25,.75,2),112);
 assert.equal(sampleReceiverCast(values,owners,2,2,0,0,2),0);
 assert.equal(sampleReceiverCast(values,owners,2,2,1,1,2),192);
 let previous=-1;
 for(let step=0;step<=16;step++){
  const value=sampleReceiverCast(values,owners,2,2,step/16,.5,2);assert.notEqual(value,null);assert.ok(value!>=previous,'A smooth cast ramp cannot alternate into grid-shaped islands');previous=value!;
 }
 const neckValues=new Uint8Array([32,255,255,64]),neckOwners=new Uint8Array([3,2,2,3]);
 assert.equal(sampleReceiverCast(neckValues,neckOwners,2,2,.5,.5,3),48,'Valid body samples are still excluded while interpolating the separate neck surface');
});

test('fast portrait byte blending preserves exact paint endpoints and agrees with linear-light color mixing',()=>{
 const channels=[0,1,10,32,64,127,192,239,254,255],weights=[0,1,8,16,32,48,64,80,96,112,128,160,192,224,240,254,255];
 const hex=(value:number)=>'#'+value.toString(16).padStart(2,'0').repeat(3);
 for(const a of channels)for(const b of channels)for(const weight of weights){
  const value=mixPortraitByte(a,b,weight),expected=hexToRgb(mixLinear(hex(a),hex(b),weight/255)).r;
  assert.ok(Number.isInteger(value)&&value>=0&&value<=255);assert.ok(Math.abs(value-expected)<=1,`${a}/${b} at ${weight}/255 remains within one sRGB code value`);
  if(weight===0)assert.equal(value,a);if(weight===255)assert.equal(value,b);if(a===b)assert.equal(value,a,'An unchanged base paint cannot drift when the shading treatment changes');
 }
 assert.ok(Math.abs(mixPortraitByte(0,255,128)-188)<=1,'Half white in linear light is visibly lighter than display-space middle gray');
});
