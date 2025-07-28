'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { UserRole } from '@/types/auth';
import { checkRouteAccess, isPublicRoute, isAuthRoute, getDefaultRedirectUrl } from '@/lib/auth-utils';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: UserRole[];
  fallback?: ReactNode;
  redirectTo?: string;
}

/**
 * Higher-order component for protecting routes based on authentication and roles
 */
export function ProtectedRoute({
  children,
  requiredRoles,
  fallback,
  redirectTo,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // If route is public, allow access
    if (isPublicRoute(pathname)) {
      return;
    }

    // If user is not authenticated and route is not public, redirect to login
    if (!user) {
      const loginUrl = `/auth/login${pathname !== '/' ? `?returnUrl=${encodeURIComponent(pathname)}` : ''}`;
      router.replace(loginUrl);
      return;
    }

    // If user is authenticated and trying to access auth routes, redirect to dashboard
    if (user && isAuthRoute(pathname)) {
      const defaultUrl = getDefaultRedirectUrl(user.role);
      router.replace(defaultUrl);
      return;
    }

    // Check role-based access
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        router.replace(redirectTo || '/unauthorized');
        return;
      }
    } else {
      // Use default route access check
      if (!checkRouteAccess(pathname, user.role)) {
        router.replace(redirectTo || '/unauthorized');
        return;
      }
    }
  }, [user, loading, pathname, router, requiredRoles, redirectTo]);

  // Show loading spinner while checking authentication
  if (loading) {
    return fallback || <LoadingSpinner />;
  }

  // If route is public, render children
  if (isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  // If user is not authenticated, don't render anything (redirect will happen)
  if (!user) {
    return fallback || <LoadingSpinner />;
  }

  // If user is authenticated and trying to access auth routes, don't render
  if (user && isAuthRoute(pathname)) {
    return fallback || <LoadingSpinner />;
  }

  // Check role-based access
  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(user.role)) {
      return fallback || <LoadingSpinner />;
    }
  } else {
    // Use default route access check
    if (!checkRouteAccess(pathname, user.role)) {
      return fallback || <LoadingSpinner />;
    }
  }

  // All checks passed, render children
  return <>{children}</>;
}

/**
 * Hook for checking if current user has access to a route
 */
export function useRouteAccess(pathname?: string, requiredRoles?: UserRole[]) {
  const { user, loading } = useAuth();
  const currentPathname = usePathname();
  const targetPath = pathname || currentPathname;

  if (loading) {
    return { hasAccess: false, loading: true };
  }

  if (!user) {
    return { hasAccess: isPublicRoute(targetPath), loading: false };
  }

  let hasAccess = true;

  if (requiredRoles && requiredRoles.length > 0) {
    hasAccess = requiredRoles.includes(user.role);
  } else {
    hasAccess = checkRouteAccess(targetPath, user.role);
  }

  return { hasAccess, loading: false };
}

/**
 * Component for conditionally rendering content based on user permissions
 */
interface ConditionalRenderProps {
  children: ReactNode;
  requiredRoles?: UserRole[];
  requiredPermissions?: string[];
  fallback?: ReactNode;
  showLoading?: boolean;
}

export function ConditionalRender({
  children,
  requiredRoles,
  requiredPermissions,
  fallback = null,
  showLoading = false,
}: ConditionalRenderProps) {
  const { user, loading } = useAuth();

  if (loading && showLoading) {
    return <LoadingSpinner size="sm" />;
  }

  if (!user) {
    return <>{fallback}</>;
  }

  // Check role requirements
  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(user.role)) {
      return <>{fallback}</>;
    }
  }

  // Check permission requirements (if implemented)
  if (requiredPermissions && requiredPermissions.length > 0) {
    // This would require implementing a permission check system
    // For now, we'll use role-based checks
    console.warn('Permission-based rendering not yet implemented');
  }

  return <>{children}</>;
}