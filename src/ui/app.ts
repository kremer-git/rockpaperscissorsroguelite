// Shared app shape for screens. Screens call actions; actions call the engine.
import type { GameState, Move } from '../core/types';
import type { RoundResult } from '../core/engine';
import type { Prefs } from './prefs';
import type { Progress } from './awards';

export type Screen = 'title' | 'howto' | 'run' | 'store' | 'over';

export interface App {
  screen: Screen;
  state: GameState | null;
  last: RoundResult | null;
  allIn: boolean;
  debugOpen: boolean;
  debugEnabled: boolean;
  toast: string | null;
  howtoStep: number;
  hasSave: boolean;
  prefs: Prefs;
  soundOpen: boolean;
  progress: Progress;
  /** True while the ~200 ms throw pump plays: further throws are ignored. */
  busy: boolean;
  actions: {
    start(seed?: number, mode?: 'normal' | 'hard'): void;
    resume(): void;
    throwMove(m: Move): void;
    toggleAllIn(): void;
    buy(slot: number): void;
    buyLife(): void;
    rerollStore(): void;
    rerollOpponent(): void;
    leaveStore(): void;
    goStore(): void;
    exitToTitle(): void;
    goOver(): void;
    go(screen: Screen): void;
    setHowto(step: number): void;
    toggleDebug(): void;
    render(): void;
    notify(msg: string): void;
    /** Change preferences, save them and re-render. */
    setPrefs(fn: (p: Prefs) => void): void;
    /** Save preferences without re-rendering (for bookkeeping during effects). */
    setPrefsSilently(): void;
  };
}
