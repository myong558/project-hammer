import { pickMission, type MissionDef } from './missions';
import { MOLES, MOLE_ORDER } from './moles';
import {
  FEVER_DURATION,
  LAST_SPURT,
  MISSION_BONUS,
  accuracyOf,
  comboMultiplier,
  gradeFor,
  pointsFor,
  shouldStartFever,
  starsFor,
} from './scoring';
import { FEVER_SEGMENT, SEGMENTS, neighbors, pickKind, pickOne, segmentIndexAt, type Segment } from './spawner';
import type { GameEvent, GameResult, Mole, MoleKind, Phase, Rng, Stats } from './types';

export const DURATION = 30_000;
/** 3 · 2 · 1을 1초씩, 마지막에 GO!를 0.5초 보여 준 뒤 시작한다 */
export const GO_TIME = 500;
export const COUNTDOWN = 3_000 + GO_TIME;
export const GRID = 3;
export const HOLES = GRID * GRID;

const WHIFF_STUN = 300;
const HOLE_COOLDOWN = 300;
const TIME_BONUS = 3_000;
const MAX_CLOCKS = 2;
/** 황금 두더지가 이만큼 연달아 안 나오면 다음은 반드시 황금 */
export const GOLDEN_PITY = 7;
const SLOW_DURATION = 2_000;
const SLOW_FACTOR = 1.6;
const FREEZE_EXTEND = 1_000;

type Listener = (event: GameEvent) => void;

/** 카운트다운 표시 숫자. 0은 GO! */
function countdownStep(left: number): number {
  return Math.max(0, Math.ceil((left - GO_TIME) / 1000));
}

export function emptyStats(): Stats {
  const kills = Object.fromEntries(MOLE_ORDER.map((k) => [k, 0])) as Record<MoleKind, number>;
  return { taps: 0, hits: 0, whiffs: 0, bombs: 0, missed: 0, kills, maxCombo: 0, timeBonus: 0 };
}

/**
 * 한 판의 상태 머신. DOM을 모르고, 시간은 tick(dt)으로만 흐른다.
 * ready → countdown → playing ⇄ paused → over
 */
export class Game {
  phase: Phase = 'ready';
  /** playing 상태로 흐른 게임 시간(ms) */
  time = 0;
  remaining = DURATION;
  countdownLeft = COUNTDOWN;
  score = 0;
  combo = 0;
  moles: Mole[] = [];
  feverUntil = 0;
  slowUntil = 0;
  stunUntil = 0;
  segmentIndex = -1;
  result: GameResult | null = null;
  readonly stats = emptyStats();
  readonly mission: MissionDef;

  private readonly rng: Rng;
  private readonly listeners = new Set<Listener>();
  private readonly holeFreeAt = new Array<number>(HOLES).fill(0);
  private nextSpawnAt = 0;
  private nextId = 1;
  private clocks = 0;
  private kingSpawned = false;
  private sinceGolden = 0;
  private bannerIndex = -1;

  constructor(rng: Rng) {
    this.rng = rng;
    this.mission = pickMission(rng);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get inFever(): boolean {
    return this.feverUntil > this.time;
  }

  get slowed(): boolean {
    return this.slowUntil > this.time;
  }

  get stunned(): boolean {
    return this.stunUntil > this.time;
  }

  get lastSpurt(): boolean {
    return this.remaining <= LAST_SPURT;
  }

  /** 진행 시간. 시계 두더지로 시간이 늘면 뒤로 물러난다 */
  get progress(): number {
    return Math.max(0, DURATION - this.remaining);
  }

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'countdown';
    this.emit({ type: 'countdown', n: countdownStep(COUNTDOWN) });
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.emit({ type: 'pause' });
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.emit({ type: 'resume' });
  }

  tick(dt: number): void {
    if (this.phase === 'countdown') {
      const before = countdownStep(this.countdownLeft);
      this.countdownLeft -= dt;
      const after = countdownStep(this.countdownLeft);
      if (this.countdownLeft <= 0) {
        this.phase = 'playing';
        this.emit({ type: 'start' });
      } else if (after !== before) {
        this.emit({ type: 'countdown', n: after });
      }
      return;
    }
    if (this.phase !== 'playing') return;

    this.time += dt;
    this.remaining -= dt;

    if (this.feverUntil && this.time >= this.feverUntil) {
      this.feverUntil = 0;
      this.emit({ type: 'feverEnd' });
    }

    this.segmentIndex = segmentIndexAt(this.progress);
    if (this.segmentIndex > this.bannerIndex) {
      this.bannerIndex = this.segmentIndex;
      this.emit({ type: 'segment', index: this.segmentIndex, id: SEGMENTS[this.segmentIndex].id });
    }

    for (const mole of [...this.moles]) {
      if (this.time >= mole.hideAt) this.expire(mole);
    }

    if (this.remaining <= 0) {
      this.remaining = 0;
      this.finish();
      return;
    }

    this.spawnTick();
  }

  hit(hole: number): void {
    if (this.phase !== 'playing' || this.stunned) return;
    this.stats.taps++;

    const mole = this.moles.find((m) => m.hole === hole);
    if (!mole) {
      this.stats.whiffs++;
      this.stunUntil = this.time + WHIFF_STUN;
      this.emit({ type: 'whiff', hole });
      return;
    }

    const def = MOLES[mole.kind];
    if (!def.good) {
      this.remove(mole);
      this.stats.bombs++;
      this.score = Math.max(0, this.score + def.points);
      this.emit({ type: 'bomb', mole, points: def.points });
      this.breakCombo();
      return;
    }

    this.stats.hits++;
    mole.hp--;
    if (mole.hp > 0) {
      this.emit({ type: 'damage', mole });
      return;
    }

    this.remove(mole);
    this.combo++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    this.stats.kills[mole.kind]++;
    const points = pointsFor(def.points, this.combo, { fever: this.inFever, lastSpurt: this.lastSpurt });
    this.score += points;
    this.emit({ type: 'hit', mole, points, combo: this.combo });

    if (comboMultiplier(this.combo) > comboMultiplier(this.combo - 1)) {
      this.emit({ type: 'comboUp', multiplier: comboMultiplier(this.combo) });
    }
    this.applyEffect(mole);
    if (shouldStartFever(this.combo, this.inFever)) this.startFever();
  }

  /** 지정한 구멍에 두더지를 바로 내보낸다. 테스트·디버그용 */
  place(kind: MoleKind, hole: number): Mole | null {
    return this.spawn(kind, hole);
  }

  private segment(): Segment {
    return this.inFever ? FEVER_SEGMENT : SEGMENTS[Math.max(0, this.segmentIndex)];
  }

  private freeHoles(): number[] {
    const result: number[] = [];
    for (let h = 0; h < HOLES; h++) {
      if (this.holeFreeAt[h] <= this.time && !this.moles.some((m) => m.hole === h)) result.push(h);
    }
    return result;
  }

  private exposureFor(kind: MoleKind): number {
    const def = MOLES[kind];
    const base = def.fixedExposure ?? this.segment().exposure * def.exposure;
    return base * (this.slowed ? SLOW_FACTOR : 1);
  }

  private spawnTick(): void {
    if (!this.kingSpawned && this.lastSpurt && this.spawn('king')) this.kingSpawned = true;

    if (this.time < this.nextSpawnAt) return;
    const seg = this.segment();
    this.nextSpawnAt = this.time + seg.interval * (this.slowed ? SLOW_FACTOR : 1);

    const active = this.moles.filter((m) => m.kind !== 'king').length;
    if (active >= seg.maxActive) return;
    const exclude: MoleKind[] = this.clocks >= MAX_CLOCKS ? ['clock'] : [];
    let kind = pickKind(seg.weights, this.rng, exclude);
    if (kind !== 'golden' && (seg.weights.golden ?? 0) > 0 && this.sinceGolden >= GOLDEN_PITY) kind = 'golden';
    if (this.spawn(kind)) this.sinceGolden = kind === 'golden' ? 0 : this.sinceGolden + 1;
  }

  private spawn(kind: MoleKind, hole?: number): Mole | null {
    const target = hole ?? pickOne(this.freeHoles(), this.rng);
    if (target === undefined || this.moles.some((m) => m.hole === target)) return null;
    const mole: Mole = {
      id: this.nextId++,
      kind,
      hole: target,
      hp: MOLES[kind].hp,
      hideAt: this.time + this.exposureFor(kind),
      jumped: false,
    };
    if (kind === 'clock') this.clocks++;
    this.moles.push(mole);
    this.emit({ type: 'spawn', mole });
    return mole;
  }

  private expire(mole: Mole): void {
    if (mole.kind === 'swift' && !mole.jumped) {
      const free = this.freeHoles();
      const near = neighbors(mole.hole, GRID).filter((h) => free.includes(h));
      const target = pickOne(near.length ? near : free, this.rng);
      if (target !== undefined) {
        const from = mole.hole;
        this.holeFreeAt[from] = this.time + HOLE_COOLDOWN;
        mole.hole = target;
        mole.jumped = true;
        mole.hideAt = this.time + this.exposureFor('swift');
        this.emit({ type: 'jump', mole, from });
        return;
      }
    }

    this.remove(mole);
    this.emit({ type: 'escape', mole });
    if (MOLES[mole.kind].good) {
      this.stats.missed++;
      this.breakCombo();
    }
  }

  private remove(mole: Mole): void {
    this.moles = this.moles.filter((m) => m !== mole);
    this.holeFreeAt[mole.hole] = this.time + HOLE_COOLDOWN;
  }

  private breakCombo(): void {
    if (this.combo === 0) return;
    const combo = this.combo;
    this.combo = 0;
    this.emit({ type: 'comboBreak', combo });
  }

  private applyEffect(mole: Mole): void {
    if (mole.kind === 'clock') {
      this.remaining += TIME_BONUS;
      this.stats.timeBonus += TIME_BONUS;
      this.emit({ type: 'timeBonus', ms: TIME_BONUS });
    } else if (mole.kind === 'ice') {
      this.slowUntil = this.time + SLOW_DURATION;
      for (const m of this.moles) m.hideAt += FREEZE_EXTEND;
      this.emit({ type: 'freeze' });
    }
  }

  private startFever(): void {
    this.feverUntil = this.time + FEVER_DURATION;
    this.nextSpawnAt = this.time;
    for (const bomb of this.moles.filter((m) => !MOLES[m.kind].good)) {
      this.remove(bomb);
      this.emit({ type: 'escape', mole: bomb });
    }
    this.emit({ type: 'feverStart' });
  }

  private finish(): void {
    this.phase = 'over';
    this.moles = [];
    const missionDone = this.mission.done(this.stats);
    const missionBonus = missionDone ? MISSION_BONUS : 0;
    const score = this.score + missionBonus;
    this.result = {
      baseScore: this.score,
      missionBonus,
      score,
      missionDone,
      grade: gradeFor(score),
      stars: starsFor(score, missionDone, this.stats),
      accuracy: accuracyOf(this.stats),
      stats: structuredClone(this.stats),
    };
    this.emit({ type: 'over', result: this.result });
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
