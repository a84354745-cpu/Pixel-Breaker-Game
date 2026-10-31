/**
 * CONFIG: Central tuning parameters for Pixel Breaker
 * Perfectly matched to the video recordings:
 * - Left vertical launch chute (Level 1) & partitioned chambers (Level 2+)
 * - Ultra-fine pixel mosaic bricks (blue with yellow arrow, purple/green chambers)
 * - Tiny fast white balls (r ~ 2.8px) that chain-react and tunnel
 * - Power-up drops (+3 cyan ball multiply, <-> green paddle expand, ★ orange smash, ⚡ purple laser)
 */
export const CONFIG = {
  // Virtual Canvas Dimensions (9:16 portrait)
  CANVAS_WIDTH: 540,
  CANVAS_HEIGHT: 960,

  // HUD
  HUD_HEIGHT: 44,

  // Arena Dimensions (top ~60% of screen)
  ARENA_TOP: 50,
  ARENA_BOTTOM: 580,
  WALL_THICKNESS: 12,
  CHUTE_WIDTH: 18,            // Left vertical launch chute in Level 1
  PLAY_ZONE_BOTTOM: 960,

  // Grid specs for fine pixel bricks
  GRID_COLS: 48,
  GRID_ROWS: 44,
  BRICK_WIDTH: 8.4,
  BRICK_HEIGHT: 7.4,
  BRICK_GAP: 0.8,
  GRID_LEFT: 38,
  GRID_TOP: 62,

  // Ball physics
  BALL_RADIUS: 2.8,           // Tiny white balls
  STARTING_BALLS_COUNT: 1,    // Exactly 1 ball on pad
  BASE_BALL_SPEED: 6.2,
  MAX_BALL_SPEED: 9.5,
  BALL_SUBSTEPS: 4,
  MAX_BOUNCE_ANGLE_DEG: 72,

  // Paddle
  PADDLE_Y: 880,              // In lower dark zone
  PADDLE_HEIGHT: 12,          // Sleek glowing paddle
  PADDLE_BASE_WIDTH: 100,
  PADDLE_MIN_WIDTH: 65,

  // 500 Levels & Progression
  TOTAL_LEVELS: 500,
  BOSS_INTERVAL: 25,
  BOSS_TIME_LIMIT_SEC: 90,
  INITIAL_LIVES: 3,            // Exact 3-lives system for every level

  // Power-up drops
  POWERUP_FALL_SPEED: 2.4,
  POWERUP_RADIUS: 12,
  BASE_DROP_CHANCE: 0.05,     // Dropped by destroyed bricks

  // Durations
  SMASH_DURATION: 5.0,
  WIDE_PADDLE_DURATION: 10.0,
  SLOW_BALL_DURATION: 8.0,
  SHRINK_PADDLE_DURATION: 6.0,
  FAST_BALL_DURATION: 6.0,
  REVERSE_CONTROLS_DURATION: 5.0,

  // Visual Palette matching video frames
  COLORS: {
    bg: '#0a0918',            // Deep dark navy/black background
    playZone: '#060512',
    grayWall: '#4b5563',      // Gray pixel frame
    grayWallHighlight: '#6b7280',
    barrageWall: '#9ca3af',   // Chamber divider walls
    brickBlue: '#1d4ed8',     // Vibrant blue pixel bricks (Level 1)
    brickBlueBorder: '#1e40af',
    brickYellow: '#eab308',   // Yellow pixel arrow
    brickYellowHighlight: '#fde047',
    brickPurple: '#7c3aed',   // Top room violet (Level 2)
    brickGreen: '#16a34a',    // Bottom rooms green (Level 2)
    brickRed: '#dc2626',      // 3 HP
    paddle: '#ff4d00',        // Glowing red-orange paddle
    paddleHighlight: '#ffedd5',
    paddleGlow: '#ff5500',
    ball: '#ffffff',
    smashBall: '#fb923c',
    laserBeam: '#a855f7',
  },
};
