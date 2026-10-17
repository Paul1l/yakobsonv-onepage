// Общие помощники движения: prefers-reduced-motion, видимость вкладки, цикл requestAnimationFrame.

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export const prefersReducedMotion = () => reducedQuery.matches;

export function onReducedMotionChange(callback) {
  reducedQuery.addEventListener('change', () => callback(reducedQuery.matches));
}

export function onVisibilityChange(callback) {
  document.addEventListener('visibilitychange', () => callback(document.hidden));
}

/**
 * Цикл на requestAnimationFrame с собственными часами.
 * dt между кадрами ограничен MAX_DT: после возврата на вкладку или «подвисания» кадра
 * время не прыгает вперёд. Между stop() и start() время не идёт вовсе.
 */
const MAX_DT = 64;

export function createLoop(onFrame) {
  let frameId = 0;
  let last = 0;
  let running = false;

  const frame = (now) => {
    if (!running) return;
    const dt = last ? Math.min(now - last, MAX_DT) : 0;
    last = now;
    onFrame(dt);
    frameId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      frameId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      last = 0;
      cancelAnimationFrame(frameId);
    },
    get running() {
      return running;
    },
  };
}

/** Следит, находится ли элемент в области просмотра. */
export function observeInView(element, callback, { threshold = 0, rootMargin = '0px' } = {}) {
  if (!('IntersectionObserver' in window)) {
    callback(true);
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) callback(entry.isIntersecting);
    },
    { threshold, rootMargin },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
