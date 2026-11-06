# ArtLab 2.0

A standalone color and lighting studio for illustrators, companion to [FoldLight](https://zzxc-w.github.io/FoldLight/). ArtLab has its own TypeScript/Vite project, assets, Git repository, local storage, and scope-specific offline cache. FoldLight is not a runtime dependency and its source is unchanged.

**Open [ArtLab](https://zzxc-w.github.io/ArtLab/)** · [Source repository](https://github.com/zzxc-w/ArtLab)

## Use the studio

- Edit up to eight named base colors with the saturation/value field, hue slider, native picker, or exact HSV, HEX, and RGB values. The saturation/value field also accepts arrow keys, with Shift for larger steps.
- Each base color generates Highlight, Halftone, Base, Shadow, and Reflected light. Tap any color to copy its HEX. The base anchor remains unchanged by lighting controls.
- Start from Soft studio, Sunlight, Moonlight, Sunset, or Overcast, then adjust temperature, strength, shadow depth, shadow hue drift, saturation, reflected color, bounce, and direction.
- Compare cel and smooth artwork. Portrait assigns the first five materials to skin, hair, cloth, accent, and backdrop; Materials shows all colors as spheres. Values removes hue for a luminance study. These are artistic plane/color studies, not physical material or spectral simulations.
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

**18 logic/data tests and 15 production browser checks passed on Windows Chrome.** Tests cover sRGB/HSV/HEX conversions, the sRGB transfer curve, known D65 Oklab values and gamut mapping, lighting ramp bounds/value order, locking, deterministic image extraction, import validation, storage errors, editable PNG/JSON round-trips and CRC checking. Browser checks exercise color editing, gestures, harmonies, presets, previews/values, library persistence, real downloads and image extraction, themes, responsive layouts, offline reload, whitespace names, and import races.

```sh
npm run build
npm run preview -- --port 4180
TEST_URL=http://127.0.0.1:4180/ npm run test:browser
```

For PowerShell set `$env:TEST_URL='http://127.0.0.1:4180/'` before the browser command. Browser tests use installed Chrome and a fresh context. Reports, screenshots, and exports go to ignored `test-results/`.

Actual iPad Safari, Pencil, Home Screen installation, and Safari's download/share flows remain manual checks. Color output is sRGB, without ICC profile management, HDR, CMYK, alpha editing, cloud sync, or source-image editing. Image extraction is a dominant-color approximation; it does not infer semantic skin/hair/material regions. Portrait lighting is a stylized vector study, while sphere shading gives a simpler shape reference.

The color engine uses the standard sRGB transfer curve and [Ottosson's D65 Oklab matrices](https://bottosson.github.io/posts/oklab/). Lighting blends in linear light and uses perceptual adjustments with chroma reduction for sRGB gamut mapping. Its ramp model is deliberately tuned for illustration rather than photometric prediction.

## Architecture and deployment

```text
src/main.ts       UI, accessible controls, undo/redo, import sequencing
src/color.ts      Pure color conversions, harmonies, and lighting ramps
src/preview.ts    Local Canvas2D cel/smooth portrait and sphere studies
src/library.ts    Versioned validation and independent local persistence
src/extract.ts    Bounded image decoding and perceptual color extraction
src/io.ts         Palette PNG metadata and local import/export
src/style.css     FoldLight-inspired themes, panels, responsive safe areas
vite.config.ts   Relative build and generated, scope-isolated service worker
scripts/icons.mjs Deterministic vector and opaque PWA icon generation
```

GitHub Pages source is **GitHub Actions**. `.github/workflows/pages.yml` installs locked dependencies, runs logic tests, builds the static app, and deploys only `dist/`. Pushes to `main` publish automatically. This pipeline and repository are separate from FoldLight.
