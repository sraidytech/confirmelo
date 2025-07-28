# Authentication Guards and Decorators

This directory contains the authentication and authorization system for the Confirmelo API, providing comprehensive security controls for the multi-role e-commerce order confirmation platform.

## Overview

The authentication system provides:
- JWT-based authentication with Passport.js
- Role-based access control (RBAC)
- Resource-level permissions
- Session management with Redis
- Comprehensive security decorators

## Guards

### JwtAuthGuard
Validates JWT tokens and ensures users are authenticated and active.

```typescript
@UseGuards(JwtAuthGuard)
@Get('protected')
protectedEndpoint() {
  return { message: 'Authenticated access' };
}
```

### RolesGuard
Enforces role-based and permission-based access control.

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TEAM_LEADER)
@Get('admin-only')
adminEndpoint() {
  return { message: 'Admin access' };
}
```

### ResourceAccessGuard
Provides resource-level access control with ownership checks.

```typescript
@UseGuards(JwtAuthGuard, ResourceAccessGuard)
@ResourceAccess({
  resource: 'order',
  action: 'read',
  resourceIdParam: 'orderId',
  allowOwner: true
})
@Get('orders/:orderId')
getOrder(@Param('orderId') orderId: string) {
  return this.orderService.findOne(orderId);
}
```

### SessionGuard
Validates active sessions stored in Redis.

```typescript
@UseGuards(JwtAuthGuard, SessionGuard)
@Get('session-required')
sessionEndpoint(@CurrentSession() session: any) {
  return { sessionId: session.sessionId };
}
```

## Decorators

### @Auth() - Combined Authentication
The `@Auth()` decorator combines multiple guards and provides a clean API:

```typescript
// Basic authentication
@Auth()
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;
}

// Role-based access
@Auth({ roles: [UserRole.ADMIN] })
@Get('admin-data')
getAdminData() {
  return this.adminService.getData();
}

// Permission-based access
@Auth({ permissions: ['orders:read', 'orders:write'] })
@Post('orders')
createOrder(@Body() orderData: CreateOrderDto) {
  return this.orderService.create(orderData);
}

// Resource-level access
@Auth({
  resourceAccess: {
    resource: 'order',
    action: 'read',
    resourceIdParam: 'orderId',
    allowOwner: true
  }
})
@Get('orders/:orderId')
getOrder(@Param('orderId') orderId: string) {
  return this.orderService.findOne(orderId);
}

// Session validation
@Auth({ requireSession: true })
@Get('session-info')
getSessionInfo(@CurrentSession() session: any) {
  return { lastActivity: session.lastActivity };
}

// Complex authentication
@Auth({
  roles: [UserRole.ADMIN],
  permissions: ['users:manage'],
  requireSession: true
})
@Put('users/:userId')
updateUser(@Param('userId') userId: string, @Body() userData: UpdateUserDto) {
  return this.userService.update(userId, userData);
}
```

### @Public() - Public Endpoints
Mark endpoints as public (no authentication required):

```typescript
@Public()
@Get('health')
healthCheck() {
  return { status: 'ok' };
}
```

### @CurrentUser() - Extract User Data
Extract authenticated user information:

```typescript
@Auth()
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;
}

// Extract specific user property
@Auth()
@Get('my-orders')
getMyOrders(@CurrentUser('id') userId: string) {
  return this.orderService.findByUserId(userId);
}
```

### @CurrentSession() - Extract Session Data
Extract session information (requires SessionGuard):

```typescript
@Auth({ requireSession: true })
@Get('session-info')
getSessionInfo(@CurrentSession() session: any) {
  return {
    sessionId: session.sessionId,
    lastActivity: session.lastActivity,
    ipAddress: session.ipAddress
  };
}
```

## User Roles and Permissions

### Role Hierarchy
- **SUPER_ADMIN**: Full system access
- **ADMIN**: Organization management, full feature access
- **TEAM_LEADER**: Team and store management, order assignment
- **CALL_CENTER_AGENT**: Order confirmation interface
- **FOLLOWUP_AGENT**: Reminder and follow-up management
- **CLIENT_ADMIN**: Client organization management
- **CLIENT_USER**: Read-only access to organization data

### Permission Format
Permissions follow the format `resource:action`:
- `orders:read` - Read order data
- `orders:write` - Create/update orders
- `orders:assign` - Assign orders to agents
- `users:read` - Read user data
- `users:write` - Create/update users
- `analytics:read` - Access analytics data
- `settings:write` - Modify system settings

### Resource-Level Access
Resources support scope-based access control:
- **Organization scope**: Users can only access their organization's data
- **Store scope**: Team leaders and agents can only access assigned stores
- **Team scope**: Users can only access their team's resources
- **Ownership**: Users can access resources they own

## Session Management

Sessions are stored in Redis and include:
- User ID and organization context
- Role and permissions cache
- WebSocket connection metadata
- IP address and user agent
- Last activity timestamp

```typescript
interface SessionData {
  userId: string;
  organizationId: string;
  role: UserRole;
  permissions: Permission[];
  assignments: Assignment[];
  websocketId?: string;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
}
```

## Security Features

### Rate Limiting
Built-in rate limiting with Redis backend:
- 10 requests/minute for auth endpoints
- Progressive delays for failed attempts
- Account lockout after 5 failed attempts

### Token Security
- Short-lived access tokens (15 minutes)
- Refresh token rotation
- Secure token storage and transmission
- Token blacklisting for immediate revocation

### Audit Logging
Comprehensive security event logging:
- Authentication attempts
- Permission changes
- Resource access
- Administrative actions

## Error Handling

The system provides consistent error responses:

```typescript
// Authentication errors
{
  "statusCode": 401,
  "message": "Invalid or expired token",
  "error": "Unauthorized"
}

// Authorization errors
{
  "statusCode": 403,
  "message": "Access denied. Required roles: ADMIN, TEAM_LEADER",
  "error": "Forbidden"
}

// Session errors
{
  "statusCode": 401,
  "message": "Session not found or expired",
  "error": "Unauthorized"
}
```

## Testing

The guards include comprehensive test coverage:

```bash
# Run guard tests
npm test -- --testPathPattern=guards

# Run specific guard test
npm test -- jwt-auth.guard.spec.ts
```

## Best Practices

1. **Use @Auth() decorator** for most endpoints instead of individual guards
2. **Apply @Public() explicitly** for public endpoints
3. **Use resource-level access** for fine-grained control
4. **Cache permissions** to improve performance
5. **Validate sessions** for real-time features
6. **Log security events** for audit trails
7. **Handle errors gracefully** with user-friendly messages

## Examples

See `apps/api/src/modules/auth/examples/protected.controller.ts` for comprehensive usage examples.