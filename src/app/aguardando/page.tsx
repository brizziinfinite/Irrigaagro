'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import IrrigaAgroLogo from '@/components/branding/IrrigaAgroLogo'
import { Clock, Mail, LogOut } from 'lucide-react'

export default function AguardandoPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)

      // Verificar periodicamente se foi aprovado
      const interval = setInterval(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { clearInterval(interval); return }

        const { data: member } = await supabase
          .from('company_members')
          .select('company_id, companies(status)')
          .eq('user_id', user.id)
          .limit(1)
          .single()

        const status = (member?.companies as { status?: string } | null)?.status
        if (status === 'active') {
          clearInterval(interval)
          router.push('/dashboard')
        }
      }, 15000) // verifica a cada 15s

      return () => clearInterval(interval)
    })
  }, [router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1520',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#0f1923',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
          padding: '48px 40px',
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <IrrigaAgroLogo size={40} />
        </div>

        {/* Ícone animado */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(245,158,11,0.12)',
            border: '2px solid rgba(245,158,11,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          <Clock size={32} color="#f59e0b" />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
          Acesso em aprovação
        </h1>

        <p style={{ fontSize: 14, color: '#8899aa', lineHeight: 1.6, marginBottom: 8 }}>
          Seu cadastro foi recebido com sucesso.
          Nossa equipe está validando as informações da sua conta.
        </p>

        {email && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              margin: '20px 0',
              padding: '10px 16px',
              background: 'rgba(0,147,208,0.08)',
              borderRadius: 8,
              border: '1px solid rgba(0,147,208,0.15)',
            }}
          >
            <Mail size={14} color="#0093D0" />
            <span style={{ fontSize: 13, color: '#0093D0' }}>{email}</span>
          </div>
        )}

        <p style={{ fontSize: 13, color: '#556677', lineHeight: 1.6, marginBottom: 32 }}>
          Você receberá um e-mail assim que o acesso for liberado.
          Em geral, a validação ocorre em até 24 horas úteis.
        </p>

        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '11px 20px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent',
            color: '#8899aa',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <LogOut size={14} />
          Sair da conta
        </button>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#334455' }}>
        IrrigaAgro · Gestão inteligente de irrigação
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.95); }
        }
      `}</style>
    </div>
  )
}
