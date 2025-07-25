#!/bin/bash

echo "🚀 Setting up Confirmelo development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start database services
echo "📦 Starting PostgreSQL and Redis..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Install dependencies
echo "📥 Installing dependencies..."
pnpm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
cd apps/api && npx prisma generate

# Run database migrations
echo "🗄️ Running database migrations..."
npx prisma db push

# Seed the database
echo "🌱 Seeding database..."
npx prisma db seed

echo "✅ Development environment setup complete!"
echo ""
echo "🔗 Services:"
echo "  - API: http://localhost:3001"
echo "  - API Docs: http://localhost:3001/api/docs"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "🔐 Default accounts:"
echo "  - Super Admin: admin@confirmelo.com / SuperAdmin123!"
echo "  - Demo Admin: demo@example.com / DemoAdmin123!"
echo ""
echo "🚀 To start the API server:"
echo "  cd apps/api && pnpm dev"