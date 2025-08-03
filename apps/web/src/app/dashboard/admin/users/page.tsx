'use client';

import { useState, useEffect } from 'react';
import { User, UserRole, UserStatus } from '@/types/auth';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useTranslation } from '@/hooks/use-translation';
import { UserStatusManager } from '@/components/user/user-status-manager';
import { PresenceIndicator } from '@/components/user/presence-indicator';
import { UserActivityDashboard } from '@/components/user/user-activity-dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, 
  Search, 
  Filter, 
  Eye,
  Shield
} from 'lucide-react';

import { WebSocketProvider } from '@/components/providers/websocket-provider';

function AdminUsersPageContent() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isAdmin || !currentUser) return;

    const fetchUsers = async () => {
      try {
        setLoading(true);
        // Fetch real users from the API
        const userData = await apiClient.getAdminUsers();
        setUsers(userData.users || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        // Fallback to empty array if API fails
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isAdmin, currentUser]);

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" text={t('common.actions.loading')} />
      </div>
    );
  }

  const filteredUsers = users.filter(user =>
    user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: UserRole) => {
    const roleColors = {
      [UserRole.SUPER_ADMIN]: 'destructive',
      [UserRole.ADMIN]: 'destructive',
      [UserRole.TEAM_LEADER]: 'default',
      [UserRole.CALL_CENTER_AGENT]: 'secondary',
      [UserRole.FOLLOWUP_AGENT]: 'secondary',
      [UserRole.CLIENT_ADMIN]: 'outline',
      [UserRole.CLIENT_USER]: 'outline',
    };

    return (
      <Badge variant={roleColors[role] as any}>
        {t(`roles.${role.toLowerCase()}`)}
      </Badge>
    );
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ACTIVE:
        return <Badge variant="success">{t('status.active')}</Badge>;
      case UserStatus.SUSPENDED:
        return <Badge variant="destructive">{t('status.suspended')}</Badge>;
      case UserStatus.PENDING:
        return <Badge variant="warning">{t('status.pending')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const handleUserUpdate = (updatedUser: User) => {
    setUsers(prev => prev.map(user => 
      user.id === updatedUser.id ? updatedUser : user
    ));
  };

  if (!isAdmin) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Card>
          <CardContent className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('admin.accessDenied')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-1 md:space-x-3">
          <li className="inline-flex items-center">
            <span className="text-sm font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white">
              Dashboard
            </span>
          </li>
          <li>
            <div className="flex items-center">
              <span className="mx-2 text-gray-400">/</span>
              <span className="text-sm font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white">
                Admin
              </span>
            </div>
          </li>
          <li aria-current="page">
            <div className="flex items-center">
              <span className="mx-2 text-gray-400">/</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {t('admin.users.title')}
              </span>
            </div>
          </li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <Users className="h-8 w-8 mr-3" />
            <span>{t('admin.users.title')}</span>
          </h1>
          <p className="text-muted-foreground">
            {t('admin.users.description')}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('admin.users.search')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('admin.users.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              {t('admin.users.filter')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.users.list')}</CardTitle>
          <CardDescription>
            {t('admin.users.listDescription', { count: filteredUsers.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" text={t('admin.users.loading')} />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? t('admin.users.noResults') : t('admin.users.noUsers')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar} alt={`${user.firstName} ${user.lastName}`} />
                        <AvatarFallback>
                          {getInitials(user.firstName, user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1">
                        <PresenceIndicator userId={user.id} size="sm" />
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        {getRoleBadge(user.role)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {user.email}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        {getStatusBadge(user.status)}
                        <span className="text-xs text-muted-foreground">
                          @{user.username}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          {t('admin.users.view')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            {t('admin.users.userDetails')} - {user.firstName} {user.lastName}
                          </DialogTitle>
                          <DialogDescription>
                            {t('admin.users.userDetailsDescription')}
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <UserStatusManager
                              user={user}
                              onStatusUpdate={handleUserUpdate}
                              canManageStatus={true}
                            />
                          </div>
                          <div>
                            <UserActivityDashboard userId={user.id} />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <WebSocketProvider>
      <AdminUsersPageContent />
    </WebSocketProvider>
  );
}