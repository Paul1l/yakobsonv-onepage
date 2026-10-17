// Скриншоты страницы: полная страница и ключевые разделы на 1440, 1024, 768, 390 + открытое меню.
// Запуск: node scripts/screenshots.mjs <папка>   (сайт должен отдаваться по BASE_URL, по умолчанию http://127.0.0.1:8050/)
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launch, sleep } from './lib/cdp.mjs';

const out = resolve(process.argv[2] || 'screenshots');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8050/';
await mkdir(out, { recursive: true });

const browser = await launch({ port: Number(process.env.CDP_PORT) || 9682 });
const p = browser.page;
const sections = ['top', 'overview', 'directions', 'cms', 'niches', 'process', 'about', 'contacts'];

try {
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await p.viewport(w, h, { mobile: w <= 768 });
    await p.goto(BASE);
    const height = await p.eval('document.documentElement.scrollHeight');
    for (let y = 0; y <= height; y += 300) {
      await p.eval(`window.scrollTo(0, ${y})`);
      await sleep(50);
    }
    await p.eval('window.scrollTo(0, 0)');
    await sleep(1200);
    await p.screenshot(join(out, `${w}-full.png`), { fullPage: true });
    for (const id of sections) {
      await p.eval(`document.getElementById('${id}').scrollIntoView({ block: '${id === 'top' ? 'start' : 'center'}', behavior: 'instant' })`);
      await sleep(1300);
      await p.screenshot(join(out, `${w}-${id}.png`));
    }
    await p.eval(`window.scrollTo(0, 0); document.querySelector('[data-menu-toggle]').click(); true`);
    await sleep(700);
    await p.screenshot(join(out, `${w}-menu.png`));
    console.log(`${w}: готово`);
  }
} finally {
  await browser.close();
}
console.log(`Скриншоты: ${out}`);
