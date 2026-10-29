export const CAMERA_DISTANCE = 41;
export const CAMERA_ZOOM = 2;
// Downward tilt away from vertical; 57 degrees is 33 degrees above the ground horizon.
export const CAMERA_TILT_DEGREES = 57;
export const CAMERA_FIELD_OF_VIEW_DEGREES = 56;
export const CAMERA_REFERENCE_HEIGHT = 1080;

export const MAP_SCALE = 0.575;
export const TREE_KEEP_RATIO = 0.68;
export const MAX_TERRAIN_SLOPE = 0.16;

export const HUNTER_CONE_RANGE = 10;
export const HUNTER_CLOSE_CIRCLE_RANGE = 2.5;
export const HIDER_SIGHT_RADIUS = 5.5;
export const PISTOL_RANGE = 10;
export const CROSSBOW_RANGE = 14;
export const SHIMMER_DISTANCE = 4;
export const SPLASH_HEARING_DISTANCE = 6;
export const HUNTER_VIEW_CONE_DEGREES = 100;
export const DANGER_LEVEL_1_DISTANCE = 24;
export const DANGER_LEVEL_2_DISTANCE = 15;
export const DANGER_LEVEL_3_DISTANCE = 8;
export const VISION_FOG_OPACITY = 0.46;
export const VISION_FOG_FEATHER_FRACTION = 0.18;
export const VISION_FOG_MIN_SCREEN_RADIUS_PX = 16;
export const VISION_FOG_MIN_FEATHER_PX = 8;
export const VISION_FOG_BLUR_PX = 8;
export const VISION_FOG_DRAW_INTERVAL_MS = 33;
export const VISION_FOG_REVEAL_RADIUS_UNITS = 2.2;
export const VISION_CANVAS_MAX_DPR = 2;
export const HEARTBEAT_INTERVALS_MS = [0, 1200, 850, 600];
export const HEARTBEAT_PEAK_VOLUME = 0.075;
export const AUDIO_MAX_SIMULTANEOUS_VOICES = 16;
export const AUDIO_AMBIENCE_VOICE_COUNT = 4;
export const AUDIO_MASTER_VOLUME_DEFAULT = 0.65;
export const AUDIO_AMBIENCE_DUCK_GAIN = 0.38;
export const AUDIO_HEARTBEAT_AMBIENCE_DUCK_GAIN = 0.62;
export const AUDIO_AMBIENCE_DUCK_MS = 450;
export const AUDIO_FOOTSTEP_INTERVAL_MS = 420;
export const AUDIO_FOOTSTEP_WATER_INTERVAL_MS = 300;
export const AUDIO_MODEL_PROGRESS_EXPECTED_COUNT = 64;
export const AUDIO_LOADING_STAGE_COMPLETE_MS = 250;
export const AUDIO_CAMPFIRE_HEARING_DISTANCE = 18;
export const AUDIO_RIVER_HEARING_DISTANCE = 30;
export const IMPACT_PARTICLE_SPEED = 2.2;
export const IMPACT_PARTICLE_GRAVITY = 1.8;
export const IMPACT_PARTICLE_COUNT = 8;
export const IMPACT_PARTICLE_LIFETIME_MS = 420;
export const PISTOL_TRACER_DURATION_MS = 240;
export const PISTOL_TRACER_OPACITY = 0.92;
export const AMBIENCE_UPDATE_INTERVAL_MS = 280;
export const WATER_SPLASH_EVENT_COOLDOWN_MS = 650;
export const HIDE_PHASE_SECONDS = 10;
export const HUNT_PHASE_SECONDS = 120;


export const PLAYER_HEIGHT_UNITS = 1;
export const PATH_WIDTH_UNITS = 3;
export const RIVER_WIDTH_MIN_UNITS = 5;
export const RIVER_WIDTH_MAX_UNITS = 8;
export const BRIDGE_BANK_MARGIN_UNITS = 1.5;
export const PATH_STONE_BASE_DIAMETER_UNITS = 0.49;
export const PATH_STONE_MIN_DIAMETER_UNITS = 0.4;
export const PATH_STONE_MAX_DIAMETER_UNITS = 0.7;

// Ground coverage targets by zone. Fractions are measured over the playable ground.
export const GROUND_PATCH_COVERAGE = {
  A: { green: 0.70, olive: 0.16, freshGreen: 0.08, ochre: 0.06 },
  B: { green: 0.63, olive: 0.18, freshGreen: 0.11, ochre: 0.08 },
  C: { green: 0.56, olive: 0.19, freshGreen: 0.12, ochre: 0.13 },
};
export const GROUND_PATCH_NOISE_SCALE_LARGE = 0.026;
export const GROUND_PATCH_NOISE_SCALE_SMALL = 0.073;
export const GROUND_PATCH_NOISE_LARGE_WEIGHT = 0.68;
export const GROUND_PATCH_BLEND_WIDTH = 0.04;

// Multiplayer and match rules. Keep the map-shrink tuning above unchanged.
export const GAME_TICK_HZ = 20;
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PLAYER_NAME_MIN_LENGTH = 2;
export const PLAYER_NAME_MAX_LENGTH = 14;
export const PLAYER_REJOIN_SECONDS = 30;
export const HIDER_DISGUISE_SPEED_FACTOR = 0.7;
export const DISGUISE_LOCK_RADIUS = 3;
export const DISGUISE_LOCK_CLUSTER_COUNT = 2;
export const HUNTER_TOTAL_STRIKES = 3;
export const KNIFE_RANGE = 2;
export const KNIFE_COOLDOWN_MS = 600;
export const PISTOL_CONE_DEGREES = 40;
export const PISTOL_REVEAL_MS = 2000;
export const CROSSBOW_RELOAD_MS = 1800;
export const ROUND_INTERMISSION_MS = 5000;
export const WASTED_STRIKE_SCORE = 0;
export const HUNTER_CATCH_SCORE = 100;
export const HUNTER_SWEEP_BONUS = 50;
export const HIDER_SURVIVAL_BONUS = 100;
export const PISTOL_REVEAL_RADIUS = 36;
export const SHARED_MOVE_SUBSTEPS = 4;
export const LAND_MOVE_SPEED = 7.2;
export const SHALLOW_WATER_SPEED_FACTOR = 0.65;
export const DEEP_WATER_SPEED_FACTOR = 0.45;
export const DEEP_CHANNEL_THRESHOLD = 0.58;
export const PISTOL_COOLDOWN_MS = 250;
export const CROSSBOW_CONE_DEGREES = 120;
export const PLAYER_COLLISION_RADIUS = 0.22;
export const MOVEMENT_SUBSTEP_DISTANCE = 0.25;
export const MAP_PLAYER_EDGE_MARGIN = 1;
export const PROP_STRIKE_RADIUS = 0.55;
export const PLAYER_HIT_RADIUS = 0.4;
export const DEBUG_BOT_MAX_COUNT = 2;
export const DEBUG_BOT_RETHINK_MS = 2200;
export const REMOTE_INTERPOLATION_FACTOR = 0.28;
export const SERVER_POSITION_SNAP_THRESHOLD = 0.8;
export const CATCH_SCREEN_SHAKE_MS = 300;
export const DISGUISE_TINT_STRENGTH = 0.64;
export const TERRAIN_CONFIG = {
  broadNoiseFrequency: 0.022, detailNoiseFrequency: 0.065,
  broadAmplitude: 0.3, detailAmplitude: 0.2,
  zoneCFlattenStart: 4, zoneCFlattenEnd: 35, zoneCAmplitudeFactor: 0.82,
  pathFlattenStart: 0.25, pathFlattenEnd: 5,
  riverExtension: 42, riverFlattenEnd: 5,
  yardCenterX: 207, yardCenterZ: 92, yardCenterOffsetZ: 4, yardFlatRadius: 13, yardBlendRadius: 16,
  campFlatRadius: 4.5, campBlendRadius: 7, cropFieldRadiusX: 3.9, cropFieldRadiusZ: 2.9,
  fieldFlattenStart: 0.82, fieldFlattenEnd: 1.25,
  marshFieldCenterX: 144.25, marshFieldCenterZ: 98, marshFieldRadiusX: 3.4, marshFieldRadiusZ: 2.6,
};
