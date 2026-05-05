'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export function PushNotificationToggle() {
  const [permission, setPermission] = useState<PermissionState>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission as PermissionState)
    getCurrentSubscription().then((sub) => setSubscribed(!!sub))
  }, [])

  async function subscribe() {
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm as PermissionState)
      if (perm !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setSubscribed(true)
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    setLoading(true)
    try {
      const sub = await getCurrentSubscription()
      if (!sub) { setSubscribed(false); return }

      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      await sub.unsubscribe()
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }

  if (permission === 'unsupported') return null

  if (permission === 'denied') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
        style={{
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'var(--color-surface-elevated)',
          color: 'var(--color-text-faint)',
        }}
        title="Notificações bloqueadas no browser. Desbloqueie nas configurações do browser."
      >
        <BellOff size={14} />
        <span>Notificações bloqueadas</span>
      </div>
    )
  }

  if (subscribed && permission === 'granted') {
    return (
      <button
        onClick={unsubscribe}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
        style={{
          border: '1px solid rgba(0,147,208,0.3)',
          background: 'rgba(0,147,208,0.08)',
          color: '#0093D0',
          cursor: loading ? 'wait' : 'pointer',
        }}
        title="Desativar notificações push"
      >
        <BellRing size={14} />
        <span>{loading ? 'Aguarde...' : 'Push ativo'}</span>
      </button>
    )
  }

  return (
    <button
      onClick={subscribe}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'var(--color-surface-elevated)',
        color: 'var(--color-text-secondary)',
        cursor: loading ? 'wait' : 'pointer',
      }}
      title="Ativar alertas críticos de irrigação"
    >
      <Bell size={14} />
      <span>{loading ? 'Aguarde...' : 'Ativar notificações'}</span>
    </button>
  )
}
