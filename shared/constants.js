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
export const HIDE_PHASE_SECONDS = 10;
export const HUNT_PHASE_SECONDS = 120;
export const GAME_TICK_RATE_HZ = 20;
export const GAME_TICK_INTERVAL_MS = 1000 / GAME_TICK_RATE_HZ;
export const PLAYER_MAX_SPEED = 7.2;
export const PLAYER_COLLISION_RADIUS = 0.22;
export const PLAYER_POSITION_CORRECTION_THRESHOLD = 0.45;
export const SNAPSHOT_INTERPOLATION_DELAY_MS = 100;
export const SNAPSHOT_BUFFER_MAX_MS = 600;
export const GAME_MAX_DELTA_SECONDS = 0.25;
export const SHALLOW_WATER_SPEED_FACTOR = 0.65;
export const DEEP_WATER_SPEED_FACTOR = 0.45;
export const DEEP_CHANNEL_THRESHOLD = 0.58;
export const MAX_ROOM_PLAYERS = 6;
export const ROOM_CODE_LENGTH = 4;
export const RECONNECT_WINDOW_MS = 30_000;
export const INPUT_MAX_ABS = 1;
export const SPAWN_SEARCH_STEP = 1.5;
export const SPAWN_SEARCH_MAX_RADIUS = 18;
export const BOT_MAX_COUNT = 2;
export const BOT_WANDER_INTERVAL_MIN_MS = 1200;
export const BOT_WANDER_INTERVAL_MAX_MS = 3600;
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
