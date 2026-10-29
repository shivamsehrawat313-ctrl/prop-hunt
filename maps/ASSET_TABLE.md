# Asset inventory and proposed use (re-inventory)

## Inventory and locations

The initial inventory found **121 GLB models** and **175 PNG/JPG references**; the preview images are not runtime assets. No original `.gltf`, `.bin`, or external texture companions were supplied with that inventory. Several supplied GLBs later proved to reference the same absent `Textures/colormap.png`; Milestone 1C adds a small muted teal/earth palette atlas at that expected path so the GLBs load without missing-texture console errors.

The expected model folder was empty at the first inventory. Since then, source models have been copied into the runtime folder without altering originals. All previews remain visual references only.

### Complete model inventory

`bottle-large.glb`, `bottle.glb`, `box-large-open.glb`, `box-large.glb`, `box-open.glb`, `box.glb`, `bridge_center_wood.glb`, `bridge_center_woodRound.glb`, `bridge_side_wood.glb`, `bridge_side_woodRound.glb`, `bridge_wood.glb`, `bridge_woodNarrow.glb`, `bridge_woodRound.glb`, `bridge_woodRoundNarrow.glb`, `bucket.glb`, `campfire_bricks.glb`, `campfire_logs.glb`, `campfire_planks.glb`, `campfire_stones.glb`, `character-l.glb`, `chest.glb`, `crops_bambooStageB.glb`, `crops_cornStageA.glb`, `crops_cornStageB.glb`, `crops_cornStageC.glb`, `crops_cornStageD.glb`, `crops_dirtDoubleRow.glb`, `crops_dirtDoubleRowCorner.glb`, `crops_dirtDoubleRowEnd.glb`, `crops_dirtRow.glb`, `crops_dirtRowCorner.glb`, `crops_dirtRowEnd.glb`, `crops_dirtSingle.glb`, `crops_leafsStageA.glb`, `crops_leafsStageB.glb`, `crops_wheatStageA.glb`, `crops_wheatStageB.glb`, `fence_bend.glb`, `fence_bendCenter.glb`, `fence_corner.glb`, `fence_gate.glb`, `fence_planks.glb`, `fence_planksDouble.glb`, `fence_simpleCenter.glb`, `fence_simpleDiagonal.glb`, `fence_simpleDiagonalCenter.glb`, `fence_simpleHigh.glb`, `fence_simpleLow.glb`, `flower_purpleA.glb`, `flower_purpleB.glb`, `flower_purpleC.glb`, `flower_redA.glb`, `flower_redB.glb`, `flower_redC.glb`, `flower_yellowA.glb`, `flower_yellowB.glb`, `flower_yellowC.glb`, `grass.glb`, `grass_large.glb`, `grass_leafs.glb`, `grass_leafsLarge.glb`, `ground_grass.glb`, `ground_pathBend.glb`, `ground_pathBendBank.glb`, `ground_pathCorner.glb`, `mushroom_redGroup.glb`, `mushroom_redTall.glb`, `mushroom_tan.glb`, `mushroom_tanGroup.glb`, `mushroom_tanTall.glb`, `patch-grass-large.glb`, `patch-grass.glb`, `path_stone.glb`, `path_stoneCircle.glb`, `path_stoneCorner.glb`, `path_stoneEnd.glb`, `path_wood.glb`, `path_woodCorner.glb`, `path_woodEnd.glb`, `plant_bush.glb`, `plant_bushDetailed.glb`, `plant_bushLarge.glb`, `plant_bushLargeTriangle.glb`, `plant_bushSmall.glb`, `plant_bushTriangle.glb`, `plant_flatShort.glb`, `pot_large.glb`, `pot_small.glb`, `resource-planks.glb`, `rock_smallH.glb`, `rock_smallI.glb`, `rock_smallTopA.glb`, `rock_smallTopB.glb`, `stone_smallTopA.glb`, `stone_smallTopB.glb`, `stone_tallA.glb`, `stone_tallB.glb`, `stone_tallC.glb`, `stone_tallD.glb`, `stone_tallE.glb`, `stone_tallF.glb`, `stone_tallG.glb`, `stump_square.glb`, `stump_squareDetailed.glb`, `tent_detailedClosed.glb`, `tent_detailedOpen.glb`, `tent_smallClosed.glb`, `tent_smallOpen.glb`, `tree-log-small.glb`, `tree-log.glb`, `tree-tall.glb`, `tree-trunk.glb`, `tree_pineRoundA.glb`, `tree_pineRoundB.glb`, `tree_pineRoundC.glb`, `tree_pineTallC.glb`, `tree_pineTallC_detailed.glb`, `tree_pineTallD.glb`, `tree_plateau.glb`, `tree_plateau_dark.glb`, `tree_plateau_fall.glb`

### Complete image inventory

Bridge previews newly supplied in `refrence/`: `bridge_center_woodRound_NE.png`, `bridge_center_woodRound_NW.png`, `bridge_center_woodRound_SE.png`, `bridge_center_woodRound_SW.png`, `bridge_side_wood_NE.png`, `bridge_side_wood_NW.png`, `bridge_side_wood_SE.png`, `bridge_side_wood_SW.png`, `bridge_side_woodRound_NE.png`, `bridge_side_woodRound_NW.png`, `bridge_side_woodRound_SE.png`, `bridge_side_woodRound_SW.png`, `bridge_wood_NE.png`, `bridge_wood_NW.png`, `bridge_wood_SE.png`, `bridge_wood_SW.png`, `bridge_woodNarrow_NE.png`, `bridge_woodNarrow_NW.png`, `bridge_woodNarrow_SE.png`, `bridge_woodNarrow_SW.png`, `bridge_woodRound_NE.png`, `bridge_woodRound_NW.png`, `bridge_woodRound_SE.png`, `bridge_woodRound_SW.png`, `bridge_woodRoundNarrow_NE.png`, `bridge_woodRoundNarrow_NW.png`, `bridge_woodRoundNarrow_SE.png`, and `bridge_woodRoundNarrow_SW.png`.

`bottle-large.png`, `bottle.png`, `box-large-open.png`, `box-large.png`, `box-open.png`, `box.png`, `bucket.png`, `campfire_bricks_SW.png`, `campfire_logs_NE.png`, `campfire_stones_NE.png`, `character-l.png`, `crop_carrot.png`, `crop_melon.png`, `crop_pumpkin.png`, `crop_turnip.png`, `crops_bambooStageA.png`, `crops_bambooStageB.png`, `crops_cornStageA.png`, `crops_cornStageB.png`, `crops_cornStageC.png`, `crops_cornStageD.png`, `crops_dirtDoubleRow.png`, `crops_dirtDoubleRowCorner.png`, `crops_dirtDoubleRowEnd.png`, `crops_dirtRow.png`, `crops_dirtRowCorner.png`, `crops_dirtRowEnd.png`, `crops_dirtSingle.png`, `crops_leafsStageA.png`, `crops_leafsStageB.png`, `crops_wheatStageA.png`, `crops_wheatStageB.png`, `fence_bend.png`, `fence_bendCenter.png`, `fence_corner.png`, `fence_gate.png`, `fence_planks.png`, `fence_planksDouble.png`, `fence_simple.png`, `fence_simpleCenter.png`, `flower_purpleB.png`, `flower_purpleC.png`, `flower_redA.png`, `flower_redB.png`, `flower_redC.png`, `flower_yellowA.png`, `flower_yellowB.png`, `flower_yellowC.png`, `grass.png`, `grass_large.png`, `grass_leafs.png`, `grass_leafsLarge.png`, `ground_pathBend.png`, `ground_pathBendBank.png`, `ground_pathCorner.png`, `ground_pathCross.png`, `ground_pathEnd.png`, `ground_pathEndClosed.png`, `ground_pathRocks.png`, `ground_pathSideOpen.png`, `ground_pathSplit.png`, `ground_pathStraight.png`, `ground_pathTile.png`, `ground_riverBend.png`, `ground_riverBendBank.png`, `ground_riverCorner.png`, `ground_riverCross.png`, `ground_riverEnd.png`, `ground_riverEndClosed.png`, `ground_riverRocks.png`, `ground_riverSideOpen.png`, `ground_riverSplit.png`, `ground_riverStraight.png`, `ground_riverTile.png`, `hanging_moss.png`, `lily_large.png`, `lily_small.png`, `mushroom_tanGroup_NW.png`, `mushroom_tanGroup_SE.png`, `mushroom_tanGroup_SW.png`, `mushroom_tanTall_NE.png`, `mushroom_tanTall_NW.png`, `mushroom_tanTall_SE.png`, `mushroom_tanTall_SW.png`, `path_stone_NE.png`, `path_stone_NW.png`, `path_stone_SE.png`, `path_stone_SW.png`, `path_stoneCircle_NE.png`, `path_stoneCircle_NW.png`, `path_stoneCircle_SE.png`, `path_stoneCircle_SW.png`, `path_stoneCorner_NE.png`, `path_stoneCorner_NW.png`, `path_stoneCorner_SE.png`, `path_stoneCorner_SW.png`, `path_stoneEnd_NE.png`, `path_stoneEnd_NW.png`, `refrence imagUI.png`, `rock_largeF_SE.png`, `rock_largeF_SW.png`, `rock_smallA_NE.png`, `rock_smallA_NW.png`, `rock_smallA_SE.png`, `rock_smallA_SW.png`, `rock_smallB_NE.png`, `rock_smallB_NW.png`, `rock_smallB_SE.png`, `rock_smallB_SW.png`, `rock_smallC_NE.png`, `signpost-single.png`, `stone_tallB_SW.png`, `stone_tallC_NE.png`, `stone_tallC_NW.png`, `stone_tallC_SE.png`, `stone_tallC_SW.png`, `stone_tallD_NE.png`, `stone_tallD_NW.png`, `stone_tallD_SE.png`, `stone_tallD_SW.png`, `stone_tallE_NE.png`, `stone_tallE_NW.png`, `stone_tallE_SE.png`, `stone_tallE_SW.png`, `stone_tallF_NE.png`, `stone_tallF_NW.png`, `stump_squareDetailedWide_NW.png`, `stump_squareDetailedWide_SE.png`, `stump_squareDetailedWide_SW.png`, `tent_detailedClosed_SW.png`, `tent_detailedOpen_NE.png`, `tree-log-small.png`, `tree-log.png`, `tree-tall.png`, `tree-trunk.png`, `tree_pineRoundB_NW.png`, `tree_pineRoundB_SW.png`, `tree_pineTallC_NW.png`, `tree_pineTallC_SE.png`, `tree_pineTallC_SW.png`, `tree_thin_dark_NE.png`, `tree_thin_dark_NW.png`, `tree_thin_dark_SE.png`, `tree_thin_dark_SW.png`

## Visual and placement table

Heights are approximate in-game targets after normalization. Triangle counts are read from GLB mesh accessor counts. For broad families, the preview column uses the exact same-name image where supplied; otherwise it names the closest preview or says no matching image exists.

| Model | Preview / visual | Height | Planned zone and use | Fit and decision | Triangles |
|---|---|---:|---|---|---:|
| `bottle-large.glb` | `bottle-large.png` - Small bottle | ~0.65 u | C: C supply cluster by cabin | No known zone mismatch. | 96 |
| `bottle.glb` | `bottle.png` - Small bottle | ~0.65 u | C: C supply cluster by cabin | No known zone mismatch. | 96 |
| `box-large-open.glb` | `box-large-open.png` - Wooden box, open or closed | ~0.65 u | C: C organized cabin supply stack | No known zone mismatch. | 156 |
| `box-large.glb` | `box-large.png` - Wooden box, open or closed | ~0.65 u | C: C organized cabin supply stack | No known zone mismatch. | 124 |
| `box-open.glb` | `box-open.png` - Wooden box, open or closed | ~0.65 u | C: C organized cabin supply stack | No known zone mismatch. | 156 |
| `box.glb` | `box.png` - Wooden box, open or closed | ~0.65 u | C: C organized cabin supply stack | No known zone mismatch. | 124 |
| `bridge_center_wood.glb` | `No exact image preview; nearest family preview used` - Bridge center plank section | ~0.45 u | Reserved modular bridge part; 1A uses complete `bridge_woodRound.glb` | Not used by the full-bridge layout. | 52 |
| `bridge_center_woodRound.glb` | `bridge_center_woodRound_NW.png` - Rounded bridge center plank section | ~0.45 u | Reserved modular bridge part; 1A uses complete `bridge_woodRound.glb` | Not used by the full-bridge layout. | 60 |
| `bridge_side_wood.glb` | `bridge_side_wood_NW.png` - Bridge side/end plank section | ~0.45 u | Reserved modular bridge part; 1A uses complete `bridge_woodRound.glb` | Not used by the full-bridge layout. | 136 |
| `bridge_side_woodRound.glb` | `bridge_side_woodRound_NW.png` - Rounded bridge side/end plank section | ~0.45 u | Reserved modular bridge part; 1A uses complete `bridge_woodRound.glb` | Not used by the full-bridge layout. | 190 |
| `bridge_wood.glb` | `bridge_wood_NW.png` - Complete bridge tile with square ends | ~0.45 u | Available bridge alternative; 1A uses `bridge_woodRound.glb` at all four crossings | Teal-grade when used. | 220 |
| `bridge_woodNarrow.glb` | `bridge_woodNarrow_NW.png` - Narrow complete bridge tile | ~0.45 u | Available bridge alternative; 1A uses `bridge_woodRound.glb` at all four crossings | Teal-grade when used. | 220 |
| `bridge_woodRound.glb` | `bridge_woodRound_NW.png` - Complete rounded-end bridge tile | ~0.45 u | A/B/C: one scaled and rotated bridge at each of the four 1A river crossings | Selected full bridge model; warm wood graded to teal. | 336 |
| `bridge_woodRoundNarrow.glb` | `bridge_woodRoundNarrow_NW.png` - Narrow rounded-end bridge tile | ~0.45 u | Available bridge alternative; 1A uses `bridge_woodRound.glb` at all four crossings | Teal-grade when used. | 336 |
| `bucket.glb` | `bucket.png` - Small bucket | ~0.65 u | C: C yard supply cluster | No known zone mismatch. | 68 |
| `campfire_bricks.glb` | `campfire_bricks_SW.png` - Campfire construction component | ~0.65 u | C: C only, assembled as a single fire ring | No known zone mismatch. | 120 |
| `campfire_logs.glb` | `campfire_logs_NE.png` - Campfire construction component | ~0.65 u | C: C only, assembled as a single fire ring | No known zone mismatch. | 112 |
| `campfire_planks.glb` | `No exact image preview; nearest family preview used` - Campfire construction component | ~0.65 u | C: C only, assembled as a single fire ring | No known zone mismatch. | 108 |
| `campfire_stones.glb` | `campfire_stones_NE.png` - Campfire construction component | ~0.65 u | C: C only, assembled as a single fire ring | No known zone mismatch. | 264 |
| `character-l.glb` | `character-l.png` - Stylized humanoid character | ~1 u | All: Player character, normalized to ~1 unit | No known zone mismatch. | 72 |
| `chest.glb` | `No matching preview supplied` - Wooden chest | ~0.65 u | C: C cabin storage | No known zone mismatch. | 322 |
| `crops_bambooStageB.glb` | `crops_bambooStageB.png` - Crop plant or cultivated dirt-row/tile module | ~0.89 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 564 |
| `crops_cornStageA.glb` | `crops_cornStageA.png` - Crop plant or cultivated dirt-row/tile module | ~0.5 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 100 |
| `crops_cornStageB.glb` | `crops_cornStageB.png` - Crop plant or cultivated dirt-row/tile module | ~1 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 116 |
| `crops_cornStageC.glb` | `crops_cornStageC.png` - Crop plant or cultivated dirt-row/tile module | ~1.25 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 148 |
| `crops_cornStageD.glb` | `crops_cornStageD.png` - Crop plant or cultivated dirt-row/tile module | ~1.25 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 300 |
| `crops_dirtDoubleRow.glb` | `crops_dirtDoubleRow.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 88 |
| `crops_dirtDoubleRowCorner.glb` | `crops_dirtDoubleRowCorner.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 50 |
| `crops_dirtDoubleRowEnd.glb` | `crops_dirtDoubleRowEnd.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 64 |
| `crops_dirtRow.glb` | `crops_dirtRow.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 44 |
| `crops_dirtRowCorner.glb` | `crops_dirtRowCorner.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 19 |
| `crops_dirtRowEnd.glb` | `crops_dirtRowEnd.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 32 |
| `crops_dirtSingle.glb` | `crops_dirtSingle.png` - Crop plant or cultivated dirt-row/tile module | ~0.05 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 32 |
| `crops_leafsStageA.glb` | `crops_leafsStageA.png` - Crop plant or cultivated dirt-row/tile module | ~0.43 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 76 |
| `crops_leafsStageB.glb` | `crops_leafsStageB.png` - Crop plant or cultivated dirt-row/tile module | ~0.68 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 84 |
| `crops_wheatStageA.glb` | `crops_wheatStageA.png` - Crop plant or cultivated dirt-row/tile module | ~0.33 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 720 |
| `crops_wheatStageB.glb` | `crops_wheatStageB.png` - Crop plant or cultivated dirt-row/tile module | ~0.53 u | C: C only; tidy straight field rows; use crop stages over dirt-row bases | Correct fit for C only. | 360 |
| `fence_bend.glb` | `fence_bend.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 240 |
| `fence_bendCenter.glb` | `fence_bendCenter.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 298 |
| `fence_corner.glb` | `fence_corner.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 116 |
| `fence_gate.glb` | `fence_gate.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 524 |
| `fence_planks.glb` | `fence_planks.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 96 |
| `fence_planksDouble.glb` | `fence_planksDouble.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 152 |
| `fence_simpleCenter.glb` | `fence_simpleCenter.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 116 |
| `fence_simpleDiagonal.glb` | `No exact image preview; nearest family preview used` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 80 |
| `fence_simpleDiagonalCenter.glb` | `No exact image preview; nearest family preview used` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 148 |
| `fence_simpleHigh.glb` | `fence_simple.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 44 |
| `fence_simpleLow.glb` | `fence_simple.png` - Low-poly wooden fence segment, bend, corner, or gate | ~1 u | C: C only; use supplied segment/corner/gate models for the fenced yard | Correct fit for C only. | 44 |
| `flower_purpleA.glb` | `No exact image preview; nearest family preview used` - Purple low-poly flower | ~0.45 u | B: B clustered marsh flowers | No known zone mismatch. | 76 |
| `flower_purpleB.glb` | `flower_purpleB.png` - Purple low-poly flower | ~0.45 u | B: B clustered marsh flowers | No known zone mismatch. | 98 |
| `flower_purpleC.glb` | `flower_purpleC.png` - Purple low-poly flower | ~0.45 u | B: B clustered marsh flowers | No known zone mismatch. | 78 |
| `flower_redA.glb` | `flower_redA.png` - Red or yellow low-poly flower | ~0.45 u | C: C decorative crop-edge clusters; grade source red/yellow toward muted teal/purple | No known zone mismatch. | 76 |
| `flower_redB.glb` | `flower_redB.png` - Red or yellow low-poly flower | ~0.45 u | C: C decorative crop-edge clusters; grade source red/yellow toward muted teal/purple | No known zone mismatch. | 98 |
| `flower_redC.glb` | `flower_redC.png` - Red or yellow low-poly flower | ~0.45 u | C: C decorative crop-edge clusters; grade source red/yellow toward muted teal/purple | No known zone mismatch. | 78 |
| `flower_yellowA.glb` | `flower_yellowA.png` - Red or yellow low-poly flower | ~0.45 u | C: C decorative crop-edge clusters; grade source red/yellow toward muted teal/purple | No known zone mismatch. | 76 |
| `flower_yellowB.glb` | `flower_yellowB.png` - Red or yellow low-poly flower | ~0.45 u | C: C decorative crop-edge clusters; grade source red/yellow toward muted teal/purple | No known zone mismatch. | 154 |
| `flower_yellowC.glb` | `flower_yellowC.png` - Red or yellow low-poly flower | ~0.45 u | C: C decorative crop-edge clusters; grade source red/yellow toward muted teal/purple | No known zone mismatch. | 78 |
| `grass.glb` | `grass.png` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 132 |
| `grass_large.glb` | `grass_large.png` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 224 |
| `grass_leafs.glb` | `grass_leafs.png` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 36 |
| `grass_leafsLarge.glb` | `grass_leafsLarge.png` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 144 |
| `ground_grass.glb` | `No exact image preview; nearest family preview used` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 2 |
| `ground_pathBend.glb` | `ground_pathBend.png` - Ground/path transition tile or path junction tile | ~0.08 u | All: Terrain/path graph junction and riverbank edge transitions | No known zone mismatch. | 32 |
| `ground_pathBendBank.glb` | `ground_pathBendBank.png` - Ground/path transition tile or path junction tile | ~0.08 u | All: Terrain/path graph junction and riverbank edge transitions | No known zone mismatch. | 38 |
| `ground_pathCorner.glb` | `ground_pathCorner.png` - Ground/path transition tile or path junction tile | ~0.08 u | All: Terrain/path graph junction and riverbank edge transitions | No known zone mismatch. | 22 |
| `mushroom_redGroup.glb` | `No exact image preview; nearest family preview used` - Low-poly mushroom or mushroom group | ~0.45 u | B: B understory clusters; red/orange material graded to palette | No known zone mismatch. | 144 |
| `mushroom_redTall.glb` | `No exact image preview; nearest family preview used` - Low-poly mushroom or mushroom group | ~0.45 u | B: B understory clusters; red/orange material graded to palette | No known zone mismatch. | 48 |
| `mushroom_tan.glb` | `No exact image preview; nearest family preview used` - Low-poly mushroom or mushroom group | ~0.45 u | B: B understory clusters; red/orange material graded to palette | No known zone mismatch. | 48 |
| `mushroom_tanGroup.glb` | `mushroom_tanGroup_NW.png` - Low-poly mushroom or mushroom group | ~0.45 u | B: B understory clusters; red/orange material graded to palette | No known zone mismatch. | 144 |
| `mushroom_tanTall.glb` | `mushroom_tanTall_NE.png` - Low-poly mushroom or mushroom group | ~0.45 u | B: B understory clusters; red/orange material graded to palette | No known zone mismatch. | 48 |
| `patch-grass-large.glb` | `No matching preview supplied` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 33 |
| `patch-grass.glb` | `No matching preview supplied` - Grass tile, tuft, or leafy ground patch | ~0.35 u | All: Shared terrain accents/understory; `grass_large` remains grass and is never a bush substitute | No known zone mismatch. | 33 |
| `path_stone.glb` | `path_stone_NE.png` - Embedded low-poly stone path straight/circle/corner/end module | ~0.08 u | All: Shared cobblestone route graph across A/B/C | No known zone mismatch. | 136 |
| `path_stoneCircle.glb` | `path_stoneCircle_NE.png` - Embedded low-poly stone path straight/circle/corner/end module | ~0.08 u | All: Shared cobblestone route graph across A/B/C | No known zone mismatch. | 164 |
| `path_stoneCorner.glb` | `path_stoneCorner_NE.png` - Embedded low-poly stone path straight/circle/corner/end module | ~0.08 u | All: Shared cobblestone route graph across A/B/C | No known zone mismatch. | 112 |
| `path_stoneEnd.glb` | `path_stoneEnd_NE.png` - Embedded low-poly stone path straight/circle/corner/end module | ~0.08 u | All: Shared cobblestone route graph across A/B/C | No known zone mismatch. | 92 |
| `path_wood.glb` | `path_stone_SW.png` - Wooden plank crossing module | ~0.08 u | All: Reserved river crossings only, at the crossing nodes in the plan | No known zone mismatch. | 60 |
| `path_woodCorner.glb` | `path_stoneCorner_SW.png` - Wooden plank crossing module | ~0.08 u | All: Reserved river crossings only, at the crossing nodes in the plan | No known zone mismatch. | 60 |
| `path_woodEnd.glb` | `path_stoneEnd_NW.png` - Wooden plank crossing module | ~0.08 u | All: Reserved river crossings only, at the crossing nodes in the plan | No known zone mismatch. | 36 |
| `plant_bush.glb` | `No matching bush preview supplied` - Faceted leafy bush; detailed, small, large, or triangle-canopy variant | ~0.8 u | A/B: A/B understory and decorative grouped bushes; do not use as the hider model | No known zone mismatch. | 32 |
| `plant_bushDetailed.glb` | `No matching bush preview supplied` - Faceted leafy bush; detailed, small, large, or triangle-canopy variant | ~0.8 u | A/B/C: A/B/C grouped bushes; `plant_bushDetailed.glb` is the single shared hider/decoy model | Chosen single bush model for both decoys and disguised hiders; same material and 0.9-1.1 scale range. | 104 |
| `plant_bushLarge.glb` | `No matching bush preview supplied` - Faceted leafy bush; detailed, small, large, or triangle-canopy variant | ~0.8 u | A/B: A/B understory and decorative grouped bushes; do not use as the hider model | No known zone mismatch. | 60 |
| `plant_bushLargeTriangle.glb` | `No matching bush preview supplied` - Faceted leafy bush; detailed, small, large, or triangle-canopy variant | ~0.8 u | A/B: A/B understory and decorative grouped bushes; do not use as the hider model | No known zone mismatch. | 39 |
| `plant_bushSmall.glb` | `No matching bush preview supplied` - Faceted leafy bush; detailed, small, large, or triangle-canopy variant | ~0.8 u | A/B: A/B understory and decorative grouped bushes; do not use as the hider model | No known zone mismatch. | 16 |
| `plant_bushTriangle.glb` | `No matching bush preview supplied` - Faceted leafy bush; detailed, small, large, or triangle-canopy variant | ~0.8 u | A/B: A/B understory and decorative grouped bushes; do not use as the hider model | No known zone mismatch. | 30 |
| `plant_flatShort.glb` | `No matching preview supplied` - Low flat leafy plant | ~0.35 u | B: B marsh understory | No known zone mismatch. | 44 |
| `pot_large.glb` | `No matching preview supplied` - Small/large pot | ~0.65 u | C: C beside crop rows or cabin | No known zone mismatch. | 68 |
| `pot_small.glb` | `No matching preview supplied` - Small/large pot | ~0.65 u | C: C beside crop rows or cabin | No known zone mismatch. | 72 |
| `resource-planks.glb` | `No matching preview supplied` - Cut plank stack | ~0.65 u | C: C woodpile by cabin | No known zone mismatch. | 72 |
| `rock_smallH.glb` | `No exact image preview; nearest family preview used` - Faceted small low-poly rock | ~0.7 u | A/B: riverbank accents and clustered scenery | Source shape is irregular; grade to grey-teal. Not the shared boulder disguise. | 60 |
| `rock_smallI.glb` | `No exact image preview; nearest family preview used` - Faceted small low-poly rock | ~0.7 u | All: riverbank foam accents; scenery clusters | Also used for the light riverbank rocks in 1A. Not the shared boulder disguise. | 44 |
| `rock_smallTopA.glb` | `No exact image preview; nearest family preview used` - Faceted small low-poly rock | ~0.7 u | All: stone-only path style, instanced with size/rotation variation | Grade to muted grey-teal; path stones stay embedded in ground. | 52 |
| `rock_smallTopB.glb` | `No exact image preview; nearest family preview used` - Faceted small low-poly rock | ~0.7 u | A/B: scenery clusters; shared boulder disguise/decoy model | No large-rock GLB found; scale this single model 2.5x for all boulder decoys/disguises. | 76 |
| `stone_smallTopA.glb` | `No exact image preview; nearest family preview used` - Faceted small low-poly rock | ~0.7 u | All: stone-only path style, instanced with size/rotation variation | Alternate path stone; palette-grade to grey-teal. | 52 |
| `stone_smallTopB.glb` | `No exact image preview; nearest family preview used` - Faceted small low-poly rock | ~0.7 u | A/B: scenery clusters | Keep distinct from the single shared boulder disguise model. | 76 |
| `stone_tallA.glb` | `No exact image preview; nearest family preview used` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 136 |
| `stone_tallB.glb` | `stone_tallB_SW.png` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 172 |
| `stone_tallC.glb` | `stone_tallC_NE.png` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 37 |
| `stone_tallD.glb` | `stone_tallD_NE.png` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 38 |
| `stone_tallE.glb` | `stone_tallE_NE.png` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 38 |
| `stone_tallF.glb` | `stone_tallF_NE.png` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 46 |
| `stone_tallG.glb` | `No exact image preview; nearest family preview used` - Upright faceted stone/slab | ~0.85 u | A/B: A/B rock and boulder-ring clusters; decorative, not the shared boulder disguise | No known zone mismatch. | 62 |
| `stump_square.glb` | `No exact image preview; nearest family preview used` - Cut stump with flat top | ~0.55 u | A/B/C: A/B/C grouped stump hider props | No known zone mismatch. | 44 |
| `stump_squareDetailed.glb` | `No exact image preview; nearest family preview used` - Cut stump with flat top | ~0.55 u | A/B/C: A/B/C grouped stump hider props | No known zone mismatch. | 84 |
| `tent_detailedClosed.glb` | `tent_detailedClosed_SW.png` - Red ridge tent, open or closed | ~3 u | C: C clearing only; bright red material gets teal palette grade | No known zone mismatch. | 228 |
| `tent_detailedOpen.glb` | `tent_detailedOpen_NE.png` - Red ridge tent, open or closed | ~3 u | C: C clearing only; bright red material gets teal palette grade | No known zone mismatch. | 232 |
| `tent_smallClosed.glb` | `No exact image preview; nearest family preview used` - Red ridge tent, open or closed | ~3 u | C: C clearing only; bright red material gets teal palette grade | No known zone mismatch. | 220 |
| `tent_smallOpen.glb` | `No exact image preview; nearest family preview used` - Red ridge tent, open or closed | ~3 u | C: C clearing only; bright red material gets teal palette grade | No known zone mismatch. | 224 |
| `tree-log-small.glb` | `tree-log-small.png` - Fallen cut log | ~0.55 u | B: B deadwood and hollow-log landmark silhouette (model itself appears solid) | No known zone mismatch. | 88 |
| `tree-log.glb` | `tree-log.png` - Fallen cut log | ~0.55 u | B: B deadwood and hollow-log landmark silhouette (model itself appears solid) | No known zone mismatch. | 88 |
| `tree-tall.glb` | `tree-tall.png` - Tall tiered stylized conifer | ~5 u | A: A pine-grove variation; B fallback only if needed | No known zone mismatch. | 254 |
| `tree-trunk.glb` | `tree-trunk.png` - Short bare trunk | ~0.55 u | B: B standing dead-tree grouping | No known zone mismatch. | 52 |
| `tree_pineRoundA.glb` | `tree_pineRoundB_NW.png` - Round tiered low-poly conifer | ~5 u | A/B: A pine groves; limited edge transition in B | No known zone mismatch. | 204 |
| `tree_pineRoundB.glb` | `tree_pineRoundB_NW.png` - Round tiered low-poly conifer | ~5 u | A/B: A pine groves; limited edge transition in B | No known zone mismatch. | 262 |
| `tree_pineRoundC.glb` | `tree_pineRoundB_NW.png` - Round tiered low-poly conifer | ~5 u | A/B: A pine groves; limited edge transition in B | No known zone mismatch. | 206 |
| `tree_pineTallC.glb` | `tree_pineTallC_NW.png` - Tall narrow tiered low-poly conifer | ~5 u | A: A dense pine groves; ancient-pine landmark uses scaled instance | No known zone mismatch. | 98 |
| `tree_pineTallC_detailed.glb` | `tree_pineTallC_NW.png` - Tall narrow tiered low-poly conifer | ~5 u | A: A dense pine groves; ancient-pine landmark uses scaled instance | No known zone mismatch. | 154 |
| `tree_pineTallD.glb` | `tree_pineTallC_NW.png` - Tall narrow tiered low-poly conifer | ~5 u | A: A dense pine groves; ancient-pine landmark uses scaled instance | No known zone mismatch. | 98 |
| `tree_plateau.glb` | tree_thin_dark family preview (no exact image) - Broad, flat-topped low-poly broadleaf tree variant | ~5 u | B: B medium-density broadleaf collection; fall variant and dark variant diversify the grove | Correct new broadleaf fit for B; source GLB was found in `refrence/` and copied to runtime model folder. | 215 |
| `tree_plateau_dark.glb` | tree_thin_dark family preview (no exact image) - Broad, flat-topped low-poly broadleaf tree variant | ~5 u | B: B medium-density broadleaf collection; fall variant and dark variant diversify the grove | Correct new broadleaf fit for B; source GLB was found in `refrence/` and copied to runtime model folder. | 215 |
| `tree_plateau_fall.glb` | tree_thin_dark family preview (no exact image) - Broad, flat-topped low-poly broadleaf tree variant | ~5 u | B: B medium-density broadleaf collection; fall variant and dark variant diversify the grove | Correct new broadleaf fit for B; source GLB was found in `refrence/` and copied to runtime model folder. | 215 |

## Earlier Milestone 1B decisions

- **Cabin (superseded for 1C):** the original primitive cabin decision is replaced by the three supplied `building-sample-house-*.glb` models documented below.
- **Fences and crops:** supplied GLBs exist. Use fence segments/corners/gates and crop/dirt-row modules in Zone C; no primitive fallback is needed for these.
- **Bushes:** supplied bush models exist. Use `plant_bushDetailed.glb` as the one shared bush model for bush decoys and disguised hiders; use the same graded material and 0.9-1.1 scale range for both. Do not use `grass_large.glb` as a bush.
- **Boulders:** no large-rock GLB exists; `rock_largeF_*` files are PNG previews only. Use `rock_smallTopB.glb` scaled 2.5x as the one shared boulder model for all boulder decoys/disguises; use other rock/stone variants for scenery clusters.
- **Zone B trees:** use `tree_plateau.glb`, `tree_plateau_dark.glb`, and `tree_plateau_fall.glb`, which are broad flat-topped broadleaf variants. Use trunk and log models for dead-tree groupings.
- **Color grade:** grade every bright red/orange model into the shared teal reference palette. This includes red tents, flowers/mushrooms, and warm wood materials as appropriate; keep the primitive cabin walls red but dark and muted as specified.

## Milestone 1C as-built additions

| Use | Runtime asset / source | Placement |
|---|---|---|
| Village buildings | `building-sample-house-c.glb`, `building-sample-house-a.glb`, `building-sample-house-b.glb`; original material/texture assignments are retained with no tint shader | Zone C: main at (207,92), west at (198,92), east at (216,92), each normalized to about 7 units wide. Circular collision bounds; three dirt connectors lead to the path. Exact bundled previews are `building-sample-house-c.png`, `building-sample-house-a.png`, and `building-sample-house-b.png`. |
| Yard/farm fencing | `fence_simple.glb`, `fence_gate.glb`, `fence_simpleLow.glb` from `client/public/cabin models/` | 28 x 18 fenced village yard with south gate and low borders around the four Zone C crop fields. |
| Crop fields | `crops_wheatStageA/B.glb`, `crop_carrot.glb`, `crop_turnip.glb`, `crop_melon.glb`, `crop_pumpkin.glb`, `crops_leafsStageA/B.glb`; dirt row/end/corner/single modules | Four instanced 12-row Zone C fields: 144 plants each (wheat, roots, melons, leafy crop); 6-row Zone B leafy field near the river: 48 plants. Total 624. Centers remain C (170,96), (184,96), (170,108), (184,108); B (141,98). Crop-model instances and border modules retain their material colors. |
| Carts | `cart-high.glb`, `cart.glb` | Two carts at (197,105) by crops and (218,98.5) in the yard, normalized to roughly 3.0 and 2.6 units wide; both are clear of paths and have movement circles. Original material assignments retained. |
| Flowers | `flower_purpleB/C.glb`, `flower_redA/B/C.glb`, `flower_yellowA/B.glb` | Instanced clusters around Zone C houses, fence and fields, with smaller clusters in A/B; original flower materials/colors retained and model scales are 2.0-2.5x for readability. 160 instances placed (132 C, 14 A, 14 B). |
| Cabin supplies | `log_stack.glb`, `stump_square.glb`, `bucket.glb`, `box.glb`, `workbench.glb`, `stone_smallFlatA.glb` | Woodpile, three yard stumps, bucket, crates, bench/table, and low stone border in Zone C. Drying rack is primitive because no rack model was supplied. |
| Boats | `canoe.glb`, `canoe_paddle.glb` | 7 visible shore placements (2 A, 3 B, 2 C), model scale 3; candidates pass `isInWater`, at least 3.2 units beyond the shared bank-clearance edge, 5.2 units from paths, and 8 units from bridges. Hulls and paddles are graded muted light brown to read as wood. |
| Tents | `tent_detailedClosed.glb` | 11 instances: 5 in A, 3 in B, and 3 in the Zone C camp, grouped as 5 hidden camps in A/B plus one C camp. Instances are scaled to 3x their prior size and alternate warm red and yellow fabric. |
| Campfires | `campfire_stones.glb` | One fire ring in each of 6 camps (3 A, 2 B, 1 C); warm glow, sparks, smoke, and one dynamic light for the nearest campsite. |
| Bats/fireflies | Procedural instanced geometry | Four bats; 150/99/51 fireflies on High/Medium/Low. Supplied flower models are documented separately above. |
| Hollow-log landmark | Primitive low-poly log opening | Zone B by the log spur; no hollow-log model is present. |

The supplied canoe, tent and campfire files are in `client/public/models/`; the new building, cart, crop, fence, and flower files are in `client/public/cabin models/`. The model source folder references `Textures/colormap.png` but did not include that file. The runtime therefore uses a copy of the existing shared atlas at `client/public/cabin models/Textures/colormap.png`; this is a missing-source-texture limitation for exact preview color matching, not a model tint. No drying-rack or bat model was supplied; the drying rack is primitive and bats use procedural geometry. The hollow-log landmark uses a procedural opening.

## Primitive and shader fallbacks for implementation

- Cabin village: the three supplied house GLBs in `client/public/cabin models/`, with original material assignments left untinted; the cabin GLBs reference a missing `Textures/colormap.png`, so exact preview colors depend on recovering the original atlas.
- Terrain and soft grade: generated ground mesh and shared palette.
- S-curved luminous river, banks, shimmer, and ripples: generated ribbon meshes and shader.
- Lily pads, reeds/cattails, bats, and fireflies: no matching GLBs in the re-inventory; use procedural geometry/particles when their milestone is requested.
- Cobblestone paths, river bridges, bushes, fences, crops, broadleaf trees, and stones have supplied models and should use them.
- **Zone-plan update:** Milestone 1C as-built coordinates and counts are recorded in `ZONE_PLAN.md` below the original route and zone plan.

## Cabin-model folder inventory and preview matches

Inventory path: `client/public/cabin models/` (space in folder name). All 44 GLB models were found. Three exact building preview PNGs are bundled beside the houses. The project has no folder named `reference/`; the existing preview directory is misspelled `refrence/`. No building-named preview images are in `refrence/`; the three bundled house PNGs are used as their exact previews. Crop and flower previews below are exact same-base-name images in `refrence/`; cart previews are absent. Dimensions are approximate source-space X x Y x Z before normalization.

| Model file(s) | Matching preview | What it is / approximate source size | Use |
|---|---|---|---|
| `building-sample-house-a.glb` | bundled `building-sample-house-a.png` | Narrow gabled cottage, ~1.1 x 1.14 x 2.0 u | Zone C west house; normalize to ~7 u wide |
| `building-sample-house-b.glb` | bundled `building-sample-house-b.png` | Two-window gabled house, ~1.1 x 1.98 x 2.2 u | Zone C east house; normalize to ~7 u wide |
| `building-sample-house-c.glb` | bundled `building-sample-house-c.png` | Wide central house, ~2.0 x 1.98 x 2.2 u | Zone C main house; normalize to ~7 u wide |
| `cart-high.glb`, `cart.glb` | No cart preview found | Hand cart variants, each ~1.4 u long; bounding source height ~0.5-0.9 u | One by crops and one beside village; normalized to ~3.0 and ~2.6 u wide |
| `crop_carrot.glb`, `crop_turnip.glb` | `crop_carrot.png`, `crop_turnip.png` in `refrence/` | Root vegetables, about 0.34 x 0.62-0.66 x 0.34 u | Instanced Zone C root field |
| `crop_melon.glb`, `crop_pumpkin.glb` | `crop_melon.png`, `crop_pumpkin.png` | Low melon/pumpkin plants, about 0.42-0.44 x 0.33-0.35 x 0.36-0.45 u | Instanced Zone C fruit field |
| `crops_wheatStageA.glb`, `crops_wheatStageB.glb` | same-name `crops_wheatStageA.png`, `crops_wheatStageB.png` | Wheat stages, about 0.54 x 0.33-0.53 x 0.45 u | Instanced Zone C wheat field |
| `crops_leafsStageA.glb`, `crops_leafsStageB.glb` | same-name images in `refrence/` | Leafy crop stages, about 0.39 x 0.43-0.68 x 0.39 u | Instanced Zone C and Zone B fields |
| `crops_dirtRowCorner.glb`, `crops_dirtRowEnd.glb`, `crops_dirtSingle.glb` | same-name images in `refrence/` | Row corner ~0.78 x 0.05 x 0.78 u; row end ~0.6 x 0.05 x 0.62 u; soil tile ~0.4 x 0.1 x 0.35 u | Low crop borders and row ends/corners |
| `fence-doorway.glb`, `fence-fortified.glb`, `fence.glb` | `fence-doorway.png`, `fence-fortified.png`, `fence.png` | Short fence pieces, about 0.5 x 0.52 x 0.04-0.27 u | Available alternatives; not selected for village ring |
| `fence_bend.glb`, `fence_bendCenter.glb`, `fence_corner.glb` | same-name images in `refrence/` | Low-poly turn/corner modules, ~1 x 0.35 x 1 u | Available yard-corner alternatives |
| `fence_gate.glb`, `fence_planks.glb`, `fence_planksDouble.glb` | same-name images in `refrence/` | Gate ~1 x 0.52 x 0.5 u; plank segments ~1 u long | Gate and fence alternatives; gate model is used |
| `fence_simple.glb`, `fence_simpleCenter.glb` | same-name images in `refrence/` | Simple low fence segments, ~1 x 0.35 x 0.07 u | Repeated village fence segments |
| `fence_simpleDiagonal.glb`, `fence_simpleDiagonalCenter.glb` | No exact image found | Diagonal fence pieces, ~1 x 0.35 x 1 u | Available placement variants |
| `fence_simpleHigh.glb`, `fence_simpleLow.glb` | No exact image found | High ~1.04 x 0.35 x 0.11 u; low ~1.04 x 0.2 x 0.11 u | Low variant borders crop fields |
| `flower_purpleB.glb`, `flower_purpleC.glb` | same-name images in `refrence/` | Small purple flowers, ~0.18-0.21 u | Instanced, original colors, clustered in C and fewer in A/B |
| `flower_redA.glb`, `flower_redB.glb`, `flower_redC.glb` | same-name images in `refrence/` | Small red flowers, ~0.16-0.29 u | Instanced, original colors, clustered in C and fewer in A/B |
| `flower_yellowA.glb`, `flower_yellowB.glb` | same-name images in `refrence/` | Small yellow flowers, ~0.16-0.21 u | Instanced, original colors, clustered in C and fewer in A/B |
| `rock_smallH.glb`, `rock_smallI.glb`, `rock_smallTopA.glb`, `rock_smallTopB.glb` | Nearest family thumbnails `rock_smallA_*`, `rock_smallB_*`, or `rock_smallC_*` in `refrence/`; no exact H/I/Top preview | Small faceted rocks; variant size differs | Available, not used by the village build |
| `rock_tallA.glb`, `rock_tallB.glb` | Nearest tall-rock thumbnails `rock_largeF_*` in `refrence/`; no exact A/B preview | Upright faceted rocks; variant size differs | Available, not used by the village build |
| `Textures/colormap.png` | No preview; texture asset | 256 x 256 atlas file, copied from the shared runtime atlas because the cabin GLBs reference this path | Runtime texture dependency; source folder did not contain its referenced texture |

Complete file inventory (48 files, including the runtime texture dependency):

```text
building-sample-house-a.glb
building-sample-house-a.png
building-sample-house-b.glb
building-sample-house-b.png
building-sample-house-c.glb
building-sample-house-c.png
cart-high.glb
cart.glb
crops_dirtRowCorner.glb
crops_dirtRowEnd.glb
crops_dirtSingle.glb
crops_leafsStageA.glb
crops_leafsStageB.glb
crops_wheatStageA.glb
crops_wheatStageB.glb
crop_carrot.glb
crop_melon.glb
crop_pumpkin.glb
crop_turnip.glb
fence-doorway.glb
fence-fortified.glb
fence.glb
fence_bend.glb
fence_bendCenter.glb
fence_corner.glb
fence_gate.glb
fence_planks.glb
fence_planksDouble.glb
fence_simple.glb
fence_simpleCenter.glb
fence_simpleDiagonal.glb
fence_simpleDiagonalCenter.glb
fence_simpleHigh.glb
fence_simpleLow.glb
flower_purpleB.glb
flower_purpleC.glb
flower_redA.glb
flower_redB.glb
flower_redC.glb
flower_yellowA.glb
flower_yellowB.glb
rock_smallH.glb
rock_smallI.glb
rock_smallTopA.glb
rock_smallTopB.glb
rock_tallA.glb
rock_tallB.glb
Textures/colormap.png
```
