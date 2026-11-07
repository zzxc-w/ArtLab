import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paletteStyles,shadowStyles,applyPaletteStyle,applyShadowStyle} from '../src/styles.ts';
import {createDefaultStudy,serializeStudy,parseStudyJSON} from '../src/library.ts';

test('curated illustration palettes provide distinct valid five-material color sets',()=>{
  assert.equal(paletteStyles.length,8);assert.equal(new Set(paletteStyles.map(p=>p.id)).size,8);
  assert.equal(new Set(paletteStyles.map(p=>p.colors.join(','))).size,8);
  for(const preset of paletteStyles){
    assert.equal(preset.colors.length,5);assert.ok(preset.colors.every(hex=>/^#[0-9A-F]{6}$/.test(hex)));
    assert.ok(preset.name&&preset.subtitle&&preset.description);
    const study=createDefaultStudy();study.colors=applyPaletteStyle(study.colors,preset.id);
    assert.deepEqual(parseStudyJSON(serializeStudy(study)),study);
  }
});
test('palette presets replace unlocked base colors including selection while preserving material identity',()=>{
  const study=createDefaultStudy();study.colors[1].locked=true;const original=structuredClone(study);
  const colors=applyPaletteStyle(study.colors,'vivid-pop');
  assert.equal(colors.length,study.colors.length);assert.equal(colors[1].hex,study.colors[1].hex);
  assert.notEqual(colors[0].hex,study.colors[0].hex,'A selected but unlocked anchor can change for a palette preset');
  for(let i=0;i<colors.length;i++){assert.equal(colors[i].id,study.colors[i].id);assert.equal(colors[i].name,study.colors[i].name);assert.equal(colors[i].locked,study.colors[i].locked);assert.notEqual(colors[i],study.colors[i]);}
  assert.deepEqual(study,original,'Input study is unchanged');
  const locked=study.colors.map(color=>({...color,locked:true}));assert.deepEqual(applyPaletteStyle(locked,'clear-anime'),locked);
});
test('palette presets safely cover one to eight materials and ignore unknown presets',()=>{
  const base=createDefaultStudy().colors;
  for(const count of [1,3,5,8]){
    const colors=Array.from({length:count},(_,i)=>({...base[i%5],id:'color-'+i}));
    const result=applyPaletteStyle(colors,'coastal-light');assert.equal(result.length,count);assert.ok(result.every(c=>/^#[0-9A-F]{6}$/.test(c.hex)));
  }
  assert.deepEqual(applyPaletteStyle(base,'does-not-exist'),base);assert.deepEqual(applyPaletteStyle([],'clear-anime'),[]);
});
test('shadow styles preserve palettes and source position while selecting useful rendering controls',()=>{
  assert.deepEqual(shadowStyles.map(p=>p.id),['anime','soft','graphic','luminous']);
  const study=createDefaultStudy();study.light.temperature=-.6;study.light.direction=115;study.light.elevation=71;study.light.ambient='#9876AB';study.colors[0].locked=true;
  const before=structuredClone(study),signatures=new Set<string>();
  for(const preset of shadowStyles){
    const result=applyShadowStyle(study,preset.id);assert.equal(result.shadowStyle,preset.id);assert.equal(result.shading,preset.shading);
    assert.deepEqual(result.colors,study.colors);assert.notEqual(result.colors,study.colors);assert.equal(result.selected,study.selected);
    for(const key of ['temperature','direction','elevation','ambient'] as const)assert.equal(result.light[key],study.light[key]);
    assert.deepEqual(parseStudyJSON(serializeStudy(result)),result);signatures.add(JSON.stringify([result.shading,result.light]));
  }
  assert.equal(signatures.size,4);assert.deepEqual(study,before);
});
