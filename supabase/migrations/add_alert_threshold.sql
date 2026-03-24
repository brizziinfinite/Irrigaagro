-- Adiciona campo de limiar de alerta de irrigação por pivô
-- Cada agricultor define a partir de qual % da capacidade de campo o sistema avisa
-- Padrão: 70% (sistema avisa quando ADc cair abaixo de 70%)

ALTER TABLE pivots
  ADD COLUMN IF NOT EXISTS alert_threshold_percent integer DEFAULT 70;

COMMENT ON COLUMN pivots.alert_threshold_percent IS
  'Limiar de alerta de irrigação (% da cap. de campo). Sistema avisa quando ADc% < este valor.';
