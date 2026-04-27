import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { redirect } from 'next/navigation'
import { AdminClient } from './AdminClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isSuperAdmin(user.email)) {
    redirect('/dashboard')
  }

  // Buscar todas as companies com owner e stats
  const { data: companies } = await supabase
    .from('companies')
    .select(`
      id,
      name,
      status,
      created_at,
      company_members(
        user_id,
        role,
        users:user_id(email)
      )
    `)
    .order('created_at', { ascending: false })

  return <AdminClient companies={companies ?? []} />
}
