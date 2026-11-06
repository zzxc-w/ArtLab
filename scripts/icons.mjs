// ArtLab's three color swatches, generated without image packages or network.
// Every PNG is an opaque square; the OS supplies the corner or launcher mask.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const background=[29,33,35],angle=-18*Math.PI/180;
const bars=[
  {x:150,top:[236,207,151],bottom:[181,141,80]},
  {x:224,top:[158,198,185],bottom:[92,139,140]},
  {x:298,top:[190,168,198],bottom:[119,96,143]}
];
const hex=rgb=>'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
const publicPath=name=>new URL(`../public/${name}`,import.meta.url);
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${bars.map((bar,i)=>`<linearGradient id="c${i}" gradientUnits="userSpaceOnUse" x1="0" y1="136" x2="0" y2="376"><stop stop-color="${hex(bar.top)}"/><stop offset="1" stop-color="${hex(bar.bottom)}"/></linearGradient>`).join('')}</defs><rect width="512" height="512" fill="${hex(background)}"/><g transform="rotate(-18 256 256)">${bars.map((bar,i)=>`<rect x="${bar.x}" y="136" width="64" height="240" rx="24" fill="url(#c${i})"/>`).join('')}</g></svg>\n`;
writeFileSync(publicPath('icon.svg'),svg);

const crc32=data=>{let value=0xffffffff;for(const byte of data){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
const chunk=(type,data)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};

function png(size,scale=1){
  const samples=4,n=size*samples,pixels=Buffer.alloc((size*3+1)*size);
  const cosine=Math.cos(-angle),sine=Math.sin(-angle);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sum=[0,0,0];
    for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
      const px=(((x*samples+sx+.5)/n)*512-256)/scale;
      const py=(((y*samples+sy+.5)/n)*512-256)/scale;
      const localX=cosine*px-sine*py+256,localY=sine*px+cosine*py+256;
      let color=background;
      for(const bar of bars){
        // Signed distance to the same rounded rectangle used by the SVG.
        const qx=Math.abs(localX-(bar.x+32))-8,qy=Math.abs(localY-256)-96;
        if(Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)<=24){
          const t=Math.min(1,Math.max(0,(localY-136)/240));
          color=bar.top.map((v,i)=>v*(1-t)+bar.bottom[i]*t);break;
        }
      }
      for(let c=0;c<3;c++)sum[c]+=color[c];
    }
    const offset=y*(size*3+1)+1+x*3;
    for(let c=0;c<3;c++)pixels[offset+c]=Math.round(sum[c]/(samples*samples));
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
writeFileSync(publicPath('apple-touch-icon.png'),png(180));
writeFileSync(publicPath('icon-192.png'),png(192));
writeFileSync(publicPath('icon-512.png'),png(512));
writeFileSync(publicPath('icon-maskable.png'),png(512,.9));
