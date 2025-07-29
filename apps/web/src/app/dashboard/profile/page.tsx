'use client';

import { UserManagementDashboard } from '@/components/user/user-management-dashboard';
import { WebSocketProvider } from '@/components/providers/websocket-provider';

export default function ProfilePage() {
  return (
    <WebSocketProvider>
      <UserManagementDashboard />
    </WebSocketProvider>
  );
}