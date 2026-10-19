import { HOLES } from '../game/engine';
import { MOLES } from '../game/moles';
import type { Mole, MoleKind } from '../game/types';
import { moleName, t } from '../i18n';
import { ACCESSORY_ART, DIZZY, holeArt } from './icons';

/** 판 위 두더지 중 나와 있는 동안 두리번거리는 몫 */
const LOOKY_CHANCE = 0.4;

/** 구멍 하나의 그림: 뒤(둔덕·구멍 속) · 두더지 자리 · 앞 테두리 */
export function holeInner(seed = 0): string {
  const { back, front } = holeArt(seed);
  return `${back}<span class="slot"></span>${front}`;
}

/** 두더지 한 마리의 DOM. 시작 화면 장식에도 쓴다 */
export function createMoleEl(kind: MoleKind): HTMLElement {
  const el = document.createElement('div');
  el.className = `mole kind-${kind}`;
  el.innerHTML = `
    <div class="body">
      <span class="ear l"></span><span class="ear r"></span>
      <span class="brow l"></span><span class="brow r"></span>
      <span class="eye l"></span><span class="eye r"></span>
      <span class="cheek l"></span><span class="cheek r"></span>
      <span class="mouth"></span><span class="tongue"></span><span class="teeth"></span><span class="nose"></span>
    </div>
    ${ACCESSORY_ART[kind] ? `<span class="acc">${ACCESSORY_ART[kind]}</span>` : ''}
    <span class="stars">${DIZZY}</span>`;
  return el;
}

/** 엔진 이벤트를 받아 구멍과 두더지를 그린다 */
export class Board {
  readonly holes: HTMLButtonElement[] = [];
  private readonly moleEls = new Map<number, HTMLElement>();

  constructor(
    readonly el: HTMLElement,
    onHit: (hole: number, event: PointerEvent) => void,
  ) {
    for (let i = 0; i < HOLES; i++) {
      const hole = document.createElement('button');
      hole.type = 'button';
      hole.className = 'hole';
      hole.innerHTML = holeInner(i + 1);
      hole.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onHit(i, e);
      });
      this.holes.push(hole);
      this.label(i, null);
      el.append(hole);
    }
  }

  spawn(mole: Mole): void {
    const el = createMoleEl(mole.kind);
    // 열에 넷 정도만 나와 있는 동안 좌우로 두리번거린다. 두더지마다 다른 순간에서 시작하게
    if (Math.random() < LOOKY_CHANCE) el.classList.add('looky');
    el.style.setProperty('--look-delay', `${(-Math.random() * 1.6).toFixed(2)}s`);
    this.moleEls.set(mole.id, el);
    this.slot(mole.hole).append(el);
    // 엿보는 두더지는 머리만 그늘 속에 살짝 내민다. 아직 칠 수 없으니 구멍 이름표도 비워 둔다
    const peek = mole.peekUntil > 0;
    if (!peek) this.label(mole.hole, mole.kind);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add(peek ? 'peek' : 'up')));
  }

  /** 엿보던 두더지가 쑥 올라온다 */
  emerge(mole: Mole): void {
    const el = this.moleEls.get(mole.id);
    if (!el) return;
    el.classList.remove('peek');
    el.classList.add('up');
    this.label(mole.hole, mole.kind);
  }

  /** 엿보던 두더지가 나오지 않고 도로 쏙 들어간다 */
  duck(mole: Mole): void {
    const el = this.take(mole);
    if (!el) return;
    el.classList.remove('peek');
    setTimeout(() => el.remove(), 200);
  }

  jump(mole: Mole, from: number): void {
    this.moleEls.get(mole.id)?.remove();
    this.label(from, null);
    this.spawn(mole);
  }

  escape(mole: Mole): void {
    const el = this.take(mole);
    if (!el) return;
    if (MOLES[mole.kind].good) {
      el.classList.add('tease');
      setTimeout(() => this.sink(el), 260);
    } else {
      this.sink(el);
    }
  }

  damage(mole: Mole): void {
    const el = this.moleEls.get(mole.id);
    if (!el) return;
    if (mole.kind === 'helmet') el.classList.add('helmet-off');
    el.classList.remove('ouch');
    void el.offsetWidth;
    el.classList.add('ouch');
    el.dataset.hp = String(mole.hp);
  }

  hit(mole: Mole): void {
    const el = this.take(mole);
    if (!el) return;
    el.classList.add('whacked');
    setTimeout(() => this.sink(el), 240);
  }

  bomb(mole: Mole): void {
    const el = this.take(mole);
    if (!el) return;
    el.classList.add('boom');
    setTimeout(() => el.remove(), 320);
  }

  whiff(hole: number): void {
    const el = this.holes[hole];
    el.classList.remove('dust');
    void el.offsetWidth;
    el.classList.add('dust');
  }

  press(hole: number): void {
    const el = this.holes[hole];
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 90);
  }

  private take(mole: Mole): HTMLElement | undefined {
    const el = this.moleEls.get(mole.id);
    this.moleEls.delete(mole.id);
    this.label(mole.hole, null);
    return el;
  }

  private sink(el: HTMLElement): void {
    el.classList.remove('up');
    setTimeout(() => el.remove(), 200);
  }

  private slot(hole: number): HTMLElement {
    return this.holes[hole].querySelector('.slot')!;
  }

  private label(hole: number, kind: MoleKind | null): void {
    this.holes[hole].setAttribute('aria-label', `${t('hole', { n: hole + 1 })}${kind ? `: ${moleName(kind)}` : ''}`);
  }
}
