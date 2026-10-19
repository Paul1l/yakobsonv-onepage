// Точка входа. Каждый блок инициализируется отдельно: сбой одного не ломает остальные,
// а неинициализированный блок остаётся в статичном виде со всем текстом.
import { initTheme } from './theme.js';
import { initReveal } from './reveal.js';
import { initMenu } from './menu.js';
import { initLaptop } from './laptop.js';
import { initDashboard } from './dashboard.js';
import { initCarousel } from './carousel.js';
import { initMarquee } from './marquee.js';
import { initNiches } from './niches.js';
import { initProcess } from './process.js';

document.documentElement.classList.add('js');

const modules = { initTheme, initMenu, initLaptop, initDashboard, initCarousel, initMarquee, initNiches, initProcess, initReveal };

for (const [name, init] of Object.entries(modules)) {
  try {
    init();
  } catch (error) {
    console.error(`[onepage] ${name}:`, error);
  }
}
