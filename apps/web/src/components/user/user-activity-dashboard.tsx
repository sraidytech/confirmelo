'use client';

import { useEffect, useState } from 'react';
import { UserActivitySummary } from '@/types/auth';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useTranslation } from '@/hooks/use-translation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PresenceIndicator } from './presence-indicator';
import { 
  Activity, 
  Monitor, 
  MapPin, 
  Clock, 
  Shield,
  Smartphone,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserActivityDashboardProps {
  userId?: string;
  className?: string;
}

export function UserActivityDashboard({ 
  userId, 
  className 
}: UserActivityDashboardProps) {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const [activity, setActivity] = useState<UserActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetUserId = userId || currentUser?.id;

  useEffect(() => {
    if (!targetUserId) return;

    const fetchActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        const activityData = await apiClient.getUserActivitySummary(targetUserId);
        setActivity(activityData);
      } catch (err: any) {
        setError(err.message || t('activity.fetchError'));
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [targetUserId, t]);

  const formatLastActive = (lastActiveAt: string) => {
    const lastActive = new Date(lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('activity.justNow');
    if (diffMins < 60) return t('activity.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('activity.hoursAgo', { count: diffHours });
    return t('activity.daysAgo', { count: diffDays });
  };

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) return <Monitor className="h-4 w-4" />;
    
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return <Smartphone className="h-4 w-4" />;
    }
    
    return <Monitor className="h-4 w-4" />;
  };

  const getBrowserInfo = (userAgent?: string) => {
    if (!userAgent) return t('activity.unknownBrowser');
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    
    return t('activity.unknownBrowser');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">{t('status.active')}</Badge>;
      case 'SUSPENDED':
        return <Badge variant="destructive">{t('status.suspended')}</Badge>;
      case 'PENDING':
        return <Badge variant="warning">{t('status.pending')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className={cn(className)}>
        <CardContent className="flex justify-center py-8">
          <LoadingSpinner size="md" text={t('activity.loading')} />
        </CardContent>
      </Card>
    );
  }

  if (error || !activity) {
    return (
      <Card className={cn(className)}>
        <CardContent className="text-center py-8">
          <p className="text-sm text-destructive">
            {error || t('activity.noData')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Activity className="h-5 w-5 mr-2" />
          {t('activity.title')}
        </CardTitle>
        <CardDescription>{t('activity.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('activity.currentStatus')}</span>
              <div className="flex items-center space-x-2">
                <PresenceIndicator userId={activity.userId} size="sm" />
                <span className="text-sm">
                  {activity.isOnline ? t('activity.online') : t('activity.offline')}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('activity.accountStatus')}</span>
              {getStatusBadge(activity.status)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('activity.activeSessions')}</span>
              <Badge variant="outline" className="flex items-center">
                <Monitor className="h-3 w-3 mr-1" />
                {activity.activeSessions}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('activity.lastActive')}</span>
              <span className="text-sm text-muted-foreground flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {formatLastActive(activity.lastActiveAt.toString())}
              </span>
            </div>
          </div>
        </div>

        {/* Session Information */}
        {(activity.lastIpAddress || activity.lastUserAgent) && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center">
              <Shield className="h-4 w-4 mr-2" />
              {t('activity.sessionInfo')}
            </h4>
            <div className="space-y-3">
              {activity.lastIpAddress && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center">
                    <MapPin className="h-3 w-3 mr-2" />
                    {t('activity.lastIpAddress')}
                  </span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {activity.lastIpAddress}
                  </code>
                </div>
              )}
              
              {activity.lastUserAgent && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center">
                    {getDeviceIcon(activity.lastUserAgent)}
                    <span className="ml-2">{t('activity.browser')}</span>
                  </span>
                  <span className="text-sm">
                    {getBrowserInfo(activity.lastUserAgent)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <div className="flex items-start space-x-2">
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t('activity.securityNotice')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('activity.securityNoticeDescription')}
              </p>
            </div>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {activity.isOnline ? '1' : '0'}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('activity.onlineNow')}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {activity.activeSessions}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('activity.sessions')}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {activity.status === 'ACTIVE' ? '✓' : '✗'}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('activity.accountActive')}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {activity.lastIpAddress ? '🔒' : '❓'}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('activity.secureConnection')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}