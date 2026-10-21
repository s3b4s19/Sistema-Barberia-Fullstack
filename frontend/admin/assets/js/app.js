import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  ApiError,
  changePassword,
  clearSession,
  login,
  logout,
  restoreSession,
  setUnauthorizedHandler,
} from './api.js';
import {
  addDays,
  dateInZone,
  escapeHtml as h,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPrice,
  formatTime,
  formatTimeInput,
  initials,
  methodLabel,
  normalizePhone,
  paymentStatusLabel,
  slugify,
  sourceLabel,
  statusLabel,
  timeInZone,
  todayInZone,
  WEEKDAYS,
  zonedDateStart,
  zonedDateTimeToIso,
} from './format.js';
import { icon } from './icons.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toastRegion = document.querySelector('#toast-region');
const printRoot = document.querySelector('#print-root');

const THEME_KEY = 'barberia.admin.theme';

const DEFAULT_SETTINGS = {
  businessName: 'Barbería',
  legalName: '',
  taxId: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  timezone: 'America/Santiago',
  currency: 'CLP',
  locale: 'es-CL',
  phonePrefix: '+56',
  slotIntervalMin: 15,
  minAdvanceMin: 60,
  maxAdvanceDays: 60,
  cancellationHours: 12,
  depositPercent: 0,
  taxRate: 19,
  pricesIncludeTax: true,
  instagram: '',
  whatsapp: '',
  mapsUrl: '',
  logoUrl: '',
};

const state = {
  user: null,
  settings: { ...DEFAULT_SETTINGS },
  route: '',
  params: {},
  cache: {},
};

const ADMIN_NAV = [
  {
    label: 'Operación',
    items: [
      { path: '/inicio', label: 'Inicio', icon: 'dashboard' },
      { path: '/agenda', label: 'Agenda', icon: 'calendar' },
      { path: '/citas', label: 'Citas', icon: 'list' },
      { path: '/clientes', label: 'Clientes', icon: 'users' },
    ],
  },
  {
    label: 'Negocio',
    items: [
      { path: '/catalogo', label: 'Catálogo', icon: 'scissors' },
      { path: '/barberos', label: 'Barberos', icon: 'user' },
      { path: '/bloqueos', label: 'Bloqueos', icon: 'clock' },
    ],
  },
  {
    label: 'Caja',
    items: [
      { path: '/ventas', label: 'Ventas y pagos', icon: 'cash' },
      { path: '/inventario', label: 'Inventario', icon: 'box' },
    ],
  },
  {
    label: 'Control',
    items: [
      { path: '/resenas', label: 'Reseñas', icon: 'star' },
      { path: '/configuracion', label: 'Configuración', icon: 'settings' },
      { path: '/auditoria', label: 'Auditoría', icon: 'shield' },
    ],
  },
];

const BARBER_NAV = [
  {
    label: 'Mi trabajo',
    items: [
      { path: '/mi-agenda', label: 'Mi agenda', icon: 'calendar' },
      { path: '/mis-clientes', label: 'Mis clientes', icon: 'users' },
      { path: '/mi-bloqueos', label: 'Mis bloqueos', icon: 'clock' },
    ],
  },
];

const tz = () => state.settings.timezone || DEFAULT_SETTINGS.timezone;
const currency = () => state.settings.currency || DEFAULT_SETTINGS.currency;
const money = (value) => formatPrice(value, currency());
const today = () => todayInZone(tz());

function q(selector, root = document) {
  return root.querySelector(selector);
}

function qa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function syncThemeButtons() {
  const dark = currentTheme() === 'dark';

  qa('[data-theme-toggle]').forEach((button) => {
    button.innerHTML = icon(dark ? 'sun' : 'moon', 18);
    button.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    button.setAttribute('aria-pressed', String(dark));
  });
}

function applyTheme(theme, persist = false) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;

  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage puede no estar disponible; el tema dura lo que la sesión.
    }
  }

  syncThemeButtons();
}

function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
}

function initialTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch {
    // Ignorar almacenamiento no disponible.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function toast(message, type = 'info', timeout = 4200) {
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.textContent = message;
  toastRegion.append(node);

  window.setTimeout(() => {
    node.remove();
  }, timeout);
}

function loadingBlock(message = 'Cargando información.') {
  return `<div class="loading" role="status">${h(message)}</div>`;
}

function emptyState(title, message = '', action = '') {
  return `
    <div class="empty-state">
      <p class="empty-state__title">${h(title)}</p>
      ${message ? `<p>${h(message)}</p>` : ''}
      ${action}
    </div>
  `;
}

function errorBlock(error, retry = null) {
  const message = error?.message || 'No pudimos cargar la información.';
  return `
    <div class="error-state" role="alert">
      <p>${h(message)}</p>
      ${retry ? '<button class="button button--small" type="button" data-retry>Reintentar</button>' : ''}
    </div>
  `;
}

function setBusy(button, busy, label = 'Guardando...') {
  if (!button) {
    return;
  }

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function badge(status, label = null) {
  const safe = String(status ?? '').replace(/[^a-z_]/g, '');
  return `<span class="badge badge--${safe}">${h(label ?? statusLabel(status))}</span>`;
}

function paymentBadge(status) {
  const safe = String(status ?? '').replace(/[^a-z_]/g, '');
  return `<span class="badge badge--${safe}">${h(paymentStatusLabel(status))}</span>`;
}

function pageHead(title, lead, actions = '') {
  return `
    <header class="page__head">
      <div>
        <h1 class="page__title">${h(title)}</h1>
        ${lead ? `<p class="page__lead">${h(lead)}</p>` : ''}
      </div>
      ${actions ? `<div class="page__actions">${actions}</div>` : ''}
    </header>
  `;
}

function option(value, label, selected = false) {
  return `<option value="${h(value)}"${selected ? ' selected' : ''}>${h(label)}</option>`;
}

function selectOptions(items, selectedValue, { valueKey = 'id', labelKey = 'name', placeholder = '' } = {}) {
  return [
    placeholder ? option('', placeholder, !selectedValue) : '',
    ...items.map((item) =>
      option(item[valueKey], item[labelKey], String(item[valueKey]) === String(selectedValue)),
    ),
  ].join('');
}

function readCheckbox(form, name) {
  return Boolean(form.elements.namedItem(name)?.checked);
}

function value(form, name) {
  return form.elements.namedItem(name)?.value?.trim() ?? '';
}

function closeModal() {
  if (modal.open) {
    modal.close();
  }

  modal.innerHTML = '';
}

function openModal({ title, subtitle = '', body, footer = '', wide = false, narrow = false, onMount = null }) {
  modal.className = `modal${wide ? ' modal--wide' : ''}${narrow ? ' modal--narrow' : ''}`;
  modal.innerHTML = `
    <div class="modal__panel">
      <div class="modal__head">
        <div>
          <h2 class="modal__title" id="modal-title">${h(title)}</h2>
          ${subtitle ? `<p class="modal__subtitle">${h(subtitle)}</p>` : ''}
        </div>
        <button class="modal__close" type="button" data-modal-close aria-label="Cerrar">${icon('close', 18)}</button>
      </div>
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__foot">${footer}</footer>` : ''}
    </div>
  `;

  if (!modal.open) {
    modal.showModal();
  }

  qa('[data-modal-close]', modal).forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  onMount?.(modal);

  const focusable = q('input, select, textarea, button:not([data-modal-close])', modal);
  focusable?.focus();
}

function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = false, onConfirm }) {
  openModal({
    title,
    narrow: true,
    body: `<p>${message}</p>`,
    footer: `
      <button class="button button--ghost" type="button" data-modal-close>Cancelar</button>
      <button class="button ${danger ? 'button--danger' : ''}" type="submit" form="confirm-form">${h(confirmLabel)}</button>
    `,
    onMount: (dialog) => {
      const form = document.createElement('form');
      form.id = 'confirm-form';
      form.hidden = true;
      dialog.append(form);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[form="confirm-form"]', dialog);
        setBusy(button, true, 'Procesando...');

        try {
          await onConfirm();
          closeModal();
        } catch (error) {
          setBusy(button, false);
          toast(error.message, 'error');
        }
      });
    },
  });
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return {
    path: path === '/' ? '/' : path.replace(/\/+$/, ''),
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

function navigate(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, item]) => item !== undefined && item !== null && item !== ''),
  ).toString();
  const hash = `#${path}${query ? `?${query}` : ''}`;

  if (window.location.hash === hash) {
    renderRoute();
  } else {
    window.location.hash = hash;
  }
}

function defaultPath() {
  return state.user?.role === 'barbero' ? '/mi-agenda' : '/inicio';
}

function navFor(role) {
  return role === 'admin' ? ADMIN_NAV : BARBER_NAV;
}

function isActivePath(active, path) {
  return active === path || active.startsWith(`${path}/`);
}

function renderShell(active, title) {
  const nav = navFor(state.user.role);
  const navHtml = nav
    .map(
      (group) => `
        <div class="admin-nav__group">
          <p class="admin-nav__label">${h(group.label)}</p>
          ${group.items
            .map(
              (item) => `
                <a class="admin-nav__link" href="#${item.path}" ${isActivePath(active, item.path) ? 'aria-current="page"' : ''}>
                  ${icon(item.icon, 18)}
                  <span>${h(item.label)}</span>
                </a>
              `,
            )
            .join('')}
        </div>
      `,
    )
    .join('');

  app.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar" id="admin-sidebar" data-open="false" aria-label="Navegación del panel">
        <div class="admin-sidebar__brand">
          <span class="admin-sidebar__mark" aria-hidden="true">${h(initials(state.settings.businessName) || 'B')}</span>
          <div>
            <p class="admin-sidebar__name">${h(state.settings.businessName)}</p>
            <p class="admin-sidebar__caption">Panel de staff</p>
          </div>
        </div>
        <nav class="admin-sidebar__nav">${navHtml}</nav>
        <div class="admin-sidebar__foot">
          <p>${h(state.user.email)}</p>
          <p>${state.user.role === 'admin' ? 'Administrador' : 'Barbero'}</p>
        </div>
      </aside>

      <div class="admin-backdrop" id="admin-backdrop" hidden></div>

      <div class="admin-main">
        <header class="admin-topbar">
          <div class="admin-topbar__left">
            <button class="button button--ghost button--icon" type="button" data-menu-toggle aria-label="Abrir menú" aria-controls="admin-sidebar" aria-expanded="false">
              ${icon('menu', 20)}
            </button>
            <div class="admin-topbar__context">
              <span class="admin-topbar__eyebrow">${h(state.settings.businessName)}</span>
              <span class="admin-topbar__title">${h(title)}</span>
            </div>
          </div>
          <div class="admin-topbar__right">
            <button class="button button--ghost button--icon" type="button" data-theme-toggle aria-label="Activar modo oscuro" aria-pressed="false">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', 18)}</button>
            <div class="admin-topbar__user">
              <p class="admin-topbar__user-name">${h(state.user.fullName || state.user.email)}</p>
              <p class="admin-topbar__user-role">${state.user.role === 'admin' ? 'Administrador' : 'Barbero'}</p>
            </div>
            <a class="button button--ghost button--small" href="#/mi-perfil">Mi perfil</a>
            <button class="button button--ghost button--small" type="button" data-logout>Salir</button>
          </div>
        </header>
        <main class="admin-content" id="contenido">
          <div id="view"></div>
        </main>
      </div>
    </div>
  `;

  const sidebar = q('#admin-sidebar');
  const backdrop = q('#admin-backdrop');
  const toggle = q('[data-menu-toggle]');

  const closeMenu = () => {
    sidebar.dataset.open = 'false';
    backdrop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle?.addEventListener('click', () => {
    const open = sidebar.dataset.open !== 'true';
    sidebar.dataset.open = String(open);
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  backdrop?.addEventListener('click', closeMenu);

  qa('.admin-nav__link', app).forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  q('[data-theme-toggle]')?.addEventListener('click', toggleTheme);

  q('[data-logout]')?.addEventListener('click', async () => {
    await logout();
    state.user = null;
    navigate('/login');
  });

  syncThemeButtons();

  return q('#view');
}

function renderError(container, error, retry = null) {
  container.innerHTML = `
    <div class="page">
      ${pageHead('No pudimos cargar la vista', 'Revisa la conexión con la API e intenta nuevamente.')}
      ${errorBlock(error, Boolean(retry))}
    </div>
  `;

  if (retry) {
    q('[data-retry]', container)?.addEventListener('click', retry);
  }
}

async function loadSettings() {
  try {
    state.settings = { ...DEFAULT_SETTINGS, ...(await apiGet('/public/settings')) };
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

function renderLogin(message = '') {
  app.innerHTML = `
    <main class="login" id="contenido" tabindex="-1">
      <section class="login__panel" aria-labelledby="login-title">
        <button class="button button--ghost button--icon login__theme" type="button" data-theme-toggle aria-label="Activar modo oscuro" aria-pressed="false">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', 18)}</button>
        <div class="login__brand">
          <span class="login__mark" aria-hidden="true">${h(initials(state.settings.businessName) || 'B')}</span>
          <div>
            <p class="admin-sidebar__caption">Panel de staff</p>
            <p class="admin-topbar__title">${h(state.settings.businessName)}</p>
          </div>
        </div>
        <div>
          <h1 class="login__title" id="login-title">Iniciar sesión</h1>
          <p class="login__lead">Acceso exclusivo para administradores y barberos.</p>
        </div>
        <form class="login__form" data-login-form novalidate>
          <div class="field">
            <label class="field__label" for="login-identifier">Correo o usuario</label>
            <input class="field__input" id="login-identifier" name="identifier" type="text" autocomplete="username" minlength="3" maxlength="254" required>
          </div>
          <div class="field">
            <label class="field__label" for="login-password">Contraseña</label>
            <input class="field__input" id="login-password" name="password" type="password" autocomplete="current-password" minlength="8" required>
          </div>
          <p class="form-error" data-login-error role="alert" ${message ? '' : 'hidden'}>${h(message)}</p>
          <button class="button button--block" type="submit">Entrar</button>
          <p class="login__foot">La sesión se renueva automáticamente. No compartas tus credenciales.</p>
        </form>
      </section>
    </main>
  `;

  const form = q('[data-login-form]', app);
  const error = q('[data-login-error]', app);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = q('button[type="submit"]', form);
    const identifier = value(form, 'identifier');
    const password = value(form, 'password');

    error.hidden = true;
    setBusy(button, true, 'Ingresando...');

    try {
      const data = await login(identifier, password);
      state.user = data.user;
      await loadSettings();
      navigate(defaultPath());
    } catch (loginError) {
      error.textContent = loginError.message;
      error.hidden = false;
      setBusy(button, false);
      form.elements.namedItem('password')?.focus();
    }
  });

  q('[data-theme-toggle]', app)?.addEventListener('click', toggleTheme);
  syncThemeButtons();
}

async function renderRoute() {
  const { path, params } = parseHash();
  state.params = params;

  if (modal.open) {
    closeModal();
  }

  if (!state.user) {
    if (path !== '/login') {
      window.location.hash = '#/login';
    }
    renderLogin();
    return;
  }

  if (path === '/login') {
    navigate(defaultPath());
    return;
  }

  const segments = path.split('/').filter(Boolean);
  const route = findRoute(segments);

  if (!route) {
    const view = renderShell(`/${segments[0] ?? ''}`, 'Página no encontrada');
    view.innerHTML = `
      <div class="page">
        ${pageHead('Página no encontrada', 'La ruta solicitada no existe en el panel.')}
        <a class="button" href="#${defaultPath()}">Volver al inicio</a>
      </div>
    `;
    return;
  }

  if (route.adminOnly && state.user.role !== 'admin') {
    navigate('/mi-agenda');
    return;
  }

  if (route.role && route.role !== state.user.role) {
    navigate(defaultPath());
    return;
  }

  const active = `/${segments[0]}`;
  const view = renderShell(active, route.title);
  state.route = path;
  document.title = `${route.title} | ${state.settings.businessName}`;

  try {
    await route.render(view, segments.slice(1), params);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      state.user = null;
      renderLogin('La sesión expiró. Inicia sesión nuevamente.');
      return;
    }

    renderError(view, error, () => renderRoute());
  }
}

function findRoute(segments) {
  const [first, second] = segments;

  switch (first) {
    case 'inicio':
      return { title: 'Inicio', adminOnly: true, render: viewDashboard };
    case 'agenda':
      return { title: 'Agenda', adminOnly: true, render: viewAgenda };
    case 'citas':
      return { title: 'Citas', adminOnly: true, render: viewAppointments };
    case 'clientes':
      return second
        ? { title: 'Ficha del cliente', adminOnly: true, render: viewClientDetail }
        : { title: 'Clientes', adminOnly: true, render: viewClients };
    case 'catalogo':
      return { title: 'Catálogo', adminOnly: true, render: viewCatalog };
    case 'barberos':
      return second
        ? { title: 'Ficha del barbero', adminOnly: true, render: viewBarberDetail }
        : { title: 'Barberos', adminOnly: true, render: viewBarbers };
    case 'bloqueos':
      return { title: 'Bloqueos', adminOnly: true, render: viewTimeOff };
    case 'ventas':
      return second
        ? { title: 'Detalle de venta', adminOnly: true, render: viewSaleDetail }
        : { title: 'Ventas y pagos', adminOnly: true, render: viewSales };
    case 'inventario':
      return { title: 'Inventario', adminOnly: true, render: viewInventory };
    case 'resenas':
      return { title: 'Reseñas', adminOnly: true, render: viewReviews };
    case 'configuracion':
      return { title: 'Configuración', adminOnly: true, render: viewSettings };
    case 'auditoria':
      return { title: 'Auditoría', adminOnly: true, render: viewAudit };
    case 'mi-agenda':
      return { title: 'Mi agenda', role: 'barbero', render: viewMyAgenda };
    case 'mis-clientes':
      return { title: 'Mis clientes', role: 'barbero', render: viewMyClients };
    case 'mi-bloqueos':
      return { title: 'Mis bloqueos', role: 'barbero', render: viewMyTimeOff };
    case 'mi-perfil':
      return { title: 'Mi perfil', render: viewProfile };
    default:
      return null;
  }
}

/* --------------------------------------------------------------------------
   Utilidades de datos
   -------------------------------------------------------------------------- */

async function getAdminBarbers() {
  return apiGet('/admin/barbers');
}

async function getFormServices() {
  if (state.user.role === 'admin') {
    return apiGet('/admin/services');
  }

  const catalog = await apiGet('/public/services');
  return (catalog.categories ?? []).flatMap((category) =>
    (category.services ?? []).map((service) => ({ ...service, categoryName: category.name })),
  );
}

async function getFormBarbers() {
  if (state.user.role === 'admin') {
    return getAdminBarbers();
  }

  const barbers = await apiGet('/public/barbers');
  return barbers.filter((barber) => barber.id === state.user.barberId);
}

function serviceName(service) {
  return service?.name ?? 'Servicio';
}

function appointmentServicesText(appointment) {
  return (appointment.services ?? []).map((service) => service.name).join(', ') || 'Sin servicios';
}

function activeAppointment(status) {
  return ['pendiente', 'confirmada', 'en_curso'].includes(status);
}

function calendarDate(date, options = {}) {
  return formatDate(`${date}T12:00:00Z`, { timeZone: tz(), ...options });
}

function dateRangeLabel(from, to) {
  return `${calendarDate(from)} — ${calendarDate(to)}`;
}

/* --------------------------------------------------------------------------
   Dashboard
   -------------------------------------------------------------------------- */

async function viewDashboard(view) {
  const from = zonedDateStart(addDays(today(), -29), tz());
  const to = zonedDateStart(addDays(today(), 1), tz());
  const todayFrom = zonedDateStart(today(), tz());
  const todayTo = zonedDateStart(addDays(today(), 1), tz());
  const query = new URLSearchParams({ from, to }).toString();
  const todayQuery = new URLSearchParams({ from: todayFrom, to: todayTo }).toString();

  const [dashboard, agenda] = await Promise.all([
    apiGet(`/admin/dashboard?${query}`),
    apiGet(`/admin/appointments?${todayQuery}`),
  ]);

  const metrics = dashboard.metrics ?? {};
  const upcoming = agenda.filter((item) => item.status !== 'cancelada');
  const maxRevenue = Math.max(
    1,
    ...(dashboard.dailyRevenue ?? []).map((item) => Number(item.revenue) || 0),
  );

  view.innerHTML = `
    <div class="page">
      ${pageHead(
        'Inicio',
        `Resumen operativo de ${dateRangeLabel(addDays(today(), -29), today())}.`,
        `<button class="button" type="button" data-new-appointment>${icon('plus', 18)} Nueva cita</button>
         <button class="button button--ghost" type="button" data-new-sale>${icon('cash', 18)} Nueva venta</button>`,
      )}

      <section class="kpi-grid" aria-label="Indicadores del período">
        <article class="kpi"><span class="kpi__label">Citas</span><strong class="kpi__value">${formatNumber(metrics.appointmentsTotal)}</strong><span class="kpi__hint">${formatNumber(metrics.completed)} completadas</span></article>
        <article class="kpi"><span class="kpi__label">Ingresos</span><strong class="kpi__value">${money(metrics.revenue)}</strong><span class="kpi__hint">Propinas ${money(metrics.tips)}</span></article>
        <article class="kpi"><span class="kpi__label">Ticket promedio</span><strong class="kpi__value">${money(metrics.averageTicket)}</strong><span class="kpi__hint">${formatNumber(metrics.newClients)} clientes nuevos</span></article>
        <article class="kpi"><span class="kpi__label">Alertas</span><strong class="kpi__value">${formatNumber(metrics.lowStock)}</strong><span class="kpi__hint">productos bajo stock</span></article>
      </section>

      <div class="grid-2">
        <section class="panel">
          <header class="panel__head">
            <h2 class="panel__title">Ingresos diarios</h2>
            <span class="muted">${money(metrics.revenue)} en 30 días</span>
          </header>
          <div class="panel__body">
            ${
              (dashboard.dailyRevenue ?? []).length
                ? `<svg class="chart" viewBox="0 0 620 150" role="img" aria-label="Ingresos diarios del período">
                    <line x1="0" y1="132" x2="620" y2="132" stroke="#d9d0bd" stroke-width="1" />
                    ${(dashboard.dailyRevenue ?? [])
                      .slice(-30)
                      .map((item, index, list) => {
                        const width = 560 / Math.max(list.length, 1);
                        const height = (Number(item.revenue) / maxRevenue) * 110;
                        const x = 30 + index * width;
                        return `<rect x="${x.toFixed(1)}" y="${(132 - height).toFixed(1)}" width="${Math.max(width - 6, 3).toFixed(1)}" height="${Math.max(height, 1).toFixed(1)}" fill="#8a6a3b" rx="1"><title>${h(item.day)}: ${h(money(item.revenue))}</title></rect>`;
                      })
                      .join('')}
                  </svg>`
                : emptyState('Sin ingresos registrados', 'Las ventas y pagos del período aparecerán aquí.')
            }
          </div>
        </section>

        <section class="panel">
          <header class="panel__head">
            <h2 class="panel__title">Agenda de hoy</h2>
            <a class="link-button" href="#/agenda">Ver agenda</a>
          </header>
          <div class="panel__body">
            ${
              upcoming.length
                ? `<div class="agenda__list">${upcoming.slice(0, 8).map(appointmentCard).join('')}</div>`
                : emptyState('Sin citas para hoy', 'La agenda del día está despejada.')
            }
          </div>
        </section>
      </div>

      <div class="grid-2">
        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Comisiones del mes</h2></header>
          <div class="panel__body panel__body--flush">
            ${
              (dashboard.commissions ?? []).length
                ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Barbero</th><th>Ingresos</th><th>Comisión</th></tr></thead><tbody>${dashboard.commissions
                    .map(
                      (item) => `<tr><td>${h(item.displayName)}</td><td>${money(item.revenue)}</td><td>${money(item.commission)}</td></tr>`,
                    )
                    .join('')}</tbody></table></div>`
                : emptyState('Sin comisiones', 'Aún no hay pagos de citas en el período.')
            }
          </div>
        </section>

        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Stock bajo</h2><a class="link-button" href="#/inventario">Ir a inventario</a></header>
          <div class="panel__body panel__body--flush">
            ${
              (dashboard.lowStock ?? []).length
                ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th></tr></thead><tbody>${dashboard.lowStock
                    .map(
                      (item) => `<tr><td>${h(item.name)}</td><td>${formatNumber(item.stock)}</td><td>${formatNumber(item.minStock)}</td></tr>`,
                    )
                    .join('')}</tbody></table></div>`
                : emptyState('Stock saludable', 'No hay productos bajo el mínimo.')
            }
          </div>
        </section>
      </div>
    </div>
  `;

  q('[data-new-appointment]', view)?.addEventListener('click', () => openAppointmentForm());
  q('[data-new-sale]', view)?.addEventListener('click', () => openSaleForm());
  qa('[data-appointment-id]', view).forEach((button) => {
    button.addEventListener('click', () => openAppointmentDetail(button.dataset.appointmentId));
  });
}

/* --------------------------------------------------------------------------
   Agenda y citas
   -------------------------------------------------------------------------- */

function appointmentCard(appointment) {
  const total = appointment.total != null ? money(appointment.total) : '';
  return `
    <button class="appointment-card" type="button" data-appointment-id="${h(appointment.id)}">
      <span class="appointment-card__time">${h(formatTime(appointment.startsAt, tz()))}</span>
      <span class="appointment-card__body">
        <span class="appointment-card__client">${h(appointment.clientName || 'Cliente')}</span>
        <span class="appointment-card__meta">${h(appointmentServicesText(appointment))}</span>
        ${state.user.role === 'admin' ? `<span class="appointment-card__meta">${h(appointment.barberName || '')}</span>` : ''}
      </span>
      <span class="appointment-card__side">
        ${badge(appointment.status)}
        ${total ? `<span class="appointment-card__total">${total}</span>` : ''}
      </span>
    </button>
  `;
}

async function fetchAgenda({ from, to, barberId = '', status = '' }) {
  if (state.user.role === 'barbero') {
    const params = new URLSearchParams({ from, to });
    return apiGet(`/barber/agenda?${params.toString()}`);
  }

  const params = new URLSearchParams({ from, to });
  if (barberId) params.set('barberId', barberId);
  if (status) params.set('status', status);
  return apiGet(`/admin/appointments?${params.toString()}`);
}

async function viewAgenda(view, _segments, params) {
  const date = params.date || today();
  const weekEnd = addDays(date, 7);
  const barberId = params.barberId || '';
  const status = params.status || '';
  const barbers = state.user.role === 'admin' ? await getAdminBarbers() : [];

  const appointments = await fetchAgenda({
    from: zonedDateStart(date, tz()),
    to: zonedDateStart(weekEnd, tz()),
    barberId,
    status,
  });

  const grouped = new Map();
  for (const appointment of appointments) {
    const day = dateInZone(appointment.startsAt, tz());
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(appointment);
  }

  view.innerHTML = `
    <div class="page">
      ${pageHead(
        state.user.role === 'admin' ? 'Agenda' : 'Mi agenda',
        'Vista semanal de citas, organizada por día y barbero.',
        state.user.role === 'admin'
          ? `<button class="button" type="button" data-new-appointment>${icon('plus', 18)} Nueva cita</button>`
          : '',
      )}

      <div class="toolbar">
        <div class="toolbar__group">
          <button class="button button--ghost button--icon" type="button" data-week-prev aria-label="Semana anterior">${icon('chevronLeft', 18)}</button>
          <button class="button button--ghost button--small" type="button" data-week-today>Hoy</button>
          <button class="button button--ghost button--icon" type="button" data-week-next aria-label="Semana siguiente">${icon('chevronRight', 18)}</button>
          <div class="field">
            <label class="field__label" for="agenda-date">Semana desde</label>
            <input class="field__input" id="agenda-date" type="date" value="${h(date)}" data-agenda-date>
          </div>
        </div>
        <div class="toolbar__group">
          ${
            state.user.role === 'admin'
              ? `<div class="field"><label class="field__label" for="agenda-barber">Barbero</label><select class="field__input" id="agenda-barber" data-agenda-barber>${selectOptions(barbers, barberId, { labelKey: 'displayName', placeholder: 'Todos' })}</select></div>`
              : ''
          }
          <div class="field"><label class="field__label" for="agenda-status">Estado</label><select class="field__input" id="agenda-status" data-agenda-status>${selectOptions(
            Object.entries({
              pendiente: 'Pendiente',
              confirmada: 'Confirmada',
              en_curso: 'En curso',
              completada: 'Completada',
              cancelada: 'Cancelada',
              no_asistio: 'No asistió',
            }).map(([value, label]) => ({ value, label })),
            status,
            { valueKey: 'value', labelKey: 'label', placeholder: 'Todos' },
          )}</select></div>
        </div>
        <div class="toolbar__spacer"></div>
        <span class="muted">${calendarDate(date, { withWeekday: true })} — ${calendarDate(addDays(date, 6), { withWeekday: true })}</span>
      </div>

      ${
        grouped.size
          ? `<div class="agenda">${[...grouped.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(
                ([day, items]) => `
                  <section class="agenda__day">
                    <header class="agenda__day-head">
                      <h2 class="agenda__day-title">${h(formatDate(`${day}T12:00:00Z`, { withWeekday: true }))}</h2>
                      <span class="muted">${items.length} cita${items.length === 1 ? '' : 's'}</span>
                    </header>
                    <div class="agenda__list">${items.map(appointmentCard).join('')}</div>
                  </section>
                `,
              )
              .join('')}</div>`
          : emptyState('Sin citas en esta semana', 'Prueba con otra semana o crea una cita nueva.')
      }
    </div>
  `;

  q('[data-new-appointment]', view)?.addEventListener('click', () => openAppointmentForm({ date }));
  q('[data-week-prev]', view)?.addEventListener('click', () => navigate('/agenda', { ...params, date: addDays(date, -7) }));
  q('[data-week-next]', view)?.addEventListener('click', () => navigate('/agenda', { ...params, date: addDays(date, 7) }));
  q('[data-week-today]', view)?.addEventListener('click', () => navigate('/agenda', { ...params, date: today() }));
  q('[data-agenda-date]', view)?.addEventListener('change', (event) => navigate('/agenda', { ...params, date: event.target.value }));
  q('[data-agenda-barber]', view)?.addEventListener('change', (event) => navigate('/agenda', { ...params, barberId: event.target.value }));
  q('[data-agenda-status]', view)?.addEventListener('change', (event) => navigate('/agenda', { ...params, status: event.target.value }));
  qa('[data-appointment-id]', view).forEach((button) => {
    button.addEventListener('click', () => openAppointmentDetail(button.dataset.appointmentId));
  });
}

async function viewAppointments(view, _segments, params) {
  const fromDate = params.from || addDays(today(), -30);
  const toDate = params.to || today();
  const barberId = params.barberId || '';
  const status = params.status || '';
  const barbers = state.user.role === 'admin' ? await getAdminBarbers() : [];

  const appointments = await fetchAgenda({
    from: zonedDateStart(fromDate, tz()),
    to: zonedDateStart(addDays(toDate, 1), tz()),
    barberId,
    status,
  });

  view.innerHTML = `
    <div class="page">
      ${pageHead('Citas', 'Historial y seguimiento de las citas en el rango seleccionado.')}

      <div class="toolbar">
        <div class="field"><label class="field__label" for="citas-from">Desde</label><input class="field__input" id="citas-from" type="date" value="${h(fromDate)}" data-citas-from></div>
        <div class="field"><label class="field__label" for="citas-to">Hasta</label><input class="field__input" id="citas-to" type="date" value="${h(toDate)}" data-citas-to></div>
        ${
          state.user.role === 'admin'
            ? `<div class="field"><label class="field__label" for="citas-barber">Barbero</label><select class="field__input" id="citas-barber" data-citas-barber>${selectOptions(barbers, barberId, { labelKey: 'displayName', placeholder: 'Todos' })}</select></div>`
            : ''
        }
        <div class="field"><label class="field__label" for="citas-status">Estado</label><select class="field__input" id="citas-status" data-citas-status>${selectOptions(
          Object.entries({
            pendiente: 'Pendiente',
            confirmada: 'Confirmada',
            en_curso: 'En curso',
            completada: 'Completada',
            cancelada: 'Cancelada',
            no_asistio: 'No asistió',
          }).map(([value, label]) => ({ value, label })),
          status,
          { valueKey: 'value', labelKey: 'label', placeholder: 'Todos' },
        )}</select></div>
      </div>

      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            appointments.length
              ? `<div class="data-table-wrap"><table class="data-table">
                  <thead><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Barbero</th><th>Servicios</th><th>Estado</th><th>Total</th></tr></thead>
                  <tbody>${appointments
                    .map(
                      (item) => `<tr>
                        <td><button class="link-button" type="button" data-appointment-id="${h(item.id)}">${h(item.code)}</button></td>
                        <td class="nowrap">${h(formatDateTime(item.startsAt, tz()))}</td>
                        <td>${h(item.clientName || '')}<br><span class="muted">${h(item.clientPhone || '')}</span></td>
                        <td>${h(item.barberName || '')}</td>
                        <td>${h(appointmentServicesText(item))}</td>
                        <td>${badge(item.status)}</td>
                        <td class="nowrap">${money(item.total)}</td>
                      </tr>`,
                    )
                    .join('')}</tbody>
                </table></div>`
              : emptyState('Sin citas', 'No hay citas en el rango seleccionado.')
          }
        </div>
      </section>
    </div>
  `;

  q('[data-citas-from]', view)?.addEventListener('change', (event) => navigate('/citas', { ...params, from: event.target.value }));
  q('[data-citas-to]', view)?.addEventListener('change', (event) => navigate('/citas', { ...params, to: event.target.value }));
  q('[data-citas-barber]', view)?.addEventListener('change', (event) => navigate('/citas', { ...params, barberId: event.target.value }));
  q('[data-citas-status]', view)?.addEventListener('change', (event) => navigate('/citas', { ...params, status: event.target.value }));
  qa('[data-appointment-id]', view).forEach((button) => {
    button.addEventListener('click', () => openAppointmentDetail(button.dataset.appointmentId));
  });
}

async function openAppointmentDetail(id) {
  const path = state.user.role === 'admin' ? `/admin/appointments/${id}` : `/barber/appointments/${id}`;
  const appointment = await apiGet(path);
  const payments = appointment.payments ?? [];
  const active = activeAppointment(appointment.status);

  const actions = `
    ${appointment.status === 'pendiente' ? `<button class="button button--small" type="button" data-status="confirmada">Confirmar</button>` : ''}
    ${appointment.status === 'confirmada' ? `<button class="button button--small" type="button" data-status="en_curso">Iniciar</button>` : ''}
    ${active && ['pendiente', 'confirmada'].includes(appointment.status) ? `<button class="button button--ghost button--small" type="button" data-status="no_asistio">No asistió</button>` : ''}
    ${active ? `<button class="button button--ghost button--small" type="button" data-cancel>Cancelar</button>` : ''}
    ${active && state.user.role === 'admin' ? `<button class="button button--ghost button--small" type="button" data-reschedule>Reprogramar</button>` : ''}
    ${active ? `<button class="button button--small" type="button" data-complete>Completar y cobrar</button>` : ''}
    ${payments.length ? `<button class="button button--ghost button--small" type="button" data-receipt>${icon('print', 16)} Comprobante</button>` : ''}
  `;

  openModal({
    title: appointment.code,
    subtitle: `${formatDateTime(appointment.startsAt, tz())} · ${appointment.barberName || ''}`,
    wide: true,
    body: `
      <div class="grid-2">
        <div class="stack">
          <div class="detail-list">
            <div class="detail-list__row"><span class="detail-list__label">Cliente</span><span class="detail-list__value">${h(appointment.clientName || '')}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Teléfono</span><span class="detail-list__value">${h(appointment.clientPhone || '')}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Estado</span>${badge(appointment.status)}</div>
            <div class="detail-list__row"><span class="detail-list__label">Origen</span><span class="detail-list__value">${h(sourceLabel(appointment.source))}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Duración</span><span class="detail-list__value">${h(formatTime(appointment.startsAt, tz()))} — ${h(formatTime(appointment.endsAt, tz()))}</span></div>
            ${appointment.notes ? `<div class="detail-list__row"><span class="detail-list__label">Notas</span><span class="detail-list__value">${h(appointment.notes)}</span></div>` : ''}
          </div>
        </div>
        <div class="stack">
          <div class="detail-list">
            <div class="detail-list__row"><span class="detail-list__label">Subtotal</span><span class="detail-list__value">${money(appointment.subtotal)}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Descuento</span><span class="detail-list__value">${money(appointment.discount)}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">IVA</span><span class="detail-list__value">${money(appointment.taxAmount)}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Total</span><strong class="detail-list__value">${money(appointment.total)}</strong></div>
          </div>
        </div>
      </div>

      <section class="panel panel--spaced">
        <header class="panel__head"><h3 class="panel__title">Servicios</h3></header>
        <div class="panel__body panel__body--flush">
          <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Servicio</th><th>Duración</th><th>Precio</th><th>Cantidad</th><th>Total</th></tr></thead><tbody>
            ${(appointment.services ?? [])
              .map(
                (service) => `<tr><td>${h(service.name)}</td><td>${h(formatDuration(service.durationMin))}</td><td>${money(service.price)}</td><td>${formatNumber(service.quantity)}</td><td>${money(Number(service.price) * Number(service.quantity || 1))}</td></tr>`,
              )
              .join('') || '<tr><td colspan="5" class="data-table__empty">Sin servicios registrados.</td></tr>'}
          </tbody></table></div>
        </div>
      </section>

      ${
        payments.length
          ? `<section class="panel panel--spaced">
              <header class="panel__head"><h3 class="panel__title">Pagos</h3></header>
              <div class="panel__body panel__body--flush"><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Método</th><th>Monto</th><th>Propina</th><th>Estado</th></tr></thead><tbody>
                ${payments
                  .map(
                    (payment) => `<tr><td>${h(formatDateTime(payment.paidAt, tz()))}</td><td>${h(methodLabel(payment.method))}</td><td>${money(payment.amount)}</td><td>${money(payment.tipAmount)}</td><td>${paymentBadge(payment.status)}</td></tr>`,
                  )
                  .join('')}
              </tbody></table></div></div>
            </section>`
          : ''
      }
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Cerrar</button>${actions}`,
    onMount: (dialog) => {
      q('[data-status="confirmada"]', dialog)?.addEventListener('click', () => changeAppointmentStatus(appointment, 'confirmada'));
      q('[data-status="en_curso"]', dialog)?.addEventListener('click', () => changeAppointmentStatus(appointment, 'en_curso'));
      q('[data-status="no_asistio"]', dialog)?.addEventListener('click', () => changeAppointmentStatus(appointment, 'no_asistio', true));
      q('[data-cancel]', dialog)?.addEventListener('click', () => openCancelAppointment(appointment));
      q('[data-reschedule]', dialog)?.addEventListener('click', () => openRescheduleAppointment(appointment));
      q('[data-complete]', dialog)?.addEventListener('click', () => openCompleteAppointment(appointment));
      q('[data-receipt]', dialog)?.addEventListener('click', () => openReceipt({ type: 'appointment', record: appointment }));
    },
  });
}

async function changeAppointmentStatus(appointment, status, confirm = false) {
  const run = async () => {
    const path = state.user.role === 'admin'
      ? `/admin/appointments/${appointment.id}/status`
      : `/barber/appointments/${appointment.id}/status`;
    await apiPatch(path, { status });
    closeModal();
    toast(`Cita actualizada a ${statusLabel(status)}.`, 'success');
    renderRoute();
  };

  if (confirm) {
    confirmAction({
      title: 'Marcar no asistió',
      message: 'La cita quedará cerrada como no asistió. ¿Continuar?',
      confirmLabel: 'Marcar no asistió',
      danger: true,
      onConfirm: run,
    });
    return;
  }

  try {
    await run();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openCancelAppointment(appointment) {
  openModal({
    title: 'Cancelar cita',
    subtitle: appointment.code,
    narrow: true,
    body: `
      <form class="stack" data-cancel-form>
        <p>La cita quedará cancelada y el horario se liberará.</p>
        <div class="field">
          <label class="field__label" for="cancel-reason">Motivo</label>
          <textarea class="field__input field__input--area" id="cancel-reason" name="reason" maxlength="500" placeholder="Opcional"></textarea>
        </div>
        <p class="form-error" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `
      <button class="button button--ghost" type="button" data-modal-close>Volver</button>
      <button class="button button--danger" type="submit" form="cancel-form">Cancelar cita</button>
    `,
    onMount: (dialog) => {
      const form = q('[data-cancel-form]', dialog);
      form.id = 'cancel-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true, 'Cancelando...');
        try {
          const path = state.user.role === 'admin'
            ? `/admin/appointments/${appointment.id}/cancel`
            : `/barber/appointments/${appointment.id}/cancel`;
          await apiPost(path, { reason: value(form, 'reason') || null });
          closeModal();
          toast('Cita cancelada.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

function openCompleteAppointment(appointment) {
  openModal({
    title: 'Completar y cobrar',
    subtitle: `${appointment.code} · ${appointment.clientName || ''}`,
    narrow: true,
    body: `
      <form class="stack" data-complete-form>
        <div class="field">
          <label class="field__label" for="complete-method">Método de pago</label>
          <select class="field__input" id="complete-method" name="method">
            ${selectOptions(
              Object.entries({ efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }).map(([value, label]) => ({ value, label })),
              'efectivo',
              { valueKey: 'value', labelKey: 'label' },
            )}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="complete-amount">Monto</label>
          <input class="field__input" id="complete-amount" name="amount" type="number" min="1" step="1" value="${h(appointment.total ?? '')}" required>
          <p class="field__hint">Por defecto se usa el total de la cita.</p>
        </div>
        <div class="field">
          <label class="field__label" for="complete-tip">Propina</label>
          <input class="field__input" id="complete-tip" name="tip" type="number" min="0" step="1" value="0">
        </div>
        <p class="form-error" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `
      <button class="button button--ghost" type="button" data-modal-close>Volver</button>
      <button class="button" type="submit" form="complete-form">Cobrar y completar</button>
    `,
    onMount: (dialog) => {
      const form = q('[data-complete-form]', dialog);
      form.id = 'complete-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true, 'Cobrando...');
        try {
          const path = state.user.role === 'admin'
            ? `/admin/appointments/${appointment.id}/complete`
            : `/barber/appointments/${appointment.id}/complete`;
          await apiPost(path, {
            method: value(form, 'method'),
            amount: Number(value(form, 'amount')),
            tip: Number(value(form, 'tip') || 0),
          });
          closeModal();
          toast('Cita completada y pago registrado.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

function openRescheduleAppointment(appointment) {
  const serviceId = appointment.services?.[0]?.id;
  const date = dateInZone(appointment.startsAt, tz());

  if (!serviceId) {
    toast('La cita no tiene servicios para consultar disponibilidad.', 'error');
    return;
  }

  const body = `
    <form class="stack" data-reschedule-form>
      <div class="field">
        <label class="field__label" for="reschedule-date">Nueva fecha</label>
        <input class="field__input" id="reschedule-date" name="date" type="date" value="${h(date)}" required>
      </div>
      <div class="field">
        <label class="field__label" for="reschedule-time">Horario disponible</label>
        <select class="field__input" id="reschedule-time" name="time" required>
          <option value="">Selecciona un horario</option>
        </select>
        <p class="field__hint" data-reschedule-hint>Consultando disponibilidad...</p>
      </div>
      <p class="form-error" data-form-error role="alert" hidden></p>
    </form>
  `;

  openModal({
    title: 'Reprogramar cita',
    subtitle: appointment.code,
    narrow: true,
    body,
    footer: `
      <button class="button button--ghost" type="button" data-modal-close>Volver</button>
      <button class="button" type="submit" form="reschedule-form">Reprogramar</button>
    `,
    onMount: (dialog) => {
      const form = q('[data-reschedule-form]', dialog);
      const dateInput = q('[name="date"]', form);
      const timeSelect = q('[name="time"]', form);
      const hint = q('[data-reschedule-hint]', form);
      form.id = 'reschedule-form';

      const loadSlots = async () => {
        hint.textContent = 'Consultando disponibilidad...';
        timeSelect.innerHTML = '<option value="">Cargando...</option>';

        try {
          const params = new URLSearchParams({
            date: dateInput.value,
            serviceId,
            barberId: appointment.barberId,
          });
          const data = await apiGet(`/public/availability/day?${params.toString()}`);
          const slots = (data.slots ?? []).filter((slot) => slot.available);
          timeSelect.innerHTML = slots.length
            ? `<option value="">Selecciona un horario</option>${slots.map((slot) => option(slot.startsAt, slot.time)).join('')}`
            : '<option value="">Sin horarios disponibles</option>';
          hint.textContent = slots.length ? `${slots.length} horario(s) disponible(s).` : 'No hay horarios disponibles para esa fecha.';
        } catch (error) {
          timeSelect.innerHTML = '<option value="">Error al consultar</option>';
          hint.textContent = error.message;
        }
      };

      dateInput.addEventListener('change', loadSlots);
      loadSlots();

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true, 'Reprogramando...');

        try {
          await apiPost(`/admin/appointments/${appointment.id}/reschedule`, {
            startsAt: value(form, 'time'),
          });
          closeModal();
          toast('Cita reprogramada.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

function openAppointmentForm({ date = today(), prefill = {} } = {}) {
  Promise.all([getFormServices(), getFormBarbers()])
    .then(([services, barbers]) => {
      const selectedBarber = state.user.role === 'barbero' ? state.user.barberId : barbers[0]?.id ?? '';
      openModal({
        title: 'Nueva cita',
        subtitle: 'Cita de mostrador o teléfono',
        wide: true,
        body: `
          <form class="form-grid" data-appointment-form>
            ${
              state.user.role === 'admin'
                ? `<div class="field"><label class="field__label" for="appointment-barber">Barbero</label><select class="field__input" id="appointment-barber" name="barberId" required>${selectOptions(barbers, selectedBarber, { labelKey: 'displayName', placeholder: 'Selecciona' })}</select></div>`
                : ''
            }
            <div class="field"><label class="field__label" for="appointment-service">Servicio</label><select class="field__input" id="appointment-service" name="serviceId" required>${selectOptions(services, '', { placeholder: 'Selecciona un servicio' })}</select></div>
            <div class="field"><label class="field__label" for="appointment-date">Fecha</label><input class="field__input" id="appointment-date" name="date" type="date" value="${h(date)}" required></div>
            <div class="field"><label class="field__label" for="appointment-time">Horario</label><select class="field__input" id="appointment-time" name="startsAt" required><option value="">Selecciona fecha y servicio</option></select><p class="field__hint" data-slots-hint></p></div>
            <div class="field"><label class="field__label" for="appointment-name">Nombre del cliente</label><input class="field__input" id="appointment-name" name="fullName" type="text" maxlength="120" value="${h(prefill.fullName || '')}" required></div>
            <div class="field"><label class="field__label" for="appointment-phone">Teléfono</label><input class="field__input" id="appointment-phone" name="phone" type="tel" maxlength="20" value="${h(prefill.phone || '')}" placeholder="+56 9 1234 5678"></div>
            <div class="field"><label class="field__label" for="appointment-email">Correo</label><input class="field__input" id="appointment-email" name="email" type="email" maxlength="254" value="${h(prefill.email || '')}"></div>
            <div class="field"><label class="field__label" for="appointment-source">Origen</label><select class="field__input" id="appointment-source" name="source">${selectOptions(
              Object.entries({ mostrador: 'Mostrador', telefono: 'Teléfono', whatsapp: 'WhatsApp', web: 'Web' }).map(([value, label]) => ({ value, label })),
              'mostrador',
              { valueKey: 'value', labelKey: 'label' },
            )}</select></div>
            <div class="field field--full"><label class="field__label" for="appointment-notes">Notas</label><textarea class="field__input field__input--area" id="appointment-notes" name="notes" maxlength="500"></textarea></div>
            <p class="form-error field--full" data-form-error role="alert" hidden></p>
          </form>
        `,
        footer: `
          <button class="button button--ghost" type="button" data-modal-close>Cancelar</button>
          <button class="button" type="submit" form="appointment-form">Crear cita</button>
        `,
        onMount: (dialog) => {
          const form = q('[data-appointment-form]', dialog);
          const timeSelect = q('[name="startsAt"]', form);
          const hint = q('[data-slots-hint]', form);
          form.id = 'appointment-form';

          const loadSlots = async () => {
            const barberId = value(form, 'barberId') || selectedBarber;
            const serviceId = value(form, 'serviceId');
            const selectedDate = value(form, 'date');

            if (!barberId || !serviceId || !selectedDate) {
              timeSelect.innerHTML = '<option value="">Selecciona barbero, servicio y fecha</option>';
              hint.textContent = '';
              return;
            }

            hint.textContent = 'Consultando disponibilidad...';
            timeSelect.innerHTML = '<option value="">Cargando...</option>';

            try {
              const params = new URLSearchParams({
                date: selectedDate,
                serviceId,
                barberId,
              });
              const data = await apiGet(`/public/availability/day?${params.toString()}`);
              const slots = (data.slots ?? []).filter((slot) => slot.available);
              timeSelect.innerHTML = slots.length
                ? `<option value="">Selecciona un horario</option>${slots.map((slot) => option(slot.startsAt, slot.time)).join('')}`
                : '<option value="">Sin horarios disponibles</option>';
              hint.textContent = slots.length ? `${slots.length} horario(s) disponible(s).` : 'No hay horarios disponibles.';
            } catch (error) {
              timeSelect.innerHTML = '<option value="">Error al consultar</option>';
              hint.textContent = error.message;
            }
          };

          ['barberId', 'serviceId', 'date'].forEach((name) => {
            form.elements.namedItem(name)?.addEventListener('change', loadSlots);
          });
          loadSlots();

          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = q('button[type="submit"]', dialog);
            const startsAt = value(form, 'startsAt');

            if (!startsAt) {
              const errorBox = q('[data-form-error]', form);
              errorBox.textContent = 'Selecciona un horario disponible.';
              errorBox.hidden = false;
              return;
            }

            setBusy(button, true, 'Creando...');

            try {
              const payload = {
                barberId: value(form, 'barberId') || selectedBarber,
                serviceIds: [value(form, 'serviceId')],
                startsAt,
                fullName: value(form, 'fullName'),
                phone: value(form, 'phone') || null,
                email: value(form, 'email') || null,
                notes: value(form, 'notes') || null,
                source: value(form, 'source') || 'mostrador',
              };
              const path = state.user.role === 'admin' ? '/admin/appointments' : '/barber/appointments';
              await apiPost(path, payload);
              closeModal();
              toast('Cita creada.', 'success');
              renderRoute();
            } catch (error) {
              const errorBox = q('[data-form-error]', form);
              errorBox.textContent = error.message;
              errorBox.hidden = false;
              setBusy(button, false);
            }
          });
        },
      });
    })
    .catch((error) => toast(error.message, 'error'));
}

/* --------------------------------------------------------------------------
   Comprobante
   -------------------------------------------------------------------------- */

function buildReceiptHtml({ type, record }) {
  const isSale = type === 'sale';
  const payment = (record.payments ?? [])[0] ?? null;
  const client = isSale ? record.clients?.fullName : record.clientName;
  const barber = isSale ? record.barbers?.displayName : record.barberName;
  const items = isSale
    ? (record.saleItems ?? []).map((item) => ({
        name: item.nameSnapshot,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.lineTotal,
      }))
    : (record.services ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity || 1,
        price: item.price,
        total: Number(item.price) * Number(item.quantity || 1),
      }));
  const voided = isSale && record.status === 'anulada';
  const title = isSale ? 'Comprobante de venta' : 'Comprobante de atención';

  return `
    <article class="receipt" id="receipt-print">
      <header class="receipt__header">
        <p class="receipt__business">${h(state.settings.businessName)}</p>
        ${state.settings.legalName ? `<p>${h(state.settings.legalName)}</p>` : ''}
        ${state.settings.taxId ? `<p>RUT ${h(state.settings.taxId)}</p>` : ''}
        ${state.settings.address ? `<p>${h(state.settings.address)}</p>` : ''}
        ${state.settings.city ? `<p>${h(state.settings.city)}</p>` : ''}
        ${state.settings.phone ? `<p>${h(state.settings.phone)}</p>` : ''}
        <p class="receipt__title">${title}</p>
      </header>

      <section class="receipt__meta">
        <p><strong>${h(record.code)}</strong></p>
        <p>${h(formatDateTime(isSale ? record.createdAt : record.startsAt, tz()))}</p>
        ${client ? `<p>Cliente: ${h(client)}</p>` : ''}
        ${barber ? `<p>Barbero: ${h(barber)}</p>` : ''}
      </section>

      <section class="receipt__items">
        ${items
          .map(
            (item) => `
              <div class="receipt__item">
                <div>
                  <strong>${h(item.name)}</strong>
                  <small>${formatNumber(item.quantity)} x ${money(item.price)}</small>
                </div>
                <strong>${money(item.total)}</strong>
              </div>
            `,
          )
          .join('') || '<p>Sin detalle.</p>'}
      </section>

      <section class="receipt__totals">
        <div class="summary-line"><span>Subtotal</span><span>${money(record.subtotal)}</span></div>
        <div class="summary-line"><span>Descuento</span><span>${money(record.discount)}</span></div>
        <div class="summary-line"><span>IVA</span><span>${money(record.taxAmount)}</span></div>
        <div class="receipt__total"><span>Total</span><span>${money(record.total)}</span></div>
        ${payment ? `<div class="summary-line"><span>Pago</span><span>${h(methodLabel(payment.method))}</span></div>` : ''}
        ${payment && Number(payment.tipAmount) ? `<div class="summary-line"><span>Propina</span><span>${money(payment.tipAmount)}</span></div>` : ''}
        ${payment ? `<div class="summary-line"><span>Estado del pago</span><span>${h(paymentStatusLabel(payment.status))}</span></div>` : ''}
      </section>

      ${voided ? `<div class="receipt__stamp">Anulada</div><p>${h(record.voidReason || '')}</p><p>${h(formatDateTime(record.voidedAt, tz()))}</p>` : ''}

      <footer class="receipt__foot">
        <p>Documento interno sin valor tributario.</p>
        <p>Gracias por tu visita.</p>
      </footer>
    </article>
  `;
}

function openReceipt({ type, record }) {
  const html = buildReceiptHtml({ type, record });
  openModal({
    title: 'Comprobante interno',
    subtitle: record.code,
    body: html,
    footer: `
      <button class="button button--ghost" type="button" data-modal-close>Cerrar</button>
      <button class="button" type="button" data-print>${icon('print', 16)} Imprimir</button>
    `,
    onMount: (dialog) => {
      q('[data-print]', dialog)?.addEventListener('click', () => {
        printRoot.innerHTML = html;
        window.print();
        window.setTimeout(() => {
          printRoot.innerHTML = '';
        }, 100);
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Clientes
   -------------------------------------------------------------------------- */

async function viewClients(view, _segments, params) {
  if (state.user.role === 'barbero') {
    await viewMyClients(view);
    return;
  }

  const search = params.q || '';
  const offset = Number(params.offset || 0);
  const data = await apiGet(
    `/admin/clients?search=${encodeURIComponent(search)}&limit=20&offset=${offset}`,
  );

  view.innerHTML = `
    <div class="page">
      ${pageHead('Clientes', 'Búsqueda y ficha de clientes de la barbería.', `<button class="button" type="button" data-new-client>${icon('userPlus', 18)} Nuevo cliente</button>`)}
      <div class="toolbar">
        <form class="toolbar__group" data-client-search>
          <div class="field"><label class="field__label" for="client-search">Buscar</label><input class="field__input" id="client-search" name="q" type="search" value="${h(search)}" placeholder="Nombre, teléfono o correo"></div>
          <button class="button button--ghost" type="submit">${icon('search', 16)} Buscar</button>
        </form>
      </div>

      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            data.items?.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Última visita</th><th>Estado</th></tr></thead><tbody>${data.items
                  .map(
                    (client) => `<tr>
                      <td><button class="link-button" type="button" data-client-id="${h(client.id)}">${h(client.fullName)}</button></td>
                      <td>${h(client.phone || '—')}</td>
                      <td>${h(client.email || '—')}</td>
                      <td>${client.lastVisitAt ? h(formatDateTime(client.lastVisitAt, tz())) : '—'}</td>
                      <td>${badge(client.isActive ? 'activo' : 'inactivo', client.isActive ? 'Activo' : 'Inactivo')}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin clientes', search ? 'No hay coincidencias para la búsqueda.' : 'Aún no hay clientes registrados.')
          }
        </div>
        <div class="pagination">
          <span class="muted">${formatNumber(data.total)} cliente(s)</span>
          <div class="toolbar__group">
            <button class="button button--ghost button--small" type="button" data-page-prev ${offset <= 0 ? 'disabled' : ''}>Anterior</button>
            <button class="button button--ghost button--small" type="button" data-page-next ${offset + 20 >= data.total ? 'disabled' : ''}>Siguiente</button>
          </div>
        </div>
      </section>
    </div>
  `;

  q('[data-new-client]', view)?.addEventListener('click', () => openClientForm());
  q('[data-client-search]', view)?.addEventListener('submit', (event) => {
    event.preventDefault();
    navigate('/clientes', { q: value(event.target, 'q') });
  });
  q('[data-page-prev]', view)?.addEventListener('click', () => navigate('/clientes', { q: search, offset: Math.max(offset - 20, 0) }));
  q('[data-page-next]', view)?.addEventListener('click', () => navigate('/clientes', { q: search, offset: offset + 20 }));
  qa('[data-client-id]', view).forEach((button) => {
    button.addEventListener('click', () => navigate(`/clientes/${button.dataset.clientId}`));
  });
}

async function viewClientDetail(view, segments) {
  const id = segments[0];
  const [client, history, visits] = await Promise.all([
    apiGet(`/admin/clients/${id}`),
    apiGet(`/admin/clients/${id}/history`),
    apiGet(`/admin/clients/${id}/appointments?limit=20&offset=0`),
  ]);

  view.innerHTML = `
    <div class="page">
      ${pageHead(
        client.fullName,
        client.phone || client.email || 'Sin datos de contacto',
        `<button class="button button--ghost" type="button" data-back-clients>${icon('arrowLeft', 16)} Volver</button>
         <button class="button button--ghost" type="button" data-edit-client>Editar</button>
         <button class="button" type="button" data-rebook>${icon('plus', 16)} Nueva cita</button>`,
      )}

      <section class="kpi-grid">
        <article class="kpi"><span class="kpi__label">Visitas completadas</span><strong class="kpi__value">${formatNumber(history.completedVisits)}</strong></article>
        <article class="kpi"><span class="kpi__label">Gasto total</span><strong class="kpi__value">${money(history.totalSpent)}</strong></article>
        <article class="kpi"><span class="kpi__label">Citas activas</span><strong class="kpi__value">${formatNumber(history.activeAppointments)}</strong></article>
        <article class="kpi"><span class="kpi__label">Última visita</span><strong class="kpi__value kpi__value--small">${history.lastAppointmentAt ? h(formatDate(history.lastAppointmentAt, { timeZone: tz() })) : '—'}</strong></article>
      </section>

      <div class="grid-2">
        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Datos del cliente</h2></header>
          <div class="panel__body">
            <div class="detail-list">
              <div class="detail-list__row"><span class="detail-list__label">Correo</span><span class="detail-list__value">${h(client.email || '—')}</span></div>
              <div class="detail-list__row"><span class="detail-list__label">Nacimiento</span><span class="detail-list__value">${client.birthDate ? h(formatDate(`${client.birthDate}T12:00:00Z`)) : '—'}</span></div>
              <div class="detail-list__row"><span class="detail-list__label">Marketing</span><span class="detail-list__value">${client.marketingConsent ? 'Autorizado' : 'No autorizado'}</span></div>
              <div class="detail-list__row"><span class="detail-list__label">Notas</span><span class="detail-list__value">${h(client.notes || '—')}</span></div>
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Visitas</h2><span class="muted">${formatNumber(visits.total)} en total</span></header>
          <div class="panel__body panel__body--flush">
            ${
              visits.items?.length
                ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Barbero</th><th>Servicios</th><th>Estado</th><th>Total</th></tr></thead><tbody>${visits.items
                    .map(
                      (item) => `<tr>
                        <td><button class="link-button" type="button" data-appointment-id="${h(item.id)}">${h(formatDate(item.startsAt, { timeZone: tz() }))}</button></td>
                        <td>${h(item.barberName || '')}</td>
                        <td>${h(appointmentServicesText(item))}</td>
                        <td>${badge(item.status)}</td>
                        <td>${money(item.total)}</td>
                      </tr>`,
                    )
                    .join('')}</tbody></table></div>`
                : emptyState('Sin visitas', 'Este cliente todavía no tiene citas.')
            }
          </div>
        </section>
      </div>
    </div>
  `;

  q('[data-back-clients]', view)?.addEventListener('click', () => navigate('/clientes'));
  q('[data-edit-client]', view)?.addEventListener('click', () => openClientForm(client));
  q('[data-rebook]', view)?.addEventListener('click', () => openAppointmentForm({ prefill: client }));
  qa('[data-appointment-id]', view).forEach((button) => {
    button.addEventListener('click', () => openAppointmentDetail(button.dataset.appointmentId));
  });
}

function openClientForm(client = null) {
  const editing = Boolean(client);
  openModal({
    title: editing ? 'Editar cliente' : 'Nuevo cliente',
    subtitle: editing ? client.fullName : 'Registra los datos de contacto.',
    wide: true,
    body: `
      <form class="form-grid" data-client-form>
        <div class="field"><label class="field__label" for="client-name">Nombre completo</label><input class="field__input" id="client-name" name="fullName" type="text" maxlength="120" value="${h(client?.fullName || '')}" required></div>
        <div class="field"><label class="field__label" for="client-phone">Teléfono</label><input class="field__input" id="client-phone" name="phone" type="tel" maxlength="20" value="${h(client?.phone || '')}"></div>
        <div class="field"><label class="field__label" for="client-email">Correo</label><input class="field__input" id="client-email" name="email" type="email" maxlength="254" value="${h(client?.email || '')}"></div>
        <div class="field"><label class="field__label" for="client-birth">Nacimiento</label><input class="field__input" id="client-birth" name="birthDate" type="date" value="${h(client?.birthDate || '')}"></div>
        <div class="field field--full"><label class="field__label" for="client-notes">Notas</label><textarea class="field__input field__input--area" id="client-notes" name="notes" maxlength="1000">${h(client?.notes || '')}</textarea></div>
        <label class="field__check field--full"><input type="checkbox" name="marketingConsent" ${client?.marketingConsent ? 'checked' : ''}> Autoriza comunicaciones de marketing</label>
        <label class="field__check field--full"><input type="checkbox" name="isActive" ${client?.isActive !== false ? 'checked' : ''}> Cliente activo</label>
        <p class="form-error field--full" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `
      <button class="button button--ghost" type="button" data-modal-close>Cancelar</button>
      <button class="button" type="submit" form="client-form">${editing ? 'Guardar cambios' : 'Crear cliente'}</button>
    `,
    onMount: (dialog) => {
      const form = q('[data-client-form]', dialog);
      form.id = 'client-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true);
        try {
          const payload = {
            fullName: value(form, 'fullName'),
            phone: value(form, 'phone') || null,
            email: value(form, 'email') || null,
            birthDate: value(form, 'birthDate') || null,
            notes: value(form, 'notes') || null,
            marketingConsent: readCheckbox(form, 'marketingConsent'),
            isActive: readCheckbox(form, 'isActive'),
          };
          if (editing) {
            await apiPatch(`/admin/clients/${client.id}`, payload);
          } else {
            await apiPost('/admin/clients', payload);
          }
          closeModal();
          toast(editing ? 'Cliente actualizado.' : 'Cliente creado.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

async function viewMyClients(view) {
  const clients = await apiGet('/barber/clients');
  view.innerHTML = `
    <div class="page">
      ${pageHead('Mis clientes', 'Clientes que has atendido.')}
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            clients.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Última visita</th></tr></thead><tbody>${clients
                  .map(
                    (client) => `<tr><td>${h(client.fullName)}</td><td>${h(client.phone || '—')}</td><td>${h(client.email || '—')}</td><td>${client.lastVisitAt ? h(formatDateTime(client.lastVisitAt, tz())) : '—'}</td></tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin clientes', 'Todavía no tienes clientes atendidos.')
          }
        </div>
      </section>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   Catálogo
   -------------------------------------------------------------------------- */

async function viewCatalog(view) {
  const [categories, services] = await Promise.all([
    apiGet('/admin/categories'),
    apiGet('/admin/services'),
  ]);

  view.innerHTML = `
    <div class="page">
      ${pageHead('Catálogo', 'Servicios, precios y duración que alimentan el sitio público.', `<button class="button button--ghost" type="button" data-new-category>Nueva categoría</button><button class="button" type="button" data-new-service>${icon('plus', 18)} Nuevo servicio</button>`)}
      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Categorías</h2><span class="muted">${categories.length}</span></header>
        <div class="panel__body panel__body--flush">
          ${
            categories.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Nombre</th><th>Slug</th><th>Orden</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${categories
                  .map(
                    (category) => `<tr><td>${h(category.name)}</td><td>${h(category.slug)}</td><td>${formatNumber(category.sortOrder)}</td><td>${badge(category.isActive ? 'activo' : 'inactivo', category.isActive ? 'Activa' : 'Inactiva')}</td><td><button class="button button--ghost button--small" type="button" data-edit-category="${h(category.id)}">Editar</button></td></tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin categorías', 'Crea la primera categoría del catálogo.')
          }
        </div>
      </section>

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Servicios</h2><span class="muted">${services.length}</span></header>
        <div class="panel__body panel__body--flush">
          ${
            services.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Servicio</th><th>Categoría</th><th>Duración</th><th>Buffer</th><th>Precio</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${services
                  .map(
                    (service) => `<tr>
                      <td>${h(service.name)}</td>
                      <td>${h(service.serviceCategories?.name || '—')}</td>
                      <td>${h(formatDuration(service.durationMin))}</td>
                      <td>${formatNumber(service.bufferMin)} min</td>
                      <td>${money(service.price)}</td>
                      <td>${badge(service.isActive ? 'activo' : 'inactivo', service.isActive ? 'Activo' : 'Inactivo')}</td>
                      <td><div class="data-table__actions"><button class="button button--ghost button--small" type="button" data-edit-service="${h(service.id)}">Editar</button>${service.isActive ? `<button class="button button--ghost button--small" type="button" data-deactivate-service="${h(service.id)}">Desactivar</button>` : ''}</div></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin servicios', 'Crea el primer servicio del catálogo.')
          }
        </div>
      </section>
    </div>
  `;

  q('[data-new-category]', view)?.addEventListener('click', () => openCategoryForm());
  q('[data-new-service]', view)?.addEventListener('click', () => openServiceForm(null, categories));
  qa('[data-edit-category]', view).forEach((button) => {
    const category = categories.find((item) => item.id === button.dataset.editCategory);
    button.addEventListener('click', () => openCategoryForm(category));
  });
  qa('[data-edit-service]', view).forEach((button) => {
    const service = services.find((item) => item.id === button.dataset.editService);
    button.addEventListener('click', () => openServiceForm(service, categories));
  });
  qa('[data-deactivate-service]', view).forEach((button) => {
    button.addEventListener('click', () => {
      const service = services.find((item) => item.id === button.dataset.deactivateService);
      confirmAction({
        title: 'Desactivar servicio',
        message: `El servicio <strong>${h(service?.name || '')}</strong> dejará de mostrarse en el sitio público. Las citas históricas se conservan.`,
        confirmLabel: 'Desactivar',
        danger: true,
        onConfirm: async () => {
          await apiDelete(`/admin/services/${button.dataset.deactivateService}`);
          toast('Servicio desactivado.', 'success');
          renderRoute();
        },
      });
    });
  });
}

function openCategoryForm(category = null) {
  const editing = Boolean(category);
  openModal({
    title: editing ? 'Editar categoría' : 'Nueva categoría',
    narrow: true,
    body: `
      <form class="form-grid" data-category-form>
        <div class="field field--full"><label class="field__label" for="category-name">Nombre</label><input class="field__input" id="category-name" name="name" maxlength="80" value="${h(category?.name || '')}" required></div>
        <div class="field field--full"><label class="field__label" for="category-slug">Slug</label><input class="field__input" id="category-slug" name="slug" maxlength="80" value="${h(category?.slug || '')}" placeholder="se-genera-desde-el-nombre"></div>
        <div class="field field--full"><label class="field__label" for="category-description">Descripción</label><textarea class="field__input field__input--area" id="category-description" name="description" maxlength="500">${h(category?.description || '')}</textarea></div>
        <div class="field"><label class="field__label" for="category-order">Orden</label><input class="field__input" id="category-order" name="sortOrder" type="number" min="0" step="1" value="${h(category?.sortOrder ?? 0)}"></div>
        <label class="field__check"><input type="checkbox" name="isActive" ${category?.isActive !== false ? 'checked' : ''}> Activa</label>
        <p class="form-error field--full" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="category-form">${editing ? 'Guardar' : 'Crear'}</button>`,
    onMount: (dialog) => {
      const form = q('[data-category-form]', dialog);
      form.id = 'category-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true);
        try {
          const payload = {
            name: value(form, 'name'),
            slug: value(form, 'slug') || slugify(value(form, 'name')),
            description: value(form, 'description') || null,
            sortOrder: Number(value(form, 'sortOrder') || 0),
            isActive: readCheckbox(form, 'isActive'),
          };
          if (editing) {
            await apiPatch(`/admin/categories/${category.id}`, payload);
          } else {
            await apiPost('/admin/categories', payload);
          }
          closeModal();
          toast(editing ? 'Categoría actualizada.' : 'Categoría creada.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

function openServiceForm(service = null, categories = []) {
  const editing = Boolean(service);
  openModal({
    title: editing ? 'Editar servicio' : 'Nuevo servicio',
    wide: true,
    body: `
      <form class="form-grid" data-service-form>
        <div class="field"><label class="field__label" for="service-category">Categoría</label><select class="field__input" id="service-category" name="categoryId" required>${selectOptions(categories, service?.categoryId, { placeholder: 'Selecciona' })}</select></div>
        <div class="field"><label class="field__label" for="service-name">Nombre</label><input class="field__input" id="service-name" name="name" maxlength="120" value="${h(service?.name || '')}" required></div>
        <div class="field"><label class="field__label" for="service-slug">Slug</label><input class="field__input" id="service-slug" name="slug" maxlength="80" value="${h(service?.slug || '')}" placeholder="se-genera-desde-el-nombre"></div>
        <div class="field"><label class="field__label" for="service-price">Precio</label><input class="field__input" id="service-price" name="price" type="number" min="0" step="1" value="${h(service?.price ?? '')}" required></div>
        <div class="field"><label class="field__label" for="service-duration">Duración (min)</label><input class="field__input" id="service-duration" name="durationMin" type="number" min="5" max="480" step="1" value="${h(service?.durationMin ?? 30)}" required></div>
        <div class="field"><label class="field__label" for="service-buffer">Buffer (min)</label><input class="field__input" id="service-buffer" name="bufferMin" type="number" min="0" max="120" step="1" value="${h(service?.bufferMin ?? 5)}"></div>
        <div class="field"><label class="field__label" for="service-order">Orden</label><input class="field__input" id="service-order" name="sortOrder" type="number" min="0" step="1" value="${h(service?.sortOrder ?? 0)}"></div>
        <div class="field field--full"><label class="field__label" for="service-description">Descripción</label><textarea class="field__input field__input--area" id="service-description" name="description" maxlength="1000">${h(service?.description || '')}</textarea></div>
        <div class="field field--full"><label class="field__label" for="service-image">Imagen (URL)</label><input class="field__input" id="service-image" name="imageUrl" maxlength="500" value="${h(service?.imageUrl || '')}"></div>
        <label class="field__check field--full"><input type="checkbox" name="isActive" ${service?.isActive !== false ? 'checked' : ''}> Activo</label>
        <p class="form-error field--full" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="service-form">${editing ? 'Guardar' : 'Crear'}</button>`,
    onMount: (dialog) => {
      const form = q('[data-service-form]', dialog);
      form.id = 'service-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true);
        try {
          const payload = {
            categoryId: value(form, 'categoryId'),
            name: value(form, 'name'),
            slug: value(form, 'slug') || slugify(value(form, 'name')),
            price: Number(value(form, 'price')),
            durationMin: Number(value(form, 'durationMin')),
            bufferMin: Number(value(form, 'bufferMin') || 0),
            sortOrder: Number(value(form, 'sortOrder') || 0),
            description: value(form, 'description') || null,
            imageUrl: value(form, 'imageUrl') || null,
            isActive: readCheckbox(form, 'isActive'),
          };
          if (editing) {
            await apiPatch(`/admin/services/${service.id}`, payload);
          } else {
            await apiPost('/admin/services', payload);
          }
          closeModal();
          toast(editing ? 'Servicio actualizado.' : 'Servicio creado.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Barberos
   -------------------------------------------------------------------------- */

async function viewBarbers(view) {
  const barbers = await getAdminBarbers();
  view.innerHTML = `
    <div class="page">
      ${pageHead('Barberos', 'Equipo, comisiones, horarios y servicios asignados.', `<button class="button" type="button" data-new-barber>${icon('userPlus', 18)} Nuevo barbero</button>`)}
      ${
        barbers.length
          ? `<div class="card-grid">${barbers
              .map(
                (barber) => `<article class="card">
                  <div class="card__head">
                    <div>
                      <h2 class="card__title">${h(barber.displayName)}</h2>
                      <p class="card__meta">${h(barber.profiles?.fullName || '')}${barber.profiles?.username ? ` · @${h(barber.profiles.username)}` : ''}${barber.profiles?.phone ? ` · ${h(barber.profiles.phone)}` : ''}</p>
                    </div>
                    ${badge(barber.isActive ? 'activo' : 'inactivo', barber.isActive ? 'Activo' : 'Inactivo')}
                  </div>
                  <p class="card__meta">Comisión ${formatNumber(barber.commissionRate)}% · Orden ${formatNumber(barber.sortOrder)}</p>
                  <div class="card__actions">
                    <a class="button button--ghost button--small" href="#/barberos/${barber.id}">Horarios y servicios</a>
                    <button class="button button--ghost button--small" type="button" data-edit-barber="${h(barber.id)}">Editar</button>
                  </div>
                </article>`,
              )
              .join('')}</div>`
          : emptyState('Sin barberos', 'Crea el primer barbero del equipo.')
      }
    </div>
  `;

  q('[data-new-barber]', view)?.addEventListener('click', () => openBarberForm());
  qa('[data-edit-barber]', view).forEach((button) => {
    const barber = barbers.find((item) => item.id === button.dataset.editBarber);
    button.addEventListener('click', () => openBarberForm(barber));
  });
}

async function viewBarberDetail(view, segments) {
  const id = segments[0];
  const [barbers, schedules, barberServices, services] = await Promise.all([
    getAdminBarbers(),
    apiGet(`/admin/barbers/${id}/schedules`),
    apiGet(`/admin/barbers/${id}/services`),
    apiGet('/admin/services'),
  ]);
  const barber = barbers.find((item) => item.id === id);

  if (!barber) {
    throw new Error('Barbero no encontrado.');
  }

  const serviceMap = new Map(barberServices.map((item) => [item.serviceId, item]));

  view.innerHTML = `
    <div class="page">
      ${pageHead(
        barber.displayName,
        `${barber.profiles?.fullName || ''}${barber.profiles?.username ? ` · @${barber.profiles.username}` : ''} · Comisión ${formatNumber(barber.commissionRate)}%`,
        `<button class="button button--ghost" type="button" data-back-barbers>${icon('arrowLeft', 16)} Volver</button><button class="button button--ghost" type="button" data-edit-barber>Editar ficha</button>`,
      )}

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Horario semanal</h2><button class="button button--ghost button--small" type="button" data-add-schedule>${icon('plus', 16)} Agregar turno</button></header>
        <div class="panel__body">
          <form class="schedule-editor" data-schedule-form>
            <div data-schedule-rows>
              ${schedules.map(scheduleRow).join('') || '<p class="muted">Sin turnos configurados.</p>'}
            </div>
            <div class="form-actions"><button class="button" type="submit">Guardar horario</button></div>
          </form>
        </div>
      </section>

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Servicios asignados</h2><span class="muted">${barberServices.length} de ${services.length}</span></header>
        <div class="panel__body">
          <form class="stack" data-services-form>
            <div class="check-list">
              ${services
                .map((service) => {
                  const assigned = serviceMap.get(service.id);
                  return `<div class="check-row">
                    <label class="field__check"><input type="checkbox" name="service-${h(service.id)}" ${assigned ? 'checked' : ''}> <span>${h(service.name)} <span class="muted">· ${money(service.price)} · ${h(formatDuration(service.durationMin))}</span></span></label>
                    <div class="field"><label class="field__label" for="price-${h(service.id)}">Precio especial</label><input class="field__input" id="price-${h(service.id)}" name="price-${h(service.id)}" type="number" min="0" step="1" value="${h(assigned?.priceOverride ?? '')}" placeholder="Precio base"></div>
                    <div class="field"><label class="field__label" for="duration-${h(service.id)}">Duración especial</label><input class="field__input" id="duration-${h(service.id)}" name="duration-${h(service.id)}" type="number" min="5" max="480" step="1" value="${h(assigned?.durationOverride ?? '')}" placeholder="Minutos"></div>
                  </div>`;
                })
                .join('') || '<p class="muted">No hay servicios en el catálogo.</p>'}
            </div>
            <div class="form-actions"><button class="button" type="submit">Guardar servicios</button></div>
          </form>
        </div>
      </section>
    </div>
  `;

  q('[data-back-barbers]', view)?.addEventListener('click', () => navigate('/barberos'));
  q('[data-edit-barber]', view)?.addEventListener('click', () => openBarberForm(barber));
  q('[data-add-schedule]', view)?.addEventListener('click', () => {
    q('[data-schedule-rows]', view)?.insertAdjacentHTML('beforeend', scheduleRow({ weekday: 1, startTime: '10:00', endTime: '19:00' }));
    bindScheduleRemove(view);
  });
  bindScheduleRemove(view);

  q('[data-schedule-form]', view)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = q('button[type="submit"]', event.target);
    setBusy(button, true);
    try {
      const rows = qa('.schedule-row', view).map((row) => ({
        weekday: Number(q('[name="weekday"]', row).value),
        startTime: q('[name="startTime"]', row).value,
        endTime: q('[name="endTime"]', row).value,
      }));
      await apiPut(`/admin/barbers/${id}/schedules`, { schedules: rows });
      toast('Horario actualizado.', 'success');
      renderRoute();
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  });

  q('[data-services-form]', view)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = q('button[type="submit"]', event.target);
    setBusy(button, true);
    try {
      const selected = services
        .filter((service) => readCheckbox(event.target, `service-${service.id}`))
        .map((service) => ({
          serviceId: service.id,
          priceOverride: value(event.target, `price-${service.id}`) || null,
          durationOverride: value(event.target, `duration-${service.id}`) || null,
        }));
      await apiPut(`/admin/barbers/${id}/services`, { services: selected });
      toast('Servicios actualizados.', 'success');
      renderRoute();
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  });
}

function scheduleRow(schedule = {}) {
  return `
    <div class="schedule-row">
      <div class="field"><label class="field__label">Día</label><select class="field__input" name="weekday">${WEEKDAYS.map((label, weekday) => option(weekday, label, Number(schedule.weekday) === weekday)).join('')}</select></div>
      <div class="field"><label class="field__label">Inicio</label><input class="field__input" name="startTime" type="time" value="${h(schedule.startTime?.slice(0, 5) || '10:00')}"></div>
      <div class="field"><label class="field__label">Fin</label><input class="field__input" name="endTime" type="time" value="${h(schedule.endTime?.slice(0, 5) || '19:00')}"></div>
      <button class="button button--ghost button--icon" type="button" data-remove-schedule aria-label="Quitar turno">${icon('trash', 16)}</button>
    </div>
  `;
}

function bindScheduleRemove(view) {
  qa('[data-remove-schedule]', view).forEach((button) => {
    button.onclick = () => button.closest('.schedule-row')?.remove();
  });
}

function openBarberForm(barber = null) {
  const editing = Boolean(barber);
  openModal({
    title: editing ? 'Editar barbero' : 'Nuevo barbero',
    subtitle: editing ? barber.displayName : 'Crea el acceso y la ficha pública.',
    wide: true,
    body: `
      <form class="form-grid" data-barber-form>
        ${
          editing
            ? ''
            : `<div class="field"><label class="field__label" for="barber-email">Correo</label><input class="field__input" id="barber-email" name="email" type="email" required></div>
               <div class="field"><label class="field__label" for="barber-password">Contraseña inicial</label><input class="field__input" id="barber-password" name="password" type="password" minlength="8" required></div>
               <div class="field"><label class="field__label" for="barber-full-name">Nombre completo</label><input class="field__input" id="barber-full-name" name="fullName" maxlength="120" value="${h(barber?.profiles?.fullName || '')}" required></div>
               <div class="field"><label class="field__label" for="barber-phone">Teléfono</label><input class="field__input" id="barber-phone" name="phone" type="tel" maxlength="20" value="${h(barber?.profiles?.phone || '')}"></div>`
        }
        <div class="field"><label class="field__label" for="barber-display-name">Nombre público</label><input class="field__input" id="barber-display-name" name="displayName" maxlength="80" value="${h(barber?.displayName || '')}" required></div>
        <div class="field"><label class="field__label" for="barber-username">Usuario de login</label><input class="field__input" id="barber-username" name="username" maxlength="30" value="${h(barber?.profiles?.username || '')}" placeholder="se-deriva-del-correo"><p class="field__hint">Minúsculas, números, punto, guion o guion bajo.</p></div>
        <div class="field"><label class="field__label" for="barber-commission">Comisión (%)</label><input class="field__input" id="barber-commission" name="commissionRate" type="number" min="0" max="100" step="0.01" value="${h(barber?.commissionRate ?? 0)}"></div>
        <div class="field"><label class="field__label" for="barber-color">Color</label><input class="field__input" id="barber-color" name="accentColor" type="color" value="${h(barber?.accentColor || '#3f4a5a')}"></div>
        <div class="field"><label class="field__label" for="barber-order">Orden</label><input class="field__input" id="barber-order" name="sortOrder" type="number" min="0" step="1" value="${h(barber?.sortOrder ?? 0)}"></div>
        <div class="field field--full"><label class="field__label" for="barber-bio">Biografía</label><textarea class="field__input field__input--area" id="barber-bio" name="bio" maxlength="1000">${h(barber?.bio || '')}</textarea></div>
        <div class="field field--full"><label class="field__label" for="barber-photo">Foto (URL)</label><input class="field__input" id="barber-photo" name="photoUrl" maxlength="500" value="${h(barber?.photoUrl || '')}"></div>
        <label class="field__check field--full"><input type="checkbox" name="isActive" ${barber?.isActive !== false ? 'checked' : ''}> Activo</label>
        <p class="form-error field--full" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="barber-form">${editing ? 'Guardar' : 'Crear barbero'}</button>`,
    onMount: (dialog) => {
      const form = q('[data-barber-form]', dialog);
      form.id = 'barber-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true);
        try {
          const payload = {
            displayName: value(form, 'displayName'),
            username: value(form, 'username') || null,
            bio: value(form, 'bio') || null,
            photoUrl: value(form, 'photoUrl') || null,
            accentColor: value(form, 'accentColor'),
            commissionRate: Number(value(form, 'commissionRate') || 0),
            sortOrder: Number(value(form, 'sortOrder') || 0),
            isActive: readCheckbox(form, 'isActive'),
          };
          if (editing) {
            await apiPatch(`/admin/barbers/${barber.id}`, payload);
          } else {
            await apiPost('/admin/barbers', {
              ...payload,
              email: value(form, 'email'),
              password: value(form, 'password'),
              fullName: value(form, 'fullName'),
              phone: value(form, 'phone') || null,
            });
          }
          closeModal();
          toast(editing ? 'Barbero actualizado.' : 'Barbero creado.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Bloqueos
   -------------------------------------------------------------------------- */

async function viewTimeOff(view, _segments, params) {
  const fromDate = params.from || today();
  const toDate = params.to || addDays(today(), 30);
  const endpoint = state.user.role === 'admin' ? '/admin/time-off' : '/barber/time-off';
  const data = await apiGet(
    `${endpoint}?from=${encodeURIComponent(zonedDateStart(fromDate, tz()))}&to=${encodeURIComponent(zonedDateStart(addDays(toDate, 1), tz()))}`,
  );

  view.innerHTML = `
    <div class="page">
      ${pageHead(state.user.role === 'admin' ? 'Bloqueos' : 'Mis bloqueos', 'Feriados, pausas y ausencias que impiden reservas.', `<button class="button" type="button" data-new-time-off>${icon('plus', 18)} Nuevo bloqueo</button>`)}
      <div class="toolbar">
        <div class="field"><label class="field__label" for="timeoff-from">Desde</label><input class="field__input" id="timeoff-from" type="date" value="${h(fromDate)}" data-timeoff-from></div>
        <div class="field"><label class="field__label" for="timeoff-to">Hasta</label><input class="field__input" id="timeoff-to" type="date" value="${h(toDate)}" data-timeoff-to></div>
      </div>
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            data.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Barbero</th><th>Inicio</th><th>Fin</th><th>Motivo</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${data
                  .map(
                    (item) => `<tr><td>${h(item.barbers?.displayName || 'Todo el local')}</td><td>${h(formatDateTime(item.startsAt, tz()))}</td><td>${h(formatDateTime(item.endsAt, tz()))}</td><td>${h(item.reason || '—')}</td><td><button class="button button--ghost button--small" type="button" data-delete-time-off="${h(item.id)}">Eliminar</button></td></tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin bloqueos', 'No hay bloqueos en el rango seleccionado.')
          }
        </div>
      </section>
    </div>
  `;

  q('[data-new-time-off]', view)?.addEventListener('click', () => openTimeOffForm());
  q('[data-timeoff-from]', view)?.addEventListener('change', (event) => navigate(state.user.role === 'admin' ? '/bloqueos' : '/mi-bloqueos', { ...params, from: event.target.value }));
  q('[data-timeoff-to]', view)?.addEventListener('change', (event) => navigate(state.user.role === 'admin' ? '/bloqueos' : '/mi-bloqueos', { ...params, to: event.target.value }));
  qa('[data-delete-time-off]', view).forEach((button) => {
    button.addEventListener('click', () => deleteTimeOff(button.dataset.deleteTimeOff));
  });
}

async function viewMyTimeOff(view, segments, params) {
  await viewTimeOff(view, segments, params);
}

function openTimeOffForm() {
  const isAdmin = state.user.role === 'admin';
  const loadBarbers = isAdmin ? getAdminBarbers() : Promise.resolve([]);

  loadBarbers.then((barbers) => {
    openModal({
      title: 'Nuevo bloqueo',
      subtitle: 'Bloquea un rango de tiempo para reservas.',
      wide: true,
      body: `
        <form class="form-grid" data-timeoff-form>
          ${
            isAdmin
              ? `<div class="field field--full"><label class="field__label" for="timeoff-barber">Barbero</label><select class="field__input" id="timeoff-barber" name="barberId">${selectOptions(barbers, '', { labelKey: 'displayName', placeholder: 'Todo el local' })}</select></div>`
              : ''
          }
          <div class="field"><label class="field__label" for="timeoff-start-date">Fecha de inicio</label><input class="field__input" id="timeoff-start-date" name="startDate" type="date" value="${h(today())}" required></div>
          <div class="field"><label class="field__label" for="timeoff-start-time">Hora de inicio</label><input class="field__input" id="timeoff-start-time" name="startTime" type="time" value="10:00" required></div>
          <div class="field"><label class="field__label" for="timeoff-end-date">Fecha de fin</label><input class="field__input" id="timeoff-end-date" name="endDate" type="date" value="${h(today())}" required></div>
          <div class="field"><label class="field__label" for="timeoff-end-time">Hora de fin</label><input class="field__input" id="timeoff-end-time" name="endTime" type="time" value="19:00" required></div>
          <div class="field field--full"><label class="field__label" for="timeoff-reason">Motivo</label><input class="field__input" id="timeoff-reason" name="reason" maxlength="500" placeholder="Feriado, pausa, ausencia"></div>
          <p class="form-error field--full" data-form-error role="alert" hidden></p>
        </form>
      `,
      footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="timeoff-form">Crear bloqueo</button>`,
      onMount: (dialog) => {
        const form = q('[data-timeoff-form]', dialog);
        form.id = 'timeoff-form';
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = q('button[type="submit"]', dialog);
          const startsAt = zonedDateTimeToIso(value(form, 'startDate'), value(form, 'startTime'), tz());
          const endsAt = zonedDateTimeToIso(value(form, 'endDate'), value(form, 'endTime'), tz());

          if (new Date(endsAt) <= new Date(startsAt)) {
            const errorBox = q('[data-form-error]', form);
            errorBox.textContent = 'El bloqueo debe terminar después de comenzar.';
            errorBox.hidden = false;
            return;
          }

          setBusy(button, true);
          try {
            const endpoint = isAdmin ? '/admin/time-off' : '/barber/time-off';
            await apiPost(endpoint, {
              barberId: value(form, 'barberId') || null,
              startsAt,
              endsAt,
              reason: value(form, 'reason') || null,
            });
            closeModal();
            toast('Bloqueo creado.', 'success');
            renderRoute();
          } catch (error) {
            const errorBox = q('[data-form-error]', form);
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            setBusy(button, false);
          }
        });
      },
    });
  }).catch((error) => toast(error.message, 'error'));
}

function deleteTimeOff(id) {
  confirmAction({
    title: 'Eliminar bloqueo',
    message: 'El horario volverá a estar disponible para reservas.',
    confirmLabel: 'Eliminar',
    danger: true,
    onConfirm: async () => {
      const endpoint = state.user.role === 'admin' ? '/admin/time-off' : '/barber/time-off';
      await apiDelete(`${endpoint}/${id}`);
      toast('Bloqueo eliminado.', 'success');
      renderRoute();
    },
  });
}

/* --------------------------------------------------------------------------
   Ventas y pagos
   -------------------------------------------------------------------------- */

async function viewSales(view, _segments, params) {
  const tab = params.tab === 'pagos' ? 'pagos' : 'ventas';
  const fromDate = params.from || addDays(today(), -30);
  const toDate = params.to || today();
  const barberId = params.barberId || '';
  const status = params.status || '';
  const barbers = await getAdminBarbers();
  const from = zonedDateStart(fromDate, tz());
  const to = zonedDateStart(addDays(toDate, 1), tz());

  let content = '';

  if (tab === 'pagos') {
    const query = new URLSearchParams({ from, to, limit: '200' });
    if (barberId) query.set('barberId', barberId);
    const payments = await apiGet(`/admin/payments?${query.toString()}`);

    content = `
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            payments.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Referencia</th><th>Barbero</th><th>Método</th><th>Monto</th><th>Propina</th><th>Estado</th></tr></thead><tbody>${payments
                  .map(
                    (payment) => `<tr><td>${h(formatDateTime(payment.paidAt, tz()))}</td><td>${h(payment.appointments?.code || payment.sales?.code || '—')}</td><td>${h(payment.barberName || '—')}</td><td>${h(methodLabel(payment.method))}</td><td>${money(payment.amount)}</td><td>${money(payment.tipAmount)}</td><td>${paymentBadge(payment.status)}</td></tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin pagos', 'No hay pagos en el rango seleccionado.')
          }
        </div>
      </section>
    `;
  } else {
    const query = new URLSearchParams({ from, to });
    if (barberId) query.set('barberId', barberId);
    if (status) query.set('status', status);
    const sales = await apiGet(`/admin/sales?${query.toString()}`);

    content = `
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            sales.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Barbero</th><th>Método</th><th>Total</th><th>Estado</th></tr></thead><tbody>${sales
                  .map(
                    (sale) => `<tr>
                      <td><button class="link-button" type="button" data-sale-id="${h(sale.id)}">${h(sale.code)}</button></td>
                      <td>${h(formatDateTime(sale.createdAt, tz()))}</td>
                      <td>${h(sale.clients?.fullName || '—')}</td>
                      <td>${h(sale.barbers?.displayName || '—')}</td>
                      <td>${h(methodLabel(sale.payments?.[0]?.method))}</td>
                      <td>${money(sale.total)}</td>
                      <td>${badge(sale.status, sale.status === 'pagada' ? 'Pagada' : sale.status === 'anulada' ? 'Anulada' : 'Abierta')}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin ventas', 'No hay ventas en el rango seleccionado.')
          }
        </div>
      </section>
    `;
  }

  view.innerHTML = `
    <div class="page">
      ${pageHead('Ventas y pagos', 'Transacciones personales, comprobantes internos y anulación de ventas.', tab === 'ventas' ? `<button class="button" type="button" data-new-sale>${icon('plus', 18)} Nueva venta</button>` : '')}
      <div class="tabs" role="tablist" aria-label="Ventas y pagos">
        <button class="tabs__button" type="button" role="tab" aria-selected="${tab === 'ventas'}" data-tab="ventas">Ventas</button>
        <button class="tabs__button" type="button" role="tab" aria-selected="${tab === 'pagos'}" data-tab="pagos">Pagos</button>
      </div>
      <div class="toolbar">
        <div class="field"><label class="field__label" for="sales-from">Desde</label><input class="field__input" id="sales-from" type="date" value="${h(fromDate)}" data-sales-from></div>
        <div class="field"><label class="field__label" for="sales-to">Hasta</label><input class="field__input" id="sales-to" type="date" value="${h(toDate)}" data-sales-to></div>
        <div class="field"><label class="field__label" for="sales-barber">Barbero</label><select class="field__input" id="sales-barber" data-sales-barber>${selectOptions(barbers, barberId, { labelKey: 'displayName', placeholder: 'Todos' })}</select></div>
        ${
          tab === 'ventas'
            ? `<div class="field"><label class="field__label" for="sales-status">Estado</label><select class="field__input" id="sales-status" data-sales-status>${selectOptions(
                [{ value: 'pagada', label: 'Pagada' }, { value: 'anulada', label: 'Anulada' }, { value: 'abierta', label: 'Abierta' }],
                status,
                { valueKey: 'value', labelKey: 'label', placeholder: 'Todas' },
              )}</select></div>`
            : ''
        }
      </div>
      ${content}
    </div>
  `;

  q('[data-tab="ventas"]', view)?.addEventListener('click', () => navigate('/ventas', { ...params, tab: '' }));
  q('[data-tab="pagos"]', view)?.addEventListener('click', () => navigate('/ventas', { ...params, tab: 'pagos' }));
  q('[data-new-sale]', view)?.addEventListener('click', () => openSaleForm());
  q('[data-sales-from]', view)?.addEventListener('change', (event) => navigate('/ventas', { ...params, from: event.target.value }));
  q('[data-sales-to]', view)?.addEventListener('change', (event) => navigate('/ventas', { ...params, to: event.target.value }));
  q('[data-sales-barber]', view)?.addEventListener('change', (event) => navigate('/ventas', { ...params, barberId: event.target.value }));
  q('[data-sales-status]', view)?.addEventListener('change', (event) => navigate('/ventas', { ...params, status: event.target.value }));
  qa('[data-sale-id]', view).forEach((button) => {
    button.addEventListener('click', () => navigate(`/ventas/${button.dataset.saleId}`));
  });
}

async function viewSaleDetail(view, segments) {
  const sale = await apiGet(`/admin/sales/${segments[0]}`);
  const payment = sale.payments?.[0] ?? null;
  const voided = sale.status === 'anulada';

  view.innerHTML = `
    <div class="page">
      ${pageHead(
        sale.code,
        `${formatDateTime(sale.createdAt, tz())} · ${sale.clients?.fullName || 'Sin cliente'}`,
        `<button class="button button--ghost" type="button" data-back-sales>${icon('arrowLeft', 16)} Volver</button>
         <button class="button button--ghost" type="button" data-print-sale>${icon('print', 16)} Comprobante</button>
         ${sale.status === 'pagada' ? `<button class="button button--danger" type="button" data-void-sale>Anular venta</button>` : ''}`,
      )}

      <div class="grid-2">
        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Detalle</h2>${badge(sale.status, sale.status === 'pagada' ? 'Pagada' : sale.status === 'anulada' ? 'Anulada' : 'Abierta')}</header>
          <div class="panel__body">
            <div class="detail-list">
              <div class="detail-list__row"><span class="detail-list__label">Cliente</span><span class="detail-list__value">${h(sale.clients?.fullName || '—')}</span></div>
              <div class="detail-list__row"><span class="detail-list__label">Barbero</span><span class="detail-list__value">${h(sale.barbers?.displayName || '—')}</span></div>
              <div class="detail-list__row"><span class="detail-list__label">Método</span><span class="detail-list__value">${h(methodLabel(payment?.method))}</span></div>
              <div class="detail-list__row"><span class="detail-list__label">Notas</span><span class="detail-list__value">${h(sale.notes || '—')}</span></div>
              ${voided ? `<div class="detail-list__row"><span class="detail-list__label">Anulada</span><span class="detail-list__value">${h(formatDateTime(sale.voidedAt, tz()))}</span></div><div class="detail-list__row"><span class="detail-list__label">Motivo</span><span class="detail-list__value">${h(sale.voidReason || '')}</span></div>` : ''}
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Totales</h2></header>
          <div class="panel__body">
            <div class="summary-line"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
            <div class="summary-line"><span>Descuento</span><span>${money(sale.discount)}</span></div>
            <div class="summary-line"><span>IVA</span><span>${money(sale.taxAmount)}</span></div>
            <div class="summary-line summary-line--total"><span>Total</span><span>${money(sale.total)}</span></div>
          </div>
        </section>
      </div>

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Ítems</h2></header>
        <div class="panel__body panel__body--flush">
          <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Tipo</th><th>Ítem</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr></thead><tbody>${(sale.saleItems ?? [])
            .map(
              (item) => `<tr><td>${h(item.itemType)}</td><td>${h(item.nameSnapshot)}</td><td>${formatNumber(item.quantity)}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td></tr>`,
            )
            .join('') || '<tr><td colspan="5" class="data-table__empty">Sin ítems.</td></tr>'}</tbody></table></div>
        </div>
      </section>
    </div>
  `;

  q('[data-back-sales]', view)?.addEventListener('click', () => navigate('/ventas'));
  q('[data-print-sale]', view)?.addEventListener('click', () => openReceipt({ type: 'sale', record: sale }));
  q('[data-void-sale]', view)?.addEventListener('click', () => openVoidSale(sale));
}

function openSaleForm() {
  Promise.all([
    getFormServices(),
    apiGet('/admin/products?limit=200'),
    apiGet('/admin/clients?limit=100'),
    getAdminBarbers(),
  ])
    .then(([services, products, clientsData, barbers]) => {
      const catalog = [
        ...services.map((service) => ({ type: 'servicio', id: service.id, name: service.name, price: Number(service.price) })),
        ...products.map((product) => ({ type: 'producto', id: product.id, name: product.name, price: Number(product.price) })),
      ];
      const cart = [];

      const body = `
        <form class="stack" data-sale-form>
          <div class="form-grid">
            <div class="field field--full">
              <label class="field__label" for="sale-item">Agregar ítem</label>
              <div class="toolbar__group">
                <select class="field__input" id="sale-item" data-sale-item>
                  <option value="">Selecciona un servicio o producto</option>
                  <optgroup label="Servicios">${services.map((service) => option(`${service.id}|servicio`, `${service.name} · ${money(service.price)}`)).join('')}</optgroup>
                  <optgroup label="Productos">${products.map((product) => option(`${product.id}|producto`, `${product.name} · ${money(product.price)}`)).join('')}</optgroup>
                </select>
                <button class="button button--ghost" type="button" data-add-item>Agregar</button>
              </div>
            </div>
            <div class="field"><label class="field__label" for="sale-client">Cliente</label><select class="field__input" id="sale-client" name="clientId">${selectOptions(clientsData.items ?? [], '', { labelKey: 'fullName', placeholder: 'Sin cliente' })}</select></div>
            <div class="field"><label class="field__label" for="sale-barber">Barbero</label><select class="field__input" id="sale-barber" name="barberId">${selectOptions(barbers, '', { labelKey: 'displayName', placeholder: 'Sin barbero' })}</select></div>
            <div class="field"><label class="field__label" for="sale-method">Método de pago</label><select class="field__input" id="sale-method" name="method">${selectOptions(
              Object.entries({ efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro' }).map(([value, label]) => ({ value, label })),
              'efectivo',
              { valueKey: 'value', labelKey: 'label' },
            )}</select></div>
            <div class="field"><label class="field__label" for="sale-discount">Descuento</label><input class="field__input" id="sale-discount" name="discount" type="number" min="0" step="1" value="0"></div>
            <div class="field field--full"><label class="field__label" for="sale-notes">Notas</label><textarea class="field__input field__input--area" id="sale-notes" name="notes" maxlength="500"></textarea></div>
          </div>

          <div class="panel">
            <header class="panel__head"><h3 class="panel__title">Carrito</h3><span class="muted" data-sale-preview>Total referencial: ${money(0)}</span></header>
            <div class="panel__body panel__body--flush" data-cart></div>
          </div>
          <p class="form-error" data-form-error role="alert" hidden></p>
        </form>
      `;

      openModal({
        title: 'Nueva venta',
        subtitle: 'El total definitivo se calcula en el servidor.',
        wide: true,
        body,
        footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="sale-form">Registrar venta</button>`,
        onMount: (dialog) => {
          const form = q('[data-sale-form]', dialog);
          form.id = 'sale-form';
          const cartNode = q('[data-cart]', form);
          const preview = q('[data-sale-preview]', form);
          const discountInput = q('[name="discount"]', form);

          const renderCart = () => {
            cartNode.innerHTML = cart.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Ítem</th><th>Cantidad</th><th>Precio</th><th>Total</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${cart
                  .map(
                    (item, index) => `<tr><td>${h(item.name)}<br><span class="muted">${h(item.type)}</span></td><td><div class="toolbar__group"><button class="button button--ghost button--small" type="button" data-cart-minus="${index}" aria-label="Disminuir cantidad de ${h(item.name)}">−</button><span>${item.quantity}</span><button class="button button--ghost button--small" type="button" data-cart-plus="${index}" aria-label="Aumentar cantidad de ${h(item.name)}">+</button></div></td><td>${money(item.price)}</td><td>${money(item.price * item.quantity)}</td><td><button class="button button--ghost button--small" type="button" data-cart-remove="${index}">Quitar</button></td></tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : '<p class="data-table__empty">Agrega servicios o productos a la venta.</p>';

            const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const discount = Number(discountInput.value || 0);
            preview.textContent = `Total referencial: ${money(Math.max(subtotal - discount, 0))}`;
            bindCartEvents();
          };

          const bindCartEvents = () => {
            qa('[data-cart-plus]', cartNode).forEach((button) => {
              button.onclick = () => {
                cart[Number(button.dataset.cartPlus)].quantity += 1;
                renderCart();
              };
            });
            qa('[data-cart-minus]', cartNode).forEach((button) => {
              button.onclick = () => {
                const item = cart[Number(button.dataset.cartMinus)];
                item.quantity = Math.max(1, item.quantity - 1);
                renderCart();
              };
            });
            qa('[data-cart-remove]', cartNode).forEach((button) => {
              button.onclick = () => {
                cart.splice(Number(button.dataset.cartRemove), 1);
                renderCart();
              };
            });
          };

          q('[data-add-item]', form)?.addEventListener('click', () => {
            const raw = value(form, 'sale-item');
            if (!raw) return;
            const [id, type] = raw.split('|');
            const found = catalog.find((item) => item.id === id && item.type === type);
            if (!found) return;
            const existing = cart.find((item) => item.id === id && item.type === type);
            if (existing) {
              existing.quantity += 1;
            } else {
              cart.push({ ...found, quantity: 1 });
            }
            q('[data-sale-item]', form).value = '';
            renderCart();
          });

          discountInput.addEventListener('input', renderCart);
          renderCart();

          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = q('button[type="submit"]', dialog);
            const errorBox = q('[data-form-error]', form);

            if (!cart.length) {
              errorBox.textContent = 'Agrega al menos un ítem a la venta.';
              errorBox.hidden = false;
              return;
            }

            setBusy(button, true, 'Registrando...');

            try {
              const sale = await apiPost('/admin/sales', {
                items: cart.map((item) => ({ type: item.type, id: item.id, quantity: item.quantity })),
                clientId: value(form, 'clientId') || null,
                barberId: value(form, 'barberId') || null,
                discount: Number(value(form, 'discount') || 0),
                method: value(form, 'method'),
                notes: value(form, 'notes') || null,
              });
              closeModal();
              toast(`Venta ${sale.code} registrada por ${money(sale.total)}.`, 'success');
              navigate(`/ventas/${sale.id}`);
            } catch (error) {
              errorBox.textContent = error.message;
              errorBox.hidden = false;
              setBusy(button, false);
            }
          });
        },
      });
    })
    .catch((error) => toast(error.message, 'error'));
}

function openVoidSale(sale) {
  openModal({
    title: 'Anular venta',
    subtitle: sale.code,
    narrow: true,
    body: `
      <form class="stack" data-void-form>
        <p>La venta quedará anulada, el pago se marcará como reembolsado y se repondrá el stock de los productos vendidos. Esta acción no se puede deshacer.</p>
        <div class="field">
          <label class="field__label" for="void-reason">Motivo obligatorio</label>
          <textarea class="field__input field__input--area" id="void-reason" name="reason" minlength="3" maxlength="500" required></textarea>
        </div>
        <p class="form-error" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Volver</button><button class="button button--danger" type="submit" form="void-form">Anular venta</button>`,
    onMount: (dialog) => {
      const form = q('[data-void-form]', dialog);
      form.id = 'void-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true, 'Anulando...');
        try {
          await apiPost(`/admin/sales/${sale.id}/void`, { reason: value(form, 'reason') });
          closeModal();
          toast('Venta anulada y stock repuesto.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Inventario
   -------------------------------------------------------------------------- */

async function viewInventory(view, _segments, params) {
  const search = params.q || '';
  const lowStock = params.lowStock === '1';
  const products = await apiGet(
    `/admin/products?search=${encodeURIComponent(search)}&lowStock=${lowStock ? 'true' : 'false'}`,
  );

  view.innerHTML = `
    <div class="page">
      ${pageHead('Inventario', 'Productos, existencias y movimientos auditados.', `<button class="button" type="button" data-new-product>${icon('plus', 18)} Nuevo producto</button>`)}
      <div class="toolbar">
        <form class="toolbar__group" data-product-search>
          <div class="field"><label class="field__label" for="product-search">Buscar</label><input class="field__input" id="product-search" name="q" type="search" value="${h(search)}" placeholder="Nombre, SKU o categoría"></div>
          <label class="field__check"><input type="checkbox" name="lowStock" ${lowStock ? 'checked' : ''}> Solo stock bajo</label>
          <button class="button button--ghost" type="submit">${icon('search', 16)} Filtrar</button>
        </form>
      </div>
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            products.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th>SKU</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Precio</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${products
                  .map(
                    (product) => `<tr>
                      <td>${h(product.name)}</td>
                      <td>${h(product.sku || '—')}</td>
                      <td>${h(product.category || '—')}</td>
                      <td>${formatNumber(product.stock)}${product.stock <= product.minStock ? ' <span class="badge badge--pendiente">Bajo</span>' : ''}</td>
                      <td>${formatNumber(product.minStock)}</td>
                      <td>${money(product.price)}</td>
                      <td>${badge(product.isActive ? 'activo' : 'inactivo', product.isActive ? 'Activo' : 'Inactivo')}</td>
                      <td><div class="data-table__actions">
                        <button class="button button--ghost button--small" type="button" data-edit-product="${h(product.id)}">Editar</button>
                        <button class="button button--ghost button--small" type="button" data-stock-product="${h(product.id)}">Stock</button>
                        <button class="button button--ghost button--small" type="button" data-movements-product="${h(product.id)}">Movimientos</button>
                      </div></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin productos', 'No hay productos que coincidan con el filtro.')
          }
        </div>
      </section>
    </div>
  `;

  q('[data-new-product]', view)?.addEventListener('click', () => openProductForm());
  q('[data-product-search]', view)?.addEventListener('submit', (event) => {
    event.preventDefault();
    navigate('/inventario', { q: value(event.target, 'q'), lowStock: readCheckbox(event.target, 'lowStock') ? '1' : '' });
  });
  qa('[data-edit-product]', view).forEach((button) => {
    const product = products.find((item) => item.id === button.dataset.editProduct);
    button.addEventListener('click', () => openProductForm(product));
  });
  qa('[data-stock-product]', view).forEach((button) => {
    const product = products.find((item) => item.id === button.dataset.stockProduct);
    button.addEventListener('click', () => openStockForm(product));
  });
  qa('[data-movements-product]', view).forEach((button) => {
    const product = products.find((item) => item.id === button.dataset.movementsProduct);
    button.addEventListener('click', () => openMovements(product));
  });
}

function openProductForm(product = null) {
  const editing = Boolean(product);
  openModal({
    title: editing ? 'Editar producto' : 'Nuevo producto',
    wide: true,
    body: `
      <form class="form-grid" data-product-form>
        <div class="field"><label class="field__label" for="product-name">Nombre</label><input class="field__input" id="product-name" name="name" maxlength="120" value="${h(product?.name || '')}" required></div>
        <div class="field"><label class="field__label" for="product-sku">SKU</label><input class="field__input" id="product-sku" name="sku" maxlength="40" value="${h(product?.sku || '')}"></div>
        <div class="field"><label class="field__label" for="product-category">Categoría</label><input class="field__input" id="product-category" name="category" maxlength="80" value="${h(product?.category || '')}"></div>
        <div class="field"><label class="field__label" for="product-cost">Costo</label><input class="field__input" id="product-cost" name="cost" type="number" min="0" step="1" value="${h(product?.cost ?? 0)}"></div>
        <div class="field"><label class="field__label" for="product-price">Precio</label><input class="field__input" id="product-price" name="price" type="number" min="0" step="1" value="${h(product?.price ?? '')}" required></div>
        ${editing ? '' : `<div class="field"><label class="field__label" for="product-stock">Stock inicial</label><input class="field__input" id="product-stock" name="stock" type="number" min="0" step="1" value="${h(product?.stock ?? 0)}"></div>`}
        <div class="field"><label class="field__label" for="product-min-stock">Stock mínimo</label><input class="field__input" id="product-min-stock" name="minStock" type="number" min="0" step="1" value="${h(product?.minStock ?? 0)}"></div>
        <div class="field field--full"><label class="field__label" for="product-description">Descripción</label><textarea class="field__input field__input--area" id="product-description" name="description" maxlength="1000">${h(product?.description || '')}</textarea></div>
        <div class="field field--full"><label class="field__label" for="product-image">Imagen (URL)</label><input class="field__input" id="product-image" name="imageUrl" maxlength="500" value="${h(product?.imageUrl || '')}"></div>
        <label class="field__check field--full"><input type="checkbox" name="isActive" ${product?.isActive !== false ? 'checked' : ''}> Activo</label>
        <p class="form-error field--full" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="product-form">${editing ? 'Guardar' : 'Crear'}</button>`,
    onMount: (dialog) => {
      const form = q('[data-product-form]', dialog);
      form.id = 'product-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true);
        try {
          const payload = {
            name: value(form, 'name'),
            sku: value(form, 'sku') || null,
            category: value(form, 'category') || null,
            description: value(form, 'description') || null,
            cost: Number(value(form, 'cost') || 0),
            price: Number(value(form, 'price')),
            minStock: Number(value(form, 'minStock') || 0),
            imageUrl: value(form, 'imageUrl') || null,
            isActive: readCheckbox(form, 'isActive'),
            ...(editing ? {} : { stock: Number(value(form, 'stock') || 0) }),
          };
          if (editing) {
            await apiPatch(`/admin/products/${product.id}`, payload);
          } else {
            await apiPost('/admin/products', payload);
          }
          closeModal();
          toast(editing ? 'Producto actualizado.' : 'Producto creado.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

function openStockForm(product) {
  openModal({
    title: 'Ajustar stock',
    subtitle: product.name,
    narrow: true,
    body: `
      <form class="stack" data-stock-form>
        <p class="muted">Stock actual: <strong>${formatNumber(product.stock)}</strong></p>
        <div class="field"><label class="field__label" for="stock-type">Tipo</label><select class="field__input" id="stock-type" name="type">${selectOptions(
          [{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }, { value: 'ajuste', label: 'Ajuste' }],
          'entrada',
          { valueKey: 'value', labelKey: 'label' },
        )}</select></div>
        <div class="field"><label class="field__label" for="stock-quantity">Cantidad</label><input class="field__input" id="stock-quantity" name="quantity" type="number" step="1" value="1" required><p class="field__hint">En ajuste puedes usar un número negativo.</p></div>
        <div class="field"><label class="field__label" for="stock-reason">Motivo</label><input class="field__input" id="stock-reason" name="reason" maxlength="500"></div>
        <p class="form-error" data-form-error role="alert" hidden></p>
      </form>
    `,
    footer: `<button class="button button--ghost" type="button" data-modal-close>Cancelar</button><button class="button" type="submit" form="stock-form">Guardar movimiento</button>`,
    onMount: (dialog) => {
      const form = q('[data-stock-form]', dialog);
      form.id = 'stock-form';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = q('button[type="submit"]', dialog);
        setBusy(button, true);
        try {
          await apiPost(`/admin/products/${product.id}/stock`, {
            type: value(form, 'type'),
            quantity: Number(value(form, 'quantity')),
            reason: value(form, 'reason') || null,
          });
          closeModal();
          toast('Stock actualizado.', 'success');
          renderRoute();
        } catch (error) {
          const errorBox = q('[data-form-error]', form);
          errorBox.textContent = error.message;
          errorBox.hidden = false;
          setBusy(button, false);
        }
      });
    },
  });
}

async function openMovements(product) {
  const movements = await apiGet(`/admin/products/${product.id}/movements`);
  openModal({
    title: 'Movimientos de stock',
    subtitle: product.name,
    wide: true,
    body: movements.length
      ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th></tr></thead><tbody>${movements
          .map(
            (movement) => `<tr><td>${h(formatDateTime(movement.createdAt, tz()))}</td><td>${h(movement.type)}</td><td>${formatNumber(movement.quantity)}</td><td>${h(movement.reason || '—')}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : emptyState('Sin movimientos', 'Este producto todavía no tiene movimientos.'),
    footer: '<button class="button button--ghost" type="button" data-modal-close>Cerrar</button>',
  });
}

/* --------------------------------------------------------------------------
   Reseñas, configuración y auditoría
   -------------------------------------------------------------------------- */

async function viewReviews(view, _segments, params) {
  const rating = params.rating || '';
  const reviews = await apiGet('/admin/reviews?limit=100');
  const filtered = rating ? reviews.filter((review) => String(review.rating) === rating) : reviews;

  view.innerHTML = `
    <div class="page">
      ${pageHead('Reseñas', 'Modera las reseñas antes de que aparezcan en el sitio público.')}
      <div class="toolbar">
        <div class="field"><label class="field__label" for="review-rating">Puntuación</label><select class="field__input" id="review-rating" data-review-rating>${selectOptions(
          [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} / 5` })),
          rating,
          { valueKey: 'value', labelKey: 'label', placeholder: 'Todas' },
        )}</select></div>
      </div>
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            filtered.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Barbero</th><th>Nota</th><th>Comentario</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${filtered
                  .map(
                    (review) => `<tr>
                      <td>${h(formatDateTime(review.createdAt, tz()))}</td>
                      <td>${h(review.clients?.fullName || '—')}</td>
                      <td>${h(review.barbers?.displayName || '—')}</td>
                      <td>${formatNumber(review.rating)} / 5</td>
                      <td>${h(review.comment || '—')}</td>
                      <td>${badge(review.isPublished ? 'publicada' : 'oculta', review.isPublished ? 'Publicada' : 'Oculta')}</td>
                      <td><button class="button button--ghost button--small" type="button" data-toggle-review="${h(review.id)}" data-published="${review.isPublished}">${review.isPublished ? 'Ocultar' : 'Publicar'}</button></td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin reseñas', 'No hay reseñas que coincidan con el filtro.')
          }
        </div>
      </section>
    </div>
  `;

  q('[data-review-rating]', view)?.addEventListener('change', (event) => navigate('/resenas', { rating: event.target.value }));
  qa('[data-toggle-review]', view).forEach((button) => {
    button.addEventListener('click', async () => {
      const next = button.dataset.published !== 'true';
      button.disabled = true;
      try {
        await apiPatch(`/admin/reviews/${button.dataset.toggleReview}`, { isPublished: next });
        toast(next ? 'Reseña publicada.' : 'Reseña oculta.', 'success');
        renderRoute();
      } catch (error) {
        button.disabled = false;
        toast(error.message, 'error');
      }
    });
  });
}

async function viewSettings(view) {
  const settings = await apiGet('/admin/settings');

  view.innerHTML = `
    <div class="page">
      ${pageHead('Configuración', 'Datos del negocio, reservas e impuestos.')}
      <form class="stack" data-settings-form>
        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Negocio</h2></header>
          <div class="panel__body">
            <div class="form-grid">
              <div class="field"><label class="field__label" for="settings-business">Nombre</label><input class="field__input" id="settings-business" name="businessName" maxlength="120" value="${h(settings.businessName || '')}" required></div>
              <div class="field"><label class="field__label" for="settings-legal">Razón social</label><input class="field__input" id="settings-legal" name="legalName" maxlength="120" value="${h(settings.legalName || '')}"></div>
              <div class="field"><label class="field__label" for="settings-tax-id">RUT</label><input class="field__input" id="settings-tax-id" name="taxId" maxlength="30" value="${h(settings.taxId || '')}"></div>
              <div class="field"><label class="field__label" for="settings-phone">Teléfono</label><input class="field__input" id="settings-phone" name="phone" maxlength="20" value="${h(settings.phone || '')}"></div>
              <div class="field"><label class="field__label" for="settings-email">Correo</label><input class="field__input" id="settings-email" name="email" type="email" maxlength="254" value="${h(settings.email || '')}"></div>
              <div class="field"><label class="field__label" for="settings-address">Dirección</label><input class="field__input" id="settings-address" name="address" maxlength="200" value="${h(settings.address || '')}"></div>
              <div class="field"><label class="field__label" for="settings-city">Ciudad</label><input class="field__input" id="settings-city" name="city" maxlength="80" value="${h(settings.city || '')}"></div>
              <div class="field"><label class="field__label" for="settings-instagram">Instagram</label><input class="field__input" id="settings-instagram" name="instagram" maxlength="100" value="${h(settings.instagram || '')}"></div>
              <div class="field"><label class="field__label" for="settings-whatsapp">WhatsApp</label><input class="field__input" id="settings-whatsapp" name="whatsapp" maxlength="20" value="${h(settings.whatsapp || '')}"></div>
              <div class="field"><label class="field__label" for="settings-maps">Mapa (URL)</label><input class="field__input" id="settings-maps" name="mapsUrl" maxlength="500" value="${h(settings.mapsUrl || '')}"></div>
              <div class="field field--full"><label class="field__label" for="settings-logo">Logo (URL)</label><input class="field__input" id="settings-logo" name="logoUrl" maxlength="500" value="${h(settings.logoUrl || '')}"></div>
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__head"><h2 class="panel__title">Reservas e impuestos</h2></header>
          <div class="panel__body">
            <div class="form-grid">
              <div class="field"><label class="field__label" for="settings-timezone">Zona horaria</label><input class="field__input" id="settings-timezone" name="timezone" maxlength="64" value="${h(settings.timezone || '')}" required></div>
              <div class="field"><label class="field__label" for="settings-currency">Moneda</label><input class="field__input" id="settings-currency" name="currency" maxlength="3" value="${h(settings.currency || 'CLP')}" required></div>
              <div class="field"><label class="field__label" for="settings-locale">Locale</label><input class="field__input" id="settings-locale" name="locale" maxlength="20" value="${h(settings.locale || 'es-CL')}" required></div>
              <div class="field"><label class="field__label" for="settings-prefix">Prefijo telefónico</label><input class="field__input" id="settings-prefix" name="phonePrefix" maxlength="5" value="${h(settings.phonePrefix || '+56')}" required></div>
              <div class="field"><label class="field__label" for="settings-slot">Intervalo de slots</label><select class="field__input" id="settings-slot" name="slotIntervalMin">${selectOptions(
                [5, 10, 15, 20, 30, 45, 60].map((item) => ({ value: item, label: `${item} min` })),
                settings.slotIntervalMin,
                { valueKey: 'value', labelKey: 'label' },
              )}</select></div>
              <div class="field"><label class="field__label" for="settings-min-advance">Anticipación mínima (min)</label><input class="field__input" id="settings-min-advance" name="minAdvanceMin" type="number" min="0" step="1" value="${h(settings.minAdvanceMin ?? 60)}"></div>
              <div class="field"><label class="field__label" for="settings-max-advance">Anticipación máxima (días)</label><input class="field__input" id="settings-max-advance" name="maxAdvanceDays" type="number" min="1" max="365" step="1" value="${h(settings.maxAdvanceDays ?? 60)}"></div>
              <div class="field"><label class="field__label" for="settings-cancellation">Plazo de cancelación (horas)</label><input class="field__input" id="settings-cancellation" name="cancellationHours" type="number" min="0" max="720" step="1" value="${h(settings.cancellationHours ?? 12)}"></div>
              <div class="field"><label class="field__label" for="settings-deposit">Depósito (%)</label><input class="field__input" id="settings-deposit" name="depositPercent" type="number" min="0" max="100" step="0.01" value="${h(settings.depositPercent ?? 0)}"></div>
              <div class="field"><label class="field__label" for="settings-tax">IVA (%)</label><input class="field__input" id="settings-tax" name="taxRate" type="number" min="0" max="100" step="0.01" value="${h(settings.taxRate ?? 19)}"></div>
              <label class="field__check field--full"><input type="checkbox" name="pricesIncludeTax" ${settings.pricesIncludeTax !== false ? 'checked' : ''}> Los precios incluyen IVA</label>
            </div>
            <p class="field__hint">Cambiar zona horaria, moneda o IVA afecta la disponibilidad, los precios y los documentos. Revisa el efecto antes de guardar.</p>
          </div>
        </section>

        <div class="form-actions"><button class="button" type="submit">Guardar configuración</button></div>
        <p class="form-error" data-form-error role="alert" hidden></p>
      </form>
    </div>
  `;

  const form = q('[data-settings-form]', view);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = {
      businessName: value(form, 'businessName'),
      legalName: value(form, 'legalName') || null,
      taxId: value(form, 'taxId') || null,
      phone: value(form, 'phone') || null,
      email: value(form, 'email') || null,
      address: value(form, 'address') || null,
      city: value(form, 'city') || null,
      instagram: value(form, 'instagram') || null,
      whatsapp: value(form, 'whatsapp') || null,
      mapsUrl: value(form, 'mapsUrl') || null,
      logoUrl: value(form, 'logoUrl') || null,
      timezone: value(form, 'timezone'),
      currency: value(form, 'currency').toUpperCase(),
      locale: value(form, 'locale'),
      phonePrefix: value(form, 'phonePrefix'),
      slotIntervalMin: Number(value(form, 'slotIntervalMin')),
      minAdvanceMin: Number(value(form, 'minAdvanceMin') || 0),
      maxAdvanceDays: Number(value(form, 'maxAdvanceDays') || 60),
      cancellationHours: Number(value(form, 'cancellationHours') || 0),
      depositPercent: Number(value(form, 'depositPercent') || 0),
      taxRate: Number(value(form, 'taxRate') || 0),
      pricesIncludeTax: readCheckbox(form, 'pricesIncludeTax'),
    };

    const sensitive =
      payload.timezone !== settings.timezone ||
      payload.currency !== settings.currency ||
      Number(payload.taxRate) !== Number(settings.taxRate) ||
      payload.pricesIncludeTax !== settings.pricesIncludeTax;

    const save = async () => {
      const button = q('button[type="submit"]', form);
      setBusy(button, true);
      try {
        await apiPatch('/admin/settings', payload);
        state.settings = { ...state.settings, ...(await apiGet('/admin/settings')) };
        closeModal();
        toast('Configuración actualizada.', 'success');
        renderRoute();
      } catch (error) {
        const errorBox = q('[data-form-error]', view);
        errorBox.textContent = error.message;
        errorBox.hidden = false;
        setBusy(button, false);
      }
    };

    if (sensitive) {
      confirmAction({
        title: 'Confirmar cambios sensibles',
        message: 'Cambiaste zona horaria, moneda o IVA. Estos valores afectan reservas, precios y comprobantes. ¿Guardar de todas formas?',
        confirmLabel: 'Guardar',
        onConfirm: save,
      });
    } else {
      save();
    }
  });
}

async function viewAudit(view) {
  const records = await apiGet('/admin/audit?limit=100');

  view.innerHTML = `
    <div class="page">
      ${pageHead('Auditoría', 'Últimas acciones administrativas registradas.')}
      <section class="panel">
        <div class="panel__body panel__body--flush">
          ${
            records.length
              ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>${records
                  .map(
                    (record) => `<tr>
                      <td class="nowrap">${h(formatDateTime(record.createdAt, tz()))}</td>
                      <td>${h(record.profiles?.fullName || 'Sistema')}</td>
                      <td>${h(record.action)}</td>
                      <td>${h(record.entity)}${record.entityId ? `<br><span class="muted">${h(record.entityId)}</span>` : ''}</td>
                      <td>${record.after ? `<details><summary>Ver datos</summary><pre>${h(JSON.stringify(record.after, null, 2))}</pre></details>` : '—'}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table></div>`
              : emptyState('Sin registros', 'Todavía no hay acciones administrativas.')
          }
        </div>
      </section>
    </div>
  `;
}

function viewProfile(view) {
  view.innerHTML = `
    <div class="page">
      ${pageHead('Mi perfil', 'Datos de la sesión actual.')}
      <section class="panel">
        <div class="panel__body">
          <div class="detail-list">
            <div class="detail-list__row"><span class="detail-list__label">Nombre</span><span class="detail-list__value">${h(state.user.fullName || '—')}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Correo</span><span class="detail-list__value">${h(state.user.email || '—')}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Usuario</span><span class="detail-list__value">${h(state.user.username || '—')}</span></div>
            <div class="detail-list__row"><span class="detail-list__label">Rol</span><span class="detail-list__value">${state.user.role === 'admin' ? 'Administrador' : 'Barbero'}</span></div>
            ${state.user.barberId ? `<div class="detail-list__row"><span class="detail-list__label">Ficha de barbero</span><span class="detail-list__value">${h(state.user.barberId)}</span></div>` : ''}
          </div>
          <p class="field__hint">La creación de usuarios administradores y la recuperación de acceso quedan en manos del desarrollador.</p>
        </div>
      </section>

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Cambiar contraseña</h2></header>
        <div class="panel__body">
          <form class="form-grid" data-password-form>
            <div class="field field--full">
              <label class="field__label" for="current-password">Contraseña actual</label>
              <input class="field__input" id="current-password" name="currentPassword" type="password" autocomplete="current-password" minlength="8" maxlength="128" required>
            </div>
            <div class="field">
              <label class="field__label" for="new-password">Nueva contraseña</label>
              <input class="field__input" id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
            </div>
            <div class="field">
              <label class="field__label" for="confirm-password">Repetir nueva contraseña</label>
              <input class="field__input" id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
            </div>
            <p class="form-error field--full" data-password-error role="alert" hidden></p>
            <div class="form-actions field--full">
              <button class="button" type="submit">Cambiar contraseña</button>
            </div>
          </form>
        </div>
      </section>

      <button class="button button--ghost" type="button" data-profile-logout>${icon('logout', 18)} Cerrar sesión</button>
    </div>
  `;

  const passwordForm = q('[data-password-form]', view);
  const passwordError = q('[data-password-error]', view);

  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = q('button[type="submit"]', passwordForm);
    const currentPassword = value(passwordForm, 'currentPassword');
    const newPassword = value(passwordForm, 'newPassword');
    const confirmPassword = value(passwordForm, 'confirmPassword');

    passwordError.hidden = true;

    if (newPassword !== confirmPassword) {
      passwordError.textContent = 'La nueva contraseña y su confirmación no coinciden.';
      passwordError.hidden = false;
      passwordForm.elements.namedItem('confirmPassword')?.focus();
      return;
    }

    if (newPassword === currentPassword) {
      passwordError.textContent = 'La nueva contraseña debe ser distinta a la actual.';
      passwordError.hidden = false;
      passwordForm.elements.namedItem('newPassword')?.focus();
      return;
    }

    setBusy(button, true, 'Cambiando...');

    try {
      await changePassword(currentPassword, newPassword);
      passwordForm.reset();
      toast('Contraseña actualizada.', 'success');
    } catch (error) {
      passwordError.textContent = error.message;
      passwordError.hidden = false;
      passwordForm.elements.namedItem('currentPassword')?.focus();
    } finally {
      setBusy(button, false);
    }
  });

  q('[data-profile-logout]', view)?.addEventListener('click', async () => {
    await logout();
    state.user = null;
    navigate('/login');
  });
}

async function viewMyAgenda(view, _segments, params) {
  await viewAgenda(view, _segments, params);
}

/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */

modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

modal.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeModal();
});

window.addEventListener('hashchange', renderRoute);

setUnauthorizedHandler(() => {
  state.user = null;
  renderLogin('La sesión expiró. Inicia sesión nuevamente.');
});

async function boot() {
  applyTheme(initialTheme());
  await loadSettings();

  if (!window.location.hash) {
    window.location.hash = '#/login';
  }

  const user = await restoreSession();

  if (user) {
    state.user = user;
    await loadSettings();

    if (parseHash().path === '/login' || parseHash().path === '/') {
      navigate(defaultPath());
      return;
    }
  } else {
    state.user = null;
  }

  await renderRoute();
}

boot();
