-- Migration: substitui profundidade de raiz por estágio por crescimento contínuo
-- root_initial_depth_cm : profundidade inicial na germinação (cm)
-- root_growth_rate_cm_day: taxa de crescimento da raiz (cm/dia) após root_start_das
-- root_start_das         : DAS a partir do qual a raiz começa a crescer

ALTER TABLE crops
  ADD COLUMN IF NOT EXISTS root_initial_depth_cm   numeric(6,2) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS root_growth_rate_cm_day numeric(5,3) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS root_start_das          integer      DEFAULT 4;

-- Migrar valores existentes a partir dos campos antigos (usa r1 como base, calcula taxa)
-- Para culturas que já têm os campos antigos preenchidos:
-- taxa = (r2 - r1) / s2  (ganho na fase 2)
-- inicial = r1
-- start_das = s1 (começa a crescer após a fase inicial)
UPDATE crops
SET
  root_initial_depth_cm   = COALESCE(root_depth_stage1_cm, 5),
  root_growth_rate_cm_day = CASE
    WHEN root_depth_stage2_cm IS NOT NULL
      AND root_depth_stage1_cm IS NOT NULL
      AND stage2_days IS NOT NULL
      AND stage2_days > 0
    THEN ROUND(
      ((root_depth_stage2_cm - root_depth_stage1_cm)::numeric / stage2_days::numeric)::numeric,
      3
    )
    ELSE 1.0
  END,
  root_start_das = COALESCE(stage1_days, 10)
WHERE root_initial_depth_cm IS NULL OR root_growth_rate_cm_day IS NULL;

-- Campos antigos mantidos por retrocompatibilidade (não removidos ainda)
-- Podem ser removidos em uma migration futura após validação em produção
