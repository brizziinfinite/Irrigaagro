-- ─── WhatsApp Automation Tables ──────────────────────────────

-- Contatos que recebem mensagens WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone             text NOT NULL,
  contact_name      text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  notification_hour integer NOT NULL DEFAULT 7 CHECK (notification_hour >= 0 AND notification_hour <= 23),
  language          text NOT NULL DEFAULT 'pt-BR',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);

-- Assinaturas de alertas por pivô
CREATE TABLE IF NOT EXISTS whatsapp_pivot_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           uuid NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  pivot_id             uuid NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  notify_irrigation    boolean NOT NULL DEFAULT true,
  notify_rain          boolean NOT NULL DEFAULT false,
  notify_status        boolean NOT NULL DEFAULT false,
  notify_daily_summary boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, pivot_id)
);

-- Log de mensagens enviadas e recebidas
CREATE TABLE IF NOT EXISTS whatsapp_messages_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  pivot_id      uuid REFERENCES pivots(id) ON DELETE SET NULL,
  direction     text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type  text NOT NULL DEFAULT 'manual' CHECK (message_type IN (
    'irrigation_alert','rain_forecast','daily_summary','status_update',
    'rain_report','irrigation_confirm','energy_bill','manual','unknown'
  )),
  content       text,
  raw_payload   jsonb,
  media_url     text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Chuvas reportadas via WhatsApp
CREATE TABLE IF NOT EXISTS rain_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       uuid REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  pivot_id         uuid NOT NULL REFERENCES pivots(id) ON DELETE CASCADE,
  rainfall_mm      numeric(6,2) NOT NULL,
  reported_at      timestamptz NOT NULL DEFAULT now(),
  observation_date date,
  source           text NOT NULL DEFAULT 'whatsapp',
  message_id       uuid REFERENCES whatsapp_messages_log(id) ON DELETE SET NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_pivot_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rain_reports ENABLE ROW LEVEL SECURITY;

-- whatsapp_contacts: membros da empresa podem ver/editar
CREATE POLICY "company members can manage contacts"
  ON whatsapp_contacts
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- whatsapp_pivot_subscriptions: via contato da empresa
CREATE POLICY "company members can manage subscriptions"
  ON whatsapp_pivot_subscriptions
  FOR ALL
  USING (
    contact_id IN (
      SELECT wc.id FROM whatsapp_contacts wc
      JOIN company_members cm ON cm.company_id = wc.company_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- whatsapp_messages_log: somente leitura para membros da empresa
CREATE POLICY "company members can view message log"
  ON whatsapp_messages_log
  FOR SELECT
  USING (
    contact_id IN (
      SELECT wc.id FROM whatsapp_contacts wc
      JOIN company_members cm ON cm.company_id = wc.company_id
      WHERE cm.user_id = auth.uid()
    )
  );

-- Service role pode inserir no log
CREATE POLICY "service role can insert message log"
  ON whatsapp_messages_log
  FOR INSERT
  WITH CHECK (true);

-- rain_reports: membros da empresa via pivô
CREATE POLICY "company members can view rain reports"
  ON rain_reports
  FOR SELECT
  USING (
    pivot_id IN (
      SELECT p.id FROM pivots p
      JOIN farms f ON f.id = p.farm_id
      JOIN company_members cm ON cm.company_id = f.company_id
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "service role can insert rain reports"
  ON rain_reports
  FOR INSERT
  WITH CHECK (true);

-- ─── Índices ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_company ON whatsapp_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_subs_contact ON whatsapp_pivot_subscriptions(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_subs_pivot ON whatsapp_pivot_subscriptions(pivot_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_contact ON whatsapp_messages_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_created ON whatsapp_messages_log(created_at DESC);
