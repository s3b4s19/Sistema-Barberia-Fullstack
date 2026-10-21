import { supabaseAdmin } from '../config/supabase.js';

export async function listAuditLog({ limit = 100 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}
