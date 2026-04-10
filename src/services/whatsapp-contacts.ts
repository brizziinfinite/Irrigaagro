import { createClient } from '@/lib/supabase/client'
import type {
  WhatsAppContact,
  WhatsAppContactInsert,
  WhatsAppContactUpdate,
  WhatsAppPivotSubscription,
  WhatsAppPivotSubscriptionInsert,
  WhatsAppPivotSubscriptionUpdate,
} from '@/types/database'
import type { TypedSupabaseClient } from './base'

const contactsTable = (client: TypedSupabaseClient) => (client as any).from('whatsapp_contacts')
const subsTable = (client: TypedSupabaseClient) => (client as any).from('whatsapp_pivot_subscriptions')

// ─── Contacts ────────────────────────────────────────────────

export async function listContactsByCompany(
  companyId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WhatsAppContact[]> {
  const { data, error } = await contactsTable(client)
    .select('*')
    .eq('company_id', companyId)
    .order('contact_name')

  if (error) throw new Error(`Falha ao listar contatos: ${error.message}`)
  return (data ?? []) as WhatsAppContact[]
}

export async function createContact(
  input: WhatsAppContactInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WhatsAppContact> {
  const { data, error } = await contactsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) throw new Error(`Falha ao criar contato: ${error.message}`)
  return data as WhatsAppContact
}

export async function updateContact(
  id: string,
  input: WhatsAppContactUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WhatsAppContact> {
  const { data, error } = await contactsTable(client)
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Falha ao atualizar contato: ${error.message}`)
  return data as WhatsAppContact
}

export async function deleteContact(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await contactsTable(client).delete().eq('id', id)
  if (error) throw new Error(`Falha ao excluir contato: ${error.message}`)
}

// ─── Subscriptions ───────────────────────────────────────────

export interface SubscriptionWithPivot extends WhatsAppPivotSubscription {
  pivots: { id: string; name: string; farms: { name: string } | null } | null
}

export async function listSubscriptionsByContact(
  contactId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<SubscriptionWithPivot[]> {
  const { data, error } = await subsTable(client)
    .select('*, pivots(id, name, farms(name))')
    .eq('contact_id', contactId)

  if (error) throw new Error(`Falha ao listar assinaturas: ${error.message}`)
  return (data ?? []) as SubscriptionWithPivot[]
}

export async function upsertSubscription(
  input: WhatsAppPivotSubscriptionInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WhatsAppPivotSubscription> {
  const { data, error } = await subsTable(client)
    .upsert(input, { onConflict: 'contact_id,pivot_id' })
    .select()
    .single()

  if (error) throw new Error(`Falha ao salvar assinatura: ${error.message}`)
  return data as WhatsAppPivotSubscription
}

export async function deleteSubscription(
  contactId: string,
  pivotId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await subsTable(client)
    .delete()
    .eq('contact_id', contactId)
    .eq('pivot_id', pivotId)

  if (error) throw new Error(`Falha ao remover assinatura: ${error.message}`)
}
