/**
 * Permission constants for the Confirmelo authentication system
 * Format: resource:action
 */

export const PERMISSIONS = {
  // User permissions
  USERS: {
    VIEW: 'users:read',
    CREATE: 'users:write',
    UPDATE: 'users:write',
    DELETE: 'users:delete',
    MANAGE_ROLES: 'users:manage',
  },

  // Order permissions
  ORDERS: {
    VIEW: 'orders:read',
    CREATE: 'orders:write',
    UPDATE: 'orders:write',
    DELETE: 'orders:delete',
    ASSIGN: 'orders:assign',
  },

  // Team permissions
  TEAM_MANAGEMENT: {
    VIEW: 'teams:read',
    CREATE: 'teams:write',
    UPDATE: 'teams:write',
    DELETE: 'teams:delete',
    ASSIGN_MEMBERS: 'teams:assign-members',
    ASSIGN_STORES: 'teams:assign-stores',
  },

  // Store permissions
  STORES: {
    VIEW: 'stores:read',
    CREATE: 'stores:write',
    UPDATE: 'stores:write',
    DELETE: 'stores:delete',
  },

  // Customer permissions
  CUSTOMERS: {
    VIEW: 'customers:read',
    CREATE: 'customers:write',
    UPDATE: 'customers:write',
    DELETE: 'customers:delete',
  },

  // Analytics permissions
  ANALYTICS: {
    VIEW: 'analytics:read',
    EXPORT: 'analytics:export',
  },

  // System permissions
  SYSTEM: {
    VIEW_AUDIT_LOGS: 'system:audit-logs',
    MANAGE_SETTINGS: 'system:settings',
    ADMIN: 'system:admin',
  },

  // Organization permissions
  ORGANIZATION: {
    VIEW: 'organization:read',
    UPDATE: 'organization:write',
    DELETE: 'organization:delete',
  },

  // Call permissions
  CALLS: {
    VIEW: 'calls:read',
    CREATE: 'calls:write',
    UPDATE: 'calls:write',
  },

  // Reminder permissions
  REMINDERS: {
    VIEW: 'reminders:read',
    CREATE: 'reminders:write',
    UPDATE: 'reminders:write',
  },
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];