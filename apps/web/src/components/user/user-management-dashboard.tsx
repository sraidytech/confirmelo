'use client';

import { useState, useEffect } from 'react';
import { User } from '@/types/auth';
import { useAuth } from '@/contexts/auth-context';
import { useWebSocketContext } from '@/components/providers/websocket-provider';
import { useTranslation } from '@/hooks/use-translation';
import { ProfileForm } from './profile-form';
import { PasswordChangeForm } from './password-change-form';
import { UserStatusManager } from './user-status-manager';
import { UserActivityDashboard } from './user-activity-dashboard';
import { OnlineUsersList, CompactOnlineUsers } from './online-users-list';
import { PresenceIndicator } from './presence-indicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User as UserIcon, 
  Settings, 
  Activity, 
  Users, 
  Shield,
  Wifi,
  WifiOff,
  Bell,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserManagementDashboardProps {
  className?: string;
  defaultTab?: string;
}

export function UserManagementDashboard({ 
  className, 
  defaultTab = 'profile' 
}: UserManagementDashboardProps) {
  const { user, loading } = useAuth();
  const { isConnected, onlineUsers } = useWebSocketContext();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUserUpdate = (updatedUser: User) => {
    // Force refresh of components that depend on user data
    setRefreshKey(prev => prev + 1);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" text={t('common.actions.loading')} />
      </div>
    );
  }

  if (!user) {
    return (
      <Card className={cn(className)}>
        <CardContent className="text-center py-8">
          <UserIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t('profile.notFound')}</p>
        </CardContent>
      </Card>
    );
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <UserIcon className="h-8 w-8" />
              <div className="absolute -bottom-1 -right-1">
                <PresenceIndicator userId={user.id} size="sm" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-muted-foreground">@{user.username}</p>
            </div>
          </div>
          <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}>
            {t(`status.${user.status.toLowerCase()}`)}
          </Badge>
        </div>

        <div className="flex items-center space-x-4">
          <CompactOnlineUsers />
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <div className="flex items-center text-green-600">
                <Wifi className="h-4 w-4 mr-1" />
                <span className="text-sm">{t('status.online')}</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <WifiOff className="h-4 w-4 mr-1" />
                <span className="text-sm">{t('status.offline')}</span>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common.actions.refresh')}
          </Button>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center">
            <UserIcon className="h-4 w-4 mr-2" />
            {t('navigation.profile')}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            {t('password.title')}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center">
            <Activity className="h-4 w-4 mr-2" />
            {t('activity.title')}
          </TabsTrigger>
          <TabsTrigger value="presence" className="flex items-center">
            <Users className="h-4 w-4 mr-2" />
            {t('onlineUsers.title')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ProfileForm 
                key={`profile-${refreshKey}`}
                user={user} 
                onUpdate={handleUserUpdate} 
              />
            </div>
            <div className="space-y-6">
              {isAdmin && (
                <UserStatusManager
                  key={`status-${refreshKey}`}
                  user={user}
                  onStatusUpdate={handleUserUpdate}
                  canManageStatus={false} // Can't manage own status
                />
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Bell className="h-5 w-5 mr-2" />
                    {t('websocket.notifications')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('websocket.realTimeUpdates')}</span>
                      <Badge variant={isConnected ? 'success' : 'destructive'}>
                        {isConnected ? t('status.active') : t('status.inactive')}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t('onlineUsers.online')}</span>
                      <Badge variant="outline">
                        {onlineUsers.length}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PasswordChangeForm key={`password-${refreshKey}`} />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  {t('activity.securityNotice')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('activity.securityNoticeDescription')}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t('activity.activeSessions')}</span>
                    <Badge variant="outline">
                      {user.id ? '1+' : '0'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t('activity.lastActive')}</span>
                    <span className="text-sm text-muted-foreground">
                      {user.lastActiveAt ? t('activity.justNow') : t('time.never')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <UserActivityDashboard 
            key={`activity-${refreshKey}`}
            userId={user.id} 
          />
        </TabsContent>

        <TabsContent value="presence" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <OnlineUsersList 
              key={`online-users-${refreshKey}`}
              maxUsers={10} 
            />
            <Card>
              <CardHeader>
                <CardTitle>{t('presence.yourStatus')}</CardTitle>
                <CardDescription>
                  {t('presence.yourStatusDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-4">
                  <PresenceIndicator userId={user.id} size="lg" />
                  <div>
                    <p className="font-medium">
                      {onlineUsers.includes(user.id) ? t('presence.online') : t('presence.offline')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user.lastActiveAt ? t('activity.lastActive') : t('time.never')}
                    </p>
                  </div>
                </div>
                
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    {t('presence.statusInfo')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}