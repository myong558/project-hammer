import type { MoleKind, Rng } from './types';

export type SegmentId = 'warmup' | 'main' | 'melee' | 'rush' | 'spurt' | 'fever';

export interface Segment {
  id: SegmentId;
  /** 이 진행 시간(ms) 전까지 적용 */
  until: number;
  interval: number;
  exposure: number;
  maxActive: number;
  weights: Partial<Record<MoleKind, number>>;
}

export const SEGMENTS: Segment[] = [
  { id: 'warmup', until: 5_000, interval: 900, exposure: 1_100, maxActive: 1, weights: { normal: 85, golden: 15 } },
  { id: 'main', until: 10_000, interval: 800, exposure: 1_000, maxActive: 2, weights: { normal: 70, golden: 10, bomb: 20 } },
  {
    id: 'melee',
    until: 20_000,
    interval: 650,
    exposure: 850,
    maxActive: 2,
    weights: { normal: 45, golden: 8, bomb: 17, helmet: 12, swift: 10, clock: 4, ice: 4 },
  },
  {
    id: 'rush',
    until: 25_000,
    interval: 500,
    exposure: 650,
    maxActive: 3,
    weights: { normal: 38, golden: 8, bomb: 27, helmet: 10, swift: 10, clock: 3, ice: 4 },
  },
  {
    id: 'spurt',
    until: Infinity,
    interval: 450,
    exposure: 600,
    maxActive: 3,
    weights: { normal: 45, golden: 10, bomb: 25, helmet: 10, swift: 10 },
  },
];

/** 피버 동안은 폭탄 없이 보통·황금 두더지가 쏟아진다 */
export const FEVER_SEGMENT: Segment = {
  id: 'fever',
  until: Infinity,
  interval: 220,
  exposure: 900,
  maxActive: 4,
  weights: { normal: 85, golden: 15 },
};

export function segmentIndexAt(progress: number): number {
  return SEGMENTS.findIndex((s) => progress < s.until);
}

export function pickKind(weights: Partial<Record<MoleKind, number>>, rng: Rng, exclude: readonly MoleKind[] = []): MoleKind {
  const entries = (Object.entries(weights) as [MoleKind, number][]).filter(([k, w]) => w > 0 && !exclude.includes(k));
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [kind, w] of entries) {
    r -= w;
    if (r < 0) return kind;
  }
  return entries[entries.length - 1]?.[0] ?? 'normal';
}

export function pickOne<T>(items: readonly T[], rng: Rng): T | undefined {
  return items.length === 0 ? undefined : items[Math.floor(rng() * items.length)];
}

/** size×size 격자에서 가로·세로·대각선으로 붙은 구멍 */
export function neighbors(hole: number, size: number): number[] {
  const row = Math.floor(hole / size);
  const col = hole % size;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if ((dr || dc) && r >= 0 && r < size && c >= 0 && c < size) result.push(r * size + c);
    }
  }
  return result;
}
