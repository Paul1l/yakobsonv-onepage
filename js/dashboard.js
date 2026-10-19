// Вкладки превью дашборда (Обзор / Позиции / Трафик / Контент / Задачи) — как на yakobsonv.com.
// Кнопки вкладок стоят под ноутбуком, панели — на его экране. Шаблон WAI-ARIA Tabs:
// стрелки ←/→, Home/End переключают и переносят фокус (автоматическая активация), Tab уходит в панель.
// Без JS вкладки скрыты, а все панели идут на экране подряд (прокрутка внутри экрана) — текст не теряется.

export function initDashboard() {
  const tablist = document.querySelector('[data-dash-tabs]');
  const dash = document.querySelector('[data-dash]');
  if (!tablist || !dash) return;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panes = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  if (!tabs.length || panes.some((pane) => !pane)) return;
  const scroller = dash.querySelector('.dash__panes');

  panes.forEach((pane, i) => {
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', tabs[i].id);
    pane.tabIndex = 0; // панель может прокручиваться — до неё должна доходить клавиатура
  });

  function select(index, focus) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panes[i].hidden = !active;
    });
    if (scroller) scroller.scrollTop = 0;
    dash.dataset.tab = String(index);
    if (focus) tabs[index].focus();
  }

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tabs.indexOf(tab), false);
  });

  tablist.addEventListener('keydown', (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const last = tabs.length - 1;
    const keys = { ArrowLeft: current === 0 ? last : current - 1, ArrowRight: current === last ? 0 : current + 1, Home: 0, End: last };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key], true);
  });

  dash.classList.add('is-tabbed');
  tablist.hidden = false;
  select(Math.max(0, tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')), false);
}
