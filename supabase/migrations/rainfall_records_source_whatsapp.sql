-- Adiciona 'whatsapp' como source válido em rainfall_records
ALTER TABLE rainfall_records DROP CONSTRAINT IF EXISTS rainfall_records_source_check;
ALTER TABLE rainfall_records ADD CONSTRAINT rainfall_records_source_check 
  CHECK (source IN ('manual', 'import', 'station', 'plugfield', 'whatsapp'));
