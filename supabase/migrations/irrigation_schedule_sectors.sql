-- Adiciona sector_id (nullable FK) à irrigation_schedule
-- e atualiza o constraint de unicidade para permitir programações por setor

-- 1. Adiciona a coluna sector_id (nullable FK → pivot_sectors)
ALTER TABLE irrigation_schedule
  ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES pivot_sectors(id) ON DELETE CASCADE;

-- 2. Remove a constraint antiga (pivot_id, date)
ALTER TABLE irrigation_schedule
  DROP CONSTRAINT IF EXISTS irrigation_schedule_pivot_id_date_key;

-- 3. Cria novo unique constraint: (pivot_id, COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'), date)
--    Usa um índice parcial para tratar sector_id NULL e sector_id preenchido separadamente.
CREATE UNIQUE INDEX IF NOT EXISTS irrigation_schedule_pivot_sector_date_uq
  ON irrigation_schedule (pivot_id, date, COALESCE(sector_id::text, ''));

-- 4. Índice auxiliar para queries por sector
CREATE INDEX IF NOT EXISTS irrigation_schedule_sector_id_idx
  ON irrigation_schedule (sector_id)
  WHERE sector_id IS NOT NULL;
