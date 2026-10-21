import { supabaseAdmin } from '../config/supabase.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

export async function getDashboardMetrics({ from, to }) {
  const { data, error } = await supabaseAdmin.rpc('dashboard_metrics', {
    p_from: from,
    p_to: to,
  });

  throwIf(error);
  return data;
}

export async function getDailyRevenue({ from, to }) {
  const { data, error } = await supabaseAdmin
    .from('v_daily_revenue')
    .select('*')
    .gte('day', from.slice(0, 10))
    .lte('day', to.slice(0, 10))
    .order('day', { ascending: true });

  throwIf(error);
  return data ?? [];
}

export async function getBarberCommissions({ from }) {
  const month = `${from.slice(0, 7)}-01`;

  const { data, error } = await supabaseAdmin
    .from('v_barber_commissions')
    .select('*')
    .gte('month', month)
    .order('month', { ascending: false });

  throwIf(error);
  return data ?? [];
}

export async function getLowStock() {
  const { data, error } = await supabaseAdmin
    .from('v_low_stock')
    .select('*')
    .eq('is_low', true)
    .order('stock', { ascending: true });

  throwIf(error);
  return data ?? [];
}

export async function getDashboard({ from, to }) {
  const [metrics, dailyRevenue, commissions, lowStock] = await Promise.all([
    getDashboardMetrics({ from, to }),
    getDailyRevenue({ from, to }),
    getBarberCommissions({ from }),
    getLowStock(),
  ]);

  return {
    metrics,
    dailyRevenue,
    commissions,
    lowStock,
  };
}
