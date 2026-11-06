# Remaining iPad verification

Automated production checks run in desktop Chrome with tablet/phone viewport sizes. Verify the following on an actual iPad Safari/Home Screen app:

1. Install from HTTPS using Share → Add to Home Screen. Confirm the centered icon, readable header below system chrome, and reachable controls in portrait/landscape and split view.
2. Use finger and Pencil on saturation/value and hue. Open/close both drawers; scroll each panel and main content independently. Check all numeric fields, HEX paste, and native color selection.
3. Compare cel/smooth and Portrait/Materials with all presets. Change every lighting control, then values mode. Check that base anchors remain unchanged and the displayed ramp matches the study.
4. Test locking, harmony generation, extraction from several local images, all locked colors, add/remove colors, grayscale/black/white anchors, and undo/redo.
5. Save/reload/load/remove library entries. Export JSON, palette PNG, and illustration PNG through Safari's download/share flow. Reimport the original palette PNG and JSON, and verify names, locks, and lighting. Try a malformed or oversize file and confirm the previous study survives.
6. Follow device theme while switching iPad appearance. Check both explicit themes and rotation with the keyboard or system file picker open.
7. Wait for offline-ready status. Close/reopen in airplane mode, edit colors, extract a local image, load a palette, and export a PNG. Return online before checking updates.
8. Open a newer build, allow it to cache, close all ArtLab app windows/tabs, and reopen. Verify saved studies remain. Check FoldLight independently; both apps must preserve their own library/cache.
