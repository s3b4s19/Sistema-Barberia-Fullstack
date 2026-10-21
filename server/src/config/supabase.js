import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const sharedOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

// Cliente con la clave pública: solo se usa para iniciar y refrescar sesiones.
export const supabaseAuth = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  sharedOptions,
);

// Cliente privilegiado: nunca debe exponerse al navegador.
export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  sharedOptions,
);
