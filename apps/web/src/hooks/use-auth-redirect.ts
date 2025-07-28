'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getDefaultRedirectUrl, isAuthRoute } from '@/lib/auth-utils';

/**
 * Hook for handling authentication-based redirects
 */
export function useAuthRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading) return;

    const returnUrl = searchParams.get('returnUrl');
    const currentPath = window.location.pathname;

    // If user is authenticated and on auth page, redirect
    if (user && isAuthRoute(currentPath)) {
      const redirectUrl = returnUrl || getDefaultRedirectUrl(user.role);
      router.replace(redirectUrl);
    }
  }, [user, loading, router, searchParams]);

  return { user, loading };
}

/**
 * Hook for redirecting after successful login
 */
export function useLoginRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectAfterLogin = (userRole: string) => {
    const returnUrl = searchParams.get('returnUrl');
    
    if (returnUrl && !isAuthRoute(returnUrl)) {
      router.replace(returnUrl);
    } else {
      const defaultUrl = getDefaultRedirectUrl(userRole as any);
      router.replace(defaultUrl);
    }
  };

  return { redirectAfterLogin };
}

/**
 * Hook for handling logout redirects
 */
export function useLogoutRedirect() {
  const router = useRouter();

  const redirectAfterLogout = () => {
    router.replace('/auth/login');
  };

  return { redirectAfterLogout };
}