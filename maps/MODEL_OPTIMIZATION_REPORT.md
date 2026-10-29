# Model optimization report (re-inventory)

## Current supplied assets

- 113 standalone GLBs are staged under `client/public/models/`: 110 from `models-glb&gltf/` plus three broadleaf tree models found in `refrence/`. Originals remain in place.
- Runtime model folder size: **1,289,524 bytes (1,259.3 KiB)**, below the 10 MB target.
- Parsed total: **13,680 triangles**. Largest model: `crops_wheatStageA.glb` at 720 triangles. The largest tree is `tree_pineRoundB.glb` at 262 triangles, below the approximate 5,000-triangle tree target.
- The reference folder contains 144 PNG/JPG images; they are not loaded by the app. There are no `.gltf`, `.bin`, or external texture companion files.

## Optimization status

`gltf-transform optimize` has not run. The CLI is not installed and the earlier package-download approval was not granted. All input assets are already GLB, so there is no conversion work. Current counts and size are source measurements, not optimized output.

## Asset decisions

- Use `plant_bushDetailed.glb` as the same model/material for bush decoys and disguised hiders; do not use `grass_large.glb` as a bush.
- No large-rock GLB was found; use `rock_smallTopB.glb` at 2.5x for the shared boulder disguise model. `rock_largeF_*` files are preview images only.
- Broadleaf variants `tree_plateau.glb`, `tree_plateau_dark.glb`, and `tree_plateau_fall.glb` were found in the reference folder and copied into the runtime model folder.
- Fence and crop models are now present; use those assets in Zone C.
- Cabin remains a primitive build in Zone C with red wooden walls, dark roof, round window, and door.

## Primitive and shader fallbacks

Use procedural geometry/shaders for terrain, the luminous S-curved water and banks, animated shimmer, lily pads, reeds/cattails, bats, and fireflies. The cabin is built from primitives because no cabin model was supplied. Use models where present for cobblestone paths, bridges, trees, bushes, fences, crops, stumps, and rocks.
