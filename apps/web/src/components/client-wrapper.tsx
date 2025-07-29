'use client';

import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface ClientWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showLoader?: boolean;
}

export function ClientWrapper({ 
  children, 
  fallback, 
  showLoader = true 
}: ClientWrapperProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    if (showLoader) {
      return (
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner size="lg" text="Loading..." />
        </div>
      );
    }
    
    return null;
  }

  return <>{children}</>;
}