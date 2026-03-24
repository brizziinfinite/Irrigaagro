import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Droplets,
  MapPin,
  Sprout,
  Wheat,
  FileBarChart,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// SVG icon de pivô central
function PivotIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="12" stroke="#0093D0" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.4" />
      <circle cx="14" cy="14" r="7" stroke="#0093D0" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.65" />
      <circle cx="14" cy="14" r="2.5" fill="#0093D0" />
      <line x1="14" y1="2" x2="14" y2="8" stroke="#0093D0" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const OPERACIONAL = [
  { icon: LayoutDashboard, label: 'Dashboard',    path: '/dashboard'   },
  { icon: Droplets,        label: 'Manejo Diário', path: '/manejo'      },
  { icon: MapPin,          label: 'Fazendas',      path: '/fazendas'    },
  { icon: PivotIcon,       label: 'Pivôs',         path: '/pivos'       },
  { icon: Sprout,          label: 'Safras',        path: '/safras'      },
  { icon: FileBarChart,    label: 'Relatórios',    path: '/relatorios'  },
];

const CONFIGURACAO = [
  { icon: Wheat,    label: 'Culturas',       path: '/culturas'       },
  { icon: Settings, label: 'Configurações',  path: '/configuracoes'  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Sidebar(_props?: { user?: any; onNavigate?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleNavClick = () => {
    setIsOpen(false);
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
            padding: '11px 14px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
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
          <Icon size={18} style={{ color: active ? '#0093D0' : '#556677', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{label}</span>
          {active && <ChevronRight size={13} style={{ color: '#0093D0' }} />}
        </Link>
      </li>
    );
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: 8, borderRadius: 8,
            background: '#0d1520',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#e2e8f0',
            cursor: 'pointer',
          }}
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 lg:hidden z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 z-40 transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{
          background: '#0d1520',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo/Brand */}
        <div style={{
          padding: '24px 18px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'rgba(0,147,208,0.12)',
            border: '1px solid rgba(0,147,208,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PivotIcon size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, lineHeight: 1.1, margin: 0 }}>
              <span style={{ fontWeight: 800, color: '#0093D0' }}>Irriga</span>
              <span style={{ fontWeight: 300, color: '#22c55e' }}>Agro</span>
            </h1>
            <p style={{ fontSize: 11, color: '#556677', margin: 0, marginTop: 1 }}>Gerenciamento Hídrico</p>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 10px' }}>

          {/* OPERACIONAL */}
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: '#556677',
            padding: '0 12px 8px', margin: '0 0 2px',
          }}>
            Operacional
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 20 }}>
            {OPERACIONAL.map(item => (
              <NavItem key={item.path} icon={item.icon} label={item.label} path={item.path} />
            ))}
          </ul>

          {/* CONFIGURAÇÃO */}
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: '#556677',
            padding: '12px 12px 8px', margin: '0 0 2px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
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
          background: 'rgba(34,197,94,0.06)',
          border: '1px solid rgba(34,197,94,0.15)',
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

      {/* Main Content Margin */}
      <div className="hidden lg:block w-64" />
    </>
  );
}
