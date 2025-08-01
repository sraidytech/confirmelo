# Confirmelo Authentication System API Documentation

## Overview

The Confirmelo Authentication System provides a comprehensive REST API for managing authentication, authorization, user management, and real-time features for a multi-tenant SaaS e-commerce order confirmation platform.

### Base URL
```
https://api.confirmelo.com/api
```

### Authentication
Most endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <access_token>
```

### Rate Limiting
- Authentication endpoints: 10 requests/minute
- General endpoints: 100 requests/minute
- Rate limits are applied per IP address and per user

### Response Format
All API responses follow a consistent format:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Handling
Error responses include:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": { ... },
    "correlationId": "[CORRELATION_ID]"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Authentication Endpoints

### Health Check
Check the health status of the authentication service.

**Endpoint:** `GET /auth/health`  
**Authentication:** None required  
**Rate Limit:** None

**Response:**
```json
{
  "status": "ok",
  "message": "Authentication service is running",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Organization Registration
Register a new organization with an admin user account.

**Endpoint:** `POST /auth/register`  
**Authentication:** None required  
**Rate Limit:** 10 requests/minute

**Request Body:**
```json
{
  "organization": {
    "name": "[ORGANIZATION_NAME]",
    "email": "[ADMIN_EMAIL]",
    "phone": "[PHONE_NUMBER]",
    "address": "[ADDRESS]",
    "city": "[CITY]",
    "website": "[WEBSITE_URL]",
    "taxId": "[TAX_ID]"
  },
  "adminUser": {
    "email": "[ADMIN_EMAIL]",
    "username": "admin",
    "password": "[SECURE_PASSWORD]",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "phone": "[PHONE_NUMBER]"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Organization registered successfully",
  "organization": {
    "id": "org_123456789",
    "name": "[ORGANIZATION_NAME]",
    "code": "ACME001",
    "email": "[ADMIN_EMAIL]"
  },
  "user": {
    "id": "user_123456789",
    "email": "[ADMIN_EMAIL]",
    "username": "admin",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "role": "ADMIN",
    "status": "ACTIVE"
  }
}
```

**Validation Rules:**
- Organization name: 2-100 characters
- Email: Valid email format, unique across system
- Password: Minimum 12 characters, must include uppercase, lowercase, number, and special character
- Phone: Valid international format

### User Login
Authenticate a user and receive JWT tokens.

**Endpoint:** `POST /auth/login`  
**Authentication:** None required  
**Rate Limit:** 10 requests/minute

**Request Body:**
```json
{
  "email": "[USER_EMAIL]",
  "password": "[SECURE_PASSWORD]",
  "rememberMe": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "user_123456789",
    "email": "[USER_EMAIL]",
    "username": "[USERNAME]",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "role": "ADMIN",
    "status": "ACTIVE",
    "organizationId": "org_123456789",
    "isOnline": true
  },
  "tokens": {
    "accessToken": "[JWT_TOKEN]",
    "refreshToken": "[JWT_TOKEN]",
    "expiresIn": 900
  },
  "sessionId": "[SESSION_TOKEN]"
}
```

**Security Features:**
- Progressive delays for failed attempts (1s, 2s, 4s, 8s)
- Account lockout after 5 failed attempts
- IP-based rate limiting
- Secure session creation

### Token Refresh
Refresh an expired access token using a valid refresh token.

**Endpoint:** `POST /auth/refresh`  
**Authentication:** None required  
**Rate Limit:** 10 requests/minute

**Request Body:**
```json
{
  "refreshToken": "[JWT_TOKEN]"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "tokens": {
    "accessToken": "[JWT_TOKEN]",
    "refreshToken": "[JWT_TOKEN]",
    "expiresIn": 900
  }
}
```

### Get Current User
Retrieve the current authenticated user's profile information.

**Endpoint:** `GET /auth/me`  
**Authentication:** Required (JWT)  
**Rate Limit:** 100 requests/minute

**Response (200 OK):**
```json
{
  "id": "user_123456789",
  "email": "[USER_EMAIL]",
  "username": "[USERNAME]",
  "firstName": "[FIRST_NAME]",
  "lastName": "[LAST_NAME]",
  "phone": "[PHONE_NUMBER]",
  "avatar": "[AVATAR_URL]",
  "role": "ADMIN",
  "status": "ACTIVE",
  "isOnline": true,
  "lastActiveAt": "2024-01-15T10:25:00Z",
  "organizationId": "org_123456789",
  "organization": {
    "id": "org_123456789",
    "name": "[ORGANIZATION_NAME]",
    "code": "ACME001",
    "email": "[ADMIN_EMAIL]",
    "country": "MA",
    "timezone": "UTC",
    "currency": "MAD"
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:25:00Z"
}
```

### User Logout
Logout the current user and invalidate their session.

**Endpoint:** `POST /auth/logout`  
**Authentication:** Required (JWT)  
**Rate Limit:** 10 requests/minute

**Request Body:**
```json
{
  "sessionId": "[SESSION_TOKEN]",
  "logoutFromAll": false
}
```

**Response (200 OK):**
```json
{
  "message": "Logout successful",
  "userId": "user_123456789",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Logout from All Devices
Logout the user from all active sessions/devices.

**Endpoint:** `POST /auth/logout-all`  
**Authentication:** Required (JWT)  
**Rate Limit:** 10 requests/minute

**Response (200 OK):**
```json
{
  "message": "Successfully logged out from all devices",
  "userId": "user_123456789",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Session Management Endpoints

### Get User Sessions
Retrieve all active sessions for the current user.

**Endpoint:** `GET /auth/sessions`  
**Authentication:** Required (JWT)  
**Query Parameters:**
- `includeExpired` (boolean, optional): Include expired sessions

**Response (200 OK):**
```json
{
  "sessions": [
    {
      "id": "session_123456789",
      "sessionToken": "[SESSION_TOKEN]",
      "userId": "user_123456789",
      "ipAddress": "[IP_ADDRESS]",
      "userAgent": "[USER_AGENT]",
      "isActive": true,
      "expiresAt": "2024-01-22T10:30:00Z",
      "createdAt": "2024-01-15T10:30:00Z",
      "lastActivity": "2024-01-15T10:25:00Z",
      "location": {
        "country": "[COUNTRY]",
        "city": "[CITY]"
      },
      "device": {
        "type": "desktop",
        "os": "[OS_NAME]",
        "browser": "[BROWSER_NAME]"
      }
    }
  ],
  "total": 1,
  "active": 1
}
```

### Get Session Statistics
Get statistical information about user sessions.

**Endpoint:** `GET /auth/sessions/stats`  
**Authentication:** Required (JWT)

**Response (200 OK):**
```json
{
  "totalSessions": 5,
  "activeSessions": 2,
  "expiredSessions": 3,
  "devicesUsed": ["desktop", "mobile"],
  "locationsUsed": ["[CITY]", "[CITY]"],
  "lastLoginAt": "2024-01-15T10:30:00Z",
  "averageSessionDuration": 3600
}
```

### Get Session Activity
Retrieve session activity history.

**Endpoint:** `GET /auth/sessions/activity`  
**Authentication:** Required (JWT)  
**Query Parameters:**
- `sessionId` (string, optional): Filter by specific session

**Response (200 OK):**
```json
[
  {
    "sessionId": "session_123456789",
    "action": "login",
    "timestamp": "2024-01-15T10:30:00Z",
    "ipAddress": "[IP_ADDRESS]",
    "userAgent": "[USER_AGENT]",
    "details": {
      "loginMethod": "password",
      "rememberMe": false
    }
  }
]
```

### Terminate Session
Terminate a specific session.

**Endpoint:** `DELETE /auth/sessions/:sessionId`  
**Authentication:** Required (JWT)  
**Path Parameters:**
- `sessionId` (string): Session ID to terminate

**Request Body:**
```json
{
  "reason": "User requested termination"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Session terminated successfully",
  "sessionId": "session_123456789",
  "terminatedAt": "2024-01-15T10:30:00Z"
}
```

## User Profile Management Endpoints

### Get User Profile
Retrieve the current user's detailed profile information.

**Endpoint:** `GET /users/profile`  
**Authentication:** Required (JWT)

**Response (200 OK):**
```json
{
  "id": "user_123456789",
  "email": "[USER_EMAIL]",
  "username": "[USERNAME]",
  "firstName": "[FIRST_NAME]",
  "lastName": "[LAST_NAME]",
  "phone": "[PHONE_NUMBER]",
  "avatar": "[AVATAR_URL]",
  "role": "ADMIN",
  "status": "ACTIVE",
  "isOnline": true,
  "lastActiveAt": "2024-01-15T10:25:00Z",
  "organizationId": "org_123456789",
  "preferences": {
    "language": "en",
    "timezone": "UTC",
    "notifications": {
      "email": true,
      "push": true,
      "sms": false
    }
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:25:00Z"
}
```

### Update User Profile
Update the current user's profile information.

**Endpoint:** `PUT /users/profile`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "firstName": "[FIRST_NAME]",
  "lastName": "[LAST_NAME]",
  "phone": "[PHONE_NUMBER]",
  "preferences": {
    "language": "en",
    "timezone": "UTC",
    "notifications": {
      "email": true,
      "push": true,
      "sms": false
    }
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "id": "user_123456789",
    "email": "[USER_EMAIL]",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "phone": "[PHONE_NUMBER]",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Change Password
Change the current user's password.

**Endpoint:** `POST /users/change-password`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "currentPassword": "[OLD_PASSWORD]",
  "newPassword": "New[SECURE_PASSWORD]",
  "confirmPassword": "New[SECURE_PASSWORD]"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password changed successfully",
  "passwordStrength": {
    "score": 4,
    "feedback": "Strong password"
  }
}
```

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not in common password lists

### Update Avatar
Update the user's avatar URL.

**Endpoint:** `PUT /users/avatar`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "avatarUrl": "[AVATAR_URL]"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Avatar updated successfully",
  "avatarUrl": "[AVATAR_URL]"
}
```

## User Presence and Activity Endpoints

### Update User Activity
Update the user's last activity timestamp.

**Endpoint:** `POST /users/activity`  
**Authentication:** Required (JWT)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Activity updated successfully"
}
```

### Get Online Status
Get the current user's online status.

**Endpoint:** `GET /users/online-status`  
**Authentication:** Required (JWT)

**Response (200 OK):**
```json
{
  "isOnline": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Get User Presence
Get detailed presence information for a specific user.

**Endpoint:** `GET /users/:userId/presence`  
**Authentication:** Required (JWT)  
**Path Parameters:**
- `userId` (string): User ID to get presence for

**Response (200 OK):**
```json
{
  "userId": "user_123456789",
  "isOnline": true,
  "lastActiveAt": "2024-01-15T10:25:00Z",
  "status": "ACTIVE",
  "currentSession": {
    "sessionId": "session_123456789",
    "device": "desktop",
    "location": "[CITY]"
  }
}
```

### Get Bulk User Presence
Get presence information for multiple users.

**Endpoint:** `POST /users/presence/bulk`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "userIds": ["user_123456789", "user_987654321"]
}
```

**Response (200 OK):**
```json
{
  "users": [
    {
      "userId": "user_123456789",
      "isOnline": true,
      "lastActiveAt": "2024-01-15T10:25:00Z"
    },
    {
      "userId": "user_987654321",
      "isOnline": false,
      "lastActiveAt": "2024-01-15T09:15:00Z"
    }
  ]
}
```

### Get Online Users in Organization
Get all online users in the current organization.

**Endpoint:** `GET /users/organization/online`  
**Authentication:** Required (JWT)

**Response (200 OK):**
```json
{
  "onlineUsers": [
    {
      "id": "user_123456789",
      "firstName": "[FIRST_NAME]",
      "lastName": "[LAST_NAME]",
      "role": "ADMIN",
      "avatar": "[AVATAR_URL]",
      "lastActiveAt": "2024-01-15T10:25:00Z"
    }
  ],
  "total": 1,
  "organizationId": "org_123456789"
}
```

## Admin User Management Endpoints

### Get All Users
Retrieve all users in the organization (Admin only).

**Endpoint:** `GET /admin/users`  
**Authentication:** Required (JWT + Admin role)  
**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)
- `search` (string, optional): Search term for name/email
- `role` (string, optional): Filter by user role
- `status` (string, optional): Filter by user status

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "user_123456789",
      "email": "[USER_EMAIL]",
      "username": "[USERNAME]",
      "firstName": "[FIRST_NAME]",
      "lastName": "[LAST_NAME]",
      "role": "ADMIN",
      "status": "ACTIVE",
      "isOnline": true,
      "lastActiveAt": "2024-01-15T10:25:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Create User
Create a new user in the organization (Admin only).

**Endpoint:** `POST /admin/users`  
**Authentication:** Required (JWT + Admin role)

**Request Body:**
```json
{
  "email": "new[USER_EMAIL]",
  "username": "[USERNAME]",
  "password": "[SECURE_PASSWORD]",
  "firstName": "[FIRST_NAME]",
  "lastName": "[LAST_NAME]",
  "phone": "[PHONE_NUMBER]",
  "role": "CALL_CENTER_AGENT",
  "teamAssignments": ["team_123456789"],
  "storeAssignments": ["store_123456789"]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": "user_987654321",
    "email": "new[USER_EMAIL]",
    "username": "[USERNAME]",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "role": "CALL_CENTER_AGENT",
    "status": "ACTIVE",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update User
Update user details and role (Admin only).

**Endpoint:** `PUT /admin/users/:id`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): User ID to update

**Request Body:**
```json
{
  "firstName": "[FIRST_NAME]",
  "lastName": "[LAST_NAME]",
  "phone": "[PHONE_NUMBER]",
  "role": "TEAM_LEADER",
  "status": "ACTIVE",
  "teamAssignments": ["team_123456789"],
  "storeAssignments": ["store_123456789"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User updated successfully",
  "user": {
    "id": "user_987654321",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "role": "TEAM_LEADER",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Suspend User
Suspend a user account (Admin only).

**Endpoint:** `PUT /admin/users/:id/suspend`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): User ID to suspend

**Request Body:**
```json
{
  "reason": "[SUSPENSION_REASON]",
  "suspendUntil": "2024-02-15T00:00:00Z"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User suspended successfully",
  "user": {
    "id": "user_987654321",
    "status": "SUSPENDED",
    "suspendedAt": "2024-01-15T10:30:00Z",
    "suspendedUntil": "2024-02-15T00:00:00Z",
    "suspensionReason": "[SUSPENSION_REASON]"
  }
}
```

### Activate User
Activate a suspended user account (Admin only).

**Endpoint:** `PUT /admin/users/:id/activate`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): User ID to activate

**Response (200 OK):**
```json
{
  "success": true,
  "message": "User activated successfully",
  "user": {
    "id": "user_987654321",
    "status": "ACTIVE",
    "activatedAt": "2024-01-15T10:30:00Z"
  }
}
```

## Team Management Endpoints

### Get All Teams
Retrieve all teams in the organization (Admin only).

**Endpoint:** `GET /admin/teams`  
**Authentication:** Required (JWT + Admin role)  
**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)

**Response (200 OK):**
```json
{
  "teams": [
    {
      "id": "team_123456789",
      "name": "[TEAM_NAME]",
      "description": "[TEAM_DESCRIPTION]",
      "leaderId": "user_123456789",
      "leader": {
        "id": "user_123456789",
        "firstName": "[FIRST_NAME]",
        "lastName": "[LAST_NAME]"
      },
      "memberCount": 5,
      "storeCount": 3,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Get Team by ID
Retrieve a specific team with detailed information (Admin only).

**Endpoint:** `GET /admin/teams/:id`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID

**Response (200 OK):**
```json
{
  "id": "team_123456789",
  "name": "[TEAM_NAME]",
  "description": "[TEAM_DESCRIPTION]",
  "leaderId": "user_123456789",
  "leader": {
    "id": "user_123456789",
    "firstName": "[FIRST_NAME]",
    "lastName": "[LAST_NAME]",
    "email": "[USER_EMAIL]"
  },
  "members": [
    {
      "id": "user_987654321",
      "firstName": "[FIRST_NAME]",
      "lastName": "[LAST_NAME]",
      "role": "CALL_CENTER_AGENT",
      "joinedAt": "2024-01-05T00:00:00Z"
    }
  ],
  "storeAssignments": [
    {
      "storeId": "store_123456789",
      "storeName": "[STORE_NAME]",
      "assignedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Create Team
Create a new team (Admin only).

**Endpoint:** `POST /admin/teams`  
**Authentication:** Required (JWT + Admin role)

**Request Body:**
```json
{
  "name": "[TEAM_NAME]",
  "description": "[TEAM_DESCRIPTION]",
  "leaderId": "user_123456789"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Team created successfully",
  "team": {
    "id": "team_987654321",
    "name": "[TEAM_NAME]",
    "description": "[TEAM_DESCRIPTION]",
    "leaderId": "user_123456789",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Update Team
Update team details (Admin only).

**Endpoint:** `PUT /admin/teams/:id`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID to update

**Request Body:**
```json
{
  "name": "[TEAM_NAME]",
  "description": "[TEAM_DESCRIPTION]",
  "leaderId": "user_123456789"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Team updated successfully",
  "team": {
    "id": "team_987654321",
    "name": "[TEAM_NAME]",
    "description": "[TEAM_DESCRIPTION]",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Delete Team
Delete a team (Admin only).

**Endpoint:** `DELETE /admin/teams/:id`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID to delete

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Team deleted successfully",
  "deletedAt": "2024-01-15T10:30:00Z"
}
```

### Add Team Members
Add members to a team (Admin only).

**Endpoint:** `POST /admin/teams/:id/members`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID

**Request Body:**
```json
{
  "userIds": ["user_123456789", "user_987654321"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Members added to team successfully",
  "addedMembers": [
    {
      "userId": "user_123456789",
      "firstName": "[FIRST_NAME]",
      "lastName": "[LAST_NAME]"
    }
  ],
  "addedCount": 2
}
```

### Remove Team Members
Remove members from a team (Admin only).

**Endpoint:** `DELETE /admin/teams/:id/members`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID

**Request Body:**
```json
{
  "userIds": ["user_123456789"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Members removed from team successfully",
  "removedCount": 1
}
```

### Assign Stores to Team
Assign stores to a team (Admin only).

**Endpoint:** `POST /admin/teams/:id/stores`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID

**Request Body:**
```json
{
  "storeIds": ["store_123456789", "store_987654321"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Stores assigned to team successfully",
  "assignedStores": [
    {
      "storeId": "store_123456789",
      "storeName": "[STORE_NAME]"
    }
  ],
  "assignedCount": 2
}
```

### Unassign Stores from Team
Remove store assignments from a team (Admin only).

**Endpoint:** `DELETE /admin/teams/:id/stores`  
**Authentication:** Required (JWT + Admin role)  
**Path Parameters:**
- `id` (string): Team ID

**Request Body:**
```json
{
  "storeIds": ["store_123456789"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Stores unassigned from team successfully",
  "unassignedCount": 1
}
```

## Real-time Notification Endpoints

### Get User Notifications
Retrieve stored notifications for the current user.

**Endpoint:** `GET /notifications`  
**Authentication:** Required (JWT)  
**Query Parameters:**
- `limit` (number, optional): Maximum notifications to return (default: 50)

**Response (200 OK):**
```json
{
  "notifications": [
    {
      "id": "[NOTIFICATION_ID]",
      "type": "PERMISSION_UPDATE",
      "title": "Role Updated",
      "message": "Your role has been updated to Team Leader",
      "data": {
        "oldRole": "CALL_CENTER_AGENT",
        "newRole": "TEAM_LEADER"
      },
      "read": false,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "unread": 1
}
```

### Mark Notifications as Read
Mark specific notifications as read.

**Endpoint:** `POST /notifications/mark-read`  
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "notificationIds": ["[NOTIFICATION_ID]", "[NOTIFICATION_ID]"]
}
```

**Response (204 No Content)**

### Clear All Notifications
Clear all notifications for the current user.

**Endpoint:** `DELETE /notifications`  
**Authentication:** Required (JWT)

**Response (204 No Content)**

## WebSocket Events

The system supports real-time communication through WebSocket connections. After authentication, clients can connect to receive real-time updates.

### Connection
**Endpoint:** `wss://api.confirmelo.com/ws`  
**Authentication:** JWT token via query parameter or header

### Event Types

#### Permission Update
Sent when user permissions change:
```json
{
  "event": "permission_update",
  "data": {
    "userId": "user_123456789",
    "oldRole": "CALL_CENTER_AGENT",
    "newRole": "TEAM_LEADER",
    "permissions": ["orders:read", "orders:write", "team:manage"],
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### Session Update
Sent when session status changes:
```json
{
  "event": "session_update",
  "data": {
    "userId": "user_123456789",
    "sessionId": "session_123456789",
    "action": "terminated",
    "reason": "Admin action",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### User Status Update
Sent when user online status changes:
```json
{
  "event": "user_status_update",
  "data": {
    "userId": "user_123456789",
    "isOnline": true,
    "status": "ACTIVE",
    "lastActiveAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Security Event
Sent for important security events:
```json
{
  "event": "security_event",
  "data": {
    "type": "SUSPICIOUS_LOGIN",
    "userId": "user_123456789",
    "ipAddress": "[IP_ADDRESS]",
    "location": "Unknown Location",
    "timestamp": "2024-01-15T10:30:00Z",
    "severity": "HIGH"
  }
}
```

## Error Codes

### Authentication Errors
- `AUTH_001`: Invalid credentials
- `AUTH_002`: Account locked
- `AUTH_003`: Token expired
- `AUTH_004`: Token invalid
- `AUTH_005`: Insufficient permissions

### Validation Errors
- `VAL_001`: Required field missing
- `VAL_002`: Invalid email format
- `VAL_003`: Password too weak
- `VAL_004`: Invalid phone number
- `VAL_005`: Data format invalid

### Rate Limiting Errors
- `RATE_001`: Too many requests
- `RATE_002`: Account temporarily locked
- `RATE_003`: IP address blocked

### System Errors
- `SYS_001`: Internal server error
- `SYS_002`: Database connection error
- `SYS_003`: External service unavailable
- `SYS_004`: Configuration error

## Security Headers

All API responses include security headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## CORS Configuration

CORS is configured to allow requests from whitelisted origins:
- `https://app.confirmelo.com`
- `https://admin.confirmelo.com`
- Development origins (localhost) in development mode

## Monitoring and Health Checks

### System Health
**Endpoint:** `GET /health`  
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "websocket": "healthy"
  },
  "version": "1.0.0"
}
```

### Detailed Health Check
**Endpoint:** `GET /health/detailed`  
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": {
      "status": "healthy",
      "responseTime": "5ms",
      "connections": 10
    },
    "redis": {
      "status": "healthy",
      "responseTime": "2ms",
      "memory": "50MB"
    }
  },
  "metrics": {
    "activeUsers": 150,
    "activeSessions": 200,
    "requestsPerMinute": 1500
  }
}
```

## Integration Examples

### Frontend Authentication Flow
```javascript
// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: '[USER_EMAIL]',
    password: '[PASSWORD]',
    rememberMe: false
  })
});

const { tokens, user } = await loginResponse.json();

// Store tokens
localStorage.setItem('accessToken', tokens.accessToken);
localStorage.setItem('refreshToken', tokens.refreshToken);

// Make authenticated requests
const profileResponse = await fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${tokens.accessToken}`
  }
});
```

### Token Refresh Implementation
```javascript
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  if (response.ok) {
    const { tokens } = await response.json();
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    return tokens.accessToken;
  } else {
    // Redirect to login
    window.location.href = '/login';
  }
}
```

### WebSocket Connection
```javascript
const token = localStorage.getItem('accessToken');
const ws = new WebSocket(`wss://api.confirmelo.com/ws?token=${token}`);

ws.onmessage = (event) => {
  const { event: eventType, data } = JSON.parse(event.data);
  
  switch (eventType) {
    case 'permission_update':
      // Handle permission changes
      updateUserPermissions(data);
      break;
    case 'session_update':
      // Handle session changes
      handleSessionUpdate(data);
      break;
    case 'user_status_update':
      // Handle user status changes
      updateUserStatus(data);
      break;
  }
};
```

This comprehensive API documentation covers all authentication, user management, session management, and real-time features of the Confirmelo Authentication System. The documentation includes detailed request/response examples, error handling, security considerations, and integration examples for frontend developers.