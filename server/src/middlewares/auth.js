import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/http.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';

  if (!header.startsWith('Bearer ')) {
    throw ApiError.unauthorized();
  }

  const token = header.slice(7).trim();

  if (!token) {
    throw ApiError.unauthorized();
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw ApiError.unauthorized('La sesión no es válida o expiró');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw ApiError.internal('No se pudo verificar el perfil');
  }

  if (!profile) {
    throw ApiError.forbidden('El usuario no tiene perfil de staff');
  }

  if (!profile.is_active) {
    throw ApiError.forbidden('El usuario está desactivado');
  }

  let barberId = null;

  if (profile.role === 'barbero') {
    const { data: barber, error: barberError } = await supabaseAdmin
      .from('barbers')
      .select('id, is_active')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (barberError) {
      throw ApiError.internal('No se pudo verificar el perfil de barbero');
    }

    if (!barber || !barber.is_active) {
      throw ApiError.forbidden('El usuario no tiene una ficha de barbero activa');
    }

    barberId = barber.id;
  }

  req.token = token;
  req.user = {
    id: user.id,
    email: user.email,
    role: profile.role,
    fullName: profile.full_name,
    barberId,
  };

  next();
});
