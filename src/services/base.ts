import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TableInsert, TableName, TableRow, TableUpdate } from '@/types/database'

export type TypedSupabaseClient = SupabaseClient<Database>

export function getTable<T extends TableName>(client: TypedSupabaseClient, table: T) {
  return client.from(table)
}

export function unwrapData<T>(data: T | null, error: { message: string } | null | undefined, message: string): T {
  if (error) {
    throw new Error(`${message}: ${error.message}`)
  }

  if (data == null) {
    throw new Error(message)
  }

  return data
}

export type ServiceRow<T extends TableName> = TableRow<T>
export type ServiceInsert<T extends TableName> = TableInsert<T>
export type ServiceUpdate<T extends TableName> = TableUpdate<T>
