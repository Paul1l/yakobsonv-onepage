// Проверки сайта запуском в headless Chrome (CDP, без зависимостей).
// Запуск: node scripts/check.mjs            — поднимет свой статический сервер на 127.0.0.1:8052
//         BASE_URL=http://127.0.0.1:8050/ node scripts/check.mjs — проверить уже запущенный сервер
// CDP_PORT — порт отладки Chrome (по умолчанию 9681).
// --theme=light | dark | both (по умолчанию both) — в какой теме прогнать весь набор;
// переключатель темы проверяется в каждом запуске отдельно.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './lib/cdp.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function startServer(port) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, `.${path}`);
    const info = file.startsWith(root + sep) ? await stat(file).catch(() => null) : null;
    if (!info?.isFile()) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return server;
}

const THEME_KEY = 'yakobson-onepage-theme';
const themeArg = (process.argv.find((a) => a.startsWith('--theme=')) || '--theme=both').split('=')[1];
const THEMES = themeArg === 'both' ? ['light', 'dark'] : [themeArg];
if (!THEMES.every((t) => t === 'light' || t === 'dark')) throw new Error(`неизвестная тема: ${themeArg}`);

const results = [];
let prefix = '';
const check = (name, ok, detail = '') => {
  const full = prefix + name;
  results.push({ name: full, ok: Boolean(ok), detail });
  console.log(`${ok ? ' ✓' : ' ✗'} ${full}${detail ? ` — ${detail}` : ''}`);
};

const server = process.env.BASE_URL ? null : await startServer(8052);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8052/';
const browser = await launch({ port: Number(process.env.CDP_PORT) || 9681 });
const p = browser.page;
let consoleLog = [];

const J = async (expr) => JSON.parse(await p.eval(`JSON.stringify((() => { ${expr} })())`));
async function open(width, height, { mobile = width <= 768, reduced = false } = {}) {
  await p.viewport(width, height, { mobile });
  await p.media([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
  p.console = [];
  await p.goto(BASE);
  await sleep(300);
}
const collectConsole = (label) => {
  for (const line of p.console) consoleLog.push(`${label}: ${line}`);
  p.console = [];
};
async function scrollThrough() {
  const h = await p.eval('document.documentElement.scrollHeight');
  for (let y = 0; y <= h; y += 350) {
    await p.eval(`window.scrollTo(0, ${y})`);
    await sleep(40);
  }
}
async function center(selector) {
  await p.eval(`document.querySelector('${selector}').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(450);
}
async function rectOf(selector) {
  return J(`const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, top: r.top };`);
}
const KEYS = {
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
};
const press = (key, shift = false) => p.key(key, { ...KEYS[key], shift });
// Контраст по вычисленным цветам: текст против ближайшей непрозрачной подложки (с наложением полупрозрачных слоёв)
const contrastAudit = () => J(`
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const v = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v[3] ?? 1]; };
  const over = (f, b) => [0, 1, 2].map((k) => f[k] * f[3] + b[k] * (1 - f[3])).concat(1);
  const lum = (c) => { const ch = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => { const stack = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) base = stack[i][3] >= 1 ? stack[i] : over(stack[i], base); return base; };
  const els = [...document.querySelectorAll('body *')].filter((el) => !el.closest('.sr-only, svg, [aria-hidden="true"], dialog:not([open]), .skip-link')
    && !(el.classList.contains('hero__line') && el.previousElementSibling)
    && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  const fails = []; let min = 99;
  for (const el of els) {
    const cs = getComputedStyle(el); const bg = bgOf(el); const fg0 = parse(cs.color); const fg = fg0[3] < 1 ? over(fg0, bg) : fg0;
    const r = ratio(fg, bg); const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    min = Math.min(min, r); if (r < (large ? 3 : 4.5)) fails.push(el.textContent.trim().slice(0, 28) + ' ' + r.toFixed(2));
  }
  return { count: els.length, min: Number(min.toFixed(2)), fails };
`);

const setHidden = (hidden) =>
  p.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${hidden} });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => '${hidden ? 'hidden' : 'visible'}' });
    document.dispatchEvent(new Event('visibilitychange')); true`);

async function suite(theme) {
  prefix = `[${theme}] `;
  consoleLog = [];
  console.log(`\n========== Тема: ${theme} ==========`);
  const themeScript = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('${THEME_KEY}', '${theme}') } catch (e) {}` });
  await open(1440, 900);
  const applied = await p.eval('document.documentElement.dataset.theme');
  check('тема применена', applied === theme, `data-theme=${applied}`);

  // ---------- 1. Перелив, заголовки, цели нажатия на всех ширинах ----------
  console.log('\n[ширины]');
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920]) {
    await open(width, width <= 768 ? 844 : 900);
    if (width === 390 || width === 1440) {
      await sleep(1200);
      const cls = await p.eval(`new Promise((done) => { let sum = 0; new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) sum += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => done(sum), 100); })`);
      const fonts = await p.eval(`[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(',')`);
      check(`${width}px: CLS при загрузке < 0.1, Inter загружен`, cls < 0.1 && /Inter/.test(fonts), `CLS ${cls.toFixed(4)}; загружены: ${fonts}`);
    }
    await scrollThrough();
    const m = await J(`
      const de = document.documentElement;
      const headings = [...document.querySelectorAll('h1, h2, h3, h4')].map((h) => Number(h.tagName[1]));
      let skips = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) skips++;
      const small = [...document.querySelectorAll('a[href], button')].filter((el) => {
        if (el.closest('dialog, .sr-only, [aria-hidden="true"]') || el.classList.contains('skip-link')) return false;
        if (!el.checkVisibility()) return false;
        const r = el.getBoundingClientRect();
        return r.width < 44 - 0.5 || r.height < 44 - 0.5;
      }).map((el) => (el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 24) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
      return { overflow: de.scrollWidth - window.innerWidth, h1: document.querySelectorAll('h1').length, skips, small, first: headings[0] };
    `);
    check(`${width}px: нет горизонтальной прокрутки`, m.overflow <= 0, `scrollWidth − innerWidth = ${m.overflow}`);
    if (width === 390 || width === 1440) {
      check(`${width}px: один H1, первый заголовок — H1, уровни без пропусков`, m.h1 === 1 && m.first === 1 && m.skips === 0, `H1: ${m.h1}, пропусков: ${m.skips}`);
    }
    const dotsOnly = m.small.every((s) => /^Направление \d из 9/.test(s));
    check(`${width}px: цели нажатия ≥ 44×44`, m.small.length === 0 || dotsOnly,
      m.small.length ? `меньше 44: ${m.small.length} (${dotsOnly ? 'только индикаторы карусели, см. README' : m.small.join('; ')}) ${m.small[0] || ''}` : 'все ≥ 44');
    if (width === 390 || width === 1440) {
      const c = await contrastAudit();
      check(`${width}px: фактический контраст текста (вычисленные стили)`, c.fails.length === 0, `текстовых элементов ${c.count}, минимум ${c.min}:1${c.fails.length ? '; ниже нормы: ' + c.fails.join(' | ') : ''}`);
    }
    collectConsole(`${width}px`);
  }

  // ---------- 2. Меню ----------
  console.log('\n[меню]');
  await open(1440, 900);
  let r = await rectOf('[data-menu-toggle]');
  await p.click(r.x, r.y);
  await sleep(450);
  let s = await J(`const d = document.getElementById('site-menu'); return { open: d.open, focusIn: d.contains(document.activeElement), lock: getComputedStyle(document.documentElement).overflow, expanded: document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded') };`);
  check('меню открывается, фокус внутри, aria-expanded', s.open && s.focusIn && s.expanded === 'true', JSON.stringify(s));
  check('блок прокрутки под меню', s.lock === 'hidden', `overflow корня: ${s.lock}`);
  const y0 = await p.eval('scrollY');
  await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 600, deltaX: 0, deltaY: 800 });
  await sleep(400);
  check('колесо мыши не прокручивает страницу под меню', (await p.eval('scrollY')) === y0, `scrollY ${y0} → ${await p.eval('scrollY')}`);
  let trapped = true;
  const visited = new Set();
  for (let i = 0; i < 10; i++) {
    await press('Tab');
    const st = await J(`const d = document.getElementById('site-menu'); return { inside: d.contains(document.activeElement), name: document.activeElement.textContent.trim().slice(0, 20) };`);
    trapped &&= st.inside;
    visited.add(st.name);
  }
  for (let i = 0; i < 10; i++) {
    await press('Tab', true);
    trapped &&= await p.eval(`document.getElementById('site-menu').contains(document.activeElement)`);
  }
  check('фокус-ловушка (Tab ×10, Shift+Tab ×10)', trapped, `элементов в цикле: ${visited.size}`);
  await press('Escape');
  await sleep(300);
  s = await J(`return { open: document.getElementById('site-menu').open, back: document.activeElement === document.querySelector('[data-menu-toggle]'), lock: getComputedStyle(document.documentElement).overflow };`);
  check('Esc закрывает меню, фокус возвращается на «Меню», прокрутка разблокирована', !s.open && s.back && s.lock !== 'hidden', JSON.stringify(s));
  await p.click(r.x, r.y);
  await sleep(450);
  r = await rectOf('#site-menu a[href="#niches"]');
  await p.click(r.x, r.y);
  await sleep(1600);
  s = await J(`const h = document.getElementById('niches-title'); const grid = document.querySelector('#niches .niches__grid');
    return { open: document.getElementById('site-menu').open, top: Math.round(h.getBoundingClientRect().top), content: Math.round(grid.getBoundingClientRect().top), header: document.querySelector('.site-header').getBoundingClientRect().bottom, vh: innerHeight, focus: document.activeElement === h, hash: location.hash };`);
  check('переход «Ниши» из меню: меню закрыто, раздел сразу под шапкой, заголовок не перекрыт, фокус на заголовке',
    !s.open && s.top >= s.header && s.top < s.vh / 2 && s.content >= s.header && s.content <= s.header + 48 && s.focus && s.hash === '#niches', JSON.stringify(s));
  for (const id of ['directions', 'process', 'contacts']) {
    await p.click(...Object.values(await rectOf('[data-menu-toggle]')).slice(0, 2));
    await sleep(400);
    r = await rectOf(`#site-menu a[href="#${id}"]`);
    await p.click(r.x, r.y);
    await sleep(1600);
    const t = await J(`return { top: Math.round(document.getElementById('${id}-title').getBoundingClientRect().top), header: document.querySelector('.site-header').getBoundingClientRect().bottom, end: Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2 };`);
    check(`переход «#${id}» из меню: заголовок под шапкой`, t.top >= t.header && (t.top <= t.header + 120 || t.end), `верх заголовка ${t.top}px, низ шапки ${t.header}px${t.end ? ' (конец страницы — ниже прокрутить нельзя)' : ''}`);
  }
  await p.click(...Object.values(await rectOf('[data-menu-toggle]')).slice(0, 2));
  await sleep(400);
  r = await rectOf('[data-menu-close]');
  await p.click(r.x, r.y);
  await sleep(300);
  s = await J(`return { open: document.getElementById('site-menu').open, back: document.activeElement === document.querySelector('[data-menu-toggle]') };`);
  check('кнопка «Закрыть» закрывает меню и возвращает фокус', !s.open && s.back, JSON.stringify(s));
  collectConsole('меню');

  // ---------- 3. Карусель ----------
  console.log('\n[карусель]');
  await open(1440, 900);
  await center('[data-carousel]');
  const car = (extra = '') => J(`const root = document.querySelector('[data-carousel]'); const cards = [...root.querySelectorAll('[data-card]')]; const i = Number(root.dataset.index);
    return { i, centerT: getComputedStyle(cards[i]).transform, sideT: getComputedStyle(cards[(i + 1) % 9]).transform, live: root.querySelector('[data-carousel-live]').textContent,
      hiddenFocusable: cards.filter((c, k) => k !== i).flatMap((c) => [...c.querySelectorAll('a, button')]).filter((a) => a.tabIndex !== -1).length,
      ariaHidden: cards.filter((c) => c.getAttribute('aria-hidden') === 'true').length, height: root.querySelector('.carousel__list').getBoundingClientRect().height ${extra} };`);
  s = await car();
  check('центральная карточка фронтально, соседняя повёрнута в глубину', s.centerT === 'none' && s.sideT.startsWith('matrix3d'), `центр: ${s.centerT}; сосед: ${s.sideT.slice(0, 40)}…`);
  check('высота сцены ~400 px', Math.abs(s.height - 400) <= 10, `${s.height}px`);
  check('неактивные карточки: aria-hidden и вне порядка Tab', s.ariaHidden === 8 && s.hiddenFocusable === 0, `aria-hidden: ${s.ariaHidden}, фокусируемых в скрытых: ${s.hiddenFocusable}`);
  r = await rectOf('[data-carousel-next]');
  await p.click(r.x, r.y);
  await sleep(750);
  s = await car();
  check('стрелка «вперёд»', s.i === 1 && /Направление 2 из 9/.test(s.live), `индекс ${s.i}, live: «${s.live}»`);
  r = await rectOf('[data-carousel-dots] .dot:nth-child(5)');
  await p.click(r.x, r.y);
  await sleep(700);
  s = await car(`, label: root.querySelectorAll('.dot')[4].getAttribute('aria-label'), current: root.querySelectorAll('.dot')[4].getAttribute('aria-current')`);
  check('индикатор «Направление 5 из 9»', s.i === 4 && s.label === 'Направление 5 из 9' && s.current === 'true', `индекс ${s.i}`);
  await p.eval(`document.querySelector('[data-carousel-next]').focus()`);
  const seq = [];
  for (const key of ['ArrowRight', 'Home', 'End', 'ArrowLeft']) {
    await press(key);
    await sleep(80);
    seq.push((await car()).i);
  }
  check('клавиатура: → Home End ←', seq.join(',') === '5,0,8,7', `индексы: ${seq.join(',')}`);
  await sleep(700);
  r = await J(`const c = document.querySelectorAll('[data-card]')[8].getBoundingClientRect(); return { x: c.right - 30, y: c.top + c.height / 2 };`);
  await p.click(r.x, r.y);
  await sleep(750);
  check('нажатие на боковую карточку делает её центральной', (await car()).i === 8);
  await p.eval(`const h = document.getElementById('directions-title'); h.tabIndex = -1; h.focus(); true`);
  const tabbed = [];
  for (let k = 0; k < 4; k++) {
    await press('Tab');
    tabbed.push(await J(`const a = document.activeElement; const card = a.closest('[data-card]'); return { label: (a.getAttribute('aria-label') || a.textContent.trim()).slice(0, 30), hiddenCard: card ? card.getAttribute('aria-hidden') === 'true' : false };`));
  }
  check('Tab: только ссылка центральной карточки, затем контролы', tabbed.every((t) => !t.hiddenCard) && /Подробнее/.test(tabbed[0].label), tabbed.map((t) => t.label).join(' → '));
  collectConsole('карусель 1440');

  await open(390, 844);
  await center('[data-carousel]');
  const before = (await car()).i;
  r = await rectOf('.carousel__list');
  const swipe = async (x1, y1, x2, y2) => {
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let k = 1; k <= 8; k++) {
      await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * k) / 8, y: y1 + ((y2 - y1) * k) / 8 }] });
      await sleep(16);
    }
    await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(750);
  };
  await swipe(320, r.y, 80, r.y + 6);
  const afterLeft = (await car()).i;
  await swipe(80, r.y, 320, r.y);
  const afterRight = (await car()).i;
  const sy = await p.eval('scrollY');
  await swipe(200, r.y + 100, 205, r.y - 120);
  const afterVertical = await J(`return { i: Number(document.querySelector('[data-carousel]').dataset.index), y: scrollY };`);
  check('свайп влево/вправо на 390 px', afterLeft === before + 1 && afterRight === before, `${before} → ${afterLeft} → ${afterRight}`);
  check('вертикальный жест прокручивает страницу, а не карусель', afterVertical.i === before && afterVertical.y !== sy, `индекс ${afterVertical.i}, scrollY ${sy} → ${afterVertical.y}`);
  collectConsole('карусель 390');

  // ---------- 4. Бегущая строка ----------
  console.log('\n[бегущая строка]');
  await open(1440, 900);
  await center('[data-marquee]');
  const mq = () => J(`const root = document.querySelector('[data-marquee]'); const t = root.querySelector('[data-marquee-track]'); const cs = getComputedStyle(t);
    const b = root.querySelector('[data-marquee-toggle]');
    return { name: cs.animationName, state: cs.animationPlayState, x: new DOMMatrix(cs.transform).m41, pressed: b.getAttribute('aria-pressed'), btn: b.checkVisibility(),
      clones: root.querySelectorAll('.cms__list[aria-hidden="true"]').length, cloneShown: root.querySelector('.is-clone')?.checkVisibility() ?? false, lists: root.querySelectorAll('.cms__list').length,
      duration: cs.animationDuration, h: root.querySelector('.cms__viewport').getBoundingClientRect().height };`);
  let a = await mq();
  await sleep(500);
  let b = await mq();
  check('строка движется непрерывно (CSS-анимация, дубль aria-hidden)', a.name === 'cms-marquee' && b.x < a.x && a.clones === 1, `сдвиг за 0.5 с: ${(a.x - b.x).toFixed(1)} px, длительность цикла ${a.duration}, дублей aria-hidden: ${a.clones}`);
  await p.eval(`document.querySelector('[data-marquee-toggle]').click()`);
  await sleep(150); // пауза применяется со следующего кадра
  a = await mq();
  await sleep(600);
  b = await mq();
  check('пауза кнопкой (aria-pressed=true, движение стоит)', a.pressed === 'true' && a.state === 'paused' && a.x === b.x, `state ${a.state}, сдвиг ${(a.x - b.x).toFixed(2)} px`);
  await p.eval(`document.querySelector('[data-marquee-toggle]').click()`);
  await setHidden(true);
  a = await mq();
  await setHidden(false);
  b = await mq();
  check('visibilitychange: скрытая вкладка → пауза, возврат → движение', a.state === 'paused' && b.state === 'running' && b.pressed === 'false', `hidden: ${a.state}, visible: ${b.state}`);
  await p.eval('window.scrollTo(0, 0)');
  await sleep(400);
  check('вне экрана строка на паузе', (await mq()).state === 'paused');
  collectConsole('строка');
  await open(1440, 900, { reduced: true });
  await center('[data-marquee]');
  a = await mq();
  await sleep(500);
  b = await mq();
  check('reduced-motion: строка стоит, дубль скрыт, кнопки паузы нет, список переносится', a.name === 'none' && a.x === b.x && !a.cloneShown && !a.btn,
    `animation: ${a.name}, дубль виден: ${a.cloneShown}, кнопка видна: ${a.btn}, высота полосы ${Math.round(a.h)} px`);
  collectConsole('строка reduced');

  // ---------- 5. Ниши ----------
  console.log('\n[ниши]');
  await open(1440, 900);
  await center('[data-niches]');
  await p.eval(`window.__nicheLog = []; const t0 = performance.now(); new MutationObserver(() => __nicheLog.push(Math.round(performance.now() - t0))).observe(document.querySelector('[data-niches]'), { attributes: true, attributeFilter: ['data-index'] }); true`);
  await sleep(12700);
  const log = await J('return window.__nicheLog');
  const interval = log.length >= 2 ? log[1] - log[0] : NaN;
  check('автосмена каждые 6 с', log.length === 2 && Math.abs(interval - 6000) < 300 && Math.abs(log[0] - 6000) < 500, `смены на ${log.join(', ')} мс; интервал ${interval} мс`);
  const ni = () => J(`const root = document.querySelector('[data-niches]'); return { i: Number(root.dataset.index), auto: root.dataset.autoplay, pressed: root.querySelector('[data-niche-toggle]').getAttribute('aria-pressed'), toggleShown: root.querySelector('[data-niche-toggle]').checkVisibility(), active: [...root.querySelectorAll('[data-niche]')].filter((s) => s.checkVisibility({ visibilityProperty: true })).length };`);
  const holds = async (label, setup, teardown) => {
    await setup();
    await sleep(200);
    const x = await ni();
    await sleep(6600);
    const y = await ni();
    check(`пауза автосмены: ${label}`, x.auto === 'off' && x.i === y.i, `autoplay=${x.auto}, индекс ${x.i} → ${y.i} за 6.6 с`);
    await teardown();
    await sleep(200);
  };
  r = await rectOf('.tablet');
  await holds('наведение', () => p.mouse(r.x, r.y), () => p.mouse(5, 890));
  check('после ухода курсора автосмена продолжается', (await ni()).auto === 'on');
  await holds('фокус внутри', () => p.eval(`document.querySelector('[data-niche-next]').focus()`), () => p.eval(`document.activeElement.blur()`));
  await holds('блок ушёл с экрана', () => p.eval('window.scrollTo(0, 0)'), () => center('[data-niches]'));
  await holds('кнопка паузы', () => p.eval(`document.querySelector('[data-niche-toggle]').click()`), () => p.eval(`document.querySelector('[data-niche-toggle]').click()`));
  await holds('скрытая вкладка', () => setHidden(true), () => setHidden(false));
  s = await ni();
  check('кнопка паузы: aria-pressed возвращается в false, автосмена on', s.pressed === 'false' && s.auto === 'on', JSON.stringify(s));
  const i0 = s.i;
  await p.eval(`document.querySelector('[data-niche-next]').click()`);
  const n1 = (await ni()).i;
  await p.eval(`document.querySelector('[data-niche-prev]').click()`);
  const n2 = (await ni()).i;
  await p.eval(`document.querySelectorAll('[data-niche-dots] .dot')[3].click()`);
  await sleep(700);
  s = await ni();
  check('стрелки и индикаторы ниш; на экране одна ниша', n1 === (i0 + 1) % 6 && n2 === i0 && s.i === 3 && s.active === 1, `${i0} → ${n1} → ${n2} → ${s.i}, видимых слайдов: ${s.active}`);
  collectConsole('ниши');
  await open(1440, 900, { reduced: true });
  await center('[data-niches]');
  a = await ni();
  await sleep(6800);
  b = await ni();
  await p.eval(`document.querySelector('[data-niche-next]').click()`);
  const manual = await ni();
  check('reduced-motion: без автосмены, ручное переключение работает', a.auto === 'off' && a.i === b.i && manual.i === b.i + 1 && !a.toggleShown, `${a.i} → ${b.i} за 6.8 с; вручную → ${manual.i}; кнопка паузы видна: ${a.toggleShown}`);
  collectConsole('ниши reduced');

  // ---------- 6. Этапы ----------
  console.log('\n[этапы]');
  const pr = () => J(`const root = document.querySelector('[data-process]'); const rail = root.querySelector('.steps__rail').getBoundingClientRect(); const m = new DOMMatrix(getComputedStyle(root.querySelector('[data-process-dot]')).transform);
    const steps = [...root.querySelectorAll('[data-step]')];
    const vertical = rail.height > rail.width;
    const centers = steps.map((s) => { const r = s.getBoundingClientRect(); return vertical ? r.top + r.height / 2 - rail.top : r.left + r.width / 2 - rail.left; });
    const glows = steps.map((s) => Number(getComputedStyle(s).getPropertyValue('--glow')));
    const toggle = root.querySelector('[data-process-toggle]');
    return { t: performance.now(), x: m.m41, y: m.m42, len: vertical ? rail.height : rail.width, vertical, centers, glows, running: root.dataset.running,
      pressed: [...root.querySelectorAll('.step__num')].map((b) => b.getAttribute('aria-pressed')), toggle: toggle.getAttribute('aria-pressed'), toggleShown: toggle.checkVisibility() };`);
  await open(1440, 900);
  await center('[data-process]');
  a = await pr();
  await sleep(2000);
  b = await pr();
  if (b.x < a.x) { a = b; await sleep(2000); b = await pr(); }
  const period = (a.len / ((b.x - a.x) / (b.t - a.t))) / 1000;
  check('точка движется по горизонтали, полный проход ~15 с', !a.vertical && Math.abs(period - 15) <= 1, `${(b.x - a.x).toFixed(1)} px за ${((b.t - a.t) / 1000).toFixed(2)} с при длине ${a.len.toFixed(0)} px → проход ${period.toFixed(2)} с`);
  let follow = 0;
  let samples = 0;
  for (let k = 0; k < 8; k++) {
    const q = await pr();
    const nearest = q.centers.reduce((best, c, idx) => (Math.abs(c - q.x) < Math.abs(q.centers[best] - q.x) ? idx : best), 0);
    const maxIdx = q.glows.indexOf(Math.max(...q.glows));
    if (Math.max(...q.glows) > 0.05) { samples++; if (maxIdx === nearest) follow++; }
    await sleep(700);
  }
  check('подсветка следует за точкой (ярче всего — карточка под точкой)', samples > 0 && follow === samples, `совпадений ${follow} из ${samples} замеров`);
  await p.eval(`document.querySelector('[data-process-toggle]').click()`);
  a = await pr();
  await sleep(1000);
  b = await pr();
  check('пауза этапов: точка стоит, aria-pressed=true', a.x === b.x && a.toggle === 'true' && a.running === 'false', `сдвиг ${(b.x - a.x).toFixed(2)} px`);
  await p.eval(`document.querySelectorAll('.step__num')[2].click()`);
  await sleep(100);
  a = await pr();
  check('ручной выбор этапа 03: точка над этапом, подсветка 1, aria-pressed', Math.abs(a.x - a.centers[2]) < 2 && a.glows[2] > 0.99 && a.pressed[2] === 'true', `точка ${a.x.toFixed(1)} / центр ${a.centers[2].toFixed(1)}, glow ${a.glows[2]}`);
  await p.eval(`document.querySelector('[data-process-toggle]').click()`);
  await sleep(600);
  a = await pr();
  await setHidden(true);
  await sleep(100);
  const h1 = await pr();
  await sleep(2000);
  const h2 = await pr();
  await setHidden(false);
  await sleep(300);
  const h3 = await pr();
  const speed = a.len / 15000;
  check('скрытая вкладка: rAF стоит, после возврата время не прыгает', h1.running === 'false' && h1.x === h2.x && h3.x - h2.x < speed * 800 && h3.x > h2.x,
    `за 2 с скрытой вкладки: ${(h2.x - h1.x).toFixed(1)} px; после возврата за 0.3 с: ${(h3.x - h2.x).toFixed(1)} px (прыжок дал бы ≥ ${(speed * 2000).toFixed(0)} px)`);
  collectConsole('этапы 1440');

  await open(390, 844);
  await center('[data-process]');
  a = await pr();
  await sleep(1200);
  b = await pr();
  check('390 px: карточки вертикально, точка движется по линии слева', a.vertical && b.y > a.y && a.x === b.x, `линия ${a.len.toFixed(0)} px по вертикали; сдвиг точки ${(b.y - a.y).toFixed(1)} px за 1.2 с`);
  collectConsole('этапы 390');

  await open(1440, 900, { reduced: true });
  await center('[data-process]');
  a = await pr();
  await sleep(1500);
  b = await pr();
  await p.eval(`document.querySelectorAll('.step__num')[3].click()`);
  await sleep(100);
  const sel = await pr();
  check('reduced-motion: точка стоит над этапом 01, ручной выбор работает', a.x === b.x && Math.abs(a.x - a.centers[0]) < 2 && Math.abs(sel.x - sel.centers[3]) < 2 && !a.toggleShown,
    `сдвиг за 1.5 с: ${(b.x - a.x).toFixed(2)} px; после выбора 04: ${sel.x.toFixed(1)} / ${sel.centers[3].toFixed(1)}`);
  collectConsole('этапы reduced');

  // ---------- 7. Ноутбук ----------
  console.log('\n[ноутбук]');
  const lp = () => J(`const d = document.querySelector('.laptop'); const cs = getComputedStyle(d); const scr = d.querySelector('.laptop__screen'); const sr = scr.getBoundingClientRect(); const dash = d.querySelector('.dash').getBoundingClientRect();
    const texts = [...scr.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const minFont = Math.min(...texts.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    const badge = [...scr.querySelectorAll('*')].find((el) => el.textContent.trim() === 'Демонстрационные данные'); const br = badge.getBoundingClientRect();
    return { rx: cs.getPropertyValue('--rx').trim(), ry: cs.getPropertyValue('--ry').trim(), transform: cs.transform.slice(0, 30), width: d.offsetWidth, minFont,
      badge: badge.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && br.top >= sr.top && br.bottom <= sr.bottom, badgeFont: getComputedStyle(badge).fontSize, fits: dash.bottom <= sr.bottom + 1 };`);
  for (const [w, h, minAllowed] of [[1440, 900, 11], [390, 844, 10]]) {
    await open(w, h);
    await p.eval(`const s = document.querySelector('[data-laptop]'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - innerHeight * 0.85)`);
    await sleep(300);
    a = await lp();
    await center('[data-laptop]');
    b = await lp();
    check(`${w}px: ракурс ноутбука меняется при прокрутке`, a.rx !== b.rx && Math.abs(parseFloat(a.rx) - parseFloat(b.rx)) > 2, `rotateX ${a.rx} → ${b.rx}, rotateY ${a.ry} → ${b.ry}`);
    check(`${w}px: экран читаем — кегль ≥ ${minAllowed} px, содержимое в экране, «Демонстрационные данные» видно`, b.minFont >= minAllowed && b.fits && b.badge, `мин. кегль ${b.minFont}px, плашка ${b.badgeFont}, ширина ноутбука ${b.width}px`);
    if (w === 1440) check('ширина ноутбука ≤ 620 px', b.width <= 620, `${b.width}px`);
    const sec = await J(`return { h: Math.round(document.getElementById('overview').getBoundingClientRect().height), vh: innerHeight };`);
    check(`${w}px: раздел с ноутбуком не длиннее ~1 экрана`, sec.h <= sec.vh * 1.2, `высота раздела ${sec.h}px при экране ${sec.vh}px`);
    collectConsole(`ноутбук ${w}`);
  }
  await open(1440, 900, { reduced: true });
  await p.eval(`const s = document.querySelector('[data-laptop]'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - innerHeight * 0.85)`);
  await sleep(300);
  a = await lp();
  await center('[data-laptop]');
  b = await lp();
  check('reduced-motion: ракурс ноутбука не меняется', a.rx === b.rx, `rotateX ${a.rx} → ${b.rx}`);
  collectConsole('ноутбук reduced');

  // ---------- 8. Подробнее → контакты ----------
  await open(1440, 900);
  await center('[data-carousel]');
  r = await rectOf('[data-card].is-current .dcard__more');
  await p.click(r.x, r.y);
  await sleep(1400);
  s = await J(`const note = document.querySelector('[data-topic-note]'); return { shown: !note.hidden, text: note.textContent.trim(), mail: document.querySelector('[data-mail]').getAttribute('href'), top: Math.round(document.getElementById('contacts-title').getBoundingClientRect().top), hash: location.hash };`);
  check('«Подробнее» ведёт к контактам и подставляет тему', s.shown && /Разработка сайтов/.test(s.text) && s.mail.includes('subject=') && s.hash === '#contacts' && s.top >= 64, JSON.stringify(s));
  collectConsole('подробнее');

  // ---------- 9. Без JS ----------
  console.log('\n[без JS]');
  await p.send('Emulation.setScriptExecutionDisabled', { value: true });
  await open(1440, 900);
  await sleep(1800); // входная CSS-анимация первого экрана (задержка 0.55 с + 1 с) должна закончиться
  s = await J(`
    const els = [...document.querySelectorAll('main *, header *, footer *')].filter((el) => !el.closest('.sr-only, svg, [hidden]') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const hidden = els.filter((el) => !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !el.closest('.menu-toggle')).map((el) => el.textContent.trim().slice(0, 30));
    const text = document.body.innerText;
    const must = ['ВЫДЕЛЯТЬСЯ.', 'Демонстрационные данные', 'ИИ в работе с клиентами', 'Самописные CMS', 'SaaS и онлайн-сервисы', 'Контроль качества', 'ДИЗАЙН СО СМЫСЛОМ.', 'yakobsonv@icloud.com', 'Наверх'];
    return { total: els.length, hidden, missing: must.filter((m) => !text.includes(m)), js: document.documentElement.classList.contains('js') };`);
  check('без JS весь текст виден (кроме кнопок управления, которые без JS не работают и скрыты атрибутом hidden)', !s.js && s.hidden.length === 0 && s.missing.length === 0, `текстовых элементов ${s.total}, скрытых ${s.hidden.length}${s.hidden.length ? ': ' + s.hidden.join(' | ') : ''}; нет в тексте: ${s.missing.join(', ') || '—'}`);
  await scrollThrough();
  check('без JS нет горизонтальной прокрутки (1440)', (await p.eval('document.documentElement.scrollWidth - innerWidth')) <= 0);
  await p.viewport(390, 844, { mobile: true });
  await p.goto(BASE);
  check('без JS нет горизонтальной прокрутки (390)', (await p.eval('document.documentElement.scrollWidth - innerWidth')) <= 0);
  await p.send('Emulation.setScriptExecutionDisabled', { value: false });
  collectConsole('без JS');

  // ---------- 10. Консоль ----------
  console.log('\n[консоль]');
  check('консоль чистая (ошибки и предупреждения во всех прогонах)', consoleLog.length === 0, consoleLog.length ? consoleLog.join('\n   ') : '0 сообщений');
  await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeScript.identifier });
}

// ---------- Переключатель темы ----------
async function themeChecks() {
  prefix = '[переключатель] ';
  consoleLog = [];
  console.log('\n========== Переключатель темы ==========');
  await open(1440, 900);
  await p.eval(`localStorage.removeItem('${THEME_KEY}'); true`);
  await p.goto(BASE);
  const state = () => J(`const b = document.querySelector('[data-theme-toggle]'); const r = b.getBoundingClientRect();
    return { theme: document.documentElement.dataset.theme, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'),
      meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'), stored: localStorage.getItem('${THEME_KEY}'),
      bg: getComputedStyle(document.documentElement).backgroundColor, w: Math.round(r.width), h: Math.round(r.height), visible: b.checkVisibility(),
      nextToMenu: b.nextElementSibling === document.querySelector('[data-menu-toggle]') };`);
  let t = await state();
  check('по умолчанию светлая; кнопка «Тёмная тема», aria-pressed=false, 44×44, рядом с «Меню»',
    t.theme === 'light' && t.pressed === 'false' && t.label === 'Тёмная тема' && t.meta === '#f5f5f0' && t.visible && t.w >= 44 && t.h >= 44 && t.nextToMenu, JSON.stringify(t));
  const r = await rectOf('[data-theme-toggle]');
  await p.click(r.x, r.y);
  await sleep(100);
  t = await state();
  check('клик: тёмная тема, aria-pressed=true, сохранено, theme-color обновлён', t.theme === 'dark' && t.pressed === 'true' && t.stored === 'dark' && t.meta === '#0e0d0b' && t.bg === 'rgb(14, 13, 11)', JSON.stringify(t));
  await p.eval(`document.querySelector('[data-theme-toggle]').focus()`);
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(100);
  const afterEnter = await state();
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await sleep(100);
  const afterSpace = await state();
  check('клавиатура: Enter → светлая, Space → тёмная', afterEnter.theme === 'light' && afterEnter.pressed === 'false' && afterEnter.stored === 'light' && afterSpace.theme === 'dark' && afterSpace.stored === 'dark',
    `Enter: ${afterEnter.theme}/${afterEnter.pressed}, Space: ${afterSpace.theme}/${afterSpace.pressed}`);

  // Без вспышки: тема выставлена до разбора <body>, и уже первый кадр — в цвете темы
  const probe = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__themeProbe = {};
    new MutationObserver(() => {
      const el = document.documentElement;
      if (el && el.hasAttribute('data-theme') && !__themeProbe.set) {
        __themeProbe.set = true; __themeProbe.bodyExisted = !!document.body; __themeProbe.value = el.getAttribute('data-theme');
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
    requestAnimationFrame(() => {
      __themeProbe.firstFrameTheme = document.documentElement.getAttribute('data-theme');
      __themeProbe.firstFrameBg = getComputedStyle(document.documentElement).backgroundColor;
    });` });
  for (const [theme, bg] of [['dark', 'rgb(14, 13, 11)'], ['light', 'rgb(245, 245, 240)']]) {
    await p.eval(`localStorage.setItem('${THEME_KEY}', '${theme}'); true`);
    await p.goto(BASE);
    const pr = await J('return window.__themeProbe');
    const st = await state();
    check(`перезагрузка с сохранённой «${theme}»: тема до <body>, первый кадр в цвете темы`,
      pr.set && pr.bodyExisted === false && pr.value === theme && pr.firstFrameTheme === theme && pr.firstFrameBg === bg && st.pressed === String(theme === 'dark'),
      `атрибут поставлен до <body>: ${pr.bodyExisted === false}; первый кадр: ${pr.firstFrameTheme}, фон ${pr.firstFrameBg}; aria-pressed=${st.pressed}`);
  }
  await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: probe.identifier });
  await p.eval(`localStorage.setItem('${THEME_KEY}', 'garbage'); true`);
  await p.goto(BASE);
  check('неизвестное значение в хранилище → светлая', (await state()).theme === 'light');
  await p.eval(`localStorage.removeItem('${THEME_KEY}'); true`);
  collectConsole('переключатель');
  check('консоль чистая', consoleLog.length === 0, consoleLog.join(' | ') || '0 сообщений');
}

try {
  for (const theme of THEMES) await suite(theme);
  await themeChecks();
} catch (error) {
  check('сценарий проверки выполнился без исключений', false, error.stack);
} finally {
  await browser.close();
  server?.close();
}

const failed = results.filter((x) => !x.ok);
console.log(`\nИтог: ${results.length - failed.length} из ${results.length} проверок пройдено`);
if (failed.length) {
  for (const f of failed) console.log(` ✗ ${f.name}`);
  process.exit(1);
}
