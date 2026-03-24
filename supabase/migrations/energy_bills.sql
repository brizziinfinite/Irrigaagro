-- ============================================================
-- Migration: energy_bills
-- Armazena dados extraídos de contas de energia elétrica
-- com KPIs de custo por irrigação
-- ============================================================

CREATE TABLE IF NOT EXISTS energy_bills (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pivot_id             uuid NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,

  -- Referência temporal
  reference_month      text NOT NULL,           -- 'YYYY-MM'
  month                text GENERATED ALWAYS AS (reference_month) STORED,

  -- Consumo total
  kwh_total            numeric(10,2),
  cost_total_brl       numeric(10,2),

  -- Horário Reservado (fora de ponta + reservado)
  kwh_reserved         numeric(10,2),
  cost_reserved_brl    numeric(10,2),
  reserved_percent     numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN kwh_total > 0 THEN (kwh_reserved / kwh_total) * 100 ELSE NULL END
  ) STORED,

  -- Horário de Ponta
  kwh_peak             numeric(10,2),
  cost_peak_brl        numeric(10,2),

  -- Horário Fora de Ponta (separado do reservado quando disponível)
  kwh_offpeak          numeric(10,2),
  cost_offpeak_brl     numeric(10,2),

  -- Energia Reativa
  reactive_kvarh       numeric(10,2),
  cost_reactive_brl    numeric(10,2),
  reactive_percent     numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN kwh_total > 0 THEN (reactive_kvarh / kwh_total) * 100 ELSE NULL END
  ) STORED,

  -- Demanda
  contracted_demand_kw numeric(8,2),
  measured_demand_kw   numeric(8,2),
  demand_exceeded_brl  numeric(10,2),

  -- Fator de Potência
  power_factor         numeric(5,3),

  -- KPI principal: custo por lâmina irrigada (preenchido pelo app)
  cost_per_mm_ha       numeric(8,4),           -- R$/mm/ha

  -- Origem do registro
  source               text NOT NULL DEFAULT 'upload'
                       CHECK (source IN ('upload', 'whatsapp', 'manual')),

  -- Texto bruto para auditoria da extração
  raw_text             text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Unicidade: um registro por pivô por mês
  UNIQUE (pivot_id, reference_month)
);

-- ─── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS energy_bills_pivot_id_idx
  ON energy_bills (pivot_id);

CREATE INDEX IF NOT EXISTS energy_bills_reference_month_idx
  ON energy_bills (reference_month DESC);

-- ─── Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS energy_bills_updated_at ON energy_bills;
CREATE TRIGGER energy_bills_updated_at
  BEFORE UPDATE ON energy_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ───────────────────────────────────────────────────────
ALTER TABLE energy_bills ENABLE ROW LEVEL SECURITY;

-- Acesso via: energy_bills → pivots → farms → company_members → auth.uid()
CREATE POLICY "energy_bills_select" ON energy_bills
  FOR SELECT USING (
    pivot_id IN (
      SELECT p.id FROM pivots p
      JOIN farms f ON f.id = p.farm_id
      JOIN company_members cm ON cm.company_id = f.company_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "energy_bills_insert" ON energy_bills
  FOR INSERT WITH CHECK (
    pivot_id IN (
      SELECT p.id FROM pivots p
      JOIN farms f ON f.id = p.farm_id
      JOIN company_members cm ON cm.company_id = f.company_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "energy_bills_update" ON energy_bills
  FOR UPDATE USING (
    pivot_id IN (
      SELECT p.id FROM pivots p
      JOIN farms f ON f.id = p.farm_id
      JOIN company_members cm ON cm.company_id = f.company_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "energy_bills_delete" ON energy_bills
  FOR DELETE USING (
    pivot_id IN (
      SELECT p.id FROM pivots p
      JOIN farms f ON f.id = p.farm_id
      JOIN company_members cm ON cm.company_id = f.company_id
      WHERE cm.user_id = auth.uid()
    )
  );
