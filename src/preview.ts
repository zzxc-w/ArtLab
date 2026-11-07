import type { Ramp, Study } from './types';
import { getLightVector, shadeValue, sampleRamp } from './lighting';
import { drawPortrait } from './portrait';

type RGB = [number,number,number];
type Vec3 = {x:number;y:number;z:number};
const TAU=Math.PI*2;
const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,value));
const parse=(hex:string):RGB=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const linear=(value:number)=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const encoded=(value:number)=>Math.round(clamp(value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055)*255);
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>encoded(linear(v)*(1-t)+linear(b[i])*t)) as RGB;
const gray=(c:RGB):RGB=>{const y=encoded(.2126*linear(c[0])+.7152*linear(c[1])+.0722*linear(c[2]));return [y,y,y];};
const css=(c:RGB)=>`rgb(${c.map(v=>Math.round(v)).join(',')})`;
const normalized=(x:number,y:number,z:number):Vec3=>{const length=Math.hypot(x,y,z)||1;return {x:x/length,y:y/length,z:z/length};};
const fallback:Ramp={base:'#C5B8A5',highlight:'#F2DAB1',halftone:'#D8B994',shadow:'#665B70',reflected:'#847C91'};
const imageCache=new Map<string,HTMLCanvasElement>();

/** Local anime material study. The drawn forms share the source vector/depth
 * used by the visible handle and sphere study, with local hair/nose/chin casts.
 */
export function renderPreview(canvas:HTMLCanvasElement,study:Study,ramps:Ramp[],options?:{width?:number;height?:number;export?:boolean}):void {
  const width=clamp(options?.width??(canvas.clientWidth||680),1,4096),height=clamp(options?.height??(canvas.clientHeight||640),1,4096);
  const dpr=options?.export?1:Math.min(window.devicePixelRatio||1,2);
  const targetWidth=Math.max(1,Math.round(width*dpr)),targetHeight=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==targetWidth)canvas.width=targetWidth;if(canvas.height!==targetHeight)canvas.height=targetHeight;
  const context=canvas.getContext('2d');if(!context)return;
  const ctx:CanvasRenderingContext2D=context;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const key=getLightVector(study.light),strength=clamp(study.light.strength),bounce=clamp(study.light.bounce);
  const lightTheme=study.theme==='light'||study.theme==='system'&&matchMedia('(prefers-color-scheme:light)').matches;
  const rgb=(value:RGB)=>study.values?gray(value):value;
  const color=(hex:string)=>css(rgb(parse(hex)));
  const fixed=(hex:string,alpha=1)=>{const value=rgb(parse(hex));return `rgba(${value.join(',')},${alpha})`;};
  const ramp=(index:number)=>ramps[index]||ramps[0]||fallback;
  const shade=(r:Ramp,n:Vec3)=>sampleRamp(r,shadeValue(n,study.light),study.shading,study.shadowStyle);

  // The backdrop is a paint swatch, so its displayed base must stay exact.
  ctx.fillStyle=color(ramp(4).base);ctx.fillRect(0,0,width,height);

  // Color lookup is evaluated only 256 times per material; the pixel loop then
  // performs a dot product, retaining responsive iPad interaction.
  const tables=new Map<Ramp,RGB[]>();
  function lookup(r:Ramp):RGB[]{
    const known=tables.get(r);if(known)return known;
    const perpendicular=normalized(key.y,-key.x,0);
    const table=Array.from({length:256},(_,i)=>{
      const dot=i/255,side=Math.sqrt(Math.max(0,1-dot*dot));
      const n={x:key.x*dot+perpendicular.x*side,y:key.y*dot+perpendicular.y*side,z:key.z*dot};
      return rgb(parse(shade(r,n)));
    });tables.set(r,table);return table;
  }
  if(study.preview==='spheres'){
    const count=Math.max(1,Math.min(8,study.colors.length)),columns=count<=3?count:count<=6?3:4,rows=Math.ceil(count/columns);
    const availableWidth=Math.min(width-40,940),cellWidth=availableWidth/columns,cellHeight=Math.min((height-70)/rows,290),radius=Math.max(14,Math.min(cellWidth*.36,cellHeight*.33,118));
    const top=(height-cellHeight*rows)/2;
    for(let i=0;i<count;i++){
      const row=Math.floor(i/columns),remaining=Math.min(columns,count-row*columns),offset=(width-cellWidth*remaining)/2;
      const x=offset+cellWidth*(i%columns+.5),y=top+cellHeight*(row+.43),r=ramp(i);
      ctx.globalAlpha=.24*strength;ctx.fillStyle=fixed('#101920');ctx.beginPath();ctx.ellipse(x-key.x*strength*radius*.48,y+radius*1.16-key.y*strength*radius*.12,radius*.82,radius*.13,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
      const size=Math.min(380,Math.max(100,Math.round(radius*2*dpr))),cacheKey=JSON.stringify(['sphere',size,r,study.light,study.shading,study.shadowStyle,study.values]);
      let image=imageCache.get(cacheKey);
      if(!image){
        image=document.createElement('canvas');image.width=image.height=size;
        const c=image.getContext('2d')!,pixels=c.createImageData(size,size),table=lookup(r),reflected=rgb(parse(r.reflected));
        for(let py=0;py<size;py++)for(let px=0;px<size;px++){
          const nx=((px+.5)/size-.5)*2,ny=((py+.5)/size-.5)*2,radial=nx*nx+ny*ny;if(radial>1)continue;
          const nz=Math.sqrt(1-radial),diffuse=Math.max(0,nx*key.x+ny*key.y+nz*key.z);
          let value=table[Math.round(clamp(diffuse)*255)];
          if(diffuse<.3&&nz<.5&&bounce>0&&strength>0)value=mix(value,reflected,bounce*strength*(1-diffuse/.3)*(1-nz/.5)*.6);
          const p=(py*size+px)*4;pixels.data[p]=value[0];pixels.data[p+1]=value[1];pixels.data[p+2]=value[2];pixels.data[p+3]=Math.round(clamp((1-Math.sqrt(radial))*size*.65)*255);
        }
        c.putImageData(pixels,0,0);imageCache.set(cacheKey,image);if(imageCache.size>30)imageCache.delete(imageCache.keys().next().value!);
      }
      ctx.drawImage(image,x-radius,y-radius,radius*2,radius*2);
      const active=study.colors[i]?.id===study.selected;
      ctx.strokeStyle=fixed(active?(lightTheme?'#8B6936':'#D9BF8B'):(lightTheme?'#5D6C61':'#AEBEAE'),active?.9:.18);
      ctx.lineWidth=active?2:1;ctx.beginPath();ctx.arc(x,y,radius+5,0,TAU);ctx.stroke();
      ctx.fillStyle=color(r.base);ctx.beginPath();ctx.roundRect(x-radius*.29,y+radius*1.49,radius*.58,8,4);ctx.fill();
    }
    return;
  }

  drawPortrait(ctx,study,ramps,width,height,options);
}
