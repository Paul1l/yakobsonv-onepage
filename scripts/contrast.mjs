// Контраст фактических сочетаний палитры (WCAG 2.x). Запуск: node scripts/contrast.mjs
// Полупрозрачные слои пересчитаны в непрозрачные цвета поверх реального фона (mix).

const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
/** Наложение цвета fg с прозрачностью a поверх bg. */
const mix = (fg, a, bg) => toHex(hex(fg).map((c, i) => c * a + hex(bg)[i] * (1 - a)));
const lum = (h) => {
  const [r, g, b] = hex(h).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Значения синхронизированы с :root в styles.css
const C = {
  bg: '#111213',
  card: '#1a1c1e',
  screen: '#0c0e0f',
  text: '#eef1ef',
  muted: '#9eaca5',
  mint: '#8fd8bb',
  violet: '#b9a9f2',
  mintInk: '#0d1713',
  control: '#66736d',
  tBg: '#e3eae5',
  tSurface: '#f2f6f3',
  tText: '#17211c',
  tMuted: '#45554d',
  tAccent: '#2b6a52',
  tChip: '#d3ded7',
};
const violetBadge = mix('#b9a9f2', 0.14, C.screen);
const mintTint = mix('#8fd8bb', 0.08, C.bg);

const pairs = [
  ['Основной текст / фон', C.text, C.bg, 4.5],
  ['Второстепенный (серо-зелёный) / фон', C.muted, C.bg, 4.5],
  ['Второстепенный / карточка', C.muted, C.card, 4.5],
  ['Мятный акцент (текст) / фон', C.mint, C.bg, 4.5],
  ['Фиолетовый акцент (текст) / карточка', C.violet, C.card, 4.5],
  ['Текст кнопки / мятная кнопка', C.mintInk, C.mint, 4.5],
  ['Основной текст / экран ноутбука', C.text, C.screen, 4.5],
  ['Второстепенный / экран ноутбука', C.muted, C.screen, 4.5],
  ['Мятный (рост) / экран ноутбука', C.mint, C.screen, 4.5],
  ['«Демонстрационные данные» / плашка', C.violet, violetBadge, 4.5],
  ['Мятный текст / мятная подложка темы', C.mint, mintTint, 4.5],
  ['Рамка контролов / фон', C.control, C.bg, 3],
  ['Рамка контролов / карточка', C.control, C.card, 3],
  ['Кольцо фокуса (мятный) / фон', C.mint, C.bg, 3],
  ['Планшет: текст / экран', C.tText, C.tBg, 4.5],
  ['Планшет: текст / карточка', C.tText, C.tSurface, 4.5],
  ['Планшет: второстепенный / экран', C.tMuted, C.tBg, 4.5],
  ['Планшет: второстепенный / карточка', C.tMuted, C.tSurface, 4.5],
  ['Планшет: акцент (номер ниши) / карточка', C.tAccent, C.tSurface, 4.5],
  ['Планшет: задачи / плашка', C.tText, C.tChip, 4.5],
];

let failed = 0;
const rows = pairs.map(([name, fg, bg, min]) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  return `| ${name} | ${fg} на ${bg} | ${r.toFixed(2)}:1 | ≥ ${min} | ${ok ? 'да' : 'НЕТ'} |`;
});
console.log('| Сочетание | Цвета | Контраст | Норма | Ок |\n|---|---|---|---|---|');
console.log(rows.join('\n'));
if (failed) {
  console.error(`contrast: не проходят ${failed}`);
  process.exit(1);
}
