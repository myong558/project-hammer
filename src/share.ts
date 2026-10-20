import { MOLES, MOLE_ORDER } from './game/moles';
import type { GameResult } from './game/types';
import { t } from './i18n';

export function shareText(result: GameResult, opts: { date: Date; daily: boolean }): string {
  const { stats } = result;
  const date = `${opts.date.getMonth() + 1}/${opts.date.getDate()}`;
  const stars = result.stars.map((s) => (s ? '⭐' : '☆')).join('');
  const kills = MOLE_ORDER.filter((k) => k !== 'bomb' && stats.kills[k] > 0).map((k) =>
    k === 'king' ? MOLES.king.emoji : `${MOLES[k].emoji}×${stats.kills[k]}`,
  );
  if (stats.bombs > 0) kills.push(`${MOLES.bomb.emoji}×${stats.bombs}`);

  return [
    `${t('app.title')} 🔨 ${date}${opts.daily ? t('share.daily') : ''}`,
    `${stars}  ${t('share.score', { g: result.grade, n: result.score })}`,
    kills.join(' ') || t('share.empty'),
    `${t('share.combo', { n: stats.maxCombo })}${stats.maxCombo >= 15 ? ' 🔥' : ''}`,
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** 공유 링크는 쿼리·해시를 뗀 게임 첫 화면 주소다 */
export function gameLink(): string {
  return location.href.split(/[?#]/)[0];
}

/**
 * 결과 화면을 PNG로 찍는다. 화면이 깜빡이지 않도록 화면 밖에 복제본을 두고 찍으며,
 * 복제본에서는 버튼 자리에 게임 이름과 링크를 넣고 폭죽·토스트는 뺀다
 */
export async function captureResult(el: HTMLElement): Promise<Blob | null> {
  const { toBlob } = await import('html-to-image');
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.add('capturing');
  clone.querySelectorAll('.toast, .confetti-layer').forEach((n) => n.remove());
  const footer = document.createElement('p');
  footer.className = 'share-footer';
  footer.innerHTML = `<b>${t('app.title')} 🔨</b><span>${gameLink()}</span>`;
  clone.querySelector('.actions')?.replaceWith(footer);
  // 복제본은 원래 자리에 그대로 두되, 감싼 상자를 완전히 잘라 화면에는 보이지 않게 한다
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  Object.assign(holder.style, { position: 'fixed', inset: '0', clipPath: 'inset(100%)', pointerEvents: 'none' });
  Object.assign(clone.style, { width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` });
  holder.append(clone);
  el.after(holder);
  try {
    return await toBlob(clone, {
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      backgroundColor: getComputedStyle(document.body).backgroundColor,
    });
  } catch {
    return null;
  } finally {
    holder.remove();
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'copiedSaved' | 'failed';

/**
 * 시스템 공유 시트로 결과 이미지와 링크를 보낸다.
 * 파일 공유를 못 하는 브라우저는 링크만 공유하고, 공유 시트가 없으면 글·링크를 복사하고 이미지를 내려받는다.
 */
export async function shareResult(text: string, image: Blob | null): Promise<ShareOutcome> {
  const url = gameLink();
  const message = `${text}\n${url}`;
  const file = image && new File([image], 'project-hammer-result.png', { type: 'image/png' });

  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: message });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    // 공유 시트가 실패하면 복사로 넘어간다
  }

  const copied = await copyText(message);
  if (image) {
    download(image, 'project-hammer-result.png');
    return copied ? 'copiedSaved' : 'failed';
  }
  return copied ? 'copied' : 'failed';
}

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
