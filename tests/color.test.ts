import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHex,hexToRgb,rgbToHex,rgbToHsv,hsvToRgb,srgbToLinear,linearToSrgb,mixLinear,rgbToOklab,oklabToRgb,luminance,contrastRatio,readableInk,buildRamp,generateHarmony} from '../src/color.ts';
import type {LightSettings,Swatch} from '../src/types.ts';

const light:LightSettings={temperature:.5,strength:.7,shadow:.6,hueShift:12,saturation:1,bounce:.3,ambient:'#7184AD',direction:-30};
test('HEX and RGB validation and conversion are canonical and bounded',()=>{
  assert.equal(normalizeHex('#a3F'),'#AA33FF');assert.equal(normalizeHex(' aa33ff '),'#AA33FF');
  for(const value of ['#12','1234567','transparent','rgba(0,0,0,0)','#GGGGGG'])assert.equal(normalizeHex(value),null);
  assert.deepEqual(hexToRgb('#FF8040'),{r:255,g:128,b:64});assert.equal(rgbToHex({r:256,g:127.5,b:-2}),'#FF8000');
  assert.throws(()=>hexToRgb('no color'),TypeError);
});
test('HSV matches primary colors and round-trips an sRGB grid',()=>{
  for(const [hex,hue] of [['#FF0000',0],['#FFFF00',60],['#00FF00',120],['#00FFFF',180],['#0000FF',240],['#FF00FF',300]] as const){const hsv=rgbToHsv(hexToRgb(hex));assert.ok(Math.abs(hsv.h-hue)<1e-9);assert.equal(hsv.s,100);assert.equal(hsv.v,100);assert.equal(rgbToHex(hsvToRgb(hsv)),hex);}
  for(const r of [0,37,128,211,255])for(const g of [0,37,128,211,255])for(const b of [0,37,128,211,255])assert.equal(rgbToHex(hsvToRgb(rgbToHsv({r,g,b}))),rgbToHex({r,g,b}));
  assert.deepEqual(rgbToHsv({r:128,g:128,b:128}),{h:0,s:0,v:128/255*100});assert.equal(rgbToHex(hsvToRgb({h:360,s:100,v:100})),'#FF0000');
});
test('linear-light mixing and luminance use the sRGB transfer curve',()=>{
  assert.ok(Math.abs(srgbToLinear(.5)-.21404114048223255)<1e-12);
  assert.ok(Math.abs(linearToSrgb(.5)-.7353569830524495)<1e-12);
  assert.equal(mixLinear('#000000','#FFFFFF',.5),'#BCBCBC');
  assert.equal(luminance('#000000'),0);assert.equal(luminance('#FFFFFF'),1);assert.equal(contrastRatio('#000000','#FFFFFF'),21);
  for(const hex of ['#111111','#FFFFFF','#D9BF8B','#456CA3'])assert.ok(contrastRatio(hex,readableInk(hex))>=4.5);
  for(let value=0;value<=255;value++){const hex=rgbToHex({r:value,g:value,b:value});assert.ok(contrastRatio(hex,readableInk(hex))>=4.5);}
});
test('Oklab uses D65 reference values, round-trips colors and maps out-of-gamut chroma',()=>{
  const red=rgbToOklab({r:255,g:0,b:0});assert.ok(Math.abs(red.L-.62795536)<1e-7);assert.ok(Math.abs(red.a-.22486306)<1e-7);assert.ok(Math.abs(red.b-.12584630)<1e-7);
  for(const hex of ['#FF0000','#00FF00','#0000FF','#000000','#FFFFFF','#7184AD','#EFB898','#808080'])assert.equal(rgbToHex(oklabToRgb(rgbToOklab(hexToRgb(hex)))),hex);
  for(const L of [0,.1,.5,.9,1])for(const a of [-2,0,2])for(const b of [-2,0,2]){
    const rgb=oklabToRgb({L,a,b});assert.ok(Object.values(rgb).every(c=>Number.isFinite(c)&&c>=0&&c<=255));
    assert.ok(Math.abs(rgbToOklab(rgb).L-L)<1e-6,'Gamut mapping preserves perceptual lightness');
  }
});
test('lighting ramps preserve the base and maintain useful value order across extremes',()=>{
  for(const base of ['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#EFB898','#64577E'])for(const temperature of [-1,0,1])for(const strength of [0,1])for(const shadow of [0,1])for(const saturation of [0,1.5]){
    const ramp=buildRamp(base,{...light,temperature,strength,shadow,saturation,hueShift:temperature*45,bounce:1});
    assert.equal(ramp.base,base);assert.ok(Object.values(ramp).every(hex=>/^#[0-9A-F]{6}$/.test(hex)));
    assert.ok(luminance(ramp.highlight)>=luminance(ramp.halftone));assert.ok(luminance(ramp.halftone)>=luminance(base));assert.ok(luminance(ramp.shadow)<=luminance(base));assert.ok(luminance(ramp.reflected)<=luminance(ramp.halftone));assert.ok(luminance(ramp.reflected)>=luminance(ramp.shadow));
  }
  const noBounce=buildRamp('#EFB898',{...light,bounce:0});assert.equal(noBounce.reflected,noBounce.shadow);
  assert.notEqual(buildRamp('#EFB898',{...light,temperature:-1}).highlight,buildRamp('#EFB898',{...light,temperature:1}).highlight);
  assert.notEqual(buildRamp('#EFB898',{...light,ambient:'#FF0000',bounce:1}).reflected,buildRamp('#EFB898',{...light,ambient:'#0000FF',bounce:1}).reflected);
});
test('harmony generation preserves the selected anchor and locked colors without mutation',()=>{
  const colors:Swatch[]=[{id:'a',name:'Anchor',hex:'#A95050',locked:false},{id:'b',name:'Locked',hex:'#123456',locked:true},{id:'c',name:'Other',hex:'#00FF00',locked:false},{id:'d',name:'Fourth',hex:'#FFFFFF',locked:false}];
  const original=JSON.stringify(colors);
  for(const mode of ['analogous','complementary','split','triadic','monochrome'] as const){
    const generated=generateHarmony(colors,'a',mode);assert.equal(generated[0].hex,colors[0].hex);assert.equal(generated[1].hex,colors[1].hex);assert.notEqual(generated[2].hex,colors[2].hex);assert.equal(generated[2].name,'Other');assert.equal(JSON.stringify(colors),original);
    if(mode==='triadic'){const anchor=rgbToHsv(hexToRgb(colors[0].hex)),other=rgbToHsv(hexToRgb(generated[2].hex));assert.ok(Math.abs(((other.h-anchor.h+360)%360)-120)<1);}
  }
  assert.deepEqual(generateHarmony([],'none','triadic'),[]);
});
