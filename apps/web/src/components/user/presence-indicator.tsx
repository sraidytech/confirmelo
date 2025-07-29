'use client';

import { useEffect, useState } from 'react';
import { UserPresence } from '@/types/auth';
import { apiClient } from '@/lib/api';
import { usePresence } from '@/hooks/use-websocket';
import { useTranslation } from '@/hooks/use-translation';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresenceIndicatorProps {
  userId: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PresenceIndicator({ 
  userId, 
  showLabel = false, 
  size = 'md',
  className 
}: PresenceIndicatorProps) {
  const { t } = useTranslation();
  const { onlineUsers } = usePresence();
  const [presence, setPresence] = useState<UserPresence | null>(null);
  const [loading, setLoading] = useState(true);

  const isOnline = onlineUsers.includes(userId);

  useEffect(() => {
    const fetchPresence = async () => {
      try {
        const presenceData = await apiClient.getUserPresence(userId);
        setPresence(presenceData);
      } catch (error) {
        console.error('Failed to fetch user presence:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPresence();
  }, [userId]);

  const getPresenceColor = () => {
    if (loading) return 'bg-gray-400';
    if (isOnline) return 'bg-green-500';
    return 'bg-gray-400';
  };

  const getPresenceText = () => {
    if (loading) return t('presence.loading');
    if (isOnline) return t('presence.online');
    return t('presence.offline');
  };

  const getLastActiveText = () => {
    if (!presence?.lastActiveAt) return '';
    
    const lastActive = new Date(presence.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('presence.justNow');
    if (diffMins < 60) return t('presence.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('presence.hoursAgo', { count: diffHours });
    return t('presence.daysAgo', { count: diffDays });
  };

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const indicator = (
    <div className={cn('relative inline-flex items-center', className)}>
      <Circle 
        className={cn(
          'rounded-full border-2 border-background',
          sizeClasses[size],
          getPresenceColor()
        )}
        fill="currentColor"
      />
      {showLabel && (
        <span className={cn(
          'ml-2 text-sm',
          isOnline ? 'text-green-600' : 'text-gray-500'
        )}>
          {getPresenceText()}
        </span>
      )}
    </div>
  );

  if (!showLabel && presence) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {indicator}
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <p className="font-medium">{getPresenceText()}</p>
              {!isOnline && presence.lastActiveAt && (
                <p className="text-xs text-muted-foreground">
                  {t('presence.lastActive')}: {getLastActiveText()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return indicator;
}

interface UserPresenceCardProps {
  userId: string;
  userName: string;
  userAvatar?: string;
  className?: string;
}

export function UserPresenceCard({ 
  userId, 
  userName, 
  userAvatar,
  className 
}: UserPresenceCardProps) {
  const { t } = useTranslation();
  const { onlineUsers } = usePresence();
  const [presence, setPresence] = useState<UserPresence | null>(null);

  const isOnline = onlineUsers.includes(userId);

  useEffect(() => {
    const fetchPresence = async () => {
      try {
        const presenceData = await apiClient.getUserPresence(userId);
        setPresence(presenceData);
      } catch (error) {
        console.error('Failed to fetch user presence:', error);
      }
    };

    fetchPresence();
  }, [userId]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getLastActiveText = () => {
    if (!presence?.lastActiveAt) return '';
    
    const lastActive = new Date(presence.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('presence.justNow');
    if (diffMins < 60) return t('presence.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('presence.hoursAgo', { count: diffHours });
    return t('presence.daysAgo', { count: diffDays });
  };

  return (
    <div className={cn('flex items-center space-x-3 p-3 rounded-lg border', className)}>
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={userAvatar} alt={userName} />
          <AvatarFallback>{getInitials(userName)}</AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1">
          <PresenceIndicator userId={userId} size="md" />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{userName}</p>
        <div className="flex items-center space-x-2">
          <Badge 
            variant={isOnline ? 'success' : 'secondary'}
            className="text-xs"
          >
            {isOnline ? t('presence.online') : t('presence.offline')}
          </Badge>
          {!isOnline && presence?.lastActiveAt && (
            <span className="text-xs text-muted-foreground flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              {getLastActiveText()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}