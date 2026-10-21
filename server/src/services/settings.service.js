import { supabaseAdmin } from '../config/supabase.js';
import { recordAudit } from '../lib/audit.js';
import { ApiError } from '../lib/errors.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

export async function getSettingsAdmin() {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.internal('La configuración del negocio no está inicializada');
  }

  return data;
}

export async function updateSettings(input, actorId) {
  const payload = {};

  const mapping = {
    businessName: 'business_name',
    legalName: 'legal_name',
    taxId: 'tax_id',
    phone: 'phone',
    email: 'email',
    address: 'address',
    city: 'city',
    timezone: 'timezone',
    currency: 'currency',
    locale: 'locale',
    phonePrefix: 'phone_prefix',
    slotIntervalMin: 'slot_interval_min',
    minAdvanceMin: 'min_advance_min',
    maxAdvanceDays: 'max_advance_days',
    cancellationHours: 'cancellation_hours',
    depositPercent: 'deposit_percent',
    taxRate: 'tax_rate',
    pricesIncludeTax: 'prices_include_tax',
    instagram: 'instagram',
    whatsapp: 'whatsapp',
    mapsUrl: 'maps_url',
    logoUrl: 'logo_url',
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (input[key] !== undefined) {
      payload[column] = input[key];
    }
  }

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest('No hay cambios para aplicar');
  }

  const { data, error } = await supabaseAdmin
    .from('settings')
    .update(payload)
    .eq('id', 1)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.internal('No se pudo actualizar la configuración');
  }

  await recordAudit({
    actorId,
    action: 'settings.update',
    entity: 'settings',
    entityId: '1',
    after: data,
  });

  return data;
}
