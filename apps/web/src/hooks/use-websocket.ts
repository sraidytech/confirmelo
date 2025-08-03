'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import { useAuth } from '@/contexts/auth-context';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connect = () => {
    if (socketRef.current?.connected) {
      return;
    }

    const token = Cookies.get('accessToken');
    if (!token || !user) {
      setConnectionError('No authentication token available');
      return;
    }

    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setConnectionError(null);
      onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);
      onDisconnect?.();
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
      onError?.(error);
    });

    socketRef.current = socket;
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  };

  const emit = (event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  useEffect(() => {
    if (autoConnect && user) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [user, autoConnect]);

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
}

export function usePresence() {
  const { emit, on, off, isConnected } = useWebSocket();
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!isConnected) return;

    const handleUserOnline = (userId: string) => {
      setOnlineUsers(prev => {
        const uniqueUsers = new Set([...prev, userId]);
        return Array.from(uniqueUsers);
      });
    };

    const handleUserOffline = (userId: string) => {
      setOnlineUsers(prev => prev.filter(id => id !== userId));
    };

    const handleOnlineUsersList = (userIds: string[]) => {
      setOnlineUsers(userIds);
    };

    on('user:online', handleUserOnline);
    on('user:offline', handleUserOffline);
    on('presence:online_users', handleOnlineUsersList);

    // Request current online users
    emit('presence:get_online_users');

    return () => {
      off('user:online', handleUserOnline);
      off('user:offline', handleUserOffline);
      off('presence:online_users', handleOnlineUsersList);
    };
  }, [isConnected, emit, on, off]);

  const updateActivity = () => {
    if (isConnected) {
      emit('presence:activity');
    }
  };

  return {
    onlineUsers,
    updateActivity,
    isConnected,
  };
}