'use client';

import React from 'react';
import { OrderSyncManager } from '@/components/platform/order-sync/order-sync-manager';

export default function OrderSyncPage() {
  return (
    <div className="container mx-auto py-6">
      <OrderSyncManager />
    </div>
  );
}