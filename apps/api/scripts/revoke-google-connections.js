#!/usr/bin/env node

/**
 * Script to revoke all Google Sheets connections
 * This is needed after changing OAuth2 scopes to allow new connections with updated scopes
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function revokeGoogleSheetsConnections() {
  try {
    console.log('🔍 Finding all Google Sheets connections...');
    
    // Find all Google Sheets connections
    const connections = await prisma.platformConnection.findMany({
      where: {
        platformType: 'GOOGLE_SHEETS',
        status: 'ACTIVE'
      },
      select: {
        id: true,
        platformName: true,
        userId: true,
        organizationId: true,
        scopes: true,
        createdAt: true
      }
    });

    console.log(`📊 Found ${connections.length} active Google Sheets connections`);

    if (connections.length === 0) {
      console.log('✅ No active Google Sheets connections to revoke');
      return;
    }

    // Display connections
    console.log('\n📋 Connections to revoke:');
    connections.forEach((conn, index) => {
      console.log(`${index + 1}. ${conn.platformName} (${conn.id})`);
      console.log(`   User: ${conn.userId}`);
      console.log(`   Org: ${conn.organizationId}`);
      console.log(`   Scopes: ${conn.scopes?.join(', ') || 'N/A'}`);
      console.log(`   Created: ${conn.createdAt.toISOString()}`);
      console.log('');
    });

    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question('❓ Do you want to revoke all these connections? (yes/no): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('❌ Operation cancelled');
      return;
    }

    console.log('🔄 Revoking connections...');

    // Revoke all connections
    const result = await prisma.platformConnection.updateMany({
      where: {
        platformType: 'GOOGLE_SHEETS',
        status: 'ACTIVE'
      },
      data: {
        status: 'REVOKED',
        updatedAt: new Date()
      }
    });

    console.log(`✅ Successfully revoked ${result.count} Google Sheets connections`);
    console.log('');
    console.log('🎉 You can now create new Google Sheets connections with the updated scopes!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Go to your application UI');
    console.log('2. Try connecting to Google Sheets again');
    console.log('3. The new connection will use the updated drive.file scope');

  } catch (error) {
    console.error('❌ Error revoking Google Sheets connections:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
revokeGoogleSheetsConnections();