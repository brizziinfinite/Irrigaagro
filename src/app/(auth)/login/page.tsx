'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react'
import IrrigaAgroHero from '@/components/branding/IrrigaAgroHero'
import IrrigaAgroLogo from '@/components/branding/IrrigaAgroLogo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-surface-bg)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#080e14_0%,#0b1118_100%)]" />
        <div className="absolute left-[8%] top-[10%] h-56 w-56 rounded-full bg-sky-500/6 blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1320px] items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid w-full items-stretch gap-6 lg:grid-cols-[minmax(0,0.95fr)_520px] lg:gap-10">
          <IrrigaAgroHero />

          <div className="flex items-center justify-center">
            <div className="w-full max-w-[520px]">
              <div className="mb-8 flex justify-center lg:justify-start">
                <IrrigaAgroLogo size={52} showText className="text-[1.9rem]" />
              </div>

              <div className="rounded-[30px] border border-white/7 bg-[rgba(15,25,35,0.82)] p-6 shadow-[0_28px_70px_-42px_rgba(0,0,0,0.95)] backdrop-blur-md sm:p-8 lg:p-9">
                <div className="mb-8 space-y-4">
                  <div className="inline-flex items-center rounded-full border border-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Acesso à plataforma
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] sm:text-[2.35rem]">
                      Entrar na sua conta
                    </h1>
                    <p className="max-w-[400px] text-sm leading-6 text-[var(--color-text-muted)]">
                      Entre para acessar o ambiente operacional do IrrigaAgro com seus dados de manejo, pivôs e safras.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                      E-mail
                    </label>
                    <div className="group relative">
                      <Mail
                        size={16}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] transition-colors group-focus-within:text-sky-300"
                      />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        placeholder="seu@email.com"
                        className="w-full rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.025)] py-3.5 pl-11 pr-4 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-faint)] focus:border-sky-400/40 focus:bg-[rgba(255,255,255,0.04)] focus:shadow-[0_0_0_4px_rgba(56,189,248,0.06)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                      Senha
                    </label>
                    <div className="group relative">
                      <LockKeyhole
                        size={16}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] transition-colors group-focus-within:text-emerald-300"
                      />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.025)] py-3.5 pl-11 pr-12 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-faint)] focus:border-emerald-400/40 focus:bg-[rgba(255,255,255,0.04)] focus:shadow-[0_0_0_4px_rgba(74,222,128,0.06)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0ea5e9,#0284c7_64%,#0d7bb0)] px-4 py-3.5 text-sm font-semibold text-white transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>

                <div className="mt-6 flex flex-col gap-2 border-t border-white/6 pt-5 text-xs text-[var(--color-text-faint)] sm:flex-row sm:items-center sm:justify-between">
                  <span>Acesso protegido</span>
                  <span>IrrigaAgro v2 · Balanço Hídrico FAO-56</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
