import { PrismaClient, UserRole, UserStatus, Currency } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a default super admin organization
  const superAdminOrg = await prisma.organization.upsert({
    where: { code: 'CONFIRMELO_ADMIN' },
    update: {},
    create: {
      name: 'Confirmelo Administration',
      code: 'CONFIRMELO_ADMIN',
      email: 'admin@confirmelo.com',
      country: 'MA',
      timezone: 'Africa/Casablanca',
      currency: Currency.MAD,
    },
  });

  // Create a super admin user
  const hashedPassword = await bcrypt.hash('SuperAdmin123!', 12);
  
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@confirmelo.com' },
    update: {},
    create: {
      email: 'admin@confirmelo.com',
      username: 'superadmin',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      organizationId: superAdminOrg.id,
    },
  });

  // Create a demo client organization
  const demoOrg = await prisma.organization.upsert({
    where: { code: 'DEMO_CLIENT' },
    update: {},
    create: {
      name: 'Demo E-commerce Store',
      code: 'DEMO_CLIENT',
      email: 'demo@example.com',
      phone: '+212600000000',
      address: '123 Demo Street',
      city: 'Casablanca',
      country: 'MA',
      timezone: 'Africa/Casablanca',
      currency: Currency.MAD,
    },
  });

  // Create a demo admin user
  const demoAdminPassword = await bcrypt.hash('DemoAdmin123!', 12);
  
  const demoAdmin = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      username: 'demoadmin',
      password: demoAdminPassword,
      firstName: 'Demo',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      organizationId: demoOrg.id,
    },
  });

  // Create default call statuses for demo organization
  const callStatuses = [
    {
      name: 'Confirmed',
      code: 'CONFIRMED',
      description: 'Order confirmed by customer',
      color: '#10B981',
      isSuccess: true,
      requiresFollowup: false,
      countsAsAttempt: true,
      displayOrder: 1,
    },
    {
      name: 'Not Interested',
      code: 'NOT_INTERESTED',
      description: 'Customer not interested',
      color: '#EF4444',
      isSuccess: false,
      requiresFollowup: false,
      countsAsAttempt: true,
      displayOrder: 2,
    },
    {
      name: 'No Answer',
      code: 'NO_ANSWER',
      description: 'Customer did not answer',
      color: '#F59E0B',
      isSuccess: false,
      requiresFollowup: true,
      countsAsAttempt: true,
      displayOrder: 3,
    },
    {
      name: 'Wrong Number',
      code: 'WRONG_NUMBER',
      description: 'Incorrect phone number',
      color: '#6B7280',
      isSuccess: false,
      requiresFollowup: false,
      countsAsAttempt: false,
      displayOrder: 4,
    },
  ];

  for (const status of callStatuses) {
    await prisma.callStatus.upsert({
      where: {
        organizationId_code: {
          organizationId: demoOrg.id,
          code: status.code,
        },
      },
      update: {},
      create: {
        ...status,
        organizationId: demoOrg.id,
      },
    });
  }

  console.log('✅ Database seed completed successfully!');
  console.log('');
  console.log('🔐 Default accounts created:');
  console.log('Super Admin: admin@confirmelo.com / SuperAdmin123!');
  console.log('Demo Admin: demo@example.com / DemoAdmin123!');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });