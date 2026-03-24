import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Droplets,
  MapPin,
  CircleDot,
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
import { cn } from '@/lib/utils';

const navigationItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Droplets, label: 'Manejo Diário', path: '/manejo' },
  { icon: MapPin, label: 'Fazendas', path: '/fazendas' },
  { icon: CircleDot, label: 'Pivôs', path: '/pivos' },
  { icon: Sprout, label: 'Safras', path: '/safras' },
  { icon: Wheat, label: 'Culturas', path: '/culturas' },
  { icon: FileBarChart, label: 'Relatórios', path: '/relatorios' },
  { icon: Settings, label: 'Configurações', path: '/configuracoes' },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNavClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg bg-surface border border-border text-text hover:bg-surface-secondary transition-colors"
          aria-label="Toggle menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 bg-surface border-r border-border z-40',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          'flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo/Brand */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center">
              <Droplets size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text">IrrigaAgro</h1>
              <p className="text-xs text-text-muted">Gerenciamento Hídrico</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-4">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors relative',
                        'text-sm font-medium',
                        isActive
                          ? 'bg-primary-50 text-primary-600 border-l-2 border-l-primary-500'
                          : 'text-text-secondary hover:bg-surface-secondary hover:text-text'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={20} />
                        <span className="flex-1">{item.label}</span>
                        {isActive && (
                          <ChevronRight size={16} className="text-primary-500" />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Separator */}
        <div className="border-t border-border" />

        {/* User Profile */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-700">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">
                {user?.email || 'User'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {user?.email || 'user@example.com'}
              </p>
            </div>
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="p-4">
          <button
            onClick={handleSignOut}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
              'text-sm font-medium text-danger-600',
              'border border-danger-200 hover:bg-danger-50',
              'transition-colors'
            )}
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content Margin */}
      <div className="hidden lg:block w-64" />
    </>
  );
}
