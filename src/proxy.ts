import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rotas públicas — nunca verificar status aqui
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/aguardando')
  ) {
    if (user && (pathname.startsWith('/login') || pathname.startsWith('/auth'))) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Rotas protegidas — exige autenticação
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Rota /admin — apenas super-admin
  if (pathname.startsWith('/admin')) {
    const superAdminEmails = (
      process.env.SUPER_ADMIN_EMAILS ??
      process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ??
      ''
    ).split(',').map((e: string) => e.trim()).filter(Boolean)

    if (!superAdminEmails.includes(user.email ?? '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Verificar status da company (apenas rotas de app, não API)
  if (!pathname.startsWith('/api/')) {
    const { data: member } = await supabase
      .from('company_members')
      .select('company_id, companies(status)')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    const status = (member?.companies as { status?: string } | null)?.status

    if (status === 'pending' || status === 'suspended') {
      return NextResponse.redirect(new URL('/aguardando', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  // Exclui: assets estáticos, _next, API routes (protegidas pela própria lógica delas)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
