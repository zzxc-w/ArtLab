// These checks inspect the decoded portrait and the final Canvas pixels. They
// intentionally avoid calling the geometry helpers that build the lighting.
const atlasWidth=547,atlasHeight=820;

export async function measurePortraitGeometry(page){
 return page.evaluate(({width,height})=>{
  const count=width*height,depth=new Float32Array(count),normals=new Float32Array(count*3),materials=new Uint8Array(count),surfaces=new Uint8Array(count),alpha=new Uint8Array(count),ink=new Uint8Array(count),clean=new Uint8Array(count);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const index=y*width+x,p=window.artlabPortraitProbe((x+.5)/width,(y+.5)/height);
   depth[index]=p.depth;normals.set([p.normal.x,p.normal.y,p.normal.z],index*3);materials[index]=p.material;surfaces[index]=p.surface;alpha[index]=Math.round(p.alpha*255);ink[index]=Math.round(p.ink*255);
  }
  // A guard around each texel prevents ink, silhouette and paint boundaries
  // from being mistaken for a discontinuity on one continuous surface.
  for(let y=3;y<height-3;y++)for(let x=3;x<width-3;x++){
   const index=y*width+x;if(alpha[index]!==255||ink[index]!==0)continue;
   let interior=true;
   for(let dy=-3;dy<=3&&interior;dy++)for(let dx=-3;dx<=3;dx++){
    const other=(y+dy)*width+x+dx;
    if(alpha[other]!==255||ink[other]>7||materials[other]!==materials[index]||surfaces[other]!==surfaces[index]){interior=false;break;}
   }
   if(interior)clean[index]=1;
  }
  const regions={collar:{u0:.26,u1:.71,v0:.33,v1:.46},shirt:{u0:.23,u1:.56,v0:.45,v1:.75},armor:{u0:.61,u1:.87,v0:.41,v1:.56},sleeve:{u0:.63,u1:.94,v0:.49,v1:.78}};
  const bySurface={},byRegion=Object.fromEntries(Object.keys(regions).map(name=>[name,{pairs:0,maxNormalJump:0,over20:0,worst:null}]));
  let gradientSamples=0,maxGradientError=0,worstGradient=null,maxUnitError=0;
  for(let y=3;y<height-3;y++)for(let x=3;x<width-3;x++){
   const index=y*width+x;if(!clean[index])continue;
   const n=index*3,nx=normals[n],ny=normals[n+1],nz=normals[n+2],dx=(depth[index+1]-depth[index-1])/2,dy=(depth[index+width]-depth[index-width])/2,length=Math.hypot(dx,dy,1);
   const error=Math.max(Math.abs(nx+dx/length),Math.abs(ny+dy/length),Math.abs(nz-1/length));
   gradientSamples++;maxUnitError=Math.max(maxUnitError,Math.abs(Math.hypot(nx,ny,nz)-1));
   if(error>maxGradientError){maxGradientError=error;worstGradient={u:(x+.5)/width,v:(y+.5)/height,surface:surfaces[index],material:materials[index],normal:[nx,ny,nz],depthGradient:[dx,dy]};}
   const surface=surfaces[index],stats=bySurface[surface]??={pairs:0,maxNormalJump:0,over20:0,worst:null};
   for(const offset of [1,width]){
    const other=index+offset;if(!clean[other]||surfaces[other]!==surface||materials[other]!==materials[index])continue;
    const m=other*3,dot=nx*normals[m]+ny*normals[m+1]+nz*normals[m+2],angle=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
    const sample={u:(x+.5)/width,v:(y+.5)/height,axis:offset===1?'x':'y',material:materials[index],angle,depthStep:depth[other]-depth[index]};
    const record=result=>{result.pairs++;if(angle>20)result.over20++;if(angle>result.maxNormalJump){result.maxNormalJump=angle;result.worst=sample;}};
    record(stats);
    if(surface===2)for(const [name,box] of Object.entries(regions))if(sample.u>=box.u0&&sample.u<=box.u1&&sample.v>=box.v0&&sample.v<=box.v1)record(byRegion[name]);
   }
  }
  window.artlabVisualTestAtlas={width,height,depth,normals,materials,surfaces,alpha,ink,clean};
  return {gradientSamples,maxGradientError,worstGradient,maxUnitError,bySurface,byRegion};
 },{width:atlasWidth,height:atlasHeight});
}

export async function measurePortraitRaster(page){
 return page.locator('#preview').evaluate(canvas=>{
  const atlas=window.artlabVisualTestAtlas;if(!atlas)throw new Error('Measure the portrait atlas before its raster.');
  const {width,height,materials,surfaces,clean}=atlas,bounds=canvas.getBoundingClientRect(),image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),origin=window.artlabPortraitProbe(0,0),end=window.artlabPortraitProbe(1,1);
  const sourceAt=new Int32Array(canvas.width*canvas.height).fill(-1),luma=new Float32Array(sourceAt.length),regions={collar:{u0:.26,u1:.71,v0:.33,v1:.46},shirt:{u0:.23,u1:.56,v0:.45,v1:.75},armor:{u0:.61,u1:.87,v0:.41,v1:.56},sleeve:{u0:.63,u1:.94,v0:.49,v1:.78}};
  const results=Object.fromEntries(Object.keys(regions).map(name=>[name,{pairs:0,maxLumaJump:0,maxFormLumaJump:0,over20:0,over20Form:0,castEdges:0,worst:null,worstForm:null}]));
  const cast=new Float32Array(width*height).fill(-1);
  const castNear=source=>{
   const sx=source%width,sy=Math.floor(source/width);
   // The displayed portrait is resampled. Reject a cast footprint, not merely
   // the rounded center texel, before calling an edge a form discontinuity.
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const index=(sy+dy)*width+sx+dx;
    if(cast[index]<0)cast[index]=window.artlabPortraitLightProbe((sx+dx+.5)/width,(sy+dy+.5)/height).occlusion;
    if(cast[index]>.005)return true;
   }
   return false;
  };
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const u=((x+.5)*bounds.width/canvas.width-origin.x)/(end.x-origin.x),v=((y+.5)*bounds.height/canvas.height-origin.y)/(end.y-origin.y),sx=Math.floor(u*width),sy=Math.floor(v*height);
   if(sx<0||sx>=width||sy<0||sy>=height)continue;
   const source=sy*width+sx;if(!clean[source]||surfaces[source]!==2)continue;
   const pixel=y*canvas.width+x,offset=pixel*4;sourceAt[pixel]=source;luma[pixel]=image.data[offset]*.2126+image.data[offset+1]*.7152+image.data[offset+2]*.0722;
  }
  for(let y=0;y<canvas.height-1;y++)for(let x=0;x<canvas.width-1;x++){
   const pixel=y*canvas.width+x,source=sourceAt[pixel];if(source<0)continue;
   const u=(source%width+.5)/width,v=(Math.floor(source/width)+.5)/height;
   for(const offset of [1,canvas.width]){
    const neighbor=sourceAt[pixel+offset];if(neighbor<0||materials[neighbor]!==materials[source])continue;
    const gap=Math.abs(luma[pixel]-luma[pixel+offset]),sample={u,v,axis:offset===1?'x':'y',material:materials[source],gap,luma:luma[pixel],neighborLuma:luma[pixel+offset]};
    const castEdge=gap>8&&(castNear(source)||castNear(neighbor));
    for(const [name,box] of Object.entries(regions))if(u>=box.u0&&u<=box.u1&&v>=box.v0&&v<=box.v1){
     const result=results[name];result.pairs++;if(gap>20)result.over20++;if(gap>result.maxLumaJump){result.maxLumaJump=gap;result.worst=sample;}
     if(castEdge)result.castEdges++;
     else{if(gap>20)result.over20Form++;if(gap>result.maxFormLumaJump){result.maxFormLumaJump=gap;result.worstForm=sample;}}
    }
   }
  }
  return results;
 });
}
