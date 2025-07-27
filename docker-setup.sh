#!/bin/bash

# Confirmelo Docker Setup Script

set -e

echo "🚀 Setting up Confirmelo with Docker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.docker .env
    echo "✅ Environment file created. Please update the values in .env file."
fi

# Create uploads directory
mkdir -p apps/api/uploads

# Build and start services
echo "🔨 Building Docker images..."
docker-compose -f docker-compose.dev.yml build

echo "🚀 Starting services..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate deploy

# Seed the database
echo "🌱 Seeding database..."
docker-compose -f docker-compose.dev.yml exec api npx prisma db seed

echo "✅ Setup complete!"
echo ""
echo "🌐 Services are running:"
echo "  - Frontend: http://localhost:3000"
echo "  - API: http://localhost:3001"
echo "  - Database: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "📋 Useful commands:"
echo "  - View logs: docker-compose -f docker-compose.dev.yml logs -f"
echo "  - Stop services: docker-compose -f docker-compose.dev.yml down"
echo "  - Restart services: docker-compose -f docker-compose.dev.yml restart"
echo "  - Access API container: docker-compose -f docker-compose.dev.yml exec api sh"
echo "  - Access Web container: docker-compose -f docker-compose.dev.yml exec web sh"