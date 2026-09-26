const $ = (id) => document.getElementById(id);
const category = location.pathname.startsWith('/television') ? 'television' : 'films';
let catalog = [];
let currentIndex = 0;
let lastWheelAt = 0;

const asText = (element, value) => { element.textContent = value || ''; };
const current = () => catalog[currentIndex];

function updateStars(rating) {
  const value = Number(rating.stars || 0);
  return '★'.repeat(Math.floor(value)) + (value % 1 ? '½' : '');
}

function render() {
  const film = current();
  if (!film) return;
  asText($('film-title'), film.title);
  asText($('film-director'), film.director);
  asText($('film-year'), film.year);
  const starring = $('film-starring');
  starring.replaceChildren();
  film.starring.forEach((name, i) => {
    if (i) starring.append(document.createElement('br'));
    starring.append(document.createTextNode(name));
  });
  $('disc-image').src = film.image;
  $('disc-image').alt = `${film.title} disc artwork`;
  $('previous-image').src = catalog[(currentIndex - 1 + catalog.length) % catalog.length].image;
  $('next-image').src = catalog[(currentIndex + 1) % catalog.length].image;
  $('previous-film').setAttribute('aria-label', `Previous: ${catalog[(currentIndex - 1 + catalog.length) % catalog.length].title}`);
  $('next-film').setAttribute('aria-label', `Next: ${catalog[(currentIndex + 1) % catalog.length].title}`);
  $('current-film').setAttribute('aria-label', `View details for ${film.title}`);
  $('current-film').classList.remove('flipped');
  const reviews = $('reviews');
  reviews.replaceChildren();
  film.reviews.forEach((review) => {
    const card = document.createElement('div');
    const stars = document.createElement('span');
    stars.className = 'review-stars';
    stars.textContent = updateStars(review);
    const publication = document.createElement('small');
    publication.textContent = review.publication;
    const quote = document.createElement('p');
    quote.textContent = review.quote;
    card.append(stars, publication, quote);
    reviews.append(card);
  });
  [...$('index-panel').querySelectorAll('button')].forEach((button, i) => button.setAttribute('aria-current', String(i === currentIndex)));
  document.title = `A24 — ${category === 'films' ? 'Films' : 'Television'}`;
}

function move(delta) {
  if (!catalog.length || !$('detail').hidden) return;
  currentIndex = (currentIndex + delta + catalog.length) % catalog.length;
  render();
}

function select(index) {
  currentIndex = index;
  render();
  toggleIndex(false);
}

function toggleIndex(force) {
  const panel = $('index-panel');
  const open = typeof force === 'boolean' ? force : panel.hidden;
  panel.hidden = !open;
  $('index-toggle').setAttribute('aria-expanded', String(open));
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

function openDetail() {
  const film = current();
  if (!film) return;
  toggleIndex(false);
  asText($('detail-title'), film.title);
  asText($('detail-category'), category === 'films' ? 'A24 FILM' : 'A24 TELEVISION');
  const lines = $('detail-lines');
  lines.replaceChildren();
  [['DIRECTED BY', film.director], ['YEAR', film.year], ['STARRING', film.starring.join(', ')], ['COLLECTION', category === 'films' ? 'Films' : 'Television']].forEach(([label, value]) => {
    const row = document.createElement('div');
    const small = document.createElement('small');
    const span = document.createElement('span');
    small.textContent = label;
    span.textContent = value;
    row.append(small, span);
    lines.append(row);
  });
  const review = film.reviews[0];
  $('detail-review').replaceChildren();
  if (review) {
    $('detail-review').append(document.createTextNode(`“${review.quote}”`));
    const small = document.createElement('small');
    small.textContent = `${review.publication} · ${updateStars(review)}`;
    $('detail-review').append(small);
  }
  $('detail').hidden = false;
  $('detail-close').focus();
}

function closeDetail() {
  $('detail').hidden = true;
  $('current-film').focus();
}

$('previous-film').addEventListener('click', () => move(-1));
$('next-film').addEventListener('click', () => move(1));
$('current-film').addEventListener('click', openDetail);
$('index-toggle').addEventListener('click', () => toggleIndex());
$('detail-close').addEventListener('click', closeDetail);
$('detail-back').addEventListener('click', closeDetail);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { if (!$('detail').hidden) closeDetail(); else toggleIndex(false); return; }
  if (!$('detail').hidden || event.target.closest('.index-panel')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
  if (event.code === 'Space' && (event.target === document.body || event.target === $('current-film'))) { event.preventDefault(); $('current-film').classList.toggle('flipped'); }
});
document.addEventListener('wheel', (event) => {
  if (event.target.closest('.dock, .detail') || Math.abs(event.deltaY) < 18) return;
  const now = Date.now();
  if (now - lastWheelAt < 550) return;
  lastWheelAt = now;
  move(event.deltaY > 0 ? 1 : -1);
}, { passive: true });
let touchX = null;
$('disc-gallery').addEventListener('touchstart', (event) => { touchX = event.touches[0].clientX; }, { passive: true });
$('disc-gallery').addEventListener('touchend', (event) => {
  if (touchX === null) return;
  const distance = event.changedTouches[0].clientX - touchX;
  if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
  touchX = null;
}, { passive: true });

fetch('/catalog.json').then((response) => {
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}).then((data) => {
  catalog = data[category] || [];
  renderIndex();
  render();
  $('films-link').classList.toggle('active', category === 'films');
  $('tv-link').classList.toggle('active', category === 'television');
}).catch(() => {
  $('index-panel').textContent = 'The catalog could not be loaded.';
});
