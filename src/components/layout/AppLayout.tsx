import { Outlet } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

export function AppLayout() {
  return (
    <div className="flex h-screen bg-surface-secondary">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-sm text-text-muted font-medium">Safra</h2>
              <p className="text-lg font-semibold text-text">2023/2024</p>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            {/* Season Selector */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-secondary border border-border">
              <span className="text-sm text-text-muted">Safra:</span>
              <select
                className={cn(
                  'bg-transparent text-text text-sm font-medium focus:outline-none cursor-pointer',
                  'appearance-none'
                )}
                defaultValue="2023/2024"
              >
                <option>2023/2024</option>
                <option>2022/2023</option>
                <option>2021/2022</option>
              </select>
            </div>

            {/* Notification Bell */}
            <button
              className={cn(
                'relative p-2 rounded-lg transition-colors',
                'hover:bg-surface-secondary text-text-secondary hover:text-text',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
              )}
              aria-label="Notifications"
            >
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
