'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, Mail, LockKeyhole, User, ArrowRight, Droplets, BarChart3, Zap } from 'lucide-react'
import IrrigaAgroLogo from '@/components/branding/IrrigaAgroLogo'

// ─── SVG Pivot Animation ──────────────────────────────────────────────────────
function PivotAnimation() {
  return (
    <svg viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      {/* Outer glow ring */}
      <circle cx="160" cy="160" r="148" stroke="rgba(0,147,208,0.08)" strokeWidth="1" />
      <circle cx="160" cy="160" r="120" stroke="rgba(0,147,208,0.06)" strokeWidth="1" strokeDasharray="4 8" />

      {/* Irrigated field sectors */}
      {/* Full circle field */}
      <circle cx="160" cy="160" r="110" fill="rgba(34,197,94,0.04)" stroke="rgba(34,197,94,0.12)" strokeWidth="1" />

      {/* Wet zones (3 wedge arcs) */}
      <path d="M160,160 L160,50 A110,110 0,0,1 255,215 Z" fill="rgba(0,147,208,0.07)" />
      <path d="M160,160 L255,215 A110,110 0,0,1 100,265 Z" fill="rgba(34,197,94,0.07)" />

      {/* Center pivot point */}
      <circle cx="160" cy="160" r="10" fill="#0093D0" opacity="0.9" />
      <circle cx="160" cy="160" r="6" fill="#fff" opacity="0.15" />
      <circle cx="160" cy="160" r="18" fill="none" stroke="#0093D0" strokeWidth="1.5" opacity="0.4" />

      {/* Rotating arm */}
      <g style={{ transformOrigin: '160px 160px', animation: 'pivotSpin 36s linear infinite' }}>
        {/* Main arm */}
        <line x1="160" y1="160" x2="160" y2="52" stroke="#0093D0" strokeWidth="2.5" strokeLinecap="round" />
        {/* Towers along arm */}
        <circle cx="160" cy="100" r="4" fill="#0093D0" opacity="0.7" />
        <circle cx="160" cy="76" r="3.5" fill="#0093D0" opacity="0.6" />
        <circle cx="160" cy="58" r="3" fill="#0093D0" opacity="0.5" />
        {/* End gun */}
        <circle cx="160" cy="52" r="5" fill="#22d3ee" opacity="0.9" />
        {/* Water spray fan */}
        <path d="M160,52 L148,32 M160,52 L154,30 M160,52 L160,28 M160,52 L166,30 M160,52 L172,32"
          stroke="#22d3ee" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"
          style={{ animation: 'sprayPulse 1.5s ease-in-out infinite' }}
        />
      </g>

      {/* Secondary arm (180° opposite, static) */}
      <g style={{ transformOrigin: '160px 160px', transform: 'rotate(127deg)', animation: 'pivotSpin 36s linear infinite' }}>
        <line x1="160" y1="160" x2="160" y2="52" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      </g>

      {/* Field rows (crop lines) */}
      {[40, 60, 80, 100, 120].map((r, i) => (
        <circle key={i} cx="160" cy="160" r={r} fill="none" stroke="rgba(34,197,94,0.05)" strokeWidth="1" strokeDasharray="2 6" />
      ))}

      {/* KPI dots scattered */}
      <circle cx="80" cy="90" r="3" fill="#f59e0b" opacity="0.6" />
      <circle cx="240" cy="100" r="2.5" fill="#22c55e" opacity="0.5" />
      <circle cx="230" cy="230" r="3" fill="#0093D0" opacity="0.5" />
      <circle cx="88" cy="220" r="2" fill="#ef4444" opacity="0.4" />

      <style>{`
        @keyframes pivotSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes sprayPulse {
          0%,100% { opacity: 0.3; }
          50%      { opacity: 0.7; }
        }
      `}</style>
    </svg>
  )
}

// ─── Google icon ──────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
      <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

// ─── Feature pill ─────────────────────────────────────────────────────────────
function FeaturePill({ icon: Icon, label, color }: { icon: typeof Droplets; label: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 99,
      background: `${color}10`, border: `1px solid ${color}20`,
    }}>
      <Icon size={13} style={{ color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]               = useState<'login' | 'signup'>('login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [name, setName]               = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null)
  const [error, setError]             = useState('')
  const [successMsg, setSuccessMsg]   = useState('')

  const supabase = createClient()

  // ── Email/password ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('E-mail ou senha incorretos. Verifique suas credenciais.')
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      })
      if (error) {
        setError(error.message.includes('already registered')
          ? 'Este e-mail já está cadastrado. Tente entrar.'
          : 'Erro ao criar conta. Tente novamente.')
        setLoading(false)
        return
      }
      setSuccessMsg('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
      setLoading(false)
    }
  }

  // ── OAuth ───────────────────────────────────────────────────────────────────
  async function handleOAuth(provider: 'google') {
    setError('')
    setOauthLoading(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError('Erro ao entrar com Google.')
      setOauthLoading(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-surface-bg)',
      display: 'flex', overflow: 'hidden', position: 'relative',
    }}>
      {/* ── Background blobs ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,147,208,0.07) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '40%', right: '35%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)' }} />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/*  LEFT PANEL — Hero visual                  */}
      {/* ═══════════════════════════════════════════ */}
      <div style={{
        flex: 1, display: 'none', flexDirection: 'column', justifyContent: 'space-between',
        padding: '48px 56px', position: 'relative', zIndex: 1,
      }}
        className="hero-panel"
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <IrrigaAgroLogo size={36} showText />
        </div>

        {/* Central visual */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
          {/* Pivot SVG */}
          <div style={{ width: 300, height: 300, position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle, rgba(0,147,208,0.12) 0%, transparent 65%)',
              borderRadius: '50%',
            }} />
            <PivotAnimation />
          </div>

          {/* Headline */}
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <h1 style={{
              fontSize: 36, fontWeight: 700, color: 'var(--color-text)',
              letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 16,
            }}>
              Manejo hídrico<br />
              <span style={{ color: '#0093D0' }}>preciso</span> e{' '}
              <span style={{ color: '#22c55e' }}>eficiente</span>
            </h1>
            <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              Software agrícola para manejo hídrico inteligente.<br />
              Controle seus pivôs, safras e irrigação em um só lugar.
            </p>
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            <FeaturePill icon={Droplets}  label="Balanço hídrico diário" color="#0093D0" />
            <FeaturePill icon={BarChart3} label="Projeção 7 dias"        color="#22c55e" />
            <FeaturePill icon={Zap}       label="Automação inteligente"  color="#f59e0b" />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>IrrigaAgro</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/*  RIGHT PANEL — Auth form                   */}
      {/* ═══════════════════════════════════════════ */}
      <div
        className="px-5 py-8 sm:px-10 sm:py-12"
        style={{
          width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          borderLeft: '1px solid rgba(255,255,255,0.05)',
          background: 'var(--color-surface-bg)',
          backdropFilter: 'blur(20px)',
          position: 'relative', zIndex: 1,
        }}>

        {/* Mobile logo */}
        <div style={{ marginBottom: 40, display: 'flex', justifyContent: 'center' }} className="mobile-logo">
          <IrrigaAgroLogo size={36} showText />
        </div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', background: 'var(--color-surface-sidebar)', borderRadius: 14,
          padding: 4, marginBottom: 32,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setSuccessMsg('') }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s',
                background: mode === m ? 'var(--color-surface-card)' : 'transparent',
                color: mode === m ? 'var(--color-text)' : 'var(--color-text-secondary)',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
              }}
            >
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
            {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {mode === 'login'
              ? 'Acesse o painel de manejo hídrico da sua operação.'
              : 'Configure seus pivôs e comece a irrigar com precisão.'}
          </p>
        </div>

        {/* Error / Success */}
        {error && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 12,
            background: 'rgb(239 68 68 / 0.08)', border: '1px solid rgb(239 68 68 / 0.2)',
            color: '#fca5a5', fontSize: 13,
          }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 12,
            background: 'rgb(34 197 94 / 0.08)', border: '1px solid rgb(34 197 94 / 0.2)',
            color: '#86efac', fontSize: 13,
          }}>
            {successMsg}
          </div>
        )}

        {/* OAuth buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {/* Google */}
          <button
            onClick={() => handleOAuth('google')}
            disabled={!!oauthLoading || loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 12, cursor: 'pointer',
              background: 'var(--color-surface-sidebar)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--color-text)', fontSize: 14, fontWeight: 500,
              opacity: oauthLoading ? 0.6 : 1, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!oauthLoading) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-elevated)' }}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-sidebar)'}
          >
            {oauthLoading === 'google' ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <GoogleIcon />}
            {mode === 'login' ? 'Entrar' : 'Cadastrar'} com Google
          </button>

        </div>

        <Divider label="ou continue com e-mail" />

        {/* Email form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>

          {/* Name — signup only */}
          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Nome completo
              </label>
              <div style={{ position: 'relative' }}>
                <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Seu nome"
                  required={mode === 'signup'}
                  style={{
                    width: '100%', padding: '12px 14px 12px 42px', borderRadius: 12, fontSize: 14,
                    background: 'var(--color-surface-sidebar)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--color-text)', outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(0,147,208,0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              E-mail
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                style={{
                  width: '100%', padding: '12px 14px 12px 42px', borderRadius: 12, fontSize: 14,
                  background: 'var(--color-surface-sidebar)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--color-text)', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(0,147,208,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <LockKeyhole size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Mínimo 8 caracteres' : '••••••••'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                style={{
                  width: '100%', padding: '12px 44px 12px 42px', borderRadius: 12, fontSize: 14,
                  background: 'var(--color-surface-sidebar)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--color-text)', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(0,147,208,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !!oauthLoading}
            style={{
              marginTop: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(135deg, #0093D0 0%, #005A8C 100%)',
              boxShadow: '0 4px 20px rgba(0,147,208,0.3)',
              opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(0,147,208,0.45)' }}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,147,208,0.3)'}
          >
            {loading
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <ArrowRight size={15} />
            }
            {loading
              ? (mode === 'login' ? 'Entrando…' : 'Criando conta…')
              : (mode === 'login' ? 'Entrar na plataforma' : 'Criar minha conta')
            }
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Ao continuar, você concorda com os termos de uso do IrrigaAgro.
        </div>
      </div>

      {/* ── Responsive styles ── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (min-width: 900px) {
          .hero-panel { display: flex !important; }
          .mobile-logo { display: none !important; }
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px var(--color-surface-sidebar) inset !important;
          -webkit-text-fill-color: var(--color-text) !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  )
}
