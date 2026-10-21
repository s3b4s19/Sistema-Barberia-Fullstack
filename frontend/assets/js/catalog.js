import { formatDuration, formatPrice } from './format.js';

function serviceRow(service) {
  const item = document.createElement('li');
  item.className = 'service';

  const head = document.createElement('div');
  head.className = 'service__head';

  const name = document.createElement('h4');
  name.className = 'service__name';
  name.textContent = service.name;

  const leader = document.createElement('span');
  leader.className = 'service__leader';
  leader.setAttribute('aria-hidden', 'true');

  const price = document.createElement('span');
  price.className = 'service__price';
  price.textContent = formatPrice(service.price);

  head.append(name, leader, price);
  item.append(head);

  if (service.description) {
    const description = document.createElement('p');
    description.className = 'service__description';
    description.textContent = service.description;
    item.append(description);
  }

  const meta = document.createElement('div');
  meta.className = 'service__meta';

  const duration = document.createElement('span');
  duration.className = 'service__duration';
  duration.textContent = formatDuration(service.durationMin);

  const action = document.createElement('button');
  action.className = 'service__action';
  action.type = 'button';
  action.dataset.serviceId = service.id;
  action.setAttribute('aria-label', `Reservar ${service.name}`);
  action.textContent = 'Reservar';

  meta.append(duration, action);
  item.append(meta);

  return item;
}

export function renderCatalog(container, categories, onSelect) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  container.setAttribute('aria-busy', 'false');

  const groups = categories.filter((category) => category.services?.length > 0);

  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'state';
    empty.textContent = 'No hay servicios disponibles por ahora.';
    container.append(empty);
    return;
  }

  for (const category of groups) {
    const group = document.createElement('article');
    group.className = 'catalog__group';

    const title = document.createElement('h3');
    title.className = 'catalog__title';
    title.textContent = category.name;

    const list = document.createElement('ul');
    list.className = 'catalog__list';

    for (const service of category.services) {
      list.append(serviceRow(service));
    }

    group.append(title, list);
    container.append(group);
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-service-id]');

    if (!button) {
      return;
    }

    const service = groups
      .flatMap((category) => category.services)
      .find((item) => item.id === button.dataset.serviceId);

    if (service) {
      onSelect(service);
    }
  });
}
