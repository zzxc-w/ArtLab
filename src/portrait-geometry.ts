type Point={x:number;y:number};
type Curve={p:[Point,Point,Point,Point];width:[number,number];z:[number,number];rise:number;material:number;add?:boolean};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const point=(x:number,y:number):Point=>({x,y});
const ellipse=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>((x-cx)/rx)**2+((y-cy)/ry)**2;
export interface PortraitGeometry {depth:Float32Array;normals:Float32Array;surfaces:Uint8Array;formBlend:Uint8Array}
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
  fold([.13,.87,.10,.91,.08,.95,.06,.98],.027,.010),
  fold([.235,.681,.277,.705,.330,.713,.391,.700],.038,.0013),
  fold([.665,.563,.707,.559,.746,.578,.769,.613],.024,.006),
  fold([.634,.428,.689,.414,.758,.425,.804,.456],.018,.004)
];

function bezier(c:Curve,t:number):Point {const [a,b,d,e]=c.p,s=1-t;return {x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*d.x+t*t*t*e.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*d.y+t*t*t*e.y};}
/** A pigment-independent surface layer: color boundaries never create cliffs. */
export function portraitSurface(material:number,u:number,v:number):number {
 if(material===1)return v<.39?1:u>.73?5:4;
 if(material===0)return v<.333&&ellipse(u,v,.447,.229,.18,.116)<1.4?0:3;
 // The visible collar starts at v=.328. Its paint, stitching, clasps and
 // neutral inset panels all belong to the garment, never the head ellipse.
 if(v>=.328)return 2;
 if(v<.328&&ellipse(u,v,.447,.229,.18,.116)<1.4)return 0;
 if(v<.30&&ellipse(u,v,.48,.18,.32,.23)<1.3)return 1;
 return 2;
}

// Broad anatomical volumes follow the three-quarter pose, including the
// dark inner garment and gray shoulder armor. They do not depend on paint IDs.
// Each tuple is center u/v, radii u/v, depth, rotation in radians.
const bodyVolumes:ReadonlyArray<readonly [number,number,number,number,number,number]>=[
 [.425,.675,.310,.300,.017,-.10],
 [.350,.590,.178,.142,.042,-.24],
 [.505,.608,.155,.155,.028,-.15],
 [.438,.469,.190,.055,.008,-.18],
 [.215,.491,.110,.087,.019,-.22],
 [.750,.488,.145,.104,.034,.30],
 [.812,.640,.109,.190,.028,-.20],
 [.088,.735,.082,.205,.020,.13],
 [.837,.788,.135,.078,.016,.15],
 [.763,.914,.114,.160,.023,.24],
 [.374,.834,.225,.082,-.008,-.12]
];
type BodyPanel={points:ReadonlyArray<readonly [number,number]>;center:readonly [number,number];rise:number;tilt:readonly [number,number];blend:number;feather:number};
const bodyPanels:ReadonlyArray<BodyPanel>=[
 {points:[[.266,.390],[.462,.347],[.476,.408],[.399,.445],[.344,.475],[.307,.438]],center:[.380,.403],rise:.016,tilt:[.035,-.030],blend:.43,feather:.010},
 {points:[[.559,.331],[.680,.328],[.705,.376],[.655,.422],[.559,.428],[.546,.394]],center:[.622,.379],rise:.022,tilt:[-.045,-.045],blend:.39,feather:.010},
 {points:[[.510,.484],[.648,.466],[.703,.493],[.672,.541],[.558,.539],[.531,.574]],center:[.600,.514],rise:.010,tilt:[-.022,.012],blend:.48,feather:.009},
 {points:[[.620,.422],[.718,.413],[.799,.439],[.832,.485],[.873,.553],[.830,.545],[.779,.489],[.666,.472],[.630,.459]],center:[.746,.470],rise:.008,tilt:[.012,-.010],blend:.38,feather:.009}
];
const preparedBodyVolumes=bodyVolumes.map(([cx,cy,rx,ry,rise,angle])=>({cx,cy,ix:1/(rx*rx),iy:1/(ry*ry),rise,c:Math.cos(angle),s:Math.sin(angle)}));
const preparedBodyPanels=bodyPanels.map(panel=>{
 const us=panel.points.map(p=>p[0]),vs=panel.points.map(p=>p[1]);let area=0;
 for(let i=0,j=panel.points.length-1;i<panel.points.length;j=i++)area+=panel.points[j][0]*panel.points[i][1]-panel.points[j][1]*panel.points[i][0];
 return {...panel,minU:Math.min(...us)-panel.feather,maxU:Math.max(...us)+panel.feather,minV:Math.min(...vs)-panel.feather,maxV:Math.max(...vs)+panel.feather,orientation:area>=0?1:-1};
});
function bodyPanelMask(u:number,v:number,panel:typeof preparedBodyPanels[number]):{mask:number;du:number;dv:number}{
 if(u<panel.minU||u>panel.maxU||v<panel.minV||v>panel.maxV)return {mask:0,du:0,dv:0};
 let inside=false,best=Infinity,gx=0,gy=0,boundary=false;
 for(let i=0,j=panel.points.length-1;i<panel.points.length;j=i++){
  const [ax,ay]=panel.points[j],[bx,by]=panel.points[i],ex=bx-ax,ey=by-ay;
  if((ay>v)!==(by>v)&&u<(bx-ax)*(v-ay)/(by-ay)+ax)inside=!inside;
  const t=clamp(((u-ax)*ex+(v-ay)*ey)/(ex*ex+ey*ey)),rx=u-(ax+ex*t),ry=v-(ay+ey*t),d=rx*rx+ry*ry;
  if(d<best){best=d;const length=Math.sqrt(d);boundary=length<1e-10;if(boundary){const edge=Math.hypot(ex,ey)||1;gx=-ey/edge*panel.orientation;gy=ex/edge*panel.orientation;}else{gx=rx/length;gy=ry/length;}}
 }
 const distance=Math.sqrt(best),sign=inside?1:-1,t=clamp((sign*distance+panel.feather)/(2*panel.feather)),mask=t*t*(3-2*t),derivative=t>0&&t<1?6*t*(1-t)/(2*panel.feather):0;
 const direction=boundary?1:sign;return {mask,du:derivative*gx*direction,dv:derivative*gy*direction};
}
/** A continuous normalized body-height field and its exact u/v derivatives.
 * Geometry remains the same through jacket/undershirt/armor color boundaries. */
export function samplePortraitBody(u:number,v:number):{height:number;du:number;dv:number;formBlend:number}{
 const x=(u-.445)/.49,raw=1-.48*x*x,q=Math.sqrt(Math.max(.30,raw));
 let height=.059+.021*q-.008*(v-.60),du=raw>.30?-.021*.48*x/(.49*q):0,dv=-.008;
 for(const {cx,cy,ix,iy,rise,c,s} of preparedBodyVolumes){
  const px=u-cx,py=v-cy,lx=c*px+s*py,ly=-s*px+c*py,value=rise*Math.exp(-(lx*lx*ix+ly*ly*iy));
  height+=value;du+=value*(-2*lx*c*ix+2*ly*s*iy);dv+=value*(-2*lx*s*ix-2*ly*c*iy);
 }
 const chest=Math.exp(-ellipse(u,v,.410,.603,.260,.195)),shoulder=Math.exp(-ellipse(u,v,.750,.505,.180,.130)),sleeve=Math.exp(-ellipse(u,v,.815,.740,.170,.290));
 let formBlend=clamp(.64+.34*chest+.14*shoulder+.13*sleeve,.64,1);
 for(const panel of preparedBodyPanels){
  const shape=bodyPanelMask(u,v,panel),plane=panel.rise+panel.tilt[0]*(u-panel.center[0])+panel.tilt[1]*(v-panel.center[1]);
  height+=shape.mask*plane;du+=shape.du*plane+shape.mask*panel.tilt[0];dv+=shape.dv*plane+shape.mask*panel.tilt[1];
  formBlend=formBlend*(1-shape.mask)+panel.blend*shape.mask;
 }
 return {height,du,dv,formBlend};
}

function normal(out:Float32Array,index:number,gx:number,gy:number):void {
 const length=Math.hypot(gx,gy,1),p=index*3;out[p]=-gx/length;out[p+1]=-gy/length;out[p+2]=1/length;
}
/** Analytic rounded section with a physical tip taper. Radius and base-depth
 * rates are measured per pixel of arc length, so the normal is the derivative
 * of the exact height used by the occlusion geometry. */
export function sampleTaperedLock(riseAtRoot:number,rootRadius:number,localRadius:number,radiusRate:number,crossDistance:number,baseDepthRate:number,alongDistance=0,parameterActive=true):{height:number;crossSlope:number;tangentSlope:number} {
 const r=Math.max(.001,localRadius),root=Math.max(.001,rootRadius),q=crossDistance/r,a=alongDistance/r,height=riseAtRoot*(r/root)*Math.exp(-1.65*(q*q+a*a));
 return {height,crossSlope:-3.3*crossDistance*height/(r*r),tangentSlope:parameterActive?baseDepthRate+height*(radiusRate/r)*(1+3.3*q*q):-3.3*alongDistance*height/(r*r)};
}
/** Smooth parametric surfaces. Local normals are evaluated on their own
 * surface, never by differentiating across another material or an occluder.
 * The same continuous surface height is used for inter-object cast tests. */
export function buildPortraitGeometry(materials:Uint8Array,alpha:Uint8Array,width:number,height:number):PortraitGeometry {
 const count=width*height,depth=new Float32Array(count),normals=new Float32Array(count*3),surfaces=new Uint8Array(count),formBlend=new Uint8Array(count),gx=new Float32Array(count),gy=new Float32Array(count);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x;if(alpha[index]===0){surfaces[index]=255;continue;}
  const u=(x+.5)/width,v=(y+.5)/height,surface=portraitSurface(materials[index],u,v);surfaces[index]=surface;
  let z=0,dx=0,dy=0;
  if(surface===0){
   const rx=.18,ry=.116,xx=(u-.447)/rx,yy=(v-.229)/ry,q=Math.sqrt(Math.max(.25,1-.45*(xx*xx+yy*yy)));
   z=.127+.032*q+.10*(u-.447)*width/height;dx=-.032*height*.45*xx/(rx*width*q)+.10;dy=-.032*.45*yy/(ry*q);
   const px=(u-.388)/.028,py=(v-.258)/.038,nose=.003*Math.exp(-px*px-py*py);z+=nose;dx+=nose*height*(-2*px)/(.028*width);dy+=nose*(-2*py)/.038;
  }else if(surface===3){
   const xx=clamp((u-.516)/.08,-.94,.94),q=Math.sqrt(1-xx*xx*.6);z=.105+.018*q+.025*(v-.34);dx=-.018*height*.6*xx/(.08*width*q);dy=.025;formBlend[index]=170;
  }else if(materials[index]===1||surface===1){
   const xx=clamp((u-.48)/.32,-1.1,1.1),yy=clamp((v-.185)/.22,-1.1,1.1),q=Math.sqrt(Math.max(.28,1-.38*xx*xx-.30*yy*yy));
   if(surface===1){z=.10+.028*q;dx=-.028*height*.38*xx/(.32*width*q);dy=-.028*.30*yy/(.22*q);}
   else{const lx=clamp((u-.5)/.45,-1.1,1.1),lq=Math.sqrt(Math.max(.3,1-.5*lx*lx));z=(surface===5?.007:.102)+.018*lq;dx=-.018*height*.5*lx/(.45*width*lq);dy=0;}
  }else{
   const body=samplePortraitBody(u,v);z=body.height;dx=body.du*height/width;dy=body.dv;formBlend[index]=Math.round(body.formBlend*255);
  }
  depth[index]=z*height;gx[index]=dx;gy[index]=dy;
 }
 // Closest segment projection eliminates rectangular sample joins and max-
 // height intersections. A rounded lock has one smooth cross section.
 const baseDepth=depth.slice(),baseGx=gx.slice(),baseGy=gy.slice(),nearest=new Float32Array(count);nearest.fill(Infinity);
 function curvePass(curve:Curve,fold:boolean):void {
  if(fold)nearest.fill(Infinity);
  const length=curve.p.slice(1).reduce((sum,p,i)=>sum+Math.hypot((p.x-curve.p[i].x)*width,(p.y-curve.p[i].y)*height),0),steps=Math.max(12,Math.ceil(length/5));
  const zadd=fold?new Float32Array(count):null,dxadd=fold?new Float32Array(count):null,dyadd=fold?new Float32Array(count):null;
  for(let step=0;step<steps;step++){
   const t0=step/steps,t1=(step+1)/steps,a=bezier(curve,t0),b=bezier(curve,t1),ax=a.x*width,ay=a.y*height,ex=(b.x-a.x)*width,ey=(b.y-a.y)*height,len2=ex*ex+ey*ey,len=Math.sqrt(len2)||1,tx=ex/len,ty=ey/len;
   const r0=(curve.width[0]*(1-t0)+curve.width[1]*t0)*width,r1=(curve.width[0]*(1-t1)+curve.width[1]*t1)*width,pad=Math.max(r0,r1)*(fold?2.4:1.5)+1;
   const minX=Math.max(0,Math.floor(Math.min(ax,ax+ex)-pad)),maxX=Math.min(width-1,Math.ceil(Math.max(ax,ax+ex)+pad)),minY=Math.max(0,Math.floor(Math.min(ay,ay+ey)-pad)),maxY=Math.min(height-1,Math.ceil(Math.max(ay,ay+ey)+pad));
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const index=y*width+x;if(alpha[index]===0||(fold?surfaces[index]!==2:surfaces[index]!==1&&surfaces[index]!==4&&surfaces[index]!==5))continue;
    const px=x+.5-ax,py=y+.5-ay,s=clamp((px*ex+py*ey)/(len2||1)),rx=px-ex*s,ry=py-ey*s,t=t0+(t1-t0)*s,radius=Math.max(1,r0+(r1-r0)*s),distance2=rx*rx+ry*ry,score=distance2/(radius*radius);
    if(score>=nearest[index]||score>(fold?5.76:2.25))continue;
    nearest[index]=score;
    const across=-ty*rx+tx*ry,alongResidual=rx*tx+ry*ty,outsideStart=step===0&&s===0&&alongResidual<0,outsideEnd=step===steps-1&&s===1&&alongResidual>0,cap=outsideStart||outsideEnd;
    const radiusRate=(r1-r0)/len,baseRate=fold?0:(curve.z[1]-curve.z[0])*height*(t1-t0)/len,section=sampleTaperedLock(curve.rise*height,curve.width[0]*width,radius,radiusRate,across,baseRate,cap?alongResidual:0,!cap);
    const dx=-ty*section.crossSlope+tx*section.tangentSlope,dy=tx*section.crossSlope+ty*section.tangentSlope;
    if(fold){zadd![index]=section.height;dxadd![index]=dx;dyadd![index]=dy;}
    else{
     const reference=surfaces[index]===1?.128:surfaces[index]===5?.025:.12;
     depth[index]=baseDepth[index]+(curve.z[0]*(1-t)+curve.z[1]*t-reference)*height+section.height;
     gx[index]=baseGx[index]+dx;
     gy[index]=baseGy[index]+dy;
    }
   }
  }
  if(fold)for(let index=0;index<count;index++){depth[index]+=zadd![index];gx[index]+=dxadd![index];gy[index]+=dyadd![index];const crease=clamp(zadd![index]/Math.max(height*.008,curve.rise*height));if(crease>0)formBlend[index]=Math.min(formBlend[index],Math.round(formBlend[index]*(1-.38*crease)));}
 }
 for(const curve of hairLocks)curvePass(curve,false);
 for(const curve of clothFolds)curvePass(curve,true);
 for(let index=0;index<count;index++)if(alpha[index])normal(normals,index,clamp(gx[index],-1.8,1.8),clamp(gy[index],-1.8,1.8));
 return {depth,normals,surfaces,formBlend};
}
