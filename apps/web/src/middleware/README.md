# Next.js Middleware for Route Protection

This directory contains the Next.js middleware implementation for the Confirmelo authentication system, providing comprehensive route protection, JWT token validation, and role-based access control.

## Overview

The middleware system provides:
- **Server-side route protection** at the edge before pages load
- **JWT token validation** with automatic refresh
- **Role-based access control** for different user types
- **Automatic redirects** based on authentication state
- **Token management** with secure cookie handling

## Architecture

```
middleware.ts (root)
├── JWT Token Validation
├── Token Refresh Logic
├── Route Access Control
├── Role-based Permissions
└── Redirect Management

src/lib/auth-utils.ts
├── Route Configuration
├── Permission Checking
├── Role Management
└── Navigation Items

src/components/auth/
├── ProtectedRoute (HOC)
├── ConditionalRender
└── Route Access Hooks

src/hooks/
├── useAuthRedirect
├── useLoginRedirect
└── useLogoutRedirect
```

## Core Components

### 1. Middleware (middleware.ts)

The main middleware file that runs on every request:

```typescript
// Route configuration
const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

const ROLE_ROUTES: Record<string, UserRole[]> = {
  '/dashboard': [/* all roles */],
  '/admin': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  '/teams': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER],
  // ... more routes
};
```

**Key Features:**
- Validates JWT tokens using the `jose` library
- Automatically refreshes expired access tokens
- Checks role-based route access
- Redirects unauthenticated users to login
- Redirects authenticated users away from auth pages
- Adds user context to request headers

### 2. Auth Utilities (src/lib/auth-utils.ts)

Client-side utilities for authentication and authorization:

```typescript
// Check route access
export function checkRouteAccess(pathname: string, userRole: UserRole): boolean

// Get role-based navigation items
export function getNavigationItems(userRole: UserRole)

// Permission checking
export function hasPermission(userRole: UserRole, permission: string): boolean
```

### 3. Protected Route Component

Higher-order component for client-side route protection:

```typescript
<ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
  <AdminPanel />
</ProtectedRoute>

// Conditional rendering based on roles
<ConditionalRender requiredRoles={[UserRole.ADMIN, UserRole.TEAM_LEADER]}>
  <ManageTeamButton />
</ConditionalRender>
```

## User Roles and Permissions

### Role Hierarchy

1. **SUPER_ADMIN**: Full system access
2. **ADMIN**: Organization management, full feature access
3. **TEAM_LEADER**: Team and store management, order assignment
4. **CALL_CENTER_AGENT**: Order confirmation interface
5. **FOLLOWUP_AGENT**: Reminder and follow-up management
6. **CLIENT_ADMIN**: Client organization management
7. **CLIENT_USER**: Read-only access to organization data

### Route Access Matrix

| Route | SUPER_ADMIN | ADMIN | TEAM_LEADER | CALL_CENTER_AGENT | FOLLOWUP_AGENT | CLIENT_ADMIN | CLIENT_USER |
|-------|-------------|-------|-------------|-------------------|----------------|--------------|-------------|
| `/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/admin` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/teams` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/orders` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/analytics` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `/settings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/clients` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Token Management

### JWT Token Flow

1. **Access Token**: Short-lived (15 minutes), used for API requests
2. **Refresh Token**: Long-lived (7 days, 30 days with "remember me")
3. **Automatic Refresh**: Middleware handles token refresh transparently

### Token Validation Process

```typescript
// 1. Extract tokens from cookies
const accessToken = request.cookies.get('accessToken')?.value;
const refreshToken = request.cookies.get('refreshToken')?.value;

// 2. Validate access token
const user = await validateAccessToken(accessToken);

// 3. If invalid, try refresh token
if (!user && refreshToken) {
  const newTokens = await refreshAccessToken(refreshToken);
  // Set new cookies and continue
}

// 4. Check route access based on user role
const hasAccess = checkRouteAccess(pathname, user.role);
```

## Security Features

### 1. Route Protection
- **Server-side validation** before page loads
- **Client-side guards** for additional protection
- **Role-based access control** at multiple levels

### 2. Token Security
- **HttpOnly cookies** for secure token storage
- **Automatic token refresh** to maintain sessions
- **Secure cookie settings** in production

### 3. Redirect Security
- **Return URL validation** to prevent open redirects
- **Role-based default redirects** after login
- **Automatic logout** on token expiration

## Usage Examples

### 1. Basic Route Protection

```typescript
// middleware.ts automatically protects routes
// No additional code needed for basic protection

// For client-side protection:
export default function ProtectedPage() {
  return (
    <ProtectedRoute>
      <PageContent />
    </ProtectedRoute>
  );
}
```

### 2. Role-Based Protection

```typescript
// Server-side (automatic via middleware)
// Client-side:
export default function AdminPage() {
  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <AdminPanel />
    </ProtectedRoute>
  );
}
```

### 3. Conditional Rendering

```typescript
function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      <ConditionalRender requiredRoles={[UserRole.ADMIN]}>
        <AdminControls />
      </ConditionalRender>
      
      <ConditionalRender requiredRoles={[UserRole.TEAM_LEADER, UserRole.ADMIN]}>
        <TeamManagement />
      </ConditionalRender>
    </div>
  );
}
```

### 4. Navigation Based on Role

```typescript
function Navigation() {
  const { user } = useAuth();
  
  return (
    <nav>
      <RoleBasedNav />
    </nav>
  );
}
```

### 5. Custom Route Access Checking

```typescript
function useCustomAccess() {
  const { hasAccess, loading } = useRouteAccess('/admin', [UserRole.ADMIN]);
  
  if (loading) return <LoadingSpinner />;
  if (!hasAccess) return <UnauthorizedMessage />;
  
  return <AdminContent />;
}
```

## Configuration

### Environment Variables

```env
# JWT Secret (must match API)
JWT_SECRET=your-jwt-secret-key

# API URL for token refresh
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Middleware Configuration

```typescript
// middleware.ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};
```

## Error Handling

### 1. Token Validation Errors
- **Invalid tokens**: Redirect to login
- **Expired tokens**: Attempt refresh, then redirect if failed
- **Network errors**: Graceful fallback with retry logic

### 2. Route Access Errors
- **Insufficient permissions**: Redirect to `/unauthorized`
- **Role changes**: Automatic permission updates
- **Session conflicts**: Clear invalid sessions

### 3. Redirect Errors
- **Invalid return URLs**: Sanitize and validate
- **Circular redirects**: Prevent with route checking
- **Missing routes**: Fallback to role-based defaults

## Testing

### 1. Middleware Testing
```bash
# Test route protection
curl -H "Cookie: accessToken=invalid" http://localhost:3000/dashboard
# Should redirect to login

# Test role-based access
curl -H "Cookie: accessToken=valid-agent-token" http://localhost:3000/admin
# Should redirect to unauthorized
```

### 2. Component Testing
```typescript
// Test protected route component
render(
  <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
    <AdminPanel />
  </ProtectedRoute>
);

// Should not render AdminPanel for non-admin users
```

## Performance Considerations

### 1. Middleware Optimization
- **Edge runtime** for fast token validation
- **Minimal dependencies** in middleware
- **Efficient route matching** with regex patterns

### 2. Client-side Optimization
- **Permission caching** to reduce API calls
- **Lazy loading** of protected components
- **Memoized route calculations**

### 3. Token Management
- **Automatic refresh** only when needed
- **Concurrent request handling** for token refresh
- **Efficient cookie management**

## Troubleshooting

### Common Issues

1. **Infinite redirects**: Check route configuration and token validation
2. **Permission denied**: Verify user role and route access matrix
3. **Token refresh failures**: Check API connectivity and token validity
4. **Middleware not running**: Verify matcher configuration

### Debug Mode

```typescript
// Enable debug logging in middleware
console.log('Middleware debug:', {
  pathname,
  hasToken: !!accessToken,
  userRole: user?.role,
  hasAccess: checkRouteAccess(pathname, user?.role),
});
```

## Best Practices

1. **Always use ProtectedRoute** for sensitive pages
2. **Implement proper error boundaries** for auth failures
3. **Cache permissions** to improve performance
4. **Validate tokens** on both server and client
5. **Use role-based navigation** to improve UX
6. **Handle edge cases** like token expiration gracefully
7. **Test all role combinations** thoroughly
8. **Monitor authentication metrics** in production

## Future Enhancements

1. **Permission-based access control** (beyond roles)
2. **Multi-factor authentication** support
3. **Session management** improvements
4. **Advanced audit logging**
5. **Rate limiting** integration
6. **WebSocket authentication** for real-time features