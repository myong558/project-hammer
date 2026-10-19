import type { SegmentId } from './spawner';

export type MoleKind = 'normal' | 'golden' | 'helmet' | 'swift' | 'bomb' | 'clock' | 'ice' | 'king';

export type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';

/** 0 이상 1 미만의 난수를 돌려주는 함수 */
export type Rng = () => number;

export interface Mole {
  id: number;
  kind: MoleKind;
  hole: number;
  /** 남은 타격 수 */
  hp: number;
  /** 이 시각(게임 시간 ms)이 되면 숨는다 */
  hideAt: number;
  /** 날쌘 두더지가 이미 한 번 옮겨 갔는지 */
  jumped: boolean;
}

export interface Stats {
  /** 구멍을 친 횟수(헛치기·폭탄 포함) */
  taps: number;
  /** 쳐야 할 두더지를 맞힌 횟수(헬멧·왕의 중간 타격 포함) */
  hits: number;
  whiffs: number;
  bombs: number;
  /** 쳐야 할 두더지를 놓친 수 */
  missed: number;
  kills: Record<MoleKind, number>;
  maxCombo: number;
  timeBonus: number;
}

export type Grade = 'S' | 'A' | 'B' | 'C';

export interface GameResult {
  baseScore: number;
  missionBonus: number;
  score: number;
  missionDone: boolean;
  grade: Grade;
  /** 점수 · 미션 · 노미스 */
  stars: [boolean, boolean, boolean];
  accuracy: number;
  stats: Stats;
}

export type GameEvent =
  | { type: 'countdown'; n: number }
  | { type: 'start' }
  | { type: 'segment'; index: number; id: SegmentId }
  | { type: 'spawn'; mole: Mole }
  | { type: 'jump'; mole: Mole; from: number }
  | { type: 'escape'; mole: Mole }
  | { type: 'damage'; mole: Mole }
  | { type: 'hit'; mole: Mole; points: number; combo: number }
  | { type: 'bomb'; mole: Mole; points: number }
  | { type: 'whiff'; hole: number }
  | { type: 'comboUp'; multiplier: number }
  | { type: 'comboBreak'; combo: number }
  | { type: 'feverStart' }
  | { type: 'feverEnd' }
  | { type: 'timeBonus'; ms: number }
  | { type: 'freeze' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'over'; result: GameResult };
