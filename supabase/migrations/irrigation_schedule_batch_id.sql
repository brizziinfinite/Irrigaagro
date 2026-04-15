-- Adiciona schedule_batch_id para agrupar programações feitas no mesmo lote (mesma ação de salvar)

ALTER TABLE irrigation_schedule ADD COLUMN IF NOT EXISTS schedule_batch_id uuid;

-- Backfill: agrupa registros existentes por (pivot_id, date(created_at))
WITH batches AS (
  SELECT DISTINCT pivot_id, DATE(created_at) AS d, gen_random_uuid() AS bid
  FROM irrigation_schedule
)
UPDATE irrigation_schedule s
SET schedule_batch_id = b.bid
FROM batches b
WHERE s.pivot_id = b.pivot_id AND DATE(s.created_at) = b.d;

-- Índice para buscas por lote
CREATE INDEX IF NOT EXISTS irrigation_schedule_batch_id_idx
  ON irrigation_schedule (schedule_batch_id)
  WHERE schedule_batch_id IS NOT NULL;
