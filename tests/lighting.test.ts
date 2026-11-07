import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getLightVector,shadeValue,sampleRamp,screenToLightDirection,lightHandlePosition} from '../src/lighting.ts';
import type {LightSettings,Ramp,ShadowStyle} from '../src/types.ts';

const light={direction:-35,elevation:45,strength:1} as LightSettings;
const ramp:Ramp={base:'#BCBCBC',shadow:'#000000',halftone:'#DFDFDF',highlight:'#FFFFFF',reflected:'#7184AD'};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} ≈ ${b}`);

test('source screen angles and front depth produce a normalized consistent light vector',()=>{
  const top=getLightVector({...light,direction:0}),right=getLightVector({...light,direction:90}),left=getLightVector({...light,direction:-90}),bottom=getLightVector({...light,direction:180});
  near(top.x,0);assert.ok(top.y<0);assert.ok(right.x>0);near(right.y,0);assert.ok(left.x<0);assert.ok(bottom.y>0);
  for(const direction of [-180,-90,-35,0,90,180,5000])for(const elevation of [10,45,80]){
    const key=getLightVector({...light,direction,elevation});near(Math.hypot(key.x,key.y,key.z),1);assert.ok(key.z>0);
  }
  assert.ok(getLightVector({...light,elevation:80}).z>getLightVector({...light,elevation:10}).z);
  assert.deepEqual(getLightVector({...light,elevation:undefined} as unknown as LightSettings),getLightVector({...light,elevation:45}));
});

test('normal-facing lighting follows the visible source and key strength removes unsupported shadows',()=>{
  const right={...light,direction:90},left={...light,direction:-90},nr={x:.8,y:0,z:.6},nl={x:-.8,y:0,z:.6};
  assert.ok(shadeValue(nr,right)>shadeValue(nl,right));assert.ok(shadeValue(nl,left)>shadeValue(nr,left));near(shadeValue(nr,right),shadeValue(nl,left));
  near(shadeValue({x:0,y:0,z:1},{...light,elevation:45}),Math.SQRT1_2);
  near(shadeValue({x:0,y:0,z:100},{...light,elevation:45}),Math.SQRT1_2);
  assert.equal(shadeValue({x:0,y:0,z:0},light),.5);
  for(const normal of [nr,nl,{x:0,y:0,z:1},{x:0,y:0,z:-1}]){
    assert.equal(shadeValue(normal,{...light,strength:0}),.5);
    for(const strength of [0,.5,1]){const value=shadeValue(normal,{...light,strength});assert.ok(Number.isFinite(value)&&value>=0&&value<=1);}
  }
});

test('all shadow styles preserve the exact base at zero key and sample only valid ramp colors',()=>{
  for(const style of ['anime','soft','graphic','luminous'] as ShadowStyle[])for(const mode of ['cel','smooth'] as const){
    assert.equal(sampleRamp(ramp,.5,mode,style),ramp.base);
    assert.equal(sampleRamp(ramp,shadeValue({x:1,y:0,z:0},{...light,strength:0}),mode,style),ramp.base);
    for(const amount of [-1,0,.3,.5,.6,.85,1,2,NaN])assert.match(sampleRamp(ramp,amount,mode,style),/^#[0-9A-F]{6}$/);
  }
  assert.equal(sampleRamp(ramp,.3,'cel','anime'),ramp.shadow);assert.equal(sampleRamp(ramp,.3,'cel','luminous'),ramp.base);
  assert.equal(sampleRamp(ramp,.8,'cel','anime'),ramp.halftone);assert.equal(sampleRamp(ramp,.8,'cel','graphic'),ramp.base);
});

test('painted gradients blend sRGB in linear light instead of dark display-space averages',()=>{
  const blackWhite={...ramp,base:'#FFFFFF'};
  assert.equal(sampleRamp(blackWhite,.25,'smooth','anime'),'#BCBCBC');
  assert.equal(sampleRamp(ramp,0,'smooth','anime'),ramp.shadow);assert.equal(sampleRamp(ramp,1,'smooth','anime'),ramp.highlight);
  assert.notEqual(sampleRamp(ramp,.8,'smooth','graphic'),sampleRamp(ramp,.8,'smooth','luminous'));
});

test('source guide and pointer clock angles agree and stay within the usable canvas',()=>{
  assert.equal(screenToLightDirection(0,-1),0);assert.equal(screenToLightDirection(1,0),90);assert.equal(screenToLightDirection(-1,0),-90);assert.equal(Math.abs(screenToLightDirection(0,1)),180);assert.equal(screenToLightDirection(0,0),0);
  for(const width of [50,390,1280])for(const height of [50,600,900])for(const direction of [-180,-90,-30,0,60,120])for(const elevation of [10,45,80]){
    const point=lightHandlePosition(direction,elevation,width,height);
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));assert.ok(point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height);
    if(width>60&&height>60){
      // The elliptical guide keeps the same clock angle after normalizing axes.
      const x=(point.x-width/2)/(width/2-30),y=(point.y-height/2)/(height/2-30);
      near(screenToLightDirection(x,y),direction);
    }
  }
  const side=lightHandlePosition(-35,10,820,600),front=lightHandlePosition(-35,80,820,600);
  near(side.x,front.x);near(side.y,front.y);
});
