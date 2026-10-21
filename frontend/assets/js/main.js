import {
  getBarbers,
  getHours,
  getReviews,
  getServices,
  getSettings,
} from './api.js';
import { initAppointmentManager } from './appointment.js';
import { initBooking } from './booking.js';
import { renderCatalog } from './catalog.js';
import {
  formatPhone,
  normalizeWhatsAppHandle,
  todayInZone,
  weekdayOf,
  whatsappHref,
} from './format.js';
import { initCarousel, renderReviews } from './gallery.js';

function valueOf(result, fallback = null) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function setTextAll(selector, value) {
  if (!value) {
    return;
  }

  for (const element of document.querySelectorAll(selector)) {
    element.textContent = value;
  }
}

function hideElement(element) {
  if (element) {
    element.hidden = true;
  }
}

function showElement(element) {
  if (element) {
    element.hidden = false;
  }
}

function renderBusiness(settings) {
  if (!settings) {
    return;
  }

  const businessName = settings.businessName || 'Barbería';
  const city = settings.city || 'Santiago';

  setTextAll('[data-business-name]', businessName);
  setTextAll('[data-business-place]', `${city}, Chile`);
  setTextAll('[data-address]', settings.address || `${city}, Chile`);

  document.title = `${businessName} | Reserva tu hora en ${city}`;

  const phoneLink = document.querySelector('[data-phone-link]');
  const phoneText = document.querySelector('[data-phone]');

  if (settings.phone && phoneLink && phoneText) {
    phoneText.textContent = formatPhone(settings.phone);
    phoneLink.href = `tel:${settings.phone}`;
    showElement(phoneLink);
  } else {
    hideElement(phoneLink);
  }

  const emailLink = document.querySelector('[data-email-link]');
  const emailText = document.querySelector('[data-email]');

  if (settings.email && emailLink && emailText) {
    emailText.textContent = settings.email;
    emailLink.href = `mailto:${settings.email}`;
    showElement(emailLink);
  } else {
    hideElement(emailLink);
  }

  const instagram = document.querySelector('[data-instagram]');

  if (instagram) {
    if (settings.instagram) {
      const handle = normalizeWhatsAppHandle(settings.instagram);
      instagram.href = /^https?:\/\//i.test(handle) ? handle : `https://instagram.com/${handle}`;
      showElement(instagram.closest('li'));
    } else {
      hideElement(instagram.closest('li'));
    }
  }

  const whatsapp = document.querySelector('[data-whatsapp]');

  if (whatsapp) {
    if (settings.whatsapp) {
      whatsapp.href = whatsappHref(settings.whatsapp);
      showElement(whatsapp.closest('li'));
    } else {
      hideElement(whatsapp.closest('li'));
    }
  }

  const maps = document.querySelector('[data-maps-link]');

  if (settings.mapsUrl && maps) {
    maps.href = settings.mapsUrl;
    showElement(maps);
  } else {
    hideElement(maps);
  }

  const year = document.querySelector('[data-year]');

  if (year) {
    year.textContent = todayInZone(settings.timezone || 'America/Santiago').slice(0, 4);
  }
}

function renderHours(container, hours) {
  if (!container) {
    return;
  }

  if (!hours?.days?.length) {
    container.replaceChildren();

    const row = document.createElement('div');
    row.className = 'hours__row hours__row--closed';

    const term = document.createElement('dt');
    term.textContent = 'Horario';

    const description = document.createElement('dd');
    description.textContent = 'No disponible';

    row.append(term, description);
    container.append(row);
    return;
  }

  const timezone = hours.timeZone || 'America/Santiago';
  const today = weekdayOf(todayInZone(timezone));
  const orderedDays = [...hours.days].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7),
  );
  container.replaceChildren();

  for (const day of orderedDays) {
    const row = document.createElement('div');
    row.className = 'hours__row';
    row.classList.toggle('hours__row--today', day.weekday === today);
    row.classList.toggle('hours__row--closed', !day.isOpen);

    if (day.weekday === today) {
      row.setAttribute('aria-current', 'date');
    }

    const term = document.createElement('dt');
    term.textContent = day.label;

    const description = document.createElement('dd');
    description.textContent = day.isOpen
      ? day.shifts.map((shift) => `${shift.start}–${shift.end}`).join(' · ')
      : 'Cerrado';

    row.append(term, description);
    container.append(row);
  }
}

function flattenServices(categories) {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories.flatMap((category) =>
    (category.services ?? []).map((service) => ({
      ...service,
      categoryName: category.name,
    })),
  );
}

function renderFailure(container, message, onRetry) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  container.setAttribute('aria-busy', 'false');

  const text = document.createElement('p');
  text.className = 'state';
  text.textContent = message;

  const button = document.createElement('button');
  button.className = 'button button--ghost';
  button.type = 'button';
  button.textContent = 'Reintentar';
  button.addEventListener('click', onRetry);

  container.append(text, button);
}

async function bootstrap() {
  const results = await Promise.allSettled([
    getSettings(),
    getServices(),
    getBarbers(),
    getHours(),
    getReviews(20),
  ]);

  const [settingsResult, servicesResult, barbersResult, hoursResult, reviewsResult] = results;
  const settings = valueOf(settingsResult);
  const catalog = valueOf(servicesResult);
  const barbers = valueOf(barbersResult, []);
  const hours = valueOf(hoursResult);
  const reviews = valueOf(reviewsResult, []);

  renderBusiness(settings);
  renderHours(document.querySelector('[data-hours-hero]'), hours);
  renderHours(document.querySelector('[data-hours-footer]'), hours);

  const categories = catalog?.categories ?? [];
  const services = flattenServices(categories);
  const catalogContainer = document.querySelector('[data-catalog]');

  if (servicesResult.status === 'rejected') {
    renderFailure(
      catalogContainer,
      'No pudimos cargar los servicios. Revisa tu conexión e intenta nuevamente.',
      () => window.location.reload(),
    );
  }

  const booking = initBooking({
    services,
    barbers,
    settings: settings ?? { timezone: 'America/Santiago', maxAdvanceDays: 60 },
    hours,
  });

  initAppointmentManager({
    timezone: settings?.timezone || 'America/Santiago',
  });

  if (services.length > 0) {
    renderCatalog(catalogContainer, categories, (service) => {
      booking.selectService(service);
    });
  }

  renderReviews(
    document.querySelector('[data-review-list]'),
    document.querySelector('[data-reviews]'),
    document.querySelector('[data-gallery-layout]'),
    reviews,
  );

  initCarousel();

  const bookingSection = document.querySelector('#reserva');
  const heroSection = document.querySelector('#inicio');
  const mobileCta = document.querySelector('.mobile-cta');

  if (mobileCta && 'IntersectionObserver' in window) {
    const visibility = { hero: true, booking: false };
    const syncCta = () => {
      mobileCta.classList.toggle('mobile-cta--hidden', visibility.hero || visibility.booking);
    };

    const watch = (element, key) => {
      if (!element) {
        return;
      }

      new IntersectionObserver(
        ([entry]) => {
          visibility[key] = entry.isIntersecting;
          syncCta();
        },
        { rootMargin: '0px 0px -10% 0px', threshold: 0 },
      ).observe(element);
    };

    watch(heroSection, 'hero');
    watch(bookingSection, 'booking');
    syncCta();
  }

  const heroImage = document.querySelector('.hero__image');

  if (heroImage) {
    heroImage.addEventListener(
      'error',
      () => {
        heroImage.hidden = true;
      },
      { once: true },
    );
  }

  if (hoursResult.status === 'rejected') {
    for (const container of document.querySelectorAll('[data-hours-hero], [data-hours-footer]')) {
      renderHours(container, null);
    }
  }

  if (barbersResult.status === 'rejected') {
    const note = document.querySelector('[data-barber-note]');
    note.textContent = 'No pudimos cargar los barberos. Recarga la página para reservar.';
  }
}

bootstrap();
