import { describe, expect, it } from 'vitest';
import { COUNTDOWN, DURATION, Game } from '../src/game/engine';
import { FEVER_COMBO } from '../src/game/scoring';
import { SEGMENTS, neighbors, pickKind, segmentIndexAt } from '../src/game/spawner';
import type { GameEvent } from '../src/game/types';

/** 정해진 값을 차례로 돌려주는 난수. 다 쓰면 마지막 값을 반복 */
function seq(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function playingGame(rng = seq(0)) {
  const game = new Game(rng);
  const events: GameEvent[] = [];
  game.on((e) => events.push(e));
  game.start();
  game.tick(COUNTDOWN);
  return { game, events };
}

describe('구간', () => {
  it('진행 시간에 맞는 구간을 고른다', () => {
    expect(segmentIndexAt(0)).toBe(0);
    expect(segmentIndexAt(4_999)).toBe(0);
    expect(segmentIndexAt(5_000)).toBe(1);
    expect(segmentIndexAt(19_999)).toBe(2);
    expect(segmentIndexAt(25_000)).toBe(4);
    expect(SEGMENTS[4].id).toBe('spurt');
  });
});

describe('pickKind', () => {
  it('가중치 구간대로 고른다', () => {
    const w = { normal: 80, golden: 20 };
    expect(pickKind(w, () => 0)).toBe('normal');
    expect(pickKind(w, () => 0.79)).toBe('normal');
    expect(pickKind(w, () => 0.8)).toBe('golden');
  });

  it('제외한 종류는 고르지 않는다', () => {
    expect(pickKind({ clock: 50, normal: 50 }, () => 0, ['clock'])).toBe('normal');
  });
});

describe('neighbors', () => {
  it('3×3 격자의 모서리·가운데', () => {
    expect(neighbors(0, 3)).toEqual([1, 3, 4]);
    expect(neighbors(4, 3)).toHaveLength(8);
    expect(neighbors(8, 3)).toEqual([4, 5, 7]);
  });
});

describe('Game', () => {
  it('3·2·1·GO! 동안은 시간이 흐르지 않고 두더지도 나오지 않으며, GO! 뒤 30초 만에 끝난다', () => {
    const game = new Game(seq(0));
    const events: GameEvent[] = [];
    game.on((e) => events.push(e));
    game.start();
    expect(game.phase).toBe('countdown');
    for (let t = 0; t < COUNTDOWN - 100; t += 100) {
      game.tick(100);
      expect(game.moles).toHaveLength(0);
    }
    expect(game.phase).toBe('countdown');
    expect(game.time).toBe(0);
    game.tick(100);
    expect(game.phase).toBe('playing');
    expect(events.filter((e) => e.type === 'countdown').map((e) => (e as { n: number }).n)).toEqual([3, 2, 1, 0]);
    for (let t = 0; t < DURATION; t += 100) game.tick(100);
    expect(game.phase).toBe('over');
    expect(game.result).not.toBeNull();
  });

  it('워밍업에는 한 번에 한 마리만 나온다', () => {
    const { game } = playingGame();
    for (let t = 0; t < 4_000; t += 50) {
      game.tick(50);
      expect(game.moles.length).toBeLessThanOrEqual(1);
    }
  });

  it('헛치면 잠깐 경직되고 그동안의 타격은 무시된다', () => {
    const { game, events } = playingGame();
    game.place('normal', 0);
    game.hit(5);
    expect(events.at(-1)).toEqual({ type: 'whiff', hole: 5 });
    game.hit(0);
    expect(game.moles).toHaveLength(1);
    game.tick(300);
    game.hit(0);
    expect(game.score).toBe(10);
  });

  it('폭탄을 치면 감점되고 콤보가 끊긴다', () => {
    const { game } = playingGame();
    game.place('normal', 0);
    game.hit(0);
    game.place('normal', 1);
    game.hit(1);
    expect(game.combo).toBe(2);
    game.place('bomb', 2);
    game.hit(2);
    expect(game.combo).toBe(0);
    expect(game.score).toBe(0);
    expect(game.stats.bombs).toBe(1);
  });

  it('놓치면 콤보가 끊기고, 폭탄을 그냥 보내는 건 괜찮다', () => {
    const { game } = playingGame();
    game.place('normal', 0);
    game.hit(0);
    game.place('bomb', 4);
    game.tick(1_500);
    expect(game.combo).toBe(1);
    expect(game.stats.missed).toBe(0);
  });

  it('헬멧 두더지는 두 번 쳐야 쓰러진다', () => {
    const { game, events } = playingGame();
    game.place('helmet', 3);
    game.hit(3);
    expect(events.at(-1)?.type).toBe('damage');
    game.hit(3);
    expect(game.stats.kills.helmet).toBe(1);
    expect(game.score).toBe(25);
  });

  it('날쌘 두더지는 한 번 옆 구멍으로 옮겨 간다', () => {
    const { game, events } = playingGame();
    const mole = game.place('swift', 4)!;
    game.tick(mole.hideAt - game.time);
    const jump = events.find((e) => e.type === 'jump');
    expect(jump).toBeDefined();
    expect(mole.hole).not.toBe(4);
    expect(game.moles).toContain(mole);
  });

  it('시계 두더지는 남은 시간을 3초 늘린다', () => {
    const { game } = playingGame();
    const before = game.remaining;
    game.place('clock', 0);
    game.hit(0);
    expect(game.remaining).toBe(before + 3_000);
  });

  it('얼음 두더지는 다른 두더지가 숨는 시각을 늦춘다', () => {
    const { game } = playingGame();
    const other = game.place('normal', 1)!;
    const hideAt = other.hideAt;
    game.place('ice', 0);
    game.hit(0);
    expect(game.slowed).toBe(true);
    expect(other.hideAt).toBe(hideAt + 1_000);
  });

  it('15콤보에 피버가 시작되고 폭탄이 사라진다', () => {
    const { game, events } = playingGame();
    game.place('bomb', 8);
    for (let i = 0; i < FEVER_COMBO; i++) {
      game.place('normal', i % 8);
      game.hit(i % 8);
    }
    expect(events.some((e) => e.type === 'feverStart')).toBe(true);
    expect(game.inFever).toBe(true);
    expect(game.moles.some((m) => m.kind === 'bomb')).toBe(false);
  });

  it('남은 시간 5초에 왕 두더지가 한 번 나온다', () => {
    const { game, events } = playingGame(seq(0.99));
    let kings = 0;
    game.on((e) => {
      if (e.type === 'spawn' && e.mole.kind === 'king') kings++;
    });
    for (let t = 0; t < DURATION; t += 50) game.tick(50);
    expect(kings).toBe(1);
    expect(events.some((e) => e.type === 'segment' && e.id === 'spurt')).toBe(true);
  });

  it('같은 시드면 같은 판이 나온다', () => {
    const run = () => {
      const game = new Game(seq(0.1, 0.5, 0.9, 0.3, 0.7));
      const spawns: string[] = [];
      game.on((e) => e.type === 'spawn' && spawns.push(`${e.mole.kind}@${e.mole.hole}`));
      game.start();
      for (let t = 0; t < 10_000; t += 50) game.tick(50);
      return spawns;
    };
    expect(run()).toEqual(run());
  });
});
