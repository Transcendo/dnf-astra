# KARL-17 generation record · 2026-09-10

Tool: built-in `image_gen.imagegen`. No model-selection parameter was exposed. No CLI/API fallback used. User reference was supplied as a visual reference only. The successful third output is retained as `mage-snowman-green.png`; the first two baked-checkerboard images were rejected and are not runtime assets.

## 1. Original sheet

Use case: stylized-concept. Asset type: production 2D side scrolling game sprite sheet, not a concept illustration. Create ORIGINAL female young-adult mage in a plump white snowman costume, short boots, rich red scarf, visible expressive face and dark plum bob hair with two small curled locks, tilted silver cooking-pot lid hat. Detailed clean pixel-art compatible with an ivory sky castle background, navy outlines, ivory highlights, blue lavender shadows, red scarf, golden eyes. True transparent alpha background, no checkerboard, no text, no floor, no shadows. 1536x1024 sheet organized as exact 6 columns x 4 rows of 256x256 cells. Same character and scale in every cell, facing RIGHT three-quarter profile. Foot anchor centered at x128 y232 within every cell, character ~190 pixels high, all parts inside cell with generous margins. Empty right hand gripping an invisible staff at approximately x182 y152; weapons will be separate runtime layers, DO NOT draw weapons or magic effects. Row1 six idle breathing frames; row2 six walking frames alternating short boots and swaying scarf; row3 six casting frames: anticipate, wind up, extend right hand, release, recoil, recover; row4 first two jumping/tucked legs frames, next two hit reaction frames, last two dash frames. Preserve face, hair, lid, costume proportions and grounded foot baseline consistently. Use the attached reference only for broad white plump silhouette, red scarf, short legs; redesign face/hair/lid originally. All 24 cells filled, no overlap, no labels.

## 2. Transparency correction (rejected)

Edit this exact sprite sheet. Preserve all 24 characters, exact poses, pixel positions, layout and dimensions. Remove the baked grey and white checkerboard completely, including tiny gaps between legs and scarf, replacing it with actual transparent alpha. Do not draw checkerboard. If true alpha is unsupported, use perfectly flat solid chroma key green #00ff00 everywhere in background instead, with hard clean edges and no green within characters. Do not change character art, do not add shadows. Output 1536x1024.

## 3. Green-screen correction (accepted)

Replace ALL grey-white checkerboard background with SOLID BRIGHT GREEN #00FF00. This is a GREEN SCREEN sprite sheet. Opaque green background REQUIRED, NO transparency, NO grey, NO checkerboard. Every pixel outside the 24 characters must be solid neon green. Preserve the exact characters, poses, layout and dimensions, remove checkerboard in gaps between legs too. Do not add green to character clothing. Flat 2D game asset, no scene. 1536x1024.

## Postprocessing

The tool did not follow the originally requested density and anchor exactly. The accepted sheet has roughly 230-pixel-tall figures. `npm run assets:prepare` removes the green screen, registers each frame into a padded 288×288 cell without resizing the artwork, and records per-frame grip points. Runtime scale is 0.46 with smoothing, not enlargement of a full concept image. See `ASSETS.md` for final delivered dimensions and validation.
