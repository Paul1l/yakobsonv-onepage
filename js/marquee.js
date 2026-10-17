// Бегущая строка CMS: CSS-анимация на продублированном наборе (сдвиг ровно на −50% — стык незаметен).
// Пауза кнопкой (aria-pressed), автоматическая пауза при скрытой вкладке и вне экрана.
// При prefers-reduced-motion CSS отключает движение: дубль скрыт, список переносится.
import { observeInView } from './motion.js';

const SPEED = 42; // px в секунду

export function initMarquee() {
  const root = document.querySelector('[data-marquee]');
  const track = root?.querySelector('[data-marquee-track]');
  const list = track?.querySelector('.cms__list');
  const toggle = root?.querySelector('[data-marquee-toggle]');
  if (!root || !track || !list || !toggle) return;

  const clone = list.cloneNode(true);
  clone.classList.add('is-clone');
  clone.setAttribute('aria-hidden', 'true');
  track.append(clone);

  let userPaused = false;
  let offscreen = false;

  const apply = () => {
    root.classList.toggle('is-paused', userPaused || offscreen || document.hidden);
    toggle.setAttribute('aria-pressed', String(userPaused));
  };

  const setDuration = () => {
    const width = list.getBoundingClientRect().width;
    if (width) root.style.setProperty('--marquee-duration', `${(width / SPEED).toFixed(1)}s`);
  };

  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    apply();
  });
  document.addEventListener('visibilitychange', apply);
  observeInView(root, (visible) => {
    offscreen = !visible;
    apply();
  });
  if ('ResizeObserver' in window) new ResizeObserver(setDuration).observe(list);

  toggle.hidden = false;
  root.classList.add('is-ready');
  setDuration();
  apply();
}
