import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRamp} from '../src/color.ts';
import {createDefaultStudy} from '../src/library.ts';
import {FLAT_SOURCE_COLORS,FIXED_PORTRAIT_COLORS,decodePortraitImage,buildPortraitRamps,samplePortraitSurface,normalFromHeight,canCastPortraitShadow,portraitOcclusion} from '../src/portrait-model.ts';
import {buildPortraitGeometry,portraitSurface,samplePortraitBody} from '../src/portrait-geometry.ts';
import type {ShadowStyle} from '../src/types.ts';

const study=createDefaultStudy(),light={...study.light,bounce:0};
const ramps=()=>buildPortraitRamps(study.colors.map(color=>buildRamp(color.hex,light)),light);
const pixels=(width:number,height:number,rgb:readonly number[],alpha=254)=>{
 const result=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)result.set([...rgb,alpha],i*4);return result;
};
const normal={x:.8,y:0,z:.6};

test('visible collar and costume pigments belong to the garment rather than the head geometry',()=>{
 for(const material of [2,3,4,5,6])for(const u of [.56,.60,.64,.68])for(const v of [.33,.342,.35,.36,.38,.40]){
  assert.equal(portraitSurface(material,u,v),2,`Garment pigment ${material} at ${u},${v} must not acquire hair tubes or the head's cast policy`);
 }
 assert.equal(portraitSurface(1,.64,.35),1,'A real hair strand above the collar retains its hair surface');
 assert.equal(portraitSurface(0,.516,.35),3,'The visible neck remains separate from the garment');
 assert.equal(portraitSurface(6,.48,.23),0,'Eye whites remain on the face rather than becoming a clothing surface');
});

test('body, collar, shoulder and sleeve normals are derivatives of the same continuous height used by casts',()=>{
 const positions=[[.33,.58],[.39,.52],[.33,.64],[.74,.46],[.82,.72],[.64,.35],[.38,.39],[.29,.57],[.43,.61],[.76,.64],[.88,.68]],epsilon=1e-6;
 for(const [u,v] of positions){
  const sample=samplePortraitBody(u,v),du=(samplePortraitBody(u+epsilon,v).height-samplePortraitBody(u-epsilon,v).height)/(2*epsilon),dv=(samplePortraitBody(u,v+epsilon).height-samplePortraitBody(u,v-epsilon).height)/(2*epsilon);
  assert.ok(Number.isFinite(sample.height)&&sample.height>0);assert.ok(Number.isFinite(sample.du)&&Number.isFinite(sample.dv));assert.ok(sample.formBlend>=0&&sample.formBlend<=1);
  assert.ok(Math.abs(sample.du-du)<2e-5,`Body u derivative at ${u},${v} follows its actual height`);assert.ok(Math.abs(sample.dv-dv)<2e-5,`Body v derivative at ${u},${v} follows its actual height`);
 }
});

test('chest shoulders and sleeves have independent local volume instead of one flat torso slope',()=>{
 for(const [name,left,right] of [
  ['chest',[.29,.57],[.43,.61]],['right shoulder',[.68,.46],[.82,.52]],['right sleeve',[.76,.64],[.88,.68]]
 ] as const){
  const a=samplePortraitBody(...left),b=samplePortraitBody(...right);assert.ok(a.du>.08&&b.du<-.02,`${name} has opposite local slopes around its own illustrated form`);
 }
 assert.ok(samplePortraitBody(.35,.59).formBlend>.85,'Broad chest volume can retain readable transitions under the cel treatment');
 assert.ok(samplePortraitBody(.64,.35).formBlend<.6,'The outlined collar keeps a firmer planar treatment');
});

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

const bodyGeometryFixture=()=>{
 const width=96,height=144,count=width*height,alpha=new Uint8Array(count),plain=new Uint8Array(count).fill(2),stitched=plain.slice(),paints=[2,4,5,6];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x;
  // Garment-only domain with real outer edges and an alpha hole. The many
  // pigment stitches have no corresponding physical seam or change in shape.
  if(y>=50&&y<height-3&&x>=3&&x<width-3&&!(x>=43&&x<=46&&y>=94&&y<=108))alpha[index]=255;
  stitched[index]=paints[(Math.floor(x/7)+Math.floor(y/11))%paints.length];
 }
 return {width,height,alpha,plain,stitched};
};

test('repainting a stitched garment does not change its actual depth normals or form treatment',()=>{
 const {width,height,alpha,plain,stitched}=bodyGeometryFixture(),onePaint=buildPortraitGeometry(plain,alpha,width,height),manyPaints=buildPortraitGeometry(stitched,alpha,width,height);
 assert.deepEqual(manyPaints.surfaces,onePaint.surfaces,'All four costume pigments remain the same physical garment');
 assert.deepEqual(manyPaints.depth,onePaint.depth,'Pigment boundaries cannot raise terraces or change occlusion geometry');
 assert.deepEqual(manyPaints.normals,onePaint.normals,'Changing paint cannot create artificial light-facing planes');
 assert.deepEqual(manyPaints.formBlend,onePaint.formBlend,'The same fabric keeps its shading treatment across color blocks');
});

test('built garment normals are perpendicular to the actual final depth tangents including alpha edges',()=>{
 const {width,height,alpha,stitched}=bodyGeometryFixture(),geometry=buildPortraitGeometry(stitched,alpha,width,height);let checked=0,edgeChecks=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x;if(!alpha[index])continue;
  const compatible=(other:number)=>other>=0&&other<alpha.length&&alpha[other]>0&&geometry.surfaces[other]===2;
  const horizontal=[x>0&&compatible(index-1)?index-1:index,x+1<width&&compatible(index+1)?index+1:index],vertical=[y>0&&compatible(index-width)?index-width:index,y+1<height&&compatible(index+width)?index+width:index];
  const dx=horizontal[0]===horizontal[1]?0:(geometry.depth[horizontal[1]]-geometry.depth[horizontal[0]])/(horizontal[0]===index||horizontal[1]===index?1:2),dy=vertical[0]===vertical[1]?0:(geometry.depth[vertical[1]]-geometry.depth[vertical[0]])/(vertical[0]===index||vertical[1]===index?1:2);
  const [nx,ny,nz]=geometry.normals.subarray(index*3,index*3+3);
  assert.ok(Number.isFinite(geometry.depth[index])&&nz>0);assert.ok(Math.abs(Math.hypot(nx,ny,nz)-1)<1e-6);
  assert.ok(Math.abs(nx+nz*dx)<1e-6,`The x tangent lies in the illuminated surface at ${x},${y}`);assert.ok(Math.abs(ny+nz*dy)<1e-6,`The y tangent lies in the illuminated surface at ${x},${y}`);
  checked++;if(horizontal.includes(index)||vertical.includes(index))edgeChecks++;
 }
 assert.ok(checked>7000&&edgeChecks>300,'Coverage includes the entire generated garment and its silhouette/hole boundaries');
});

test('actual curved hair masks remain finite and normalized as strands narrow to one-pixel tips',()=>{
 const width=96,height=144,materials=new Uint8Array(width*height).fill(1),alpha=new Uint8Array(width*height);let opaque=0;
 for(let y=5;y<height-3;y++){
  const t=(y-5)/(height-8),center=Math.round(width*(.45+.28*Math.sin(t*Math.PI*.75))),radius=Math.max(0,Math.round(7*(1-t)));
  for(let x=Math.max(0,center-radius);x<=Math.min(width-1,center+radius);x++){alpha[y*width+x]=255;opaque++;}
 }
 const geometry=buildPortraitGeometry(materials,alpha,width,height);let tips=0;
 for(let index=0;index<alpha.length;index++)if(alpha[index]){
  const normal=geometry.normals.subarray(index*3,index*3+3);assert.ok(Number.isFinite(geometry.depth[index]));assert.ok(Array.from(normal).every(Number.isFinite));assert.ok(normal[2]>0&&Math.abs(Math.hypot(...normal)-1)<1e-6);
  if(Math.floor(index/width)>height-12)tips++;
 }
 assert.ok(opaque>900&&tips>5,'The built fixture includes curved broad locks and one-pixel tip coverage');
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

// Geometry surface ownership deliberately does not use the pigment/material map.
const FACE=0,HAIR=1,BODY=2,NECK=3,FRONT_HAIR=4,BACK_HAIR=5;
const shadowFixture=(receiver:number,caster:number)=>{
 const width=9,height=3,x=3,y=1,index=y*width+x,blocker=index+1;
 const depth=new Float32Array(width*height),coverage=new Uint8Array(width*height).fill(255),surface=new Uint8Array(width*height).fill(receiver);
 surface[blocker]=caster;depth[blocker]=4;
 const source={...light,strength:1,direction:90,elevation:20};
 return {depth,coverage,surface,index,blocker,source,cast:(settings=source)=>portraitOcclusion(depth,coverage,width,height,x,y,settings,surface)};
};

test('portrait shadow policy rejects invalid surface IDs and every hair receiver',()=>{
 for(const receiver of [HAIR,FRONT_HAIR,BACK_HAIR,-1,6,255,NaN,.5])for(let caster=0;caster<=5;caster++)assert.equal(canCastPortraitShadow(receiver,caster),false);
 for(const receiver of [FACE,BODY,NECK])for(const caster of [-1,6,255,NaN,1.5])assert.equal(canCastPortraitShadow(receiver,caster),false);
 for(const receiver of [HAIR,FRONT_HAIR,BACK_HAIR]){
  const fixture=shadowFixture(receiver,FRONT_HAIR);
  assert.equal(fixture.cast(),0,'A raised nearby lock cannot terrain-shadow another hair surface');
 }
});

test('raised face bumps and cloth ridges shade locally without casting terrain shadows',()=>{
 for(const receiver of [FACE,BODY]){
  const fixture=shadowFixture(receiver,receiver);
  assert.ok(portraitOcclusion(fixture.depth,fixture.coverage,9,3,3,1,fixture.source)>.9,'The synthetic ridge is high enough to cast without semantic ownership');
  assert.equal(fixture.cast(),0,'Relief within one face or garment must not create a cast band');
 }
});

test('foreground hair casts on the face and body only from the source direction and above the receiver',()=>{
 for(const receiver of [FACE,BODY])for(const caster of [HAIR,FRONT_HAIR]){
  const fixture=shadowFixture(receiver,caster);
  assert.ok(fixture.cast()>.9,'A raised foreground hair overlap casts on the receiving surface');
  assert.equal(fixture.cast({...fixture.source,direction:-90}),0,'Moving the source away from the blocker removes its cast');
  fixture.depth[fixture.blocker]=fixture.depth[fixture.index];
  assert.equal(fixture.cast(),0,'Semantic ownership cannot create a cast without positive height');
  fixture.depth[fixture.blocker]=-4;
  assert.equal(fixture.cast(),0,'Hair behind the receiving surface cannot block the source');
 }
});

test('back hair cannot cast on foreground surfaces while a raised face can cast onto the neck',()=>{
 for(const receiver of [FACE,BODY,NECK])assert.equal(shadowFixture(receiver,BACK_HAIR).cast(),0);
 const neck=shadowFixture(NECK,FACE);
 assert.ok(neck.cast()>.9,'The face can create a directional chin cast on the neck');
 assert.equal(neck.cast({...neck.source,direction:-90}),0);
 assert.equal(shadowFixture(FACE,NECK).cast(),0,'The neck cannot cast back onto the face');
});

test('semantic casts respect a disabled key, transparent blockers and surface-map dimensions',()=>{
 const fixture=shadowFixture(FACE,FRONT_HAIR);
 assert.ok(fixture.cast()>.9);
 assert.equal(fixture.cast({...fixture.source,strength:0}),0);
 fixture.coverage[fixture.blocker]=0;assert.equal(fixture.cast(),0);
 fixture.coverage[fixture.blocker]=255;
 assert.equal(portraitOcclusion(fixture.depth,fixture.coverage,9,3,3,1,fixture.source,new Uint8Array(26)),0);
 fixture.surface[fixture.index]=255;assert.equal(fixture.cast(),0,'Unknown receivers cannot receive terrain casts');
 fixture.surface[fixture.index]=FACE;fixture.surface[fixture.blocker]=255;assert.equal(fixture.cast(),0,'Unknown casters cannot shadow a known surface');
});
