'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Droplets, Sprout, Sun } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

type AuthMode = 'login' | 'register'

export function Login() {
  const router = useRouter()
  const { signIn, signUp, loading, error: authError } = useAuth()

  const [mode, setMode] = useState<AuthMode>('login')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Login form state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('')
  const [registerFullName, setRegisterFullName] = useState('')

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!loginEmail || !loginPassword) {
      setFormError('Por favor, preencha todos os campos')
      return
    }

    try {
      setIsSubmitting(true)
      await signIn(loginEmail, loginPassword)
      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao fazer login'
      setFormError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!registerEmail || !registerPassword || !registerConfirmPassword || !registerFullName) {
      setFormError('Por favor, preencha todos os campos')
      return
    }

    if (registerPassword !== registerConfirmPassword) {
      setFormError('As senhas não coincidem')
      return
    }

    if (registerPassword.length < 6) {
      setFormError('A senha deve ter pelo menos 6 caracteres')
      return
    }

    try {
      setIsSubmitting(true)
      await signUp(registerEmail, registerPassword, registerFullName)
      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao criar conta'
      setFormError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentError = formError || authError

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Left Side - Decorative Visual */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-primary-500 via-primary-600 to-earth-700 relative overflow-hidden items-center justify-center p-8">
        {/* Animated background shapes */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-10 right-10 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-48 h-48 rounded-full bg-white blur-3xl -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center max-w-md">
          {/* Icon group */}
          <div className="flex justify-center gap-4 mb-8">
            <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
              <Droplets className="w-8 h-8 text-white" />
            </div>
            <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
              <Sprout className="w-8 h-8 text-white" />
            </div>
            <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
              <Sun className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Brand name and tagline */}
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
            IrrigaAgro
          </h1>
          <p className="text-lg text-white/90 font-medium mb-2">
            Manejo Inteligente de Irrigação
          </p>
          <p className="text-white/75 text-sm leading-relaxed">
            Otimize sua irrigação com tecnologia inteligente e dados em tempo real. Economize água, aumente a produtividade e cultive o futuro.
          </p>

          {/* Decorative divider */}
          <div className="mt-8 pt-8 border-t border-white/20 flex justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/60" />
            <div className="w-2 h-2 rounded-full bg-white/40" />
            <div className="w-2 h-2 rounded-full bg-white/20" />
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full md:w-1/2 flex flex-col justify-center p-6 sm:p-8 md:p-12">
        {/* Mobile brand (visible only on mobile) */}
        <div className="md:hidden mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sprout className="w-6 h-6 text-primary-500" />
            <h1 className="text-2xl font-bold text-text">IrrigaAgro</h1>
          </div>
          <p className="text-sm text-text-muted">Manejo Inteligente de Irrigação</p>
        </div>

        {/* Form container */}
        <div className="max-w-md w-full mx-auto">
          {/* Tab buttons */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => {
                setMode('login')
                setFormError(null)
              }}
              className={cn(
                'flex-1 py-2.5 px-4 rounded-[var(--radius-md)] font-semibold transition-all duration-200',
                mode === 'login'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'bg-surface-secondary text-text-secondary hover:bg-earth-100'
              )}
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setMode('register')
                setFormError(null)
              }}
              className={cn(
                'flex-1 py-2.5 px-4 rounded-[var(--radius-md)] font-semibold transition-all duration-200',
                mode === 'register'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'bg-surface-secondary text-text-secondary hover:bg-earth-100'
              )}
            >
              Registrar
            </button>
          </div>

          {/* Error display */}
          {currentError && (
            <div className="mb-6 p-4 bg-danger-500/10 border border-danger-500/30 rounded-[var(--radius-md)] flex items-start gap-3">
              <div className="w-1 h-1 rounded-full bg-danger-500 mt-2 flex-shrink-0" />
              <p className="text-sm text-danger-600 font-medium">{currentError}</p>
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <Input
                label="Email"
                type="email"
                variant="email"
                placeholder="seu@email.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                disabled={isSubmitting || loading}
              />

              <Input
                label="Senha"
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={isSubmitting || loading}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-6"
                isLoading={isSubmitting || loading}
              >
                Entrar
              </Button>

              <p className="text-center text-sm text-text-muted">
                Não tem conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register')
                    setFormError(null)
                  }}
                  className="text-primary-500 font-semibold hover:text-primary-600 transition-colors"
                >
                  Criar nova
                </button>
              </p>
            </form>
          )}

          {/* Register Form */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-5">
              <Input
                label="Nome Completo"
                type="text"
                placeholder="Seu Nome"
                value={registerFullName}
                onChange={(e) => setRegisterFullName(e.target.value)}
                disabled={isSubmitting || loading}
              />

              <Input
                label="Email"
                type="email"
                variant="email"
                placeholder="seu@email.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                disabled={isSubmitting || loading}
              />

              <Input
                label="Senha"
                type="password"
                placeholder="••••••••"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                disabled={isSubmitting || loading}
              />

              <Input
                label="Confirmar Senha"
                type="password"
                placeholder="••••••••"
                value={registerConfirmPassword}
                onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                disabled={isSubmitting || loading}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-6"
                isLoading={isSubmitting || loading}
              >
                Criar Conta
              </Button>

              <p className="text-center text-sm text-text-muted">
                Já tem conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setFormError(null)
                  }}
                  className="text-primary-500 font-semibold hover:text-primary-600 transition-colors"
                >
                  Fazer login
                </button>
              </p>
            </form>
          )}

          {/* Footer text */}
          <p className="text-xs text-text-muted text-center mt-8">
            Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade
          </p>
        </div>
      </div>
    </div>
  )
}
