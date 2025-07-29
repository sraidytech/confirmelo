'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface WebSocketContextType {
  isConnected: boolean;
  connectionError: string | null;
  onlineUsers: string[];
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  const {
    isConnected,
    connectionError,
    emit,
    on,
    off,
  } = useWebSocket({
    autoConnect: true,
    onConnect: () => {
      console.log('WebSocket connected successfully');
      // Request current online users when connected
      emit('presence:get_online_users');
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected');
      setOnlineUsers([]);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      toast({
        variant: 'destructive',
        title: t('websocket.connectionError'),
        description: t('websocket.connectionErrorDescription'),
      });
    },
  });

  useEffect(() => {
    if (!isConnected) return;

    // Handle user online/offline events
    const handleUserOnline = (userId: string) => {
      setOnlineUsers(prev => {
        if (!prev.includes(userId)) {
          return [...prev, userId];
        }
        return prev;
      });
    };

    const handleUserOffline = (userId: string) => {
      setOnlineUsers(prev => prev.filter(id => id !== userId));
    };

    const handleOnlineUsersList = (userIds: string[]) => {
      setOnlineUsers(userIds);
    };

    const handleUserStatusChanged = (data: { userId: string; status: string; changedBy: string }) => {
      // Show notification for status changes
      if (data.userId === user?.id) {
        toast({
          title: t('websocket.statusChanged'),
          description: t('websocket.yourStatusChanged', { status: data.status }),
        });
      }
    };

    const handleSystemNotification = (data: { type: string; message: string; userId?: string }) => {
      // Handle system-wide notifications
      if (!data.userId || data.userId === user?.id) {
        toast({
          title: t('websocket.systemNotification'),
          description: data.message,
        });
      }
    };

    // Register event listeners
    on('user:online', handleUserOnline);
    on('user:offline', handleUserOffline);
    on('presence:online_users', handleOnlineUsersList);
    on('user:status_changed', handleUserStatusChanged);
    on('system:notification', handleSystemNotification);

    // Cleanup function
    return () => {
      off('user:online', handleUserOnline);
      off('user:offline', handleUserOffline);
      off('presence:online_users', handleOnlineUsersList);
      off('user:status_changed', handleUserStatusChanged);
      off('system:notification', handleSystemNotification);
    };
  }, [isConnected, emit, on, off, user?.id, toast, t]);

  // Send periodic activity updates when connected
  useEffect(() => {
    if (!isConnected || !user) return;

    const activityInterval = setInterval(() => {
      emit('presence:activity');
    }, 30000); // Send activity every 30 seconds

    return () => clearInterval(activityInterval);
  }, [isConnected, user, emit]);

  const value: WebSocketContextType = {
    isConnected,
    connectionError,
    onlineUsers,
    emit,
    on,
    off,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}