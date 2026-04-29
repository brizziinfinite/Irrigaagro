'use client'

import { useEffect, useState, useCallback } from 'react'

const OFFLINE_MESSAGE =
  'Sem conexão. Esta ação precisa de internet para evitar duplicidade ou inconsistência nos lançamentos.'

interface OnlineGuard {
  isOnline: boolean
  /** Chame antes de qualquer mutation. Retorna true se pode prosseguir, false se offline (e mostra toast). */
  guardAction: () => boolean
}

/**
 * Hook que bloqueia ações de escrita quando offline.
 *
 * Uso:
 *   const { isOnline, guardAction } = useOnlineGuard()
 *   <button disabled={!isOnline} onClick={() => { if (!guardAction()) return; doMutation() }}>
 *     Salvar
 *   </button>
 */
export function useOnlineGuard(): OnlineGuard {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const guardAction = useCallback((): boolean => {
    if (navigator.onLine) return true

    // Toast simples — não depende de biblioteca externa
    showOfflineToast()
    return false
  }, [])

  return { isOnline, guardAction }
}

function showOfflineToast() {
  // Evita duplicar toasts
  if (document.getElementById('irrigaagro-offline-toast')) return

  const toast = document.createElement('div')
  toast.id = 'irrigaagro-offline-toast'
  toast.setAttribute(
    'style',
    [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:99999',
      'background:#0f1923',
      'border:1px solid rgba(245,158,11,0.4)',
      'border-radius:10px',
      'color:#fef3c7',
      'font-size:13px',
      'font-family:sans-serif',
      'padding:14px 20px',
      'max-width:340px',
      'text-align:center',
      'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
      'line-height:1.5',
    ].join(';')
  )
  toast.textContent = OFFLINE_MESSAGE

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.4s'
    setTimeout(() => toast.remove(), 400)
  }, 4000)
}
