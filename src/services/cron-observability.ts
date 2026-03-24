import { createClient } from '@/lib/supabase/client'
import type {
  CronJobEvent,
  CronJobEventInsert,
  CronJobRun,
  CronJobRunInsert,
  CronJobRunUpdate,
} from '@/types/database'
import type { TypedSupabaseClient } from './base'

const cronJobRunsTable = (client: TypedSupabaseClient) => (client as any).from('cron_job_runs')
const cronJobEventsTable = (client: TypedSupabaseClient) => (client as any).from('cron_job_events')

function cronObservabilityError(action: string, error: { message: string }) {
  return new Error(`Falha ao ${action} observabilidade do cron: ${error.message}`)
}

export async function createCronJobRun(
  input: CronJobRunInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<CronJobRun> {
  const { data, error } = await cronJobRunsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw cronObservabilityError('criar execução da', error)
  }

  return data as CronJobRun
}

export async function updateCronJobRun(
  runId: string,
  input: CronJobRunUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<CronJobRun> {
  const { data, error } = await cronJobRunsTable(client)
    .update(input)
    .eq('id', runId)
    .select()
    .single()

  if (error) {
    throw cronObservabilityError('atualizar execução da', error)
  }

  return data as CronJobRun
}

export async function createCronJobEvent(
  input: CronJobEventInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<CronJobEvent> {
  const { data, error } = await cronJobEventsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw cronObservabilityError('registrar evento da', error)
  }

  return data as CronJobEvent
}
