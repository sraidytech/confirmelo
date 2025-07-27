# Confirmelo Docker Setup

This guide will help you run the Confirmelo authentication system using Docker containers.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine (Linux)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)
- At least 4GB of available RAM
- Ports 3000, 3001, 5432, and 6379 available on your system

## Quick Start

### Windows
```bash
# Run the setup script
docker-setup.bat
```

### Linux/Mac
```bash
# Make the script executable
chmod +x docker-setup.sh

# Run the setup script
./docker-setup.sh
```

### Manual Setup

1. **Clone and navigate to the project:**
```bash
git clone <repository-url>
cd confirmelo
```

2. **Create environment file:**
```bash
cp .env.docker .env
```

3. **Update environment variables in `.env` file:**
   - Change JWT secrets for production
   - Configure SMTP settings for email functionality
   - Update database credentials if needed

4. **Build and start services:**
```bash
# Development environment
docker-compose -f docker-compose.dev.yml up -d --build

# Production environment
docker-compose up -d --build
```

5. **Run database migrations:**
```bash
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate deploy
```

6. **Seed the database:**
```bash
docker-compose -f docker-compose.dev.yml exec api npx prisma db seed
```

## Services

The Docker setup includes the following services:

### Core Services
- **web** (Next.js Frontend): http://localhost:3000
- **api** (NestJS Backend): http://localhost:3001
- **postgres** (Database): localhost:5432
- **redis** (Cache/Sessions): localhost:6379

### Optional Services
- **nginx** (Reverse Proxy): http://localhost:80

## Environment Configurations

### Development (`docker-compose.dev.yml`)
- Hot reloading enabled
- Debug ports exposed
- Volume mounts for live code changes
- Development database (`confirmelo_dev`)

### Production (`docker-compose.yml`)
- Optimized builds
- Health checks enabled
- Production database (`confirmelo`)
- Nginx reverse proxy included

## Common Commands

### Service Management
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Stop all services
docker-compose -f docker-compose.dev.yml down

# Restart a specific service
docker-compose -f docker-compose.dev.yml restart web

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# View logs for specific service
docker-compose -f docker-compose.dev.yml logs -f api
```

### Database Operations
```bash
# Run migrations
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate deploy

# Reset database
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate reset

# Seed database
docker-compose -f docker-compose.dev.yml exec api npx prisma db seed

# Access database
docker-compose -f docker-compose.dev.yml exec postgres psql -U confirmelo -d confirmelo_dev
```

### Container Access
```bash
# Access API container
docker-compose -f docker-compose.dev.yml exec api sh

# Access Web container
docker-compose -f docker-compose.dev.yml exec web sh

# Access database container
docker-compose -f docker-compose.dev.yml exec postgres sh
```

### Development Commands
```bash
# Install new npm package in API
docker-compose -f docker-compose.dev.yml exec api npm install <package-name>

# Install new npm package in Web
docker-compose -f docker-compose.dev.yml exec web npm install <package-name>

# Run tests in API
docker-compose -f docker-compose.dev.yml exec api npm test

# Run tests in Web
docker-compose -f docker-compose.dev.yml exec web npm test
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :3000
   
   # Kill the process or change port in docker-compose.yml
   ```

2. **Database connection issues:**
   ```bash
   # Check if PostgreSQL is running
   docker-compose -f docker-compose.dev.yml ps postgres
   
   # View database logs
   docker-compose -f docker-compose.dev.yml logs postgres
   ```

3. **Frontend not loading:**
   ```bash
   # Check web service logs
   docker-compose -f docker-compose.dev.yml logs web
   
   # Rebuild web service
   docker-compose -f docker-compose.dev.yml up -d --build web
   ```

4. **API not responding:**
   ```bash
   # Check API service logs
   docker-compose -f docker-compose.dev.yml logs api
   
   # Check if migrations ran successfully
   docker-compose -f docker-compose.dev.yml exec api npx prisma migrate status
   ```

### Clean Reset
```bash
# Stop all services
docker-compose -f docker-compose.dev.yml down

# Remove volumes (WARNING: This will delete all data)
docker-compose -f docker-compose.dev.yml down -v

# Remove images
docker-compose -f docker-compose.dev.yml down --rmi all

# Rebuild everything
docker-compose -f docker-compose.dev.yml up -d --build
```

## Health Checks

All services include health checks:

```bash
# Check service health
docker-compose -f docker-compose.dev.yml ps

# Manual health check
curl http://localhost:3001/health  # API health
curl http://localhost:3000         # Frontend health
```

## Performance Optimization

### For Development
- Use volume mounts for faster file changes
- Enable hot reloading
- Use development builds

### For Production
- Use multi-stage builds for smaller images
- Enable health checks
- Use nginx for load balancing
- Configure proper resource limits

## Security Considerations

### Development
- Default passwords are used (change for production)
- Debug ports are exposed
- CORS is permissive

### Production
- Change all default passwords
- Use environment-specific secrets
- Configure proper CORS origins
- Enable HTTPS with SSL certificates
- Use Docker secrets for sensitive data

## Monitoring

### Logs
```bash
# View all logs
docker-compose -f docker-compose.dev.yml logs -f

# View specific service logs
docker-compose -f docker-compose.dev.yml logs -f api web
```

### Resource Usage
```bash
# View resource usage
docker stats

# View specific container stats
docker stats confirmelo-api-dev confirmelo-web-dev
```

## Backup and Restore

### Database Backup
```bash
# Create backup
docker-compose -f docker-compose.dev.yml exec postgres pg_dump -U confirmelo confirmelo_dev > backup.sql

# Restore backup
docker-compose -f docker-compose.dev.yml exec -T postgres psql -U confirmelo confirmelo_dev < backup.sql
```

### Volume Backup
```bash
# Backup volumes
docker run --rm -v confirmelo_postgres_dev_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```

## Development Workflow

1. **Start services:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **Make code changes** (files are automatically synced via volumes)

3. **View logs** to debug issues:
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f api web
   ```

4. **Run tests:**
   ```bash
   docker-compose -f docker-compose.dev.yml exec api npm test
   docker-compose -f docker-compose.dev.yml exec web npm test
   ```

5. **Access services:**
   - Frontend: http://localhost:3000
   - API: http://localhost:3001
   - API Documentation: http://localhost:3001/api/docs

## Production Deployment

1. **Update environment variables** in `.env`
2. **Build production images:**
   ```bash
   docker-compose build
   ```
3. **Start production services:**
   ```bash
   docker-compose up -d
   ```
4. **Run migrations:**
   ```bash
   docker-compose exec api npx prisma migrate deploy
   ```

For production deployment, consider using:
- Docker Swarm or Kubernetes for orchestration
- External managed databases (AWS RDS, Google Cloud SQL)
- External Redis service (AWS ElastiCache, Redis Cloud)
- Load balancers and CDN
- Proper SSL certificates
- Monitoring and logging solutions