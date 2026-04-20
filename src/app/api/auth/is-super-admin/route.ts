import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isSuperAdmin } from '@/lib/super-admin'

/**
 * GET /api/auth/is-super-admin
 * Verifica server-side se o usuário autenticado é super-admin.
 * Retorna { superAdmin: boolean }
 * Os emails de admin ficam em SUPER_ADMIN_EMAILS (sem NEXT_PUBLIC_) — nunca expostos no browser.
 */
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ superAdmin: false })
  }
  return NextResponse.json({ superAdmin: isSuperAdmin(user.email) })
}
