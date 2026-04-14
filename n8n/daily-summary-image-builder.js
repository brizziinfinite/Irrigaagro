// N8N Code Node — Gerador de HTML para imagem do resumo diário
// Recebe: { pivots_classified, summary, forecast, fazenda, data, hora }
// Retorna: { html }
//
// Placeholders substituídos:
//   {{fazenda}}, {{data}}, {{hora_geracao}}
//   {{total_pivos}}, {{pivos_ok}}, {{pivos_atencao}}, {{pivos_critico}}
//   {{pivots_html}} — cards gerados dinamicamente
//   {{previsao_html}} — dias de previsão
//   {{alertas}} — alertas de irrigação

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusClass(status) {
  const map = {
    'OK': 'ok',
    'Atenção': 'atencao',
    'Crítico': 'critico',
    'Sem dados': 'sem-dados',
  };
  return map[status] || 'sem-dados';
}

function badgeClass(status) {
  return 'badge-' + statusClass(status);
}

function fillClass(status) {
  const map = { 'OK': 'fill-ok', 'Atenção': 'fill-atencao', 'Crítico': 'fill-critico' };
  return map[status] || 'fill-ok';
}

function formatMm(val) {
  if (val == null) return '—';
  return parseFloat(val).toFixed(1) + ' mm';
}

function formatPct(val) {
  if (val == null) return '—';
  return parseFloat(val).toFixed(0) + '%';
}

function buildPivotCard(pivot) {
  const sc = statusClass(pivot.status);
  const bc = badgeClass(pivot.status);
  const fc = fillClass(pivot.status);
  const soilPct = pivot.soil_percent != null ? parseFloat(pivot.soil_percent) : null;
  const barWidth = soilPct != null ? Math.min(100, Math.max(0, soilPct)) : 0;

  const soilSection = soilPct != null ? `
    <div class="soil-wrap">
      <div class="soil-label-row">
        <span class="soil-label">Solo</span>
        <span class="soil-value" style="color: var(--soil-color, #e2e8f0)">${formatPct(soilPct)}</span>
      </div>
      <div class="soil-bar-bg">
        <div class="soil-bar-fill ${fc}" style="width: ${barWidth}%"></div>
      </div>
    </div>
  ` : `
    <div class="soil-wrap">
      <div style="font-size:12px; color: rgba(255,255,255,0.3); margin-bottom: 14px;">Sem dados de solo</div>
    </div>
  `;

  const metrics = `
    <div class="pivot-metrics">
      <div class="metric">
        <span class="metric-label">Déficit</span>
        <span class="metric-value">${formatMm(pivot.deficit_mm)}</span>
      </div>
      <div class="metric">
        <span class="metric-label">ETc</span>
        <span class="metric-value">${formatMm(pivot.etc_mm)}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Chuva</span>
        <span class="metric-value">${pivot.rainfall_mm > 0 ? formatMm(pivot.rainfall_mm) : '—'}</span>
      </div>
    </div>
  `;

  const irrigationAlert = pivot.needs_irrigation ? `
    <div class="pivot-alert">
      <span class="pivot-alert-icon">⚠️</span>
      <span class="pivot-alert-text">
        Irrigar hoje — vel. ${pivot.recommended_speed_percent != null ? pivot.recommended_speed_percent + '%' : '—'}
        · lâmina ${formatMm(pivot.recommended_depth_mm)}
      </span>
    </div>
  ` : '';

  return `
    <div class="pivot-card ${sc}">
      <div class="pivot-card-header">
        <div>
          <div class="pivot-name">${escapeHtml(pivot.name)}</div>
          <div class="pivot-farm">${escapeHtml(pivot.farm_name || '')}</div>
        </div>
        <span class="pivot-badge ${bc}">${escapeHtml(pivot.status)}</span>
      </div>
      ${soilSection}
      ${metrics}
      ${irrigationAlert}
    </div>
  `;
}

function buildForecastDay(day) {
  const emojiMap = (code) => {
    if (code === 0) return '☀️';
    if (code <= 2)  return '🌤️';
    if (code <= 3)  return '☁️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌦️';
    if (code <= 99) return '⛈️';
    return '🌡️';
  };

  const emoji = emojiMap(day.weatherCode || 0);
  const rainStr = day.rain > 0
    ? `<div class="forecast-rain">🌧 ${parseFloat(day.rain).toFixed(0)} mm</div>`
    : '';

  return `
    <div class="forecast-day">
      <span class="forecast-emoji">${emoji}</span>
      <span class="forecast-label">${escapeHtml(day.label || day.date)}</span>
      <span class="forecast-temp">${Math.round(day.tmax)}° / ${Math.round(day.tmin)}°</span>
      <span class="forecast-eto">ETo ${parseFloat(day.eto).toFixed(1)} mm</span>
      ${rainStr}
    </div>
  `;
}

// ─── Leitura dos inputs do N8N ────────────────────────────────────────────────
const input = $json || {};
const pivots = input.pivots_classified || [];
const summary = input.summary || {};
const forecast = input.forecast || [];
const fazenda = input.fazenda || 'Fazenda';
const data = input.data || new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const hora = input.hora || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// ─── Gerar HTML dos pivôs ─────────────────────────────────────────────────────
const pivotsHtml = pivots.length > 0
  ? pivots.map(buildPivotCard).join('\n')
  : `<div class="pivot-card sem-dados" style="grid-column: span 2">
       <div style="text-align:center; padding: 32px 0; color: rgba(255,255,255,0.3); font-size: 14px;">
         Nenhum pivô com dados disponíveis
       </div>
     </div>`;

// ─── Gerar HTML da previsão ───────────────────────────────────────────────────
const previsaoHtml = forecast.slice(0, 4).map(buildForecastDay).join('\n');

// ─── Alertas globais ──────────────────────────────────────────────────────────
const criticalPivots = pivots.filter(p => p.status === 'Crítico' && p.needs_irrigation);
let alertasHtml = '';
for (const p of criticalPivots) {
  alertasHtml += `
    <div class="alert-global">
      <span class="alert-global-icon">🚨</span>
      <span class="alert-global-text">
        <strong>${escapeHtml(p.name)}</strong> — Solo em ${formatPct(p.soil_percent)}: irrigar hoje
        (vel. ${p.recommended_speed_percent != null ? p.recommended_speed_percent + '%' : '—'}, lâmina ${formatMm(p.recommended_depth_mm)})
      </span>
    </div>
  `;
}

// ─── Montar HTML completo a partir do template ────────────────────────────────
// (O template foi lido como string. Em produção, usar HTTP Request node para buscar o arquivo
//  ou deixar o HTML embutido aqui. Por ora, construímos inline para portabilidade.)

const TEMPLATE_URL = 'https://raw.githubusercontent.com/brizzi/irrigaagro/main/n8n/templates/daily-summary.html';
// Se o template não estiver disponível via URL, o HTML completo está embutido abaixo.

// Em N8N: usar HTTP Request node antes deste Code node para buscar o template,
// e acessar via $('HTTP Request').item.json.data ou similar.
// Aqui, esperamos que o template já tenha sido buscado e esteja em input.template_html,
// ou usamos o HTML inline de fallback.

let html = input.template_html || '';

if (!html) {
  // Fallback: montar HTML direto (sem dependência externa)
  // Isso garante que o node funciona mesmo sem o template pré-carregado
  html = buildInlineHtml();
}

function buildInlineHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1080px; min-height: 1350px;
  background: #0b1020;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  color: #e2e8f0;
}
.container {
  width: 1080px; min-height: 1350px;
  background: linear-gradient(160deg, #0d1528 0%, #0b1020 40%, #0a0e1a 100%);
  display: flex; flex-direction: column;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 48px 64px 36px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.logo-wrap { display: flex; align-items: center; gap: 16px; }
.logo-wordmark { font-size: 28px; font-weight: 700; }
.irriga { color: #4ade80; }
.agro { color: #60a5fa; }
.logo-tagline { font-size: 11px; color: rgba(255,255,255,0.35); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px; }
.header-meta { text-align: right; }
.header-title { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.35); }
.header-farm { font-size: 22px; font-weight: 700; margin-top: 4px; }
.header-date { font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 2px; }
.stats-bar {
  display: flex; margin: 32px 64px 0;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px; overflow: hidden;
}
.stat-item { flex: 1; padding: 20px 24px; display: flex; flex-direction: column; align-items: center; border-right: 1px solid rgba(255,255,255,0.06); }
.stat-item:last-child { border-right: none; }
.stat-value { font-size: 36px; font-weight: 800; line-height: 1; }
.stat-label { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-top: 6px; }
.stat-total .stat-value { color: #60a5fa; }
.stat-ok .stat-value { color: #4ade80; }
.stat-warn .stat-value { color: #fbbf24; }
.stat-crit .stat-value { color: #f87171; }
.section-label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.3); padding: 28px 64px 14px; }
.pivots-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 64px; }
.pivot-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px; padding: 24px; position: relative; overflow: hidden;
}
.pivot-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 16px 16px 0 0;
}
.pivot-card.ok::before { background: linear-gradient(90deg, #4ade80, #22c55e); }
.pivot-card.atencao::before { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
.pivot-card.critico::before { background: linear-gradient(90deg, #f87171, #ef4444); }
.pivot-card.sem-dados::before { background: linear-gradient(90deg, #64748b, #475569); }
.pivot-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.pivot-name { font-size: 17px; font-weight: 700; color: #f1f5f9; }
.pivot-farm { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }
.pivot-badge { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; }
.badge-ok { background: rgba(74,222,128,0.15); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.badge-atencao { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
.badge-critico { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
.badge-sem-dados { background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
.soil-wrap { margin-bottom: 14px; }
.soil-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.soil-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.8px; }
.soil-value { font-size: 20px; font-weight: 800; }
.soil-bar-bg { height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; }
.soil-bar-fill { height: 100%; border-radius: 4px; }
.fill-ok { background: linear-gradient(90deg, #22c55e, #4ade80); }
.fill-atencao { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.fill-critico { background: linear-gradient(90deg, #ef4444, #f87171); }
.pivot-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.metric { display: flex; flex-direction: column; }
.metric-label { font-size: 10px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.8px; }
.metric-value { font-size: 14px; font-weight: 600; color: #cbd5e1; margin-top: 2px; }
.pivot-alert { display: flex; align-items: center; gap: 8px; background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 8px 12px; margin-top: 12px; }
.pivot-alert-text { font-size: 12px; font-weight: 600; color: #f87171; }
.alerts-section { padding: 24px 64px 0; }
.alert-global { display: flex; align-items: center; gap: 12px; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; }
.alert-global-text { font-size: 13px; color: #fbbf24; font-weight: 500; }
.forecast-section { margin: 28px 64px 0; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 20px 24px; }
.forecast-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 14px; }
.forecast-days { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.forecast-day { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.forecast-emoji { font-size: 22px; }
.forecast-label { font-size: 11px; color: rgba(255,255,255,0.4); }
.forecast-temp { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.forecast-eto { font-size: 11px; color: rgba(255,255,255,0.4); }
.forecast-rain { font-size: 11px; color: #60a5fa; }
.footer { margin-top: auto; padding: 28px 64px 48px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; }
.footer-cta { font-size: 12px; color: rgba(255,255,255,0.3); }
.footer-cta span { color: #60a5fa; font-weight: 600; }
.footer-time { font-size: 11px; color: rgba(255,255,255,0.2); }
</style>
</head>
<body>
<div class="container">

<div class="header">
  <div class="logo-wrap">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dg" x1="26" y1="4" x2="26" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#4ade80"/>
          <stop offset="100%" stop-color="#38bdf8"/>
        </linearGradient>
        <clipPath id="dc">
          <path d="M26 4C26 4 10 20 10 31C10 39.837 17.163 47 26 47C34.837 47 42 39.837 42 31C42 20 26 4 26 4Z"/>
        </clipPath>
      </defs>
      <path d="M26 4C26 4 10 20 10 31C10 39.837 17.163 47 26 47C34.837 47 42 39.837 42 31C42 20 26 4 26 4Z" stroke="url(#dg)" stroke-width="2" fill="none"/>
      <g clip-path="url(#dc)">
        <rect x="15" y="34" width="5" height="10" rx="1.5" fill="#4ade80" opacity="0.9"/>
        <rect x="23" y="27" width="5" height="17" rx="1.5" fill="#60a5fa" opacity="0.9"/>
        <rect x="31" y="30" width="5" height="14" rx="1.5" fill="#38bdf8" opacity="0.9"/>
      </g>
    </svg>
    <div>
      <div class="logo-wordmark"><span class="irriga">Irriga</span><span class="agro">Agro</span></div>
      <div class="logo-tagline">Irrigação Inteligente</div>
    </div>
  </div>
  <div class="header-meta">
    <div class="header-title">Resumo Diário</div>
    <div class="header-farm">FAZENDA_PLACEHOLDER</div>
    <div class="header-date">DATA_PLACEHOLDER</div>
  </div>
</div>

<div class="stats-bar">
  <div class="stat-item stat-total"><div class="stat-value">TOTAL_PIVOS</div><div class="stat-label">Pivôs</div></div>
  <div class="stat-item stat-ok"><div class="stat-value">PIVOS_OK</div><div class="stat-label">OK</div></div>
  <div class="stat-item stat-warn"><div class="stat-value">PIVOS_ATENCAO</div><div class="stat-label">Atenção</div></div>
  <div class="stat-item stat-crit"><div class="stat-value">PIVOS_CRITICO</div><div class="stat-label">Crítico</div></div>
</div>

<div class="section-label">Status dos Pivôs</div>
<div class="pivots-grid">
PIVOTS_HTML
</div>

ALERTAS_HTML

FORECAST_HTML

<div class="footer">
  <div class="footer-cta">Registrar chuva? Responda: <span>CHUVA [PIVÔ] [mm]</span></div>
  <div class="footer-time">HORA_PLACEHOLDER</div>
</div>

</div>
</body>
</html>`;
}

// Substituir placeholders simples
html = html
  .replace(/FAZENDA_PLACEHOLDER|{{fazenda}}/g, escapeHtml(fazenda))
  .replace(/DATA_PLACEHOLDER|{{data}}/g, escapeHtml(data))
  .replace(/HORA_PLACEHOLDER|{{hora_geracao}}/g, escapeHtml(hora))
  .replace(/TOTAL_PIVOS|{{total_pivos}}/g, String(summary.total_pivots || pivots.length))
  .replace(/PIVOS_OK|{{pivos_ok}}/g, String(summary.ok || 0))
  .replace(/PIVOS_ATENCAO|{{pivos_atencao}}/g, String(summary.attention || 0))
  .replace(/PIVOS_CRITICO|{{pivos_critico}}/g, String(summary.critical || 0))
  .replace(/PIVOTS_HTML|{{pivots_html}}/g, pivotsHtml)
  .replace(/ALERTAS_HTML/g, alertasHtml ? `<div class="alerts-section">${alertasHtml}</div>` : '')
  .replace(/{{alertas}}/g, alertasHtml)
  .replace(/FORECAST_HTML/g, previsaoHtml
    ? `<div class="forecast-section"><div class="forecast-title">Previsão 4 dias</div><div class="forecast-days">${previsaoHtml}</div></div>`
    : '')
  .replace(/{{previsao_html}}/g, previsaoHtml)
  // Remover blocos {{#if ...}} vazios
  .replace(/\{\{#if [^}]+\}\}\s*\{\{\/if\}\}/g, '');

return [{ json: Object.assign({}, $json, { html }) }];
