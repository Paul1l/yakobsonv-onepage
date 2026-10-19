// «От запроса до готовой страницы»: точка на пунктирной линии и подсветка карточек
// считаются от ОДНОГО общего времени t (requestAnimationFrame). Полный проход — 15 с.
// Пауза, ручной выбор этапа (фиксирует точку над этапом), остановка вне экрана и при скрытой вкладке.
// При prefers-reduced-motion автодвижения нет, ручной выбор работает.
import { clamp, createLoop, observeInView, onReducedMotionChange, prefersReducedMotion } from './motion.js';

export const PROCESS_PERIOD = 15000;
const EDGE_FADE = 0.03; // доля прохода, в которой точка проявляется/гаснет на концах линии

const smooth = (x) => x * x * (3 - 2 * x);

export function initProcess() {
  const root = document.querySelector('[data-process]');
  if (!root) return;
  const rail = root.querySelector('.steps__rail');
  const dot = root.querySelector('[data-process-dot]');
  const steps = [...root.querySelectorAll('[data-step]')];
  const controls = root.querySelector('[data-process-controls]');
  const toggle = root.querySelector('[data-process-toggle]');
  const toggleLabel = toggle?.querySelector('[data-process-label]');
  if (!rail || !dot || !steps.length || !controls || !toggle) return;
  // Подпись кнопки меняется вместе с состоянием («Пауза» ↔ «Продолжить»), поэтому aria-pressed не используем:
  // по WAI-ARIA у кнопки-переключателя с aria-pressed подпись постоянная.
  const setToggle = (paused) => {
    toggle.dataset.paused = String(paused);
    if (toggleLabel) toggleLabel.textContent = paused ? 'Продолжить' : 'Пауза';
  };

  // Номер этапа становится кнопкой выбора
  const buttons = steps.map((step, i) => {
    const num = step.querySelector('.step__num');
    const title = step.querySelector('.step__title')?.textContent.trim() || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'step__num';
    button.textContent = num?.textContent || String(i + 1).padStart(2, '0');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `Этап ${button.textContent}: ${title}`);
    if (num) num.replaceWith(button);
    else step.prepend(button);
    return button;
  });

  let t = 0; // общее время прохода, мс
  let userPaused = false;
  let inView = false;
  let selected = -1;
  const geo = { vertical: false, length: 1, centers: [], halves: [] };

  function measure() {
    const r = rail.getBoundingClientRect();
    geo.vertical = r.height > r.width;
    geo.length = Math.max(1, geo.vertical ? r.height : r.width);
    geo.centers = [];
    geo.halves = [];
    for (const step of steps) {
      const s = step.getBoundingClientRect();
      const center = geo.vertical ? s.top + s.height / 2 - r.top : s.left + s.width / 2 - r.left;
      geo.centers.push(center / geo.length);
      geo.halves.push((geo.vertical ? s.height : s.width) / 2 / geo.length);
    }
  }

  function render() {
    const p = (t % PROCESS_PERIOD) / PROCESS_PERIOD;
    const pos = p * geo.length;
    dot.style.transform = geo.vertical ? `translate3d(0, ${pos.toFixed(2)}px, 0)` : `translate3d(${pos.toFixed(2)}px, 0, 0)`;
    dot.style.opacity = String(clamp(Math.min(p, 1 - p) / EDGE_FADE, 0, 1).toFixed(3));
    steps.forEach((step, i) => {
      // подсветка нарастает, пока точка над карточкой, и угасает после
      const reach = geo.halves[i] * 1.15;
      const glow = smooth(clamp(1 - Math.abs(p - geo.centers[i]) / reach, 0, 1));
      step.style.setProperty('--glow', glow.toFixed(3));
      step.classList.toggle('is-lit', glow > 0.5);
    });
  }

  const loop = createLoop((dt) => {
    t = (t + dt) % PROCESS_PERIOD;
    render();
  });

  const canRun = () => !userPaused && inView && !document.hidden && !prefersReducedMotion();

  function update() {
    if (canRun()) loop.start();
    else loop.stop();
    root.dataset.running = String(loop.running);
    setToggle(userPaused);
    toggle.hidden = prefersReducedMotion();
  }

  function select(i) {
    selected = i;
    userPaused = true;
    t = geo.centers[i] * PROCESS_PERIOD;
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    steps.forEach((s, k) => {
      if (k === i) s.setAttribute('aria-current', 'step');
      else s.removeAttribute('aria-current');
    });
    render();
    update();
  }

  function clearSelection() {
    selected = -1;
    buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    steps.forEach((s) => s.removeAttribute('aria-current'));
  }

  root.addEventListener('click', (event) => {
    const step = event.target.closest('[data-step]');
    if (!step) return;
    select(steps.indexOf(step));
  });
  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    if (!userPaused) clearSelection();
    update();
  });

  document.addEventListener('visibilitychange', update);
  onReducedMotionChange((reduced) => {
    if (reduced && selected < 0) select(0);
    update();
  });
  observeInView(root, (visible) => {
    inView = visible;
    update();
  });
  const remeasure = () => {
    const keep = selected;
    measure();
    if (keep >= 0) t = geo.centers[keep] * PROCESS_PERIOD;
    render();
  };
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(root);

  controls.hidden = false;
  root.classList.add('is-ready');
  measure();
  if (prefersReducedMotion()) {
    // без автодвижения: точка стоит над первым этапом, выбор — вручную
    select(0);
    userPaused = false;
    setToggle(false);
  }
  render();
  update();
}
