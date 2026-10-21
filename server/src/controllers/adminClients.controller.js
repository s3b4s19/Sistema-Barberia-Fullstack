import { created, ok } from '../lib/http.js';
import {
  parsePagination,
  requireDateTime,
  requireString,
  requireUuid,
} from '../lib/validation.js';
import { clientPayload } from '../lib/payloads.js';
import {
  createClient,
  getClientById,
  getClientHistory,
  listClientAppointments,
  listClients,
  updateClient,
} from '../services/client.service.js';

export async function list(req, res) {
  const { limit, offset } = parsePagination(req.query);
  const search = req.query.search
    ? requireString(req.query.search, 'search', { min: 1, max: 80 })
    : null;

  return ok(res, await listClients({ search, limit, offset }));
}

export async function getById(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await getClientById(id));
}

export async function history(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await getClientHistory(id));
}

export async function appointments(req, res) {
  const id = requireUuid(req.params.id, 'id');
  const { limit, offset } = parsePagination({
    limit: req.query.limit ?? 20,
    offset: req.query.offset,
  });
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : null;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : null;

  return ok(res, await listClientAppointments({ clientId: id, from, to, limit, offset }));
}

export async function create(req, res) {
  const body = req.body ?? {};
  return created(res, await createClient(clientPayload(body)));
}

export async function update(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await updateClient(id, clientPayload(body, { partial: true })));
}
