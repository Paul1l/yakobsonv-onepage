// Скриншоты страницы: полная страница и ключевые разделы на 1440, 1024, 768, 390 + открытое меню.
// Запуск: node scripts/screenshots.mjs <папка> [--theme=light|dark|both] [--widths=1440,768,390]
// Сайт должен отдаваться по BASE_URL (по умолчанию http://127.0.0.1:8050/). Файлы: <тема>-<ширина>-<раздел>.png
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launch, sleep } from './lib/cdp.mjs';

const out = resolve(process.argv[2] || 'screenshots');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8050/';
await mkdir(out, { recursive: true });

const browser = await launch({ port: Number(process.env.CDP_PORT) || 9682 });
const p = browser.page;
const arg = (name, def) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${def}`).split('=')[1];
const themes = arg('theme', 'both') === 'both' ? ['light', 'dark'] : [arg('theme', 'both')];
const SIZES = { 1440: 900, 1024: 768, 768: 1024, 390: 844 };
const widths = arg('widths', '1440,1024,768,390').split(',').map(Number);
const sections = ['top', 'overview', 'check', 'directions', 'cms', 'niches', 'proof', 'process', 'about', 'contacts'];

try {
  for (const theme of themes) {
  const themeScript = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('yakobson-onepage-theme', '${theme}') } catch (e) {}` });
  for (const w of widths) {
    const h = SIZES[w] || 900;
    await p.viewport(w, h, { mobile: w <= 768 });
    await p.goto(BASE);
    const height = await p.eval('document.documentElement.scrollHeight');
    for (let y = 0; y <= height; y += 300) {
      await p.eval(`window.scrollTo(0, ${y})`);
      await sleep(50);
    }
    await p.eval('window.scrollTo(0, 0)');
    await sleep(1200);
    await p.screenshot(join(out, `${theme}-${w}-full.png`), { fullPage: true });
    for (const id of sections) {
      await p.eval(`document.getElementById('${id}').scrollIntoView({ block: '${id === 'top' ? 'start' : 'center'}', behavior: 'instant' })`);
      await sleep(1300);
      await p.screenshot(join(out, `${theme}-${w}-${id}.png`));
    }
    await p.eval(`window.scrollTo(0, 0); document.querySelector('[data-menu-toggle]').click(); true`);
    await sleep(700);
    await p.screenshot(join(out, `${theme}-${w}-menu.png`));
    console.log(`${theme} ${w}: готово`);
  }
  await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeScript.identifier });
  }
} finally {
  await browser.close();
}
console.log(`Скриншоты: ${out}`);
