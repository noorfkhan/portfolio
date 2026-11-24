// inertial smooth scrolling (same library the reference site uses), off for reduced motion
let lenis = null;
if (window.Lenis && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: true, syncTouch: false });
  (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
}

// always open pages at the top so the header logo is in view
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const toTop = () => { if (!location.hash) window.scrollTo(0, 0); };
toTop();
addEventListener('load', () => { toTop(); requestAnimationFrame(toTop); });
addEventListener('pageshow', toTop);

// menu
const burger = document.querySelector('.burger'), menu = document.querySelector('.menu');
const setMenu = open => { document.body.classList.toggle('menu-open', open); burger.setAttribute('aria-expanded', open); menu.setAttribute('aria-hidden', !open); };
burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => e.key === 'Escape' && setMenu(false));



// stretch the footer wordmark edge to edge
function fitWordmark() {
  document.querySelectorAll('.wordmark').forEach(w => {
    w.style.fontSize = '100px';
    w.style.width = 'max-content';
    const textW = w.offsetWidth; // layout width, unaffected by the zoom transform
    w.style.width = '';
    const cs = getComputedStyle(w.parentElement);
    const avail = w.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    w.style.fontSize = (100 * avail / textW) + 'px';
  });
}
(document.fonts ? document.fonts.ready : Promise.resolve()).then(fitWordmark);
addEventListener('resize', fitWordmark);

// footer wordmark zooms out (from huge to fitted) as the footer scrolls into view
(function () {
  const w = document.querySelector('.wordmark');
  if (!w || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const START = 1.12;
  let ticking = false;
  function update() {
    ticking = false;
    const r = w.parentElement.getBoundingClientRect(), vh = innerHeight;
    // 0 when the footer top enters the bottom of the screen, 1 once the wordmark has fully risen into view
    const span = Math.min(vh * 0.75, w.parentElement.parentElement.offsetHeight * 0.85);
    const p = Math.min(1, Math.max(0, (vh - r.top) / span));
    const e = 1 - Math.pow(1 - p, 3);
    w.style.transform = `scale(${START - (START - 1) * e})`;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
})();

// dark mode toggle
(function () {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const root = document.documentElement;
  const sync = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-pressed', dark);
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    sync();
  });
  sync();
})();

// ---------------- site search ----------------
(function () {
  const overlay = document.querySelector('.search');
  const openBtn = document.querySelector('.search-btn');
  if (!overlay || !openBtn) return;
  const input = overlay.querySelector('input');
  const list = overlay.querySelector('.search-results');
  const PAGES = [
    { url: 'index.html', title: 'home' },
    { url: 'about.html', title: 'about' },
    { url: 'work.html', title: 'work' },
    { url: 'values.html', title: 'values' },
    { url: 'projects.html', title: 'projects' },
  ];
  // fallback entries, used if pages can't be fetched (e.g. opened straight from disk)
  let index = PAGES.map(p => ({ title: p.title, snippet: p.title + ' page', url: p.url }));
  let built = false, active = -1, results = [];

  async function build() {
    if (built) return; built = true;
    const out = [];
    const clean = t => t.replace(/\s+/g, ' ').trim();
    await Promise.all(PAGES.map(async p => {
      try {
        const html = await (await fetch(p.url, { cache: 'no-cache' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('header, footer, .menu, .search, script, style').forEach(n => n.remove());
        out.push({ title: p.title, snippet: p.title + ' page', url: p.url });
        doc.querySelectorAll('main h1, main h2, main h3, main li, main p, main .tile-label, main .meta-row p').forEach(n => {
          const text = clean(n.textContent);
          if (text.length < 3) return;
          out.push({ title: text.length > 70 ? text.slice(0, 70) + '…' : text, snippet: p.title, url: p.url, full: text });
        });
      } catch (e) {}
    }));
    if (out.length) {
      const seen = new Set();
      index = out.filter(r => { const k = r.url + '|' + (r.full || r.title); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    render();
  }

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hi = (s, q) => q ? esc(s).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>') : esc(s);

  function render() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results = index.filter(r => !r.full);
    } else {
      results = index
        .map(r => { const hay = (r.full || r.title).toLowerCase(); const i = hay.indexOf(q); return i < 0 ? null : { r, score: (r.full ? 1 : 0) + i / 1000 }; })
        .filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 12).map(x => x.r);
    }
    active = results.length ? 0 : -1;
    list.innerHTML = results.length
      ? results.map((r, i) => `<li><a href="${r.url}" class="${i === active ? 'active' : ''}"><span class="t">${hi(r.title, q)}</span><span class="s">${esc(r.snippet)}</span></a></li>`).join('')
      : `<li class="empty">no results for “${esc(input.value.trim())}”</li>`;
  }
  function setActive(n) {
    const links = list.querySelectorAll('a');
    if (!links.length) return;
    active = (n + links.length) % links.length;
    links.forEach((a, i) => a.classList.toggle('active', i === active));
    links[active].scrollIntoView({ block: 'nearest' });
  }
  function open() {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
    openBtn.setAttribute('aria-expanded', 'true');
    input.value = ''; render(); build();
    if (lenis) lenis.stop();
    setTimeout(() => input.focus(), 30);
  }
  function close() {
    overlay.classList.remove('open');
    openBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { overlay.hidden = true; }, 250);
    if (lenis) lenis.start();
    openBtn.focus();
  }
  openBtn.addEventListener('click', open);
  overlay.querySelector('.search-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  input.addEventListener('input', render);
  addEventListener('keydown', e => {
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && overlay.hidden && !/input|textarea/i.test(document.activeElement.tagName))) { e.preventDefault(); open(); return; }
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && active >= 0) { const a = list.querySelectorAll('a')[active]; if (a) location.href = a.href; }
  });
})();

// slot machine letters on hover: menu items (with arrow), header links, contact links
function rollify(a, withArrow) {
  const word = [...a.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  if (!word || a.querySelector('.roll')) return;
  [...a.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
  const roll = document.createElement('span');
  roll.className = 'roll';
  roll.setAttribute('aria-hidden', 'true');
  roll.innerHTML = [...word].map((ch, i) => `<span class="l" style="--i:${i}"><span>${ch}</span><span>${ch}</span></span>`).join('');
  if (!a.getAttribute('aria-label')) a.setAttribute('aria-label', word);
  a.appendChild(roll);
  if (withArrow) a.insertAdjacentHTML('beforeend', '<svg class="arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>');
}
document.querySelectorAll('.menu li a').forEach(a => rollify(a, true));
document.querySelectorAll('.nav-left a, .menu-info a').forEach(a => rollify(a, false));

// corner badge: true shape morph from nk to the cursive nk across the page (no blur)
(function () {
  const badge = document.querySelector('.badge');
  const M = window.NK_MORPH;
  if (!badge || !M) return;
  badge.innerHTML = M.svg;
  const shapes = badge.querySelectorAll('.nkm-shape');
  const ga = badge.querySelector('.nkm-a'), gb = badge.querySelector('.nkm-b');
  let last = -1, ticking = false;
  function pathAt(e) {
    let d = '';
    for (let r = 0; r < M.A.length; r++) {
      const a = M.A[r], b = M.B[r];
      for (let i = 0; i < a.length; i += 2) {
        const x = a[i] + (b[i] - a[i]) * e, y = a[i + 1] + (b[i + 1] - a[i + 1]) * e;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      d += 'Z';
    }
    return d;
  }
  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    const t = Math.min(1, Math.max(0, (p - 0.10) / 0.75));   // morph between 10% and 85% of the page
    const e = t * t * (3 - 2 * t);                            // smoothstep
    if (Math.abs(e - last) < 0.002) return;
    last = e;
    const d = pathAt(e);
    shapes.forEach(s => s.setAttribute('d', d));
    // shading blends across, clipped to the morphing outline so nothing spills out
    ga.setAttribute('opacity', (1 - e).toFixed(3));
    gb.setAttribute('opacity', e.toFixed(3));
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
})();

// big headlines (i'm noor + page banners): letters thicken & stretch near the cursor
(function () {
  if (matchMedia('(hover: none)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.col-l h1, .ab-hero h1').forEach(thicken);
})();
function thicken(h) {
  h.setAttribute('aria-label', h.textContent);
  h.innerHTML = '<span class="wrap-ch">' + [...h.textContent].map(c => `<span class="ch" aria-hidden="true">${c}</span>`).join('') + '</span>';
  const word = h.firstElementChild;            // react only while the pointer is over the word itself
  const chars = [...word.children];
  const cur = chars.map(() => 0), tgt = chars.map(() => 0);
  const MAX_STROKE = 0.07, MAX_PAD = 0.05, MAX_SX = 0.2, MAX_SY = 0.05, RADIUS = 1.6; // radius in em
  let raf = null;
  function setTargets(x) {
    const em = parseFloat(getComputedStyle(h).fontSize);
    chars.forEach((c, i) => {
      if (x == null) { tgt[i] = 0; return; }
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x) / (RADIUS * em);
      tgt[i] = d >= 1 ? 0 : (Math.cos(d * Math.PI) + 1) / 2;
    });
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    let moving = false;
    chars.forEach((c, i) => {
      cur[i] += (tgt[i] - cur[i]) * 0.18;
      if (Math.abs(tgt[i] - cur[i]) < 0.001) cur[i] = tgt[i]; else moving = true;
      const v = cur[i];
      c.style.webkitTextStrokeWidth = (MAX_STROKE * v) + 'em';
      c.style.paddingInline = (MAX_PAD * v) + 'em';
      c.style.transform = v ? `scaleX(${1 + MAX_SX * v}) scaleY(${1 - MAX_SY * v})` : 'none';
    });
    raf = moving ? requestAnimationFrame(step) : null;
  }
  word.addEventListener('pointermove', e => setTargets(e.clientX));
  word.addEventListener('pointerleave', () => setTargets(null));
}
