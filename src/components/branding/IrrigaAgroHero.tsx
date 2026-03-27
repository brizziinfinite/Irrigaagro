'use client'

import { Droplets, Leaf, Orbit } from 'lucide-react'
import GotejoLogo from './GotejoLogo'


const FEATURES = [
  { icon: Droplets, label: 'Manejo hídrico diário' },
  { icon: Leaf, label: 'Safras e pivôs em um só fluxo' },
  { icon: Orbit, label: 'Leitura operacional objetiva' },
]

export default function IrrigaAgroHero() {
  return (
    <section className="relative hidden min-h-[640px] overflow-hidden rounded-[32px] border border-white/6 bg-[#0b1219] p-10 lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,14,20,0.2),rgba(8,14,20,0.86))]" />
        <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-sky-500/5 blur-3xl" />
        <div className="absolute bottom-10 left-20 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute inset-y-0 right-0 w-px bg-white/6" />
      </div>

      <div className="relative z-10 space-y-10">
        <div className="inline-flex items-center rounded-full border border-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Plataforma Gotejo
        </div>

        <div className="space-y-6">
          <GotejoLogo size={42} className="text-[32px]" />

          <div className="max-w-[470px] space-y-4">
            <h2 className="text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.05em] text-slate-50">
              Software agrícola com leitura técnica, simples e confiável.
            </h2>
            <p className="max-w-md text-[15px] leading-7 text-slate-400">
              O Gotejo organiza a operação de irrigação em uma interface escura, profissional e pensada para uso diário.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 space-y-5">
        <div className="h-px w-full bg-white/6" />
        <div className="grid gap-3">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-sm text-slate-300">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-slate-300">
                <Icon size={15} />
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
