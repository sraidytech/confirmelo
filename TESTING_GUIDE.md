# Testing Guide for Confirmelo Authentication System

## 🚀 Quick Testing Strategy (No Docker Rebuilds)

### 1. **Local Development Testing** (Fastest)
```bash
# Backend API Testing
cd apps/api
npm run test                    # Run all tests
npm run test:watch             # Watch mode for development
npm run test -- auth          # Test specific module
npm run test -- --coverage    # With coverage report

# Frontend Testing
cd apps/web
npm run test                   # Run all tests
npm run test:watch            # Watch mode
npm run dev                   # Start dev server (hot reload)
```

### 2. **API Testing Without Docker** (Fast)
```bash
# Start local PostgreSQL and Redis
# Option A: Use local installations
# Option B: Use Docker for services only
docker run -d --name postgres-test -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15
docker run -d --name redis-test -p 6379:6379 redis:7-alpine

# Run API locally
cd apps/api
cp .env.example .env           # Configure for local services
npm run start:dev              # Hot reload enabled
```

### 3. **Frontend Route Testing** (Current Issue)
```bash
# Test frontend without Docker
cd apps/web
npm run dev                    # Start on localhost:3000

# Test specific routes
curl http://localhost:3000/test           # ✅ Working
curl http://localhost:3000/auth/login     # 🔴 404 Error
curl http://localhost:3000/dashboard      # ✅ Working
```

## 🐳 Docker Optimization Strategies

### 1. **Multi-Stage Builds** (Already implemented)
```dockerfile
# Current Dockerfile.dev uses multi-stage builds
# This reduces rebuild time by caching layers
```

### 2. **Docker Layer Caching**
```bash
# Use BuildKit for better caching
export DOCKER_BUILDKIT=1

# Build with cache mount
docker-compose -f docker-compose.dev.yml build --no-cache api
```

### 3. **Selective Service Rebuilds**
```bash
# Only rebuild specific services
docker-compose -f docker-compose.dev.yml build web    # Only web
docker-compose -f docker-compose.dev.yml build api    # Only api

# Restart without rebuild
docker-compose -f docker-compose.dev.yml restart web
docker-compose -f docker-compose.dev.yml restart api
```

### 4. **Volume Optimization**
```yaml
# Current docker-compose.dev.yml uses volumes for hot reload
volumes:
  - ./apps/web:/app
  - /app/node_modules          # Prevents overwriting node_modules
```

## 🔧 Debugging the 404 Route Issue

### Step 1: Check Next.js Compilation
```bash
# Inside web container
docker-compose -f docker-compose.dev.yml exec web npm run build

# Check for compilation errors
docker-compose -f docker-compose.dev.yml logs web --tail=50
```

### Step 2: Verify Route Group Structure
```bash
# Check if (auth) route group is properly structured
ls -la apps/web/src/app/\(auth\)/
```

### Step 3: Test Route Resolution
```bash
# Test Next.js route resolution
cd apps/web
npm run dev
# Visit http://localhost:3000/auth/login directly
```

## 🧪 Comprehensive Testing Workflow

### Phase 1: Unit Tests (No Docker)
```bash
# Backend unit tests
cd apps/api
npm run test:watch

# Frontend component tests  
cd apps/web
npm run test:watch
```

### Phase 2: Integration Tests (Minimal Docker)
```bash
# Start only required services
docker-compose -f docker-compose.dev.yml up postgres redis -d

# Run integration tests locally
cd apps/api
npm run test:e2e
```

### Phase 3: E2E Tests (Full Docker)
```bash
# Only when needed for full system testing
docker-compose -f docker-compose.dev.yml up -d
npm run test:e2e:full
```

## 🚀 Performance Optimizations

### 1. **Package.json Scripts Optimization**
```json
{
  "scripts": {
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration", 
    "test:auth": "jest --testPathPattern=auth",
    "test:quick": "jest --bail --findRelatedTests",
    "dev:api": "cd apps/api && npm run start:dev",
    "dev:web": "cd apps/web && npm run dev"
  }
}
```

### 2. **Jest Configuration for Speed**
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  maxWorkers: '50%',           // Use half CPU cores
  cache: true,                 // Enable caching
  bail: 1,                     // Stop on first failure
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts'
  ]
};
```

### 3. **Docker Compose Override for Development**
```yaml
# docker-compose.override.yml (auto-loaded)
version: '3.8'
services:
  web:
    command: npm run dev
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true    # Better file watching
    
  api:
    command: npm run start:dev
    environment:
      - NODE_ENV=development
```

## 🔍 Current Issue Analysis

Based on the logs, the issue is:
1. ✅ `/test` route works (200 OK)
2. 🔴 `/auth/login` returns 404
3. ✅ `/dashboard` works (200 OK)

### Root Cause Investigation:
1. **Route Group Issue**: `(auth)` folder might not be recognized
2. **Layout Conflicts**: Multiple AuthProvider imports
3. **Component Dependencies**: Missing UI components
4. **Build Process**: Next.js compilation errors

### Immediate Fix Strategy:
1. Fix AuthProvider conflicts
2. Verify all UI components exist
3. Test route structure locally
4. Check Next.js build output

## 📊 Testing Metrics

### Current Status:
- ✅ Backend API: 100% functional
- ✅ Database: Connected and working
- ✅ Docker: Services running
- 🔴 Frontend Routes: 404 errors on auth pages
- ✅ Other Routes: Working correctly

### Success Criteria:
- [ ] All auth routes return 200 OK
- [ ] Login/register forms render correctly
- [ ] Authentication flow works end-to-end
- [ ] Task 9.1 marked as completed