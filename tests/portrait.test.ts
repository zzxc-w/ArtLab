import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRamp} from '../src/color.ts';
import {createDefaultStudy} from '../src/library.ts';
import {FLAT_SOURCE_COLORS,FIXED_PORTRAIT_COLORS,decodePortraitImage,buildPortraitRamps,samplePortraitSurface,normalFromHeight,portraitOcclusion} from '../src/portrait-model.ts';
import type {ShadowStyle} from '../src/types.ts';

const study=createDefaultStudy(),light={...study.light,bounce:0};
const ramps=()=>buildPortraitRamps(study.colors.map(color=>buildRamp(color.hex,light)),light);
const pixels=(width:number,height:number,rgb:readonly number[],alpha=254)=>{
 const result=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)result.set([...rgb,alpha],i*4);return result;
};
const normal={x:.8,y:0,z:.6};

test('unlit portrait interiors use exact selected base colors for every finish and source position',()=>{
 const surfaceRamps=ramps();
 for(const style of ['anime','soft','graphic','luminous'] as ShadowStyle[])for(const mode of ['cel','smooth'] as const)for(const direction of [-180,-90,0,90,180])for(let id=0;id<surfaceRamps.length;id++){
  const actual=samplePortraitSurface(id,surfaceRamps,{...light,direction,strength:0,bounce:1},mode,style,normal,1);
  assert.equal(actual,surfaceRamps[id].base,'Normals, casts and bounce cannot shade a disabled key');
 }
});

test('black white and saturated paint replace a material directly without source-color division',()=>{
 for(const color of ['#000000','#FFFFFF','#00FF00','#FF00FF','#00FFFF'])for(let id=0;id<4;id++){
  const surfaceRamps=ramps();surfaceRamps[id]=buildRamp(color,light);
  assert.equal(samplePortraitSurface(id,surfaceRamps,{...light,strength:0},'cel','anime',normal),color);
 }
});

test('editing one semantic material leaves other materials and fixed costume neutrals unchanged',()=>{
 const original=ramps(),source={...light,strength:.8,direction:-60,elevation:40};
 for(let changed=0;changed<4;changed++){
  const altered=original.slice();altered[changed]=buildRamp('#12E6B4',source);
  for(let id=0;id<original.length;id++)if(id!==changed){
   for(const mode of ['cel','smooth'] as const)assert.equal(samplePortraitSurface(id,altered,source,mode,'anime',normal),samplePortraitSurface(id,original,source,mode,'anime',normal));
  }
 }
 const userRamps=[...original.slice(0,4),buildRamp('#FF0000',light),buildRamp('#00FF00',light),buildRamp('#0000FF',light),buildRamp('#FFFF00',light)];
 const portrait=buildPortraitRamps(userRamps,light);
 assert.equal(portrait.length,7);assert.deepEqual(portrait.slice(4).map(r=>r.base),[...FIXED_PORTRAIT_COLORS]);
});

test('flat-asset decoding preserves small material regions and makes opaque interiors truly opaque',()=>{
 for(let id=0;id<FLAT_SOURCE_COLORS.length;id++){
  const source=pixels(7,7,FLAT_SOURCE_COLORS[id]),decoded=decodePortraitImage(source,7,7);
  assert.ok(decoded.materials.every(value=>value===id));assert.ok(decoded.ink.every(value=>value===0));assert.ok(decoded.alpha.every(value=>value===255));
 }
 const source=pixels(7,7,FLAT_SOURCE_COLORS[1]);source.set([...FLAT_SOURCE_COLORS[3],254],(3*7+3)*4);
 source[3]=0;source[7]=123;source[11]=250;source[15]=249;const decoded=decodePortraitImage(source,7,7);
 assert.equal(decoded.materials[3*7+3],3,'A single gold detail retains its ownership instead of being blurred into hair');
 assert.equal(decoded.alpha[0],0);assert.equal(decoded.materials[0],255);assert.equal(decoded.alpha[1],123,'Real strand-edge transparency is retained');
 assert.equal(decoded.alpha[2],255);assert.equal(decoded.alpha[3],249);
 assert.throws(()=>decodePortraitImage(new Uint8ClampedArray(4),2,2),/dimensions/);
});

test('line extraction keeps dark strokes separate while discarding broad flat-fill value variations',()=>{
 const width=15,height=11,source=pixels(width,height,FLAT_SOURCE_COLORS[1]);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const gain=.84+x*.014;source.set(FLAT_SOURCE_COLORS[1].map(channel=>Math.round(channel*gain)),(y*width+x)*4);
 }
 const plain=decodePortraitImage(source,width,height);assert.ok(plain.ink.every(value=>value===0),'Broad values must never turn into baked shadows');
 for(let y=0;y<height;y++)source.set([23,19,29,254],(y*width+7)*4);
 const lines=decodePortraitImage(source,width,height);assert.ok(lines.ink[5*width+7]>220,'Fine dark linework is retained independently of the base paint');
 assert.equal(lines.ink[5*width+3],0);assert.equal(lines.materials[5*width+3],1);
});

test('hair-lock height gradients create local depth whose illuminated side reverses with the source',()=>{
 const width=9,height=3,depth=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)depth[y*width+x]=(4-Math.abs(x-4))*2;
 const left=normalFromHeight(depth,width,height,2,1),right=normalFromHeight(depth,width,height,6,1);
 assert.ok(left.x<0&&right.x>0);assert.ok(left.z>0&&right.z>0);
 assert.ok(Math.abs(Math.hypot(left.x,left.y,left.z)-1)<1e-12);
 const material=ramps(),fromLeft={...light,strength:1,direction:-90,elevation:20},fromRight={...fromLeft,direction:90};
 const ll=samplePortraitSurface(1,material,fromLeft,'smooth','anime',left),lr=samplePortraitSurface(1,material,fromLeft,'smooth','anime',right);
 assert.notEqual(ll,lr,'Different slopes of a lock cannot receive the same blanket head shade');
 assert.equal(ll,samplePortraitSurface(1,material,fromRight,'smooth','anime',right));
 assert.equal(lr,samplePortraitSurface(1,material,fromRight,'smooth','anime',left));
 const flat=new Float32Array(width*height).fill(13);assert.deepEqual(normalFromHeight(flat,width,height,0,0),{x:-0,y:-0,z:1});
});

test('cast shadows follow raised geometry toward the source and disappear when the key is off',()=>{
 const width=9,height=3,depth=new Float32Array(width*height),coverage=new Uint8Array(width*height).fill(255),x=3,y=1;
 const right={...light,strength:1,direction:90,elevation:20};
 assert.equal(portraitOcclusion(depth,coverage,width,height,x,y,right),0,'A flat plane cannot shadow itself');
 depth[y*width+4]=4;
 assert.ok(portraitOcclusion(depth,coverage,width,height,x,y,right)>.9,'A raised lock on the right shadows the surface to its left');
 assert.equal(portraitOcclusion(depth,coverage,width,height,x,y,{...right,direction:-90}),0);
 assert.equal(portraitOcclusion(depth,coverage,width,height,x,y,{...right,strength:0}),0);
 coverage[y*width+4]=0;assert.equal(portraitOcclusion(depth,coverage,width,height,x,y,right),0,'Transparent pixels cannot occlude the light');
});
