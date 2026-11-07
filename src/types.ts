export type Hex = string;
export interface Swatch { id:string; name:string; hex:Hex; locked:boolean }
export interface LightSettings {
  temperature:number; strength:number; shadow:number; hueShift:number;
  saturation:number; bounce:number; ambient:Hex; direction:number; elevation:number;
}
export interface Ramp { base:Hex; highlight:Hex; halftone:Hex; shadow:Hex; reflected:Hex }
export type Harmony = 'analogous'|'complementary'|'split'|'triadic'|'monochrome';
export type Theme = 'system'|'dark'|'light';
export type ShadowStyle = 'anime'|'soft'|'graphic'|'luminous';
export interface Study {
  name:string; colors:Swatch[]; selected:string; light:LightSettings;
  shading:'cel'|'smooth'; shadowStyle:ShadowStyle; preview:'portrait'|'spheres'; values:boolean; theme:Theme;
}
export interface SavedPalette { id:string; name:string; createdAt:string; study:Study }
