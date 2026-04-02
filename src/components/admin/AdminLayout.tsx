import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, ClipboardList, Users, Wrench, Star,
  AlertTriangle, Grid3X3, Settings, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const links = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/orders', icon: ClipboardList, label: 'Заказы' },
  { to: '/admin/users', icon: Users, label: 'Пользователи' },
  { to: '/admin/taskers', icon: Wrench, label: 'Исполнители' },
  { to: '/admin/reviews', icon: Star, label: 'Отзывы' },
  { to: '/admin/complaints', icon: AlertTriangle, label: 'Жалобы' },
  { to: '/admin/categories', icon: Grid3X3, label: 'Категории' },
  { to: '/admin/settings', icon: Settings, label: 'Настройки' },
];

export const AdminLayout = () => {
  const { user, roles, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !roles.includes('admin')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <aside className={cn(
        "border-e border-border bg-card flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}>
        <div className="flex items-center justify-between p-3 border-b border-border">
          {!collapsed && <span className="font-semibold text-sm text-foreground">Админ-панель</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-secondary">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <link.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{link.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
};
