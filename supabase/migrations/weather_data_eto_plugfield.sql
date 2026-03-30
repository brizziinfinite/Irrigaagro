-- Adiciona colunas para comparativo ETo: Plugfield vs FAO-56 com Rs NASA
-- eto_plugfield_mm: valor bruto do campo 'evapo' retornado pela API Plugfield (para calibração)
-- rs_source: indica se Rs usado no cálculo ETo veio da NASA ou do fallback Plugfield

ALTER TABLE weather_data
  ADD COLUMN IF NOT EXISTS eto_plugfield_mm numeric(6,2),
  ADD COLUMN IF NOT EXISTS rs_source text DEFAULT 'unknown';

COMMENT ON COLUMN weather_data.eto_plugfield_mm IS 'ETo bruto reportado pelo Plugfield (campo evapo) — usado para comparativo de calibração';
COMMENT ON COLUMN weather_data.rs_source IS 'Fonte de Rs usado no cálculo ETo: nasa | plugfield_fallback | unknown';
