import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Nome do cookie que cacheia o status da company — evita query ao banco em cada request.
// Válido por 5 minutos. Quando o admin muda o status, a API invalida o cookie.
const COMPANY_STATUS_COOKIE = 'co_status'
const COMPANY_STATUS_TTL_SECONDS = 300

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname.startsWith('/icons/')
  ) {
    return NextResponse.next()
  }

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

  // getUser() valida o JWT localmente — sem round-trip ao banco na maioria dos casos
  const { data: { user } } = await supabase.auth.getUser()

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
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? '')
      .split(',').map((e: string) => e.trim()).filter(Boolean)

    if (!superAdminEmails.includes(user.email ?? '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Verificar status da company (apenas rotas de app, não API)
  // Usa cookie de cache para evitar query ao Supabase em cada navegação.
  if (!pathname.startsWith('/api/')) {
    const cachedStatus = request.cookies.get(COMPANY_STATUS_COOKIE)?.value

    let status: string | undefined = cachedStatus

    if (!cachedStatus) {
      // Cache miss — busca no banco e grava o cookie
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id, companies(status)')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      status = (member?.companies as { status?: string } | null)?.status

      if (status) {
        supabaseResponse.cookies.set(COMPANY_STATUS_COOKIE, status, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: COMPANY_STATUS_TTL_SECONDS,
          path: '/',
        })
      }
    }

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

// Exporta constante para uso na API de admin ao invalidar o cookie
export { COMPANY_STATUS_COOKIE }
