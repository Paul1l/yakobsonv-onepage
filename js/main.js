// Точка входа. Каждый блок инициализируется отдельно: сбой одного не ломает остальные,
// а неинициализированный блок остаётся в статичном виде со всем текстом.
import { initReveal } from './reveal.js';
import { initMenu } from './menu.js';
import { initLaptop } from './laptop.js';
import { initCarousel } from './carousel.js';
import { initMarquee } from './marquee.js';
import { initNiches } from './niches.js';
import { initProcess } from './process.js';
import { initTopics } from './contacts.js';

document.documentElement.classList.add('js');

const modules = { initMenu, initLaptop, initCarousel, initMarquee, initNiches, initProcess, initTopics, initReveal };

for (const [name, init] of Object.entries(modules)) {
  try {
    init();
  } catch (error) {
    console.error(`[onepage] ${name}:`, error);
  }
}
