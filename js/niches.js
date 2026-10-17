// Ниши в планшете: автосмена каждые 6 с на часах requestAnimationFrame.
// Автосмена стоит при наведении, фокусе внутри блока, уходе блока с экрана, скрытой вкладке,
// пользовательской паузе и prefers-reduced-motion. Ручное переключение работает всегда.
import { createLoop, observeInView, onReducedMotionChange, prefersReducedMotion } from './motion.js';

export const NICHE_INTERVAL = 6000;

export function initNiches() {
  const root = document.querySelector('[data-niches]');
  if (!root) return;
  const slides = [...root.querySelectorAll('[data-niche]')];
  const controls = root.querySelector('[data-niche-controls]');
  const dotsWrap = root.querySelector('[data-niche-dots]');
  const prev = root.querySelector('[data-niche-prev]');
  const next = root.querySelector('[data-niche-next]');
  const toggle = root.querySelector('[data-niche-toggle]');
  const counter = root.querySelector('[data-niche-count]');
  const live = root.querySelector('[data-niche-live]');
  const total = slides.length;
  if (!total || !controls || !dotsWrap || !prev || !next || !toggle) return;

  const titles = slides.map((s) => s.querySelector('.tui__title')?.textContent.trim() || '');
  const pad = (n) => String(n).padStart(2, '0');

  let index = 0;
  let elapsed = 0;
  let userPaused = false;
  let hovered = false;
  let focused = false;
  let inView = false;

  const dots = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    dot.setAttribute('aria-label', `Ниша ${i + 1} из ${total}`);
    dot.addEventListener('click', () => go(i, true));
    dotsWrap.append(dot);
    return dot;
  });

  const setProgress = (value) => dots[index].style.setProperty('--p', value.toFixed(3));

  function render() {
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    dots.forEach((dot, i) => {
      dot.style.removeProperty('--p');
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (counter) counter.textContent = `${pad(index + 1)} / ${pad(total)}`;
    root.dataset.index = String(index);
  }

  const loop = createLoop((dt) => {
    elapsed += dt;
    if (elapsed >= NICHE_INTERVAL) {
      go(index + 1, false);
      return;
    }
    setProgress(elapsed / NICHE_INTERVAL);
  });

  const canAutoplay = () =>
    !userPaused && !hovered && !focused && inView && !document.hidden && !prefersReducedMotion();

  function update() {
    const playing = canAutoplay();
    if (playing) loop.start();
    else loop.stop();
    root.dataset.autoplay = playing ? 'on' : 'off';
    toggle.setAttribute('aria-pressed', String(userPaused));
    toggle.hidden = prefersReducedMotion();
    if (!playing && !userPaused) setProgress(prefersReducedMotion() ? 1 : elapsed / NICHE_INTERVAL);
  }

  function go(i, manual) {
    index = ((i % total) + total) % total;
    elapsed = 0;
    render();
    setProgress(prefersReducedMotion() ? 1 : 0);
    if (manual && live) live.textContent = `Ниша ${index + 1} из ${total}: ${titles[index]}`;
  }

  prev.addEventListener('click', () => go(index - 1, true));
  next.addEventListener('click', () => go(index + 1, true));
  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    update();
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(index + (event.key === 'ArrowRight' ? 1 : -1), true);
    if (event.target.classList?.contains('dot')) dots[index].focus();
  });

  root.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    update();
  });
  root.addEventListener('pointerleave', () => {
    hovered = false;
    update();
  });
  root.addEventListener('focusin', () => {
    focused = true;
    update();
  });
  root.addEventListener('focusout', (event) => {
    if (root.contains(event.relatedTarget)) return;
    focused = false;
    update();
  });
  document.addEventListener('visibilitychange', update);
  onReducedMotionChange(update);
  observeInView(
    root,
    (visible) => {
      inView = visible;
      update();
    },
    { threshold: 0.35 },
  );

  controls.hidden = false;
  root.classList.add('is-ready');
  render();
  update();
}
