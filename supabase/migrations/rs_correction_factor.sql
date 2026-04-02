-- Calibração automática do fator de correção Rs por estação/pivô
-- Permite substituir o fator global fixo (ETO_PLUGFIELD_CORRECTION_FACTOR=0.82)
-- por valores calculados automaticamente com base em comparações com NASA POWER.
--
-- rs_correction_factor : mediana calculada (ex: 0.8340) — usado no cron
-- rs_factor_updated_at : quando foi calibrado pela última vez
-- rs_factor_sample_days: quantos dias NASA foram usados (indicador de confiabilidade)

-- Fator por estação (pivôs com Plugfield/Google Sheets)
ALTER TABLE weather_stations
  ADD COLUMN IF NOT EXISTS rs_correction_factor numeric(5,4) DEFAULT 0.82,
  ADD COLUMN IF NOT EXISTS rs_factor_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rs_factor_sample_days integer DEFAULT 0;

-- Fator por pivô (pivôs sem estação, usando Open-Meteo como fonte de Rs)
ALTER TABLE pivots
  ADD COLUMN IF NOT EXISTS rs_correction_factor numeric(5,4) DEFAULT 0.82,
  ADD COLUMN IF NOT EXISTS rs_factor_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rs_factor_sample_days integer DEFAULT 0;
