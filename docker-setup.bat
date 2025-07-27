@echo off
REM Confirmelo Docker Setup Script for Windows

echo 🚀 Setting up Confirmelo with Docker...

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not installed. Please install Docker Compose first.
    pause
    exit /b 1
)

REM Create environment file if it doesn't exist
if not exist .env (
    echo 📝 Creating environment file...
    copy .env.docker .env
    echo ✅ Environment file created. Please update the values in .env file.
)

REM Create uploads directory
if not exist apps\api\uploads mkdir apps\api\uploads

REM Build and start services
echo 🔨 Building Docker images...
docker-compose -f docker-compose.dev.yml build

echo 🚀 Starting services...
docker-compose -f docker-compose.dev.yml up -d

REM Wait for database to be ready
echo ⏳ Waiting for database to be ready...
timeout /t 15 /nobreak >nul

REM Run database migrations
echo 🗄️ Running database migrations...
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate deploy

REM Seed the database
echo 🌱 Seeding database...
docker-compose -f docker-compose.dev.yml exec api npx prisma db seed

echo ✅ Setup complete!
echo.
echo 🌐 Services are running:
echo   - Frontend: http://localhost:3000
echo   - API: http://localhost:3001
echo   - Database: localhost:5432
echo   - Redis: localhost:6379
echo.
echo 📋 Useful commands:
echo   - View logs: docker-compose -f docker-compose.dev.yml logs -f
echo   - Stop services: docker-compose -f docker-compose.dev.yml down
echo   - Restart services: docker-compose -f docker-compose.dev.yml restart
echo   - Access API container: docker-compose -f docker-compose.dev.yml exec api sh
echo   - Access Web container: docker-compose -f docker-compose.dev.yml exec web sh

pause