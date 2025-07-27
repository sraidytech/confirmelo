# Confirmelo Web Application

This is the frontend web application for the Confirmelo authentication system, built with Next.js 14 and TypeScript.

## Features

### Authentication Pages
- **Login Page** (`/auth/login`): Secure login with email/password, remember me option, and progressive security measures
- **Registration Page** (`/auth/register`): Multi-step organization and admin user registration
- **Forgot Password** (`/auth/forgot-password`): Password reset request with email verification
- **Reset Password** (`/auth/reset-password`): Secure password reset with token validation

### Security Features
- JWT-based authentication with automatic token refresh
- Password strength validation with real-time feedback
- Rate limiting and brute force protection
- Secure session management with Redis integration
- CSRF protection and security headers

### UI/UX Features
- Responsive design optimized for desktop, tablet, and mobile
- Dark mode support with system preference detection
- Language switching (English/French) with localStorage persistence
- Accessible components following WCAG 2.1 guidelines
- Loading states and error handling with user-friendly messages

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui patterns
- **Forms**: React Hook Form with Zod validation
- **HTTP Client**: Axios with interceptors for token management
- **State Management**: React Context for authentication state
- **Icons**: Lucide React
- **Testing**: Jest with React Testing Library

## Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm 8+

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Configure environment variables:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### Development

Start the development server:
```bash
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Building

Build for production:
```bash
pnpm build
```

Start production server:
```bash
pnpm start
```

### Testing

Run tests:
```bash
pnpm test
```

Run tests in watch mode:
```bash
pnpm test:watch
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication route group
│   │   ├── login/         # Login page
│   │   ├── register/      # Registration page
│   │   ├── forgot-password/ # Password reset request
│   │   └── reset-password/  # Password reset confirmation
│   ├── dashboard/         # Protected dashboard
│   ├── globals.css        # Global styles
│   └── layout.tsx         # Root layout
├── components/            # Reusable components
│   ├── auth/             # Authentication-specific components
│   └── ui/               # Base UI components (shadcn/ui)
├── contexts/             # React contexts
│   └── auth-context.tsx  # Authentication context
├── hooks/                # Custom React hooks
│   └── use-toast.ts      # Toast notification hook
├── lib/                  # Utility libraries
│   ├── api.ts           # API client with interceptors
│   └── utils.ts         # Utility functions
└── types/               # TypeScript type definitions
    └── auth.ts          # Authentication types
```

## Authentication Flow

### Login Process
1. User enters credentials on login page
2. Form validation with real-time feedback
3. API call to `/api/auth/login` endpoint
4. JWT tokens stored in secure cookies
5. User redirected to role-specific dashboard
6. WebSocket connection established for real-time features

### Registration Process
1. **Step 1**: Organization details collection
2. **Step 2**: Admin user account creation
3. Form validation with password strength checking
4. API call to `/api/auth/register` endpoint
5. Automatic login after successful registration

### Password Reset Process
1. User requests reset via email
2. Secure token generated and sent via email
3. Token validation on reset page
4. New password with strength validation
5. Password updated and user notified

### Session Management
- Automatic token refresh before expiration
- Graceful handling of expired sessions
- Multi-device session support
- Secure logout with token cleanup

## Security Considerations

### Client-Side Security
- Secure token storage in httpOnly cookies
- XSS protection with Content Security Policy
- CSRF protection for state-changing operations
- Input sanitization and validation
- Secure password handling (never logged or stored)

### API Integration
- Automatic retry with exponential backoff
- Request/response interceptors for token management
- Correlation IDs for request tracing
- Error handling with user-friendly messages
- Rate limiting awareness and handling

## Accessibility

The application follows WCAG 2.1 AA guidelines:
- Semantic HTML structure
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management for form interactions

## Internationalization

Currently supports:
- **English** (default): Complete coverage
- **French**: Ready for implementation in task 9.2

Language switching:
- Persistent language preference
- Dynamic switching without page refresh
- Localized error messages and validation

## Performance Optimizations

- Server-side rendering with Next.js App Router
- Automatic code splitting and lazy loading
- Optimized bundle size with tree shaking
- Image optimization with Next.js Image component
- Efficient re-rendering with React optimization patterns

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new components and features
3. Ensure accessibility compliance
4. Update documentation for significant changes
5. Test across different devices and browsers

## Related Documentation

- [API Documentation](../api/README.md)
- [Authentication System Design](../../.kiro/specs/confirmelo-authentication-system/design.md)
- [System Requirements](../../.kiro/specs/confirmelo-authentication-system/requirements.md)