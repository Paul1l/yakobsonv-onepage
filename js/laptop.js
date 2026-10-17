// Ноутбук слегка меняет ракурс при прокрутке: прогресс прохождения раздела через экран →
// углы rotateX/rotateY и «глубина» клавиатурной части. Прокрутку не перехватываем:
// пассивный scroll → один кадр requestAnimationFrame. Вне экрана и при reduced-motion — не считаем.
import { clamp, observeInView, onReducedMotionChange, prefersReducedMotion } from './motion.js';

export function initLaptop() {
  const stage = document.querySelector('[data-laptop]');
  const device = stage?.querySelector('.laptop');
  if (!stage || !device) return;

  let inView = false;
  let frame = 0;

  const reset = () => {
    device.style.removeProperty('--rx');
    device.style.removeProperty('--ry');
    device.style.removeProperty('--deck');
  };

  const update = () => {
    frame = 0;
    const rect = stage.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    // 0 — раздел только показался снизу, 1 — ушёл вверх
    const p = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
    const eased = p * p * (3 - 2 * p);
    const rx = 13 - 15 * eased; // 13° → −2°: из «взгляда сверху» почти во фронт
    const ry = (p - 0.5) * 10; // −5° → 5°
    device.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    device.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    device.style.setProperty('--deck', (1 - eased * 0.75).toFixed(3));
  };

  const schedule = () => {
    if (!inView || frame || prefersReducedMotion()) return;
    frame = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  observeInView(stage, (visible) => {
    inView = visible;
    schedule();
  });
  onReducedMotionChange((reduced) => (reduced ? reset() : schedule()));
}
