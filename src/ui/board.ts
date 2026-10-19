import { HOLES } from '../game/engine';
import { MOLES } from '../game/moles';
import type { Mole, MoleKind } from '../game/types';
import { moleName, t } from '../i18n';

const ACCESSORY: Partial<Record<MoleKind, string>> = {
  golden: '✨',
  helmet: '⛑️',
  swift: '💨',
  bomb: '💣',
  clock: '⏰',
  ice: '🧊',
  king: '👑',
};

/** 두더지 한 마리의 DOM. 시작 화면 장식에도 쓴다 */
export function createMoleEl(kind: MoleKind): HTMLElement {
  const el = document.createElement('div');
  el.className = `mole kind-${kind}`;
  el.innerHTML = `
    <div class="body">
      <span class="ear l"></span><span class="ear r"></span>
      <span class="eye l"></span><span class="eye r"></span>
      <span class="cheek l"></span><span class="cheek r"></span>
      <span class="nose"></span><span class="teeth"></span><span class="tongue"></span>
    </div>
    ${ACCESSORY[kind] ? `<span class="acc">${ACCESSORY[kind]}</span>` : ''}
    <span class="stars">💫</span>`;
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
      hole.innerHTML = '<span class="pit"></span><span class="slot"></span><span class="rim"></span>';
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
    this.moleEls.set(mole.id, el);
    this.slot(mole.hole).append(el);
    this.label(mole.hole, mole.kind);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('up')));
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
