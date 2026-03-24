'use client'

import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="p-4 bg-danger-500/10 rounded-full">
            <AlertCircle className="w-12 h-12 text-danger-500" />
          </div>
        </div>

        {/* Error code */}
        <h1 className="text-6xl font-bold text-text mb-2">404</h1>

        {/* Heading */}
        <h2 className="text-2xl font-bold text-text mb-3">Página não encontrada</h2>

        {/* Description */}
        <p className="text-text-muted mb-8 leading-relaxed">
          Desculpe, a página que você está procurando não existe ou foi movida. Talvez você tenha seguido um link quebrado ou digitado uma URL incorreta.
        </p>

        {/* Action buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => router.push('/dashboard')}
            variant="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar ao Dashboard
          </Button>

          <Button
            onClick={() => router.push('/')}
            variant="outline"
            size="lg"
            className="w-full"
          >
            Ir para Home
          </Button>
        </div>

        {/* Decorative elements */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-text-muted">
            Código de erro: 404 - Not Found
          </p>
        </div>
      </div>
    </div>
  )
}
