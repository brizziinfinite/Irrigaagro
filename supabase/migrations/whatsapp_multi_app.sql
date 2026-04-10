-- Multi-app WhatsApp: coluna app em whatsapp_contacts
-- Valores: 'irrigaagro' | 'agromanage' | 'ambos'

ALTER TABLE whatsapp_contacts
  ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'irrigaagro'
  CHECK (app IN ('irrigaagro', 'agromanage', 'ambos'));

-- Todos os contatos existentes pertencem ao IrrigaAgro
UPDATE whatsapp_contacts SET app = 'irrigaagro' WHERE app IS NULL OR app = '';
