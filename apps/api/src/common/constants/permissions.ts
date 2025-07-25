// Permission constants for the Confirmelo authentication system
export const PERMISSIONS = {
  // Organization Management
  ORGANIZATION: {
    VIEW: 'organization:view',
    EDIT: 'organization:edit',
    DELETE: 'organization:delete',
    MANAGE_SETTINGS: 'organization:manage_settings',
  },

  // User Management
  USERS: {
    VIEW: 'users:view',
    CREATE: 'users:create',
    EDIT: 'users:edit',
    DELETE: 'users:delete',
    MANAGE_ROLES: 'users:manage_roles',
  },

  // Team Management
  TEAMS: {
    VIEW: 'teams:view',
    CREATE: 'teams:create',
    EDIT: 'teams:edit',
    DELETE: 'teams:delete',
    MANAGE_MEMBERS: 'teams:manage_members',
    ASSIGN_STORES: 'teams:assign_stores',
  },

  // Team Assignment Management
  TEAM_MANAGEMENT: {
    VIEW_ASSIGNMENTS: 'team_management:view_assignments',
    ASSIGN_MEMBERS: 'team_management:assign_members',
    REMOVE_MEMBERS: 'team_management:remove_members',
    ASSIGN_STORES: 'team_management:assign_stores',
    REMOVE_STORES: 'team_management:remove_stores',
    VALIDATE_ACCESS: 'team_management:validate_access',
  },

  // Order Management
  ORDERS: {
    VIEW: 'orders:view',
    CREATE: 'orders:create',
    EDIT: 'orders:edit',
    DELETE: 'orders:delete',
    ASSIGN: 'orders:assign',
    CONFIRM: 'orders:confirm',
    CANCEL: 'orders:cancel',
    VIEW_ALL: 'orders:view_all', // View all organization orders
    IMPORT: 'orders:import',
    EXPORT: 'orders:export',
  },

  // Customer Management
  CUSTOMERS: {
    VIEW: 'customers:view',
    CREATE: 'customers:create',
    EDIT: 'customers:edit',
    DELETE: 'customers:delete',
    VIEW_HISTORY: 'customers:view_history',
  },

  // Product Management
  PRODUCTS: {
    VIEW: 'products:view',
    CREATE: 'products:create',
    EDIT: 'products:edit',
    DELETE: 'products:delete',
    MANAGE_CATEGORIES: 'products:manage_categories',
    MANAGE_INVENTORY: 'products:manage_inventory',
  },

  // Store Management
  STORES: {
    VIEW: 'stores:view',
    CREATE: 'stores:create',
    EDIT: 'stores:edit',
    DELETE: 'stores:delete',
    MANAGE_ASSIGNMENTS: 'stores:manage_assignments',
  },

  // Communication
  COMMUNICATION: {
    MAKE_CALLS: 'communication:make_calls',
    VIEW_CALL_LOGS: 'communication:view_call_logs',
    MANAGE_CALL_STATUSES: 'communication:manage_call_statuses',
    SEND_MESSAGES: 'communication:send_messages',
  },

  // Shipping
  SHIPPING: {
    VIEW: 'shipping:view',
    CREATE_SHIPMENTS: 'shipping:create_shipments',
    MANAGE_COMPANIES: 'shipping:manage_companies',
    TRACK_SHIPMENTS: 'shipping:track_shipments',
  },

  // Analytics & Reporting
  ANALYTICS: {
    VIEW_BASIC: 'analytics:view_basic',
    VIEW_ADVANCED: 'analytics:view_advanced',
    EXPORT_REPORTS: 'analytics:export_reports',
    VIEW_ALL_ORGS: 'analytics:view_all_orgs', // Super admin analytics
  },

  // System Administration
  SYSTEM: {
    MANAGE_SETTINGS: 'system:manage_settings',
    VIEW_AUDIT_LOGS: 'system:view_audit_logs',
    MANAGE_INTEGRATIONS: 'system:manage_integrations',
    SYSTEM_HEALTH: 'system:health',
  },

  // Platform Connections (OAuth2)
  PLATFORMS: {
    VIEW: 'platforms:view',
    CONNECT: 'platforms:connect',
    DISCONNECT: 'platforms:disconnect',
    MANAGE: 'platforms:manage',
  },
} as const;

// Role-based permission mappings
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    // Full system access
    ...Object.values(PERMISSIONS.ORGANIZATION),
    ...Object.values(PERMISSIONS.USERS),
    ...Object.values(PERMISSIONS.TEAMS),
    ...Object.values(PERMISSIONS.ORDERS),
    ...Object.values(PERMISSIONS.CUSTOMERS),
    ...Object.values(PERMISSIONS.PRODUCTS),
    ...Object.values(PERMISSIONS.STORES),
    ...Object.values(PERMISSIONS.COMMUNICATION),
    ...Object.values(PERMISSIONS.SHIPPING),
    ...Object.values(PERMISSIONS.ANALYTICS),
    ...Object.values(PERMISSIONS.SYSTEM),
    ...Object.values(PERMISSIONS.PLATFORMS),
  ],

  ADMIN: [
    // Organization-scoped full access
    PERMISSIONS.ORGANIZATION.VIEW,
    PERMISSIONS.ORGANIZATION.EDIT,
    PERMISSIONS.ORGANIZATION.MANAGE_SETTINGS,
    
    PERMISSIONS.USERS.VIEW,
    PERMISSIONS.USERS.CREATE,
    PERMISSIONS.USERS.EDIT,
    PERMISSIONS.USERS.DELETE,
    PERMISSIONS.USERS.MANAGE_ROLES,
    
    PERMISSIONS.TEAMS.VIEW,
    PERMISSIONS.TEAMS.CREATE,
    PERMISSIONS.TEAMS.EDIT,
    PERMISSIONS.TEAMS.DELETE,
    PERMISSIONS.TEAMS.MANAGE_MEMBERS,
    PERMISSIONS.TEAMS.ASSIGN_STORES,
    
    ...Object.values(PERMISSIONS.TEAM_MANAGEMENT),
    
    PERMISSIONS.ORDERS.VIEW,
    PERMISSIONS.ORDERS.CREATE,
    PERMISSIONS.ORDERS.EDIT,
    PERMISSIONS.ORDERS.DELETE,
    PERMISSIONS.ORDERS.ASSIGN,
    PERMISSIONS.ORDERS.CONFIRM,
    PERMISSIONS.ORDERS.CANCEL,
    PERMISSIONS.ORDERS.VIEW_ALL,
    PERMISSIONS.ORDERS.IMPORT,
    PERMISSIONS.ORDERS.EXPORT,
    
    PERMISSIONS.CUSTOMERS.VIEW,
    PERMISSIONS.CUSTOMERS.CREATE,
    PERMISSIONS.CUSTOMERS.EDIT,
    PERMISSIONS.CUSTOMERS.DELETE,
    PERMISSIONS.CUSTOMERS.VIEW_HISTORY,
    
    PERMISSIONS.PRODUCTS.VIEW,
    PERMISSIONS.PRODUCTS.CREATE,
    PERMISSIONS.PRODUCTS.EDIT,
    PERMISSIONS.PRODUCTS.DELETE,
    PERMISSIONS.PRODUCTS.MANAGE_CATEGORIES,
    PERMISSIONS.PRODUCTS.MANAGE_INVENTORY,
    
    PERMISSIONS.STORES.VIEW,
    PERMISSIONS.STORES.CREATE,
    PERMISSIONS.STORES.EDIT,
    PERMISSIONS.STORES.DELETE,
    PERMISSIONS.STORES.MANAGE_ASSIGNMENTS,
    
    PERMISSIONS.COMMUNICATION.MAKE_CALLS,
    PERMISSIONS.COMMUNICATION.VIEW_CALL_LOGS,
    PERMISSIONS.COMMUNICATION.MANAGE_CALL_STATUSES,
    PERMISSIONS.COMMUNICATION.SEND_MESSAGES,
    
    PERMISSIONS.SHIPPING.VIEW,
    PERMISSIONS.SHIPPING.CREATE_SHIPMENTS,
    PERMISSIONS.SHIPPING.MANAGE_COMPANIES,
    PERMISSIONS.SHIPPING.TRACK_SHIPMENTS,
    
    PERMISSIONS.ANALYTICS.VIEW_BASIC,
    PERMISSIONS.ANALYTICS.VIEW_ADVANCED,
    PERMISSIONS.ANALYTICS.EXPORT_REPORTS,
    
    PERMISSIONS.PLATFORMS.VIEW,
    PERMISSIONS.PLATFORMS.CONNECT,
    PERMISSIONS.PLATFORMS.DISCONNECT,
    PERMISSIONS.PLATFORMS.MANAGE,
  ],

  TEAM_LEADER: [
    // Team-scoped management
    PERMISSIONS.ORGANIZATION.VIEW,
    
    PERMISSIONS.USERS.VIEW,
    PERMISSIONS.USERS.CREATE, // Can create team members
    PERMISSIONS.USERS.EDIT, // Can edit team members
    
    PERMISSIONS.TEAMS.VIEW,
    PERMISSIONS.TEAMS.EDIT,
    PERMISSIONS.TEAMS.MANAGE_MEMBERS,
    
    PERMISSIONS.TEAM_MANAGEMENT.VIEW_ASSIGNMENTS,
    PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_MEMBERS,
    PERMISSIONS.TEAM_MANAGEMENT.REMOVE_MEMBERS,
    PERMISSIONS.TEAM_MANAGEMENT.ASSIGN_STORES,
    PERMISSIONS.TEAM_MANAGEMENT.REMOVE_STORES,
    
    PERMISSIONS.ORDERS.VIEW,
    PERMISSIONS.ORDERS.CREATE,
    PERMISSIONS.ORDERS.EDIT,
    PERMISSIONS.ORDERS.ASSIGN,
    PERMISSIONS.ORDERS.CONFIRM,
    PERMISSIONS.ORDERS.CANCEL,
    
    PERMISSIONS.CUSTOMERS.VIEW,
    PERMISSIONS.CUSTOMERS.CREATE,
    PERMISSIONS.CUSTOMERS.EDIT,
    PERMISSIONS.CUSTOMERS.VIEW_HISTORY,
    
    PERMISSIONS.PRODUCTS.VIEW,
    
    PERMISSIONS.STORES.VIEW,
    
    PERMISSIONS.COMMUNICATION.MAKE_CALLS,
    PERMISSIONS.COMMUNICATION.VIEW_CALL_LOGS,
    PERMISSIONS.COMMUNICATION.SEND_MESSAGES,
    
    PERMISSIONS.SHIPPING.VIEW,
    PERMISSIONS.SHIPPING.CREATE_SHIPMENTS,
    PERMISSIONS.SHIPPING.TRACK_SHIPMENTS,
    
    PERMISSIONS.ANALYTICS.VIEW_BASIC,
    PERMISSIONS.ANALYTICS.VIEW_ADVANCED,
  ],

  CALL_CENTER_AGENT: [
    // Order confirmation focused
    PERMISSIONS.ORGANIZATION.VIEW,
    
    PERMISSIONS.ORDERS.VIEW,
    PERMISSIONS.ORDERS.EDIT, // Can update order details
    PERMISSIONS.ORDERS.CONFIRM,
    PERMISSIONS.ORDERS.CANCEL,
    
    PERMISSIONS.CUSTOMERS.VIEW,
    PERMISSIONS.CUSTOMERS.CREATE,
    PERMISSIONS.CUSTOMERS.EDIT,
    PERMISSIONS.CUSTOMERS.VIEW_HISTORY,
    
    PERMISSIONS.PRODUCTS.VIEW,
    PERMISSIONS.PRODUCTS.EDIT, // Can update product details
    
    PERMISSIONS.STORES.VIEW,
    
    PERMISSIONS.COMMUNICATION.MAKE_CALLS,
    PERMISSIONS.COMMUNICATION.VIEW_CALL_LOGS,
    PERMISSIONS.COMMUNICATION.SEND_MESSAGES,
    
    PERMISSIONS.SHIPPING.VIEW,
    PERMISSIONS.SHIPPING.CREATE_SHIPMENTS,
    PERMISSIONS.SHIPPING.TRACK_SHIPMENTS,
    
    PERMISSIONS.ANALYTICS.VIEW_BASIC,
  ],

  FOLLOWUP_AGENT: [
    // Follow-up focused
    PERMISSIONS.ORGANIZATION.VIEW,
    
    PERMISSIONS.ORDERS.VIEW,
    PERMISSIONS.ORDERS.EDIT, // Can update follow-up status
    PERMISSIONS.ORDERS.CONFIRM,
    PERMISSIONS.ORDERS.CANCEL,
    
    PERMISSIONS.CUSTOMERS.VIEW,
    PERMISSIONS.CUSTOMERS.EDIT,
    PERMISSIONS.CUSTOMERS.VIEW_HISTORY,
    
    PERMISSIONS.PRODUCTS.VIEW,
    
    PERMISSIONS.COMMUNICATION.MAKE_CALLS,
    PERMISSIONS.COMMUNICATION.VIEW_CALL_LOGS, // Own call logs
    PERMISSIONS.COMMUNICATION.SEND_MESSAGES,
    
    PERMISSIONS.SHIPPING.VIEW,
    PERMISSIONS.SHIPPING.TRACK_SHIPMENTS,
    
    PERMISSIONS.ANALYTICS.VIEW_BASIC,
  ],

  CLIENT_ADMIN: [
    // Client organization management
    PERMISSIONS.ORGANIZATION.VIEW,
    PERMISSIONS.ORGANIZATION.EDIT,
    PERMISSIONS.ORGANIZATION.MANAGE_SETTINGS,
    
    PERMISSIONS.USERS.VIEW, // Own organization users
    PERMISSIONS.USERS.CREATE,
    PERMISSIONS.USERS.EDIT,
    PERMISSIONS.USERS.DELETE,
    
    PERMISSIONS.ORDERS.VIEW, // Own organization orders
    PERMISSIONS.ORDERS.CREATE,
    PERMISSIONS.ORDERS.EDIT,
    PERMISSIONS.ORDERS.DELETE,
    PERMISSIONS.ORDERS.IMPORT,
    PERMISSIONS.ORDERS.EXPORT,
    
    PERMISSIONS.CUSTOMERS.VIEW,
    PERMISSIONS.CUSTOMERS.CREATE,
    PERMISSIONS.CUSTOMERS.EDIT,
    PERMISSIONS.CUSTOMERS.DELETE,
    PERMISSIONS.CUSTOMERS.VIEW_HISTORY,
    
    PERMISSIONS.PRODUCTS.VIEW,
    PERMISSIONS.PRODUCTS.CREATE,
    PERMISSIONS.PRODUCTS.EDIT,
    PERMISSIONS.PRODUCTS.DELETE,
    PERMISSIONS.PRODUCTS.MANAGE_CATEGORIES,
    PERMISSIONS.PRODUCTS.MANAGE_INVENTORY,
    
    PERMISSIONS.STORES.VIEW,
    PERMISSIONS.STORES.CREATE,
    PERMISSIONS.STORES.EDIT,
    PERMISSIONS.STORES.DELETE,
    
    PERMISSIONS.ANALYTICS.VIEW_BASIC,
    PERMISSIONS.ANALYTICS.VIEW_ADVANCED,
    PERMISSIONS.ANALYTICS.EXPORT_REPORTS,
    
    PERMISSIONS.PLATFORMS.VIEW,
    PERMISSIONS.PLATFORMS.CONNECT,
    PERMISSIONS.PLATFORMS.DISCONNECT,
  ],

  CLIENT_USER: [
    // Read-only access to own organization data
    PERMISSIONS.ORGANIZATION.VIEW,
    
    PERMISSIONS.ORDERS.VIEW, // Own organization orders
    
    PERMISSIONS.CUSTOMERS.VIEW,
    PERMISSIONS.CUSTOMERS.VIEW_HISTORY,
    
    PERMISSIONS.PRODUCTS.VIEW,
    
    PERMISSIONS.STORES.VIEW,
    
    PERMISSIONS.ANALYTICS.VIEW_BASIC,
    
    PERMISSIONS.PLATFORMS.VIEW,
  ],
} as const;

// Helper function to get permissions for a role
export function getPermissionsForRole(role: string): string[] {
  return (ROLE_PERMISSIONS as any)[role] || [];
}

// Helper function to check if a role has a specific permission
export function roleHasPermission(role: string, permission: string): boolean {
  return getPermissionsForRole(role).includes(permission);
}

// Permission categories for UI organization
export const PERMISSION_CATEGORIES = {
  'Organization Management': Object.values(PERMISSIONS.ORGANIZATION),
  'User Management': Object.values(PERMISSIONS.USERS),
  'Team Management': [...Object.values(PERMISSIONS.TEAMS), ...Object.values(PERMISSIONS.TEAM_MANAGEMENT)],
  'Order Management': Object.values(PERMISSIONS.ORDERS),
  'Customer Management': Object.values(PERMISSIONS.CUSTOMERS),
  'Product Management': Object.values(PERMISSIONS.PRODUCTS),
  'Store Management': Object.values(PERMISSIONS.STORES),
  'Communication': Object.values(PERMISSIONS.COMMUNICATION),
  'Shipping': Object.values(PERMISSIONS.SHIPPING),
  'Analytics & Reporting': Object.values(PERMISSIONS.ANALYTICS),
  'System Administration': Object.values(PERMISSIONS.SYSTEM),
  'Platform Connections': Object.values(PERMISSIONS.PLATFORMS),
};

// Export all permission values as a flat array
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap(category => Object.values(category));

// Export permission types for TypeScript
export type Permission = typeof ALL_PERMISSIONS[number];
export type PermissionCategory = keyof typeof PERMISSION_CATEGORIES;