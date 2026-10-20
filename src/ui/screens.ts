import { MOLES, MOLE_ORDER } from '../game/moles';
import type { Goal } from '../game/scoring';
import { SEGMENTS } from '../game/spawner';
import type { GameResult, MoleKind } from '../game/types';
import type { MissionId } from '../game/missions';
import { LANGS, getLang, moleDesc, moleName, t, type Lang, type MessageKey } from '../i18n';
import type { SaveData } from '../storage';
import { SKIN_SETTINGS, THEMES, type Skin, type SkinSetting, type Theme } from '../theme';
import { createMoleEl, holeInner } from './board';
import { captureResult, shareLink, type ShareOutcome } from '../share';
import { confetti, countUp } from './effects';
import { DECO_ART, HAMMER, ICONS, MORE_ICONS, SKIN_ICONS, STAR_OFF, STAR_ON, THEME_ICONS } from './icons';

export type Mode = 'classic' | 'daily';

const LANG_LABEL: Record<Lang, string> = { ko: '한국어', en: 'English' };

function html(markup: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

function holeMarkup(cls: string): string {
  return `<div class="${cls}" aria-hidden="true">${holeInner()}</div>`;
}

function closeButton(): string {
  return `<button class="modal-x icon-btn" data-close aria-label="${t('common.close')}">${MORE_ICONS.close}</button>`;
}

/** 작은 두더지 초상. 도감 칸·결과 화면에 쓴다 */
function thumbMarkup(kind: MoleKind, cls = 'thumb'): string {
  return `<span class="${cls}" data-thumb="${kind}" aria-hidden="true"><span class="slot"></span></span>`;
}

function fillThumbs(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-thumb]').forEach((t) => {
    const mole = createMoleEl(t.dataset.thumb as MoleKind);
    mole.classList.add('up');
    t.querySelector('.slot')!.append(mole);
  });
}

function pressed(on: boolean): string {
  return `aria-pressed="${on}"`;
}

/**
 * 화면 안에 띄우는 대화상자. Esc·바깥 누르기·닫기 버튼으로 닫힌다.
 * reopen은 화면을 다시 그린 뒤 같은 창을 되살리는 경우라 등장 연출 없이 그대로 보이고, 그 선택자에 초점을 둔다
 */
function openModal(host: HTMLElement, content: HTMLElement, label: string, reopen?: string): () => void {
  const backdrop = html(`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"></div></div>`);
  if (reopen) backdrop.classList.add('instant');
  const modal = backdrop.querySelector('.modal')!;
  modal.setAttribute('aria-label', label);
  modal.append(content);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKey = (e: KeyboardEvent) => {
    // 화면을 다시 그려 대화상자가 사라졌으면 리스너만 정리한다
    if (!backdrop.isConnected) return document.removeEventListener('keydown', onKey, true);
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  // 게임 판은 큰 화면에서 가운데 상자로 멈추므로, 딤은 판 밖까지 덮도록 body에 붙인다.
  // 글자 크기만 판(화면)의 크기를 그대로 따른다
  const fit = () => {
    if (!host.isConnected) return close();
    backdrop.style.fontSize = getComputedStyle(host).fontSize;
  };
  // 화면을 다시 그려 판이 바뀌면 대화상자도 함께 사라진다
  const watch = new MutationObserver(() => host.isConnected || close());
  if (host.parentNode) watch.observe(host.parentNode, { childList: true });
  const close = () => {
    backdrop.remove();
    watch.disconnect();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', fit);
    if (opener?.isConnected) opener.focus();
  };
  // 딤을 눌러 닫을 때는 누름과 뗌이 모두 딤 위여야 한다. pointerdown에서 바로 닫으면 딤이 사라진 뒤
  // 이어지는 click이 아래 화면(도감 칸 등)에 떨어져 다른 창이 곧바로 열린다
  let downOnBackdrop = false;
  backdrop.addEventListener('pointerdown', (e) => (downOnBackdrop = e.target === backdrop));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop && downOnBackdrop) close();
    downOnBackdrop = false;
  });
  // 내용이 바뀌어도(도감 넘기기) 닫기 버튼이 동작하도록 위임한다
  content.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', fit);
  fit();
  document.body.append(backdrop);
  (content.querySelector<HTMLElement>(reopen || '[aria-pressed="true"]') ?? content.querySelector('button'))?.focus();
  return close;
}

/* ---------- 시작 화면 ---------- */

export interface StartOptions {
  save: SaveData;
  today: string;
  todayLabel: string;
  todaySkin: Skin;
  onPlay: (mode: Mode) => void;
  onToggle: (key: Toggle) => void;
  onLang: (lang: Lang) => void;
  onTheme: (theme: Theme) => void;
  onSkin: (skin: SkinSetting) => void;
  onReset: () => void;
  /** 다시 그린 뒤 설정 창을 열어 둘지. 'reset'이면 초기화 완료 문구도 보인다 */
  settings?: 'open' | 'reset';
  /** 페이지에 처음 들어왔을 때만 오프닝 연출을 튼다 */
  opening?: boolean;
  /** 다시 연 설정 창에서 초점을 둘 버튼 */
  settingsFocus?: string;
}

export function startScreen(opts: StartOptions): HTMLElement {
  const { save } = opts;
  const dex = new Set(save.dex);
  const dailyBest = save.daily?.date === opts.today ? save.daily.best : 0;
  const lang = getLang();
  const otherLang = LANGS.find((l) => l !== lang)!;
  const el = html(`
    <main class="screen start">
      <button class="corner left lang-btn" data-lang="${otherLang}" aria-label="${t('lang.label')}: ${LANG_LABEL[lang]} → ${LANG_LABEL[otherLang]}">
        ${ICONS.globe}<span>${LANG_LABEL[otherLang]}</span>
      </button>
      <button class="corner right icon-btn settings-btn" aria-label="${t('settings.open')}">${ICONS.gear}</button>
      <div class="col main-col">
        ${holeMarkup('title-hole')}
        <h1 aria-label="${t('app.title')}"><span class="title-text" aria-hidden="true">${titleLetters(t('app.title'))}</span> <span class="title-hammer">${HAMMER}</span></h1>
        <p class="tagline">${t('app.tagline')}</p>
        <div class="modes">
          <button class="btn primary" data-mode="classic">${t('start.classic')}</button>
          <button class="btn daily" data-mode="daily">
            <span class="cal" aria-hidden="true"><i></i><b>${Number(opts.today.slice(-2))}</b></span>
            <span class="daily-text">${t('start.daily')} <small>${t('start.dailySub', { date: opts.todayLabel })}</small></span>
            <span class="go">${ICONS.arrow}</span>
          </button>
        </div>
        <p class="best">${t('start.best', { best: save.best, daily: dailyBest })}</p>
      </div>
      <div class="col side-col">
        <section class="dex" aria-label="${t('dex.title')}">
          <h2>${t('dex.title')} <small>${dex.size}/${MOLE_ORDER.length}</small></h2>
          <ul>${MOLE_ORDER.map((k, i) => `<li style="--i:${i}">${dexItem(k, dex.has(k))}</li>`).join('')}</ul>
        </section>
        <p class="hint">${t('start.hint')}</p>
      </div>
    </main>`);

  if (opts.opening) {
    el.classList.add('opening');
    // 누르면 바로 건너뛴다. 저절로 끝날 때는 클래스를 그대로 둬야 이어지는 망치·두더지 연출이 처음부터 다시 돌지 않는다
    el.addEventListener('pointerdown', () => el.classList.remove('opening'), { once: true });
  }

  const titleMole = createMoleEl('normal');
  el.querySelector('.title-hole .slot')!.append(titleMole);
  titleMole.classList.add('bob');
  fillThumbs(el);

  el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => opts.onPlay(b.dataset.mode as Mode)),
  );
  el.querySelector('.lang-btn')!.addEventListener('click', () => opts.onLang(otherLang));
  el.querySelectorAll<HTMLButtonElement>('.dex [data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      const found = MOLE_ORDER.filter((k) => dex.has(k));
      openDexBrowser(el, found, found.indexOf(b.dataset.kind as MoleKind), save);
    }),
  );

  const showSettings = (reopen?: string) => openModal(el, settingsPanel(opts), t('settings.title'), reopen);
  el.querySelector('.settings-btn')!.addEventListener('click', () => showSettings());
  if (opts.settings) queueMicrotask(() => showSettings(opts.settingsFocus ?? (opts.settings === 'reset' ? '[data-reset]' : '[aria-pressed="true"]')));
  return el;
}

/** 제목을 한 글자씩 떨어뜨리려고 글자마다 감싼다 */
function titleLetters(title: string): string {
  return [...title].map((c, i) => (c === ' ' ? ' ' : `<span class="ch" style="--i:${i}">${c}</span>`)).join('');
}

function dexItem(kind: MoleKind, found: boolean): string {
  if (!found) {
    return `<div class="dex-item locked" role="img" aria-label="??? — ${t('dex.locked')}" title="${t('dex.locked')}">${thumbMarkup(kind)}</div>`;
  }
  const def = MOLES[kind];
  const pts = def.points > 0 ? `+${def.points}` : `${def.points}`;
  return `<button class="dex-item${def.good ? '' : ' danger'}" data-kind="${kind}" aria-label="${moleName(kind)} ${pts}" title="${moleName(kind)} · ${t('dex.tapHint')}">
    ${thumbMarkup(kind)}</button>`;
}

function appearLabel(kind: MoleKind): string {
  if (kind === 'king') return t('dex.final');
  const index = SEGMENTS.findIndex((s) => (s.weights[kind] ?? 0) > 0);
  const from = index <= 0 ? 0 : SEGMENTS[index - 1].until;
  return from === 0 ? t('dex.fromStart') : t('dex.fromSec', { s: from / 1000 });
}

/**
 * 도감 설명 창. 좌우 버튼·스와이프·←→ 키로 만난 두더지를 차례로 넘기고, 끝에서는 처음으로 돌아간다
 */
function openDexBrowser(host: HTMLElement, kinds: MoleKind[], start: number, save: SaveData): void {
  const box = html(`<div class="dex-browser"></div>`);
  let index = Math.max(0, start);
  let modal: HTMLElement | null = null;

  // 만난 두더지 설명을 모두 한 칸에 겹쳐 두고 지금 것만 보인다. 창 높이가 늘 가장 긴 설명에 맞춰져
  // 넘기기 버튼이 두더지마다 위아래로 움직이지 않는다(글꼴이 늦게 불러와지거나 창 크기가 바뀌어도 그대로)
  const details = kinds.map((kind) => dexDetail(kind, save.kills[kind]));
  const stack = html(`<div class="dex-stack"></div>`);
  stack.append(...details);
  const nav =
    kinds.length > 1
      ? html(`<div class="dex-nav">
          <button class="dex-arrow prev" data-step="-1" aria-label="${t('dex.prev')}">${MORE_ICONS.chevronLeft}</button>
          <p class="dex-pager" aria-live="polite"></p>
          <button class="dex-arrow next" data-step="1" aria-label="${t('dex.next')}">${MORE_ICONS.chevronRight}</button>
        </div>`)
      : null;
  // 닫기 버튼은 넘길 때 함께 미끄러지지 않도록 설명 밖에 하나만 둔다
  box.append(html(closeButton()), stack, ...(nav ? [nav] : []));

  const render = (dir: 0 | 1 | -1) => {
    details.forEach((d, i) => {
      const on = i === index;
      d.classList.toggle('current', on);
      d.classList.remove('from-right', 'from-left');
      d.inert = !on;
      d.toggleAttribute('aria-hidden', !on);
    });
    const cur = details[index];
    if (dir) {
      void cur.offsetWidth; // 같은 방향으로 연달아 넘겨도 슬라이드가 다시 돌게
      cur.classList.add(dir > 0 ? 'from-right' : 'from-left');
    }
    if (nav) nav.querySelector('.dex-pager')!.textContent = `${index + 1} / ${kinds.length}`;
    modal?.setAttribute('aria-label', moleName(kinds[index]));
  };
  const step = (d: 1 | -1) => {
    if (kinds.length < 2) return;
    index = (index + d + kinds.length) % kinds.length;
    render(d);
  };

  box.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-step]');
    if (btn) step(Number(btn.dataset.step) as 1 | -1);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else return;
    e.preventDefault();
  });
  // 스와이프: 가로로 충분히(48px) 밀었고 세로보다 가로 움직임이 클 때만
  let sx = 0;
  let sy = 0;
  let tracking = false;
  box.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button')) return;
    tracking = true;
    sx = e.clientX;
    sy = e.clientY;
  });
  box.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(e.clientY - sy) * 1.2) step(dx < 0 ? 1 : -1);
  });
  box.addEventListener('pointercancel', () => (tracking = false));

  render(0);
  openModal(host, box, moleName(kinds[index]));
  modal = box.closest('.modal');
}

function dexDetail(kind: MoleKind, count: number): HTMLElement {
  const def = MOLES[kind];
  const el = html(`
    <div class="dex-detail${def.good ? '' : ' danger'}">
      ${closeButton()}
      ${holeMarkup('detail-hole')}
      <h2>${moleName(kind)}</h2>
      <dl class="detail-stats">
        <div><dt>${t('dex.points')}</dt><dd>${def.points > 0 ? '+' : ''}${def.points}</dd></div>
        <div><dt>${t('dex.hits')}</dt><dd>${t('dex.hitsValue', { n: def.hp })}</dd></div>
        <div><dt>${t('dex.appears')}</dt><dd>${appearLabel(kind)}</dd></div>
      </dl>
      <p class="detail-desc">${moleDesc(kind)}</p>
      <p class="detail-count">${t(def.good ? 'dex.caught' : 'dex.exploded', { n: count })}</p>
    </div>`);
  const mole = createMoleEl(kind);
  mole.classList.add('up', 'looky');
  el.querySelector('.detail-hole .slot')!.append(mole);
  return el;
}

type Toggle = 'sound' | 'shake';

const TOGGLE_ICONS: Record<Toggle, [on: string, off: string]> = {
  sound: [ICONS.soundOn, ICONS.soundOff],
  shake: [ICONS.shakeOn, ICONS.shakeOff],
};

function toggleInner(key: Toggle, on: boolean): string {
  return `${TOGGLE_ICONS[key][on ? 0 : 1]}<span class="label">${t(`${key}.${on ? 'on' : 'off'}`)}</span>`;
}

function toggleChip(key: Toggle, on: boolean): string {
  return `<button class="chip" data-toggle="${key}" ${pressed(on)}>${toggleInner(key, on)}</button>`;
}

function settingsPanel(opts: StartOptions): HTMLElement {
  const { save } = opts;
  const lang = getLang();
  const el = html(`
    <div class="settings">
      ${closeButton()}
      <h2>${ICONS.gear} ${t('settings.title')}</h2>
      <div class="settings-grid">
        <section>
          <h3>${t('theme.label')}</h3>
          <div class="seg" role="group">
            ${THEMES.map((th) => `<button data-theme="${th}" ${pressed(save.theme === th)} title="${t(`theme.${th}`)}">${THEME_ICONS[th]}<span class="label">${t(`theme.${th}`)}</span></button>`).join('')}
          </div>
        </section>
        <section>
          <h3>${t('lang.label')}</h3>
          <div class="seg" role="group">
            ${LANGS.map((l) => `<button data-lang="${l}" ${pressed(l === lang)}>${LANG_LABEL[l]}</button>`).join('')}
          </div>
        </section>
        <section class="skin-section">
          <h3>${t('skin.label')}</h3>
          <div class="skins" role="group">
            ${SKIN_SETTINGS.map((s) => `<button data-skin="${s}" ${pressed(save.skin === s)} title="${t(`skin.${s}`)}" aria-label="${t(`skin.${s}`)}">${SKIN_ICONS[s]}<span class="label">${t(`skin.${s}`)}</span></button>`).join('')}
          </div>
          <p class="note">${t('skin.autoHint', { skin: t(`skin.${opts.todaySkin}`) })}</p>
        </section>
        <section class="toggle-section">
          <h3>${t('settings.feedback')}</h3>
          <div class="toggles">
            ${toggleChip('sound', save.sound)}
            ${toggleChip('shake', save.shake)}
          </div>
        </section>
        <section class="share-section">
          <h3>${t('invite.label')}</h3>
          <button class="btn" data-share-game>${MORE_ICONS.link} ${t('invite.button')}</button>
          <p class="note" role="status"></p>
        </section>
        <section class="reset-section">
          <h3>${t('reset.label')}</h3>
          <p class="note${opts.settings === 'reset' ? ' done' : ''}">${opts.settings === 'reset' ? `${ICONS.check} ${t('reset.done')}` : t('reset.desc')}</p>
          <button class="btn danger" data-reset>${t('reset.label')}</button>
          <div class="confirm" hidden>
            <p>${t('reset.confirm')}</p>
            <div class="row">
              <button class="btn" data-cancel>${t('common.cancel')}</button>
              <button class="btn danger" data-confirm>${t('reset.yes')}</button>
            </div>
          </div>
        </section>
      </div>
    </div>`);

  const select = (attr: string, value: string) =>
    el.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));

  el.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) =>
    b.addEventListener('click', () => {
      select('theme', b.dataset.theme!);
      opts.onTheme(b.dataset.theme as Theme);
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) =>
    b.addEventListener('click', () => {
      select('skin', b.dataset.skin!);
      opts.onSkin(b.dataset.skin as SkinSetting);
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.lang !== lang) opts.onLang(b.dataset.lang as Lang);
    }),
  );
  // 소리·진동은 화면을 다시 그리지 않고 버튼만 바꾼다
  el.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.toggle as Toggle;
      opts.onToggle(key);
      b.setAttribute('aria-pressed', String(save[key]));
      b.innerHTML = toggleInner(key, save[key]);
    }),
  );

  // 게임 주소를 친구에게 보낸다. 공유 창이 없으면 클립보드에 복사한다
  const shareGameBtn = el.querySelector<HTMLButtonElement>('[data-share-game]')!;
  shareGameBtn.addEventListener('click', async () => {
    shareGameBtn.disabled = true;
    const outcome = await shareLink(t('invite.text'));
    el.querySelector('.share-section .note')!.textContent =
      outcome === 'shared' ? t('toast.shared')
      : outcome === 'copied' ? t('invite.copied')
      : outcome === 'failed' ? t('toast.failed')
      : '';
    shareGameBtn.disabled = false;
  });

  const resetBtn = el.querySelector<HTMLButtonElement>('[data-reset]')!;
  const confirm = el.querySelector<HTMLElement>('.confirm')!;
  resetBtn.addEventListener('click', () => {
    resetBtn.hidden = true;
    confirm.hidden = false;
    confirm.querySelector<HTMLButtonElement>('[data-cancel]')!.focus();
  });
  confirm.querySelector('[data-cancel]')!.addEventListener('click', () => {
    confirm.hidden = true;
    resetBtn.hidden = false;
    resetBtn.focus();
  });
  confirm.querySelector('[data-confirm]')!.addEventListener('click', opts.onReset);
  return el;
}

/* ---------- 게임 화면 ---------- */

export interface GameView {
  el: HTMLElement;
  hud: HTMLElement;
  stage: HTMLElement;
  board: HTMLElement;
  showCountdown(text: string | null): void;
  showPause(show: boolean): void;
}

export function gameScreen(opts: {
  daily: boolean;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}): GameView {
  const el = html(`
    <main class="screen game${opts.daily ? ' daily' : ''}">
      <div class="top">
        <div class="hud"></div>
        <button class="pause-btn" aria-label="${t('hud.pause')}">${ICONS.pause}</button>
      </div>
      <div class="stage-wrap">
        <div class="stage">
          <div class="deco" aria-hidden="true">${decoMarkup()}</div>
          <div class="board"></div>
          <div class="banners" aria-live="polite"></div>
          <div class="countdown" hidden></div>
          <div class="pause-menu" hidden>
            <h2>${t('pause.title')}</h2>
            <button class="btn primary" data-act="resume">${t('pause.resume')}</button>
            <button class="btn" data-act="restart">${t('pause.restart')}</button>
            <button class="btn ghost" data-act="quit">${t('pause.quit')}</button>
          </div>
        </div>
      </div>
    </main>`);
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const countdown = q('.countdown');
  const pauseMenu = q('.pause-menu');
  q('.pause-btn').addEventListener('click', opts.onPause);
  q('[data-act="resume"]').addEventListener('click', opts.onResume);
  q('[data-act="restart"]').addEventListener('click', opts.onRestart);
  q('[data-act="quit"]').addEventListener('click', opts.onQuit);

  // 판은 HUD를 뺀 높이에 맞추므로 HUD 높이(글자 크기·줄바꿈에 따라 달라짐)를 재서 넘겨 준다
  const top = q('.top');
  new ResizeObserver(() => el.style.setProperty('--top-h', `${top.offsetHeight}px`)).observe(top);

  return {
    el,
    hud: q('.hud'),
    stage: q('.stage'),
    board: q('.board'),
    showCountdown(text) {
      countdown.hidden = text === null;
      if (text === null) return;
      countdown.textContent = text;
      countdown.classList.remove('pop');
      void countdown.offsetWidth;
      countdown.classList.add('pop');
    },
    showPause(show) {
      pauseMenu.hidden = !show;
      if (show) pauseMenu.querySelector<HTMLButtonElement>('button')!.focus();
    },
  };
}

/** 판 가장자리 소품. 지금 적용된 스킨을 따른다 */
function decoMarkup(): string {
  const skin = (document.documentElement.dataset.skin ?? 'garden') as Skin;
  const [a, b] = DECO_ART[skin] ?? DECO_ART.garden;
  return Array.from({ length: 6 }, (_, i) => `<span>${i % 2 ? b : a}</span>`).join('');
}

/* ---------- 결과 화면 ---------- */

function goalText(goal: Goal): string {
  switch (goal.type) {
    case 'first':
      return t('goal.first');
    case 'record':
      return t('goal.record', { n: goal.diff });
    case 'missing':
      return t('goal.missing', { name: moleName(goal.kind) });
    case 'gap':
      return t('goal.gap', { n: goal.gap });
  }
}

export function resultScreen(opts: {
  result: GameResult;
  daily: boolean;
  isRecord: boolean;
  newDex: MoleKind[];
  goal: Goal;
  missionId: MissionId;
  onRetry: () => void;
  onHome: () => void;
  onShare: (image: Blob | null) => Promise<ShareOutcome>;
  onShareLink: () => Promise<ShareOutcome>;
}): HTMLElement {
  const { result } = opts;
  const { stats } = result;
  const killed = MOLE_ORDER.filter((k) => k !== 'bomb' && stats.kills[k] > 0);
  const missionLabel = t(`mission.${opts.missionId}` as MessageKey);
  const el = html(`
    <main class="screen result grade-${result.grade}">
      <div class="confetti-layer" aria-hidden="true"></div>
      <div class="col main-col">
        <p class="mode">${opts.daily ? t('start.daily') : t('mode.classic')}</p>
        <div class="grade-row">
          <div class="grade" aria-label="${t('result.grade', { g: result.grade })}">${result.grade}</div>
          <div class="stars">${result.stars.map((s, i) => `<span class="${s ? 'on' : ''}" style="--i:${i}">${s ? STAR_ON : STAR_OFF}</span>`).join('')}</div>
        </div>
        <p class="final">${t('result.final')}</p>
        ${opts.isRecord ? `<p class="record">${t('result.record')}</p>` : ''}
        <ul class="kills">
          ${killed.map((k) => `<li aria-label="${moleName(k)} ${stats.kills[k]}">${thumbMarkup(k, 'thumb mini')}<b>×${stats.kills[k]}</b>${opts.newDex.includes(k) ? '<em>NEW</em>' : ''}</li>`).join('')}
          ${stats.bombs > 0 ? `<li class="bad" aria-label="${moleName('bomb')} ${stats.bombs}">${thumbMarkup('bomb', 'thumb mini')}<b>×${stats.bombs}</b>${opts.newDex.includes('bomb') ? '<em>NEW</em>' : ''}</li>` : ''}
        </ul>
      </div>
      <div class="col side-col">
        <p class="goal">${goalText(opts.goal)}</p>
        <dl class="numbers">
          <div><dt>${t('result.accuracy')}</dt><dd>${Math.round(result.accuracy * 100)}%</dd></div>
          <div><dt>${t('result.maxCombo')}</dt><dd>${stats.maxCombo}</dd></div>
          <div><dt>${t('result.missed')}</dt><dd>${stats.missed}</dd></div>
          <div><dt>${t('result.bombs')}</dt><dd>${stats.bombs}</dd></div>
        </dl>
        <p class="mission-result ${result.missionDone ? 'done' : ''}">
          ${ICONS.target} ${missionLabel} — ${result.missionDone ? t('result.missionDone', { n: result.missionBonus }) : t('result.missionFail')}
        </p>
        <div class="actions">
          <button class="btn primary" data-act="retry">${t('result.retry')}</button>
          <button class="btn icon-action" data-act="share" aria-label="${t('result.share')}" title="${t('result.share')}">${MORE_ICONS.share}</button>
          <button class="btn icon-action" data-act="home" aria-label="${t('result.home')}" title="${t('result.home')}">${MORE_ICONS.home}</button>
          <button class="btn share-link" data-act="share-link" hidden>${MORE_ICONS.link} ${t('result.shareLink')}</button>
        </div>
      </div>
      <p class="toast" role="status"></p>
    </main>`);
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  fillThumbs(el);
  countUp(q('.final-score'), result.score);
  if (opts.isRecord) setTimeout(() => confetti(q('.confetti-layer')), 400);

  q('[data-act="retry"]').addEventListener('click', opts.onRetry);
  q('[data-act="home"]').addEventListener('click', opts.onHome);
  // 공유 시트는 클릭 직후에 열어야 하므로, 점수·별 연출이 끝나면 미리 결과 이미지를 찍어 둔다
  let image: Promise<Blob | null> | null = null;
  const capture = () => (image ??= captureResult(el));
  setTimeout(() => el.isConnected && capture(), 1600);
  const toast = q('.toast');
  const shareBtn = q('[data-act="share"]') as HTMLButtonElement;
  const linkBtn = q('[data-act="share-link"]') as HTMLButtonElement;
  const showOutcome = (outcome: ShareOutcome) => {
    toast.textContent =
      outcome === 'sharedImage' ? t('toast.sharedImage')
      : outcome === 'shared' ? t('toast.shared')
      : outcome === 'copied' ? t('toast.copied')
      : outcome === 'copiedSaved' ? t('toast.copiedSaved')
      : outcome === 'failed' ? t('toast.failed')
      : '';
  };
  shareBtn.addEventListener('click', async () => {
    shareBtn.disabled = true;
    toast.textContent = t('toast.preparing');
    const outcome = await opts.onShare(await capture());
    showOutcome(outcome);
    // 이미지를 보냈으면 게임 링크를 이어서 보낼 버튼을 꺼낸다(공유 시트는 클릭마다 한 번만 열 수 있다)
    if (outcome === 'sharedImage') {
      linkBtn.hidden = false;
      linkBtn.focus();
    }
    shareBtn.disabled = false;
  });
  linkBtn.addEventListener('click', async () => {
    linkBtn.disabled = true;
    const outcome = await opts.onShareLink();
    showOutcome(outcome);
    if (outcome !== 'cancelled' && outcome !== 'failed') linkBtn.hidden = true;
    linkBtn.disabled = false;
  });
  setTimeout(() => q('[data-act="retry"]').focus(), 0);
  return el;
}
