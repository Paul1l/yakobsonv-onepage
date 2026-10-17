// Объёмная карусель направлений: центральная карточка фронтально, соседние уходят
// в глубину с поворотом. Стрелки, индикаторы, клавиатура (←/→, Home/End), свайп.
// Неактивные карточки скрыты от скринридера и не попадают в порядок Tab.

const SWIPE_MIN = 40; // px по горизонтали, чтобы жест считался свайпом

/** Положение карточки по смещению d от текущей (… −2, −1, 0, 1, 2 …). */
function cardStyle(d, width) {
  if (d === 0) return { transform: 'none', opacity: '1', dim: '0', zIndex: '10', visibility: 'visible' };
  const a = Math.abs(d);
  const side = Math.sign(d);
  const shift = side * width * (a === 1 ? 0.7 : 1.18);
  const depth = a === 1 ? -180 : -360;
  const angle = -side * (a === 1 ? 38 : 50);
  // карточки непрозрачные (текст соседей не просвечивает), глубину даёт затемнение
  return {
    transform: `translate3d(${shift.toFixed(1)}px, 0, ${depth}px) rotateY(${angle}deg)`,
    opacity: a > 2 ? '0' : '1',
    dim: a === 1 ? '0.5' : '0.78',
    zIndex: String(10 - a),
    visibility: a > 2 ? 'hidden' : 'visible',
  };
}

export function initCarousel() {
  const root = document.querySelector('[data-carousel]');
  if (!root) return;
  const list = root.querySelector('.carousel__list');
  const cards = [...root.querySelectorAll('[data-card]')];
  const controls = root.querySelector('[data-carousel-controls]');
  const dotsWrap = root.querySelector('[data-carousel-dots]');
  const prev = root.querySelector('[data-carousel-prev]');
  const next = root.querySelector('[data-carousel-next]');
  const live = root.querySelector('[data-carousel-live]');
  const total = cards.length;
  if (!list || !total || !controls || !dotsWrap || !prev || !next) return;

  let current = 0;
  let cardWidth = 300;

  const titles = cards.map((card) => card.querySelector('.dcard__title')?.textContent.trim() || '');
  const dots = cards.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    dot.setAttribute('aria-label', `Направление ${i + 1} из ${total}`);
    dot.setAttribute('aria-controls', list.id);
    dot.addEventListener('click', () => goTo(i, true));
    dotsWrap.append(dot);
    return dot;
  });

  cards.forEach((card, i) => {
    card.setAttribute('aria-roledescription', 'слайд');
    card.setAttribute('aria-label', `${i + 1} из ${total}: ${titles[i]}`);
  });

  function offset(i) {
    // кратчайшее смещение по кругу: −4 … 4 при девяти карточках
    let d = i - current;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    return d;
  }

  function render() {
    cards.forEach((card, i) => {
      const d = offset(i);
      const style = cardStyle(d, cardWidth);
      card.style.transform = style.transform;
      card.style.opacity = style.opacity;
      card.style.setProperty('--dim', style.dim);
      card.style.zIndex = style.zIndex;
      card.style.visibility = style.visibility;
      const isCurrent = d === 0;
      card.classList.toggle('is-current', isCurrent);
      card.setAttribute('aria-hidden', String(!isCurrent));
      card.querySelectorAll('a, button').forEach((el) => {
        if (isCurrent) el.removeAttribute('tabindex');
        else el.setAttribute('tabindex', '-1');
      });
    });
    dots.forEach((dot, i) => {
      if (i === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    root.dataset.index = String(current);
  }

  function goTo(index, announce) {
    const target = ((index % total) + total) % total;
    const focusWasInCard = cards[current].contains(document.activeElement);
    current = target;
    render();
    if (announce && live) live.textContent = `Направление ${current + 1} из ${total}: ${titles[current]}`;
    if (focusWasInCard) cards[current].querySelector('a')?.focus({ preventScroll: true });
  }

  prev.addEventListener('click', () => goTo(current - 1, true));
  next.addEventListener('click', () => goTo(current + 1, true));

  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: total - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    goTo(keys[event.key], true);
    if (event.target.classList?.contains('dot')) dots[current].focus();
  });

  // Нажатие на боковую карточку делает её центральной; ссылка в ней не срабатывает
  let suppressClick = false;
  list.addEventListener(
    'click',
    (event) => {
      const card = event.target.closest('[data-card]');
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!card || card.classList.contains('is-current')) return;
      event.preventDefault();
      event.stopPropagation();
      goTo(cards.indexOf(card), true);
    },
    true,
  );

  // Свайп: pointer events, вертикальная прокрутка страницы не блокируется (touch-action: pan-y)
  let start = null;
  list.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    start = { x: event.clientX, y: event.clientY };
  });
  list.addEventListener('pointerup', (event) => {
    if (!start || !event.isPrimary) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      goTo(current + (dx < 0 ? 1 : -1), true);
    }
  });
  list.addEventListener('pointercancel', () => { start = null; });

  const measure = () => {
    const width = cards[current].offsetWidth;
    if (width && width !== cardWidth) {
      cardWidth = width;
      render();
    }
  };
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(list);

  controls.hidden = false;
  // первая расстановка — без анимации перелёта из сетки
  root.classList.add('is-ready', 'is-instant');
  cardWidth = cards[0].offsetWidth || cardWidth;
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-instant')));
}
