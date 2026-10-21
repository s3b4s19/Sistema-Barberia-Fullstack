import { createAppointment, getDayAvailability } from './api.js';
import {
  addDays,
  capitalize,
  daysInMonth,
  formatDuration,
  formatLongDate,
  formatMonth,
  formatPrice,
  phoneDigits,
  toDateString,
  todayInZone,
  weekdayOf,
} from './format.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^9\d{8}$/;
const SKELETON_COUNT = 18;

function isReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initBooking({ services, barbers, settings, hours }) {
  const wizard = document.querySelector('[data-wizard]');
  const form = document.querySelector('[data-booking-form]');

  if (!wizard || !form) {
    return { selectService: () => {} };
  }

  const timezone = settings?.timezone || 'America/Santiago';
  const maxAdvanceDays = Number(settings?.maxAdvanceDays ?? 60);
  const today = todayInZone(timezone);
  const maxDate = addDays(today, maxAdvanceDays);
  const reducedMotion = isReducedMotion();

  const elements = {
    steps: wizard.querySelector('.wizard__steps'),
    indicators: [...wizard.querySelectorAll('[data-step-indicator]')],
    panels: [...wizard.querySelectorAll('[data-step]')],
    servicePicker: document.querySelector('[data-service-picker]'),
    barberNote: document.querySelector('[data-barber-note]'),
    mobileSummary: document.querySelector('[data-mobile-summary]'),
    calendar: document.querySelector('[data-calendar]'),
    calendarMonth: document.querySelector('[data-calendar-month]'),
    calendarPrev: document.querySelector('[data-calendar-prev]'),
    calendarNext: document.querySelector('[data-calendar-next]'),
    calendarDays: document.querySelector('[data-calendar-days]'),
    slotsTitle: document.querySelector('[data-slots-title]'),
    slotsCount: document.querySelector('[data-slots-count]'),
    slotsStatus: document.querySelector('[data-slots-status]'),
    slotsGrid: document.querySelector('[data-slots-grid]'),
    summaryService: document.querySelector('[data-summary-service]'),
    summaryBarber: document.querySelector('[data-summary-barber]'),
    summaryDate: document.querySelector('[data-summary-date]'),
    summaryTime: document.querySelector('[data-summary-time]'),
    summaryTotal: document.querySelector('[data-summary-total]'),
    formError: document.querySelector('[data-form-error]'),
    submit: document.querySelector('[data-submit]'),
    success: document.querySelector('[data-success]'),
    successCode: document.querySelector('[data-success-code]'),
    successDetails: document.querySelector('[data-success-details]'),
    copyCode: document.querySelector('[data-copy-code]'),
    newBooking: document.querySelector('[data-new-booking]'),
  };

  const state = {
    step: 1,
    service: null,
    barber: null,
    date: null,
    slot: null,
    price: null,
    duration: null,
    view: null,
    availability: null,
    loading: false,
    submitting: false,
    appointment: null,
    notice: null,
  };

  let availabilityController = null;
  let requestToken = 0;

  const flatServices = services ?? [];

  function findService(id) {
    return flatServices.find((service) => service.id === id) ?? null;
  }

  function getIndicators() {
    return elements.indicators;
  }

  function getPanel(step) {
    return elements.panels.find((panel) => Number(panel.dataset.step) === step) ?? null;
  }

  function getNextButton(step) {
    return getPanel(step)?.querySelector('[data-next-step]') ?? null;
  }

  function updateStepIndicator() {
    for (const indicator of getIndicators()) {
      const step = Number(indicator.dataset.stepIndicator);
      const isCurrent = step === state.step;
      indicator.classList.toggle('wizard__step--current', isCurrent);
      indicator.classList.toggle('wizard__step--done', step < state.step);

      if (isCurrent) {
        indicator.setAttribute('aria-current', 'step');
      } else {
        indicator.removeAttribute('aria-current');
      }
    }
  }

  function focusHeading(step) {
    const panel = getPanel(step);
    const heading = panel?.querySelector('.wizard__title');

    if (heading) {
      heading.focus({ preventScroll: true });
    }

    if (state.step > 1) {
      panel?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function openStep(step) {
    state.step = step;
    updateStepIndicator();

    for (const panel of elements.panels) {
      panel.hidden = Number(panel.dataset.step) !== step;
    }

    if (elements.steps) {
      elements.steps.hidden = false;
    }

    if (elements.success) {
      elements.success.hidden = true;
    }

    updateMobileSummary();
    updateStepState();

    if (step === 2) {
      prepareStepTwo();
    }

    focusHeading(step);
  }

  function prepareStepTwo() {
    if (!state.service) {
      return;
    }

    renderBarberNote();

    if (!state.barber) {
      renderSlotsStatus('Elige un barbero para ver los horarios.');
      elements.slotsGrid.replaceChildren();
      elements.slotsCount.textContent = '';
      return;
    }

    if (!state.date) {
      state.date = initialDate();
    }

    state.view = monthOf(state.date);
    renderCalendar();
    updateSummary();

    const availabilityMatches =
      state.availability &&
      state.availability.date === state.date &&
      state.availability.service?.id === state.service.id &&
      state.availability.barber?.id === state.barber.id;

    if (!availabilityMatches && !state.loading) {
      loadAvailability();
    }
  }

  function monthOf(date) {
    const parsed = new Date(`${date}T00:00:00Z`);
    return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() };
  }

  function initialDate() {
    for (let offset = 0; offset <= 7; offset += 1) {
      const date = addDays(today, offset);

      if (date <= maxDate && !isClosed(date)) {
        return date;
      }
    }

    return today;
  }

  function barberById(id) {
    return (barbers ?? []).find((barber) => barber.id === id) ?? null;
  }

  function barberHasSchedule(barber) {
    if (!barber || !Array.isArray(barber.schedules)) {
      return true;
    }

    return barber.schedules.some((schedule) => schedule.isActive !== false);
  }

  function isClosed(date) {
    const selected = state.barber ? barberById(state.barber.id) : null;

    if (selected && Array.isArray(selected.schedules)) {
      const weekday = weekdayOf(date);
      return !selected.schedules.some(
        (schedule) => schedule.isActive !== false && Number(schedule.weekday) === weekday,
      );
    }

    const day = hours?.days?.[weekdayOf(date)];
    return Boolean(day && !day.isOpen);
  }

  function eligibleBarbers(service) {
    if (!service) {
      return [];
    }

    return (barbers ?? []).filter(
      (barber) =>
        barberHasSchedule(barber) &&
        (barber.services ?? []).some((item) => item.serviceId === service.id),
    );
  }

  function setService(service, { advance = false } = {}) {
    if (!service || state.submitting) {
      return;
    }

    const previousId = state.service?.id;
    state.service = service;
    state.price = service.price;
    state.duration = service.durationMin;

    const radios = elements.servicePicker?.querySelectorAll('input[name="service"]') ?? [];

    for (const radio of radios) {
      radio.checked = radio.value === service.id;
      radio.closest('.picker__option')?.classList.toggle('picker__option--selected', radio.checked);
    }

    if (previousId !== service.id) {
      cancelAvailability();
      state.date = null;
      state.slot = null;
      state.availability = null;
      state.barber = null;
      state.notice = null;
    }

    const eligible = eligibleBarbers(service);

    if (eligible.length === 1) {
      state.barber = { id: eligible[0].id, displayName: eligible[0].displayName };
    } else if (eligible.length > 1 && state.barber) {
      const stillEligible = eligible.some((barber) => barber.id === state.barber.id);

      if (!stillEligible) {
        state.barber = null;
        state.availability = null;
      }
    }

    hideSuccess();
    updateSummary();
    updateStepState();
    renderBarberNote();

    if (advance) {
      openStep(2);
    }
  }

  function renderServicePicker() {
    if (!elements.servicePicker) {
      return;
    }

    if (flatServices.length === 0) {
      elements.servicePicker.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'state';
      empty.textContent = 'No hay servicios disponibles por ahora.';
      elements.servicePicker.append(empty);
      return;
    }

    elements.servicePicker.replaceChildren();

    for (const service of flatServices) {
      const label = document.createElement('label');
      label.className = 'picker__option';

      const input = document.createElement('input');
      input.className = 'picker__input';
      input.type = 'radio';
      input.name = 'service';
      input.value = service.id;
      input.checked = state.service?.id === service.id;
      label.classList.toggle('picker__option--selected', input.checked);

      const body = document.createElement('span');
      body.className = 'picker__body';

      const name = document.createElement('span');
      name.className = 'picker__name';
      name.textContent = service.name;

      const meta = document.createElement('span');
      meta.className = 'picker__meta';
      meta.textContent = [
        service.categoryName,
        formatDuration(service.durationMin),
        formatPrice(service.price),
      ]
        .filter(Boolean)
        .join(' · ');

      body.append(name, meta);
      label.append(input, body);

      input.addEventListener('change', () => {
        if (input.checked) {
          setService(findService(input.value));
        }
      });

      elements.servicePicker.append(label);
    }
  }

  function renderBarberNote() {
    if (!elements.barberNote) {
      return;
    }

    elements.barberNote.replaceChildren();

    if (!state.service) {
      elements.barberNote.textContent = 'Selecciona un servicio para ver la disponibilidad.';
      return;
    }

    const eligible = eligibleBarbers(state.service);

    if (eligible.length === 0) {
      elements.barberNote.textContent =
        'No hay barberos disponibles para este servicio. Contáctanos para coordinar una hora.';
      return;
    }

    if (eligible.length === 1) {
      elements.barberNote.textContent = `Te atenderá ${eligible[0].displayName}. Asignación automática.`;
      return;
    }

    const label = document.createElement('label');
    label.className = 'barber-picker__label';
    label.htmlFor = 'barber-select';
    label.textContent = 'Elige un barbero';

    const select = document.createElement('select');
    select.className = 'barber-picker__select';
    select.id = 'barber-select';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona un barbero';
    select.append(placeholder);

    for (const barber of eligible) {
      const option = document.createElement('option');
      option.value = barber.id;
      option.textContent = barber.displayName;
      option.selected = state.barber?.id === barber.id;
      select.append(option);
    }

    select.addEventListener('change', () => {
      const selected = eligible.find((barber) => barber.id === select.value) ?? null;
      state.barber = selected ? { id: selected.id, displayName: selected.displayName } : null;
      state.slot = null;
      state.availability = null;
      state.notice = null;
      updateSummary();
      updateStepState();

      if (state.barber) {
        if (state.date && isClosed(state.date)) {
          state.date = null;
          state.slot = null;
          state.availability = null;
        }

        if (!state.date) {
          state.date = initialDate();
        }

        state.view = monthOf(state.date);
        renderCalendar();
        loadAvailability();
      } else {
        elements.slotsGrid.replaceChildren();
        renderSlotsStatus('Elige un barbero para ver los horarios.');
        elements.slotsCount.textContent = '';
      }
    });

    elements.barberNote.append(label, select);
  }

  function renderCalendar() {
    if (!state.view || !elements.calendarDays) {
      return;
    }

    const { year, month } = state.view;
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const total = daysInMonth(year, month);

    elements.calendarMonth.textContent = capitalize(formatMonth(year, month));
    elements.calendarDays.replaceChildren();

    const viewIndex = year * 12 + month;
    const minView = monthOf(today);
    const maxView = monthOf(maxDate);

    elements.calendarPrev.disabled = viewIndex <= minView.year * 12 + minView.month;
    elements.calendarNext.disabled = viewIndex >= maxView.year * 12 + maxView.month;

    for (let index = 0; index < offset; index += 1) {
      const empty = document.createElement('span');
      empty.className = 'calendar__empty';
      empty.setAttribute('aria-hidden', 'true');
      elements.calendarDays.append(empty);
    }

    for (let day = 1; day <= total; day += 1) {
      const date = toDateString(year, month, day);
      const closed = isClosed(date);
      const outOfRange = date < today || date > maxDate;
      const disabled = closed || outOfRange;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar__day';
      button.textContent = String(day);
      button.dataset.date = date;
      button.disabled = disabled;
      button.classList.toggle('calendar__day--today', date === today);
      button.classList.toggle('calendar__day--selected', date === state.date);

      const description = formatLongDate(date, timezone);
      const suffix = closed ? ', cerrado' : outOfRange ? ', fuera del período de reserva' : ', disponible';
      button.setAttribute('aria-label', `${description}${suffix}`);
      button.setAttribute('aria-pressed', String(date === state.date));

      elements.calendarDays.append(button);
    }
  }

  function changeMonth(delta) {
    if (!state.view) {
      return;
    }

    const current = new Date(Date.UTC(state.view.year, state.view.month + delta, 1));
    const candidate = { year: current.getUTCFullYear(), month: current.getUTCMonth() };
    const min = monthOf(today);
    const max = monthOf(maxDate);
    const index = candidate.year * 12 + candidate.month;

    if (index < min.year * 12 + min.month || index > max.year * 12 + max.month) {
      return;
    }

    state.view = candidate;
    renderCalendar();
  }

  function selectDate(date) {
    if (!date || date === state.date) {
      return;
    }

    state.date = date;
    state.slot = null;
    state.availability = null;
    state.notice = null;
    state.view = monthOf(date);
    renderCalendar();
    updateSummary();
    updateStepState();
    loadAvailability();
  }

  function renderSlotsStatus(message) {
    if (elements.slotsStatus) {
      elements.slotsStatus.textContent = message;
    }
  }

  function renderSlotsSkeleton() {
    elements.slotsGrid.replaceChildren();

    for (let index = 0; index < SKELETON_COUNT; index += 1) {
      const block = document.createElement('span');
      block.className = 'slots__skeleton';
      block.setAttribute('aria-hidden', 'true');
      elements.slotsGrid.append(block);
    }

    elements.slotsCount.textContent = '';
    renderSlotsStatus('Buscando horarios disponibles.');
  }

  function renderSlots() {
    const data = state.availability;

    if (!data) {
      return;
    }

    elements.slotsGrid.replaceChildren();
    elements.slotsTitle.textContent = `Horarios para ${formatLongDate(data.date, timezone)}`;

    const notice = state.notice;
    state.notice = null;

    if (!data.isOpen) {
      elements.slotsCount.textContent = '';
      renderSlotsStatus(notice || 'Este día está cerrado. Elige otra fecha.');
      return;
    }

    const slots = data.slots ?? [];
    const available = slots.filter((slot) => slot.available);
    elements.slotsCount.textContent = available.length === 1 ? '1 disponible' : `${available.length} disponibles`;

    if (available.length === 0) {
      renderSlotsStatus(notice || 'No quedan horarios disponibles para este día. Prueba con otra fecha.');
      return;
    }

    renderSlotsStatus(notice || '');

    for (const slot of slots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.textContent = slot.time;
      button.disabled = !slot.available;
      button.dataset.time = slot.time;
      button.setAttribute('aria-label', `${slot.time}, ${slot.available ? 'disponible' : 'no disponible'}`);

      if (state.slot?.time === slot.time) {
        button.classList.add('slot--selected');
        button.setAttribute('aria-pressed', 'true');
      } else {
        button.setAttribute('aria-pressed', 'false');
      }

      elements.slotsGrid.append(button);
    }
  }

  function renderSlotsError(message) {
    elements.slotsGrid.replaceChildren();
    elements.slotsCount.textContent = '';
    renderSlotsStatus(message);

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'slots__retry';
    retry.textContent = 'Reintentar';
    retry.addEventListener('click', () => loadAvailability());

    elements.slotsStatus.append(' ');
    elements.slotsStatus.append(retry);
  }

  function cancelAvailability() {
    availabilityController?.abort();
    availabilityController = null;
    requestToken += 1;
    state.loading = false;
  }

  async function loadAvailability() {
    if (!state.service || !state.date || !state.barber) {
      return;
    }

    availabilityController?.abort();
    availabilityController = new AbortController();
    const token = ++requestToken;

    state.loading = true;
    updateStepState();
    renderSlotsSkeleton();

    try {
      const data = await getDayAvailability({
        date: state.date,
        serviceId: state.service.id,
        barberId: state.barber?.id ?? null,
        signal: availabilityController.signal,
      });

      if (
        token !== requestToken ||
        data.date !== state.date ||
        data.service?.id !== state.service?.id ||
        data.barber?.id !== state.barber?.id
      ) {
        return;
      }

      state.availability = data;

      if (data.barber) {
        state.barber = { id: data.barber.id, displayName: data.barber.displayName };
      }

      if (data.service) {
        state.price = data.service.price;
        state.duration = data.service.durationMin;
      }

      renderSlots();
      updateSummary();
    } catch (error) {
      if (error?.name === 'AbortError' || token !== requestToken) {
        return;
      }

      state.availability = null;
      renderSlotsError(error.message || 'No pudimos cargar los horarios.');
    } finally {
      if (token === requestToken) {
        state.loading = false;
        updateStepState();
      }
    }
  }

  function updateStepState() {
    const stepOne = getNextButton(1);
    const stepTwo = getNextButton(2);
    const eligible = state.service ? eligibleBarbers(state.service) : [];

    if (stepOne) {
      stepOne.disabled = !state.service || eligible.length === 0;
    }

    if (stepTwo) {
      stepTwo.disabled = !state.date || !state.slot || state.loading || !state.barber;
    }

    if (elements.submit) {
      elements.submit.disabled = state.submitting;
    }
  }

  function updateSummary() {
    if (elements.summaryService) {
      elements.summaryService.textContent = state.service
        ? `${state.service.name} · ${formatDuration(state.duration ?? state.service.durationMin)}`
        : 'Sin seleccionar';
    }

    if (elements.summaryBarber) {
      elements.summaryBarber.textContent = state.barber?.displayName || 'Por asignar';
    }

    if (elements.summaryDate) {
      elements.summaryDate.textContent = state.date
        ? capitalize(formatLongDate(state.date, timezone))
        : 'Sin seleccionar';
    }

    if (elements.summaryTime) {
      elements.summaryTime.textContent = state.slot?.time || 'Sin seleccionar';
    }

    if (elements.summaryTotal) {
      elements.summaryTotal.textContent = state.price
        ? formatPrice(state.price)
        : 'Por confirmar';
    }

    updateMobileSummary();
  }

  function updateMobileSummary() {
    if (!elements.mobileSummary) {
      return;
    }

    const visible = Boolean(state.service) && state.step > 1;
    elements.mobileSummary.hidden = !visible;

    if (!visible) {
      return;
    }

    const parts = [state.service.name];

    if (state.barber) {
      parts.push(state.barber.displayName);
    }

    if (state.date) {
      parts.push(capitalize(formatLongDate(state.date, timezone)));
    }

    if (state.slot) {
      parts.push(state.slot.time);
    }

    const price = state.price ? formatPrice(state.price) : null;
    elements.mobileSummary.textContent = price ? `${parts.join(' · ')} · ${price}` : parts.join(' · ');
  }

  function hideSuccess() {
    if (!elements.success) {
      return;
    }

    const wasVisible = !elements.success.hidden;
    elements.success.hidden = true;

    if (wasVisible) {
      state.appointment = null;

      if (elements.copyCode) {
        elements.copyCode.textContent = 'Copiar';
      }

      if (elements.successDetails) {
        elements.successDetails.replaceChildren();
      }

      form.reset();
      clearFieldErrors();
      clearFormError();
    }
  }

  function showFormError(message) {
    if (!elements.formError) {
      return;
    }

    elements.formError.textContent = message;
    elements.formError.hidden = false;
  }

  function clearFormError() {
    if (elements.formError) {
      elements.formError.hidden = true;
      elements.formError.textContent = '';
    }
  }

  function setFieldError(field, message) {
    const input = form.elements.namedItem(field);
    const error = form.querySelector(`[data-error-for="${field}"]`);

    if (!input || !(input instanceof HTMLElement)) {
      return;
    }

    if (!error) {
      return;
    }

    if (message) {
      error.textContent = message;
      error.id = `error-${field}`;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
    } else {
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  function clearFieldErrors() {
    for (const field of ['fullName', 'phone', 'email', 'notes']) {
      setFieldError(field, '');
    }
  }

  function validateForm() {
    clearFieldErrors();

    const fullName = String(form.elements.namedItem('fullName')?.value ?? '').trim();
    const phone = phoneDigits(form.elements.namedItem('phone')?.value ?? '');
    const email = String(form.elements.namedItem('email')?.value ?? '').trim();
    const notes = String(form.elements.namedItem('notes')?.value ?? '').trim();
    const company = String(form.elements.namedItem('company')?.value ?? '');
    let firstInvalid = null;

    if (fullName.length < 2) {
      setFieldError('fullName', 'Escribe tu nombre completo.');
      firstInvalid = firstInvalid ?? form.elements.namedItem('fullName');
    }

    if (!PHONE_PATTERN.test(phone)) {
      setFieldError('phone', 'Ingresa un celular chileno de 9 dígitos que comience con 9.');
      firstInvalid = firstInvalid ?? form.elements.namedItem('phone');
    }

    if (!EMAIL_PATTERN.test(email)) {
      setFieldError('email', 'Ingresa un correo válido.');
      firstInvalid = firstInvalid ?? form.elements.namedItem('email');
    }

    if (notes.length > 500) {
      setFieldError('notes', 'Las notas no pueden superar los 500 caracteres.');
      firstInvalid = firstInvalid ?? form.elements.namedItem('notes');
    }

    if (firstInvalid) {
      firstInvalid.focus();
    }

    return {
      valid: !firstInvalid,
      values: { fullName, phone, email, notes, company },
    };
  }

  async function submitBooking(event) {
    event.preventDefault();

    if (state.submitting) {
      return;
    }

    clearFormError();

    const { valid, values } = validateForm();

    if (!valid) {
      return;
    }

    if (!state.service || !state.barber || !state.slot) {
      showFormError('Falta completar el servicio, el barbero o el horario. Revisa los pasos anteriores.');
      openStep(2);
      return;
    }

    state.submitting = true;
    updateStepState();

    if (elements.submit) {
      elements.submit.textContent = 'Confirmando reserva';
    }

    form.setAttribute('aria-busy', 'true');

    try {
      const appointment = await createAppointment({
        barberId: state.barber.id,
        serviceIds: [state.service.id],
        startsAt: state.slot.startsAt,
        fullName: values.fullName,
        phone: `+56${values.phone}`,
        email: values.email,
        notes: values.notes || null,
        company: values.company,
      });

      if (!appointment?.code) {
        showFormError('No pudimos confirmar la reserva. Intenta nuevamente o contáctanos por teléfono.');
        return;
      }

      showSuccess(appointment);
    } catch (error) {
      if (error?.code === 'SLOT_UNAVAILABLE' || error?.code === 'DUPLICATE') {
        state.notice =
          error.code === 'SLOT_UNAVAILABLE'
            ? 'Ese horario acaba de ocuparse. Elige otro horario disponible.'
            : 'No pudimos confirmar ese horario porque ya existe una reserva. Elige otro horario o contáctanos.';
        state.slot = null;
        state.availability = null;
        updateSummary();
        openStep(2);
        return;
      }

      if (error?.details?.field) {
        setFieldError(error.details.field, error.message);
      }

      showFormError(error?.message || 'No pudimos confirmar la reserva. Intenta nuevamente.');
    } finally {
      state.submitting = false;
      updateStepState();

      if (elements.submit) {
        elements.submit.textContent = 'Confirmar reserva';
      }

      form.removeAttribute('aria-busy');
    }
  }

  function showSuccess(appointment) {
    state.appointment = appointment;

    if (!elements.success) {
      return;
    }

    for (const panel of elements.panels) {
      panel.hidden = true;
    }

    if (elements.steps) {
      elements.steps.hidden = true;
    }

    if (elements.mobileSummary) {
      elements.mobileSummary.hidden = true;
    }

    elements.success.hidden = false;

    if (elements.successCode) {
      elements.successCode.textContent = appointment.code;
    }

    if (elements.successDetails) {
      elements.successDetails.replaceChildren();

      const details = [
        ['Servicio', state.service?.name ?? ''],
        ['Barbero', state.barber?.displayName ?? ''],
        ['Fecha', state.date ? capitalize(formatLongDate(state.date, timezone)) : ''],
        ['Hora', state.slot?.time ?? ''],
        ['Total', formatPrice(appointment.total)],
      ];

      for (const [label, value] of details) {
        if (!value) {
          continue;
        }

        const row = document.createElement('div');
        row.className = 'success__detail';

        const term = document.createElement('dt');
        term.textContent = label;

        const description = document.createElement('dd');
        description.textContent = value;

        row.append(term, description);
        elements.successDetails.append(row);
      }
    }

    elements.success.focus({ preventScroll: true });
    elements.success.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

    if (elements.copyCode) {
      elements.copyCode.textContent = 'Copiar';
    }

    document.dispatchEvent(
      new CustomEvent('appointment:created', {
        detail: { code: appointment.code },
      }),
    );
  }

  function resetBooking() {
    state.service = null;
    state.barber = null;
    state.date = null;
    state.slot = null;
    state.price = null;
    state.duration = null;
    state.availability = null;
    state.appointment = null;
    state.view = null;
    state.notice = null;
    cancelAvailability();

    form.reset();
    clearFieldErrors();
    clearFormError();

    for (const radio of elements.servicePicker?.querySelectorAll('input[name="service"]') ?? []) {
      radio.checked = false;
      radio.closest('.picker__option')?.classList.remove('picker__option--selected');
    }

    hideSuccess();
    updateSummary();
    updateStepState();
    openStep(1);

    if (elements.steps) {
      elements.steps.hidden = false;
    }

    getPanel(1)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function handleCopyCode() {
    const code = state.appointment?.code;

    if (!code || !elements.copyCode) {
      return;
    }

    const done = () => {
      elements.copyCode.textContent = 'Copiado';

      window.setTimeout(() => {
        elements.copyCode.textContent = 'Copiar';
      }, 2000);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(code)
        .then(done)
        .catch(() => {
          elements.copyCode.textContent = 'No se pudo copiar';

          window.setTimeout(() => {
            elements.copyCode.textContent = 'Copiar';
          }, 2000);
        });
      return;
    }

    elements.copyCode.textContent = 'Copia el código';
  }

  elements.calendarPrev?.addEventListener('click', () => changeMonth(-1));
  elements.calendarNext?.addEventListener('click', () => changeMonth(1));

  elements.calendarDays?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-date]');

    if (button) {
      selectDate(button.dataset.date);
    }
  });

  elements.calendarDays?.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

    if (!keys.includes(event.key)) {
      return;
    }

    const buttons = [...elements.calendarDays.querySelectorAll('button.calendar__day:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);

    if (index === -1) {
      return;
    }

    event.preventDefault();
    let next = index;

    if (event.key === 'ArrowLeft') next = index - 1;
    if (event.key === 'ArrowRight') next = index + 1;
    if (event.key === 'ArrowUp') next = index - 7;
    if (event.key === 'ArrowDown') next = index + 7;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;

    buttons[Math.max(0, Math.min(next, buttons.length - 1))]?.focus();
  });

  elements.slotsGrid?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-time]');

    if (!button || button.disabled || !state.availability) {
      return;
    }

    const slot = state.availability.slots.find((item) => item.time === button.dataset.time);

    if (!slot?.available) {
      return;
    }

    state.slot = slot;
    renderSlots();
    updateSummary();
    updateStepState();
  });

  wizard.addEventListener('click', (event) => {
    const next = event.target.closest('[data-next-step]');
    const back = event.target.closest('[data-back-step]');

    if (next) {
      const step = Number(next.dataset.nextStep);

      if (step === 2 && !state.service) {
        return;
      }

      if (step === 3 && !state.slot) {
        return;
      }

      openStep(step);
    }

    if (back) {
      openStep(Number(back.dataset.backStep));
    }
  });

  form.addEventListener('input', (event) => {
    const input = event.target;

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

    if (elements.formError && !elements.formError.hidden) {
      clearFormError();
    }
  });

  form.addEventListener('submit', submitBooking);
  elements.newBooking?.addEventListener('click', resetBooking);
  elements.copyCode?.addEventListener('click', handleCopyCode);

  renderServicePicker();
  updateSummary();
  updateStepState();

  if (flatServices.length === 1) {
    setService(flatServices[0]);
  }

  return {
    selectService(serviceOrId) {
      const service = typeof serviceOrId === 'string' ? findService(serviceOrId) : serviceOrId;

      if (!service) {
        return;
      }

      setService(service, { advance: true });
    },
  };
}
