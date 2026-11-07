import type { Ramp, Study } from './types';
import { getLightVector } from './lighting';
import { decodePortraitImage, buildPortraitRamps, samplePortraitSurface, normalFromHeight, portraitOcclusion, PORTRAIT_INK } from './portrait-model';

type Point={x:number;y:number};
type Curve={p:[Point,Point,Point,Point];width:[number,number];z:[number,number];rise:number;material:number;add?:boolean};
type PortraitMap={width:number;height:number;materials:Uint8Array;ink:Uint8Array;alpha:Uint8Array;depth:Float32Array;normals:Float32Array};
const PREVIEW_EDGE=820;
const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
const linear=(value:number)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
const encoded=(value:number)=>Math.round(clamp(value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055)*255);
const linearBytes=Float32Array.from({length:256},(_,i)=>linear(i));
const rgb=(hex:string):[number,number,number]=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const gray=(r:number,g:number,b:number)=>encoded(.2126*linearBytes[r]+.7152*linearBytes[g]+.0722*linearBytes[b]);
const point=(x:number,y:number):Point=>({x,y});
const ellipse=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>((x-cx)/rx)**2+((y-cy)/ry)**2;
let original:HTMLImageElement|null=null,loading:Promise<void>|null=null,error:string|null=null;
const maps=new Map<number,PortraitMap>(),rendered=new Map<string,HTMLCanvasElement>(),casts=new Map<string,Uint8Array>();

export function portraitStatus():{ready:boolean;error:string|null} {return {ready:original!==null&&maps.has(PREVIEW_EDGE),error};}
export function preloadPortrait():Promise<void> {
  if(loading)return loading;
  loading=(async()=>{
    try{
      const image=new Image();image.decoding='async';
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('The illustration could not be loaded.'));image.src=new URL('./assets/portrait-flats.png',import.meta.url).href;});
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('The illustration file is empty.');
      original=image;mapFor(PREVIEW_EDGE);
    }catch(cause){original=null;error=cause instanceof Error?cause.message:'The illustration could not be loaded.';}
  })();return loading;
}

function lock(p:number[],width0:number,width1:number,z0:number,z1:number,rise:number):Curve {
  return {p:[point(p[0],p[1]),point(p[2],p[3]),point(p[4],p[5]),point(p[6],p[7])],width:[width0,width1],z:[z0,z1],rise,material:1};
}
// Each path follows a visible lock in the flat drawing. Its rounded section
// supplies local depth, independent of the pigment and fine ink laid over it.
const hairLocks:Curve[]=[
  lock([.46,.038,.37,.018,.29,.080,.215,.18],.055,.008,.150,.120,.017),
  lock([.45,.037,.34,.030,.23,.14,.20,.24],.060,.012,.156,.128,.022),
  lock([.455,.040,.33,.060,.30,.155,.295,.225],.060,.014,.172,.166,.023),
  lock([.453,.041,.36,.090,.35,.190,.385,.235],.058,.008,.184,.194,.026),
  lock([.448,.042,.39,.105,.41,.205,.342,.240],.050,.010,.183,.192,.024),
  lock([.456,.041,.44,.100,.42,.172,.433,.205],.045,.009,.184,.183,.020),
  lock([.46,.040,.51,.080,.54,.130,.563,.198],.054,.012,.172,.175,.025),
  lock([.46,.040,.55,.055,.64,.105,.637,.165],.060,.013,.159,.143,.021),
  lock([.47,.038,.58,.015,.68,.105,.668,.145],.056,.010,.147,.130,.017),
  lock([.47,.035,.57,.000,.63,.050,.654,.103],.041,.010,.136,.121,.015),
  lock([.30,.125,.235,.18,.235,.245,.32,.267],.031,.006,.166,.174,.020),
  lock([.268,.194,.22,.25,.29,.280,.34,.289],.030,.006,.166,.177,.018),
  lock([.257,.225,.21,.30,.22,.355,.31,.374],.031,.006,.147,.123,.020),
  lock([.237,.265,.19,.335,.25,.36,.28,.383],.029,.006,.130,.115,.018),
  lock([.54,.160,.555,.235,.54,.28,.51,.295],.027,.004,.181,.183,.018),
  lock([.575,.178,.59,.25,.55,.295,.54,.342],.025,.007,.170,.164,.018),
  lock([.624,.190,.64,.29,.61,.38,.61,.46],.033,.010,.116,.083,.017),
  lock([.657,.194,.67,.30,.77,.37,.85,.48],.038,.012,.086,.050,.019),
  lock([.655,.240,.71,.34,.84,.39,.90,.52],.038,.015,.069,.034,.019),
  lock([.69,.30,.77,.40,.98,.49,.925,.62],.034,.010,.050,.020,.018),
  lock([.80,.43,.95,.52,1.01,.63,.93,.68],.031,.008,.035,.014,.017),
  lock([.87,.54,1.01,.68,.98,.78,.905,.84],.026,.006,.025,.010,.015),
  lock([.88,.68,.97,.78,.93,.87,.91,.93],.023,.005,.018,.008,.014),
  lock([.28,.31,.27,.36,.14,.41,.09,.46],.030,.006,.105,.080,.018),
  lock([.29,.35,.19,.40,.09,.48,.15,.52],.029,.006,.104,.079,.017),
  lock([.26,.36,.21,.43,.12,.50,.08,.55],.023,.005,.115,.085,.015),
  lock([.566,.303,.55,.39,.49,.46,.44,.478],.020,.005,.172,.155,.020),
  lock([.544,.355,.50,.43,.42,.47,.43,.525],.026,.004,.170,.164,.022),
  lock([.54,.405,.48,.47,.35,.51,.40,.58],.025,.006,.163,.151,.021),
  lock([.512,.455,.43,.51,.39,.57,.48,.58],.027,.004,.164,.154,.021),
  lock([.472,.49,.39,.56,.37,.60,.44,.634],.018,.004,.160,.150,.016)
];
const fold=(p:number[],width:number,rise:number):Curve=>({p:[point(p[0],p[1]),point(p[2],p[3]),point(p[4],p[5]),point(p[6],p[7])],width:[width,width*.55],z:[0,0],rise,material:2,add:true});
const clothFolds:Curve[]=[
  fold([.60,.53,.68,.57,.74,.65,.81,.67],.045,.013),
  fold([.84,.59,.86,.65,.92,.72,.93,.77],.040,.016),
  fold([.92,.77,.87,.76,.82,.74,.77,.75],.034,.011),
  fold([.90,.79,.84,.79,.78,.82,.72,.83],.035,.013),
  fold([.84,.86,.82,.88,.78,.91,.77,.94],.033,.012),
  fold([.53,.59,.56,.68,.57,.79,.55,.89],.025,.008),
  fold([.60,.66,.63,.75,.64,.85,.63,.98],.027,.009),
  fold([.17,.59,.12,.66,.10,.73,.09,.78],.028,.011),
  fold([.06,.79,.09,.80,.11,.81,.16,.83],.028,.010),
  fold([.13,.87,.10,.91,.08,.95,.06,.98],.027,.010)
];
function bezier(curve:Curve,t:number):{x:number;y:number;dx:number;dy:number} {
  const [a,b,c,d]=curve.p,s=1-t;
  return {x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*c.y+t*t*t*d.y,dx:3*s*s*(b.x-a.x)+6*s*t*(c.x-b.x)+3*t*t*(d.x-c.x),dy:3*s*s*(b.y-a.y)+6*s*t*(c.y-b.y)+3*t*t*(d.y-c.y)};
}
function rasterCurve(depth:Float32Array,materials:Uint8Array,width:number,height:number,curve:Curve):void {
  const length=curve.p.slice(1).reduce((sum,p,i)=>sum+Math.hypot((p.x-curve.p[i].x)*width,(p.y-curve.p[i].y)*height),0);
  const steps=Math.max(18,Math.ceil(length/2.5));
  const addition=curve.add?new Float32Array(depth.length):null;
  for(let step=0;step<=steps;step++){
    const t=step/steps,c=bezier(curve,t),cx=c.x*width,cy=c.y*height,tx=c.dx*width,ty=c.dy*height,tangent=Math.hypot(tx,ty)||1;
    const ux=tx/tangent,uy=ty/tangent,radius=Math.max(1,(curve.width[0]*(1-t)+curve.width[1]*t)*width),halfStep=Math.max(2,length/steps*1.2);
    const minX=Math.max(0,Math.floor(cx-radius-halfStep)),maxX=Math.min(width-1,Math.ceil(cx+radius+halfStep));
    const minY=Math.max(0,Math.floor(cy-radius-halfStep)),maxY=Math.min(height-1,Math.ceil(cy+radius+halfStep));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const index=y*width+x;if(materials[index]!==curve.material)continue;
      const px=x+.5-cx,py=y+.5-cy,along=px*ux+py*uy,across=-px*uy+py*ux;
      if(Math.abs(along)>halfStep||Math.abs(across)>=radius)continue;
      const round=Math.sqrt(Math.max(0,1-(across/radius)**2));
      const value=curve.add?curve.rise*height*round*round:((curve.z[0]*(1-t)+curve.z[1]*t)+curve.rise*round)*height;
      if(addition)addition[index]=Math.max(addition[index],value);else depth[index]=Math.max(depth[index],value);
    }
  }
  if(addition)for(let index=0;index<depth.length;index++)depth[index]+=addition[index];
}
/** A 2.5D atlas authored to this drawing, in image pixels. Positive depth is
 * toward the viewer; the same atlas supplies all normals and cast shadows. */
export function buildPortraitDepth(materials:Uint8Array,alpha:Uint8Array,width:number,height:number):Float32Array {
  const depth=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x;if(alpha[index]===0)continue;
    const u=(x+.5)/width,v=(y+.5)/height,id=materials[index];
    const shoulder=clamp(1-((u-.50)/.54)**2),torso=.060+.024*Math.sqrt(shoulder)-.014*Math.max(0,v-.57);
    let value=torso;
    if(id!==1&&v<.34&&ellipse(u,v,.447,.229,.18,.116)<1.35){
      const e=ellipse(u,v,.447,.229,.18,.116);value=.127+.039*Math.sqrt(Math.max(0,1-e*.78));
      const nose=Math.exp(-(((u-.388)/.027)**2)-(((v-.258)/.034)**2));value+=nose*.014;
      const cheeks=Math.exp(-(((u-.438)/.08)**2)-(((v-.270)/.044)**2));value+=cheeks*.005;
    }else if(id===0){value=.104+.018*Math.sqrt(Math.max(0,1-((u-.516)/.08)**2));}
    else if(id===1){
      if(v<.39){const e=ellipse(u,v,.48,.185,.31,.21);value=.099+.032*Math.sqrt(Math.max(0,1-e*.82));}
      else value=u>.70?.022:u<.29?.064:.123;
    }else if(v<.375&&ellipse(u,v,.48,.185,.32,.22)<1.2){
      const e=ellipse(u,v,.48,.185,.31,.21);value=.108+.032*Math.sqrt(Math.max(0,1-e*.82));
    }else if(id===2&&v<.46){
      value+=.033*clamp((.47-v)/.13);value+=(u>.5?.010:-.004);
    }else if(id===5){value+=.012;}
    depth[index]=value*height;
  }
  for(const curve of hairLocks)rasterCurve(depth,materials,width,height,curve);
  for(const curve of clothFolds)rasterCurve(depth,materials,width,height,curve);
  // A gentle upper-eyelid/brow relief belongs to the face geometry rather than
  // a painted shadow. Actual facial ink remains a separate immutable overlay.
  return depth;
}
function sameSurface(surface:Float32Array,materials:Uint8Array,alpha:Uint8Array,index:number,neighbor:number,jump:number):boolean {
  return neighbor>=0&&neighbor<surface.length&&alpha[neighbor]>=96&&materials[neighbor]===materials[index]&&Math.abs(surface[neighbor]-surface[index])<=jump;
}
function shadingNormals(depth:Float32Array,materials:Uint8Array,alpha:Uint8Array,width:number,height:number):Float32Array {
  // Only the surface derivatives are smoothed. Cast rays continue to sample
  // the original atlas, so fine fringe occluders keep their actual geometry.
  const jump=Math.max(2,height*.012);
  let surface=depth.slice();
  for(let pass=0;pass<2;pass++){
    const next=surface.slice();
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const index=y*width+x;if(alpha[index]<96)continue;
      let total=surface[index]*4,weight=4;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(dx===0&&dy===0)continue;const neighbor=index+dy*width+dx;
        if(alpha[neighbor]<96||materials[neighbor]!==materials[index]||Math.abs(surface[neighbor]-surface[index])>jump)continue;
        const w=dx===0||dy===0?2:1;total+=surface[neighbor]*w;weight+=w;
      }
      next[index]=total/weight;
    }
    surface=next;
  }
  const result=new Float32Array(depth.length*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x;if(alpha[index]===0)continue;
    const left=x>0&&sameSurface(surface,materials,alpha,index,index-1,jump),right=x<width-1&&sameSurface(surface,materials,alpha,index,index+1,jump),top=y>0&&sameSurface(surface,materials,alpha,index,index-width,jump),bottom=y<height-1&&sameSurface(surface,materials,alpha,index,index+width,jump);
    let normal;
    if(left&&right&&top&&bottom)normal=normalFromHeight(surface,width,height,x,y);
    else{
      // A hair-over-face step is an occlusion boundary, not a steep patch of
      // cheek. One-sided differences stay on the visible receiving surface.
      const gx=left&&right?(surface[index+1]-surface[index-1])/2:right?surface[index+1]-surface[index]:left?surface[index]-surface[index-1]:0;
      const gy=top&&bottom?(surface[index+width]-surface[index-width])/2:bottom?surface[index+width]-surface[index]:top?surface[index]-surface[index-width]:0;
      const length=Math.hypot(gx,gy,1);normal={x:-gx/length,y:-gy/length,z:1/length};
    }
    const n=index*3;result[n]=normal.x;result[n+1]=normal.y;result[n+2]=normal.z;
  }
  // One final small derivative average removes curve-sampling joins without
  // touching ink, categorical masks, or the opposing slopes of a hair lock.
  const softened=result.slice(),neighborOffsets=[-1,1,-width,width];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const index=y*width+x,n=index*3;if(alpha[index]<96)continue;
    let nx=result[n]*4,ny=result[n+1]*4,nz=result[n+2]*4;
    for(const offset of neighborOffsets){
      const neighbor=index+offset;
      if(alpha[neighbor]<96||materials[neighbor]!==materials[index]||Math.abs(surface[neighbor]-surface[index])>jump)continue;
      const p=neighbor*3;nx+=result[p];ny+=result[p+1];nz+=result[p+2];
    }
    const length=Math.hypot(nx,ny,nz)||1;softened[n]=nx/length;softened[n+1]=ny/length;softened[n+2]=nz/length;
  }
  return softened;
}
function mapFor(edge:number):PortraitMap|null {
  const known=maps.get(edge);if(known)return known;if(!original)return null;
  const factor=Math.min(1,edge/Math.max(original.naturalWidth,original.naturalHeight)),width=Math.round(original.naturalWidth*factor),height=Math.round(original.naturalHeight*factor);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas illustration rendering is unavailable.');
  ctx.drawImage(original,0,0,width,height);
  const decoded=decodePortraitImage(ctx.getImageData(0,0,width,height).data,width,height),depth=buildPortraitDepth(decoded.materials,decoded.alpha,width,height),normals=shadingNormals(depth,decoded.materials,decoded.alpha,width,height);
  const map={width,height,...decoded,depth,normals};maps.set(edge,map);
  while(maps.size>2){const old=[...maps.keys()].find(key=>key!==PREVIEW_EDGE&&key!==edge);if(old===undefined)break;maps.delete(old);}
  return map;
}
function castMap(map:PortraitMap,study:Study):Uint8Array|null {
  if(study.light.strength===0)return null;
  const key=JSON.stringify([map.width,map.height,study.light.direction,study.light.elevation]),known=casts.get(key);if(known)return known;
  const result=new Uint8Array(map.width*map.height);
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const index=y*map.width+x;if(map.alpha[index]<180)continue;
    result[index]=Math.round(clamp(portraitOcclusion(map.depth,map.alpha,map.width,map.height,x,y,study.light))*255);
  }
  casts.set(key,result);while(casts.size>2)casts.delete(casts.keys().next().value!);return result;
}
function paint(map:PortraitMap,study:Study,editable:Ramp[]):HTMLCanvasElement {
  const cacheKey=JSON.stringify([map.width,map.height,editable.slice(0,4),study.light,study.shading,study.shadowStyle,study.values]),known=rendered.get(cacheKey);if(known)return known;
  const canvas=document.createElement('canvas');canvas.width=map.width;canvas.height=map.height;const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(map.width,map.height),output=pixels.data;
  const ramps=buildPortraitRamps(editable,study.light),key=getLightVector(study.light),projected=Math.hypot(key.x,key.y)||1,perpendicular={x:key.y/projected,y:-key.x/projected,z:0};
  const table=(occlusion:number)=>ramps.map((_,id)=>Array.from({length:257},(_,i)=>{
    const dot=i/256,side=Math.sqrt(Math.max(0,1-dot*dot)),normal={x:key.x*dot+perpendicular.x*side,y:key.y*dot+perpendicular.y*side,z:key.z*dot};
    const color=rgb(samplePortraitSurface(id,ramps,study.light,study.shading,study.shadowStyle,normal,occlusion));if(study.values){const value=gray(...color);return [value,value,value];}return color;
  }));
  const lit=table(0),shadow=table(1),occlusion=castMap(map,study),inkColor=rgb(PORTRAIT_INK);if(study.values){const value=gray(...inkColor);inkColor.fill(value);}
  for(let index=0;index<map.width*map.height;index++){
    const p=index*4;if(map.alpha[index]===0)continue;const n=index*3,diffuse=Math.max(0,map.normals[n]*key.x+map.normals[n+1]*key.y+map.normals[n+2]*key.z),slot=Math.round(clamp(diffuse)*256),id=map.materials[index];
    const light=lit[id]?.[slot]||lit[0][slot],cast=shadow[id]?.[slot]||shadow[0][slot],amount=(occlusion?.[index]||0)/255,ink=map.ink[index]/255;
    for(let channel=0;channel<3;channel++){
      const value=amount===0?light[channel]:amount===1?cast[channel]:encoded(linearBytes[light[channel]]*(1-amount)+linearBytes[cast[channel]]*amount);
      output[p+channel]=ink===0?value:Math.round(value*(1-ink)+inkColor[channel]*ink);
    }
    output[p+3]=map.alpha[index];
  }
  ctx.putImageData(pixels,0,0);rendered.set(cacheKey,canvas);while(rendered.size>3)rendered.delete(rendered.keys().next().value!);return canvas;
}
export function portraitProjection(width:number,height:number,options?:{export?:boolean}):{x:number;y:number;width:number;height:number;sourceWidth:number;sourceHeight:number} {
  const sourceWidth=original?.naturalWidth||1024,sourceHeight=original?.naturalHeight||1536,margin=options?.export?12:20,scale=Math.max(.01,Math.min((width-margin*2)/sourceWidth,(height-margin*2)/sourceHeight))*1.25;
  const w=sourceWidth*scale,h=sourceHeight*scale;return {x:(width-w)/2,y:margin,width:w,height:h,sourceWidth,sourceHeight};
}
export function inspectPortrait(u:number,v:number,width:number,height:number):{material:number;ink:number;alpha:number;normal:{x:number;y:number;z:number};depth:number;x:number;y:number}|null {
  const map=maps.get(PREVIEW_EDGE);if(!map)return null;
  const sx=Math.min(map.width-1,Math.max(0,Math.floor(clamp(u)*map.width))),sy=Math.min(map.height-1,Math.max(0,Math.floor(clamp(v)*map.height))),index=sy*map.width+sx,n=index*3,projection=portraitProjection(width,height);
  return {material:map.materials[index],ink:map.ink[index]/255,alpha:map.alpha[index]/255,normal:{x:map.normals[n],y:map.normals[n+1],z:map.normals[n+2]},depth:map.depth[index],x:projection.x+u*projection.width,y:projection.y+v*projection.height};
}
export function drawPortrait(ctx:CanvasRenderingContext2D,study:Study,ramps:Ramp[],width:number,height:number,options?:{export?:boolean}):boolean {
  const map=mapFor(options?.export?Math.min(1800,Math.max(width,height)*1.5):PREVIEW_EDGE);
  if(!map){ctx.save();ctx.fillStyle=study.values?'#BDBDBD':'#BAC2BB';ctx.textAlign='center';ctx.font='14px system-ui,sans-serif';ctx.fillText(error?'The illustration could not be loaded.':'Loading illustration…',width/2,height/2);if(error){ctx.font='12px system-ui,sans-serif';ctx.fillText('Reload ArtLab to try again.',width/2,height/2+25);}ctx.restore();return false;}
  const art=paint(map,study,ramps),projection=portraitProjection(width,height,options);
  ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(art,projection.x,projection.y,projection.width,projection.height);ctx.restore();return true;
}
