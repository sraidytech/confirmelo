'use client';

import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface NoSSRProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function NoSSRWrapper({ children, fallback }: NoSSRProps) {
  return <>{children}</>;
}

const NoSSR = dynamic(() => Promise.resolve(NoSSRWrapper), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center min-h-screen">
      <LoadingSpinner size="lg" text="Loading..." />
    </div>
  ),
});

export default NoSSR;