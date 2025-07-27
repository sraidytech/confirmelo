# Confirmelo Setup Guide

This guide will help you set up and run the Confirmelo authentication system using Docker.

## 🚀 Quick Start (Recommended)

### For Windows Users:
```cmd
# Run the automated setup script
docker-setup.bat
```

### For Linux/Mac Users:
```bash
# Make the script executable and run it
chmod +x docker-setup.sh
./docker-setup.sh
```

The setup script will:
- ✅ Check Docker installation
- ✅ Create environment files
- ✅ Build Docker images
- ✅ Start all services
- ✅ Run database migrations
- ✅ Seed the database with test data

## 🌐 Access Your Application

After setup completes, you can access:

- **Frontend (Web App)**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api/docs
- **Test Page**: http://localhost:3000/test

## 🧪 Testing the Setup

1. **Visit the test page**: http://localhost:3000/test
2. **Click "Test API Connection"** to verify backend connectivity
3. **Try the authentication flow**:
   - Go to http://localhost:3000/auth/register
   - Create a new organization and admin account
   - Login with your credentials
   - Access the dashboard

## 📋 Manual Setup (Alternative)

If you prefer to set up manually:

### 1. Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose
- At least 4GB RAM available

### 2. Clone and Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd confirmelo

# Create environment file
cp .env.docker .env

# Build and start services
docker-compose -f docker-compose.dev.yml up -d --build

# Wait for services to start (about 30 seconds)
# Then run migrations
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate deploy

# Seed the database
docker-compose -f docker-compose.dev.yml exec api npx prisma db seed
```

## 🔧 Development Commands

```bash
# View all service logs
docker-compose -f docker-compose.dev.yml logs -f

# View specific service logs
docker-compose -f docker-compose.dev.yml logs -f web
docker-compose -f docker-compose.dev.yml logs -f api

# Restart services
docker-compose -f docker-compose.dev.yml restart

# Stop all services
docker-compose -f docker-compose.dev.yml down

# Access containers
docker-compose -f docker-compose.dev.yml exec web sh
docker-compose -f docker-compose.dev.yml exec api sh
```

## 🗄️ Database Operations

```bash
# Run new migrations
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate deploy

# Reset database (WARNING: Deletes all data)
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate reset

# Access database directly
docker-compose -f docker-compose.dev.yml exec postgres psql -U confirmelo -d confirmelo_dev
```

## 🎯 Default Test Accounts

After seeding, you can use these test accounts:

### Super Admin
- **Email**: admin@confirmelo.com
- **Password**: SuperAdmin123!

### Organization Admin
- **Email**: org.admin@testorg.com
- **Password**: OrgAdmin123!

### Team Leader
- **Email**: team.leader@testorg.com
- **Password**: TeamLeader123!

## 🔍 Troubleshooting

### Common Issues:

1. **Port already in use**:
   ```bash
   # Check what's using the port
   netstat -an | findstr :3000  # Windows
   lsof -i :3000                # Mac/Linux
   ```

2. **Services not starting**:
   ```bash
   # Check service status
   docker-compose -f docker-compose.dev.yml ps
   
   # View error logs
   docker-compose -f docker-compose.dev.yml logs
   ```

3. **Database connection errors**:
   ```bash
   # Check if PostgreSQL is healthy
   docker-compose -f docker-compose.dev.yml exec postgres pg_isready -U confirmelo
   
   # Restart database
   docker-compose -f docker-compose.dev.yml restart postgres
   ```

4. **Frontend not loading**:
   ```bash
   # Rebuild web service
   docker-compose -f docker-compose.dev.yml up -d --build web
   ```

### Complete Reset:
```bash
# Stop everything and remove data (WARNING: Deletes all data)
docker-compose -f docker-compose.dev.yml down -v

# Remove images
docker-compose -f docker-compose.dev.yml down --rmi all

# Start fresh
docker-compose -f docker-compose.dev.yml up -d --build
```

## 📊 Service Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (Next.js)     │◄──►│   (NestJS)      │◄──►│   (PostgreSQL)  │
│   Port: 3000    │    │   Port: 3001    │    │   Port: 5432    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Cache/Session │
                       │   (Redis)       │
                       │   Port: 6379    │
                       └─────────────────┘
```

## 🔐 Security Notes

### Development Environment:
- Uses default passwords (change for production)
- CORS is permissive
- Debug ports are exposed
- SSL is not enabled

### For Production:
- Update all passwords in `.env`
- Configure proper CORS origins
- Enable HTTPS with SSL certificates
- Use Docker secrets for sensitive data
- Set up proper monitoring and logging

## 📚 Next Steps

1. **Explore the Authentication System**:
   - Try registering a new organization
   - Test the login/logout flow
   - Explore password reset functionality

2. **Development**:
   - Code changes are automatically reflected (hot reload)
   - Check logs for debugging
   - Use the test page to verify connectivity

3. **Customization**:
   - Update branding and styling
   - Configure email settings
   - Add custom business logic

## 🆘 Getting Help

If you encounter issues:

1. Check the logs: `docker-compose -f docker-compose.dev.yml logs -f`
2. Verify all services are running: `docker-compose -f docker-compose.dev.yml ps`
3. Try the test page: http://localhost:3000/test
4. Review the troubleshooting section above

## 📖 Additional Documentation

- [Docker Setup Details](DOCKER.md)
- [API Documentation](apps/api/README.md)
- [Frontend Documentation](apps/web/README.md)
- [System Requirements](.kiro/specs/confirmelo-authentication-system/requirements.md)
- [System Design](.kiro/specs/confirmelo-authentication-system/design.md)