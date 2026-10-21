import { ok } from '../lib/http.js';
import { settingsPayload } from '../lib/payloads.js';
import { getSettingsAdmin, updateSettings } from '../services/settings.service.js';

export async function settings(_req, res) {
  return ok(res, await getSettingsAdmin());
}

export async function update(req, res) {
  const parsed = settingsPayload(req.body ?? {});
  return ok(res, await updateSettings(parsed, req.user.id));
}
