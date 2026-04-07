// ============================================================
// Presets de culturas FAO-56 — Gotejo
// Usados apenas para pré-preencher o formulário de nova cultura.
// Não alteram culturas existentes.
//
// root_initial_depth_cm   : profundidade inicial ao germinar (cm)
// root_growth_rate_cm_day : taxa de crescimento da raiz (cm/dia) — literatura FAO/EMBRAPA
// root_start_das          : DAS a partir do qual a raiz começa a crescer
// Profundidade máxima efetiva: 40 cm (limitada no cálculo por compactação de solo)
// ============================================================

export interface CropPreset {
  name: string
  kc_ini: number
  kc_mid: number
  kc_final: number
  stage1_days: number
  stage2_days: number
  stage3_days: number
  stage4_days: number
  root_initial_depth_cm: number
  root_growth_rate_cm_day: number
  root_start_das: number
  f_factor_stage1: number
  f_factor_stage2: number
  f_factor_stage3: number
  f_factor_stage4: number
}

export const CROP_PRESETS: CropPreset[] = [
  {
    // Milho — FAO-56 Tab.22 + Ordóñez et al. 2018 (Field Crops Research)
    // Raiz: ~0.6 cm/dia fase lenta até V5, depois 3 cm/dia. Cap 40 cm atingido ~DAS 30-35.
    // Simplificado para taxa média de 1.0 cm/dia após germinação (DAS 4)
    name: 'Milho',
    kc_ini: 0.30, kc_mid: 1.20, kc_final: 0.35,
    stage1_days: 20, stage2_days: 35, stage3_days: 40, stage4_days: 30,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.0, root_start_das: 4,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.55, f_factor_stage4: 0.55,
  },
  {
    // Milho Safrinha — mesma espécie, ciclo mais curto
    // 1 cm/dia a partir de DAS 4; atinge 40 cm ~DAS 44
    name: 'Milho Safrinha',
    kc_ini: 0.30, kc_mid: 1.20, kc_final: 0.35,
    stage1_days: 10, stage2_days: 45, stage3_days: 70, stage4_days: 35,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.0, root_start_das: 4,
    f_factor_stage1: 0.40, f_factor_stage2: 0.40, f_factor_stage3: 0.40, f_factor_stage4: 0.40,
  },
  {
    // Soja — Torrion et al. 2012 (Agronomy Journal)
    // Taxa ~1.2 cm/dia a partir de DAS 5; atinge 40 cm ~DAS 33
    name: 'Soja',
    kc_ini: 0.40, kc_mid: 1.15, kc_final: 0.50,
    stage1_days: 15, stage2_days: 30, stage3_days: 40, stage4_days: 25,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.2, root_start_das: 5,
    f_factor_stage1: 0.50, f_factor_stage2: 0.50, f_factor_stage3: 0.50, f_factor_stage4: 0.50,
  },
  {
    // Feijão — estudo pivô Brasil (Scielo), EMBRAPA
    // Sistema radicular raso; taxa 0.8 cm/dia; atinge 40 cm ~DAS 48 mas 83% massa em 0-20 cm
    name: 'Feijão',
    kc_ini: 0.40, kc_mid: 1.15, kc_final: 0.35,
    stage1_days: 15, stage2_days: 25, stage3_days: 25, stage4_days: 20,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 0.8, root_start_das: 5,
    f_factor_stage1: 0.45, f_factor_stage2: 0.45, f_factor_stage3: 0.45, f_factor_stage4: 0.45,
  },
  {
    // Trigo — Frontiers Plant Sci 2024; Soil & Health Library Ch.V
    // Raízes seminais emergem ao germinar (DAS 0); taxa 1.4 cm/dia; atinge 40 cm ~DAS 25
    name: 'Trigo',
    kc_ini: 0.30, kc_mid: 1.15, kc_final: 0.25,
    stage1_days: 20, stage2_days: 30, stage3_days: 40, stage4_days: 30,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.4, root_start_das: 0,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.55, f_factor_stage4: 0.55,
  },
  {
    // Algodão — IntechOpen; National Cotton Council
    // Taxa ~1.0 cm/dia após DAS 7; atinge 40 cm ~DAS 40
    name: 'Algodão',
    kc_ini: 0.35, kc_mid: 1.20, kc_final: 0.60,
    stage1_days: 30, stage2_days: 50, stage3_days: 55, stage4_days: 45,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.0, root_start_das: 7,
    f_factor_stage1: 0.65, f_factor_stage2: 0.65, f_factor_stage3: 0.65, f_factor_stage4: 0.65,
  },
  {
    // Sorgo — Robertson et al. 1993 (Field Crops Research); RFV 2.7 cm/dia
    // Cap 40 cm atingido muito cedo (~DAS 22); usar 1.0 cm/dia para refletir solo pivô
    name: 'Sorgo',
    kc_ini: 0.30, kc_mid: 1.10, kc_final: 0.55,
    stage1_days: 20, stage2_days: 35, stage3_days: 45, stage4_days: 20,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.0, root_start_das: 7,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.50, f_factor_stage4: 0.55,
  },
  {
    // Tomate — Soil & Health Library Ch.XXVI; raiz rápida ~2 cm/dia DAS 3+
    // Cap 40 cm atingido ~DAS 21 (20 dias após transplante)
    name: 'Tomate',
    kc_ini: 0.60, kc_mid: 1.15, kc_final: 0.80,
    stage1_days: 30, stage2_days: 40, stage3_days: 45, stage4_days: 30,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 2.0, root_start_das: 3,
    f_factor_stage1: 0.40, f_factor_stage2: 0.40, f_factor_stage3: 0.40, f_factor_stage4: 0.40,
  },
  {
    // Cana-de-açúcar — ESALQ/USP; CIRAD; 85% raízes nos primeiros 35-40 cm
    // Taxa 1.7 cm/dia; começa ~DAS 25 (após sett estabelecer broto)
    name: 'Cana-de-açúcar',
    kc_ini: 0.40, kc_mid: 1.25, kc_final: 0.75,
    stage1_days: 30, stage2_days: 60, stage3_days: 180, stage4_days: 60,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.7, root_start_das: 25,
    f_factor_stage1: 0.65, f_factor_stage2: 0.65, f_factor_stage3: 0.65, f_factor_stage4: 0.65,
  },
  {
    // Batata — Stalham & Allen 2001 (J. Agric. Sci. Cambridge)
    // Fase rápida 1.2 cm/dia (DAS 7-35), depois desacelera; cap 40 cm atingido ~DAS 36
    name: 'Batata',
    kc_ini: 0.50, kc_mid: 1.15, kc_final: 0.75,
    stage1_days: 25, stage2_days: 30, stage3_days: 30, stage4_days: 25,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 1.2, root_start_das: 7,
    f_factor_stage1: 0.35, f_factor_stage2: 0.35, f_factor_stage3: 0.35, f_factor_stage4: 0.35,
  },
  {
    // Café — perene; crescimento muito lento; 80% raízes em 0-20 cm
    // DAS aqui = dias após transplante de mudas
    name: 'Café',
    kc_ini: 0.90, kc_mid: 1.05, kc_final: 1.00,
    stage1_days: 90, stage2_days: 90, stage3_days: 120, stage4_days: 65,
    root_initial_depth_cm: 10, root_growth_rate_cm_day: 0.15, root_start_das: 21,
    f_factor_stage1: 0.40, f_factor_stage2: 0.40, f_factor_stage3: 0.40, f_factor_stage4: 0.45,
  },
  {
    // Cebola — sistema radicular raso, taxa baixa
    name: 'Cebola',
    kc_ini: 0.70, kc_mid: 1.05, kc_final: 0.75,
    stage1_days: 15, stage2_days: 25, stage3_days: 35, stage4_days: 20,
    root_initial_depth_cm: 5, root_growth_rate_cm_day: 0.5, root_start_das: 5,
    f_factor_stage1: 0.30, f_factor_stage2: 0.30, f_factor_stage3: 0.30, f_factor_stage4: 0.30,
  },
  {
    // Pastagem — raízes já estabelecidas; crescimento lento contínuo
    name: 'Pastagem',
    kc_ini: 0.40, kc_mid: 0.95, kc_final: 0.85,
    stage1_days: 10, stage2_days: 20, stage3_days: 180, stage4_days: 30,
    root_initial_depth_cm: 15, root_growth_rate_cm_day: 0.3, root_start_das: 0,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.55, f_factor_stage4: 0.55,
  },
]
