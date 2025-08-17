import { UserRole } from '@/types/auth';
import Cookies from 'js-cookie';

/**
 * Client-side authentication utilities
 */

// Route access configuration (matches middleware)
export const ROLE_ROUTES: Record<string, UserRole[]> = {
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
  '/dashboard/orders': [
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
  '/dashboard/platform-connections': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN],
  '/clients': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
};

export const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

/**
 * Check if a route is public (doesn't require authentication)
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );
}

/**
 * Check if a route is an auth route (login, register, etc.)
 */
export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );
}

/**
 * Check if user has access to a specific route based on their role
 */
export function checkRouteAccess(pathname: string, userRole: UserRole): boolean {
  // Check exact route matches first
  for (const [route, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return allowedRoles.includes(userRole);
    }
  }

  // Default: allow access if no specific route restrictions
  return true;
}

/**
 * Get the appropriate redirect URL based on user role
 */
export function getDefaultRedirectUrl(userRole: UserRole): string {
  switch (userRole) {
    case UserRole.SUPER_ADMIN:
    case UserRole.ADMIN:
      return '/dashboard';
    case UserRole.TEAM_LEADER:
      return '/dashboard';
    case UserRole.CALL_CENTER_AGENT:
      return '/dashboard/orders';
    case UserRole.FOLLOWUP_AGENT:
      return '/dashboard/orders';
    case UserRole.CLIENT_ADMIN:
      return '/analytics';
    case UserRole.CLIENT_USER:
      return '/analytics';
    default:
      return '/dashboard';
  }
}

/**
 * Check if user is authenticated (has valid tokens)
 */
export function isAuthenticated(): boolean {
  const accessToken = Cookies.get('accessToken');
  const refreshToken = Cookies.get('refreshToken');
  return !!(accessToken || refreshToken);
}

/**
 * Clear authentication tokens
 */
export function clearAuthTokens(): void {
  Cookies.remove('accessToken');
  Cookies.remove('refreshToken');
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  const roleNames: Record<UserRole, string> = {
    [UserRole.SUPER_ADMIN]: 'Super Administrator',
    [UserRole.ADMIN]: 'Administrator',
    [UserRole.TEAM_LEADER]: 'Team Leader',
    [UserRole.CALL_CENTER_AGENT]: 'Call Center Agent',
    [UserRole.FOLLOWUP_AGENT]: 'Follow-up Agent',
    [UserRole.CLIENT_ADMIN]: 'Client Administrator',
    [UserRole.CLIENT_USER]: 'Client User',
  };

  return roleNames[role] || role;
}

/**
 * Get role permissions description
 */
export function getRolePermissions(role: UserRole): string[] {
  const permissions: Record<UserRole, string[]> = {
    [UserRole.SUPER_ADMIN]: [
      'Full system access',
      'Manage all organizations',
      'System configuration',
      'User management across all organizations',
    ],
    [UserRole.ADMIN]: [
      'Organization management',
      'User management',
      'Team management',
      'Order management',
      'Analytics access',
      'Settings configuration',
    ],
    [UserRole.TEAM_LEADER]: [
      'Team management',
      'Store assignment',
      'Order assignment',
      'Team analytics',
      'Agent supervision',
    ],
    [UserRole.CALL_CENTER_AGENT]: [
      'Order confirmation',
      'Customer communication',
      'Call logging',
      'Order status updates',
    ],
    [UserRole.FOLLOWUP_AGENT]: [
      'Follow-up management',
      'Reminder scheduling',
      'Customer communication',
      'Order tracking',
    ],
    [UserRole.CLIENT_ADMIN]: [
      'Client organization management',
      'Client user management',
      'Order viewing',
      'Analytics access',
    ],
    [UserRole.CLIENT_USER]: [
      'Order viewing',
      'Basic analytics',
      'Read-only access',
    ],
  };

  return permissions[role] || [];
}

/**
 * Check if user has permission for a specific action
 */
export function hasPermission(userRole: UserRole, permission: string): boolean {
  // Super admin has all permissions
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }

  // Define role-based permissions
  const rolePermissions: Record<UserRole, string[]> = {
    [UserRole.SUPER_ADMIN]: ['*'],
    [UserRole.ADMIN]: [
      'users:read', 'users:write', 'users:delete',
      'teams:read', 'teams:write', 'teams:delete',
      'orders:read', 'orders:write', 'orders:assign',
      'analytics:read',
      'settings:read', 'settings:write',
      'organization:read', 'organization:write',
    ],
    [UserRole.TEAM_LEADER]: [
      'teams:read', 'teams:write',
      'users:read',
      'orders:read', 'orders:write', 'orders:assign',
      'analytics:read',
    ],
    [UserRole.CALL_CENTER_AGENT]: [
      'orders:read', 'orders:write',
      'customers:read', 'customers:write',
      'calls:read', 'calls:write',
    ],
    [UserRole.FOLLOWUP_AGENT]: [
      'orders:read', 'orders:write',
      'customers:read',
      'reminders:read', 'reminders:write',
    ],
    [UserRole.CLIENT_ADMIN]: [
      'organization:read', 'organization:write',
      'users:read', 'users:write',
      'orders:read',
      'analytics:read',
    ],
    [UserRole.CLIENT_USER]: [
      'orders:read',
      'analytics:read',
    ],
  };

  const userPermissions = rolePermissions[userRole] || [];
  return userPermissions.includes('*') || userPermissions.includes(permission);
}

/**
 * Get navigation items based on user role
 */
export function getNavigationItems(userRole: UserRole) {
  const allItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      permission: 'dashboard:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CALL_CENTER_AGENT, UserRole.FOLLOWUP_AGENT, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER],
    },
    {
      name: 'Orders',
      href: '/dashboard/orders',
      permission: 'orders:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CALL_CENTER_AGENT, UserRole.FOLLOWUP_AGENT],
    },
    {
      name: 'Teams',
      href: '/teams',
      permission: 'teams:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER],
    },
    {
      name: 'Users',
      href: '/dashboard/admin/users',
      permission: 'users:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER],
    },
    {
      name: 'Platform Connections',
      href: '/dashboard/platform-connections',
      permission: 'platform:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN],
    },
    {
      name: 'Analytics',
      href: '/analytics',
      permission: 'analytics:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEAM_LEADER, UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER],
    },
    {
      name: 'Clients',
      href: '/clients',
      permission: 'clients:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    },
    {
      name: 'Settings',
      href: '/settings',
      permission: 'settings:read',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    },
  ];

  return allItems.filter(item => item.roles.includes(userRole));
}