// ============================================================
// Presets de culturas FAO-56 — Gotejo
// Usados apenas para pré-preencher o formulário de nova cultura.
// Não alteram culturas existentes.
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
  root_depth_stage1_cm: number
  root_depth_stage2_cm: number
  root_depth_stage3_cm: number
  root_depth_stage4_cm: number
  f_factor_stage1: number
  f_factor_stage2: number
  f_factor_stage3: number
  f_factor_stage4: number
}

export const CROP_PRESETS: CropPreset[] = [
  {
    name: 'Milho',
    kc_ini: 0.30, kc_mid: 1.20, kc_final: 0.35,
    stage1_days: 20, stage2_days: 35, stage3_days: 40, stage4_days: 30,
    root_depth_stage1_cm: 20, root_depth_stage2_cm: 40, root_depth_stage3_cm: 60, root_depth_stage4_cm: 60,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.55, f_factor_stage4: 0.55,
  },
  {
    name: 'Soja',
    kc_ini: 0.40, kc_mid: 1.15, kc_final: 0.50,
    stage1_days: 15, stage2_days: 30, stage3_days: 40, stage4_days: 25,
    root_depth_stage1_cm: 15, root_depth_stage2_cm: 30, root_depth_stage3_cm: 50, root_depth_stage4_cm: 50,
    f_factor_stage1: 0.50, f_factor_stage2: 0.50, f_factor_stage3: 0.50, f_factor_stage4: 0.50,
  },
  {
    name: 'Feijão',
    kc_ini: 0.40, kc_mid: 1.15, kc_final: 0.35,
    stage1_days: 15, stage2_days: 25, stage3_days: 25, stage4_days: 20,
    root_depth_stage1_cm: 15, root_depth_stage2_cm: 25, root_depth_stage3_cm: 40, root_depth_stage4_cm: 40,
    f_factor_stage1: 0.45, f_factor_stage2: 0.45, f_factor_stage3: 0.45, f_factor_stage4: 0.45,
  },
  {
    name: 'Trigo',
    kc_ini: 0.30, kc_mid: 1.15, kc_final: 0.25,
    stage1_days: 20, stage2_days: 30, stage3_days: 40, stage4_days: 30,
    root_depth_stage1_cm: 15, root_depth_stage2_cm: 30, root_depth_stage3_cm: 50, root_depth_stage4_cm: 50,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.55, f_factor_stage4: 0.55,
  },
  {
    name: 'Algodão',
    kc_ini: 0.35, kc_mid: 1.20, kc_final: 0.60,
    stage1_days: 30, stage2_days: 50, stage3_days: 55, stage4_days: 45,
    root_depth_stage1_cm: 20, root_depth_stage2_cm: 40, root_depth_stage3_cm: 70, root_depth_stage4_cm: 70,
    f_factor_stage1: 0.65, f_factor_stage2: 0.65, f_factor_stage3: 0.65, f_factor_stage4: 0.65,
  },
  {
    name: 'Cana-de-açúcar',
    kc_ini: 0.40, kc_mid: 1.25, kc_final: 0.75,
    stage1_days: 30, stage2_days: 60, stage3_days: 180, stage4_days: 60,
    root_depth_stage1_cm: 30, root_depth_stage2_cm: 50, root_depth_stage3_cm: 80, root_depth_stage4_cm: 80,
    f_factor_stage1: 0.65, f_factor_stage2: 0.65, f_factor_stage3: 0.65, f_factor_stage4: 0.65,
  },
  {
    name: 'Tomate',
    kc_ini: 0.60, kc_mid: 1.15, kc_final: 0.80,
    stage1_days: 30, stage2_days: 40, stage3_days: 45, stage4_days: 30,
    root_depth_stage1_cm: 15, root_depth_stage2_cm: 30, root_depth_stage3_cm: 50, root_depth_stage4_cm: 50,
    f_factor_stage1: 0.40, f_factor_stage2: 0.40, f_factor_stage3: 0.40, f_factor_stage4: 0.40,
  },
  {
    name: 'Batata',
    kc_ini: 0.50, kc_mid: 1.15, kc_final: 0.75,
    stage1_days: 25, stage2_days: 30, stage3_days: 30, stage4_days: 25,
    root_depth_stage1_cm: 15, root_depth_stage2_cm: 25, root_depth_stage3_cm: 40, root_depth_stage4_cm: 40,
    f_factor_stage1: 0.35, f_factor_stage2: 0.35, f_factor_stage3: 0.35, f_factor_stage4: 0.35,
  },
  {
    name: 'Cebola',
    kc_ini: 0.70, kc_mid: 1.05, kc_final: 0.75,
    stage1_days: 15, stage2_days: 25, stage3_days: 35, stage4_days: 20,
    root_depth_stage1_cm: 10, root_depth_stage2_cm: 15, root_depth_stage3_cm: 25, root_depth_stage4_cm: 25,
    f_factor_stage1: 0.30, f_factor_stage2: 0.30, f_factor_stage3: 0.30, f_factor_stage4: 0.30,
  },
  {
    name: 'Pastagem',
    kc_ini: 0.40, kc_mid: 0.95, kc_final: 0.85,
    stage1_days: 10, stage2_days: 20, stage3_days: 180, stage4_days: 30,
    root_depth_stage1_cm: 20, root_depth_stage2_cm: 30, root_depth_stage3_cm: 40, root_depth_stage4_cm: 40,
    f_factor_stage1: 0.55, f_factor_stage2: 0.55, f_factor_stage3: 0.55, f_factor_stage4: 0.55,
  },
]
