import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Droplets,
  MapPin,
  Sprout,
  Wheat,
  FileBarChart,
  CloudRain,
  Radio,
  Stethoscope,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import IrrigaAgroLogo from '@/components/branding/IrrigaAgroLogo';

// SVG icon de pivô central — mockup aprovado
function PivotIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="50 50 300 300" fill="none">
      <circle cx="200" cy="200" r="120" fill="none" stroke="#0093D0" strokeWidth="4"/>
      <circle cx="200" cy="200" r="45" fill="none" stroke="#0093D0" strokeWidth="2" opacity="0.4"/>
      <line x1="200" y1="110" x2="200" y2="145" stroke="#0093D0" strokeWidth="3" strokeLinecap="round"/>
      <line x1="200" y1="255" x2="200" y2="290" stroke="#0093D0" strokeWidth="3" strokeLinecap="round"/>
      <line x1="110" y1="200" x2="145" y2="200" stroke="#0093D0" strokeWidth="3" strokeLinecap="round"/>
      <line x1="255" y1="200" x2="290" y2="200" stroke="#0093D0" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="200" cy="200" r="8" fill="#0093D0"/>
      <line x1="200" y1="200" x2="300" y2="130" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

const OPERACIONAL = [
  { icon: LayoutDashboard, label: 'Dashboard',       path: '/dashboard'        },
  { icon: Droplets,        label: 'Manejo Diário',   path: '/manejo'           },
  { icon: CloudRain,       label: 'Precipitações',   path: '/precipitacoes'    },
  { icon: MapPin,          label: 'Fazendas',        path: '/fazendas'         },
  { icon: PivotIcon,       label: 'Pivôs',           path: '/pivos'            },
  { icon: Sprout,          label: 'Safras',          path: '/safras'           },
  { icon: FileBarChart,    label: 'Relatórios',      path: '/relatorios'       },
];

const CONFIGURACAO = [
  { icon: Wheat,        label: 'Culturas',         path: '/culturas'          },
  { icon: Radio,        label: 'Estações',         path: '/estacoes'          },
  { icon: Stethoscope,  label: 'Diagnóstico',      path: '/diagnostico-pivo'  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Sidebar(_props?: { user?: any; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

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
            color: active ? '#e2e8f0' : '#8899aa',
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
          <Icon size={18} style={{ color: active ? '#0093D0' : '#667788', flexShrink: 0 }} />
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
        className="h-screen w-[260px] flex flex-col"
        style={{
          background: '#0d1520',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo/Brand */}
        <div style={{
          padding: '26px 20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <div style={{ minWidth: 0 }}>
            <IrrigaAgroLogo size={42} showText className="text-[21px]" />
            <p style={{
              fontSize: 9,
              color: '#556677',
              margin: 0,
              marginTop: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
            }}>
              Irrigação de Precisão
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '18px 12px' }}>

          {/* OPERACIONAL */}
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.09em', color: '#445566',
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
            letterSpacing: '0.09em', color: '#445566',
            padding: '14px 12px 10px', margin: '0 0 2px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}>
            Configuração
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {CONFIGURACAO.map(item => (
              <NavItem key={item.path} icon={item.icon} label={item.label} path={item.path} />
            ))}
          </ul>
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
            Safra ativa
          </p>
          <p style={{ fontSize: 11, color: '#8899aa', margin: 0 }}>
            Verifique em <Link href="/safras" style={{ color: '#22c55e', textDecoration: 'none' }}>Safras</Link>
          </p>
        </div>

        {/* User Profile */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
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
            <p style={{ fontSize: 12, fontWeight: 500, color: '#e2e8f0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email?.split('@')[0] || 'Usuário'}
            </p>
            <p style={{ fontSize: 10, color: '#556677', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
