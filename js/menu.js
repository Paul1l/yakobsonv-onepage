// Полноэкранная навигация на <dialog>: Esc, кнопка закрытия, фокус-ловушка,
// возврат фокуса на кнопку «Меню», блок прокрутки страницы, закрытие при переходе по якорю.
import { goToSection } from './navigation.js';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initMenu() {
  const dialog = document.getElementById('site-menu');
  const toggle = document.querySelector('[data-menu-toggle]');
  const closeButton = dialog?.querySelector('[data-menu-close]');
  if (!dialog || !toggle || !closeButton || typeof dialog.showModal !== 'function') return;

  const root = document.documentElement;
  let restoreFocus = true;

  const open = () => {
    if (dialog.open) return;
    restoreFocus = true;
    dialog.showModal();
    root.classList.add('is-menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  };

  const finishClose = () => {
    root.classList.remove('is-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const close = ({ returnFocus = true } = {}) => {
    if (!dialog.open) return;
    restoreFocus = returnFocus;
    dialog.close();
    finishClose(); // синхронно: прокрутка к якорю идёт уже без блокировки
  };

  toggle.addEventListener('click', open);
  closeButton.addEventListener('click', () => close());

  // Esc (событие cancel) и любое другое закрытие диалога
  dialog.addEventListener('close', () => {
    finishClose();
    if (restoreFocus) toggle.focus();
    restoreFocus = true;
  });

  // Фокус-ловушка: Tab и Shift+Tab ходят по кругу внутри меню
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Переход по разделам: закрыть меню, прокрутить, перенести фокус на заголовок раздела
  dialog.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target) return;
    event.preventDefault();
    close({ returnFocus: false });
    goToSection(target, hash);
  });

  root.classList.add('has-menu');
}
