-- Adiciona coluna para mapear contato ao empresa_id do AgroManager
-- Usada pelo N8N ao rotear mensagens para a Edge Function message-ingestion do AgroManager

ALTER TABLE whatsapp_contacts
  ADD COLUMN IF NOT EXISTS agromanager_empresa_id uuid NULL;

COMMENT ON COLUMN whatsapp_contacts.agromanager_empresa_id IS
  'UUID da empresa no AgroManager (Supabase orinqcuymgszsyzfbmfy). '
  'Obrigatório quando app = ''agromanage'' ou app = ''ambos''.';

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_agromanager_empresa
  ON whatsapp_contacts(agromanager_empresa_id)
  WHERE agromanager_empresa_id IS NOT NULL;
