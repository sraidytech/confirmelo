'use client';

import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { SidebarNav } from '@/components/navigation/role-based-nav';
import NoSSR from '@/components/no-ssr';
import { LogOut } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <NoSSR>
      <ProtectedRoute>
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
          <SidebarNav />
          
          <div className="flex-1">
            <header className="bg-white dark:bg-gray-800 shadow">
              <div className="px-6 py-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Dashboard
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                      Welcome back, {user?.firstName}!
                    </p>
                  </div>

                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    size="sm"
                    className="flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </header>

            <main className="p-6">
              {children}
            </main>
          </div>
        </div>
      </ProtectedRoute>
    </NoSSR>
  );
}