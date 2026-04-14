const defaultConfig = {
  statusRules: {
    ok_min_percent: 75,
    attention_min_percent: 70,
    promote_if_conjugated_days_gte: 2,
    promote_if_forecast_deficit_mm_gte: 6,
    promote_if_recommended_mm_gte: 8
  },
  dataRules: {
    require_soil_percent: true,
    require_etc_mm: true,
    require_rainfall_mm: true
  },
  priorityRules: {
    weights: {
      deficit_mm: 0.5,
      soil_gap_to_100: 0.3,
      days_to_next_irrigation: 0.2
    }
  },
  labels: {
    ok: 'OK',
    attention: 'Atenção',
    critical: 'Crítico',
    no_data: 'Sem dados',
    priority_1: 'Prioridade 1',
    priority_2: 'Prioridade 2',
    no_urgency: 'Sem urgência'
  }
};

function toNumberOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function round(val, decimals) {
  if (val === null || val === undefined) return null;
  return parseFloat(val.toFixed(decimals));
}

function formatNumber(val) {
  if (val === null || val === undefined) return '--';
  const n = parseFloat(val);
  if (isNaN(n)) return '--';
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function escapeHtml(str) {
  if (!str && str !== 0) return '--';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mergeDeep(target, source) {
  const out = Object.assign({}, target);
  if (!source || typeof source !== 'object') return out;
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function classifyPivot(pivot, config) {
  const cfg = config || defaultConfig;
  const rules = cfg.statusRules;
  const labels = cfg.labels;
  const weights = cfg.priorityRules.weights;

  const soil = toNumberOrNull(pivot.field_capacity_percent);
  const etc  = toNumberOrNull(pivot.etc_mm);
  const rain = toNumberOrNull(pivot.rainfall_mm);

  const hasData = soil !== null && etc !== null && rain !== null;

  let status_code, status, status_class;

  if (!hasData) {
    status_code  = 'no_data';
    status       = labels.no_data;
    status_class = 'status-no-data';
  } else if (soil >= rules.ok_min_percent) {
    status_code  = 'ok';
    status       = labels.ok;
    status_class = 'status-ok';
  } else if (soil >= rules.attention_min_percent) {
    status_code  = 'attention';
    status       = labels.attention;
    status_class = 'status-warning';
  } else {
    status_code  = 'critical';
    status       = labels.critical;
    status_class = 'status-critical';
  }

  // Promoção automática para crítico
  if (status_code === 'attention' || status_code === 'ok') {
    const recMm   = toNumberOrNull(pivot.recommended_depth_mm);
    const fDeficit = toNumberOrNull(pivot.forecast_deficit_mm);
    const daysNext = toNumberOrNull(pivot.days_to_next_irrigation);
    const conj     = !!pivot.is_conjugated;

    const promoteByConjugated = conj && daysNext !== null && daysNext >= rules.promote_if_conjugated_days_gte;
    const promoteByForecast   = fDeficit !== null && fDeficit >= rules.promote_if_forecast_deficit_mm_gte;
    const promoteByRec        = recMm !== null && recMm >= rules.promote_if_recommended_mm_gte;

    if (promoteByConjugated || promoteByForecast || promoteByRec) {
      status_code  = 'critical';
      status       = labels.critical;
      status_class = 'status-critical';
    }
  }

  // Priority score
  const deficit   = toNumberOrNull(pivot.ctda);
  const daysNext  = toNumberOrNull(pivot.days_to_next_irrigation);
  let priority_score = null;
  if (hasData && soil !== null) {
    const d = deficit !== null ? deficit : 0;
    const dn = daysNext !== null ? daysNext : 0;
    priority_score = round(
      (d * weights.deficit_mm) +
      ((100 - soil) * weights.soil_gap_to_100) +
      (dn * weights.days_to_next_irrigation),
      2
    );
  }

  // Priority label / code
  let priority_code, priority;
  if (status_code === 'critical') {
    priority_code = 'priority_1';
    priority = labels.priority_1;
  } else if (status_code === 'attention') {
    priority_code = 'priority_2';
    priority = labels.priority_2;
  } else {
    priority_code = 'no_urgency';
    priority = labels.no_urgency;
  }

  // Recommendation text
  const recMm = toNumberOrNull(pivot.recommended_depth_mm);
  const recommendation_text = recMm && recMm > 0
    ? 'Irrigar ' + formatNumber(recMm) + ' mm'
    : 'Sem urgência';

  // Alert text
  let alert;
  const conj    = !!pivot.is_conjugated;
  const dNext   = toNumberOrNull(pivot.days_to_next_irrigation);
  if (status_code === 'critical' && conj && dNext !== null && dNext >= rules.promote_if_conjugated_days_gte) {
    alert = 'Prioridade máxima devido à janela operacional';
  } else if (status_code === 'critical') {
    alert = 'Prioridade máxima de irrigação';
  } else if (status_code === 'attention') {
    alert = 'Monitorar e programar irrigação';
  } else if (status_code === 'ok') {
    alert = 'Situação estável';
  } else {
    alert = 'Dados insuficientes para recomendação';
  }

  return Object.assign({}, pivot, {
    status,
    status_code,
    status_class,
    priority,
    priority_code,
    priority_score,
    recommendation_text,
    alert,
    operational_rank: null
  });
}

function classifyPivots(pivots, config) {
  if (!Array.isArray(pivots) || pivots.length === 0) return [];

  const classified = pivots.map(p => classifyPivot(p, config));

  // Ranking por priority_score (só quem tem score válido e não é no_data)
  const ranked = classified
    .filter(p => p.priority_score !== null && p.status_code !== 'no_data')
    .sort((a, b) => b.priority_score - a.priority_score);

  ranked.forEach((p, i) => { p.operational_rank = i + 1; });

  return classified;
}

function buildDailySummary(pivots) {
  if (!Array.isArray(pivots) || pivots.length === 0) {
    return {
      total_pivots: 0,
      pivots_ok: 0,
      pivots_attention: 0,
      pivots_critical: 0,
      pivots_no_data: 0,
      top_priority_pivot: null,
      top_priority_recommendation: null
    };
  }

  const top = pivots
    .filter(p => p.priority_score !== null && p.status_code !== 'no_data')
    .sort((a, b) => b.priority_score - a.priority_score)[0] || null;

  return {
    total_pivots: pivots.length,
    pivots_ok:        pivots.filter(p => p.status_code === 'ok').length,
    pivots_attention: pivots.filter(p => p.status_code === 'attention').length,
    pivots_critical:  pivots.filter(p => p.status_code === 'critical').length,
    pivots_no_data:   pivots.filter(p => p.status_code === 'no_data').length,
    top_priority_pivot:          top ? (top.name || top.pivot_name || null) : null,
    top_priority_recommendation: top ? top.recommendation_text : null
  };
}

function buildPivotsHTML(pivots) {
  if (!Array.isArray(pivots) || pivots.length === 0) return '';

  return pivots.map(function(p) {
    const soil = p.field_capacity_percent != null ? formatNumber(p.field_capacity_percent) + '%' : '--';
    const rain = p.rainfall_mm != null ? formatNumber(p.rainfall_mm) + ' mm' : '--';
    const etc  = p.etc_mm != null ? formatNumber(p.etc_mm) + ' mm' : '--';
    const name = escapeHtml(p.name || p.pivot_name || 'Pivô');
    const statusLabel = escapeHtml(p.status || '--');
    const sc = p.status_class || 'status-no-data';
    const rec = escapeHtml(p.recommendation_text || '--');
    const speed = p.recommended_speed_percent != null ? formatNumber(p.recommended_speed_percent) + '%' : null;
    const farm = p.farm_name ? '<div class="pivot-farm">' + escapeHtml(p.farm_name) + '</div>' : '';

    const speedLine = speed
      ? '<div class="recommendation"><div class="label">Velocidade</div><div class="value">' + speed + '</div></div>'
      : '';

    return (
      '<div class="pivot ' + sc + '">' +
        '<div class="pivot-header">' +
          '<div class="pivot-name">' + name + '</div>' +
          farm +
          '<div class="' + sc + '">' + statusLabel + '</div>' +
        '</div>' +
        '<div class="grid">' +
          '<div><div class="label">Solo</div><div class="value">' + soil + '</div></div>' +
          '<div><div class="label">Chuva</div><div class="value">' + rain + '</div></div>' +
          '<div><div class="label">ETc</div><div class="value">' + etc + '</div></div>' +
        '</div>' +
        '<div class="recommendation"><div class="label">Recomendação</div><div class="value">' + rec + '</div></div>' +
        speedLine +
      '</div>'
    );
  }).join('');
}

// ─── N8N Function Node entry point ───────────────────────────────────────────
const pivots = ($json && $json.pivots) ? $json.pivots : [];
const pivots_classified = classifyPivots(pivots);
const summary = buildDailySummary(pivots_classified);
const pivots_html = buildPivotsHTML(pivots_classified);

return [{ json: Object.assign({}, $json, { pivots_classified, summary, pivots_html }) }];
