'use client';

import { useEffect, useState } from 'react';
import { User, OnlineUsersResponse } from '@/types/auth';
import { apiClient } from '@/lib/api';
import { usePresence } from '@/hooks/use-websocket';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserPresenceCard } from './presence-indicator';
import { Badge } from '@/components/ui/badge';
import { Users, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnlineUsersListProps {
  className?: string;
  maxUsers?: number;
  showCount?: boolean;
}

export function OnlineUsersList({ 
  className, 
  maxUsers = 10,
  showCount = true 
}: OnlineUsersListProps) {
  const { t } = useTranslation();
  const { onlineUsers, isConnected } = usePresence();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response: OnlineUsersResponse = await apiClient.getOnlineUsersInOrganization();
        
        // Fetch user details for online users
        if (response.onlineUserIds.length > 0) {
          // In a real implementation, you'd have an endpoint to get user details by IDs
          // For now, we'll simulate this
          const userDetails = await Promise.all(
            response.onlineUserIds.slice(0, maxUsers).map(async (userId) => {
              try {
                // This would be replaced with actual user details endpoint
                return {
                  id: userId,
                  firstName: 'User',
                  lastName: userId.slice(-4),
                  email: `user${userId.slice(-4)}@example.com`,
                  username: `user${userId.slice(-4)}`,
                  avatar: undefined,
                  role: 'CLIENT_USER' as any,
                  status: 'ACTIVE' as any,
                  isOnline: true,
                  organizationId: 'org-1',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
              } catch {
                return null;
              }
            })
          );
          
          setUsers(userDetails.filter(Boolean) as User[]);
        } else {
          setUsers([]);
        }
      } catch (err: any) {
        setError(err.message || t('onlineUsers.fetchError'));
      } finally {
        setLoading(false);
      }
    };

    fetchOnlineUsers();
  }, [onlineUsers, maxUsers, t]);

  const displayUsers = users.slice(0, maxUsers);
  const remainingCount = Math.max(0, onlineUsers.length - maxUsers);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            {t('onlineUsers.title')}
          </span>
          <div className="flex items-center space-x-2">
            {showCount && (
              <Badge variant={onlineUsers.length > 0 ? 'success' : 'secondary'}>
                {onlineUsers.length}
              </Badge>
            )}
            <div className="flex items-center">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          {isConnected 
            ? t('onlineUsers.description')
            : t('onlineUsers.disconnected')
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" text={t('onlineUsers.loading')} />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              {t('onlineUsers.noUsers')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayUsers.map((user) => (
              <UserPresenceCard
                key={user.id}
                userId={user.id}
                userName={`${user.firstName} ${user.lastName}`}
                userAvatar={user.avatar}
              />
            ))}
            
            {remainingCount > 0 && (
              <div className="text-center py-2">
                <Badge variant="outline">
                  +{remainingCount} {t('onlineUsers.more')}
                </Badge>
              </div>
            )}
          </div>
        )}

        {!isConnected && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <WifiOff className="h-4 w-4 text-yellow-600 mr-2" />
              <p className="text-sm text-yellow-800">
                {t('onlineUsers.connectionIssue')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CompactOnlineUsersProps {
  className?: string;
  maxDisplay?: number;
}

export function CompactOnlineUsers({ 
  className, 
  maxDisplay = 5 
}: CompactOnlineUsersProps) {
  const { t } = useTranslation();
  const { onlineUsers, isConnected } = usePresence();

  if (!isConnected) {
    return (
      <div className={cn('flex items-center text-muted-foreground', className)}>
        <WifiOff className="h-4 w-4 mr-2" />
        <span className="text-sm">{t('onlineUsers.offline')}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <div className="flex items-center">
        <div className="h-2 w-2 bg-green-500 rounded-full mr-2" />
        <span className="text-sm font-medium">
          {onlineUsers.length}
        </span>
      </div>
      <span className="text-sm text-muted-foreground">
        {t('onlineUsers.online')}
      </span>
    </div>
  );
}