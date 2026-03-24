#!/bin/bash
# Deploy IrrigaAgro no Vercel
# Execute este script na pasta irrigaagro/

echo "🌱 IrrigaAgro — Deploy para Vercel"
echo "=================================="

# Instalar dependências se necessário
echo "📦 Verificando dependências..."
npm install

# Instalar Vercel CLI
echo "📡 Instalando Vercel CLI..."
npm install -g vercel

# Deploy
echo "🚀 Fazendo deploy..."
vercel deploy --prod \
  --name irrigaagro \
  --yes \
  --build-env VITE_SUPABASE_URL=https://wvwjbzpnujmyvzvadctp.supabase.co \
  --build-env VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2d2pienBudWpteXZ6dmFkY3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzIzMTAsImV4cCI6MjA4ODgwODMxMH0.P241OS3TA5q9sDeJhyG6mxVAVoYRHkM-3O5L7wpz0LA

echo ""
echo "✅ Deploy concluído! O link aparece acima."
