import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { isSuperAdmin } from '@/lib/super-admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const superAdmin = isSuperAdmin(user.email)

  return <AppShell user={user} isSuperAdmin={superAdmin}>{children}</AppShell>
}
