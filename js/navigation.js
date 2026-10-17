// Переход к разделу: прокрутка с учётом фиксированной шапки (scroll-padding-top в CSS)
// и перенос фокуса на заголовок раздела — клавиатура и скринридер продолжают с нужного места.
import { prefersReducedMotion } from './motion.js';

export function goToSection(target, hash) {
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (hash && location.hash !== hash) history.pushState(null, '', hash);
  const heading = target.querySelector('h1, h2') || target;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}
