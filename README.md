# ArtLab 2.0

A standalone color and lighting studio for illustrators, companion to [FoldLight](https://zzxc-w.github.io/FoldLight/). ArtLab has its own TypeScript/Vite project, assets, Git repository, local storage, and scope-specific offline cache. FoldLight is not a runtime dependency and its source is unchanged.

**Open [ArtLab](https://zzxc-w.github.io/ArtLab/)** · [Source repository](https://github.com/zzxc-w/ArtLab)

## Use the studio

- Edit up to eight named base colors with the saturation/value field, hue slider, native picker, or exact HSV, HEX, and RGB values. The saturation/value field also accepts arrow keys, with Shift for larger steps.
- Each base color generates Highlight, Halftone, Base, Shadow, and Reflected light. Tap any color to copy its HEX. The base anchor remains unchanged by lighting controls.
- **Live lighting** is off by default and remembers your choice on this device. The light handle is locked. Adjust the lighting controls, then press **Apply lighting** once; palette edits still update with the last applied light. Pending lighting edits do not enter autosave, library entries, or exports. Turning Live lighting on applies the pending controls and enables dragging.
- With Live lighting on, drag the gold key light to change its angle. **Front depth** tilts it toward the viewer. Dragging uses a lighter preview and returns to full quality on release. Arrow keys on the focused light adjust angle/depth; Home resets its position. Face, hair locks, and clothing folds share the source direction. Cast shadows are limited to meaningful foreground overlaps, rather than treating every small bump as an occluder.
- **Base colors** switches the key off and restores it on a second press. Material interiors then show their chosen base colors without painted lighting. Moving an inactive source updates the guide without rerasterizing the artwork.
- Start from Soft studio, Sunlight, Moonlight, Sunset, or Overcast, then adjust temperature, strength, shadow depth, shadow hue drift, saturation, reflected color, bounce, angle, and front depth.
- Open **Palette looks** above the preview for eight color stories: Clear anime / 日系赛璐璐, Soft pastel / 柔和粉彩, Coastal light / 清透海盐, Warm nostalgic / 暖调复古, Muted illustration / 低饱和插画, Vivid pop / 高彩撞色, Night neon / 霓虹夜色, and Earthy paint / 自然厚涂. These apply only to unlocked base colors and keep the current light and finish.
- **Shadow & finish** offers Anime cel / 赛璐璐, Soft painted / 半厚涂, Graphic contrast / 平面插画, and Luminous color / 清透光感. They adjust the shading and lighting-ramp treatment while preserving every base color and source position. Palette and finish presets can be combined independently.
- Compare cel and softly painted lighting on an original game-anime portrait. The first five materials map to skin, all hair, the outer jacket, gold hardware and irises, and backdrop. Armor, undershirt, straps, and eye whites remain fixed neutrals. Material ownership comes from a separate flat-color source rather than guessing from a shaded painting; linework stays independent of the fill colors. Pure black, white, and saturated edits use the selected color directly. The backdrop also displays its exact selected base. Materials shows all study colors as spheres. Values removes hue for a luminance study.
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

**44 logic/data tests and 24 production browser checks passed on Windows Chrome.** Tests cover sRGB/HSV/HEX conversions, the sRGB transfer curve, known D65 Oklab values and gamut mapping, lighting ramp bounds/value order, locking, deterministic image extraction, import validation, storage errors, editable PNG/JSON round-trips and CRC checking, source-vector geometry, shadow finishes, palette looks, and migration of older saved files. Portrait regressions cover exact unlit paint, black/white and saturated edits, material isolation, fixed neutrals, ink/alpha decoding, local hair-lock normals, and source-directed casts. Browser checks verify actual canvas RGB at 17 independently chosen material interiors, no recoloring leakage, two nearby faces of one hair lock reversing their shading, the Base colors comparison, all prior editing/import/export/theme/layout flows, offline reload, and missing-asset error/export recovery. New regressions also cover manual drafts, Discard/Apply, remembered live preference, disabled source input, applied-light exports, interactive-to-final refinement, no unnecessary unlit redraws, semantic cast ownership, and numerical surface gradients.

```sh
npm run build
npm run preview -- --port 4180
TEST_URL=http://127.0.0.1:4180/ npm run test:browser
```

For PowerShell set `$env:TEST_URL='http://127.0.0.1:4180/'` before the browser command. Browser tests use installed Chrome and a fresh context. Reports, screenshots, and exports go to ignored `test-results/`.

Actual iPad Safari, Pencil, Home Screen installation, and Safari's download/share flows remain manual checks. Color output is sRGB, without ICC profile management, HDR, CMYK, alpha editing, cloud sync, or source-image editing. Image extraction is a dominant-color approximation; it does not infer semantic skin/hair/material regions. Portrait lighting uses a flat illustration, independent linework, and continuous authored surfaces for hair locks, face, and clothing folds. Foreground hair can cast onto face/clothing, and the head can cast onto the neck; small slopes shade locally without producing noisy terrain shadows. This is an approximate 2.5D study: hidden geometry and distant off-screen occluders are not represented. Lighting off is a true flat-color palette check.

v2.4.0 replaces the overlapping height-tube terrain with continuous surfaces and restricts casts to foreground overlaps. It adds remembered manual/live control, lighter live previews, reusable lighting tables, and redraw suppression for unchanged artwork. Exact palette fills and independent ink remain. The flat illustration is bundled and cached offline; no AI service is called at runtime. Exports always use the last applied light and full render quality. Existing version-2 JSON, ArtLab PNGs, saved studies, and libraries remain compatible.

The runtime flat-color artwork is [src/assets/portrait-flats.png](src/assets/portrait-flats.png), edited from the original using the built-in image generation tool. Its [edit prompt](src/assets/portrait-flats-prompt.txt) records the unlit-material brief. The earlier shaded [original](src/assets/game-portrait.png) and [generation prompt](src/assets/portrait-prompt.txt) remain as source references and are not used as runtime albedo. Wuthering Waves and Arknights informed the broad contemporary anime-game direction; no franchise character or game asset is included.

The color engine uses the standard sRGB transfer curve and [Ottosson's D65 Oklab matrices](https://bottosson.github.io/posts/oklab/). Lighting blends in linear light and uses perceptual adjustments with chroma reduction for sRGB gamut mapping. Its ramp model is deliberately tuned for illustration rather than photometric prediction.

## Architecture and deployment

Warm source-angle updates measured in the same Windows Chrome session setup at 1440 × 1050, six angles per mode, after palette setup:

| Preview | v2.3 median frame work | v2.4 median frame work |
| --- | ---: | ---: |
| Cel, dragging | 100.5 ms | 17.4 ms |
| Painted, dragging | 110.4 ms | 15.4 ms |
| Cel, full quality | 96.5 ms | 39.1 ms |
| Painted, full quality | 106.9 ms | 35.3 ms |

Dragging temporarily uses a 480-pixel source raster and restores the 820-pixel final raster on release. Frame work includes the application's drawing callback and excludes time waiting for animation frames. Actual device speed and first-time palette/asset setup vary. Manual pending-light edits perform no canvas draw.

```text
src/main.ts       UI, accessible controls, undo/redo, import sequencing
src/color.ts      Pure color conversions, harmonies, and lighting ramps
src/preview.ts    Preview composition, analytic material spheres
src/portrait.ts   Cached color response, preview quality, cross-surface casts
src/portrait-model.ts Hard material decoding, palette sampling, cast ownership
src/portrait-geometry.ts Continuous tapered hair/fold surfaces and normals
src/assets/       Flat portrait, original reference, and generation briefs
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
