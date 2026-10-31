/**
 * Pixel Breaker - React Application Shell
 * Production-ready, fair arcade game with 500 levels, 3-lives system,
 * safe localStorage persistence, Android PWA installability, and mobile optimizations.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Pause,
  ChevronRight,
  Heart,
  X,
  Settings,
  Trophy,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { GameEngine, GameState } from './gameEngine.ts';
import { CONFIG } from './gameConfig.ts';
import { sound } from './gameAudio.ts';
import { usePWAInstall } from './usePWAInstall.ts';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const { isInstallable, isInstalled, install } = usePWAInstall();

  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [highestLevel, setHighestLevel] = useState<number>(1);
  const [score, setScore] = useState<number>(0);
  const [lives, setLives] = useState<number>(CONFIG.INITIAL_LIVES);
  const [isMuted, setIsMuted] = useState<boolean>(sound.isMuted());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [hasStuckBall, setHasStuckBall] = useState<boolean>(true);
  const [earnedStars, setEarnedStars] = useState<number>(3);

  // Auto-restart timer on Level Failed (depleted lives)
  const autoRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    engine.onStateChange = (newState) => {
      setGameState(newState);
      setCurrentLevel(engine.currentLevel);
      setHighestLevel(engine.highestUnlockedLevel);
      setScore(engine.score);
      setLives(engine.lives);

      if (newState === 'VICTORY') {
        const stars = engine.levelStars[engine.currentLevel] || 3;
        setEarnedStars(stars);
      }

      // Auto-restart after 2.2 seconds on Level Failed
      if (newState === 'GAME_OVER') {
        if (autoRestartTimeoutRef.current) clearTimeout(autoRestartTimeoutRef.current);
        autoRestartTimeoutRef.current = setTimeout(() => {
          if (engineRef.current && engineRef.current.state === 'GAME_OVER') {
            engineRef.current.restartCurrentLevel();
          }
        }, 2200);
      }
    };

    engine.start();

    const hudInterval = setInterval(() => {
      if (!engineRef.current) return;
      const eng = engineRef.current;
      setScore(eng.score);
      setLives(eng.lives);
      setHasStuckBall(eng.balls.some((b) => b.stuckOnPaddle));
      setHighestLevel(eng.highestUnlockedLevel);
    }, 60);

    return () => {
      if (autoRestartTimeoutRef.current) clearTimeout(autoRestartTimeoutRef.current);
      clearInterval(hudInterval);
      engine.stop();
    };
  }, []);

  const handleStartGame = useCallback(() => {
    if (!engineRef.current) return;
    sound.unlockAudio();
    // Automatically continue from player's saved level
    const targetLevel = engineRef.current.highestUnlockedLevel || 1;
    engineRef.current.initLevel(targetLevel);
    engineRef.current.setState('PLAYING');
  }, []);

  const handleNextLevel = useCallback(() => {
    if (!engineRef.current) return;
    sound.unlockAudio();
    const nextLvl = Math.min(CONFIG.TOTAL_LEVELS, engineRef.current.currentLevel + 1);
    engineRef.current.initLevel(nextLvl);
    engineRef.current.setState('PLAYING');
  }, []);

  const handleRestartLevel = useCallback(() => {
    if (autoRestartTimeoutRef.current) clearTimeout(autoRestartTimeoutRef.current);
    if (!engineRef.current) return;
    sound.unlockAudio();
    engineRef.current.restartCurrentLevel();
  }, []);

  const toggleMute = useCallback(() => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handleConfirmResetProgress = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.resetProgress();
    setConfirmReset(false);
    setShowSettings(false);
  }, []);

  return (
    <div className="flex items-center justify-center w-full h-full h-[100dvh] bg-[#020208] text-neutral-100 overflow-hidden font-sans select-none">
      {/* Viewport Frame: Edge-to-edge on mobile Android portrait (h-[100dvh]), constrained on desktop */}
      <div className="relative w-full h-full sm:max-w-[480px] sm:max-h-[853px] sm:aspect-[9/16] bg-[#0a0918] flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* HUD AT TOP - LEVEL NUMBER, LIVES (HEARTS), PAUSE, SETTINGS */}
        <header className="absolute top-0 left-0 right-0 z-20 h-11 px-3.5 flex items-center justify-between pointer-events-auto bg-[#0a0918]/90 border-b border-neutral-800/40">
          {/* Level Number */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-wider text-neutral-200">
              LEVEL <span className="text-white font-extrabold">{currentLevel}</span>
            </span>
          </div>

          {/* Right: 3 Lives Hearts, Pause, Settings */}
          <div className="flex items-center gap-2">
            {/* 3 Lives Heart Display */}
            <div className="flex items-center gap-1 mr-1">
              {[1, 2, 3].map((heartIndex) => (
                <Heart
                  key={heartIndex}
                  className={`w-3.5 h-3.5 transition-all duration-200 ${
                    heartIndex <= lives
                      ? 'fill-rose-500 text-rose-500 drop-shadow-[0_0_5px_rgba(244,63,94,0.8)] scale-100'
                      : 'fill-neutral-800 text-neutral-700 opacity-40 scale-90'
                  }`}
                />
              ))}
            </div>

            {/* Pause Button */}
            {gameState === 'PLAYING' && (
              <button
                onClick={() => engineRef.current?.setState('PAUSED')}
                className="p-1 text-neutral-300 hover:text-white active:scale-95 transition-all"
                title="Pause"
                aria-label="Pause"
              >
                <Pause className="w-4 h-4 fill-current" />
              </button>
            )}

            {/* Settings Gear */}
            <button
              onClick={() => {
                setShowSettings(true);
                setConfirmReset(false);
              }}
              className="p-1 text-neutral-400 hover:text-amber-400 active:scale-95 transition-all"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* TAP TO LAUNCH HINT */}
        {gameState === 'PLAYING' && hasStuckBall && (
          <div className="absolute bottom-28 left-0 right-0 z-20 flex justify-center pointer-events-none animate-bounce">
            <div className="px-3.5 py-1.5 bg-neutral-900/95 border border-amber-500/60 rounded-full text-[11px] font-bold text-amber-300 tracking-wider shadow-[0_0_12px_rgba(251,191,36,0.4)]">
              👆 TAP SCREEN TO LAUNCH BALL
            </div>
          </div>
        )}

        {/* MAIN GAME CANVAS */}
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain cursor-crosshair touch-none"
        />

        {/* TITLE SCREEN */}
        {gameState === 'TITLE' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-between p-6 bg-black/95 text-center">
            <div className="w-full flex justify-between items-center text-xs text-neutral-400 font-mono">
              <span>SAVED LEVEL: {highestLevel} / {CONFIG.TOTAL_LEVELS}</span>
              <span>SCORE: {score.toLocaleString()}</span>
            </div>

            <div className="flex flex-col items-center my-auto w-full max-w-xs">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-neutral-100 to-neutral-400 drop-shadow-[0_4px_16px_rgba(255,100,0,0.6)] mb-1">
                PIXEL BREAKER
              </h1>
              <p className="text-xs font-semibold text-neutral-400 mb-7">
                Developed by <span className="text-neutral-200 font-bold">Ahmad Shahzad</span>
              </p>

              <button
                onClick={handleStartGame}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-base text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-[0_0_20px_rgba(249,115,22,0.5)] active:scale-98 transition-all"
              >
                <Play className="w-5 h-5 fill-white" />
                {highestLevel > 1 ? `Continue Level ${highestLevel}` : 'Start Game'}
              </button>

              {/* Install on Android 1-tap button */}
              {isInstallable && !isInstalled && (
                <button
                  onClick={install}
                  className="w-full mt-3 py-2.5 px-4 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all"
                >
                  <Download className="w-4 h-4 text-emerald-400" /> Install on Android
                </button>
              )}
            </div>

            <p className="text-[11px] text-neutral-500">
              3 chances per level · Break all yellow bricks to advance to the next level
            </p>
          </div>
        )}

        {/* VICTORY MODAL */}
        {gameState === 'VICTORY' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/85 backdrop-blur-sm text-center">
            <div className="w-full max-w-[280px] bg-neutral-900/95 border border-neutral-700/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center">
              <h2 className="text-lg font-bold text-white mb-0.5">
                Congratulations
              </h2>
              <p className="text-sm font-semibold text-neutral-300 mb-4">
                You win!
              </p>

              {/* 1 to 3 Stars earned */}
              <div className="flex gap-2 text-2xl text-amber-400 mb-6">
                <span className={earnedStars >= 1 ? 'text-amber-400 animate-bounce' : 'text-neutral-700'}>★</span>
                <span className={earnedStars >= 2 ? 'text-amber-400 animate-bounce' : 'text-neutral-700'}>★</span>
                <span className={earnedStars >= 3 ? 'text-amber-400 animate-bounce' : 'text-neutral-700'}>★</span>
              </div>

              {/* Next Level Button */}
              <button
                onClick={handleNextLevel}
                className="w-full flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-[0_0_15px_rgba(249,115,22,0.5)] active:scale-98 transition-all"
              >
                Next Level <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleRestartLevel}
                className="mt-3 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Replay Level
              </button>
            </div>
          </div>
        )}

        {/* LEVEL FAILED (GAME OVER): 3 LIVES DEPLETED, FULL RESTORE OF LEVEL */}
        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-sm text-center">
            <div className="w-full max-w-[280px] bg-neutral-900/95 border border-rose-900/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center">
              <h2 className="text-xl font-black text-rose-500 mb-1">
                Level Failed
              </h2>
              <p className="text-xs text-neutral-400 mb-5">
                All 3 chances used! Restarting Level {currentLevel}...
              </p>

              <button
                onClick={handleRestartLevel}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 shadow-[0_0_15px_rgba(244,63,94,0.5)] active:scale-98 transition-all"
              >
                <RotateCcw className="w-4 h-4" /> Try Again
              </button>
            </div>
          </div>
        )}

        {/* GAME COMPLETE MODAL (BEAT LEVEL 500) */}
        {gameState === 'GAME_COMPLETE' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md text-center">
            <div className="w-full max-w-[300px] bg-neutral-900 border border-amber-500/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center">
              <Trophy className="w-12 h-12 text-amber-400 mb-2 animate-bounce" />
              <h2 className="text-2xl font-black text-white mb-1">
                YOU BEAT THE GAME!
              </h2>
              <p className="text-xs text-neutral-300 mb-4">
                All 500 levels completed! Outstanding achievement!
              </p>
              <div className="text-xs font-mono text-amber-300 font-bold mb-5">
                Final Score: {score.toLocaleString()}
              </div>
              <button
                onClick={() => {
                  engineRef.current?.initLevel(1);
                  engineRef.current?.setState('TITLE');
                }}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-orange-600 to-amber-600"
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* PAUSE MODAL */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <h2 className="text-2xl font-black text-white mb-6">PAUSED</h2>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button
                onClick={() => engineRef.current?.setState('PLAYING')}
                className="py-3 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 transition-all shadow-lg active:scale-98"
              >
                Resume
              </button>
              <button
                onClick={handleRestartLevel}
                className="py-2.5 px-4 rounded-xl font-semibold text-neutral-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition-colors active:scale-98"
              >
                Restart Level
              </button>
              <button
                onClick={() => {
                  setShowSettings(true);
                  setConfirmReset(false);
                }}
                className="py-2.5 px-4 rounded-xl text-xs font-medium text-neutral-400 hover:text-neutral-200 bg-neutral-900/60 border border-neutral-800/80 transition-colors"
              >
                Settings
              </button>
            </div>
            <div className="text-xs text-neutral-400 mt-5">
              Developed by <span className="text-neutral-300 font-semibold">Ahmad Shahzad</span>
            </div>
          </div>
        )}

        {/* CLEAN GAME SETTINGS PANEL */}
        {showSettings && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-[290px] bg-neutral-900 border border-neutral-700/80 rounded-2xl p-5 shadow-2xl text-neutral-100">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-amber-400" /> Game Settings
                </span>
                <button
                  onClick={() => {
                    setShowSettings(false);
                    setConfirmReset(false);
                  }}
                  className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors"
                  aria-label="Close Settings"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Install on Android (if not yet installed) */}
              {isInstallable && !isInstalled && (
                <button
                  onClick={install}
                  className="w-full mb-3 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Install App on Android
                </button>
              )}

              {/* Sound on/off switch */}
              <div className="flex items-center justify-between py-2.5 px-3 bg-neutral-950/70 rounded-xl border border-neutral-800 mb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
                  <span>Sound Effects</span>
                </div>
                <button
                  onClick={toggleMute}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    isMuted
                      ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                      : 'bg-amber-500 text-black font-bold shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                  }`}
                >
                  {isMuted ? 'OFF' : 'ON'}
                </button>
              </div>

              {/* Fullscreen Mode (Mobile Android Edge-to-Edge) */}
              <div className="flex items-center justify-between py-2.5 px-3 bg-neutral-950/70 rounded-xl border border-neutral-800 mb-4">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                  {isFullscreen ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4 text-neutral-400" />}
                  <span>Fullscreen</span>
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 rounded-lg border border-neutral-700 transition-colors"
                >
                  {isFullscreen ? 'Exit' : 'Enter'}
                </button>
              </div>

              {/* Reset Progress with "Are you sure?" confirmation */}
              <div className="pt-2 border-t border-neutral-800/80">
                {!confirmReset ? (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="w-full py-2.5 px-3 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 rounded-xl text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors active:scale-98"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Progress
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 p-3 bg-rose-950/40 border border-rose-700/60 rounded-xl text-center">
                    <p className="text-xs font-bold text-rose-300">Are you sure?</p>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      All your progress will be reset and you will restart at Level 1.
                    </p>
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmResetProgress}
                        className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-[0_0_10px_rgba(225,29,72,0.4)] transition-colors"
                      >
                        Yes, Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM WATERMARK ON INTERFACE */}
        <div className="absolute bottom-1 left-0 right-0 z-10 flex justify-center pointer-events-none select-none">
          <span className="text-[10px] font-mono tracking-wider text-neutral-500/80">
            Developed by <span className="text-neutral-400 font-semibold">Ahmad Shahzad</span>
          </span>
        </div>
      </div>
    </div>
  );
}
