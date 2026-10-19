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
