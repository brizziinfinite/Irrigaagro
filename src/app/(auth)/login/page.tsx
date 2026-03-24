'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Droplets, Eye, EyeOff, Loader2 } from 'lucide-react'

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-surface-bg)' }}>
      {/* Card */}
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: '#0093D0' }}>
            <Droplets size={26} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>IrrigaAgro</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Irrigação de Precisão</p>
        </div>

        {/* Form */}
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 0 0 1px rgb(255 255 255 / 0.04)' }}>
          <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-text)' }}>Entrar na sua conta</h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text)',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--color-green-400)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-surface-border)'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text)',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--color-green-400)'}
                  onBlur={e => e.target.style.borderColor = 'var(--color-surface-border)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60 mt-1"
              style={{ background: '#0093D0' }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--color-text-faint)' }}>
          IrrigaAgro v2 · Balanço Hídrico FAO-56
        </p>
      </div>
    </div>
  )
}
