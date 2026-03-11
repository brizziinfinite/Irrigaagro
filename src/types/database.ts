export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Company, 'id'>>
      }
      company_members: {
        Row: CompanyMember
        Insert: Omit<CompanyMember, 'id' | 'created_at'>
        Update: Partial<Omit<CompanyMember, 'id'>>
      }
      farms: {
        Row: Farm
        Insert: Omit<Farm, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Farm, 'id'>>
      }
      pivots: {
        Row: Pivot
        Insert: Omit<Pivot, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Pivot, 'id'>>
      }
      pivot_speed_table: {
        Row: PivotSpeedEntry
        Insert: Omit<PivotSpeedEntry, 'id'>
        Update: Partial<Omit<PivotSpeedEntry, 'id'>>
      }
      seasons: {
        Row: Season
        Insert: Omit<Season, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Season, 'id'>>
      }
      soil_types: {
        Row: SoilType
        Insert: Omit<SoilType, 'id'>
        Update: Partial<Omit<SoilType, 'id'>>
      }
      soil_configs: {
        Row: SoilConfig
        Insert: Omit<SoilConfig, 'id' | 'created_at'>
        Update: Partial<Omit<SoilConfig, 'id'>>
      }
      crops: {
        Row: Crop
        Insert: Omit<Crop, 'id' | 'created_at'>
        Update: Partial<Omit<Crop, 'id'>>
      }
      crop_configs: {
        Row: CropConfig
        Insert: Omit<CropConfig, 'id' | 'created_at'>
        Update: Partial<Omit<CropConfig, 'id'>>
      }
      weather_stations: {
        Row: WeatherStation
        Insert: Omit<WeatherStation, 'id' | 'created_at'>
        Update: Partial<Omit<WeatherStation, 'id'>>
      }
      weather_data: {
        Row: WeatherData
        Insert: Omit<WeatherData, 'id' | 'created_at'>
        Update: Partial<Omit<WeatherData, 'id'>>
      }
      daily_management: {
        Row: DailyManagement
        Insert: Omit<DailyManagement, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DailyManagement, 'id'>>
      }
    }
  }
}

export interface Company {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'enterprise'
  created_at: string
  updated_at: string
}

export interface CompanyMember {
  id: string
  company_id: string
  user_id: string
  role: 'owner' | 'admin' | 'operator' | 'viewer'
  created_at: string
}

export interface Farm {
  id: string
  company_id: string
  name: string
  latitude_degrees: number | null
  latitude_minutes: number | null
  hemisphere: 'N' | 'S' | null
  altitude: number | null
  area_m2: number | null
  created_at: string
  updated_at: string
}

export interface Pivot {
  id: string
  farm_id: string
  name: string
  flow_rate_m3h: number | null
  emitter_spacing_m: number | null
  first_emitter_spacing_m: number | null
  last_tower_length_m: number | null
  overhang_length_m: number | null
  last_tower_speed_mh: number | null
  cuc_percent: number | null
  created_at: string
  updated_at: string
}

export interface PivotSpeedEntry {
  id: string
  pivot_id: string
  speed_percent: number
  water_depth_mm: number
  duration_hours: number
}

export interface Season {
  id: string
  farm_id: string
  pivot_id: string | null
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SoilType {
  id: string
  name: string
  infiltration: number | null
  porosity: number | null
  bulk_density: number | null
  field_capacity: number | null
  wilting_point: number | null
  available_water: number | null
}

export interface SoilConfig {
  id: string
  season_id: string
  soil_type_id: string | null
  field_capacity: number | null
  wilting_point: number | null
  f_factor: number | null
  root_depth_cm: number | null
  created_at: string
}

export interface Crop {
  id: string
  company_id: string | null
  name: string
  kc_ini: number | null
  kc_mid: number | null
  kc_final: number | null
  total_cycle_days: number | null
  created_at: string
}

export interface CropConfig {
  id: string
  season_id: string
  crop_id: string | null
  planting_date: string
  stage1_duration: number
  stage2_duration: number
  stage3_duration: number
  stage4_duration: number
  kc_ini: number
  kc_mid: number
  kc_final: number
  created_at: string
}

export interface WeatherStation {
  id: string
  farm_id: string
  name: string
  device_id: string | null
  api_provider: 'manual' | 'fieldclimate' | 'davis' | 'inmet'
  created_at: string
}

export interface WeatherData {
  id: string
  station_id: string
  date: string
  temp_max: number | null
  temp_min: number | null
  humidity_percent: number | null
  wind_speed_ms: number | null
  solar_radiation_wm2: number | null
  rainfall_mm: number | null
  eto_mm: number | null
  eto_corrected_mm: number | null
  source: string
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface DailyManagement {
  id: string
  season_id: string
  date: string
  das: number | null
  crop_stage: number | null
  temp_max: number | null
  temp_min: number | null
  humidity_percent: number | null
  wind_speed_ms: number | null
  solar_radiation_wm2: number | null
  eto_mm: number | null
  etc_mm: number | null
  rainfall_mm: number | null
  kc: number | null
  ks: number | null
  ctda: number | null
  cta: number | null
  irn_mm: number | null
  itn_mm: number | null
  recommended_speed_percent: number | null
  recommended_depth_mm: number | null
  field_capacity_percent: number | null
  needs_irrigation: boolean
  actual_speed_percent: number | null
  actual_depth_mm: number | null
  irrigation_start: string | null
  irrigation_end: string | null
  irrigation_duration_hours: number | null
  soil_moisture_measured: number | null
  soil_moisture_calculated: number | null
  cost_per_mm_alq: number | null
  cost_per_mm_ha: number | null
  energy_kwh: number | null
  created_at: string
  updated_at: string
}
