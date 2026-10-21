import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env'), quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa server/.env`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

const corsOrigin = optional('CORS_ORIGIN', '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '4000')),
  corsOrigin: corsOrigin.includes('*') ? '*' : corsOrigin,
  trustProxy: optional('TRUST_PROXY', '0') === '1',
  rateLimitMax: Number(optional('API_RATE_LIMIT_MAX', '120')),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  timezone: optional('BUSINESS_TIMEZONE', 'America/Santiago'),
};

export const isProduction = env.nodeEnv === 'production';
