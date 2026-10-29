# Shadow Hunt - Milestone 1A Zone and Route Plan

Coordinates use **x = west to east (0-240)** and **y = south to north (0-120)**. The playable ground is 240 x 120 units, split into three 80 x 120 zones in one row. River and path crossings are shared graph nodes recorded in `maps/forest.json`.

```text
                                         NORTH (y=120)
       ZONE A: PINE HOLLOW             ZONE B: MARSH WOOD             ZONE C: CABIN CLEARING
x=0                                  80                            160                           240
       dense pine groves       |  broadleaf/dead tree groves  |      sparse clearing edge trees
       Ancient pine (18,94)    |  hollow-log group (112,98)  |      primitive cabin (207,92)
       A north loop            |  north log spur             |      cabin yard loop / crops
       river ~~~~~~~~~~          |          ~~~~~~~~           |            ~~~~~~~~~
       bridge XA (70,60) ======+==============================+==========================
       bridge XB (52,44)       |       bridge XC (120,75)      | bridge XD (176,60)
       south loop / rocks     |  boulder ring (138,29)       |  tents / fence / neat rows
       dense groves           |  reeds / logs / clearings    |  wood piles / sparse trees
                                         SOUTH (y=0)
```

The sketch is not to scale. Tables and coordinates below are authoritative. The bridge nodes have been aligned to the stone-path graph so the river crosses the path network only at four places. The map stays bright and readable; no fog-of-war is used in 1A.

## Zone layout

| Zone | Coordinate range | Character and grouped landmarks |
|---|---|---|
| A - Pine Hollow | x 0-80, y 0-120 | Dense pine groves with narrow gaps, grouped bushes and rocks, and the ancient pine near (18,94). Two bridge crossings. |
| B - Marsh Wood | x 80-160, y 0-120 | Medium density with supplied plateau broadleaf trees, bare trunks/logs, grouped reeds and purple plants. Hollow-log grouping near (112,98), boulder ring near (138,29), and one bridge. |
| C - Cabin Clearing | x 160-240, y 0-120 | Sparse trees. Only zone with buildings/human items: primitive red cabin near (207,92), fence, tents, crops in straight rows, stumps, and wood piles. One bridge. |

Terrain, palette, river, lighting, and stone paths are shared across all three zones. Later placements keep a 1.5-unit clear band on both sides of routes and bridges.

## River plan

One S-curved stream flows across the full map. Its centerline controls are:

```text
(58,120) -> (44,95) -> (36,80) -> (50,70) -> (63,64) -> XA (70,60)
-> (70,54) -> (65,48) -> XB (52,44) -> (60,27) -> (80,18) -> (98,29)
-> (110,50) -> XC (120,75) -> (135,88) -> (152,82) -> (168,72)
-> (176,66) -> XD (176,60) -> (176,54) -> (185,48) -> (199,32) -> (218,26) -> exit (240,50)
```

The stream varies in width and has dark teal banks, animated flow/ripples/highlights, subtle foam, and gently drifting/swaying river details. Water is always wadeable. `/shared/water.js` provides shared `isInWater(x,z)` and `waterDepth(x,z)` queries plus tunable land/shallow/deep speed constants. Shallow water runs at 65% of land speed; the deep center channel runs at 45%. Entry splashes, ripple rings, and a short wake are visual only.

## Four optional bridges

Place one supplied `bridge_woodRound.glb` model at each crossing node. The path-direction span is fitted to the local river width plus one unit of bank landing at each end, and the model is rotated to follow the path across the stream. Bridge model paths are configurable in map data. The source's bright orange wood is graded toward the teal palette. Wading remains possible under, beside, or around every bridge; bridges have no collision.

| Node | Coordinates | Zone | Bridge |
|---|---:|---|---|
| XA | (70,60) | A | `bridge_woodRound.glb`, scaled to local channel and banks |
| XB | (52,44) | A | `bridge_woodRound.glb`, scaled to local channel and banks |
| XC | (120,75) | B | `bridge_woodRound.glb`, scaled to local channel and banks |
| XD | (176,60) | C | `bridge_woodRound.glb`, scaled to local channel and banks |

Walking in a bridge footprint uses full land speed and suppresses water effects. The bridge footprint never blocks movement.

## Stone-only path graph

The path network is a graph, not a ribbon. Every path surface is made only of closely-set, large rounded grey-teal stones set into mossy ground, with subtle soft worn edges. Use the supplied faceted stone models with fixed-seed size and rotation variation. Path generation calls shared `isInWater(x,z)` for every candidate and rejects stones in water or within 1.0 unit of a bank; this also clears the reeds beside the channel. Stones stop before each river edge, continue across only on the four bridges, and resume in line on the far bank. The placement report includes water and bank rejection counts. Path style configuration (model set, spacing, scale range, seed, palette) is separate from graph topology.

| Node | Coordinates | Node | Coordinates |
|---|---:|---|---:|
| A0 | (8,60) | A1 | (35,60) |
| XA | (70,60) | A2 | (76,60) |
| XB | (52,44) | B0 | (82,60) |
| B1 | (110,60) | XC | (120,75) |
| B3 | (137,60) | B4 | (156,60) |
| C0 | (164,60) | XD | (176,60) |
| C1 | (190,60) | C3 | (220,60) |
| C4 | (236,60) | A north loop | (20,85) |
| A south loop | (28,36) | B south loop | (94,36) |
| B log spur | (112,98) | B boulder loop | (138,29) |
| C yard north | (207,82) | C yard south | (214,76) |
| C clearing dead end | (231,82) | | |

```text
West entry - A0 - A1 - XA - A2 - B0 - B1 - XC - B3 - B4 - C0 - XD - C1 - C3 - C4 - East entry
               \  /                  \                    \           /        \      /
             A north loop           B south loop           B boulder loop       C yard loop
                  A1 - A south loop - XB - A2              B1 - log spur        C3 - dead end
```

The path graph crosses the river only at XA, XB, XC, and XD. Routes meet at graph nodes; keep props out of path/crossing clearance bands. Store the graph and style config in `/maps/forest.json` so they can be validated/restyled independently.

## Placement guidance for later Milestone 1 stages

- Form tree groves and rows with gaps; keep the 1.5-unit path/crossing bands clear.
- Place rocks in groups of 3-6, reeds in beds, and crops/fences/tents in deliberate rows or enclosures.
- Use a fixed seed; reject placements that overlap river, paths, other objects, or map edges.
- Use identical model/material for each hider-prop disguise and its decoys. Use the same bush model for bush decoys and disguises; `grass_large.glb` is not a bush.
- Do not add cabin, grove, crop, or ambient-life placements in 1A. Those belong to 1B/1C. Milestone 1A covers terrain, river, bridges, stone paths, lighting, and the local player.

## Milestone 1C as-built placement addendum

The approved camera, river, bridges, ground palette, dirt path network, and tree colors remain as they were. These additions fit the existing Zone C yard loop and retain the planned cabin landmark near (207,92).

### Cabin, yard, and crops

- Zone C primitive cabin center: **(207,92)**; fenced yard center: **(207,92)**, with the south gate and a short packed-dirt connector meeting `C-yard-n` at **(207,82)**.
- Four Zone C crop fields are centered at **(170,96), (184,96), (170,108), (184,108)**. Each has 12 rows and 144 instanced plants: wheat, corn, leafy greens, and bamboo respectively. The Zone B river-side field remains at **(141,98)** with 6 rows and 48 instanced leafy plants. All 624 crop plants passed the landscape clearance check; each field has a low fence border.
- Yard accents: woodpile/log stack, three stumps, bucket, crates, workbench/bench, primitive drying rack, and a low stone edge. Cabin and furniture have simple movement colliders; the fence and gate segments also block movement.

### Camps and zone landmarks

| Zone | Camp centers | Camps | Tents |
|---|---|---:|---:|
| A | (14,20), (71,105), (15,108) | 3 hidden | 5 |
| B | (101,103), (147,21) | 2 hidden | 3 |
| C | (224,15) | 1 cabin-clearing camp | 3 |

All six camps use `tent_detailedClosed.glb` and `campfire_stones.glb`; tents are 3x their former scale and alternate red and yellow canvas. Tents sit in a wider ring around the campfires, with collision circles matched to their larger size. The campfire props have one nearby dynamic firelight, emissive glow, sparks, and thin smoke. Hidden camp centers remain more than 25 units apart. The Zone B hollow-log landmark sits near the B log spur at (116,102); the existing boulder ring and reed beds remain its other landmarks. Zone A retains the ancient pine landmark and adds soft ground mist. Zone C reads warmer through its cabin and campfire glow.

### Shore boats and ambient life

Seven `canoe.glb` boats with `canoe_paddle.glb` props sit on land at: A (55,102), (61,113); B (90,16), (127,91), (143,93); C (170,79), (179,44). One additional candidate was omitted by the clearance validator. The displayed boats use a 3x model scale to read at the approved camera framing; each placement checks `isInWater`, a 3.2-unit shared bank clearance, 5.2 units from paths, and 8 units from bridges. Boats do not bob or emit water ripples and have movement colliders.

The scene uses 150/99/51 fireflies on High/Medium/Low, four slow-flying bats, and 72 blue plus 68 pink emissive flowers in Zones A/B. River reeds, lily pads, and leaves retain their existing sway/drift animation. Repeated boats, crops, fences, tents, fireflies, plants, and flowers use instancing where applicable.

### Hider prop counts after 1C clearings

| Zone | Stumps | Boulders | Bushes |
|---|---:|---:|---:|
| A | 27 | 20 | 20 |
| B | 27 | 20 | 20 |
| C | 24 | 18 | 18 |
| **Total** | **78** | **58** | **58** |

The `H` highlight remains a development-only toggle. The placement report is available in the browser as `window.__environmentPlacementReport` and lists crops, trees, hider props, rejected placements, collision counts, and the Milestone 1C additions.
