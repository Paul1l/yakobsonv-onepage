// Переключатель темы: светлая (по умолчанию) / тёмная.
// Начальную тему ставит встроенный скрипт в <head> до отрисовки; здесь — кнопка, сохранение и theme-color.

export const THEME_KEY = 'yakobson-onepage-theme';

export function initTheme() {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

  const apply = (theme, persist) => {
    root.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
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

  button.addEventListener('click', () => apply(current() === 'dark' ? 'light' : 'dark', true));
  apply(current(), false);
  root.classList.add('has-theme-toggle');
}
