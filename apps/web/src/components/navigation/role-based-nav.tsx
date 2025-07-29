'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getNavigationItems } from '@/lib/auth-utils';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Users, 
  BarChart3, 
  Settings, 
  UserCheck,
  Building2
} from 'lucide-react';

const iconMap = {
  '/dashboard': LayoutDashboard,
  '/orders': ShoppingCart,
  '/teams': Users,
  '/dashboard/admin/users': UserCheck,
  '/analytics': BarChart3,
  '/clients': Building2,
  '/settings': Settings,
};

interface RoleBasedNavProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function RoleBasedNav({ 
  className, 
  orientation = 'vertical' 
}: RoleBasedNavProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) {
    return null;
  }

  const navigationItems = getNavigationItems(user.role);

  const baseClasses = orientation === 'horizontal' 
    ? 'flex space-x-4' 
    : 'flex flex-col space-y-1';

  return (
    <nav className={cn(baseClasses, className)}>
      {navigationItems.map((item) => {
        const Icon = iconMap[item.href as keyof typeof iconMap];
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
              orientation === 'horizontal' ? 'space-x-2' : 'space-x-3',
              isActive
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Sidebar navigation component
 */
export function SidebarNav() {
  return (
    <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div className="p-6">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            Confirmelo
          </span>
        </div>
      </div>
      
      <div className="px-6 pb-6">
        <RoleBasedNav />
      </div>
    </div>
  );
}

/**
 * Top navigation component
 */
export function TopNav() {
  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="px-6 py-4">
        <RoleBasedNav orientation="horizontal" />
      </div>
    </div>
  );
}