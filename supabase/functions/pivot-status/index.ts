import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Busca safras ativas com pivôs e fazendas
    const { data: seasons, error: seasonsErr } = await supabase
      .from('seasons')
      .select('id, pivot_id, farm_id, pivots(id, name, paired_pivot_id, preferred_speed_percent), farms(name)')
      .eq('is_active', true);

    if (seasonsErr) throw seasonsErr;
    if (!seasons || seasons.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      return new Response(
        JSON.stringify({ pivots: [], fazenda: 'Sem safras ativas', data: today, hora }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const seasonIds = seasons.map((s: any) => s.id);

    // Busca último balanço hídrico de cada safra
    const { data: records, error: recErr } = await supabase
      .from('daily_management')
      .select('season_id, date, etc_mm, rainfall_mm, field_capacity_percent, recommended_depth_mm, recommended_speed_percent, ctda, eto_mm, needs_irrigation')
      .in('season_id', seasonIds)
      .order('date', { ascending: false })
      .limit(100);

    if (recErr) throw recErr;

    // Último registro por safra
    const lastBySeason: Record<string, any> = {};
    for (const r of (records || [])) {
      if (!lastBySeason[r.season_id]) lastBySeason[r.season_id] = r;
    }

    // Monta lista de pivôs
    const pivots = seasons.map((s: any) => {
      const pivot = s.pivots || {};
      const balance = lastBySeason[s.id] || {};
      return {
        name: pivot.name || 'Pivô',
        farm_name: s.farms?.name || null,
        is_conjugated: !!pivot.paired_pivot_id,
        recommended_speed_percent: pivot.preferred_speed_percent,
        field_capacity_percent: balance.field_capacity_percent,
        etc_mm: balance.etc_mm,
        rainfall_mm: balance.rainfall_mm,
        recommended_depth_mm: balance.recommended_depth_mm,
        ctda: balance.ctda,
        eto_mm: balance.eto_mm,
        needs_irrigation: balance.needs_irrigation,
        balance_date: balance.date || null,
      };
    });

    const fazendas = [...new Set(seasons.map((s: any) => s.farms?.name).filter(Boolean))];
    const fazenda = fazendas.join(', ') || 'IrrigaAgro';
    const today = new Date().toISOString().slice(0, 10);
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    return new Response(
      JSON.stringify({ pivots, fazenda, data: today, hora }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
