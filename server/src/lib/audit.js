import { supabaseAdmin } from '../config/supabase.js';

/**
 * Registra una acción administrativa. Un fallo de auditoría no debe romper
 * la operación principal, pero sí queda en el log del servidor.
 */
export async function recordAudit({
  actorId = null,
  action,
  entity,
  entityId = null,
  before = null,
  after = null,
}) {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId ? String(entityId) : null,
    before,
    after,
  });

  if (error) {
    console.error('[audit:error]', error.message);
  }
}
