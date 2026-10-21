import { supabaseAdmin, supabaseAuth } from '../config/supabase.js';
import { ApiError } from '../lib/errors.js';
import { looksLikeEmail, normalizeUsername } from '../lib/username.js';

async function loadStaffProfile(user) {
  let result = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, phone, username, avatar_url, is_active')
    .eq('id', user.id)
    .maybeSingle();

  // Permite iniciar sesión con correo mientras la migración 009 no esté aplicada.
  if (result.error?.message?.includes('username')) {
    result = await supabaseAdmin
      .from('profiles')
      .select('id, role, full_name, phone, avatar_url, is_active')
      .eq('id', user.id)
      .maybeSingle();
  }

  const { data: profile, error } = result;

  if (error) {
    throw ApiError.internal('No se pudo cargar el perfil del usuario');
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
      throw ApiError.internal('No se pudo cargar la ficha de barbero');
    }

    if (!barber || !barber.is_active) {
      throw ApiError.forbidden('El usuario no tiene una ficha de barbero activa');
    }

    barberId = barber.id;
  }

  return {
    id: user.id,
    email: user.email,
    role: profile.role,
    fullName: profile.full_name,
    phone: profile.phone,
    username: profile.username,
    avatarUrl: profile.avatar_url,
    barberId,
  };
}

function invalidCredentials() {
  return new ApiError(
    401,
    'INVALID_CREDENTIALS',
    'Correo, usuario o contraseña incorrectos',
  );
}

async function resolveLoginEmail(identifier) {
  const normalized = String(identifier ?? '').trim();

  if (!normalized) {
    throw invalidCredentials();
  }

  if (looksLikeEmail(normalized)) {
    return normalized.toLowerCase();
  }

  let username;

  try {
    username = normalizeUsername(normalized);
  } catch {
    throw invalidCredentials();
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (error || !profile) {
    throw invalidCredentials();
  }

  const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);

  if (userError || !data?.user?.email) {
    throw invalidCredentials();
  }

  return data.user.email;
}

export async function login(identifier, password) {
  const email = await resolveLoginEmail(identifier);
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user) {
    throw invalidCredentials();
  }

  const user = await loadStaffProfile(data.user);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    tokenType: data.session.token_type,
    user,
  };
}

export async function refresh(refreshToken) {
  const { data, error } = await supabaseAuth.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    throw ApiError.unauthorized('No se pudo renovar la sesión');
  }

  const user = await loadStaffProfile(data.user);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    tokenType: data.session.token_type,
    user,
  };
}

export async function changePassword(user, currentPassword, newPassword) {
  const { data: sessionData, error: currentError } =
    await supabaseAuth.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

  if (currentError || !sessionData.session) {
    throw ApiError.badRequest(
      'La contraseña actual no es correcta',
      'INVALID_CURRENT_PASSWORD',
      { field: 'currentPassword' },
    );
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );

  if (updateError) {
    if (updateError.code === 'weak_password') {
      throw ApiError.badRequest('La nueva contraseña es demasiado débil', 'WEAK_PASSWORD', {
        field: 'newPassword',
      });
    }

    throw ApiError.badRequest(
      'No se pudo cambiar la contraseña',
      'PASSWORD_UPDATE_FAILED',
    );
  }

  return { changed: true };
}

export async function logout(token) {
  try {
    await supabaseAdmin.auth.admin.signOut(token);
  } catch (error) {
    console.error('[auth:logout]', error?.message);
  }

  return { loggedOut: true };
}

export async function getMe(userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    throw ApiError.unauthorized('No se pudo cargar el usuario');
  }

  return loadStaffProfile(data.user);
}
