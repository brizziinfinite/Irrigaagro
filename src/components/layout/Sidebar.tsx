import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Droplets,
  CalendarDays,
  MapPin,
  Sprout,
  Wheat,
  FileBarChart,
  CloudRain,
  Radio,
  Stethoscope,
  LogOut,
  ChevronRight,
  MessageSquare,
  Shield,
  Satellite,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import IrrigaAgroLogo from '@/components/branding/IrrigaAgroLogo';

// SVG icon de pivô central — viewBox 0 0 24 24 (padrão Lucide)
function PivotIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* Círculo externo — área irrigada */}
      <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
      {/* Torre central */}
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
      {/* Braço principal do pivô */}
      <line x1="12" y1="12" x2="20" y2="5" strokeWidth="1.75"/>
      {/* Rodas de suporte no braço */}
      <circle cx="16.5" cy="8.5" r="1" fill="currentColor" stroke="none"/>
      {/* Trilho de irrigação (arco) */}
      <path d="M 4.2 17 A 10 10 0 0 1 19.8 7" strokeWidth="1.5" strokeDasharray="2 1.5"/>
    </svg>
  );
}

const OPERACIONAL = [
  { icon: LayoutDashboard, label: 'Dashboard',        path: '/dashboard'         },
  { icon: Droplets,        label: 'Manejo Diário',    path: '/manejo'            },
  { icon: CalendarDays,    label: 'Programação',      path: '/lancamentos'       },
  { icon: Stethoscope,     label: 'Diagnóstico Solo', path: '/diagnostico-solo'  },
  { icon: CloudRain,       label: 'Precipitações',    path: '/precipitacoes'     },
  { icon: Satellite,       label: 'NDVI Satélite',    path: '/ndvi'              },
  { icon: MapPin,          label: 'Fazendas',         path: '/fazendas'          },
  { icon: PivotIcon,       label: 'Pivôs',            path: '/pivos'             },
  { icon: Sprout,          label: 'Safras',           path: '/safras'            },
  { icon: FileBarChart,    label: 'Relatórios',       path: '/relatorios'        },
];

const CONFIGURACAO = [
  { icon: Wheat,          label: 'Culturas',         path: '/culturas'          },
  { icon: Radio,          label: 'Estações',         path: '/estacoes'          },
  { icon: MessageSquare,  label: 'WhatsApp',         path: '/whatsapp'          },
  { icon: Stethoscope,    label: 'Diagnóstico',      path: '/diagnostico-pivo'  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Sidebar(_props?: { user?: any; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, company } = useAuth();
  const [activeSeasons, setActiveSeasons] = useState<{ name: string }[]>([]);

  useEffect(() => {
    if (!company?.id) return;
    const supabase = createClient();
    supabase
      .from('seasons')
      .select('name, farms!inner(company_id)')
      .eq('is_active', true)
      .eq('farms.company_id', company.id)
      .then(({ data }) => {
        setActiveSeasons((data ?? []) as { name: string }[]);
      });
  }, [company?.id]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleNavClick = () => {
    _props?.onNavigate?.();
  };

  function NavItem({ icon: Icon, label, path }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> | typeof PivotIcon; label: string; path: string }) {
    const active = pathname === path;
    return (
      <li>
        <Link
          href={path}
          onClick={handleNavClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 9,
            textDecoration: 'none',
            fontSize: 14.5,
            fontWeight: active ? 600 : 400,
            color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
            background: active ? 'rgba(0,147,208,0.12)' : 'transparent',
            borderLeft: active ? '2px solid #0093D0' : '2px solid transparent',
            transition: 'all 0.15s',
            position: 'relative',
          }}
          onMouseEnter={e => {
            if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
            if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          <Icon size={18} style={{ color: active ? '#0093D0' : 'var(--color-text-muted)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{label}</span>
          {active && <ChevronRight size={13} style={{ color: '#0093D0' }} />}
        </Link>
      </li>
    );
  }

  return (
    <>
      {/* Sidebar */}
      <aside
        className="h-full w-[260px] flex flex-col"
        style={{
          background: 'var(--color-surface-sidebar)',
          borderRight: '1px solid var(--color-surface-border2)',
        }}
      >
        {/* Logo/Brand */}
        <div style={{
          padding: '26px 20px 20px',
          borderBottom: '1px solid var(--color-surface-border2)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <IrrigaAgroLogo size={36} showText />
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '18px 12px' }}>

          {/* OPERACIONAL */}
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.09em', color: 'var(--color-text-muted)',
            padding: '0 12px 10px', margin: '0 0 2px',
          }}>
            Operacional
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 22 }}>
            {OPERACIONAL.map(item => (
              <NavItem key={item.path} icon={item.icon} label={item.label} path={item.path} />
            ))}
          </ul>

          {/* CONFIGURAÇÃO */}
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.09em', color: 'var(--color-text-muted)',
            padding: '14px 12px 10px', margin: '0 0 2px',
            borderTop: '1px solid var(--color-surface-border2)',
          }}>
            Configuração
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {CONFIGURACAO.map(item => (
              <NavItem key={item.path} icon={item.icon} label={item.label} path={item.path} />
            ))}
          </ul>

          {/* ADMIN — apenas super-admin */}
          {(process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).includes(user?.email ?? '') && (
            <>
              <p style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.09em', color: 'var(--color-text-muted)',
                padding: '14px 12px 10px', margin: '0 0 2px',
                borderTop: '1px solid var(--color-surface-border2)',
              }}>
                Admin
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                <NavItem icon={Shield} label="Clientes" path="/admin" />
              </ul>
            </>
          )}
        </nav>

        {/* Safra badge */}
        <div style={{
          margin: '0 8px 8px',
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(0,147,208,0.06)',
          border: '1px solid rgba(0,147,208,0.15)',
        }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#22c55e', margin: '0 0 3px' }}>
            {activeSeasons.length > 1 ? `${activeSeasons.length} safras ativas` : 'Safra ativa'}
          </p>
          {activeSeasons.length > 0 ? (
            <p style={{ fontSize: 11, color: 'var(--color-text)', margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeSeasons.length === 1 ? activeSeasons[0].name : activeSeasons.map(s => s.name).join(' · ')}
            </p>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
              Verifique em <Link href="/safras" style={{ color: '#22c55e', textDecoration: 'none' }}>Safras</Link>
            </p>
          )}
        </div>

        {/* User Profile */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--color-surface-border2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(0,147,208,0.12)', border: '1px solid rgba(0,147,208,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0093D0' }}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email?.split('@')[0] || 'Usuário'}
            </p>
            <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || ''}
            </p>
          </div>
        </div>

        {/* Sign Out Button */}
        <div style={{ padding: '0 8px 12px' }}>
          <button
            onClick={handleSignOut}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: '#ef4444',
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}
          >
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
