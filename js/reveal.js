// Постепенное раскрытие блоков по скроллу.
// Блоки скрываются только после того, как наблюдатель создан (класс html.reveal-ready),
// а то, что уже на экране или выше, помечается видимым заранее — без мигания.
import { prefersReducedMotion } from './motion.js';

export function initReveal() {
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (!items.length || !('IntersectionObserver' in window) || prefersReducedMotion()) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0 },
  );

  const limit = window.innerHeight * 0.92;
  for (const item of items) {
    if (item.getBoundingClientRect().top < limit) item.classList.add('is-revealed');
    else observer.observe(item);
  }
  document.documentElement.classList.add('reveal-ready');
}
