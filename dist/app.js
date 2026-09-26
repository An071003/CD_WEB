const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const loader = $('site-loader');
const loaderCounter = $('loader-counter');
const loaderImage = $('loader-image');
const stage = $('disc-gallery');
const detail = $('detail');
const portal = $('portal');
const iris = $('portal-iris');
const zoomDisc = $('portal-disc');
const siteRoot = new URL(document.currentScript.src).pathname.replace(/\/app\.js$/, '');
const withRoot = (path) => siteRoot + path;
const routePath = () => location.pathname.slice(siteRoot.length) || '/';

let data = { films: [], television: [] };
let category = routePath().startsWith('/television') ? 'television' : 'films';
let catalog = [];
let currentIndex = 0;
let discElements = [];
const imageLoads = new WeakMap();
let detailShown = false;
let transitioning = false;
let moving = false;
let lastWheelAt = 0;
let swipeStart = null;
let suppressClick = false;

const current = () => catalog[currentIndex];
const stars = (review) => '★'.repeat(Math.floor(Number(review.stars || 0))) + (Number(review.stars || 0) % 1 ? '½' : '');
const basePath = () => withRoot(category === 'films' ? '/' : '/television/');
const detailPath = (film) => withRoot(`/production/${film.slug}/`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadingStartedAt = performance.now();
let loadingProgress = 0;
if (loader) $('gallery').inert = true;
const loaderArtworkReady = loader ? loaderImage.decode().then(() => {
  loader.classList.add('has-image');
  return true;
}).catch(() => false) : Promise.resolve(false);
const loadingTimer = loader && setInterval(() => {
  loadingProgress = Math.min(92, Math.floor((performance.now() - loadingStartedAt) / 15));
  loaderCounter.textContent = String(loadingProgress).padStart(2, '0');
}, 32);

async function finishLoading() {
  if (!loader) return;
  const assetsReady = Promise.allSettled([
    loaderArtworkReady,
    ensureVisibleImages(currentIndex),
    document.fonts.ready,
  ]);
  const minimum = reducedMotion.matches ? 0 : 1200;
  const [assets] = await Promise.all([
    assetsReady,
    delay(Math.max(0, minimum - (performance.now() - loadingStartedAt))),
  ]);
  clearInterval(loadingTimer);
  if (assets[1].status !== 'fulfilled' || !assets[1].value) {
    loader.classList.add('has-error');
    loader.setAttribute('aria-label', 'Artwork unavailable');
    loader.querySelector('.loader-head span').textContent = 'Artwork unavailable';
    loaderCounter.textContent = '—';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'loader-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => location.reload());
    loader.append(retry);
    return;
  }
  if (!reducedMotion.matches) {
    const from = loadingProgress;
    const start = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const progress = Math.min(1, (now - start) / 330);
        const eased = 1 - (1 - progress) ** 3;
        loaderCounter.textContent = String(Math.round(from + (100 - from) * eased)).padStart(2, '0');
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  } else loaderCounter.textContent = '100';
  loader.classList.add('is-complete');
  await delay(reducedMotion.matches ? 0 : 180);
  loader.classList.add('is-leaving');
  await delay(reducedMotion.matches ? 0 : 660);
  loader.remove();
  $('gallery').inert = false;
  if (detailShown) $('detail-back').focus();
}

function slotFor(index) {
  const offset = index - currentIndex;
  return Math.abs(offset) <= 2 ? String(offset) : 'far';
}

function createDiscs() {
  stage.replaceChildren();
  discElements = catalog.map((film, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'disc-item';
    button.dataset.index = String(index);
    const face = document.createElement('span');
    face.className = 'disc-face';
    const image = document.createElement('img');
    image.dataset.src = withRoot(film.image);
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    const hub = document.createElement('span');
    hub.className = 'disc-hub';
    face.append(image, hub);
    button.append(face);
    button.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      const slot = button.dataset.slot;
      if (slot === '0') openDetail();
      else if (slot === '-1') move(-1);
      else if (slot === '1') move(1);
    });
    stage.append(button);
    return button;
  });
  positionDiscs();
}

function ensureDiscImage(index, highPriority = false) {
  const button = discElements[index];
  if (!button) return Promise.resolve(false);
  const image = button.querySelector('img');
  if (highPriority) image.fetchPriority = 'high';
  if (!image.getAttribute('src')) image.src = image.dataset.src;
  let ready = imageLoads.get(image);
  if (!ready) {
    ready = image.decode().then(() => {
      button.classList.add('is-ready');
      return true;
    }).catch(() => {
      button.classList.remove('is-ready');
      imageLoads.delete(image);
      return false;
    });
    imageLoads.set(image, ready);
  }
  return ready;
}

async function ensureVisibleImages(center) {
  if (!discElements[center]) return false;
  const indices = [center - 1, center, center + 1].filter((index) => index >= 0 && index < discElements.length);
  const ready = await Promise.all(indices.map((index) => ensureDiscImage(index, index === center)));
  return ready[indices.indexOf(center)];
}

function positionDiscs() {
  discElements.forEach((button, index) => {
    const slot = slotFor(index);
    button.dataset.slot = slot;
    button.tabIndex = ['-1', '0', '1'].includes(slot) ? 0 : -1;
    button.setAttribute('aria-hidden', slot === 'far' || Math.abs(Number(slot)) === 2 ? 'true' : 'false');
    button.setAttribute('aria-label', slot === '0' ? `Open ${catalog[index].title}` : `Browse to ${catalog[index].title}`);
    const image = button.querySelector('img');
    if (slot !== 'far') void ensureDiscImage(index, slot === '0');
    image.alt = slot === '0' ? `${catalog[index].title} disc artwork` : '';
    if (slot !== '0') button.classList.remove('is-flipped');
  });
}

function fillFilmInfo() {
  const film = current();
  if (!film) return;
  $('film-title').textContent = film.title;
  $('film-director').textContent = film.director;
  $('film-year').textContent = film.year;
  const starring = $('film-starring');
  starring.replaceChildren();
  film.starring.forEach((name, index) => {
    if (index) starring.append(document.createElement('br'));
    starring.append(document.createTextNode(name));
  });
  const reviews = $('reviews');
  reviews.replaceChildren();
  film.reviews.forEach((review) => {
    const item = document.createElement('div');
    const rating = document.createElement('span');
    rating.className = 'review-stars';
    rating.textContent = stars(review);
    const publication = document.createElement('small');
    publication.textContent = review.publication;
    const quote = document.createElement('p');
    quote.textContent = `“${review.quote}”`;
    item.append(rating, publication, quote);
    reviews.append(item);
  });
  [...$('index-panel').querySelectorAll('button')].forEach((button, index) => button.setAttribute('aria-current', String(index === currentIndex)));
}

function renderIndex() {
  const panel = $('index-panel');
  panel.replaceChildren();
  catalog.forEach((film, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    const title = document.createElement('span');
    title.textContent = film.title;
    const year = document.createElement('span');
    year.textContent = film.year;
    button.append(title, year);
    button.addEventListener('click', () => select(index));
    panel.append(button);
  });
}

function toggleIndex(force) {
  const panel = $('index-panel');
  const open = typeof force === 'boolean' ? force : panel.hidden;
  panel.hidden = !open;
  $('index-toggle').setAttribute('aria-expanded', String(open));
}

async function navigateTo(index, animateInfo) {
  if (transitioning || detailShown || moving || !catalog[index] || index === currentIndex) {
    if (!animateInfo) toggleIndex(false);
    return;
  }
  moving = true;
  stage.setAttribute('aria-busy', 'true');
  if (!animateInfo) toggleIndex(false);
  const ready = await ensureVisibleImages(index);
  if (!ready) {
    moving = false;
    stage.removeAttribute('aria-busy');
    return;
  }
  if (animateInfo) {
    $('film-info').classList.add('is-swapping');
    $('reviews').classList.add('is-swapping');
  }
  currentIndex = index;
  positionDiscs();
  if (animateInfo) {
    setTimeout(() => {
      fillFilmInfo();
      $('film-info').classList.remove('is-swapping');
      $('reviews').classList.remove('is-swapping');
    }, reducedMotion.matches ? 0 : 230);
  } else fillFilmInfo();
  setTimeout(() => {
    moving = false;
    stage.removeAttribute('aria-busy');
  }, reducedMotion.matches ? 0 : 760);
}

function select(index) { void navigateTo(index, false); }
function move(delta) { void navigateTo(currentIndex + delta, true); }

function populateDetail(film) {
  $('detail-title').textContent = film.title;
  $('detail-category').textContent = film.category === 'films' ? 'A24 FILM' : 'A24 TELEVISION';
  $('detail-credits').textContent = `DIRECTED BY ${film.director}   ·   STARRING ${film.starring.join(', ')}`;
  $('detail-art').src = withRoot(film.image);
  $('detail-art').alt = `${film.title} disc artwork`;
  const lines = $('detail-lines');
  lines.replaceChildren();
  [['YEAR', film.year], ['DIRECTED BY', film.director], ['STARRING', film.starring.join(', ')], ['COLLECTION', film.category === 'films' ? 'Films' : 'Television']].forEach(([label, value]) => {
    const row = document.createElement('div');
    const small = document.createElement('small');
    const span = document.createElement('span');
    small.textContent = label;
    span.textContent = value;
    row.append(small, span);
    lines.append(row);
  });
  const review = film.reviews[0];
  const target = $('detail-review');
  target.replaceChildren();
  if (review) {
    target.append(document.createTextNode(`“${review.quote}”`));
    const small = document.createElement('small');
    small.textContent = `${review.publication}  ·  ${stars(review)}`;
    target.append(small);
  }
  document.title = `A24 — ${film.title}`;
}

function portalGeometry(button) {
  const rect = button.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = innerWidth / 2 - cx;
  const dy = innerHeight / 2 - cy;
  const scale = Math.max(innerWidth, innerHeight) * 2.5 / rect.width;
  const radius = Math.hypot(innerWidth, innerHeight) * 1.15;
  return { rect, cx, cy, dx, dy, scale, radius };
}

async function preparePortal(film, geometry) {
  const image = $('portal-image');
  image.src = withRoot(film.image);
  try {
    await image.decode();
    zoomDisc.style.visibility = '';
  } catch {
    zoomDisc.style.visibility = 'hidden';
  }
  portal.hidden = false;
  portal.style.opacity = '1';
  zoomDisc.style.left = `${geometry.rect.left}px`;
  zoomDisc.style.top = `${geometry.rect.top}px`;
  zoomDisc.style.width = `${geometry.rect.width}px`;
  zoomDisc.style.height = `${geometry.rect.height}px`;
  iris.style.setProperty('--origin-x', `${geometry.cx}px`);
  iris.style.setProperty('--origin-y', `${geometry.cy}px`);
}

function finishPortal(animations) {
  animations.forEach((animation) => animation.cancel());
  portal.hidden = true;
  portal.style.opacity = '1';
  iris.style.clipPath = '';
  zoomDisc.style.opacity = '';
  zoomDisc.style.visibility = '';
}

async function openDetail(updateHistory = true) {
  if (transitioning || detailShown || moving || !current()) return;
  transitioning = true;
  toggleIndex(false);
  const film = current();
  const button = discElements[currentIndex];
  populateDetail(film);
  if (reducedMotion.matches) {
    if (updateHistory) history.pushState({ film: film.slug }, '', detailPath(film));
    detail.hidden = false;
    detailShown = true;
    stage.inert = true;
    $('gallery').classList.add('detail-active');
    detail.classList.add('is-visible');
    $('detail-back').focus();
    transitioning = false;
    return;
  }
  const g = portalGeometry(button);
  await preparePortal(film, g);
  button.style.visibility = 'hidden';
  const enter = [
    iris.animate([{ clipPath: `circle(0px at ${g.cx}px ${g.cy}px)` }, { clipPath: `circle(${g.radius}px at ${g.cx}px ${g.cy}px)` }], { duration: 780, easing: 'cubic-bezier(.23,.65,.12,1)', fill: 'forwards' }),
    zoomDisc.animate([{ transform: 'translate(0,0) scale(1) rotate(-17deg) rotateY(-26deg)', opacity: 1 }, { transform: `translate(${g.dx}px,${g.dy}px) scale(${g.scale}) rotate(108deg) rotateY(125deg)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.2,.68,.08,1)', fill: 'forwards' }),
  ];
  await Promise.all(enter.map((animation) => animation.finished));
  if (updateHistory) history.pushState({ film: film.slug }, '', detailPath(film));
  detail.hidden = false;
  detail.scrollTop = 0;
  detailShown = true;
  stage.inert = true;
  $('gallery').classList.add('detail-active');
  requestAnimationFrame(() => detail.classList.add('is-visible'));
  const reveal = portal.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  await reveal.finished;
  finishPortal([...enter, reveal]);
  button.style.visibility = '';
  $('detail-back').focus();
  transitioning = false;
}

async function closeDetail(updateHistory = true) {
  if (transitioning || !detailShown) return;
  transitioning = true;
  const film = current();
  if (reducedMotion.matches) {
    detail.hidden = true;
    detail.classList.remove('is-visible');
    detailShown = false;
    stage.inert = false;
    $('gallery').classList.remove('detail-active');
    document.body.classList.remove('direct-detail');
    if (updateHistory) history.pushState({}, '', basePath());
    document.title = `A24 — ${category === 'films' ? 'Films' : 'Television'}`;
    discElements[currentIndex]?.focus();
    transitioning = false;
    return;
  }
  detail.classList.remove('is-visible');
  detail.classList.add('is-leaving');
  await delay(240);
  const g = portalGeometry(discElements[currentIndex]);
  await preparePortal(film, g);
  detail.hidden = true;
  detail.classList.remove('is-leaving');
  detailShown = false;
  stage.inert = false;
  $('gallery').classList.remove('detail-active');
  document.body.classList.remove('direct-detail');
  if (updateHistory) history.pushState({}, '', basePath());
  document.title = `A24 — ${category === 'films' ? 'Films' : 'Television'}`;
  const leave = [
    iris.animate([{ clipPath: `circle(${g.radius}px at ${g.cx}px ${g.cy}px)` }, { clipPath: `circle(0px at ${g.cx}px ${g.cy}px)` }], { duration: 660, easing: 'cubic-bezier(.6,0,.18,1)', fill: 'forwards' }),
    zoomDisc.animate([{ transform: `translate(${g.dx}px,${g.dy}px) scale(${g.scale}) rotate(108deg) rotateY(125deg)`, opacity: 0 }, { transform: 'translate(0,0) scale(1) rotate(-17deg) rotateY(-26deg)', opacity: 1 }], { duration: 660, easing: 'cubic-bezier(.6,0,.18,1)', fill: 'forwards' }),
  ];
  await Promise.all(leave.map((animation) => animation.finished));
  finishPortal(leave);
  discElements[currentIndex]?.focus();
  transitioning = false;
}

function setCategory(nextCategory, index = 0) {
  category = nextCategory;
  catalog = data[category] || [];
  currentIndex = index;
  createDiscs();
  renderIndex();
  fillFilmInfo();
  $('films-link').classList.toggle('active', category === 'films');
  $('tv-link').classList.toggle('active', category === 'television');
  document.title = `A24 — ${category === 'films' ? 'Films' : 'Television'}`;
}

function setInitialRoute() {
  const match = routePath().match(/^\/production\/([^/]+)/);
  if (!match) { setCategory(category); return; }
  const selected = Object.entries(data).flatMap(([group, items]) => items.map((film, index) => ({ group, film, index }))).find((entry) => entry.film.slug === match[1]);
  if (!selected) { setCategory(category); return; }
  setCategory(selected.group, selected.index);
  populateDetail(selected.film);
  detail.hidden = false;
  detailShown = true;
  stage.inert = true;
  $('gallery').classList.add('detail-active');
  requestAnimationFrame(() => { detail.classList.add('is-visible'); $('detail-back').focus(); });
}

$('index-toggle').addEventListener('click', () => toggleIndex());
$('detail-back').addEventListener('click', () => closeDetail());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { if (detailShown) closeDetail(); else toggleIndex(false); return; }
  if (detailShown || transitioning || moving || event.target.closest('.index-panel')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
  if (event.key === 'Enter' && (event.target === document.body || stage.contains(event.target))) {
    event.preventDefault();
    openDetail();
  }
  if (event.code === 'Space' && (event.target === document.body || stage.contains(event.target))) {
    event.preventDefault();
    discElements[currentIndex].classList.toggle('is-flipped');
  }
});
stage.addEventListener('wheel', (event) => {
  if (Math.abs(event.deltaY) < 14) return;
  const now = Date.now();
  if (now - lastWheelAt < 650) return;
  lastWheelAt = now;
  move(event.deltaY > 0 ? 1 : -1);
}, { passive: true });
stage.addEventListener('pointerdown', (event) => { swipeStart = { x: event.clientX, y: event.clientY }; });
stage.addEventListener('pointerup', (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
    suppressClick = true;
    move(dx < 0 ? 1 : -1);
    setTimeout(() => { suppressClick = false; }, 400);
  }
  swipeStart = null;
});
stage.addEventListener('pointermove', (event) => {
  if (!catalog.length || detailShown || moving || event.pointerType === 'touch') return;
  const face = discElements[currentIndex]?.querySelector('.disc-face');
  if (!face) return;
  face.style.setProperty('--tilt-x', `${((event.clientX / innerWidth) - .5) * 6}deg`);
  face.style.setProperty('--tilt-y', `${((event.clientY / innerHeight) - .5) * -5}deg`);
});
stage.addEventListener('pointerleave', () => {
  const face = discElements[currentIndex]?.querySelector('.disc-face');
  if (face) { face.style.removeProperty('--tilt-x'); face.style.removeProperty('--tilt-y'); }
});
window.addEventListener('popstate', () => {
  const match = routePath().match(/^\/production\/([^/]+)/);
  if (!match && detailShown) closeDetail(false);
  else if (match && !detailShown) {
    const index = catalog.findIndex((film) => film.slug === match[1]);
    if (index >= 0) { currentIndex = index; positionDiscs(); fillFilmInfo(); openDetail(false); }
  }
});

fetch(withRoot('/catalog.json')).then((response) => {
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}).then((catalogData) => {
  data = catalogData;
  setInitialRoute();
}).catch(() => {
  $('index-panel').textContent = 'The catalog could not be loaded.';
}).finally(() => { void finishLoading(); });
