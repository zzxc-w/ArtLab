type Point={x:number;y:number};
type Curve={p:[Point,Point,Point,Point];width:[number,number];rise:number};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const point=(x:number,y:number):Point=>({x,y});
const ellipse=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>((x-cx)/rx)**2+((y-cy)/ry)**2;
export interface PortraitGeometry {depth:Float32Array;normals:Float32Array;surfaces:Uint8Array;formBlend:Uint8Array}
function lock(p:number[],width0:number,width1:number,rise:number):Curve {
  return {p:[point(p[0],p[1]),point(p[2],p[3]),point(p[4],p[5]),point(p[6],p[7])],width:[width0,width1],rise};
}
// Each path follows a visible lock in the flat drawing. Its rounded section
// supplies local depth, independent of the pigment and fine ink laid over it.
const hairLocks:Curve[]=[
  lock([.46,.038,.37,.018,.29,.080,.215,.18],.055,.008,.017),
  lock([.45,.037,.34,.030,.23,.14,.20,.24],.060,.012,.022),
  lock([.455,.040,.33,.060,.30,.155,.295,.225],.060,.014,.023),
  lock([.453,.041,.36,.090,.35,.190,.385,.235],.058,.008,.026),
  lock([.448,.042,.39,.105,.41,.205,.342,.240],.050,.010,.024),
  lock([.456,.041,.44,.100,.42,.172,.433,.205],.045,.009,.020),
  lock([.46,.040,.51,.080,.54,.130,.563,.198],.054,.012,.025),
  lock([.46,.040,.55,.055,.64,.105,.637,.165],.060,.013,.021),
  lock([.47,.038,.58,.015,.68,.105,.668,.145],.056,.010,.017),
  lock([.47,.035,.57,.000,.63,.050,.654,.103],.041,.010,.015),
  lock([.30,.125,.235,.18,.235,.245,.32,.267],.031,.006,.020),
  lock([.268,.194,.22,.25,.29,.280,.34,.289],.030,.006,.018),
  lock([.257,.225,.21,.30,.22,.355,.31,.374],.031,.006,.020),
  lock([.237,.265,.19,.335,.25,.36,.28,.383],.029,.006,.018),
  lock([.54,.160,.555,.235,.54,.28,.51,.295],.027,.004,.018),
  lock([.575,.178,.59,.25,.55,.295,.54,.342],.025,.007,.018),
  lock([.624,.190,.64,.29,.61,.38,.61,.46],.033,.010,.017),
  lock([.657,.194,.67,.30,.77,.37,.85,.48],.038,.012,.019),
  lock([.655,.240,.71,.34,.84,.39,.90,.52],.038,.015,.019),
  lock([.69,.30,.77,.40,.98,.49,.925,.62],.034,.010,.018),
  lock([.80,.43,.95,.52,1.01,.63,.93,.68],.031,.008,.017),
  lock([.87,.54,1.01,.68,.98,.78,.905,.84],.026,.006,.015),
  lock([.88,.68,.97,.78,.93,.87,.91,.93],.023,.005,.014),
  lock([.28,.31,.27,.36,.14,.41,.09,.46],.030,.006,.018),
  lock([.29,.35,.19,.40,.09,.48,.15,.52],.029,.006,.017),
  lock([.26,.36,.21,.43,.12,.50,.08,.55],.023,.005,.015),
  lock([.566,.303,.55,.39,.49,.46,.44,.478],.020,.005,.020),
  lock([.544,.355,.50,.43,.42,.47,.43,.525],.026,.004,.022),
  lock([.54,.405,.48,.47,.35,.51,.40,.58],.025,.006,.021),
  lock([.512,.455,.43,.51,.39,.57,.48,.58],.027,.004,.021),
  lock([.472,.49,.39,.56,.37,.60,.44,.634],.018,.004,.016)
];
// Secondary garment folds stay shallow and broad. Narrow high ridges produced
// sharp streaks inside otherwise smooth chest/shoulder volumes, even with a
// mathematically continuous field. The main anatomical volumes do the shaping.
const fold=(p:number[],width:number,rise:number):Curve=>({p:[point(p[0],p[1]),point(p[2],p[3]),point(p[4],p[5]),point(p[6],p[7])],width:[width*1.4,width*1.12],rise:rise*.40});
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
// The collar/lapel/armor shapes are broad cloth volumes, not raised polygon
// platforms. A feathered polygon height creates a steep wall along every mask
// edge, including edges with no seam in the drawing. Those artificial walls
// used to turn into bright rectangular rims when the key came from below.
type BodyPanel={center:readonly [number,number];radii:readonly [number,number];angle:number;rise:number;tilt:readonly [number,number];blend:number};
const bodyPanels:ReadonlyArray<BodyPanel>=[
 {center:[.380,.403],radii:[.118,.060],angle:-.24,rise:.012,tilt:[.018,-.025],blend:.43},
 {center:[.622,.374],radii:[.087,.062],angle:-.10,rise:.017,tilt:[-.032,-.030],blend:.39},
 {center:[.600,.514],radii:[.098,.057],angle:-.12,rise:.007,tilt:[-.022,.012],blend:.48},
 {center:[.746,.470],radii:[.132,.042],angle:.30,rise:.006,tilt:[.012,-.010],blend:.38}
];
const preparedBodyVolumes=bodyVolumes.map(([cx,cy,rx,ry,rise,angle])=>({cx,cy,ix:1/(rx*rx),iy:1/(ry*ry),rise,c:Math.cos(angle),s:Math.sin(angle)}));
const preparedBodyPanels=bodyPanels.map(panel=>({...panel,ix:1/(panel.radii[0]**2),iy:1/(panel.radii[1]**2),c:Math.cos(panel.angle),s:Math.sin(panel.angle)}));
/** A continuous normalized body-height field and its exact u/v derivatives.
 * Geometry remains the same through jacket/undershirt/armor color boundaries. */
export function samplePortraitBody(u:number,v:number):{height:number;du:number;dv:number;formBlend:number}{
 const x=(u-.445)/.49,raw=1-.48*x*x,q=Math.sqrt(Math.max(.30,raw));
 let height=.059+.021*q-.008*(v-.60),du=raw>.30?-.021*.48*x/(.49*q):0,dv=-.008;
 for(const {cx,cy,ix,iy,rise,c,s} of preparedBodyVolumes){
  const px=u-cx,py=v-cy,lx=c*px+s*py,ly=-s*px+c*py,value=rise*Math.exp(-(lx*lx*ix+ly*ly*iy));
  height+=value;du+=value*(-2*lx*c*ix+2*ly*s*iy);dv+=value*(-2*lx*s*ix-2*ly*c*iy);
 }
 // Broad fabric/anatomy stays continuous in Cel mode too. Mixing a hard
 // palette step into an otherwise smooth chest or sleeve still creates a
 // narrow stripe as its normal crosses a band threshold. Only the authored
 // collar/lapel panels below retain a firmer local treatment; ink and actual
 // cast boundaries stay distinct in the renderer.
 let formBlend=1;
 for(const panel of preparedBodyPanels){
  const px=u-panel.center[0],py=v-panel.center[1],lx=panel.c*px+panel.s*py,ly=-panel.s*px+panel.c*py;
  const mask=Math.exp(-1.4*(lx*lx*panel.ix+ly*ly*panel.iy)),mu=mask*(-2.8*lx*panel.c*panel.ix+2.8*ly*panel.s*panel.iy),mv=mask*(-2.8*lx*panel.s*panel.ix-2.8*ly*panel.c*panel.iy);
  const plane=panel.rise+panel.tilt[0]*px+panel.tilt[1]*py;
  height+=mask*plane;du+=mu*plane+mask*panel.tilt[0];dv+=mv*plane+mask*panel.tilt[1];
  formBlend=formBlend*(1-mask)+panel.blend*mask;
 }
 return {height,du,dv,formBlend};
}

function normal(out:Float32Array,index:number,gx:number,gy:number):void {
 const length=Math.hypot(gx,gy,1),p=index*3;out[p]=-gx/length;out[p+1]=-gy/length;out[p+2]=1/length;
}
const smoothstep=(a:number,b:number,v:number):number=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
// The three hair IDs are cast-layer labels, not geometric seams. In
// particular, v=.39 and u=.73 must not put a step into a continuous lock.
function sameGeometrySurface(a:number,b:number):boolean {
 return a===b||(a===1||a===4||a===5)&&(b===1||b===4||b===5);
}
/** One coherent height field supplies both form normals and cast geometry.
 * Pigment boundaries never change its shape. Overlapping curves blend their
 * heights continuously instead of switching a nearest-curve normal winner. */
export function buildPortraitGeometry(materials:Uint8Array,alpha:Uint8Array,width:number,height:number):PortraitGeometry {
 const count=width*height,depth=new Float32Array(count),normals=new Float32Array(count*3),surfaces=new Uint8Array(count),formBlend=new Uint8Array(count);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x;if(alpha[index]===0){surfaces[index]=255;continue;}
  const u=(x+.5)/width,v=(y+.5)/height,surface=portraitSurface(materials[index],u,v);surfaces[index]=surface;
  let z=0;
  if(surface===0){
   const rx=.18,ry=.116,xx=(u-.447)/rx,yy=(v-.229)/ry,q=Math.sqrt(Math.max(.25,1-.45*(xx*xx+yy*yy)));
   z=.127+.032*q+.10*(u-.447)*width/height;
   const px=(u-.388)/.028,py=(v-.258)/.038;z+=.003*Math.exp(-px*px-py*py);
  }else if(surface===3){
   const xx=clamp((u-.516)/.08,-.94,.94),q=Math.sqrt(1-xx*xx*.6);z=.105+.018*q+.025*(v-.34);formBlend[index]=170;
  }else if(materials[index]===1||surface===1){
   const xx=clamp((u-.48)/.32,-1.1,1.1),yy=clamp((v-.185)/.22,-1.1,1.1),q=Math.sqrt(Math.max(.28,1-.38*xx*xx-.30*yy*yy));
   const lx=clamp((u-.5)/.45,-1.1,1.1),lq=Math.sqrt(Math.max(.3,1-.5*lx*lx)),long=smoothstep(.30,.46,v),back=smoothstep(.64,.94,u)*smoothstep(.34,.58,v);
   z=(.138+.028*q)*(1-long)+(.142+.018*lq)*long-.135*back;
  }else{
   const body=samplePortraitBody(u,v);z=body.height;formBlend[index]=Math.round(body.formBlend*255);
  }
  depth[index]=z*height;
 }
 const nearest=new Float32Array(count),curveValue=new Float32Array(count),curveWeight=new Float32Array(count),hairValue=new Float32Array(count),hairWeight=new Float32Array(count);
 function curvePass(curve:Curve,fold:boolean):void {
  nearest.fill(Infinity);const touched:number[]=[];
  const length=curve.p.slice(1).reduce((sum,p,i)=>sum+Math.hypot((p.x-curve.p[i].x)*width,(p.y-curve.p[i].y)*height),0),steps=Math.max(12,Math.ceil(length/5));
  const support=fold?2.4:2.6,support2=support*support;
  for(let step=0;step<steps;step++){
   const t0=step/steps,t1=(step+1)/steps,a=bezier(curve,t0),b=bezier(curve,t1),ax=a.x*width,ay=a.y*height,ex=(b.x-a.x)*width,ey=(b.y-a.y)*height,len2=ex*ex+ey*ey;
   const r0=(curve.width[0]*(1-t0)+curve.width[1]*t0)*width,r1=(curve.width[0]*(1-t1)+curve.width[1]*t1)*width,pad=Math.max(r0,r1)*support+1;
   const minX=Math.max(0,Math.floor(Math.min(ax,ax+ex)-pad)),maxX=Math.min(width-1,Math.ceil(Math.max(ax,ax+ex)+pad)),minY=Math.max(0,Math.floor(Math.min(ay,ay+ey)-pad)),maxY=Math.min(height-1,Math.ceil(Math.max(ay,ay+ey)+pad));
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const index=y*width+x;if(alpha[index]===0||(fold?surfaces[index]!==2:surfaces[index]!==1&&surfaces[index]!==4&&surfaces[index]!==5))continue;
    const px=x+.5-ax,py=y+.5-ay,s=clamp((px*ex+py*ey)/(len2||1)),rx=px-ex*s,ry=py-ey*s,radius=Math.max(1,r0+(r1-r0)*s),distance2=rx*rx+ry*ry,score=distance2/(radius*radius);
    if(score>=nearest[index]||score>=support2)continue;
    if(nearest[index]===Infinity)touched.push(index);nearest[index]=score;
    // A cubic compact window has zero value and zero first/second
    // derivatives at its support boundary. The shared head/front/back volume
    // supplies the base depth; locks add rounded relief only. Independent
    // per-lock depth levels made oval hills at overlap boundaries rather than
    // the continuous strands visible in the drawing.
    const taper=radius/(curve.width[0]*width),window=(1-score/support2)**3,section=curve.rise*height*taper*Math.exp(-1.65*score);
    if(fold){curveValue[index]=section*window;curveWeight[index]=0;}
    else{curveWeight[index]=Math.exp(-.8*score)*window;curveValue[index]=section;}
   }
  }
  for(const index of touched){
   if(fold)depth[index]+=curveValue[index];
   else{const weight=curveWeight[index];hairValue[index]+=weight*curveValue[index];hairWeight[index]+=weight;}
  }
 }
 for(const curve of hairLocks)curvePass(curve,false);
 for(let index=0;index<count;index++)if(hairWeight[index])depth[index]+=hairValue[index]/(.60+hairWeight[index]);
 for(const curve of clothFolds)curvePass(curve,true);
 // Filter the height itself, never just the normals. The small normalized
 // binomial kernel removes raster/polyline joins without crossing an object
 // boundary or a fine strand into the skin behind it. Cloth paint boundaries
 // remain compatible. Casts use this exact final filtered field too.
 const scratch=new Float32Array(count);
 function filterHeight(horizontal:boolean):void {
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const index=y*width+x;if(!alpha[index]){scratch[index]=depth[index];continue;}
   let sum=depth[index]*2,weight=2;
   for(const direction of [-1,1]){
    const nx=horizontal?x+direction:x,ny=horizontal?y:y+direction;
    if(nx<0||nx>=width||ny<0||ny>=height)continue;
    const other=ny*width+nx;if(!alpha[other]||!sameGeometrySurface(surfaces[index],surfaces[other]))continue;
    sum+=depth[other];weight++;
   }
   scratch[index]=sum/weight;
  }
  depth.set(scratch);
 }
 filterHeight(true);filterHeight(false);filterHeight(true);filterHeight(false);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x;if(!alpha[index])continue;
  const surface=surfaces[index],left=index-1,right=index+1,up=index-width,down=index+width;
  const hasLeft=x>0&&alpha[left]>0&&sameGeometrySurface(surface,surfaces[left]),hasRight=x+1<width&&alpha[right]>0&&sameGeometrySurface(surface,surfaces[right]);
  const hasUp=y>0&&alpha[up]>0&&sameGeometrySurface(surface,surfaces[up]),hasDown=y+1<height&&alpha[down]>0&&sameGeometrySurface(surface,surfaces[down]);
  const dx=hasLeft&&hasRight?(depth[right]-depth[left])*.5:hasRight?depth[right]-depth[index]:hasLeft?depth[index]-depth[left]:0;
  const dy=hasUp&&hasDown?(depth[down]-depth[up])*.5:hasDown?depth[down]-depth[index]:hasUp?depth[index]-depth[up]:0;
  normal(normals,index,dx,dy);
 }
 return {depth,normals,surfaces,formBlend};
}
