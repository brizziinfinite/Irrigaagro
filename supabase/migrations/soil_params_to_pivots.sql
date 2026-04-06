-- Migra parâmetros de solo de seasons para pivots
-- Os cálculos passam a usar pivot.field_capacity ?? season.field_capacity ?? default

ALTER TABLE pivots
  ADD COLUMN IF NOT EXISTS field_capacity  numeric(5,2),
  ADD COLUMN IF NOT EXISTS wilting_point   numeric(5,2),
  ADD COLUMN IF NOT EXISTS bulk_density    numeric(4,2),
  ADD COLUMN IF NOT EXISTS f_factor        numeric(4,2);

-- Copia os valores existentes de seasons → pivots (apenas quando pivot_id está preenchido)
-- Usa o primeiro valor encontrado por pivô (pode haver múltiplas safras no mesmo pivô)
UPDATE pivots p
SET
  field_capacity = sub.field_capacity,
  wilting_point  = sub.wilting_point,
  bulk_density   = sub.bulk_density,
  f_factor       = sub.f_factor
FROM (
  SELECT DISTINCT ON (pivot_id)
    pivot_id,
    field_capacity,
    wilting_point,
    bulk_density,
    f_factor
  FROM seasons
  WHERE pivot_id IS NOT NULL
    AND (field_capacity IS NOT NULL OR wilting_point IS NOT NULL OR bulk_density IS NOT NULL)
  ORDER BY pivot_id, updated_at DESC
) sub
WHERE p.id = sub.pivot_id
  AND p.field_capacity IS NULL; -- só preenche se ainda estiver vazio
