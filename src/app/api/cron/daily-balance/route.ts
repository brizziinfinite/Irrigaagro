// ============================================================
// Cron Job — Balanço Hídrico Diário Automático
// Roda todo dia às 02:00 BRT (05:00 UTC) via Vercel Cron
// Usa a mesma cadeia oficial já consolidada no manejo manual:
// estação preferencial do pivô → estação da fazenda →
// geolocalização do pivô → fallback manual.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcDAS, computeResolvedManagementBalance } from '@/lib/calculations/management-balance'
import {
  getManagementExternalData,
  listActiveManagementSeasonContexts,
  listDailyManagementBySeason,
  upsertDailyManagementRecord,
} from '@/services/management'
import { createCronJobEvent, createCronJobRun, updateCronJobRun } from '@/services/cron-observability'
import type { TypedSupabaseClient } from '@/services/base'
import type { CronJobRunStatus, DailyManagementInsert, Json } from '@/types/database'

const CRON_JOB_NAME = 'daily-balance'

type CronResultStatus = 'ok' | 'skipped' | 'error'

interface CronSeasonResult {
  season_id: string
  season_name: string
  status: CronResultStatus
  message: string
}

function todayBRT(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().split('T')[0]
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

function getTriggerSource(req: NextRequest): string {
  return req.headers.get('x-vercel-cron') ? 'vercel_cron' : 'manual_http'
}

function getRequestId(req: NextRequest): string {
  return req.headers.get('x-vercel-id')
    ?? req.headers.get('x-request-id')
    ?? crypto.randomUUID()
}

function resolveRunStatus(errors: number, ok: number): CronJobRunStatus {
  if (errors === 0) return 'success'
  if (ok > 0) return 'partial_failure'
  return 'failed'
}

async function safeCreateRun(input: {
  supabase: TypedSupabaseClient
  triggerDate: string
  triggerSource: string
  requestId: string
  metadata: Json
}) {
  try {
    return await createCronJobRun(
      {
        job_name: CRON_JOB_NAME,
        trigger_date: input.triggerDate,
        trigger_source: input.triggerSource,
        request_id: input.requestId,
        status: 'running',
        metadata: input.metadata,
      },
      input.supabase
    )
  } catch (error) {
    console.error('[cron/daily-balance][observability][create-run]', error)
    return null
  }
}

async function safeCreateEvent(
  supabase: TypedSupabaseClient,
  runId: string | null,
  input: Parameters<typeof createCronJobEvent>[0]
) {
  if (!runId) return

  try {
    await createCronJobEvent(input, supabase)
  } catch (error) {
    console.error('[cron/daily-balance][observability][create-event]', error)
  }
}

async function safeUpdateRun(
  supabase: TypedSupabaseClient,
  runId: string | null,
  input: Parameters<typeof updateCronJobRun>[1]
) {
  if (!runId) return

  try {
    await updateCronJobRun(runId, input, supabase)
  } catch (error) {
    console.error('[cron/daily-balance][observability][update-run]', error)
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  const today = todayBRT()
  const startedAt = Date.now()
  const requestId = getRequestId(req)
  const triggerSource = getTriggerSource(req)
  const results: CronSeasonResult[] = []
  const run = await safeCreateRun({
    supabase,
    triggerDate: today,
    triggerSource,
    requestId,
    metadata: {
      path: req.nextUrl.pathname,
      method: req.method,
      user_agent: req.headers.get('user-agent'),
    },
  })
  const runId = run?.id ?? null

  try {
    const contexts = await listActiveManagementSeasonContexts(supabase)
    if (contexts.length === 0) {
      await safeCreateEvent(supabase, runId, {
        run_id: runId ?? '',
        job_name: CRON_JOB_NAME,
        event_type: 'run_note',
        status: 'success',
        message: 'Nenhuma safra ativa encontrada para processamento',
        context: {
          date: today,
        },
      })
      await safeUpdateRun(supabase, runId, {
        status: 'success',
        processed_count: 0,
        ok_count: 0,
        skipped_count: 0,
        error_count: 0,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        message: 'Nenhuma safra ativa encontrada',
      })

      return NextResponse.json({
        run_id: runId,
        message: 'Nenhuma safra ativa encontrada',
        date: today,
        processed: 0,
      })
    }

    for (const context of contexts) {
      const { season, farm, pivot, crop } = context
      const seasonLabel = `${season.name} (${farm.name})`

      try {
        const history = await listDailyManagementBySeason(season.id, supabase)
        const existing = history.find((record) => record.date === today) ?? null

        if (existing) {
          const result: CronSeasonResult = {
            season_id: season.id,
            season_name: seasonLabel,
            status: 'skipped',
            message: 'Registro já existe para hoje',
          }
          results.push(result)
          await safeCreateEvent(supabase, runId, {
            run_id: runId ?? '',
            job_name: CRON_JOB_NAME,
            event_type: 'season_skipped',
            season_id: season.id,
            season_name: seasonLabel,
            farm_id: farm.id,
            pivot_id: pivot?.id ?? null,
            status: result.status,
            message: result.message,
            climate_source: null,
            eto_source: existing.eto_source,
            rainfall_source: existing.rainfall_mm != null ? 'existing_record' : null,
            context: {
              date: today,
              existing_record_id: existing.id,
              existing_updated_at: existing.updated_at,
            },
          })
          continue
        }

        if (!pivot || !crop || !season.planting_date) {
          const result: CronSeasonResult = {
            season_id: season.id,
            season_name: seasonLabel,
            status: 'skipped',
            message: 'Sem pivô, cultura ou data de plantio vinculados',
          }
          results.push(result)
          await safeCreateEvent(supabase, runId, {
            run_id: runId ?? '',
            job_name: CRON_JOB_NAME,
            event_type: 'season_skipped',
            season_id: season.id,
            season_name: seasonLabel,
            farm_id: farm.id,
            pivot_id: pivot?.id ?? null,
            status: result.status,
            message: result.message,
            context: {
              date: today,
              has_pivot: Boolean(pivot),
              has_crop: Boolean(crop),
              planting_date: season.planting_date,
            },
          })
          continue
        }

        const externalData = await getManagementExternalData(
          farm.id,
          pivot.id,
          today,
          pivot,
          supabase
        )
        const climateSnapshot = externalData.weather ?? externalData.geolocationWeather

        if (!climateSnapshot) {
          const result: CronSeasonResult = {
            season_id: season.id,
            season_name: seasonLabel,
            status: 'error',
            message: 'Sem dados climáticos disponíveis pela cadeia oficial do manejo',
          }
          results.push(result)
          await safeCreateEvent(supabase, runId, {
            run_id: runId ?? '',
            job_name: CRON_JOB_NAME,
            event_type: 'season_error',
            season_id: season.id,
            season_name: seasonLabel,
            farm_id: farm.id,
            pivot_id: pivot.id,
            status: result.status,
            message: result.message,
            climate_source: externalData.climateSource,
            rainfall_source: externalData.rainfall?.source ?? null,
            context: {
              date: today,
              station_id: externalData.station?.id ?? null,
              station_name: externalData.station?.name ?? null,
              has_station_weather: Boolean(externalData.weather),
              has_geolocation_weather: Boolean(externalData.geolocationWeather),
              has_rainfall_record: Boolean(externalData.rainfall),
            },
          })
          continue
        }

        const result = computeResolvedManagementBalance({
          context,
          history,
          date: today,
          tmax: climateSnapshot.temp_max != null ? String(climateSnapshot.temp_max) : '',
          tmin: climateSnapshot.temp_min != null ? String(climateSnapshot.temp_min) : '',
          humidity: climateSnapshot.humidity_percent != null ? String(climateSnapshot.humidity_percent) : '',
          wind: climateSnapshot.wind_speed_ms != null ? String(climateSnapshot.wind_speed_ms) : '',
          radiation: climateSnapshot.solar_radiation_wm2 != null ? String(climateSnapshot.solar_radiation_wm2) : '',
          rainfall: '',
          actualDepth: '',
          actualSpeed: '',
          externalData,
        })

        if (!result) {
          const item: CronSeasonResult = {
            season_id: season.id,
            season_name: seasonLabel,
            status: 'error',
            message: 'Dados climáticos insuficientes para cálculo automático confiável',
          }
          results.push(item)
          await safeCreateEvent(supabase, runId, {
            run_id: runId ?? '',
            job_name: CRON_JOB_NAME,
            event_type: 'season_error',
            season_id: season.id,
            season_name: seasonLabel,
            farm_id: farm.id,
            pivot_id: pivot.id,
            status: item.status,
            message: item.message,
            climate_source: externalData.climateSource,
            rainfall_source: externalData.rainfall?.source ?? (climateSnapshot.rainfall_mm != null ? climateSnapshot.source : null),
            context: {
              date: today,
              station_id: externalData.station?.id ?? null,
              station_name: externalData.station?.name ?? null,
              climate_snapshot_source: climateSnapshot.source,
              climate_snapshot_rainfall_mm: climateSnapshot.rainfall_mm ?? null,
            },
          })
          continue
        }

        const payload: DailyManagementInsert = {
          season_id: season.id,
          date: today,
          das: result.das,
          crop_stage: result.cropStage,
          temp_max: climateSnapshot.temp_max ?? null,
          temp_min: climateSnapshot.temp_min ?? null,
          humidity_percent: climateSnapshot.humidity_percent ?? null,
          wind_speed_ms: climateSnapshot.wind_speed_ms ?? null,
          solar_radiation_wm2: climateSnapshot.solar_radiation_wm2 ?? null,
          eto_mm: result.eto,
          eto_source: result.etoSource,
          eto_confidence: result.etoConfidence,
          eto_notes: result.etoNotes,
          etc_mm: result.etc,
          rainfall_mm: externalData.rainfall?.rainfall_mm ?? climateSnapshot.rainfall_mm ?? 0,
          kc: result.kc,
          ks: result.ks,
          ctda: result.adcNew,
          cta: result.cta,
          recommended_depth_mm: result.recommendedDepthMm,
          recommended_speed_percent: result.recommendedSpeedPercent,
          field_capacity_percent: result.fieldCapacityPercent,
          needs_irrigation: result.recommendedDepthMm > 0,
          soil_moisture_calculated: result.fieldCapacityPercent,
          updated_at: new Date().toISOString(),
        }

        await upsertDailyManagementRecord(payload, supabase)

        const etoRoute =
          result.etoSource === 'weather_corrected' ? 'estação corrigida'
          : result.etoSource === 'weather_raw' ? 'estação bruta'
          : result.etoSource === 'calculated_penman_monteith' ? 'Penman-Monteith'
          : result.etoSource === 'manual' ? 'manual'
          : 'indisponível'

        const climateRoute = externalData.climateSource ?? 'manual'
        const das = calcDAS(season.planting_date, today)

        const item: CronSeasonResult = {
          season_id: season.id,
          season_name: seasonLabel,
          status: 'ok',
          message: `DAS ${das} · ETo ${result.eto.toFixed(1)} mm via ${etoRoute} · ADc ${result.fieldCapacityPercent.toFixed(0)}% · clima ${climateRoute}`,
        }
        results.push(item)
        await safeCreateEvent(supabase, runId, {
          run_id: runId ?? '',
          job_name: CRON_JOB_NAME,
          event_type: 'season_processed',
          season_id: season.id,
          season_name: seasonLabel,
          farm_id: farm.id,
          pivot_id: pivot.id,
          status: item.status,
          message: item.message,
          climate_source: climateRoute,
          eto_source: result.etoSource,
          rainfall_source: externalData.rainfall?.source ?? (climateSnapshot.rainfall_mm != null ? climateSnapshot.source : null),
          context: {
            date: today,
            station_id: externalData.station?.id ?? null,
            station_name: externalData.station?.name ?? null,
            climate_snapshot_source: climateSnapshot.source,
            rainfall_mm: payload.rainfall_mm ?? null,
            eto_mm: payload.eto_mm ?? null,
            eto_confidence: result.etoConfidence,
            eto_notes: result.etoNotes,
            recommended_depth_mm: payload.recommended_depth_mm ?? null,
            recommended_speed_percent: payload.recommended_speed_percent ?? null,
            field_capacity_percent: payload.field_capacity_percent ?? null,
          },
        })
      } catch (err) {
        const item: CronSeasonResult = {
          season_id: season.id,
          season_name: seasonLabel,
          status: 'error',
          message: serializeError(err),
        }
        results.push(item)
        await safeCreateEvent(supabase, runId, {
          run_id: runId ?? '',
          job_name: CRON_JOB_NAME,
          event_type: 'season_error',
          season_id: season.id,
          season_name: seasonLabel,
          farm_id: farm.id,
          pivot_id: pivot?.id ?? null,
          status: item.status,
          message: item.message,
          context: {
            date: today,
          },
        })
      }
    }

    const ok = results.filter((item) => item.status === 'ok').length
    const skipped = results.filter((item) => item.status === 'skipped').length
    const errors = results.filter((item) => item.status === 'error').length
    const status = resolveRunStatus(errors, ok)

    await safeUpdateRun(supabase, runId, {
      status,
      processed_count: contexts.length,
      ok_count: ok,
      skipped_count: skipped,
      error_count: errors,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      message: `Execução finalizada com ${ok} sucesso(s), ${skipped} ignorado(s) e ${errors} erro(s)`,
      metadata: {
        path: req.nextUrl.pathname,
        method: req.method,
        user_agent: req.headers.get('user-agent'),
        trigger_source: triggerSource,
        request_id: requestId,
      },
    })

    return NextResponse.json({
      run_id: runId,
      date: today,
      processed: contexts.length,
      ok,
      skipped,
      errors,
      results,
    })
  } catch (err) {
    console.error('[cron/daily-balance]', err)
    await safeUpdateRun(supabase, runId, {
      status: 'failed',
      processed_count: results.length,
      ok_count: results.filter((item) => item.status === 'ok').length,
      skipped_count: results.filter((item) => item.status === 'skipped').length,
      error_count: results.filter((item) => item.status === 'error').length,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      message: 'Execução encerrada com erro fatal',
      error_message: serializeError(err),
      metadata: {
        path: req.nextUrl.pathname,
        method: req.method,
        user_agent: req.headers.get('user-agent'),
        trigger_source: triggerSource,
        request_id: requestId,
      },
    })
    await safeCreateEvent(supabase, runId, {
      run_id: runId ?? '',
      job_name: CRON_JOB_NAME,
      event_type: 'run_note',
      status: 'error',
      message: `Erro fatal da execução: ${serializeError(err)}`,
      context: {
        date: today,
      },
    })
    return NextResponse.json(
      { run_id: runId, error: serializeError(err) },
      { status: 500 }
    )
  }
}
