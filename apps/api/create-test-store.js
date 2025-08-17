const { PrismaClient } = require('@prisma/client');

async function createTestStore() {
  const prisma = new PrismaClient();
  
  try {
    // Your organization ID from the logs
    const organizationId = 'cmdm9fq870003ga5m9dvmw6gt';
    
    // Check if organization exists
    const org = await prisma.organization.findUnique({
      where: { id: organizationId }
    });
    
    if (!org) {
      console.log('❌ Organization not found:', organizationId);
      return;
    }
    
    console.log('✅ Found organization:', org.name);
    
    // Check if store already exists
    const existingStore = await prisma.store.findFirst({
      where: { 
        organizationId: organizationId,
        isActive: true 
      }
    });
    
    if (existingStore) {
      console.log('✅ Active store already exists:', existingStore.name);
      console.log('Store ID:', existingStore.id);
      return;
    }
    
    // Create test store
    const store = await prisma.store.create({
      data: {
        name: 'Main Store',
        code: 'MAIN',
        description: 'Default store for order sync',
        email: org.email,
        phone: org.phone,
        address: org.address,
        city: org.city,
        organizationId: organizationId,
        isActive: true
      }
    });
    
    console.log('🎉 Created test store successfully!');
    console.log('Store ID:', store.id);
    console.log('Store Name:', store.name);
    console.log('Store Code:', store.code);
    
    // Verify store creation
    const verification = await prisma.store.findFirst({
      where: { 
        organizationId: organizationId,
        isActive: true 
      }
    });
    
    if (verification) {
      console.log('✅ Store verification successful');
      console.log('Now your Google Sheets sync should work 100%!');
    }
    
  } catch (error) {
    console.error('❌ Error creating store:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestStore();