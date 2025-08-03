'use client';

import React from 'react';
import { PlatformConnectionManager } from '@/components/platform/platform-connection-manager';

export default function PlatformConnectionsPage() {
  return (
    <div className="container mx-auto py-6">
      <PlatformConnectionManager />
    </div>
  );
}