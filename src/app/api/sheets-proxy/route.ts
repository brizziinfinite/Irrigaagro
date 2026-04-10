import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy server-side para Google Sheets.
 * Suporta planilhas publicadas na web (/d/e/2PACX-1v...).
 * Segue redirects manualmente para evitar bloqueio no Vercel Edge.
 *
 * GET /api/sheets-proxy?sid=ID&gid=GID&pub=1
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const sid = searchParams.get('sid')
  const gid = searchParams.get('gid') ?? '0'
  const pub = searchParams.get('pub') === '1'

  if (!sid || !/^[a-zA-Z0-9_-]+$/.test(sid)) {
    return NextResponse.json({ error: 'sid inválido' }, { status: 400 })
  }

  const targetUrl = pub
    ? `https://docs.google.com/spreadsheets/d/e/${sid}/pub?output=csv&gid=${gid}&single=true`
    : `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`

  try {
    // Primeiro fetch sem seguir redirect para pegar a URL final
    const res1 = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
    })

    let finalRes: Response

    if (res1.status === 307 || res1.status === 302 || res1.status === 301) {
      const location = res1.headers.get('location')
      if (!location) {
        return NextResponse.json({ error: 'Redirect sem destino' }, { status: 502 })
      }
      // Segue o redirect manualmente
      finalRes = await fetch(location, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      })
    } else {
      finalRes = res1
    }

    if (!finalRes.ok) {
      return NextResponse.json(
        { error: `Google retornou ${finalRes.status}` },
        { status: finalRes.status }
      )
    }

    const text = await finalRes.text()
    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    })
  } catch (e) {
    return NextResponse.json({ error: `Falha: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }
}
