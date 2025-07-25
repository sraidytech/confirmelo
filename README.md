# Confirmelo

A comprehensive authentication and authorization system built with NestJS, featuring role-based access control, team management, and secure session handling.

## Features

- 🔐 **JWT-based Authentication** - Secure token-based authentication
- 👥 **Role-Based Access Control** - Granular permissions system
- 🏢 **Multi-tenant Organization Support** - Team and store management
- 📊 **Session Management** - Redis-backed session handling
- 🔍 **Audit Logging** - Complete security event tracking
- ⚡ **Performance Optimized** - Redis caching for permissions
- 🧪 **Comprehensive Testing** - Full test coverage

## Tech Stack

- **Backend**: NestJS, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Authentication**: JWT tokens
- **Testing**: Jest

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis
- pnpm

### Installation

1. Clone the repository
```bash
git clone https://github.com/sraidytech/confirmelo.git
cd confirmelo
```

2. Install dependencies
```bash
pnpm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your database and Redis configurations
```

4. Run database migrations
```bash
cd apps/api
npx prisma migrate dev
npx prisma db seed
```

5. Start the development server
```bash
pnpm dev
```

## Project Structure

```
confirmelo/
├── apps/
│   └── api/                 # NestJS API application
│       ├── src/
│       │   ├── modules/     # Feature modules
│       │   │   ├── auth/    # Authentication & authorization
│       │   │   ├── users/   # User management
│       │   │   └── ...
│       │   └── common/      # Shared utilities and services
│       └── prisma/          # Database schema and migrations
├── .kiro/
│   └── specs/              # Feature specifications
└── scripts/                # Development scripts
```

## Authentication System

The authentication system provides:

- User registration and login
- JWT token management
- Role-based permissions (Admin, Manager, Agent, Customer)
- Team and store assignments
- Session management with Redis
- Audit logging for security events

## API Documentation

Once running, visit `http://localhost:3000/api` for Swagger documentation.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is proprietary software owned by Sraidy Tech.