/**
 * Pixel Breaker - Game Engine & Physics
 * 3-Lives System with Full Level Reset, Level Snapshots, Safe LocalStorage,
 * and Level Unlock System.
 */

import { CONFIG } from './gameConfig.ts';
import { PIXEL_PICTURES, createPRNG, mirrorPicture, rotatePicture90 } from './pixelPictures.ts';
import { sound } from './gameAudio.ts';

export type GameState =
  | 'TITLE'
  | 'PLAYING'
  | 'PAUSED'
  | 'VICTORY'
  | 'GAME_OVER'
  | 'GAME_COMPLETE';

export type PowerUpType =
  | 'TRIPLE'
  | 'WIDE_PADDLE'
  | 'SMASH'
  | 'LASER'
  | 'LIFE'
  | 'SLOW_BALL';

export interface PowerUpOrb {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  vy: number;
  radius: number;
  color: string;
  label: string;
}

export interface BrickCell {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  isYellow: boolean;
  isWall: boolean;
  color: string;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  isSmash: boolean;
  stuckOnPaddle: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface LaserBeam {
  x: number;
  timer: number;
  maxTimer: number;
}

export interface WallSegment {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GameEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;

  public state: GameState = 'TITLE';
  public currentLevel: number = 1;
  public highestUnlockedLevel: number = 1;
  public score: number = 0;
  public levelInitialScore: number = 0;
  public highScore: number = 0;
  public lives: number = CONFIG.INITIAL_LIVES; // Exactly 3 chances
  public combo: number = 0;
  public comboTimer: number = 0;

  // Bricks & Walls
  public brickGrid: (BrickCell | null)[] = [];
  public walls: WallSegment[] = [];
  public totalYellowBricks: number = 0;
  public yellowRemaining: number = 0;
  public pictureName: string = '';
  public isBoss: boolean = false;
  public bossTimer: number = CONFIG.BOSS_TIME_LIMIT_SEC;

  // Pristine Level Snapshot for Full Reset
  private levelSnapshot: (BrickCell | null)[] = [];
  private snapshotTotalYellow: number = 0;

  // Entities
  public balls: Ball[] = [];
  public powerUpOrbs: PowerUpOrb[] = [];
  public particles: Particle[] = [];
  public laserBeams: LaserBeam[] = [];

  // Paddle
  public paddle = {
    x: CONFIG.CANVAS_WIDTH / 2,
    y: CONFIG.PADDLE_Y,
    w: CONFIG.PADDLE_BASE_WIDTH,
    h: CONFIG.PADDLE_HEIGHT,
    targetX: CONFIG.CANVAS_WIDTH / 2,
    vx: 0,
  };

  // Active power-up timers
  public activePowerups = {
    smash: 0,
    widePaddle: 0,
    slowBall: 0,
  };

  public levelTimer: number = 0;
  public screenShake: number = 0;
  public lifeLostFlash: number = 0; // Red flash timer on life loss
  public levelStars: Record<number, number> = {};
  public justUnlockedLevel: number | null = null;

  public mouseX: number = CONFIG.CANVAS_WIDTH / 2;
  public isTouchActive: boolean = false;

  private lastTime: number = 0;
  private animFrameId: number | null = null;
  private nextEntityId: number = 1;

  public onStateChange?: (state: GameState) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CONFIG.CANVAS_WIDTH;
    this.canvas.height = CONFIG.CANVAS_HEIGHT;
    this.ctx = canvas.getContext('2d', { alpha: false })!;

    this.loadProgress();
    this.initLevel(this.currentLevel);
    this.setupInputs();
  }

  /**
   * Load progress with strict try/catch
   */
  public loadProgress() {
    try {
      const savedHighest = localStorage.getItem('pixelbreaker_highest_level');
      if (savedHighest) {
        const parsed = parseInt(savedHighest, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= CONFIG.TOTAL_LEVELS) {
          this.highestUnlockedLevel = parsed;
          this.currentLevel = parsed;
        } else {
          this.highestUnlockedLevel = 1;
          this.currentLevel = 1;
        }
      } else {
        this.highestUnlockedLevel = 1;
        this.currentLevel = 1;
      }
    } catch {
      this.highestUnlockedLevel = 1;
      this.currentLevel = 1;
    }

    try {
      const savedScore = localStorage.getItem('pixelbreaker_high_score');
      if (savedScore) {
        this.highScore = parseInt(savedScore, 10) || 0;
      }
    } catch {
      this.highScore = 0;
    }

    try {
      const savedStars = localStorage.getItem('pixelbreaker_stars');
      if (savedStars) {
        this.levelStars = JSON.parse(savedStars) || {};
      } else {
        this.levelStars = {};
      }
    } catch {
      this.levelStars = {};
    }
  }

  /**
   * Save progress with strict try/catch
   */
  public saveProgress() {
    try {
      localStorage.setItem('pixelbreaker_highest_level', this.highestUnlockedLevel.toString());
    } catch {}

    try {
      localStorage.setItem('pixelbreaker_high_score', this.highScore.toString());
    } catch {}

    try {
      localStorage.setItem('pixelbreaker_stars', JSON.stringify(this.levelStars));
    } catch {}
  }

  /**
   * Reset player progress back to Level 1
   */
  public resetProgress() {
    this.highestUnlockedLevel = 1;
    this.currentLevel = 1;
    this.levelStars = {};
    this.score = 0;
    this.highScore = 0;
    try {
      localStorage.removeItem('pixelbreaker_highest_level');
      localStorage.removeItem('pixelbreaker_stars');
      localStorage.removeItem('pixelbreaker_high_score');
    } catch {}
    this.initLevel(1);
    this.setState('TITLE');
  }

  public isLevelUnlocked(lvl: number): boolean {
    return lvl <= this.highestUnlockedLevel;
  }

  /**
   * Initialize Level and capture pristine levelSnapshot for reset
   */
  public initLevel(levelNum: number) {
    this.currentLevel = levelNum;
    this.isBoss = levelNum % CONFIG.BOSS_INTERVAL === 0;
    this.bossTimer = CONFIG.BOSS_TIME_LIMIT_SEC;
    this.levelTimer = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.lives = CONFIG.INITIAL_LIVES; // Exactly 3 chances every level
    this.levelInitialScore = this.score;

    this.balls = [];
    this.powerUpOrbs = [];
    this.particles = [];
    this.laserBeams = [];
    this.walls = [];

    this.activePowerups = {
      smash: 0,
      widePaddle: 0,
      slowBall: 0,
    };

    this.paddle.w = CONFIG.PADDLE_BASE_WIDTH;
    this.paddle.x = CONFIG.CANVAS_WIDTH / 2;
    this.paddle.targetX = CONFIG.CANVAS_WIDTH / 2;

    const cols = CONFIG.GRID_COLS;
    const rows = CONFIG.GRID_ROWS;
    this.brickGrid = new Array(cols * rows).fill(null);

    const pitchX = CONFIG.BRICK_WIDTH + CONFIG.BRICK_GAP;
    const pitchY = CONFIG.BRICK_HEIGHT + CONFIG.BRICK_GAP;

    let yellowCount = 0;

    if (levelNum === 1) {
      // Level 1: Left launch chute & stepped ramp with blue mosaic and yellow up-arrow
      this.pictureName = 'Up Arrow';

      const wallT = CONFIG.WALL_THICKNESS;
      const topY = CONFIG.ARENA_TOP;
      const botY = CONFIG.ARENA_BOTTOM;
      const chuteW = CONFIG.CHUTE_WIDTH;
      const chuteLeft = 14;
      const chuteInnerX = chuteLeft + chuteW;

      this.walls.push({ x: chuteLeft - wallT, y: topY, w: wallT, h: botY - topY });
      const topEntryH = 28;
      this.walls.push({
        x: chuteInnerX,
        y: topY + topEntryH,
        w: wallT,
        h: botY - topY - topEntryH,
      });

      this.walls.push({ x: chuteLeft - wallT, y: topY - wallT, w: CONFIG.CANVAS_WIDTH - chuteLeft, h: wallT });
      this.walls.push({ x: CONFIG.CANVAS_WIDTH - 20, y: topY, w: wallT, h: botY - topY });

      for (let s = 0; s < 5; s++) {
        this.walls.push({
          x: chuteInnerX + s * 10,
          y: botY - s * 8,
          w: 10,
          h: 8,
        });
      }

      const rawPic = PIXEL_PICTURES[0];
      const picRows = rawPic.rows;
      const picScale = 2;
      const picW = 16 * picScale;
      const picH = picRows.length * picScale;
      const startCol = Math.floor((cols - picW) / 2) + 2;
      const startRow = Math.floor((rows - picH) / 2) - 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = CONFIG.GRID_LEFT + c * pitchX;
          const by = CONFIG.GRID_TOP + r * pitchY;

          let isYellow = false;
          if (r >= startRow && r < startRow + picH && c >= startCol && c < startCol + picW) {
            const pr = Math.floor((r - startRow) / picScale);
            const pc = Math.floor((c - startCol) / picScale);
            if (pr >= 0 && pr < picRows.length && pc >= 0 && pc < picRows[pr].length && picRows[pr][pc] === '#') {
              isYellow = true;
            }
          }

          if (isYellow) yellowCount++;

          this.brickGrid[r * cols + c] = {
            id: this.nextEntityId++,
            row: r,
            col: c,
            x: bx,
            y: by,
            w: CONFIG.BRICK_WIDTH,
            h: CONFIG.BRICK_HEIGHT,
            hp: 1,
            maxHp: 1,
            isYellow,
            isWall: false,
            color: isYellow ? CONFIG.COLORS.brickYellow : CONFIG.COLORS.brickBlue,
          };
        }
      }
    } else if (levelNum === 2) {
      // Level 2: Top purple room & bottom green rooms with central passage
      this.pictureName = 'Dual Chambers';

      const wallT = 8;
      const topY = CONFIG.ARENA_TOP;
      const botY = CONFIG.ARENA_BOTTOM;
      const midY = topY + (botY - topY) * 0.48;
      const centerX = CONFIG.CANVAS_WIDTH / 2;
      const gateWidth = 40;

      this.walls.push({ x: 18, y: topY, w: wallT, h: botY - topY });
      this.walls.push({ x: CONFIG.CANVAS_WIDTH - 26, y: topY, w: wallT, h: botY - topY });
      this.walls.push({ x: 18, y: topY - wallT, w: CONFIG.CANVAS_WIDTH - 44, h: wallT });

      this.walls.push({ x: 18, y: midY, w: centerX - gateWidth / 2 - 18, h: wallT });
      this.walls.push({ x: centerX + gateWidth / 2, y: midY, w: CONFIG.CANVAS_WIDTH - 26 - (centerX + gateWidth / 2), h: wallT });

      this.walls.push({ x: centerX - gateWidth / 2, y: midY, w: wallT, h: botY - midY });
      this.walls.push({ x: centerX + gateWidth / 2 - wallT, y: midY, w: wallT, h: botY - midY });

      const midRow = Math.floor(rows * 0.46);
      const centerCol = Math.floor(cols / 2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = CONFIG.GRID_LEFT + c * pitchX;
          const by = CONFIG.GRID_TOP + r * pitchY;

          if (r >= midRow && Math.abs(c - centerCol) <= 2) continue;

          let color = CONFIG.COLORS.brickPurple;
          let isYellow = false;

          if (r >= midRow) {
            color = CONFIG.COLORS.brickGreen;
          }

          if (r < midRow && Math.abs(c - centerCol) <= 4 && r >= 8 && r <= 16) {
            isYellow = true;
            color = CONFIG.COLORS.brickYellow;
            yellowCount++;
          }

          this.brickGrid[r * cols + c] = {
            id: this.nextEntityId++,
            row: r,
            col: c,
            x: bx,
            y: by,
            w: CONFIG.BRICK_WIDTH,
            h: CONFIG.BRICK_HEIGHT,
            hp: 1,
            maxHp: 1,
            isYellow,
            isWall: false,
            color,
          };
        }
      }
    } else {
      // Levels 3 to 500: Procedural layouts using seed = levelNum
      const rng = createPRNG(levelNum);
      const picIndex = (levelNum - 1) % PIXEL_PICTURES.length;
      const rawPic = PIXEL_PICTURES[picIndex];
      this.pictureName = rawPic.name;

      let picRows = [...rawPic.rows];
      if (rng() > 0.5) picRows = mirrorPicture(picRows);
      if (rng() > 0.7) picRows = rotatePicture90(picRows);

      const wallT = CONFIG.WALL_THICKNESS;
      const topY = CONFIG.ARENA_TOP;
      const botY = CONFIG.ARENA_BOTTOM;
      this.walls.push({ x: 20, y: topY, w: wallT, h: botY - topY });
      this.walls.push({ x: CONFIG.CANVAS_WIDTH - 32, y: topY, w: wallT, h: botY - topY });
      this.walls.push({ x: 20, y: topY - wallT, w: CONFIG.CANVAS_WIDTH - 52, h: wallT });

      const picScale = 2;
      const picW = (picRows[0]?.length || 16) * picScale;
      const picH = picRows.length * picScale;
      const startCol = Math.floor((cols - picW) / 2);
      const startRow = Math.floor((rows - picH) / 2);

      const colorList = [CONFIG.COLORS.brickBlue, CONFIG.COLORS.brickPurple, CONFIG.COLORS.brickGreen];
      const baseColor = colorList[(levelNum - 1) % colorList.length];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = CONFIG.GRID_LEFT + c * pitchX;
          const by = CONFIG.GRID_TOP + r * pitchY;

          let isYellow = false;
          if (r >= startRow && r < startRow + picH && c >= startCol && c < startCol + picW) {
            const pr = Math.floor((r - startRow) / picScale);
            const pc = Math.floor((c - startCol) / picScale);
            if (pr >= 0 && pr < picRows.length && pc >= 0 && pc < picRows[pr].length && picRows[pr][pc] === '#') {
              isYellow = true;
            }
          }

          if (isYellow) yellowCount++;

          this.brickGrid[r * cols + c] = {
            id: this.nextEntityId++,
            row: r,
            col: c,
            x: bx,
            y: by,
            w: CONFIG.BRICK_WIDTH,
            h: CONFIG.BRICK_HEIGHT,
            hp: 1,
            maxHp: 1,
            isYellow,
            isWall: false,
            color: isYellow ? CONFIG.COLORS.brickYellow : baseColor,
          };
        }
      }
    }

    this.totalYellowBricks = yellowCount || 30;
    this.yellowRemaining = this.totalYellowBricks;

    // STORE PRISTINE SNAPSHOT FOR FULL RESET
    this.snapshotTotalYellow = this.totalYellowBricks;
    this.levelSnapshot = this.brickGrid.map((b) => (b ? { ...b } : null));

    // Spawn initial single ball on paddle
    this.spawnSingleBallOnPaddle();
  }

  /**
   * FULL LEVEL RESET:
   * Called when all 3 lives are lost or player chooses Try Again.
   * Restores complete brick grid from pristine snapshot, resets lives to 3,
   * resets balls, paddle, power-ups and level score.
   */
  public restartCurrentLevel() {
    this.lives = CONFIG.INITIAL_LIVES; // 3 lives restored
    this.score = this.levelInitialScore;
    this.combo = 0;
    this.comboTimer = 0;
    this.levelTimer = 0;
    this.bossTimer = CONFIG.BOSS_TIME_LIMIT_SEC;

    // Restore brick grid from pristine snapshot
    this.brickGrid = this.levelSnapshot.map((b) => (b ? { ...b } : null));
    this.yellowRemaining = this.snapshotTotalYellow;
    this.totalYellowBricks = this.snapshotTotalYellow;

    // Clear entities & active effects
    this.balls = [];
    this.powerUpOrbs = [];
    this.particles = [];
    this.laserBeams = [];
    this.activePowerups = {
      smash: 0,
      widePaddle: 0,
      slowBall: 0,
    };

    // Reset paddle and spawn fresh ball
    this.paddle.w = CONFIG.PADDLE_BASE_WIDTH;
    this.paddle.x = CONFIG.CANVAS_WIDTH / 2;
    this.paddle.targetX = CONFIG.CANVAS_WIDTH / 2;
    this.spawnSingleBallOnPaddle();

    this.setState('PLAYING');
  }

  public spawnSingleBallOnPaddle() {
    this.balls = [
      {
        id: this.nextEntityId++,
        x: this.paddle.x,
        y: this.paddle.y - this.paddle.h / 2 - CONFIG.BALL_RADIUS - 2,
        vx: 0,
        vy: 0,
        radius: CONFIG.BALL_RADIUS,
        speed: CONFIG.BASE_BALL_SPEED,
        isSmash: false,
        stuckOnPaddle: true,
      },
    ];
  }

  public launchBall() {
    for (const b of this.balls) {
      if (b.stuckOnPaddle) {
        b.stuckOnPaddle = false;
        let angle = -Math.PI / 2;
        if (this.currentLevel === 1) {
          angle = -Math.PI * 0.72; // Aim left toward chute
        } else {
          angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.25;
        }
        b.vx = b.speed * Math.cos(angle);
        b.vy = b.speed * Math.sin(angle);
      }
    }
    sound.playPaddleBounce();
  }

  private setupInputs() {
    const handleMove = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = CONFIG.CANVAS_WIDTH / rect.width;
      const rawX = (clientX - rect.left) * scaleX;

      this.paddle.targetX = rawX;
      this.mouseX = rawX;

      for (const b of this.balls) {
        if (b.stuckOnPaddle) {
          b.x = this.paddle.x;
        }
      }
    };

    this.canvas.addEventListener('mousemove', (e) => handleMove(e.clientX));
    this.canvas.addEventListener('mousedown', () => {
      sound.unlockAudio();
      if (this.state === 'PLAYING') this.launchBall();
    });

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
          this.isTouchActive = true;
          handleMove(e.touches[0].clientX);
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        sound.unlockAudio();
        if (e.touches.length > 0) {
          this.isTouchActive = true;
          handleMove(e.touches[0].clientX);
          if (this.state === 'PLAYING') this.launchBall();
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isTouchActive = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.state === 'PLAYING') this.launchBall();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'PLAYING') this.setState('PAUSED');
        else if (this.state === 'PAUSED') this.setState('PLAYING');
      }
    });
  }

  public setState(newState: GameState) {
    this.state = newState;
    if (this.onStateChange) this.onStateChange(newState);
  }

  public start() {
    if (this.animFrameId !== null) return;
    this.lastTime = performance.now();
    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
      this.lastTime = timestamp;

      this.update(dt);
      this.render();

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public update(dt: number) {
    if (this.state !== 'PLAYING') {
      this.updateParticles(dt);
      return;
    }

    this.levelTimer += dt;

    if (this.lifeLostFlash > 0) {
      this.lifeLostFlash = Math.max(0, this.lifeLostFlash - dt);
    }

    if (this.isBoss) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.bossTimer = 0;
        this.handleAllLivesLost();
        return;
      }
    }

    if (this.screenShake > 0.01) {
      this.screenShake *= Math.pow(0.9, dt * 60);
    } else {
      this.screenShake = 0;
    }

    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (this.activePowerups.smash > 0) this.activePowerups.smash = Math.max(0, this.activePowerups.smash - dt);
    if (this.activePowerups.widePaddle > 0) this.activePowerups.widePaddle = Math.max(0, this.activePowerups.widePaddle - dt);
    if (this.activePowerups.slowBall > 0) this.activePowerups.slowBall = Math.max(0, this.activePowerups.slowBall - dt);

    let targetW = CONFIG.PADDLE_BASE_WIDTH;
    if (this.activePowerups.widePaddle > 0) targetW *= 1.6;
    this.paddle.w += (targetW - this.paddle.w) * 0.2;

    const minPaddleX = 25 + this.paddle.w / 2;
    const maxPaddleX = CONFIG.CANVAS_WIDTH - 25 - this.paddle.w / 2;
    const clampedTarget = Math.max(minPaddleX, Math.min(maxPaddleX, this.paddle.targetX));
    const prevX = this.paddle.x;
    this.paddle.x += (clampedTarget - this.paddle.x) * 0.45;
    this.paddle.vx = this.paddle.x - prevX;

    this.updateBalls(dt);
    this.updatePowerUpOrbs(dt);
    this.updateLaserBeams(dt);
    this.updateParticles(dt);
  }

  private updateBalls(dt: number) {
    const paddleTop = this.paddle.y - this.paddle.h / 2;
    const paddleBottom = this.paddle.y + this.paddle.h / 2;
    const paddleLeft = this.paddle.x - this.paddle.w / 2;
    const paddleRight = this.paddle.x + this.paddle.w / 2;

    const pitchX = CONFIG.BRICK_WIDTH + CONFIG.BRICK_GAP;
    const pitchY = CONFIG.BRICK_HEIGHT + CONFIG.BRICK_GAP;
    const cols = CONFIG.GRID_COLS;
    const rows = CONFIG.GRID_ROWS;

    let speedMult = 1.0;
    if (this.activePowerups.slowBall > 0) speedMult *= 0.65;

    const isSmashGlobal = this.activePowerups.smash > 0;
    const ballsToKeep: Ball[] = [];

    for (const ball of this.balls) {
      if (ball.stuckOnPaddle) {
        ball.x = this.paddle.x;
        ball.y = paddleTop - ball.radius - 1;
        ballsToKeep.push(ball);
        continue;
      }

      ball.isSmash = isSmashGlobal;
      const currentSpeed = ball.speed * speedMult;
      const curMag = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / curMag) * currentSpeed;
      ball.vy = (ball.vy / curMag) * currentSpeed;

      const moveDist = currentSpeed * (dt * 60);
      const substeps = Math.max(CONFIG.BALL_SUBSTEPS, Math.ceil(moveDist / 2.5));
      const subDt = dt / substeps;

      let ballLost = false;

      for (let s = 0; s < substeps; s++) {
        ball.x += ball.vx * (subDt * 60);
        ball.y += ball.vy * (subDt * 60);

        if (ball.x - ball.radius < 0) {
          ball.x = ball.radius;
          ball.vx = Math.abs(ball.vx);
        }
        if (ball.x + ball.radius > CONFIG.CANVAS_WIDTH) {
          ball.x = CONFIG.CANVAS_WIDTH - ball.radius;
          ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y - ball.radius < CONFIG.ARENA_TOP - 16) {
          ball.y = CONFIG.ARENA_TOP - 16 + ball.radius;
          ball.vy = Math.abs(ball.vy);
        }

        for (const wall of this.walls) {
          const cxClosest = Math.max(wall.x, Math.min(ball.x, wall.x + wall.w));
          const cyClosest = Math.max(wall.y, Math.min(ball.y, wall.y + wall.h));
          const distX = ball.x - cxClosest;
          const distY = ball.y - cyClosest;

          if (distX * distX + distY * distY <= ball.radius * ball.radius) {
            if (Math.abs(distX) > Math.abs(distY)) {
              ball.vx = distX > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
              ball.x = cxClosest + (distX > 0 ? ball.radius : -ball.radius);
            } else {
              ball.vy = distY > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
              ball.y = cyClosest + (distY > 0 ? ball.radius : -ball.radius);
            }
          }
        }

        if (
          ball.vy > 0 &&
          ball.y + ball.radius >= paddleTop &&
          ball.y - ball.radius <= paddleBottom &&
          ball.x >= paddleLeft - 4 &&
          ball.x <= paddleRight + 4
        ) {
          ball.y = paddleTop - ball.radius;
          const hitOffset = (ball.x - this.paddle.x) / (this.paddle.w / 2);
          const clampedOffset = Math.max(-0.95, Math.min(0.95, hitOffset));
          const maxRad = (CONFIG.MAX_BOUNCE_ANGLE_DEG * Math.PI) / 180;
          const bounceAngle = clampedOffset * maxRad;

          ball.vx = currentSpeed * Math.sin(bounceAngle) + this.paddle.vx * 0.15;
          ball.vy = -currentSpeed * Math.cos(bounceAngle);

          sound.playPaddleBounce();
          this.triggerHaptic(8);
          this.spawnParticlePuff(ball.x, paddleTop, CONFIG.COLORS.paddle, 4);
          continue;
        }

        const minC = Math.max(0, Math.floor((ball.x - ball.radius - CONFIG.GRID_LEFT) / pitchX));
        const maxC = Math.min(cols - 1, Math.floor((ball.x + ball.radius - CONFIG.GRID_LEFT) / pitchX));
        const minR = Math.max(0, Math.floor((ball.y - ball.radius - CONFIG.GRID_TOP) / pitchY));
        const maxR = Math.min(rows - 1, Math.floor((ball.y + ball.radius - CONFIG.GRID_TOP) / pitchY));

        let hitAnyBrick = false;

        for (let r = minR; r <= maxR && !hitAnyBrick; r++) {
          for (let c = minC; c <= maxC && !hitAnyBrick; c++) {
            const idx = r * cols + c;
            const brick = this.brickGrid[idx];
            if (!brick || brick.hp <= 0) continue;

            const cxClosest = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
            const cyClosest = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
            const distX = ball.x - cxClosest;
            const distY = ball.y - cyClosest;

            if (distX * distX + distY * distY <= ball.radius * ball.radius) {
              hitAnyBrick = true;

              brick.hp -= ball.isSmash ? 99 : 1;

              if (brick.hp <= 0) {
                this.brickGrid[idx] = null;
                this.spawnParticlePuff(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 3);

                if (brick.isYellow) {
                  this.yellowRemaining--;
                  sound.playYellowBreak();
                  this.triggerHaptic(16);
                  this.score += 50 * Math.min(6, this.combo + 1);
                } else {
                  this.score += 10;
                  sound.playBrickHit(this.combo, false);
                  this.triggerHaptic(6);
                }

                this.combo++;
                this.comboTimer = 1.4;

                this.checkPowerUpDrop(brick);

                if (this.yellowRemaining <= 0) {
                  this.triggerVictory();
                  return;
                }
              }

              if (!ball.isSmash) {
                if (Math.abs(distX) > Math.abs(distY)) {
                  ball.vx = distX > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
                  ball.x = cxClosest + (distX > 0 ? ball.radius : -ball.radius);
                } else {
                  ball.vy = distY > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
                  ball.y = cyClosest + (distY > 0 ? ball.radius : -ball.radius);
                }
              }
            }
          }
        }

        if (ball.y - ball.radius > CONFIG.PLAY_ZONE_BOTTOM) {
          ballLost = true;
          break;
        }
      }

      if (!ballLost) {
        ballsToKeep.push(ball);
      }
    }

    this.balls = ballsToKeep;

    // When all balls fall below paddle: handle lose 1 life
    if (this.balls.length === 0) {
      this.handleLoseLife();
    }
  }

  /**
   * Losing 1 life:
   * 1. Decrement lives.
   * 2. Flash red.
   * 3. Do NOT rebuild bricks (destroyed bricks remain destroyed).
   * 4. Respawn 1 fresh ball on paddle.
   * 5. If lives == 0, trigger full Level Failed.
   */
  private handleLoseLife() {
    this.lives--;
    sound.playBallLost();
    this.triggerHaptic([40, 50, 40]);
    this.screenShake = 10;
    this.lifeLostFlash = 0.35;
    this.combo = 0;

    if (this.lives <= 0) {
      this.handleAllLivesLost();
    } else {
      // Player continues with remaining bricks! Respawn single ball on paddle
      this.spawnSingleBallOnPaddle();
    }
  }

  private handleAllLivesLost() {
    this.lives = 0;
    sound.playGameOver();
    this.saveProgress();
    this.setState('GAME_OVER'); // "Level Failed" screen
  }

  private checkPowerUpDrop(brick: BrickCell) {
    if (Math.random() > CONFIG.BASE_DROP_CHANCE) return;

    const roll = Math.random();
    let type: PowerUpType = 'TRIPLE';
    let color = '#38bdf8';
    let label = '+3';

    if (roll < 0.35) {
      type = 'TRIPLE';
      color = '#38bdf8';
      label = '+3';
    } else if (roll < 0.60) {
      type = 'WIDE_PADDLE';
      color = '#22c55e';
      label = '<->';
    } else if (roll < 0.75) {
      type = 'SMASH';
      color = '#f97316';
      label = '★';
    } else if (roll < 0.88) {
      type = 'LASER';
      color = '#c084fc';
      label = '⚡';
    } else {
      type = 'LIFE';
      color = '#f43f5e';
      label = '♥';
    }

    this.powerUpOrbs.push({
      id: this.nextEntityId++,
      type,
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h / 2,
      vy: CONFIG.POWERUP_FALL_SPEED,
      radius: CONFIG.POWERUP_RADIUS,
      color,
      label,
    });
  }

  private updatePowerUpOrbs(dt: number) {
    const paddleTop = this.paddle.y - this.paddle.h / 2;
    const paddleBottom = this.paddle.y + this.paddle.h / 2;
    const paddleLeft = this.paddle.x - this.paddle.w / 2;
    const paddleRight = this.paddle.x + this.paddle.w / 2;

    const remaining: PowerUpOrb[] = [];

    for (const orb of this.powerUpOrbs) {
      orb.y += orb.vy * (dt * 60);

      if (
        orb.y + orb.radius >= paddleTop &&
        orb.y - orb.radius <= paddleBottom &&
        orb.x + orb.radius >= paddleLeft &&
        orb.x - orb.radius <= paddleRight
      ) {
        this.applyPowerUp(orb);
        continue;
      }

      if (orb.y - orb.radius < CONFIG.CANVAS_HEIGHT) {
        remaining.push(orb);
      }
    }

    this.powerUpOrbs = remaining;
  }

  public applyPowerUp(orb: PowerUpOrb) {
    this.score += 100;
    sound.playPowerupCollect();
    this.triggerHaptic([12, 20, 15]);

    switch (orb.type) {
      case 'TRIPLE': {
        const newBalls: Ball[] = [];
        if (this.balls.length === 0) {
          this.spawnSingleBallOnPaddle();
          this.launchBall();
        } else {
          for (const b of this.balls) {
            const speed = Math.hypot(b.vx, b.vy) || CONFIG.BASE_BALL_SPEED;
            const curAngle = Math.atan2(b.vy, b.vx);
            const a1 = curAngle + 0.35;
            const a2 = curAngle - 0.35;
            newBalls.push({
              id: this.nextEntityId++,
              x: b.x,
              y: b.y,
              vx: speed * Math.cos(a1),
              vy: speed * Math.sin(a1),
              radius: b.radius,
              speed: b.speed,
              isSmash: b.isSmash,
              stuckOnPaddle: false,
            });
            newBalls.push({
              id: this.nextEntityId++,
              x: b.x,
              y: b.y,
              vx: speed * Math.cos(a2),
              vy: speed * Math.sin(a2),
              radius: b.radius,
              speed: b.speed,
              isSmash: b.isSmash,
              stuckOnPaddle: false,
            });
          }
          this.balls.push(...newBalls.slice(0, 350 - this.balls.length));
        }
        break;
      }
      case 'WIDE_PADDLE': {
        this.activePowerups.widePaddle = CONFIG.WIDE_PADDLE_DURATION;
        break;
      }
      case 'SMASH': {
        this.activePowerups.smash = CONFIG.SMASH_DURATION;
        break;
      }
      case 'LASER': {
        this.fireLaser();
        break;
      }
      case 'LIFE': {
        this.lives = Math.min(3, this.lives + 1);
        break;
      }
      case 'SLOW_BALL': {
        this.activePowerups.slowBall = CONFIG.SLOW_BALL_DURATION;
        break;
      }
    }
  }

  public fireLaser() {
    sound.playLaser();
    const beamX = this.paddle.x;
    this.laserBeams.push({
      x: beamX,
      timer: 0.35,
      maxTimer: 0.35,
    });

    const halfW = 16;
    for (let i = 0; i < this.brickGrid.length; i++) {
      const b = this.brickGrid[i];
      if (!b || b.hp <= 0) continue;
      if (b.x + b.w >= beamX - halfW && b.x <= beamX + halfW) {
        this.brickGrid[i] = null;
        this.spawnParticlePuff(b.x + b.w / 2, b.y + b.h / 2, b.color, 4);
        if (b.isYellow) {
          this.yellowRemaining--;
        }
        this.score += 20;
      }
    }

    if (this.yellowRemaining <= 0) {
      this.triggerVictory();
    }
  }

  private updateLaserBeams(dt: number) {
    const rem: LaserBeam[] = [];
    for (const b of this.laserBeams) {
      b.timer -= dt;
      if (b.timer > 0) rem.push(b);
    }
    this.laserBeams = rem;
  }

  public triggerVictory() {
    sound.playVictoryFanfare();
    this.triggerHaptic([20, 30, 20, 40]);
    this.screenShake = 12;

    // Stars rating based on remaining lives
    const stars = this.lives >= 3 ? 3 : this.lives >= 2 ? 2 : 1;
    this.levelStars[this.currentLevel] = Math.max(this.levelStars[this.currentLevel] || 0, stars);

    // Unlock next level!
    if (this.currentLevel >= this.highestUnlockedLevel && this.currentLevel < CONFIG.TOTAL_LEVELS) {
      this.highestUnlockedLevel = this.currentLevel + 1;
      this.justUnlockedLevel = this.currentLevel + 1;
    }
    this.saveProgress();

    if (this.currentLevel >= CONFIG.TOTAL_LEVELS) {
      this.setState('GAME_COMPLETE');
    } else {
      this.setState('VICTORY');
    }
  }

  private triggerHaptic(pattern: number | number[] = 10) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  private spawnParticlePuff(x: number, y: number, color: string, count: number = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 2.5 + 1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: Math.random() * 2 + 1.5,
        color,
        alpha: 1.0,
        life: 0,
        maxLife: Math.random() * 0.25 + 0.15,
      });
    }
  }

  private updateParticles(dt: number) {
    const remP: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life < p.maxLife) {
        p.x += p.vx * (dt * 60);
        p.y += p.vy * (dt * 60);
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
        remP.push(p);
      }
    }
    this.particles = remP;
  }

  public render() {
    const ctx = this.ctx;
    const w = CONFIG.CANVAS_WIDTH;
    const h = CONFIG.CANVAS_HEIGHT;

    ctx.save();

    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    ctx.fillStyle = CONFIG.COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = CONFIG.COLORS.playZone;
    ctx.fillRect(0, CONFIG.ARENA_BOTTOM, w, h - CONFIG.ARENA_BOTTOM);

    this.renderWalls(ctx);
    this.renderBricks(ctx);
    this.renderLaserBeams(ctx);
    this.renderPowerUpOrbs(ctx);
    this.renderPaddle(ctx);
    this.renderBalls(ctx);
    this.renderParticles(ctx);

    // Life Lost Red Vignette Flash
    if (this.lifeLostFlash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${this.lifeLostFlash * 0.7})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Developer Credit on Canvas
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Developed by Ahmad Shahzad', w / 2, h - 8);

    ctx.restore();
  }

  private renderWalls(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = CONFIG.COLORS.grayWall;
    for (const wall of this.walls) {
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

      ctx.fillStyle = CONFIG.COLORS.grayWallHighlight;
      for (let s = 0; s < wall.w; s += 8) {
        ctx.fillRect(wall.x + s, wall.y, 6, 1.5);
      }
      ctx.fillStyle = CONFIG.COLORS.grayWall;
    }
  }

  private renderBricks(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.brickGrid.length; i++) {
      const b = this.brickGrid[i];
      if (!b || b.hp <= 0) continue;

      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      if (b.isYellow) {
        ctx.fillStyle = CONFIG.COLORS.brickYellowHighlight;
        ctx.fillRect(b.x, b.y, b.w, 1.2);
      }
    }
  }

  private renderLaserBeams(ctx: CanvasRenderingContext2D) {
    for (const beam of this.laserBeams) {
      const alpha = beam.timer / beam.maxTimer;
      ctx.save();
      ctx.shadowColor = CONFIG.COLORS.laserBeam;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`;
      ctx.fillRect(beam.x - 12 * alpha, CONFIG.ARENA_TOP, 24 * alpha, this.paddle.y - CONFIG.ARENA_TOP);

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(beam.x - 3 * alpha, CONFIG.ARENA_TOP, 6 * alpha, this.paddle.y - CONFIG.ARENA_TOP);
      ctx.restore();
    }
  }

  private renderPowerUpOrbs(ctx: CanvasRenderingContext2D) {
    for (const orb of this.powerUpOrbs) {
      ctx.save();
      ctx.shadowColor = orb.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = orb.color;

      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(orb.label, orb.x, orb.y);
      ctx.restore();
    }
  }

  private renderPaddle(ctx: CanvasRenderingContext2D) {
    const px = this.paddle.x;
    const py = this.paddle.y;
    const pw = this.paddle.w;
    const ph = this.paddle.h;

    ctx.save();
    ctx.shadowColor = CONFIG.COLORS.paddleGlow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = CONFIG.COLORS.paddle;
    ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);

    ctx.fillStyle = CONFIG.COLORS.paddleHighlight;
    ctx.fillRect(px - pw / 2 + 2, py - ph / 2 + 1, pw - 4, 2);
    ctx.restore();
  }

  private renderBalls(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const b of this.balls) {
      if (b.isSmash) {
        ctx.shadowColor = CONFIG.COLORS.smashBall;
        ctx.shadowBlur = 8;
        ctx.fillStyle = CONFIG.COLORS.smashBall;
      } else {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 4;
        ctx.fillStyle = CONFIG.COLORS.ball;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1.0;
  }
}
