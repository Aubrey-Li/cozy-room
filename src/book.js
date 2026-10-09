// A book that opens over the scene when the bookshelf is clicked: it flies up
// from the click point, the cover swings open to a bookmarked spread, and
// pages turn with a 3D leaf. Wide screens show a two-page spread; narrow
// screens show one page at a time.

import { BOOK } from './book-pages.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dur = (ms) => (reduceMotion ? 1 : ms);

/** Run a Web Animation, then keep its final frame as inline style. */
async function play(el, keyframes, options) {
  const anim = el.animate(keyframes, { fill: 'forwards', ...options, duration: dur(options.duration) });
  try {
    await anim.finished;
  } catch {
    return; // cancelled
  }
  const last = keyframes[keyframes.length - 1];
  for (const [k, v] of Object.entries(last)) if (k !== 'offset' && k !== 'easing') el.style[k] = v;
  anim.cancel();
}

const el = (tag, cls, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
};

export function createBook({ onSound } = {}) {
  const pages = BOOK.pages;
  const last = pages.length - 1;

  // ---------------------------------------------------------------- DOM
  const overlay = el('div', 'book-overlay');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', BOOK.title);
  overlay.tabIndex = -1;
  const backdrop = el('div', 'book-backdrop', overlay);
  const stage = el('div', 'book-stage', overlay);
  const book = el('div', 'book', stage);
  const leftSlot = el('div', 'page left', book);
  const rightSlot = el('div', 'page right', book);
  const cover = el('div', 'cover', book);
  const coverFront = el('div', 'cover-face cover-front', cover);
  const coverBack = el('div', 'cover-face cover-back page left', cover);
  coverFront.innerHTML = `
    <div class="cover-frame">
      <div class="cover-ornament">❦</div>
      <div class="cover-title"></div>
      <div class="cover-rule"></div>
      <div class="cover-sub">poems</div>
    </div>`;
  coverFront.querySelector('.cover-title').textContent = BOOK.title;
  const prevBtn = el('button', 'book-nav prev', overlay);
  const nextBtn = el('button', 'book-nav next', overlay);
  const closeBtn = el('button', 'book-close', overlay);
  prevBtn.type = nextBtn.type = closeBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous page');
  nextBtn.setAttribute('aria-label', 'Next page');
  closeBtn.setAttribute('aria-label', 'Close the book');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const measurer = el('div', 'page right book-measure', overlay);
  document.body.appendChild(overlay);

  // ---------------------------------------------------------------- state
  let isOpen = false;
  let busy = false;
  let spread = true;    // two-page spread vs single page
  let pos = 0;          // spread index (spread mode) or page index (single mode)
  let pw = 400, ph = 570;
  let origin = { x: innerWidth / 2, y: innerHeight / 2 };
  let lastFocus = null;
  let pendingTurn = 0;      // a page turn asked for mid-animation, run next
  let pendingClose = false; // a close asked for mid-animation
  const fontCache = new Map();

  // ---------------------------------------------------------------- layout
  function layout() {
    spread = innerWidth >= 720 && innerWidth / innerHeight > 0.95;
    // page width / height; single pages on phones run a little taller to fit more verse
    const aspect = spread ? 0.68 : 0.6;
    if (spread) {
      ph = Math.min(innerHeight * 0.84, (innerWidth * 0.86) / (2 * aspect));
    } else {
      ph = Math.min(innerHeight * 0.8, (innerWidth * 0.86) / aspect);
    }
    ph = Math.round(ph);
    pw = Math.round(ph * aspect);
    book.style.setProperty('--pw', `${pw}px`);
    book.style.setProperty('--ph', `${ph}px`);
    measurer.style.setProperty('--pw', `${pw}px`);
    measurer.style.setProperty('--ph', `${ph}px`);
    overlay.classList.toggle('single', !spread);
    fontCache.clear();
  }

  const spreadPages = (s) => [pages[s * 2] ?? null, pages[s * 2 + 1] ?? null];
  const maxPos = () => (spread ? Math.floor(last / 2) : last);

  // ---------------------------------------------------------------- rendering
  function pageHTML(i) {
    const p = pages[i];
    const num = BOOK.firstPageNumber + i;
    const verso = num % 2 === 0;
    const head = verso ? BOOK.title : BOOK.rectoHead;
    const ribbon = i === BOOK.bookmarkIndex ? '<div class="ribbon" aria-hidden="true"></div>' : '';
    return `${ribbon}
      <div class="running-head">${escapeHTML(head)}</div>
      <div class="page-body">
        <h2 class="poem-title">${escapeHTML(p.title)}</h2>
        <div class="poem-author">${escapeHTML(p.author)}</div>
        <div class="poem">${escapeHTML(p.text)}</div>
      </div>
      <div class="folio">${num}</div>`;
  }

  function endHTML() {
    return '<div class="page-body page-end"><div class="end-ornament">❦</div></div>';
  }

  /** Largest font size (px) at which page i fits; cached per layout. */
  function fontFor(i) {
    if (fontCache.has(i)) return fontCache.get(i);
    measurer.innerHTML = pageHTML(i);
    const body = measurer.querySelector('.page-body');
    const poem = measurer.querySelector('.poem');
    poem.style.whiteSpace = 'pre'; // measure unwrapped, so no verse line ever breaks
    // one shared reading size for most pages, shrinking only pages that would overflow
    let fs = ph * 0.026;
    body.style.fontSize = `${fs}px`;
    const overflows = () => body.scrollHeight > body.clientHeight + 1 || poem.scrollWidth > body.clientWidth + 1;
    while (overflows() && fs > 8) {
      fs -= 0.25;
      body.style.fontSize = `${fs}px`;
    }
    fontCache.set(i, fs);
    return fs;
  }

  function fill(slot, i) {
    slot.classList.toggle('blank', i === null || i === undefined);
    if (i === null || i === undefined) {
      slot.innerHTML = endHTML();
      return;
    }
    slot.innerHTML = pageHTML(i);
    slot.querySelector('.page-body').style.fontSize = `${fontFor(i)}px`;
  }

  const indexOf = (p) => (p ? pages.indexOf(p) : null);

  function renderStatic() {
    if (spread) {
      const [l, r] = spreadPages(pos);
      fill(leftSlot, indexOf(l));
      fill(rightSlot, indexOf(r));
    } else {
      fill(rightSlot, pos);
    }
    prevBtn.disabled = pos <= 0;
    nextBtn.disabled = pos >= maxPos();
  }

  // ---------------------------------------------------------------- open / close
  const closedShift = () => (spread ? -pw / 2 : 0);

  async function open(at) {
    if (isOpen || busy) return;
    busy = true;
    isOpen = true;
    lastFocus = document.activeElement;
    if (at) origin = at;
    layout();
    pos = spread ? Math.floor(BOOK.startIndex / 2) : BOOK.startIndex;
    overlay.hidden = false;
    await document.fonts?.ready;
    fontCache.clear();
    renderStatic();

    // the cover opens straight to the bookmark, carrying the left-hand page with it
    if (spread) fill(coverBack, indexOf(spreadPages(pos)[0]));
    else coverBack.innerHTML = '';
    cover.hidden = false;
    cover.style.transform = 'rotateY(0deg)';
    cover.style.opacity = '1';
    leftSlot.style.visibility = 'hidden';

    const rect = stage.getBoundingClientRect();
    const dx = origin.x - (rect.left + rect.width / 2);
    const dy = origin.y - (rect.top + rect.height / 2);
    const cx = closedShift();
    play(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
    await play(book, [
      { transform: `translate(${dx}px, ${dy}px) translateX(${cx}px) scale(0.12) rotate(-8deg)`, opacity: 0 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) translateX(${cx}px) scale(0.75) rotate(-2deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(0px, 0px) translateX(${cx}px) scale(1) rotate(0deg)`, opacity: 1 },
    ], { duration: 700, easing: 'cubic-bezier(.2,.75,.25,1)' });

    onSound?.('open');
    const coverAnim = play(cover, spread
      ? [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }]
      : [{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: 'rotateY(-120deg)', opacity: 1, offset: 0.6 }, { transform: 'rotateY(-180deg)', opacity: 0 }],
      { duration: 1050, easing: 'cubic-bezier(.45,.05,.3,1)' });
    const shift = play(book, [
      { transform: `translate(0px, 0px) translateX(${cx}px) scale(1) rotate(0deg)` },
      { transform: 'translate(0px, 0px) translateX(0px) scale(1) rotate(0deg)' },
    ], { duration: 1050, easing: 'cubic-bezier(.45,.05,.3,1)' });
    await Promise.all([coverAnim, shift]);

    leftSlot.style.visibility = '';
    cover.hidden = true;
    overlay.classList.add('ready');
    overlay.focus({ preventScroll: true });
    finish();
  }

  /** End an animation and run whatever the reader asked for in the meantime. */
  function finish() {
    busy = false;
    if (pendingClose) {
      pendingClose = false;
      pendingTurn = 0;
      close();
    } else if (pendingTurn) {
      const d = pendingTurn;
      pendingTurn = 0;
      turn(d);
    }
  }

  async function close() {
    if (!isOpen) return;
    if (busy) {
      pendingClose = true;
      return;
    }
    busy = true;
    overlay.classList.remove('ready');
    const cx = closedShift();
    if (spread) fill(coverBack, indexOf(spreadPages(pos)[0]));
    cover.hidden = false;
    cover.style.transform = 'rotateY(-180deg)';
    cover.style.opacity = spread ? '1' : '0';
    if (spread) leftSlot.style.visibility = 'hidden';
    onSound?.('close');
    const coverAnim = play(cover, spread
      ? [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }]
      : [{ transform: 'rotateY(-180deg)', opacity: 0 }, { transform: 'rotateY(-120deg)', opacity: 1, offset: 0.4 }, { transform: 'rotateY(0deg)', opacity: 1 }],
      { duration: 800, easing: 'cubic-bezier(.5,0,.3,1)' });
    const shift = play(book, [
      { transform: 'translate(0px, 0px) translateX(0px) scale(1) rotate(0deg)' },
      { transform: `translate(0px, 0px) translateX(${cx}px) scale(1) rotate(0deg)` },
    ], { duration: 800, easing: 'cubic-bezier(.5,0,.3,1)' });
    await Promise.all([coverAnim, shift]);

    const rect = stage.getBoundingClientRect();
    const dx = origin.x - (rect.left + rect.width / 2);
    const dy = origin.y - (rect.top + rect.height / 2);
    play(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: 'ease-in' });
    await play(book, [
      { transform: `translate(0px, 0px) translateX(${cx}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) translateX(${cx}px) scale(0.12) rotate(-8deg)`, opacity: 0 },
    ], { duration: 520, easing: 'cubic-bezier(.55,0,.75,.3)' });

    overlay.hidden = true;
    leftSlot.style.visibility = '';
    isOpen = false;
    busy = false;
    pendingTurn = 0;
    pendingClose = false;
    lastFocus?.focus?.({ preventScroll: true });
  }

  // ---------------------------------------------------------------- page turns
  function makeLeaf(side) {
    const leaf = el('div', `leaf ${side}`, book);
    const front = el('div', `leaf-face front page ${side}`, leaf);
    const back = el('div', `leaf-face back page ${side === 'right' ? 'left' : 'right'}`, leaf);
    const shade = el('div', 'leaf-shade', leaf);
    return { leaf, front, back, shade };
  }

  async function turn(dir) {
    if (!isOpen) return;
    if (busy) {
      pendingTurn = dir;
      return;
    }
    const next = pos + dir;
    if (next < 0 || next > maxPos()) return;
    busy = true;
    onSound?.('flip');
    const flip = { duration: 820, easing: 'cubic-bezier(.45,.1,.3,1)' };
    const shadeKeys = [{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }];

    if (spread) {
      const [oldL, oldR] = spreadPages(pos);
      const [newL, newR] = spreadPages(next);
      if (dir > 0) {
        const { leaf, front, back, shade } = makeLeaf('right');
        fill(front, indexOf(oldR));
        fill(back, indexOf(newL));
        fill(rightSlot, indexOf(newR)); // revealed underneath
        play(shade, shadeKeys, flip);
        await play(leaf, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], flip);
        pos = next;
        fill(leftSlot, indexOf(newL));
        leaf.remove();
      } else {
        const { leaf, front, back, shade } = makeLeaf('left');
        fill(front, indexOf(oldL));
        fill(back, indexOf(newR));
        fill(leftSlot, indexOf(newL));
        play(shade, shadeKeys, flip);
        await play(leaf, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], flip);
        pos = next;
        fill(rightSlot, indexOf(newR));
        leaf.remove();
      }
    } else {
      // single page: the current page lifts away to the left, or the previous one returns
      const { leaf, front, back, shade } = makeLeaf('right');
      back.innerHTML = '';
      back.classList.add('blank');
      if (dir > 0) {
        fill(front, pos);
        fill(rightSlot, next);
        play(shade, shadeKeys, flip);
        await play(leaf, [
          { transform: 'rotateY(0deg)', opacity: 1 },
          { transform: 'rotateY(-150deg)', opacity: 1, offset: 0.75 },
          { transform: 'rotateY(-180deg)', opacity: 0 },
        ], flip);
      } else {
        fill(front, next);
        play(shade, [{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }], flip);
        await play(leaf, [
          { transform: 'rotateY(-180deg)', opacity: 0 },
          { transform: 'rotateY(-150deg)', opacity: 1, offset: 0.25 },
          { transform: 'rotateY(0deg)', opacity: 1 },
        ], flip);
        fill(rightSlot, next);
      }
      pos = next;
      leaf.remove();
    }
    renderStatic();
    finish();
  }

  // ---------------------------------------------------------------- input
  prevBtn.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  // click a page (or its half on phones) to turn; swipe to turn on touch screens
  let down = null;
  stage.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  });
  stage.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const tap = Math.hypot(dx, dy) < 8;
    down = null;
    if (!tap) {
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? 1 : -1);
      return;
    }
    const r = book.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      close(); // tapped the space around the book
      return;
    }
    turn(e.clientX < r.left + r.width / 2 ? -1 : 1);
  });

  // capture phase so scene shortcuts (WASD, R, Escape for music) stay quiet while reading
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); turn(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
  }, true);

  window.addEventListener('resize', () => {
    if (!isOpen || busy) return;
    const wasSpread = spread;
    const page = wasSpread ? pos * 2 + 1 : pos; // remember roughly where the reader is
    layout();
    if (spread !== wasSpread) pos = spread ? Math.floor(Math.min(page, last) / 2) : Math.min(page, last);
    renderStatic();
  });

  return {
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
