# Shadow Hunt - Project Specification

## Scope and milestone workflow

Build a multiplayer hide-and-seek game with a Vite + Three.js client and Node + Socket.IO server. Keep the HUD, minimap, FPS/draw-call panel, quality toggle, and audio-unlock button. Rebuild the world from scratch around one map loaded from `/maps/forest.json`; the old rooftop/forest map, layout, props, lighting, paths, river, trees, and camp are obsolete. External GLB/glTF assets are allowed and required when supplied.

Work one named milestone at a time. Milestone 1 is staged: Step 0 asset inventory and planning, then 1A terrain/river/paths/lighting, 1B zones/trees/rocks/props, and 1C cabin yard/tents/crops/ambient life/polish. Stop after each requested stage for review. Do not commit unless explicitly asked. Do not add extra maps, reconnect/host migration, or an advanced scoreboard.

## Asset rules

Use `/reference` images only as visual references; never load them in the game. Load provided `.glb` and `.gltf` models, preserving companion files where needed. Normalize models to the game scale and apply a shared palette grade. Do not replace a supplied model with primitive geometry. Primitive or shader geometry is allowed for missing assets and for the cabin when no building model exists, as well as river details such as lily pads, reeds, leaves, and water effects. Use `InstancedMesh` for repeated models and foliage where practical.

## Visual direction

Match the supplied high-angle scene reference: a calm magical moonlit night, slight top-down camera tilt, readable emerald/teal ground, soft blue-green shadows, and a luminous cyan-teal river as the brightest feature. Low-poly trees and rocks use blue-teal, grey-green, and slate tones, lighter tops, darker undersides, soft rim light, and soft ground shadows. Grade bright red/orange source materials into the muted teal palette. Paths use only rounded, irregular grey-teal stones set into the grass, with size/rotation variation and soft worn edges. Do not use a flat path ribbon or any other path material. Keep the initial map bright; structure lighting so Milestone 4 vision/fog can be added without a lighting rewrite. Store the sampled palette in `/client/src/palette.js` and use it everywhere.

## Camera and scale

Use a player-follow camera from above, tilted approximately 55-60 degrees from the horizon. The player is about 1 unit tall, trees 4-6 units, tents about 3 units, and the cabin 6-8 units. Normalize models on load. Canopies within about 6 units of the player fade to semi-transparent; canopies must cover only a small portion of the screen.

## Map organization

Use one long rectangle approximately 240 x 120 units, represented by `/maps/forest.json`, with three 80 x 120 zones in a row. All zones share the same ground, river, stone path style, and lighting.

- **A - Pine Hollow:** dense supplied pine groves, narrow gaps, grouped bushes and rocks; landmark is one huge ancient pine.
- **B - Marsh Wood:** medium density, using the supplied broadleaf/plateau trees, dead trunks/logs, reeds, purple plants, and mossy boulders; landmarks are a hollow-log grouping and boulder ring.
- **C - Cabin Clearing:** sparse trees; only zone with buildings and human objects. Arrange a primitive cabin, fenced stone-edged yard, grouped tents, straight crop rows, stumps, and wood piles.

## River, water interaction, and bridges

One S-curved stream runs through the entire map. It has varied width, a bright cyan-teal center, darker banks, scrolling ripple/normal detail, flowing highlights, shimmer, and small foam near banks and rocks. Reeds, lily pads, and floating leaves sway or drift gently using shaders and instancing. Keep effects inexpensive.

Water is wadeable everywhere and never blocks movement. In shallow water the player moves at 65 percent of land speed; in the deep center channel the player moves at 45 percent. Export tunable speed constants plus `isInWater(x, z)` and `waterDepth(x, z)` from `/shared/water.js` so both client and server can use the same calculation in later milestones. On water entry, spawn ripple rings and small splash particles at the feet; while wading, leave a short fading wake. These effects are visual only.

Put one bridge model at each of the four river/path crossing points, with at least one bridge in each zone. Fit the model span to the local river width with its ends landing on both banks, orient it to the path, and grade warm colors to the teal palette. Bridges are shortcuts, not water barriers: players may wade under, beside, or around them. Bridge areas use full walking speed and suppress splashes. Each crossing reads a configurable model path from map data. Bridges have no collision.

## Paths

Keep a connected, data-driven graph in `/maps/forest.json`, linking all zones with junctions, loops, and dead ends. Every path surface consists only of closely set, larger embedded rounded stones with a lighter grey-teal grade and soft worn edges. Do not use wood, dirt ribbons, or another material as a path. For every candidate stone, call shared `isInWater(x,z)` and reject it in water or within 1.0 unit of the river bank. Paths stop at the water's edge and cross only over bridges; stones resume in line on the far bank. Include rejected water/bank candidate counts in the placement report. Style configuration should include model set, stone spacing, size range, and variation seed, so path styling can change later without changing graph topology. Paths cross the river only at the four bridge nodes. Keep at least 1.5 units clear on both sides of paths and crossings; no props in that band, and avoid overlap or z-fighting.

## Placement, hider props, and collision

Use deliberate groups (groves, 3-6-rock clusters, log piles, reed beds, crop rows, tent rows), not isolated random scatter. Use fixed-seed randomness. Reject placements that overlap paths, the river, other objects, or map edges. Report placed and rejected counts by zone/type.

Provide at least 50 each of stump, boulder, and bush hider props across the zones. Disguised hiders and decoys must use the same exact model, scale range (0.9-1.1), and material, with small color variation. Decorative items must be visually distinct from these three hider types. The shared bush model is `plant_bushDetailed.glb`; `grass_large.glb` is grass and must never be used as a bush. No large-rock GLB is supplied, so use one selected small faceted rock model scaled 2-3x for every boulder decoy/disguise.

Use simple invisible circle/box collisions for trunks, rocks, tents, cabin, and fence segments. Canopies and bridges have no collision. Water is always traversable; crossing the river never requires a bridge.

## Performance and code organization

Use `InstancedMesh` for repeated models. Target 60 FPS on laptops and 30+ FPS on phones. Preserve the FPS/draw-call panel and High/Medium/Low quality toggle. Keep model loading, terrain, river, paths, trees, props, buildings, lighting, ambient life, palette, and placement validation in separate modules. Shared movement/water constants and queries belong in `/shared`.

## Audio and later milestones

Milestone 1A has **no sound**. Keep only the existing audio-unlock button. Add game audio in Milestone 5.

2. Rooms/lobby, join by code, state sync/interpolation for 2+ players.
3. Roles, prop disguises, hunter weapons/strikes, win/loss, random role rotation.
4. Server-side vision/fog and hider danger sense; add darkness overlay here.
5. Audio, loading/how-to-play screens, particles, and UI polish.
6. Mobile controls and responsive layout.
7. Deployment configuration (`render.yaml`, `process.env.PORT`, README) and two-device test.
