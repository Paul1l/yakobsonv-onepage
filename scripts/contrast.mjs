// Контраст фактических сочетаний палитры (WCAG 2.x) для ОБЕИХ тем.
// Значения читаются прямо из блоков тем в styles.css — таблица не может разойтись с CSS.
// Полупрозрачные цвета накладываются на реальную подложку. Запуск: node scripts/contrast.mjs [--md]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8');

function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error(`нет блока ${selectorStart}`);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('\n}', i));
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const themes = {
  'Светлая': block(":root,\n:root[data-theme='light']"),
  'Тёмная': block(":root[data-theme='dark']"),
};

const parse = (value) => {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)).concat(1);
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    return [r, g, b, a];
  }
  throw new Error(`не цвет: ${value}`);
};
const over = (fg, bg) => fg.slice(0, 3).map((c, k) => c * fg[3] + bg[k] * (1 - fg[3])).concat(1);
const lum = ([r, g, b]) => {
  const ch = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const hex = (c) => `#${c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

/** Цвет токена; полупрозрачный — поверх цепочки подложек (последняя — непрозрачная). */
function resolve(vars, names) {
  const layers = names.map((n) => parse(vars[n] ?? (() => { throw new Error(`нет токена --${n}`); })()));
  let color = layers[layers.length - 1];
  for (let k = layers.length - 2; k >= 0; k--) color = over(layers[k], color);
  return color;
}

// [подпись, текст/рамка (цепочка), фон (цепочка), норма]
const PAIRS = [
  ['Основной текст / фон', ['text'], ['bg'], 4.5],
  ['Мягкий текст / фон', ['text-soft'], ['bg'], 4.5],
  ['Второстепенный / фон', ['muted'], ['bg'], 4.5],
  ['Второстепенный / карточка', ['muted'], ['surface'], 4.5],
  ['Второстепенный / мягкий фон', ['muted'], ['surface-soft'], 4.5],
  ['Акцент (текст) / фон', ['accent'], ['bg'], 4.5],
  ['Акцент (текст) / карточка', ['accent'], ['surface'], 4.5],
  ['Акцент / оттенок акцента (плашка темы)', ['accent'], ['accent-tint', 'surface'], 4.5],
  ['Текст / оттенок акцента (наведение)', ['text'], ['accent-tint', 'bg'], 4.5],
  ['Текст основной кнопки / кнопка', ['btn-text'], ['btn-bg'], 4.5],
  ['Текст основной кнопки / наведение', ['btn-text'], ['btn-bg-hover'], 4.5],
  ['Текст / полупрозрачная шапка', ['text'], ['header-bg', 'bg'], 4.5],
  ['Экран ноутбука: текст', ['screen-text'], ['screen-bg'], 4.5],
  ['Экран ноутбука: второстепенный / плитка', ['screen-muted'], ['screen-panel-a', 'screen-bg'], 4.5],
  ['Экран ноутбука: рост / плитка', ['screen-positive'], ['screen-panel-a', 'screen-bg'], 4.5],
  ['Экран ноутбука: рост / выделенная плитка', ['screen-positive'], ['screen-feature', 'screen-bg'], 4.5],
  ['«Демонстрационные данные» / плашка', ['screen-badge-text'], ['screen-badge-bg', 'screen-bg'], 4.5],
  ['Планшет: текст / экран', ['t-text'], ['t-bg'], 4.5],
  ['Планшет: текст / карточка', ['t-text'], ['t-surface'], 4.5],
  ['Планшет: второстепенный / карточка', ['t-muted'], ['t-surface'], 4.5],
  ['Планшет: номер ниши / карточка', ['t-accent'], ['t-surface'], 4.5],
  ['Планшет: задачи / плашка', ['t-text'], ['t-chip'], 4.5],
  ['Рамка контролов / фон', ['control'], ['bg'], 3],
  ['Рамка контролов / карточка', ['control'], ['surface'], 3],
  ['Неактивный индикатор / фон', ['dot-off'], ['bg'], 3],
  ['Кольцо фокуса (акцент) / фон', ['accent'], ['bg'], 3],
  ['Кольцо фокуса (акцент) / карточка', ['accent'], ['surface'], 3],
];

const md = process.argv.includes('--md');
let failed = 0;
for (const [theme, vars] of Object.entries(themes)) {
  console.log(md ? `\n**${theme} тема**\n\n| Сочетание | Цвета | Контраст | Норма |\n|---|---|---|---|` : `\n${theme} тема`);
  for (const [name, fgNames, bgNames, min] of PAIRS) {
    const bg = resolve(vars, bgNames);
    const fg = resolve(vars, [...fgNames, ...bgNames]);
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    const line = md
      ? `| ${name} | ${hex(fg)} на ${hex(bg)} | ${r.toFixed(2)}:1${ok ? '' : ' ✗'} | ≥ ${min} |`
      : ` ${ok ? '✓' : '✗'} ${name}: ${hex(fg)} на ${hex(bg)} — ${r.toFixed(2)}:1 (≥ ${min})`;
    console.log(line);
  }
}
if (failed) {
  console.error(`\ncontrast: не проходят ${failed}`);
  process.exit(1);
}
console.log(`\ncontrast: все ${PAIRS.length * 2} пар проходят`);
