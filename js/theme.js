// Переключатель темы: светлая (по умолчанию) / тёмная.
// Начальную тему ставит встроенный скрипт в <head> до отрисовки; здесь — кнопки, сохранение и theme-color.
// Кнопок две — в шапке и в открытом меню; состояние (aria-pressed) у них общее.

export const THEME_KEY = 'yakobson-onepage-theme';

export function initTheme() {
  const buttons = [...document.querySelectorAll('[data-theme-toggle]')];
  if (!buttons.length) return;
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

  const apply = (theme, persist) => {
    root.dataset.theme = theme;
    for (const button of buttons) button.setAttribute('aria-pressed', String(theme === 'dark'));
    // цвет панели браузера берём из токена темы, а не дублируем значения
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* хранилище недоступно — тема действует до перезагрузки */
      }
    }
  };

  for (const button of buttons) button.addEventListener('click', () => apply(current() === 'dark' ? 'light' : 'dark', true));
  apply(current(), false);
  root.classList.add('has-theme-toggle');
}
