import { supabaseAdmin } from '../config/supabase.js';
import { recordAudit } from '../lib/audit.js';
import { ApiError } from '../lib/errors.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

export async function createReview({ code, phone, rating, comment }) {
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  throwIf(clientError);

  if (!client) {
    throw ApiError.notFound('No encontramos una cita con esos datos', 'APPOINTMENT_NOT_FOUND');
  }

  const { data: appointment, error: appointmentError } = await supabaseAdmin
    .from('appointments')
    .select('id, status, client_id, barber_id')
    .eq('code', code)
    .eq('client_id', client.id)
    .maybeSingle();

  throwIf(appointmentError);

  if (!appointment) {
    throw ApiError.notFound('No encontramos una cita con esos datos', 'APPOINTMENT_NOT_FOUND');
  }

  if (appointment.status !== 'completada') {
    throw ApiError.conflict(
      'Solo puedes reseñar una cita completada',
      'REVIEW_NOT_ALLOWED',
    );
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('reviews')
    .select('id')
    .eq('appointment_id', appointment.id)
    .maybeSingle();

  throwIf(existingError);

  if (existing) {
    throw ApiError.conflict('Esta cita ya tiene una reseña', 'REVIEW_EXISTS');
  }

  const { data, error } = await supabaseAdmin
    .from('reviews')
    .insert({
      appointment_id: appointment.id,
      client_id: appointment.client_id,
      barber_id: appointment.barber_id,
      rating,
      comment,
      // Las reseñas nacen ocultas y requieren moderación del administrador.
      is_published: false,
    })
    .select('id, rating, comment, is_published, created_at')
    .single();

  throwIf(error);
  return data;
}

export async function listPublicReviews({ barberId = null, limit = 20 } = {}) {
  let query = supabaseAdmin
    .from('reviews')
    .select('id, rating, comment, created_at, barbers(display_name)')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (barberId) {
    query = query.eq('barber_id', barberId);
  }

  const { data, error } = await query;
  throwIf(error);
  return data ?? [];
}

export async function listAdminReviews({ limit = 100 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('reviews')
    .select('*, barbers(display_name), clients(full_name), appointments(code)')
    .order('created_at', { ascending: false })
    .limit(limit);

  throwIf(error);
  return data ?? [];
}

export async function updateReviewPublished(id, isPublished, actorId) {
  const { data, error } = await supabaseAdmin
    .from('reviews')
    .update({ is_published: isPublished })
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Reseña no encontrada', 'REVIEW_NOT_FOUND');
  }

  await recordAudit({
    actorId,
    action: isPublished ? 'review.publish' : 'review.hide',
    entity: 'reviews',
    entityId: id,
    after: data,
  });

  return data;
}
