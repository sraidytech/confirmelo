import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { UserRole } from '@/types/auth';

// Route configuration
const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

// Role-based route access configuration
const ROLE_ROUTES: Record<string, UserRole[]> = {
  '/dashboard': [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.TEAM_LEADER,
    UserRole.CALL_CENTER_AGENT,
    UserRole.FOLLOWUP_AGENT,
    UserRole.CLIENT_ADMIN,
    UserRole.CLIENT_USER,
  ],
  '/admin': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  '/teams': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER],
  '/orders': [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.TEAM_LEADER,
    UserRole.CALL_CENTER_AGENT,
    UserRole.FOLLOWUP_AGENT,
  ],
  '/analytics': [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.TEAM_LEADER,
    UserRole.CLIENT_ADMIN,
    UserRole.CLIENT_USER,
  ],
  '/settings': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  '/dashboard/admin/users': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER],
  '/clients': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
};

interface CustomJWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  iat: number;
  exp: number;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/_vercel') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('accessToken')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  const isAuthRoute = AUTH_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  // If no tokens and not a public route, redirect to login
  if (!accessToken && !refreshToken && !isPublicRoute) {
    return redirectToLogin(request);
  }

  // If no access token but has refresh token, try to refresh
  if (!accessToken && refreshToken && !isPublicRoute) {
    try {
      const refreshResponse = await refreshAccessToken(refreshToken, request);
      if (refreshResponse) {
        return refreshResponse;
      } else {
        return redirectToLogin(request);
      }
    } catch (error) {
      console.error('Token refresh failed in middleware:', error);
      return redirectToLogin(request);
    }
  }

  // Validate access token if present
  let user: CustomJWTPayload | null = null;
  if (accessToken) {
    try {
      user = await validateAccessToken(accessToken);
    } catch (error) {
      console.error('Token validation failed:', error);
      
      // Try refresh token if available and not on public route
      if (refreshToken && !isPublicRoute) {
        try {
          const refreshResponse = await refreshAccessToken(refreshToken, request);
          if (refreshResponse) {
            return refreshResponse;
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
        
        // If refresh failed and not public route, redirect to login
        return redirectToLogin(request);
      }
      
      // If no refresh token and not public route, redirect to login
      if (!isPublicRoute) {
        return redirectToLogin(request);
      }
    }
  }

  // If user is authenticated and trying to access auth routes, redirect to dashboard
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Check role-based access for protected routes
  if (user && !isPublicRoute) {
    const hasAccess = checkRouteAccess(pathname, user.role);
    if (!hasAccess) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  // Add user info to headers for server components
  const response = NextResponse.next();
  if (user) {
    response.headers.set('x-user-id', user.sub);
    response.headers.set('x-user-email', user.email);
    response.headers.set('x-user-role', user.role);
    if (user.organizationId) {
      response.headers.set('x-organization-id', user.organizationId);
    }
  }

  return response;
}

async function validateAccessToken(token: string): Promise<CustomJWTPayload> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'dev-jwt-secret-key'
  );

  try {
    const { payload } = await jwtVerify(token, secret);
    
    // Validate that the payload has the required fields
    if (
      typeof payload.sub === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.role === 'string' &&
      typeof payload.iat === 'number' &&
      typeof payload.exp === 'number'
    ) {
      return {
        sub: payload.sub,
        email: payload.email,
        role: payload.role as UserRole,
        organizationId: payload.organizationId as string | undefined,
        iat: payload.iat,
        exp: payload.exp,
      };
    } else {
      throw new Error('Invalid token payload structure');
    }
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

async function refreshAccessToken(refreshToken: string, request: NextRequest): Promise<NextResponse | null> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      console.error('Refresh token response not ok:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (!data.tokens || !data.tokens.accessToken || !data.tokens.refreshToken) {
      console.error('Invalid token response structure:', data);
      return null;
    }

    const { accessToken, refreshToken: newRefreshToken } = data.tokens;

    // Create response that continues to the original request
    const nextResponse = NextResponse.next();
    
    // Set new cookies
    nextResponse.cookies.set('accessToken', accessToken, {
      httpOnly: false, // Allow client-side access for API calls
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    nextResponse.cookies.set('refreshToken', newRefreshToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return nextResponse;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/auth/login', request.url);
  
  // Add return URL for redirect after login
  if (request.nextUrl.pathname !== '/') {
    loginUrl.searchParams.set('returnUrl', request.nextUrl.pathname);
  }
  
  const response = NextResponse.redirect(loginUrl);
  
  // Clear invalid tokens
  response.cookies.delete('accessToken');
  response.cookies.delete('refreshToken');
  
  return response;
}

function checkRouteAccess(pathname: string, userRole: UserRole): boolean {
  // Check exact route matches first
  for (const [route, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return allowedRoles.includes(userRole);
    }
  }

  // Default: allow access if no specific route restrictions
  return true;
}

// Configure which routes this middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * - _vercel (Vercel internals)
     */
    '/((?!api|_next/static|_next/image|_vercel|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};