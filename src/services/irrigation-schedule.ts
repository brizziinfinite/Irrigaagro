import { createClient } from '@/lib/supabase/client'
import type {
  IrrigationSchedule,
  IrrigationScheduleInsert,
  IrrigationScheduleUpdate,
  IrrigationCancelledReason,
} from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(client: any = createClient()) {
  return client.from('irrigation_schedule')
}

/** Busca programações de um pivô em um intervalo de datas */
export async function listSchedulesByPivot(
  pivotId: string,
  from: string,
  to: string,
): Promise<IrrigationSchedule[]> {
  const { data, error } = await table()
    .select('*')
    .eq('pivot_id', pivotId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (error) throw new Error(`Falha ao buscar programação: ${error.message}`)
  return (data ?? []) as IrrigationSchedule[]
}

/** Busca todas as programações de uma empresa em um intervalo */
export async function listSchedulesByCompany(
  companyId: string,
  from: string,
  to: string,
): Promise<IrrigationSchedule[]> {
  const { data, error } = await table()
    .select('*')
    .eq('company_id', companyId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (error) throw new Error(`Falha ao buscar programações: ${error.message}`)
  return (data ?? []) as IrrigationSchedule[]
}

/**
 * Busca a lâmina planejada/executada para um pivô em uma data específica.
 * Retorna null se não houver registro ou se estiver cancelado.
 * Aceita cliente externo (service role para uso no cron).
 */
export async function getScheduledIrrigationForDate(
  pivotId: string,
  date: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Promise<IrrigationSchedule | null> {
  const { data, error } = await table(client)
    .select('*')
    .eq('pivot_id', pivotId)
    .eq('date', date)
    .in('status', ['planned', 'done'])
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar programação: ${error.message}`)
  return data as IrrigationSchedule | null
}

/** Cria ou atualiza (upsert) um agendamento (pivot_id + date = unique) */
export async function upsertSchedule(
  input: IrrigationScheduleInsert,
): Promise<IrrigationSchedule> {
  const { data, error } = await table()
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'pivot_id,date' })
    .select()
    .single()

  if (error) throw new Error(`Falha ao salvar programação: ${error.message}`)
  return data as IrrigationSchedule
}

/** Cancela um agendamento com motivo */
export async function cancelSchedule(
  id: string,
  reason: IrrigationCancelledReason,
  notes?: string,
): Promise<IrrigationSchedule> {
  const update: IrrigationScheduleUpdate = {
    status: 'cancelled',
    cancelled_reason: reason,
    notes: notes ?? null,
  }
  const { data, error } = await table()
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Falha ao cancelar programação: ${error.message}`)
  return data as IrrigationSchedule
}

/** Marca um agendamento como executado (done) */
export async function confirmSchedule(id: string): Promise<IrrigationSchedule> {
  const { data, error } = await table()
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Falha ao confirmar programação: ${error.message}`)
  return data as IrrigationSchedule
}
