# ArtLab 2.0

A standalone color and lighting studio for illustrators, companion to [FoldLight](https://zzxc-w.github.io/FoldLight/). ArtLab has its own TypeScript/Vite project, assets, Git repository, local storage, and scope-specific offline cache. FoldLight is not a runtime dependency and its source is unchanged.

**Open [ArtLab](https://zzxc-w.github.io/ArtLab/)** · [Source repository](https://github.com/zzxc-w/ArtLab)

## Use the studio

- Edit up to eight named base colors with the saturation/value field, hue slider, native picker, or exact HSV, HEX, and RGB values. The saturation/value field also accepts arrow keys, with Shift for larger steps.
- Each base color generates Highlight, Halftone, Base, Shadow, and Reflected light. Tap any color to copy its HEX. The base anchor remains unchanged by lighting controls.
- Drag the visible gold key light around the preview to change its screen angle. **Front depth** tilts it from side lighting toward the viewer. Face, hair, neck, clothing, and spheres share that source direction, with local bangs, nose, and chin cast shadows. Arrow keys on the focused light adjust angle/depth; Home resets its position. Zero light strength removes directional effects; the portrait retains its original painted volume.
- Start from Soft studio, Sunlight, Moonlight, Sunset, or Overcast, then adjust temperature, strength, shadow depth, shadow hue drift, saturation, reflected color, bounce, angle, and front depth.
- Open **Palette looks** above the preview for eight color stories: Clear anime / 日系赛璐璐, Soft pastel / 柔和粉彩, Coastal light / 清透海盐, Warm nostalgic / 暖调复古, Muted illustration / 低饱和插画, Vivid pop / 高彩撞色, Night neon / 霓虹夜色, and Earthy paint / 自然厚涂. These apply only to unlocked base colors and keep the current light and finish.
- **Shadow & finish** offers Anime cel / 赛璐璐, Soft painted / 半厚涂, Graphic contrast / 平面插画, and Luminous color / 清透光感. They adjust the shading and lighting-ramp treatment while preserving every base color and source position. Palette and finish presets can be combined independently.
- Compare cel and softly painted lighting on a detailed original game-anime illustration: a three-quarter portrait with refined anime facial features, layered hair, and a technical field jacket. Portrait assigns the first five materials to skin, hair, cloth, accent, and backdrop; Materials shows all colors as spheres. Dark linework, neutral costume panels, and fine painted details remain readable as material colors change. Values removes hue for a luminance study.
- Generate analogous, complementary, split complementary, triadic, or monochromatic harmonies around the selected anchor. Locks preserve base colors during harmony generation and image extraction. Locked base colors can still be edited manually, and their lighting ramps still respond to the light.
- Extract dominant colors from a local PNG, JPEG, WebP, or other browser-decodable raster image. Transparent pixels are ignored. Extraction replaces only unlocked materials. SVG is intentionally rejected. Images stay in this browser and are not uploaded.
- Undo/redo study edits with the visible buttons, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z when not typing in an input.
- Save up to 30 full studies in the local library. Each includes colors, locks, light, preview settings, and theme. Browser storage is not cloud sync; export backups for another device.

## Import and export

**Palette JSON** contains the editable study in a versioned, validated format. **Palette PNG** contains a labeled color table plus the same editable data in a PNG metadata chunk. Import an original ArtLab palette PNG to restore the full study exactly. An ordinary image PNG opens color extraction instead. External image editors may strip PNG metadata; keep JSON when an exact editable backup matters.

**Illustration PNG** exports the clean preview artwork at 1800 × 1800, without interface overlays. All exports are local browser downloads. Files are limited to 20 MB on import; image extraction also limits source dimensions to 40 megapixels and samples a maximum 192-pixel edge.

## Run and build

Requires Node.js 20.19+; Node 24 is used for deployment.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. Direct Node entry points also work:

```sh
node scripts/run.mjs dev --port 5180
node scripts/run.mjs test
node scripts/run.mjs build
node scripts/run.mjs preview --port 4180
node scripts/run.mjs browser
```

The complete static application is in `dist/`. Serve it over HTTPS or localhost; `file://` does not support modules or PWA installation. No backend, account, external fonts, CDN, or AI API is used. The relative build works at a project subpath.

## iPad and offline use

Open the published site in Safari, then **Share → Add to Home Screen**. Open once online and wait for **App ready for offline use** in Help. The production service worker caches the complete app, assets, and icons. Image extraction, editing, saved palettes, and exports can then work offline. Development mode does not install a worker.

The header uses standard Apple status-bar behavior and safe-area spacing. Narrow layouts provide separate Colors and Lighting drawers; the preview and palette remain available in the main workspace. Light, Dark, and Device theme preferences are remembered.

Updates download in the background and activate after all ArtLab tabs/Home Screen windows close and reopen. Offline caches are isolated by app name and URL scope. ArtLab uses `artlab.study.v2` and `artlab.library.v2`; it does not read or write FoldLight's storage. Clearing browser data can remove both palettes and offline files.

## Validation

**31 logic/data tests and 20 production browser checks passed on Windows Chrome.** Tests cover sRGB/HSV/HEX conversions, the sRGB transfer curve, known D65 Oklab values and gamut mapping, lighting ramp bounds/value order, locking, deterministic image extraction, import validation, storage errors, editable PNG/JSON round-trips and CRC checking, source-vector geometry, shadow finishes, palette looks, and migration of older saved files. Browser checks exercise color editing, gestures, harmonies, all palette/finish presets, source dragging/keyboard/depth, zero-key pixel invariance, previews/values, library persistence, real downloads and image extraction, themes, responsive layouts, offline reload, whitespace names, and import races. Additional checks verify the bundled portrait has decoded before use, each of its four materials visibly recolors, and the illustration loads during a disconnected reload.

```sh
npm run build
npm run preview -- --port 4180
TEST_URL=http://127.0.0.1:4180/ npm run test:browser
```

For PowerShell set `$env:TEST_URL='http://127.0.0.1:4180/'` before the browser command. Browser tests use installed Chrome and a fresh context. Reports, screenshots, and exports go to ignored `test-results/`.

Actual iPad Safari, Pencil, Home Screen installation, and Safari's download/share flows remain manual checks. Color output is sRGB, without ICC profile management, HDR, CMYK, alpha editing, cloud sync, or source-image editing. Image extraction is a dominant-color approximation; it does not infer semantic skin/hair/material regions. Portrait lighting combines a bundled painted illustration with approximate material masks, analytic normal fields, and localized cast shadows. The illustration retains intrinsic painted volume even when the adjustable key is off; zero key strength removes all direction-dependent effects. It is an artist's color study rather than a ray-traced 3D character, so arbitrary relighting cannot erase every painted highlight or shadow. The Materials view provides a simpler geometry reference.

v2.2.0 replaces the procedural vector character with an original illustrated game-anime portrait and material-aware recoloring. The image is bundled and cached for offline use; nothing is generated or sent to an AI service at runtime. Illustration exports wait for the asset to decode, and export a consistent snapshot of the study. Existing version-2 JSON, ArtLab PNGs, saved studies, and libraries remain compatible.

The original transparent artwork is [src/assets/game-portrait.png](src/assets/game-portrait.png), created with the built-in image generation tool. Its [final generation prompt](src/assets/portrait-prompt.txt) records the visual brief. Wuthering Waves and Arknights informed the broad contemporary anime-game direction; no franchise character or game asset is included.

The color engine uses the standard sRGB transfer curve and [Ottosson's D65 Oklab matrices](https://bottosson.github.io/posts/oklab/). Lighting blends in linear light and uses perceptual adjustments with chroma reduction for sRGB gamut mapping. Its ramp model is deliberately tuned for illustration rather than photometric prediction.

## Architecture and deployment

```text
src/main.ts       UI, accessible controls, undo/redo, import sequencing
src/color.ts      Pure color conversions, harmonies, and lighting ramps
src/preview.ts    Preview composition, analytic material spheres
src/portrait.ts   Bundled illustration, material recoloring, directional shading
src/assets/       Original transparent portrait and generation brief
src/lighting.ts   Shared source vector, normal response, and ramp sampling
src/styles.ts     Independent palette looks and shadow-finish presets
src/library.ts    Versioned validation and independent local persistence
src/extract.ts    Bounded image decoding and perceptual color extraction
src/io.ts         Palette PNG metadata and local import/export
src/style.css     FoldLight-inspired themes, panels, responsive safe areas
src/styles-ui.css Source guide and palette/finish preset controls
vite.config.ts   Relative build and generated, scope-isolated service worker
scripts/icons.mjs Deterministic vector and opaque PWA icon generation
```

GitHub Pages source is **GitHub Actions**. `.github/workflows/pages.yml` installs locked dependencies, runs logic tests, builds the static app, and deploys only `dist/`. Pushes to `main` publish automatically. This pipeline and repository are separate from FoldLight.
