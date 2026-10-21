import { supabaseAdmin } from '../src/config/supabase.js';
import { normalizeUsername, usernameFromEmail } from '../src/lib/username.js';

const args = process.argv.slice(2);

function arg(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Uso:
  npm run seed:staff -- --email admin@ejemplo.cl --password "TU_CLAVE_SEGURA" --username admin --name "Administrador" --role admin

Opciones:
  --email         Correo del usuario (obligatorio)
  --password      Contraseña de al menos 8 caracteres (obligatorio)
  --name          Nombre completo (obligatorio)
  --role          admin | barbero (por defecto admin)
  --phone         Teléfono en formato +56...
  --username      Usuario de login (opcional; se deriva del correo si se omite)
  --display-name  Nombre visible del barbero (solo rol barbero)
`);
  process.exit(0);
}

const email = arg('email');
const password = arg('password');
const fullName = arg('name');
const role = arg('role', 'admin');
const phone = arg('phone');
const displayName = arg('display-name', fullName);
const requestedUsername = arg('username');

if (!email || !password || !fullName) {
  console.error('Faltan datos. Usa --email, --password y --name. Consulta --help.');
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('El correo no es válido.');
  process.exit(1);
}

if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

if (!['admin', 'barbero'].includes(role)) {
  console.error('El rol debe ser admin o barbero.');
  process.exit(1);
}

async function findUserByEmail(target) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`No se pudo listar usuarios: ${error.message}`);
  }

  return data.users.find((user) => user.email?.toLowerCase() === target.toLowerCase()) ?? null;
}

async function assertUsernameAvailable(username, profileId = null) {
  let query = supabaseAdmin.from('profiles').select('id').eq('username', username);

  if (profileId) {
    query = query.neq('id', profileId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`No se pudo validar el usuario: ${error.message}`);
  }

  if (data) {
    throw new Error(`El nombre de usuario "${username}" ya está en uso.`);
  }
}

async function resolveUsername(profileId) {
  if (requestedUsername) {
    const username = normalizeUsername(requestedUsername, { required: true });
    await assertUsernameAvailable(username, profileId);
    return username;
  }

  if (profileId) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('id', profileId)
      .maybeSingle();

    if (currentError) {
      throw new Error(`No se pudo leer el perfil: ${currentError.message}`);
    }

    if (current?.username) {
      return current.username;
    }
  }

  const base = usernameFromEmail(email);
  let candidate = base;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo validar el usuario: ${error.message}`);
    }

    if (!data || data.id === profileId) {
      return candidate;
    }

    candidate = `${base.slice(0, 24)}.${Math.random().toString(36).slice(2, 6)}`;
  }

  throw new Error('No se pudo asignar un nombre de usuario único.');
}

async function main() {
  let user = await findUserByEmail(email);
  const username = await resolveUsername(user?.id ?? null);

  if (user) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      throw new Error(`No se pudo actualizar el usuario: ${error.message}`);
    }

    user = data.user;
    console.log(`Usuario existente actualizado: ${email}`);
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      throw new Error(`No se pudo crear el usuario: ${error.message}`);
    }

    user = data.user;
    console.log(`Usuario creado: ${email}`);
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: user.id,
      role,
      full_name: fullName,
      phone: phone ?? null,
      username,
      is_active: true,
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    throw new Error(`No se pudo guardar el perfil: ${profileError.message}`);
  }

  if (role === 'barbero') {
    const { data: barber, error: barberError } = await supabaseAdmin
      .from('barbers')
      .upsert(
        {
          profile_id: user.id,
          display_name: displayName,
          is_active: true,
        },
        { onConflict: 'profile_id' },
      )
      .select()
      .single();

    if (barberError) {
      throw new Error(`No se pudo guardar el barbero: ${barberError.message}`);
    }

    const { data: schedules, error: scheduleError } = await supabaseAdmin
      .from('barber_schedules')
      .select('id')
      .eq('barber_id', barber.id)
      .limit(1);

    if (scheduleError) {
      throw new Error(`No se pudieron revisar los horarios: ${scheduleError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      const rows = [1, 2, 3, 4, 5, 6].map((weekday) => ({
        barber_id: barber.id,
        weekday,
        start_time: '10:00:00',
        end_time: '19:00:00',
        is_active: true,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('barber_schedules')
        .insert(rows);

      if (insertError) {
        throw new Error(`No se pudieron crear los horarios: ${insertError.message}`);
      }

      console.log('Horario inicial creado: lunes a sábado, 10:00 a 19:00.');
    }
  }

  console.log(`Listo. Rol asignado: ${role}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
