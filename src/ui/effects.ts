/** 손맛 연출: 점수 팝업, 파티클, 화면 흔들림, 배너, 망치 커서, 폭죽 */
export class Effects {
  constructor(
    private readonly stage: HTMLElement,
    private readonly shakeEnabled: () => boolean,
  ) {}

  popup(target: HTMLElement, text: string, variant = ''): void {
    const el = document.createElement('span');
    el.className = `popup ${variant}`;
    el.textContent = text;
    target.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  burst(target: HTMLElement, chars: string[], count = 6): void {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'particle';
      el.textContent = chars[i % chars.length];
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const dist = 2.5 + Math.random() * 2;
      el.style.setProperty('--dx', `${Math.cos(angle) * dist}em`);
      el.style.setProperty('--dy', `${Math.sin(angle) * dist - 1.2}em`);
      target.append(el);
      el.addEventListener('animationend', () => el.remove());
    }
  }

  shake(strength: 'small' | 'big'): void {
    if (!this.shakeEnabled()) return;
    const cls = `shake-${strength}`;
    this.stage.classList.remove('shake-small', 'shake-big');
    void this.stage.offsetWidth;
    this.stage.classList.add(cls);
  }

  banner(text: string, variant = ''): void {
    const layer = this.stage.querySelector('.banners')!;
    const el = document.createElement('div');
    el.className = `banner ${variant}`;
    el.textContent = text;
    layer.replaceChildren(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/** 마우스를 따라다니는 망치. 터치에서는 친 자리에 잠깐 나타난다 */
export class Hammer {
  readonly el: HTMLElement;

  constructor(private readonly stage: HTMLElement) {
    this.el = document.createElement('span');
    this.el.className = 'hammer';
    this.el.textContent = '🔨';
    this.el.setAttribute('aria-hidden', 'true');
    stage.append(this.el);
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.moveTo(e.clientX, e.clientY, true);
    });
    stage.addEventListener('pointerleave', () => this.el.classList.remove('visible'));
  }

  moveTo(clientX: number, clientY: number, visible: boolean): void {
    const rect = this.stage.getBoundingClientRect();
    this.el.style.left = `${clientX - rect.left}px`;
    this.el.style.top = `${clientY - rect.top}px`;
    this.el.classList.toggle('visible', visible);
  }

  swing(clientX: number, clientY: number, touch: boolean): void {
    this.moveTo(clientX, clientY, true);
    this.el.classList.remove('swing');
    void this.el.offsetWidth;
    this.el.classList.add('swing');
    if (touch) {
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => this.el.classList.remove('visible'), 260);
    }
  }

  stun(): void {
    this.el.classList.remove('stunned');
    void this.el.offsetWidth;
    this.el.classList.add('stunned');
  }

  private hideTimer: ReturnType<typeof setTimeout> | undefined;
}

export function confetti(container: HTMLElement, count = 60): void {
  const colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.style.left = `${Math.random() * 100}%`;
    el.style.background = colors[i % colors.length];
    el.style.animationDelay = `${Math.random() * 0.6}s`;
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    el.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    container.append(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/** 숫자가 차르르 올라가는 연출 */
export function countUp(el: HTMLElement, to: number, ms = 900): void {
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(to * (1 - (1 - t) ** 3)).toLocaleString();
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
