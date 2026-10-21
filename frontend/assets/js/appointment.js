import { cancelAppointmentByCode, lookupAppointment } from './api.js';
import { capitalize, formatPrice, phoneDigits } from './format.js';

const PHONE_PATTERN = /^9\d{8}$/;
const CODE_PATTERN = /^[A-Z0-9-]{4,30}$/;
const ACTIVE_STATUSES = new Set(['pendiente', 'confirmada']);

const STATUS_LABELS = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

const STATUS_CLASSES = {
  pendiente: 'active',
  confirmada: 'active',
  en_curso: 'progress',
  completada: 'closed',
  cancelada: 'cancelled',
  no_asistio: 'closed',
};

function isReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatAppointmentDate(value, timeZone) {
  return capitalize(
    new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    }).format(new Date(value)),
  );
}

function formatAppointmentTime(value, timeZone) {
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? capitalize(String(status ?? '').replaceAll('_', ' '));
}

function statusClass(status) {
  return STATUS_CLASSES[status] ?? 'closed';
}

function cancellationDeadline(appointment) {
  const hours = Number(appointment?.cancellationHours);
  const startsAt = new Date(appointment?.startsAt ?? '');

  if (!Number.isFinite(hours) || Number.isNaN(startsAt.getTime())) {
    return null;
  }

  return new Date(startsAt.getTime() - hours * 60 * 60 * 1000);
}

function canCancel(appointment) {
  if (!ACTIVE_STATUSES.has(appointment?.status)) {
    return false;
  }

  const deadline = cancellationDeadline(appointment);
  return !deadline || Date.now() <= deadline.getTime();
}

function deadlineText(appointment, timeZone) {
  const deadline = cancellationDeadline(appointment);

  if (!deadline) {
    return 'La cancelación está sujeta al plazo configurado por la barbería.';
  }

  const hours = Number(appointment.cancellationHours);

  if (hours === 0) {
    return 'Puedes cancelar hasta el inicio de la cita.';
  }

  const deadlineDate = formatAppointmentDate(deadline.toISOString(), timeZone).replace(
    /^./,
    (character) => character.toLowerCase(),
  );

  return `Puedes cancelar hasta el ${deadlineDate} a las ${formatAppointmentTime(
    deadline.toISOString(),
    timeZone,
  )}.`;
}

function noticeFor(appointment, timeZone) {
  if (appointment?.status === 'cancelada') {
    return 'Esta reserva fue cancelada. Si necesitas una nueva hora, agenda otra cita.';
  }

  if (appointment?.status === 'completada') {
    return 'Esta reserva ya fue completada.';
  }

  if (appointment?.status === 'no_asistio') {
    return 'Esta reserva quedó registrada como no asistida.';
  }

  if (appointment?.status === 'en_curso') {
    return 'Esta reserva está en curso.';
  }

  if (ACTIVE_STATUSES.has(appointment?.status)) {
    if (canCancel(appointment)) {
      return deadlineText(appointment, timeZone);
    }

    return 'Ya pasó el plazo para cancelar en línea. Contáctanos por teléfono.';
  }

  return '';
}

function errorMessage(error) {
  if (error?.code === 'APPOINTMENT_NOT_FOUND') {
    return 'No encontramos una reserva con ese código y teléfono. Revisa los datos e intenta nuevamente.';
  }

  if (error?.code === 'CANCELLATION_WINDOW') {
    return 'Ya pasó el plazo para cancelar en línea. Contáctanos por teléfono.';
  }

  if (error?.code === 'APPOINTMENT_CLOSED') {
    return 'Esta reserva ya no puede cancelarse.';
  }

  if (error?.code === 'TOO_MANY_REQUESTS' || error?.status === 429) {
    return 'Hiciste demasiadas solicitudes. Espera unos minutos e intenta nuevamente.';
  }

  return error?.message || 'No pudimos completar la solicitud. Intenta nuevamente.';
}

export function initAppointmentManager({ timezone = 'America/Santiago' } = {}) {
  const manager = document.querySelector('[data-manage]');
  const form = document.querySelector('[data-manage-form]');

  if (!manager || !form) {
    return;
  }

  const elements = {
    code: form.elements.namedItem('code'),
    phone: form.elements.namedItem('phone'),
    submit: document.querySelector('[data-manage-submit]'),
    formError: document.querySelector('[data-manage-form-error]'),
    result: document.querySelector('[data-manage-result]'),
    resultTitle: document.querySelector('[data-manage-result-title]'),
    state: document.querySelector('[data-manage-state]'),
    details: document.querySelector('[data-manage-details]'),
    codeValue: document.querySelector('[data-manage-code-value]'),
    status: document.querySelector('[data-manage-status]'),
    list: document.querySelector('[data-manage-list]'),
    notice: document.querySelector('[data-manage-notice]'),
    actions: document.querySelector('[data-manage-actions]'),
    cancel: document.querySelector('[data-manage-cancel]'),
    newBooking: document.querySelector('[data-manage-new]'),
    confirm: document.querySelector('[data-manage-confirm]'),
    reason: document.querySelector('[data-manage-reason]'),
    reasonError: document.querySelector('[data-manage-reason-error]'),
    cancelError: document.querySelector('[data-manage-cancel-error]'),
    confirmCancel: document.querySelector('[data-manage-confirm-cancel]'),
    abort: document.querySelector('[data-manage-abort]'),
    feedback: document.querySelector('[data-manage-feedback]'),
  };

  if (!elements.code || !elements.phone) {
    return;
  }

  const state = {
    appointment: null,
    code: '',
    phone: '',
    loading: false,
    cancelling: false,
  };

  function setFieldError(field, message) {
    const input = form.elements.namedItem(field);
    const error = form.querySelector(`[data-error-for="${field}"]`);

    if (!input || !(input instanceof HTMLElement) || !error) {
      return;
    }

    if (message) {
      error.textContent = message;
      error.id = `manage-error-${field}`;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
    } else {
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  function clearFieldErrors() {
    setFieldError('code', '');
    setFieldError('phone', '');
  }

  function showFormError(message) {
    if (!elements.formError) {
      return;
    }

    elements.formError.textContent = message;
    elements.formError.hidden = false;
  }

  function clearFormError() {
    if (!elements.formError) {
      return;
    }

    elements.formError.textContent = '';
    elements.formError.hidden = true;
  }

  function showCancelError(message) {
    if (!elements.cancelError) {
      return;
    }

    elements.cancelError.textContent = message;
    elements.cancelError.hidden = false;
  }

  function clearCancelError() {
    if (!elements.cancelError) {
      return;
    }

    elements.cancelError.textContent = '';
    elements.cancelError.hidden = true;
  }

  function setLookupBusy(busy) {
    if (elements.submit) {
      elements.submit.disabled = busy;
      elements.submit.textContent = busy ? 'Consultando reserva' : 'Consultar reserva';
    }

    form.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function setCancelBusy(busy) {
    if (elements.confirmCancel) {
      elements.confirmCancel.disabled = busy;
      elements.confirmCancel.textContent = busy ? 'Cancelando' : 'Confirmar cancelación';
    }

    if (elements.abort) {
      elements.abort.disabled = busy;
    }
  }

  function setHasResult(hasResult) {
    manager.classList.toggle('manage--has-result', hasResult);
  }

  function clearResult() {
    setHasResult(false);

    if (elements.details) {
      elements.details.hidden = true;
    }

    if (elements.state) {
      elements.state.textContent = '';
    }

    if (elements.feedback) {
      elements.feedback.hidden = true;
      elements.feedback.textContent = '';
    }

    if (elements.confirm) {
      elements.confirm.hidden = true;
    }

    if (elements.cancelError) {
      clearCancelError();
    }

    if (elements.reason) {
      elements.reason.value = '';
    }

    if (elements.reasonError) {
      elements.reasonError.textContent = '';
    }

    state.appointment = null;
  }

  function renderDetails(appointment) {
    if (!elements.details || !elements.list || !elements.status || !elements.codeValue) {
      return;
    }

    setHasResult(true);
    elements.details.hidden = false;

    if (elements.state) {
      elements.state.textContent = '';
    }

    elements.codeValue.textContent = appointment.code;
    elements.status.textContent = statusLabel(appointment.status);
    elements.status.className = `manage__badge manage__badge--${statusClass(appointment.status)}`;

    elements.list.replaceChildren();

    const services = Array.isArray(appointment.services)
      ? appointment.services.map((service) => service.name).filter(Boolean).join(', ')
      : '';
    const date = appointment.startsAt
      ? formatAppointmentDate(appointment.startsAt, timezone)
      : '';
    const time = appointment.startsAt
      ? formatAppointmentTime(appointment.startsAt, timezone)
      : '';

    const rows = [
      ['Fecha', date],
      ['Hora', time],
      ['Barbero', appointment.barber?.name || ''],
      ['Servicios', services],
      ['Total', formatPrice(appointment.total)],
    ];

    for (const [label, value] of rows) {
      if (!value) {
        continue;
      }

      const row = document.createElement('div');
      row.className = 'manage__row';

      const term = document.createElement('dt');
      term.textContent = label;

      const description = document.createElement('dd');
      description.textContent = value;

      row.append(term, description);
      elements.list.append(row);
    }

    if (elements.notice) {
      elements.notice.textContent = noticeFor(appointment, timezone);
    }

    const cancellable = canCancel(appointment);
    const showNewBooking = appointment.status === 'cancelada';

    if (elements.cancel) {
      elements.cancel.hidden = !cancellable;
    }

    if (elements.newBooking) {
      elements.newBooking.hidden = !showNewBooking;
    }

    if (elements.actions) {
      elements.actions.hidden = !cancellable && !showNewBooking;
    }

    if (elements.confirm) {
      elements.confirm.hidden = true;
    }

    if (elements.feedback) {
      elements.feedback.hidden = true;
    }
  }

  function revealResult() {
    if (!elements.result) {
      return;
    }

    elements.result.hidden = false;
    elements.resultTitle?.focus({ preventScroll: true });
    elements.result.scrollIntoView({
      behavior: isReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  async function submitLookup(event) {
    event.preventDefault();

    if (state.loading) {
      return;
    }

    clearFormError();
    clearFieldErrors();

    const code = normalizeCode(elements.code.value);
    const phone = phoneDigits(elements.phone.value);
    let firstInvalid = null;

    if (!CODE_PATTERN.test(code)) {
      setFieldError('code', 'Ingresa un código de reserva válido.');
      firstInvalid = elements.code;
    }

    if (!PHONE_PATTERN.test(phone)) {
      setFieldError('phone', 'Ingresa un celular chileno de 9 dígitos que comience con 9.');
      firstInvalid = firstInvalid ?? elements.phone;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    elements.code.value = code;
    state.code = code;
    state.phone = phone;
    state.loading = true;
    setLookupBusy(true);
    clearResult();

    if (elements.result) {
      elements.result.hidden = false;
    }

    setHasResult(true);

    if (elements.state) {
      elements.state.textContent = 'Buscando tu reserva.';
    }

    try {
      const appointment = await lookupAppointment(code, `+56${phone}`);
      state.appointment = appointment;
      renderDetails(appointment);
      revealResult();
    } catch (error) {
      if (elements.result) {
        elements.result.hidden = true;
      }

      if (elements.state) {
        elements.state.textContent = '';
      }

      setHasResult(false);
      showFormError(errorMessage(error));
    } finally {
      state.loading = false;
      setLookupBusy(false);
    }
  }

  function openCancellation() {
    if (!state.appointment || !canCancel(state.appointment)) {
      return;
    }

    clearCancelError();

    if (elements.reason) {
      elements.reason.value = '';
    }

    if (elements.reasonError) {
      elements.reasonError.textContent = '';
    }

    if (elements.actions) {
      elements.actions.hidden = true;
    }

    if (elements.confirm) {
      elements.confirm.hidden = false;
    }

    elements.confirmCancel?.focus({ preventScroll: true });
  }

  function closeCancellation() {
    clearCancelError();

    if (elements.confirm) {
      elements.confirm.hidden = true;
    }

    if (elements.actions) {
      elements.actions.hidden = false;
    }

    elements.cancel?.focus({ preventScroll: true });
  }

  async function confirmCancellation() {
    if (!state.appointment || state.cancelling) {
      return;
    }

    const reason = String(elements.reason?.value ?? '').trim();

    clearCancelError();

    if (reason.length > 500) {
      if (elements.reasonError) {
        elements.reasonError.textContent = 'El motivo no puede superar los 500 caracteres.';
      }

      elements.reason?.focus();
      return;
    }

    if (elements.reasonError) {
      elements.reasonError.textContent = '';
    }

    state.cancelling = true;
    setCancelBusy(true);

    try {
      const result = await cancelAppointmentByCode(state.code, `+56${state.phone}`, reason || null);
      state.appointment = {
        ...state.appointment,
        status: result?.status || 'cancelada',
        cancelledAt: result?.cancelledAt ?? null,
      };

      renderDetails(state.appointment);

      if (elements.notice) {
        elements.notice.textContent = '';
      }

      if (elements.feedback) {
        elements.feedback.textContent =
          'Reserva cancelada. El horario quedó liberado; si necesitas otra hora, agenda una nueva cita.';
        elements.feedback.hidden = false;
      }

      elements.resultTitle?.focus({ preventScroll: true });
    } catch (error) {
      showCancelError(errorMessage(error));
    } finally {
      state.cancelling = false;
      setCancelBusy(false);
    }
  }

  form.addEventListener('submit', submitLookup);

  form.addEventListener('input', (event) => {
    const input = event.target;

    if (input.name === 'code') {
      const normalized = input.value.toUpperCase().replace(/\s+/g, '');

      if (input.value !== normalized) {
        input.value = normalized;
      }
    }

    if (input.name === 'phone') {
      let digits = input.value.replace(/\D/g, '');

      if (digits.startsWith('56') && digits.length > 9) {
        digits = digits.slice(2);
      }

      digits = digits.slice(0, 9);

      if (input.value !== digits) {
        input.value = digits;
      }
    }

    if (input.name) {
      setFieldError(input.name, '');
    }

    clearFormError();
  });

  elements.cancel?.addEventListener('click', openCancellation);
  elements.abort?.addEventListener('click', closeCancellation);
  elements.confirmCancel?.addEventListener('click', confirmCancellation);

  elements.newBooking?.addEventListener('click', () => {
    document.querySelector('[data-new-booking]')?.click();
  });

  document.addEventListener('appointment:created', (event) => {
    const code = event.detail?.code;

    if (!code) {
      return;
    }

    elements.code.value = code;
  });

  document.querySelector('[data-manage-success]')?.addEventListener('click', () => {
    window.setTimeout(() => {
      elements.phone.focus();
    }, 0);
  });
}
