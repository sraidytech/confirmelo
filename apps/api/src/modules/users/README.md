# User Profile Management Module

This module provides comprehensive user profile management functionality for the Confirmelo Authentication System, including profile updates, password changes, avatar uploads, and activity tracking.

## Features

- **Profile Management**: Get and update user profile information
- **Password Security**: Secure password change with validation
- **Avatar Upload**: File upload with validation and storage
- **Activity Tracking**: Real-time user activity and online status
- **Data Validation**: Comprehensive input validation and sanitization
- **Security**: Role-based access control and audit logging

## API Endpoints

### GET /users/profile
Get the current authenticated user's profile information.

**Authentication**: Required
**Response**: User profile without sensitive data (password excluded)

```json
{
  "id": "user-123",
  "email": "john.doe@example.com",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+212600000000",
  "avatar": "/uploads/avatars/avatar-123.jpg",
  "role": "ADMIN",
  "status": "ACTIVE",
  "isOnline": true,
  "lastActiveAt": "2024-01-01T00:00:00Z",
  "organizationId": "org-123",
  "organization": {
    "id": "org-123",
    "name": "Test Organization",
    "code": "TEST001",
    "email": "org@test.com",
    "country": "MA",
    "timezone": "Africa/Casablanca",
    "currency": "MAD"
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### PUT /users/profile
Update the current user's profile information.

**Authentication**: Required
**Body**: Partial user profile data

```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+212600000001",
  "email": "jane.smith@example.com",
  "username": "janesmith"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    // Updated user profile
  }
}
```

**Validation Rules**:
- Email must be valid and unique
- Username must be 3-50 characters, alphanumeric with underscores/hyphens
- First/Last name must be 1-50 characters
- Phone number is optional

### POST /users/change-password
Change the current user's password.

**Authentication**: Required
**Body**:
```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Password Requirements**:
- Minimum 8 characters, maximum 128 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one number
- At least one special character
- Must be different from current password

### POST /users/avatar
Upload a new avatar image for the current user.

**Authentication**: Required
**Content-Type**: multipart/form-data
**Body**: File upload with field name "file"

**File Requirements**:
- Supported formats: JPG, JPEG, PNG, GIF
- Maximum size: 5MB
- Files stored in `/uploads/avatars/` directory

**Response**:
```json
{
  "success": true,
  "message": "Avatar uploaded successfully",
  "avatarUrl": "/uploads/avatars/avatar-123.jpg"
}
```

### POST /users/activity
Update the current user's last activity timestamp.

**Authentication**: Required
**Body**: Empty

**Response**:
```json
{
  "success": true,
  "message": "Activity updated successfully"
}
```

**Behavior**:
- Updates `lastActiveAt` timestamp
- Sets `isOnline` status to true
- Caches activity in Redis for 5 minutes

### GET /users/online-status
Get the current user's online status.

**Authentication**: Required
**Response**:
```json
{
  "isOnline": true,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Logic**:
- Checks Redis cache first for real-time status
- Falls back to database if not cached
- Considers user online if activity within last 5 minutes

## Security Features

### Input Validation
- All endpoints use class-validator decorators
- Comprehensive validation rules for each field
- Sanitization to prevent injection attacks

### Authentication & Authorization
- All endpoints require valid JWT authentication
- Users can only access/modify their own profile
- Role-based permissions for sensitive operations

### Password Security
- Current password verification required for changes
- Strong password requirements enforced
- Passwords hashed with bcrypt (12 salt rounds)
- Prevention of password reuse

### File Upload Security
- File type validation (images only)
- File size limits (5MB maximum)
- Secure filename generation
- Directory traversal protection

## Caching Strategy

### Redis Integration
- User activity cached for real-time features
- Permission cache invalidation on profile updates
- 5-minute TTL for activity tracking

### Performance Optimization
- Efficient database queries with selective field loading
- Cached online status for real-time features
- Optimized file storage and retrieval

## Error Handling

### Common Error Responses

**400 Bad Request**:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

**401 Unauthorized**:
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**409 Conflict**:
```json
{
  "statusCode": 409,
  "message": "Email already exists",
  "error": "Conflict"
}
```

**404 Not Found**:
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

## Testing

### Unit Tests
- Service layer tests with mocked dependencies
- Controller tests with mocked services
- Comprehensive test coverage for all methods

### Integration Tests
- End-to-end API testing
- Database integration testing
- File upload testing
- Authentication flow testing

### Test Commands
```bash
# Run unit tests
npm run test users

# Run integration tests
npm run test:e2e users

# Run tests with coverage
npm run test:cov users
```

## Usage Examples

### Frontend Integration
```typescript
// Get user profile
const profile = await api.get('/users/profile');

// Update profile
const updatedProfile = await api.put('/users/profile', {
  firstName: 'Jane',
  lastName: 'Smith'
});

// Change password
await api.post('/users/change-password', {
  currentPassword: 'current',
  newPassword: 'NewSecure123!'
});

// Upload avatar
const formData = new FormData();
formData.append('file', avatarFile);
const result = await api.post('/users/avatar', formData);

// Update activity (for heartbeat)
await api.post('/users/activity');

// Check online status
const status = await api.get('/users/online-status');
```

### WebSocket Integration
```typescript
// Real-time activity updates
socket.on('user_activity_updated', (data) => {
  console.log('User activity updated:', data);
});

// Online status changes
socket.on('user_status_changed', (data) => {
  console.log('User online status:', data.isOnline);
});
```

## Dependencies

- **@nestjs/common**: Core NestJS functionality
- **@nestjs/platform-express**: Express platform adapter
- **@nestjs/swagger**: API documentation
- **class-validator**: Input validation
- **class-transformer**: Data transformation
- **bcrypt**: Password hashing
- **multer**: File upload handling
- **prisma**: Database ORM
- **redis**: Caching and session management

## Configuration

### Environment Variables
```env
# File upload settings
UPLOAD_MAX_SIZE=5242880  # 5MB in bytes
UPLOAD_ALLOWED_TYPES=jpg,jpeg,png,gif

# Redis settings
REDIS_URL=redis://localhost:6379
REDIS_TTL_ACTIVITY=300  # 5 minutes

# Security settings
BCRYPT_ROUNDS=12
PASSWORD_MIN_LENGTH=8
PASSWORD_MAX_LENGTH=128
```

### File Storage
- Default storage: Local filesystem (`./uploads/avatars/`)
- Production: Configure cloud storage (AWS S3, Google Cloud, etc.)
- CDN integration for optimized delivery

## Future Enhancements

1. **Multi-factor Authentication**: TOTP/SMS verification
2. **Social Login**: OAuth integration with Google, GitHub
3. **Profile Verification**: Email/phone verification
4. **Advanced Security**: Device tracking, suspicious activity detection
5. **Bulk Operations**: Admin endpoints for user management
6. **Export/Import**: Profile data export/import functionality