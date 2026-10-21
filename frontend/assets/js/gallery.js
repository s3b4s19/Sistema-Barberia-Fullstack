const STAR_PATH =
  'M12 3.2l2.7 5.4 6 .9-4.3 4.2 1 5.9-5.4-2.8-5.4 2.8 1-5.9-4.3-4.2 6-.9z';

function starIcon(filled) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', STAR_PATH);
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', filled ? '0.8' : '1.2');
  svg.append(path);

  return svg;
}

function formatReviewDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es-CL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(date);
}

function reviewCard(review) {
  const article = document.createElement('article');
  article.className = 'review';

  const stars = document.createElement('div');
  stars.className = 'review__stars';
  stars.setAttribute('role', 'img');
  stars.setAttribute('aria-label', `${review.rating} de 5 estrellas`);

  for (let index = 1; index <= 5; index += 1) {
    stars.append(starIcon(index <= review.rating));
  }

  const quote = document.createElement('blockquote');
  quote.className = 'review__quote';
  const text = document.createElement('p');
  text.textContent = review.comment || 'Una buena experiencia en la barbería.';
  quote.append(text);

  const meta = document.createElement('p');
  meta.className = 'review__meta';

  const barberName = review.barbers?.displayName;
  const parts = [];

  if (barberName) {
    const name = document.createElement('span');
    name.className = 'review__name';
    name.textContent = barberName;
    meta.append(name);
    parts.push('name');
  }

  const date = formatReviewDate(review.createdAt);

  if (date) {
    if (parts.length > 0) {
      meta.append(document.createTextNode(' · '));
    }

    meta.append(document.createTextNode(date));
  }

  article.append(stars, quote, meta);
  return article;
}

export function renderReviews(list, container, layout, reviews) {
  if (!list || !container) {
    return;
  }

  const items = Array.isArray(reviews) ? reviews.filter((review) => review?.isPublished !== false) : [];

  if (items.length === 0) {
    container.hidden = true;
    layout?.classList.add('gallery__layout--solo');
    return;
  }

  list.replaceChildren();

  for (const review of items) {
    list.append(reviewCard(review));
  }

  container.hidden = false;
  layout?.classList.remove('gallery__layout--solo');
}

export function initCarousel() {
  const carousel = document.querySelector('[data-carousel]');
  const viewport = document.querySelector('[data-carousel-viewport]');
  const controls = document.querySelector('[data-carousel-controls]');
  const prev = document.querySelector('[data-carousel-prev]');
  const next = document.querySelector('[data-carousel-next]');
  const counter = document.querySelector('[data-carousel-counter]');

  if (!carousel || !viewport) {
    return;
  }

  const slides = [...viewport.querySelectorAll('.carousel__slide')];

  if (slides.length === 0) {
    return;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index = 0;
  let scrollTimer = 0;

  function setControls(nextIndex) {
    if (prev) {
      prev.disabled = nextIndex <= 0;
    }

    if (next) {
      next.disabled = nextIndex >= slides.length - 1;
    }

    if (counter) {
      counter.textContent = `${nextIndex + 1} / ${slides.length}`;
    }

    carousel.dataset.index = String(nextIndex);
  }

  function scrollToSlide(nextIndex) {
    const target = Math.max(0, Math.min(nextIndex, slides.length - 1));
    const offset = slides[target].offsetLeft - slides[0].offsetLeft;

    viewport.scrollTo({
      left: offset,
      behavior: reduced ? 'auto' : 'smooth',
    });

    index = target;
    setControls(index);
  }

  function updateFromScroll() {
    const position = viewport.scrollLeft;
    let nearest = 0;
    let distance = Infinity;

    slides.forEach((slide, slideIndex) => {
      const offset = slide.offsetLeft - slides[0].offsetLeft;
      const current = Math.abs(offset - position);

      if (current < distance) {
        distance = current;
        nearest = slideIndex;
      }
    });

    if (nearest !== index) {
      index = nearest;
      setControls(index);
    }
  }

  viewport.addEventListener('scroll', () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(updateFromScroll, 90);
  });

  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    scrollToSlide(index + (event.key === 'ArrowRight' ? 1 : -1));
  });

  prev?.addEventListener('click', () => scrollToSlide(index - 1));
  next?.addEventListener('click', () => scrollToSlide(index + 1));

  window.addEventListener('resize', () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      if (window.matchMedia('(min-width: 64em)').matches) {
        return;
      }

      scrollToSlide(index);
    }, 150);
  });

  for (const image of viewport.querySelectorAll('img')) {
    image.addEventListener(
      'error',
      () => {
        const slide = image.closest('.carousel__slide');
        image.hidden = true;
        slide?.classList.add('carousel__slide--missing');
      },
      { once: true },
    );
  }

  if (controls) {
    controls.hidden = false;
  }

  setControls(0);
}
