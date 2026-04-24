export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CompanyPlan = 'free' | 'pro' | 'enterprise'
export type CompanyRole = 'owner' | 'admin' | 'operator' | 'viewer'
export type WeatherSource = 'nasa' | 'google_sheets' | 'manual' | 'plugfield'
export type OperationMode = 'individual' | 'conjugated'
export type WeatherStationProvider = 'manual' | 'fieldclimate' | 'davis' | 'inmet'
export type RainfallSource = 'manual' | 'import' | 'station' | 'plugfield'
export type EnergyBillSource = 'upload' | 'whatsapp' | 'manual'

// ─── WhatsApp ─────────────────────────────────────────────────
export type WhatsAppMessageType =
  | 'irrigation_alert'
  | 'rain_forecast'
  | 'daily_summary'
  | 'status_update'
  | 'rain_report'
  | 'irrigation_confirm'
  | 'energy_bill'
  | 'manual'
  | 'unknown'

export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
export type WhatsAppMessageDirection = 'inbound' | 'outbound'

export interface WhatsAppContact {
  id: string
  company_id: string
  user_id: string | null
  phone: string
  contact_name: string
  is_active: boolean
  notification_hour: number
  language: string
  created_at: string
  updated_at: string
}

export interface WhatsAppContactInsert {
  company_id: string
  user_id?: string | null
  phone: string
  contact_name: string
  is_active?: boolean
  notification_hour?: number
  language?: string
}

export type WhatsAppContactUpdate = Partial<WhatsAppContactInsert>

export interface WhatsAppPivotSubscription {
  id: string
  contact_id: string
  pivot_id: string
  notify_irrigation: boolean
  notify_rain: boolean
  notify_status: boolean
  notify_daily_summary: boolean
  created_at: string
}

export interface WhatsAppPivotSubscriptionInsert {
  contact_id: string
  pivot_id: string
  notify_irrigation?: boolean
  notify_rain?: boolean
  notify_status?: boolean
  notify_daily_summary?: boolean
}

export type WhatsAppPivotSubscriptionUpdate = Partial<WhatsAppPivotSubscriptionInsert>

export interface WhatsAppMessageLog {
  id: string
  contact_id: string | null
  pivot_id: string | null
  direction: WhatsAppMessageDirection
  message_type: WhatsAppMessageType
  content: string | null
  raw_payload: unknown | null
  media_url: string | null
  status: WhatsAppMessageStatus
  error_message: string | null
  created_at: string
}
export type IrrigationScheduleStatus = 'planned' | 'done' | 'cancelled'
export type IrrigationCancelledReason = 'chuva' | 'quebra' | 'outro'

export interface IrrigationSchedule {
  id: string
  company_id: string
  pivot_id: string
  season_id: string
  sector_id: string | null
  date: string
  lamina_mm: number | null
  speed_percent: number | null
  start_time: string | null
  end_time: string | null
  rainfall_mm: number | null
  status: IrrigationScheduleStatus
  cancelled_reason: IrrigationCancelledReason | null
  notes: string | null
  schedule_batch_id: string | null
  created_at: string
  updated_at: string
}

export interface IrrigationScheduleInsert {
  company_id: string
  pivot_id: string
  season_id: string
  sector_id?: string | null
  date: string
  lamina_mm?: number | null
  speed_percent?: number | null
  start_time?: string | null
  end_time?: string | null
  rainfall_mm?: number | null
  status?: IrrigationScheduleStatus
  cancelled_reason?: IrrigationCancelledReason | null
  notes?: string | null
  schedule_batch_id?: string | null
}

export type IrrigationScheduleUpdate = Partial<IrrigationScheduleInsert>
export type CronJobRunStatus = 'running' | 'success' | 'partial_failure' | 'failed'
export type CronJobEventType = 'run_note' | 'season_processed' | 'season_skipped' | 'season_error'

export interface PivotWeatherConfig {
  spreadsheet_id?: string
  gid?: string
  station_id?: string
  plugfield_device_id?: number | string
  plugfield_token?: string
  plugfield_api_key?: string
  refresh_interval_min?: number
}

export interface Company {
  id: string
  name: string
  slug: string
  plan: CompanyPlan
  created_at: string
  updated_at: string
}

export interface CompanyInsert {
  name: string
  slug: string
  plan?: CompanyPlan
}

export type CompanyUpdate = Partial<CompanyInsert>

export interface CompanyMember {
  id: string
  company_id: string
  user_id: string
  role: CompanyRole
  created_at: string
}

export interface CompanyMemberInsert {
  company_id: string
  user_id: string
  role?: CompanyRole
}

export type CompanyMemberUpdate = Partial<CompanyMemberInsert>

export interface Farm {
  id: string
  company_id: string
  name: string
  // Identificação
  document_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  // Localização
  cep: string | null
  address: string | null
  city: string | null
  state_uf: string | null
  latitude_degrees: number | null
  latitude_minutes: number | null
  hemisphere: 'N' | 'S' | null
  longitude: number | null
  altitude: number | null
  area_m2: number | null
  // Observações
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FarmInsert {
  company_id: string
  name: string
  document_number?: string | null
  owner_name?: string | null
  owner_email?: string | null
  owner_phone?: string | null
  cep?: string | null
  address?: string | null
  city?: string | null
  state_uf?: string | null
  latitude_degrees?: number | null
  latitude_minutes?: number | null
  hemisphere?: 'N' | 'S' | null
  longitude?: number | null
  altitude?: number | null
  area_m2?: number | null
  notes?: string | null
}

export type FarmUpdate = Partial<FarmInsert>

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
  length_m: number | null
  time_360_h: number | null
  latitude: number | null
  longitude: number | null
  weather_source: WeatherSource | null
  weather_config: PivotWeatherConfig | null
  alert_threshold_percent: number | null
  sector_start_deg: number | null
  sector_end_deg: number | null
  operation_mode: OperationMode
  paired_pivot_id: string | null
  return_interval_days: number
  preferred_speed_percent: number | null
  min_speed_percent: number | null
  rs_correction_factor: number | null
  rs_factor_updated_at: string | null
  rs_factor_sample_days: number | null
  field_capacity: number | null
  wilting_point: number | null
  bulk_density: number | null
  f_factor: number | null
  irrigation_target_percent: number | null
}

export interface PivotInsert {
  farm_id: string
  name: string
  flow_rate_m3h?: number | null
  emitter_spacing_m?: number | null
  first_emitter_spacing_m?: number | null
  last_tower_length_m?: number | null
  overhang_length_m?: number | null
  last_tower_speed_mh?: number | null
  cuc_percent?: number | null
  length_m?: number | null
  time_360_h?: number | null
  latitude?: number | null
  longitude?: number | null
  weather_source?: WeatherSource | null
  weather_config?: PivotWeatherConfig | null
  alert_threshold_percent?: number | null
  sector_start_deg?: number | null
  sector_end_deg?: number | null
  operation_mode?: OperationMode
  paired_pivot_id?: string | null
  return_interval_days?: number
  preferred_speed_percent?: number | null
  min_speed_percent?: number | null
  field_capacity?: number | null
  wilting_point?: number | null
  bulk_density?: number | null
  f_factor?: number | null
  irrigation_target_percent?: number | null
}

export type PivotUpdate = Partial<PivotInsert>

export interface SpeedTableRow {
  speed_percent: number
  water_depth_mm: number
  duration_hours: number
}

export interface PivotSpeedEntry {
  id: string
  pivot_id: string
  speed_percent: number
  water_depth_mm: number
  duration_hours: number
}

export interface PivotSpeedEntryInsert {
  pivot_id: string
  speed_percent: number
  water_depth_mm: number
  duration_hours: number
}

export type PivotSpeedEntryUpdate = Partial<PivotSpeedEntryInsert>

export interface Season {
  id: string
  farm_id: string
  pivot_id: string | null
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
  crop_id: string | null
  planting_date: string | null
  field_capacity: number | null
  wilting_point: number | null
  bulk_density: number | null
  f_factor: number | null
  initial_adc_percent: number | null
  notes: string | null
}

export interface SeasonInsert {
  farm_id: string
  name: string
  pivot_id?: string | null
  crop_id?: string | null
  planting_date?: string | null
  field_capacity?: number | null
  wilting_point?: number | null
  bulk_density?: number | null
  f_factor?: number | null
  initial_adc_percent?: number | null
  notes?: string | null
  is_active?: boolean
}

export type SeasonUpdate = Partial<SeasonInsert>

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

export interface SoilTypeInsert {
  name: string
  infiltration?: number | null
  porosity?: number | null
  bulk_density?: number | null
  field_capacity?: number | null
  wilting_point?: number | null
  available_water?: number | null
}

export type SoilTypeUpdate = Partial<SoilTypeInsert>

export interface SoilConfig {
  id: string
  season_id: string
  soil_type_id: string | null
  field_capacity: number | null
  wilting_point: number | null
  f_factor: number | null
  root_depth_cm: number | null
  created_at: string
  bulk_density: number | null
}

export interface SoilConfigInsert {
  season_id: string
  soil_type_id?: string | null
  field_capacity?: number | null
  wilting_point?: number | null
  f_factor?: number | null
  root_depth_cm?: number | null
  bulk_density?: number | null
}

export type SoilConfigUpdate = Partial<SoilConfigInsert>

export interface Crop {
  id: string
  company_id: string | null
  name: string
  kc_ini: number | null
  kc_mid: number | null
  kc_final: number | null
  total_cycle_days: number | null
  created_at: string
  stage1_days: number | null
  stage2_days: number | null
  stage3_days: number | null
  stage4_days: number | null
  root_depth_stage1_cm: number | null
  root_depth_stage2_cm: number | null
  root_depth_stage3_cm: number | null
  root_depth_stage4_cm: number | null
  root_initial_depth_cm: number | null
  root_growth_rate_cm_day: number | null
  root_start_das: number | null
  f_factor_stage1: number | null
  f_factor_stage2: number | null
  f_factor_stage3: number | null
  f_factor_stage4: number | null
}

export interface CropInsert {
  name: string
  company_id?: string | null
  kc_ini?: number | null
  kc_mid?: number | null
  kc_final?: number | null
  total_cycle_days?: number | null
  stage1_days?: number | null
  stage2_days?: number | null
  stage3_days?: number | null
  stage4_days?: number | null
  root_depth_stage1_cm?: number | null
  root_depth_stage2_cm?: number | null
  root_depth_stage3_cm?: number | null
  root_depth_stage4_cm?: number | null
  root_initial_depth_cm?: number | null
  root_growth_rate_cm_day?: number | null
  root_start_das?: number | null
  f_factor_stage1?: number | null
  f_factor_stage2?: number | null
  f_factor_stage3?: number | null
  f_factor_stage4?: number | null
}

export type CropUpdate = Partial<CropInsert>

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

export interface CropConfigInsert {
  season_id: string
  planting_date: string
  crop_id?: string | null
  stage1_duration?: number
  stage2_duration?: number
  stage3_duration?: number
  stage4_duration?: number
  kc_ini?: number
  kc_mid?: number
  kc_final?: number
}

export type CropConfigUpdate = Partial<CropConfigInsert>

export interface WeatherStation {
  id: string
  farm_id: string
  name: string
  device_id: string | null
  api_provider: WeatherStationProvider
  created_at: string
  rs_correction_factor: number | null
  rs_factor_updated_at: string | null
  rs_factor_sample_days: number | null
}

export interface WeatherStationInsert {
  farm_id: string
  name: string
  device_id?: string | null
  api_provider?: WeatherStationProvider
}

export type WeatherStationUpdate = Partial<WeatherStationInsert>

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
  eto_plugfield_mm: number | null
  rs_source: string | null
  source: string
  raw_data: Json | null
  created_at: string
}

export interface WeatherDataInsert {
  station_id: string
  date: string
  temp_max?: number | null
  temp_min?: number | null
  humidity_percent?: number | null
  wind_speed_ms?: number | null
  solar_radiation_wm2?: number | null
  rainfall_mm?: number | null
  eto_mm?: number | null
  eto_corrected_mm?: number | null
  eto_plugfield_mm?: number | null
  rs_source?: string | null
  source?: string
  raw_data?: Json | null
}

export type WeatherDataUpdate = Partial<WeatherDataInsert>

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
  sector_id: string | null
  created_at: string
  updated_at: string
}

export interface DailyManagementInsert {
  season_id: string
  date: string
  das?: number | null
  crop_stage?: number | null
  temp_max?: number | null
  temp_min?: number | null
  humidity_percent?: number | null
  wind_speed_ms?: number | null
  solar_radiation_wm2?: number | null
  eto_mm?: number | null
  etc_mm?: number | null
  rainfall_mm?: number | null
  kc?: number | null
  ks?: number | null
  ctda?: number | null
  cta?: number | null
  irn_mm?: number | null
  itn_mm?: number | null
  recommended_speed_percent?: number | null
  recommended_depth_mm?: number | null
  field_capacity_percent?: number | null
  needs_irrigation?: boolean
  actual_speed_percent?: number | null
  actual_depth_mm?: number | null
  irrigation_start?: string | null
  irrigation_end?: string | null
  irrigation_duration_hours?: number | null
  soil_moisture_measured?: number | null
  soil_moisture_calculated?: number | null
  cost_per_mm_alq?: number | null
  cost_per_mm_ha?: number | null
  energy_kwh?: number | null
  sector_id?: string | null
  updated_at?: string
}

export type DailyManagementUpdate = Partial<DailyManagementInsert>

export interface PivotSector {
  id: string
  pivot_id: string
  name: string
  angle_start: number | null
  angle_end: number | null
  area_ha: number | null
  soil_type: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PivotSectorInsert {
  pivot_id: string
  name: string
  angle_start?: number | null
  angle_end?: number | null
  area_ha?: number | null
  soil_type?: string | null
  notes?: string | null
  sort_order?: number
}

export type PivotSectorUpdate = Partial<PivotSectorInsert>

export interface RainfallRecord {
  id: string
  pivot_id: string
  date: string
  rainfall_mm: number
  source: RainfallSource
  notes: string | null
  sector_id: string | null
  created_at: string
  updated_at: string
}

export interface RainfallRecordInsert {
  pivot_id: string
  date: string
  rainfall_mm?: number
  source?: RainfallSource
  notes?: string | null
  sector_id?: string | null
  updated_at?: string
}

export type RainfallRecordUpdate = Partial<RainfallRecordInsert>

export interface EnergyBill {
  id: string
  pivot_id: string
  reference_month: string
  month: string
  kwh_total: number | null
  cost_total_brl: number | null
  kwh_reserved: number | null
  cost_reserved_brl: number | null
  reserved_percent: number | null
  kwh_peak: number | null
  cost_peak_brl: number | null
  kwh_offpeak: number | null
  cost_offpeak_brl: number | null
  reactive_kvarh: number | null
  cost_reactive_brl: number | null
  reactive_percent: number | null
  contracted_demand_kw: number | null
  measured_demand_kw: number | null
  demand_exceeded_brl: number | null
  power_factor: number | null
  cost_per_mm_ha: number | null
  source: EnergyBillSource
  raw_text: string | null
  created_at: string
  updated_at: string
}

export interface EnergyBillInsert {
  pivot_id: string
  reference_month: string
  kwh_total?: number | null
  cost_total_brl?: number | null
  kwh_reserved?: number | null
  cost_reserved_brl?: number | null
  kwh_peak?: number | null
  cost_peak_brl?: number | null
  kwh_offpeak?: number | null
  cost_offpeak_brl?: number | null
  reactive_kvarh?: number | null
  cost_reactive_brl?: number | null
  contracted_demand_kw?: number | null
  measured_demand_kw?: number | null
  demand_exceeded_brl?: number | null
  power_factor?: number | null
  cost_per_mm_ha?: number | null
  source?: EnergyBillSource
  raw_text?: string | null
}

export type EnergyBillUpdate = Partial<EnergyBillInsert>

export interface CronJobRun {
  id: string
  job_name: string
  trigger_date: string
  trigger_source: string
  request_id: string | null
  status: CronJobRunStatus
  processed_count: number
  ok_count: number
  skipped_count: number
  error_count: number
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  message: string | null
  error_message: string | null
  metadata: Json | null
  created_at: string
  updated_at: string
}

export interface CronJobRunInsert {
  job_name: string
  trigger_date: string
  trigger_source?: string
  request_id?: string | null
  status?: CronJobRunStatus
  processed_count?: number
  ok_count?: number
  skipped_count?: number
  error_count?: number
  started_at?: string
  completed_at?: string | null
  duration_ms?: number | null
  message?: string | null
  error_message?: string | null
  metadata?: Json | null
}

export type CronJobRunUpdate = Partial<CronJobRunInsert>

export interface CronJobEvent {
  id: string
  run_id: string
  job_name: string
  event_type: CronJobEventType
  season_id: string | null
  season_name: string | null
  farm_id: string | null
  pivot_id: string | null
  status: string
  message: string
  climate_source: string | null
  eto_source: string | null
  rainfall_source: string | null
  context: Json | null
  created_at: string
}

export interface CronJobEventInsert {
  run_id: string
  job_name: string
  event_type: CronJobEventType
  season_id?: string | null
  season_name?: string | null
  farm_id?: string | null
  pivot_id?: string | null
  status: string
  message: string
  climate_source?: string | null
  eto_source?: string | null
  rainfall_source?: string | null
  context?: Json | null
}

export type CronJobEventUpdate = Partial<CronJobEventInsert>

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: CompanyInsert
        Update: CompanyUpdate
      }
      company_members: {
        Row: CompanyMember
        Insert: CompanyMemberInsert
        Update: CompanyMemberUpdate
      }
      farms: {
        Row: Farm
        Insert: FarmInsert
        Update: FarmUpdate
      }
      pivots: {
        Row: Pivot
        Insert: PivotInsert
        Update: PivotUpdate
      }
      pivot_speed_table: {
        Row: PivotSpeedEntry
        Insert: PivotSpeedEntryInsert
        Update: PivotSpeedEntryUpdate
      }
      pivot_sectors: {
        Row: PivotSector
        Insert: PivotSectorInsert
        Update: PivotSectorUpdate
      }
      seasons: {
        Row: Season
        Insert: SeasonInsert
        Update: SeasonUpdate
      }
      soil_types: {
        Row: SoilType
        Insert: SoilTypeInsert
        Update: SoilTypeUpdate
      }
      soil_configs: {
        Row: SoilConfig
        Insert: SoilConfigInsert
        Update: SoilConfigUpdate
      }
      crops: {
        Row: Crop
        Insert: CropInsert
        Update: CropUpdate
      }
      crop_configs: {
        Row: CropConfig
        Insert: CropConfigInsert
        Update: CropConfigUpdate
      }
      weather_stations: {
        Row: WeatherStation
        Insert: WeatherStationInsert
        Update: WeatherStationUpdate
      }
      weather_data: {
        Row: WeatherData
        Insert: WeatherDataInsert
        Update: WeatherDataUpdate
      }
      daily_management: {
        Row: DailyManagement
        Insert: DailyManagementInsert
        Update: DailyManagementUpdate
      }
      rainfall_records: {
        Row: RainfallRecord
        Insert: RainfallRecordInsert
        Update: RainfallRecordUpdate
      }
      energy_bills: {
        Row: EnergyBill
        Insert: EnergyBillInsert
        Update: EnergyBillUpdate
      }
      cron_job_runs: {
        Row: CronJobRun
        Insert: CronJobRunInsert
        Update: CronJobRunUpdate
      }
      cron_job_events: {
        Row: CronJobEvent
        Insert: CronJobEventInsert
        Update: CronJobEventUpdate
      }
    }
    Views: Record<string, never>
    Functions: {
      get_user_company_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type PublicTables = Database['public']['Tables']
export type TableName = keyof PublicTables
export type TableRow<T extends TableName> = PublicTables[T]['Row']
export type TableInsert<T extends TableName> = PublicTables[T]['Insert']
export type TableUpdate<T extends TableName> = PublicTables[T]['Update']

export interface PivotWithFarm extends Pivot {
  farms: Pick<Farm, 'id' | 'name'>
}

export interface SeasonWithPivot extends Season {
  pivots: Pick<Pivot, 'id' | 'name'> | null
  farms: Pick<Farm, 'id' | 'name'>
}

export type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho'

export interface PivotIrrigationSummary {
  pivot: Pivot
  farm: Pick<Farm, 'id' | 'name'>
  activeSeason: Season | null
  lastManagement: DailyManagement | null
  status: IrrigationStatus
  fieldCapacityPercent: number | null
}
