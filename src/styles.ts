import type { LightSettings, ShadowStyle, Study, Swatch } from './types';

export interface PaletteStyle {
  id:string; name:string; subtitle:string; description:string;
  /** Skin, hair, cloth, accent, backdrop. Additional materials repeat the order. */
  colors:readonly string[];
  light?:Readonly<Partial<LightSettings>>;
}

// Appearance-based descriptions are intentional: these are useful starting
// palettes, not claims to reproduce any particular illustrator's technique.
export const paletteStyles:readonly PaletteStyle[]=[
  {id:'clear-anime',name:'Clear anime',subtitle:'日系赛璐璐',description:'Peach skin, midnight hair, cool blue cloth, and a bright red accent.',colors:['#F4C7AE','#29364E','#6C9DC1','#DA5B61','#DCE9EC']},
  {id:'soft-pastel',name:'Soft pastel',subtitle:'柔和粉彩',description:'Gentle pinks, lavender hair, muted mint, and a warm cream background.',colors:['#F1CCBF','#A498B6','#A6C8BD','#D698AC','#F0E7D7']},
  {id:'coastal-light',name:'Coastal light',subtitle:'清透海盐',description:'Fresh sea-glass colors with sandy warmth and an open, airy blue.',colors:['#EBC4A9','#4E6570','#78B9BD','#E1B975','#E1EFEB']},
  {id:'warm-nostalgic',name:'Warm nostalgic',subtitle:'暖调复古',description:'Amber, walnut, and rust, balanced by faded teal.',colors:['#DDB08C','#57433B','#77918B','#C57C4E','#D4C4A5']},
  {id:'muted-editorial',name:'Muted illustration',subtitle:'低饱和插画',description:'Quiet slate and sage with a restrained terracotta accent.',colors:['#D5B39E','#50545F','#939E8D','#B87968','#DEDBCF']},
  {id:'vivid-pop',name:'Vivid pop',subtitle:'高彩撞色',description:'Strong cobalt and coral, anchored by deep violet and warm skin.',colors:['#F1B793','#342B58','#456ECB','#F07568','#E5CF74']},
  {id:'night-neon',name:'Night neon',subtitle:'霓虹夜色',description:'Violet, teal, and magenta against deep blue for a night illustration.',colors:['#D5A9B7','#292844','#457C91','#DB6AA9','#232C4D']},
  {id:'earthy-gouache',name:'Earthy paint',subtitle:'自然厚涂',description:'Clay, moss, ochre, and warm paper with a subdued painted feel.',colors:['#D5AB8B','#5C5348','#858D62','#C29A52','#D6CBB3']}
];

export interface ShadowStylePreset {
  id:ShadowStyle; name:string; subtitle:string; description:string;
  light:Readonly<Partial<LightSettings>>; shading:Study['shading'];
}
export const shadowStyles:readonly ShadowStylePreset[]=[
  {id:'anime',name:'Anime cel',subtitle:'赛璐璐',description:'Crisp light and shadow shapes, a restrained halftone, and small highlights.',shading:'cel',light:{strength:.6,shadow:.58,hueShift:9,saturation:1,bounce:.16}},
  {id:'soft',name:'Soft painted',subtitle:'半厚涂',description:'Blended planes, softer shadow transitions, and gentle reflected color.',shading:'smooth',light:{strength:.53,shadow:.47,hueShift:8,saturation:.94,bounce:.3}},
  {id:'graphic',name:'Graphic contrast',subtitle:'平面插画',description:'Bold two-tone separation and very little reflected light.',shading:'cel',light:{strength:.7,shadow:.76,hueShift:0,saturation:1.04,bounce:.06}},
  {id:'luminous',name:'Luminous color',subtitle:'清透光感',description:'Airy values, colorful shadows, and a softer, brighter light impression.',shading:'smooth',light:{strength:.62,shadow:.32,hueShift:14,saturation:1.08,bounce:.36}}
];

/** Apply base colors only. Selection, material identities, names, and locks stay. */
export function applyPaletteStyle(colors:Swatch[],id:string):Swatch[] {
  const preset=paletteStyles.find(style=>style.id===id);
  return colors.map((color,index)=>({...color,hex:!color.locked&&preset?preset.colors[index%preset.colors.length]:color.hex}));
}

/** Lighting shape presets never replace a user's palette or move the light. */
export function applyShadowStyle(study:Study,id:ShadowStyle):Study {
  const preset=shadowStyles.find(style=>style.id===id);
  if(!preset)return {...study,colors:study.colors.map(color=>({...color})),light:{...study.light}};
  return {...study,colors:study.colors.map(color=>({...color})),light:{...study.light,...preset.light},shading:preset.shading,shadowStyle:preset.id};
}
