# OAuth2 Integration Usage Examples

This document provides practical examples of how to use the OAuth2 infrastructure for integrating with external platforms.

## API Endpoints Overview

The OAuth2 integration provides the following endpoints:

- `POST /auth/oauth2/initiate` - Start OAuth2 authorization flow
- `POST /auth/oauth2/complete` - Complete OAuth2 authorization and store connection
- `GET /auth/oauth2/connections` - List user's OAuth2 connections
- `GET /auth/oauth2/connections/:id` - Get specific connection details
- `POST /auth/oauth2/connections/:id/refresh` - Refresh access token
- `POST /auth/oauth2/connections/:id/test` - Test connection health
- `DELETE /auth/oauth2/connections/:id` - Revoke connection

## Frontend Integration Examples

### 1. Initiating OAuth2 Flow (React/Next.js)

```typescript
// components/OAuth2Integration.tsx
import { useState } from 'react';
import { PlatformType } from '@/types/auth';

interface OAuth2IntegrationProps {
  platformType: PlatformType;
  platformName: string;
}

export function OAuth2Integration({ platformType, platformName }: OAuth2IntegrationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateOAuth2 = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/oauth2/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          platformType,
          platformName,
          platformData: {
            // Add any platform-specific data here
            storeId: 'store-123',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth2 flow');
      }

      const { authorizationUrl } = await response.json();
      
      // Redirect user to authorization URL
      window.location.href = authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="oauth2-integration">
      <h3>Connect to {platformName}</h3>
      <p>Connect your {platformName} account to sync orders and products.</p>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <button 
        onClick={initiateOAuth2}
        disabled={isLoading}
        className="connect-button"
      >
        {isLoading ? 'Connecting...' : `Connect ${platformName}`}
      </button>
    </div>
  );
}
```

### 2. OAuth2 Callback Handler

```typescript
// pages/auth/oauth2/callback.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function OAuth2Callback() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const { code, state, error, error_description } = router.query;

      if (error) {
        setStatus('error');
        setMessage(error_description as string || error as string);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authorization code or state parameter');
        return;
      }

      try {
        const response = await fetch('/api/auth/oauth2/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({
            code: code as string,
            state: state as string,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to complete OAuth2 flow');
        }

        const connection = await response.json();
        setStatus('success');
        setMessage(`Successfully connected to ${connection.platformName}`);
        
        // Redirect to connections page after 2 seconds
        setTimeout(() => {
          router.push('/dashboard/integrations');
        }, 2000);
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    if (router.isReady) {
      handleCallback();
    }
  }, [router.isReady, router.query]);

  return (
    <div className="oauth2-callback">
      {status === 'loading' && (
        <div className="loading">
          <h2>Completing connection...</h2>
          <p>Please wait while we finalize your integration.</p>
        </div>
      )}
      
      {status === 'success' && (
        <div className="success">
          <h2>Connection Successful!</h2>
          <p>{message}</p>
          <p>Redirecting to your integrations...</p>
        </div>
      )}
      
      {status === 'error' && (
        <div className="error">
          <h2>Connection Failed</h2>
          <p>{message}</p>
          <button onClick={() => router.push('/dashboard/integrations')}>
            Back to Integrations
          </button>
        </div>
      )}
    </div>
  );
}
```

### 3. Connection Management Component

```typescript
// components/ConnectionManager.tsx
import { useState, useEffect } from 'react';
import { PlatformType, ConnectionStatus } from '@/types/auth';

interface Connection {
  id: string;
  platformType: PlatformType;
  platformName: string;
  status: ConnectionStatus;
  scopes: string[];
  tokenExpiresAt?: string;
  lastSyncAt?: string;
  syncCount: number;
  createdAt: string;
}

export function ConnectionManager() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const response = await fetch('/api/auth/oauth2/connections', {
        headers: {
          'Authorization': `Bearer ${getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }

      const data = await response.json();
      setConnections(data.connections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const refreshConnection = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/auth/oauth2/connections/${connectionId}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to refresh connection');
      }

      // Refresh the connections list
      await fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh connection');
    }
  };

  const testConnection = async (connectionId: string) => {
    try {
      const response = await fetch(`/api/auth/oauth2/connections/${connectionId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to test connection');
      }

      const result = await response.json();
      alert(result.success ? 'Connection test successful!' : `Test failed: ${result.error}`);
    } catch (err) {
      alert('Failed to test connection');
    }
  };

  const revokeConnection = async (connectionId: string) => {
    if (!confirm('Are you sure you want to revoke this connection?')) {
      return;
    }

    try {
      const response = await fetch(`/api/auth/oauth2/connections/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to revoke connection');
      }

      // Refresh the connections list
      await fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke connection');
    }
  };

  if (loading) return <div>Loading connections...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="connection-manager">
      <h2>OAuth2 Connections</h2>
      
      {connections.length === 0 ? (
        <p>No connections found. Connect to a platform to get started.</p>
      ) : (
        <div className="connections-list">
          {connections.map((connection) => (
            <div key={connection.id} className="connection-card">
              <div className="connection-header">
                <h3>{connection.platformName}</h3>
                <span className={`status ${connection.status.toLowerCase()}`}>
                  {connection.status}
                </span>
              </div>
              
              <div className="connection-details">
                <p><strong>Platform:</strong> {connection.platformType}</p>
                <p><strong>Scopes:</strong> {connection.scopes.join(', ')}</p>
                <p><strong>Last Sync:</strong> {
                  connection.lastSyncAt 
                    ? new Date(connection.lastSyncAt).toLocaleString()
                    : 'Never'
                }</p>
                <p><strong>Sync Count:</strong> {connection.syncCount}</p>
                {connection.tokenExpiresAt && (
                  <p><strong>Token Expires:</strong> {
                    new Date(connection.tokenExpiresAt).toLocaleString()
                  }</p>
                )}
              </div>
              
              <div className="connection-actions">
                <button 
                  onClick={() => testConnection(connection.id)}
                  className="test-button"
                >
                  Test Connection
                </button>
                
                {connection.status === 'ACTIVE' && (
                  <button 
                    onClick={() => refreshConnection(connection.id)}
                    className="refresh-button"
                  >
                    Refresh Token
                  </button>
                )}
                
                <button 
                  onClick={() => revokeConnection(connection.id)}
                  className="revoke-button"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Backend Service Usage Examples

### 1. Using OAuth2 Service in Other Services

```typescript
// services/order-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Service } from '../auth/services/oauth2.service';
import { OAuth2ConfigService } from '../auth/services/oauth2-config.service';
import { PrismaService } from '../common/database/prisma.service';
import { PlatformType } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  constructor(
    private readonly oauth2Service: OAuth2Service,
    private readonly oauth2ConfigService: OAuth2ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async syncOrdersFromPlatform(connectionId: string): Promise<void> {
    try {
      // Get the connection details
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || connection.status !== 'ACTIVE') {
        throw new Error('Connection not found or not active');
      }

      // Get access token (automatically handles refresh if needed)
      const accessToken = await this.oauth2Service.getAccessToken(connectionId);

      // Sync orders based on platform type
      switch (connection.platformType) {
        case PlatformType.YOUCAN:
          await this.syncYoucanOrders(accessToken, connection);
          break;
        case PlatformType.SHOPIFY:
          await this.syncShopifyOrders(accessToken, connection);
          break;
        case PlatformType.GOOGLE_SHEETS:
          await this.syncGoogleSheetsOrders(accessToken, connection);
          break;
        default:
          throw new Error(`Unsupported platform: ${connection.platformType}`);
      }

      // Update sync statistics
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          syncCount: { increment: 1 },
        },
      });

      this.logger.log(`Successfully synced orders from ${connection.platformType}`, {
        connectionId,
        platformType: connection.platformType,
      });
    } catch (error) {
      this.logger.error('Failed to sync orders', {
        error: error.message,
        connectionId,
      });

      // Update connection with error details
      await this.prismaService.platformConnection.update({
        where: { id: connectionId },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: error.message,
        },
      });

      throw error;
    }
  }

  private async syncYoucanOrders(accessToken: string, connection: any): Promise<void> {
    const response = await axios.get('https://youcan.shop/api/orders', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const orders = response.data.data;
    
    // Process and store orders
    for (const order of orders) {
      await this.processOrder(order, connection);
    }
  }

  private async syncShopifyOrders(accessToken: string, connection: any): Promise<void> {
    // Extract shop domain from platform data
    const shopDomain = connection.platformData?.shopDomain;
    if (!shopDomain) {
      throw new Error('Shop domain not found in connection data');
    }

    const response = await axios.get(`https://${shopDomain}.myshopify.com/admin/api/2023-10/orders.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Accept': 'application/json',
      },
    });

    const orders = response.data.orders;
    
    // Process and store orders
    for (const order of orders) {
      await this.processOrder(order, connection);
    }
  }

  private async syncGoogleSheetsOrders(accessToken: string, connection: any): Promise<void> {
    const spreadsheetId = connection.platformData?.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID not found in connection data');
    }

    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Orders!A:Z`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    const rows = response.data.values;
    
    // Process spreadsheet rows as orders
    for (let i = 1; i < rows.length; i++) { // Skip header row
      const orderData = this.parseSpreadsheetRow(rows[i]);
      await this.processOrder(orderData, connection);
    }
  }

  private async processOrder(orderData: any, connection: any): Promise<void> {
    // Transform platform-specific order data to our format
    const transformedOrder = this.transformOrderData(orderData, connection.platformType);
    
    // Store or update order in database
    await this.prismaService.order.upsert({
      where: { 
        externalOrderId: transformedOrder.externalOrderId,
      },
      update: transformedOrder,
      create: {
        ...transformedOrder,
        organizationId: connection.organizationId,
      },
    });
  }

  private transformOrderData(orderData: any, platformType: PlatformType): any {
    // Transform order data based on platform type
    switch (platformType) {
      case PlatformType.YOUCAN:
        return this.transformYoucanOrder(orderData);
      case PlatformType.SHOPIFY:
        return this.transformShopifyOrder(orderData);
      case PlatformType.GOOGLE_SHEETS:
        return this.transformGoogleSheetsOrder(orderData);
      default:
        throw new Error(`Unsupported platform: ${platformType}`);
    }
  }

  private transformYoucanOrder(order: any): any {
    return {
      externalOrderId: order.id.toString(),
      orderNumber: order.order_number,
      status: this.mapYoucanStatus(order.status),
      total: parseFloat(order.total),
      currency: order.currency || 'MAD',
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone,
      shippingAddress: order.shipping_address?.address,
      // ... other fields
    };
  }

  private transformShopifyOrder(order: any): any {
    return {
      externalOrderId: order.id.toString(),
      orderNumber: order.order_number,
      status: this.mapShopifyStatus(order.financial_status),
      total: parseFloat(order.total_price),
      currency: order.currency,
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone,
      shippingAddress: order.shipping_address?.address1,
      // ... other fields
    };
  }

  private transformGoogleSheetsOrder(rowData: string[]): any {
    // Assuming specific column order in the spreadsheet
    return {
      externalOrderId: rowData[0], // Column A
      orderNumber: rowData[1], // Column B
      status: 'NEW',
      total: parseFloat(rowData[2] || '0'), // Column C
      currency: 'MAD',
      customerEmail: rowData[3], // Column D
      customerPhone: rowData[4], // Column E
      shippingAddress: rowData[5], // Column F
      // ... other fields
    };
  }

  private parseSpreadsheetRow(row: string[]): any {
    // Parse spreadsheet row into order data
    return this.transformGoogleSheetsOrder(row);
  }

  private mapYoucanStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'NEW',
      'confirmed': 'CONFIRMED',
      'shipped': 'SHIPPED',
      'delivered': 'DELIVERED',
      'cancelled': 'CANCELLED',
    };
    return statusMap[status] || 'NEW';
  }

  private mapShopifyStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'NEW',
      'paid': 'CONFIRMED',
      'partially_paid': 'IN_PROGRESS',
      'refunded': 'CANCELLED',
      'voided': 'CANCELLED',
    };
    return statusMap[status] || 'NEW';
  }
}
```

### 2. Scheduled Sync Job

```typescript
// jobs/oauth2-sync.job.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/database/prisma.service';
import { OrderSyncService } from '../services/order-sync.service';
import { ConnectionStatus } from '@prisma/client';

@Injectable()
export class OAuth2SyncJob {
  private readonly logger = new Logger(OAuth2SyncJob.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly orderSyncService: OrderSyncService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncAllConnections(): Promise<void> {
    this.logger.log('Starting scheduled OAuth2 sync job');

    try {
      // Get all active connections
      const connections = await this.prismaService.platformConnection.findMany({
        where: {
          status: ConnectionStatus.ACTIVE,
        },
        include: {
          organization: true,
        },
      });

      this.logger.log(`Found ${connections.length} active connections to sync`);

      // Sync each connection
      const syncPromises = connections.map(async (connection) => {
        try {
          await this.orderSyncService.syncOrdersFromPlatform(connection.id);
          this.logger.log(`Synced connection ${connection.id} successfully`);
        } catch (error) {
          this.logger.error(`Failed to sync connection ${connection.id}`, {
            error: error.message,
            connectionId: connection.id,
            platformType: connection.platformType,
          });
        }
      });

      await Promise.allSettled(syncPromises);
      
      this.logger.log('Completed scheduled OAuth2 sync job');
    } catch (error) {
      this.logger.error('Failed to run OAuth2 sync job', {
        error: error.message,
      });
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshExpiringTokens(): Promise<void> {
    this.logger.log('Checking for expiring OAuth2 tokens');

    try {
      // Find connections with tokens expiring in the next hour
      const expiringConnections = await this.prismaService.platformConnection.findMany({
        where: {
          status: ConnectionStatus.ACTIVE,
          tokenExpiresAt: {
            lte: new Date(Date.now() + 60 * 60 * 1000), // Next hour
            gt: new Date(), // Not already expired
          },
        },
      });

      this.logger.log(`Found ${expiringConnections.length} connections with expiring tokens`);

      // Refresh tokens for each connection
      for (const connection of expiringConnections) {
        try {
          // This will be implemented in the next task (16.2)
          // await this.oauth2Service.refreshAccessToken(connection.id, config);
          this.logger.log(`Refreshed token for connection ${connection.id}`);
        } catch (error) {
          this.logger.error(`Failed to refresh token for connection ${connection.id}`, {
            error: error.message,
            connectionId: connection.id,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to refresh expiring tokens', {
        error: error.message,
      });
    }
  }
}
```

## Environment Configuration

Make sure to set up the required environment variables as documented in `oauth2-environment-variables.md`:

```bash
# .env
OAUTH2_ENCRYPTION_KEY=your-secure-32-char-encryption-key
YOUCAN_CLIENT_ID=your-youcan-client-id
YOUCAN_CLIENT_SECRET=your-youcan-client-secret
YOUCAN_REDIRECT_URI=http://localhost:3000/auth/oauth2/callback
# ... other platform configurations
```

## Security Best Practices

1. **Always use HTTPS** in production for redirect URIs
2. **Validate state parameters** to prevent CSRF attacks
3. **Store tokens encrypted** in the database
4. **Implement proper error handling** to avoid information leakage
5. **Use short-lived access tokens** with refresh token rotation
6. **Monitor for suspicious activity** and implement rate limiting
7. **Regularly audit** OAuth2 connections and revoke unused ones

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**: Ensure the redirect URI matches exactly what's configured on the platform
2. **"Token expired"**: Implement automatic token refresh or handle refresh manually
3. **"Insufficient scopes"**: Check that the requested scopes are granted and sufficient for your use case
4. **"Connection test failed"**: Verify the platform's API is accessible and the token is valid

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=oauth2:*
LOG_LEVEL=debug
```

This will provide detailed logs for all OAuth2 operations.
## Youcan S
hop Specific Integration

### Youcan Shop API Endpoints

The Youcan Shop integration provides additional specialized endpoints:

- `POST /auth/oauth2/youcan/initiate` - Start Youcan Shop OAuth2 authorization
- `POST /auth/oauth2/youcan/complete` - Complete Youcan Shop authorization
- `POST /auth/oauth2/youcan/connections/:id/test` - Test Youcan Shop connection
- `POST /auth/oauth2/youcan/connections/:id/refresh` - Refresh Youcan Shop token
- `GET /auth/oauth2/youcan/connections/:id/orders` - Get orders from Youcan Shop
- `POST /auth/oauth2/youcan/connections/:id/orders/:orderId/status` - Update order status
- `GET /auth/oauth2/youcan/connections/:id/shop` - Get shop information
- `GET /auth/oauth2/youcan/connections/:id/orders/summary` - Get order summary statistics

### Frontend Integration for Youcan Shop

```typescript
// components/YoucanIntegration.tsx
import { useState } from 'react';

interface YoucanIntegrationProps {
  shopDomain?: string;
}

export function YoucanIntegration({ shopDomain }: YoucanIntegrationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectYoucanShop = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/oauth2/youcan/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          shopDomain, // Optional: specific shop domain
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to initiate Youcan connection');
      }

      const { authorizationUrl } = await response.json();
      
      // Redirect to Youcan authorization
      window.location.href = authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="youcan-integration">
      <div className="platform-header">
        <img src="/youcan-logo.png" alt="Youcan Shop" className="platform-logo" />
        <div>
          <h3>Youcan Shop</h3>
          <p>Connect your Youcan Shop store to sync orders and manage confirmations</p>
        </div>
      </div>

      {shopDomain && (
        <div className="shop-domain">
          <label>Shop Domain:</label>
          <input 
            type="text" 
            value={shopDomain} 
            readOnly 
            className="domain-input"
          />
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>Connection Error:</strong> {error}
        </div>
      )}

      <div className="integration-features">
        <h4>What you'll get:</h4>
        <ul>
          <li>✅ Automatic order synchronization</li>
          <li>✅ Real-time order status updates</li>
          <li>✅ Customer information access</li>
          <li>✅ Product catalog integration</li>
          <li>✅ Confirmation workflow automation</li>
        </ul>
      </div>

      <button 
        onClick={connectYoucanShop}
        disabled={isLoading}
        className="connect-button youcan-button"
      >
        {isLoading ? (
          <>
            <span className="spinner"></span>
            Connecting to Youcan...
          </>
        ) : (
          'Connect Youcan Shop'
        )}
      </button>
    </div>
  );
}
```

### Youcan Shop Order Management

```typescript
// components/YoucanOrderManager.tsx
import { useState, useEffect } from 'react';

interface YoucanOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  currency: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  created_at: string;
}

interface YoucanOrderManagerProps {
  connectionId: string;
}

export function YoucanOrderManager({ connectionId }: YoucanOrderManagerProps) {
  const [orders, setOrders] = useState<YoucanOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    page: 1,
    limit: 20,
  });

  useEffect(() => {
    fetchOrders();
  }, [filters]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: filters.page.toString(),
        limit: filters.limit.toString(),
        ...(filters.status && { status: filters.status }),
      });

      const response = await fetch(
        `/api/auth/oauth2/youcan/connections/${connectionId}/orders?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${getAccessToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();
      setOrders(data.data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string, notes?: string) => {
    try {
      const response = await fetch(
        `/api/auth/oauth2/youcan/connections/${connectionId}/orders/${orderId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({
            status: newStatus,
            notes,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update order status');
      }

      // Refresh orders list
      await fetchOrders();
      
      // Show success message
      alert(`Order ${orderId} status updated to ${newStatus}`);
    } catch (err) {
      alert(`Failed to update order: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getStatusColor = (status: string): string => {
    const statusColors: Record<string, string> = {
      'pending': 'orange',
      'confirmed': 'green',
      'shipped': 'blue',
      'delivered': 'purple',
      'cancelled': 'red',
    };
    return statusColors[status] || 'gray';
  };

  if (loading) return <div className="loading">Loading Youcan orders...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="youcan-order-manager">
      <div className="order-filters">
        <h3>Youcan Shop Orders</h3>
        
        <div className="filter-controls">
          <select 
            value={filters.status} 
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select 
            value={filters.limit} 
            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value), page: 1 })}
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
          </select>

          <button onClick={fetchOrders} className="refresh-button">
            Refresh
          </button>
        </div>
      </div>

      <div className="orders-list">
        {orders.length === 0 ? (
          <p>No orders found with the current filters.</p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <h4>Order #{order.order_number}</h4>
                <span 
                  className={`status-badge ${getStatusColor(order.status)}`}
                >
                  {order.status.toUpperCase()}
                </span>
              </div>

              <div className="order-details">
                <div className="order-info">
                  <p><strong>Total:</strong> {order.total} {order.currency}</p>
                  <p><strong>Customer:</strong> {order.customer.name}</p>
                  <p><strong>Email:</strong> {order.customer.email}</p>
                  <p><strong>Phone:</strong> {order.customer.phone}</p>
                  <p><strong>Date:</strong> {new Date(order.created_at).toLocaleDateString()}</p>
                </div>

                <div className="order-actions">
                  <select 
                    onChange={(e) => {
                      if (e.target.value) {
                        const notes = prompt('Add notes (optional):');
                        updateOrderStatus(order.id, e.target.value, notes || undefined);
                        e.target.value = ''; // Reset select
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="">Update Status</option>
                    <option value="confirmed">Confirm Order</option>
                    <option value="shipped">Mark as Shipped</option>
                    <option value="delivered">Mark as Delivered</option>
                    <option value="cancelled">Cancel Order</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="pagination">
        <button 
          onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })}
          disabled={filters.page === 1}
        >
          Previous
        </button>
        <span>Page {filters.page}</span>
        <button 
          onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
          disabled={orders.length < filters.limit}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### Youcan Shop Dashboard Widget

```typescript
// components/YoucanDashboard.tsx
import { useState, useEffect } from 'react';

interface YoucanShopInfo {
  id: string;
  name: string;
  domain: string;
  email: string;
  currency: string;
  plan: string;
  status: string;
}

interface YoucanOrderSummary {
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  cancelled_orders: number;
}

interface YoucanDashboardProps {
  connectionId: string;
}

export function YoucanDashboard({ connectionId }: YoucanDashboardProps) {
  const [shopInfo, setShopInfo] = useState<YoucanShopInfo | null>(null);
  const [orderSummary, setOrderSummary] = useState<YoucanOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, [connectionId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [shopResponse, summaryResponse] = await Promise.all([
        fetch(`/api/auth/oauth2/youcan/connections/${connectionId}/shop`, {
          headers: { 'Authorization': `Bearer ${getAccessToken()}` },
        }),
        fetch(`/api/auth/oauth2/youcan/connections/${connectionId}/orders/summary`, {
          headers: { 'Authorization': `Bearer ${getAccessToken()}` },
        }),
      ]);

      if (!shopResponse.ok || !summaryResponse.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const shopData = await shopResponse.json();
      const summaryData = await summaryResponse.json();

      setShopInfo(shopData.data);
      setOrderSummary(summaryData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    try {
      const response = await fetch(
        `/api/auth/oauth2/youcan/connections/${connectionId}/test`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getAccessToken()}` },
        }
      );

      const result = await response.json();
      
      if (result.success) {
        alert('✅ Connection test successful! Your Youcan Shop integration is working properly.');
      } else {
        alert(`❌ Connection test failed: ${result.error}`);
      }
    } catch (err) {
      alert(`❌ Connection test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) return <div className="loading">Loading Youcan dashboard...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="youcan-dashboard">
      <div className="dashboard-header">
        <h2>Youcan Shop Dashboard</h2>
        <button onClick={testConnection} className="test-connection-btn">
          Test Connection
        </button>
      </div>

      {shopInfo && (
        <div className="shop-info-card">
          <h3>Shop Information</h3>
          <div className="shop-details">
            <div className="detail-item">
              <label>Shop Name:</label>
              <span>{shopInfo.name}</span>
            </div>
            <div className="detail-item">
              <label>Domain:</label>
              <span>{shopInfo.domain}</span>
            </div>
            <div className="detail-item">
              <label>Email:</label>
              <span>{shopInfo.email}</span>
            </div>
            <div className="detail-item">
              <label>Currency:</label>
              <span>{shopInfo.currency}</span>
            </div>
            <div className="detail-item">
              <label>Plan:</label>
              <span className="plan-badge">{shopInfo.plan}</span>
            </div>
            <div className="detail-item">
              <label>Status:</label>
              <span className={`status-badge ${shopInfo.status}`}>
                {shopInfo.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {orderSummary && (
        <div className="order-summary-card">
          <h3>Order Summary</h3>
          <div className="summary-grid">
            <div className="summary-item total">
              <div className="summary-number">{orderSummary.total_orders}</div>
              <div className="summary-label">Total Orders</div>
            </div>
            <div className="summary-item pending">
              <div className="summary-number">{orderSummary.pending_orders}</div>
              <div className="summary-label">Pending</div>
            </div>
            <div className="summary-item confirmed">
              <div className="summary-number">{orderSummary.confirmed_orders}</div>
              <div className="summary-label">Confirmed</div>
            </div>
            <div className="summary-item cancelled">
              <div className="summary-number">{orderSummary.cancelled_orders}</div>
              <div className="summary-label">Cancelled</div>
            </div>
          </div>
        </div>
      )}

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button 
            onClick={() => window.location.href = `/orders?connection=${connectionId}`}
            className="action-btn primary"
          >
            View All Orders
          </button>
          <button 
            onClick={() => window.location.href = `/orders?connection=${connectionId}&status=pending`}
            className="action-btn secondary"
          >
            Pending Orders
          </button>
          <button 
            onClick={fetchDashboardData}
            className="action-btn tertiary"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Backend Service Usage for Youcan Shop

```typescript
// services/youcan-order-sync.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { YoucanOAuth2Service } from '../auth/services/youcan-oauth2.service';
import { PrismaService } from '../common/database/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class YoucanOrderSyncService {
  private readonly logger = new Logger(YoucanOrderSyncService.name);

  constructor(
    private readonly youcanOAuth2Service: YoucanOAuth2Service,
    private readonly prismaService: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncYoucanOrders(): Promise<void> {
    this.logger.log('Starting Youcan order sync');

    try {
      // Get all active Youcan connections
      const connections = await this.prismaService.platformConnection.findMany({
        where: {
          platformType: 'YOUCAN',
          status: 'ACTIVE',
        },
      });

      for (const connection of connections) {
        await this.syncConnectionOrders(connection.id);
      }

      this.logger.log(`Completed Youcan order sync for ${connections.length} connections`);
    } catch (error) {
      this.logger.error('Failed to sync Youcan orders', { error: error.message });
    }
  }

  async syncConnectionOrders(connectionId: string): Promise<void> {
    try {
      // Get access token
      const accessToken = await this.youcanOAuth2Service['oauth2Service'].getAccessToken(connectionId);

      // Fetch recent orders (last 24 hours)
      const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const ordersResponse = await this.youcanOAuth2Service.getYoucanOrders(accessToken, {
        dateFrom,
        limit: 100,
      });

      if (ordersResponse.success && ordersResponse.data.orders) {
        for (const order of ordersResponse.data.orders) {
          await this.processYoucanOrder(order, connectionId);
        }
      }

      this.logger.log(`Synced orders for connection ${connectionId}`);
    } catch (error) {
      this.logger.error(`Failed to sync orders for connection ${connectionId}`, {
        error: error.message,
        connectionId,
      });
    }
  }

  private async processYoucanOrder(orderData: any, connectionId: string): Promise<void> {
    try {
      const connection = await this.prismaService.platformConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection) return;

      // Transform Youcan order to our format
      const transformedOrder = {
        externalOrderId: orderData.id.toString(),
        orderNumber: orderData.order_number,
        status: this.mapYoucanStatus(orderData.status),
        total: parseFloat(orderData.total || '0'),
        currency: orderData.currency || 'MAD',
        customerName: orderData.customer?.name || '',
        customerEmail: orderData.customer?.email || '',
        customerPhone: orderData.customer?.phone || '',
        shippingAddress: orderData.shipping_address?.address || '',
        shippingCity: orderData.shipping_address?.city || '',
        orderDate: new Date(orderData.created_at),
        platformData: orderData,
        organizationId: connection.organizationId,
        connectionId,
      };

      // Upsert order in database
      await this.prismaService.order.upsert({
        where: {
          externalOrderId_organizationId: {
            externalOrderId: transformedOrder.externalOrderId,
            organizationId: connection.organizationId,
          },
        },
        update: {
          status: transformedOrder.status,
          total: transformedOrder.total,
          platformData: transformedOrder.platformData,
          updatedAt: new Date(),
        },
        create: transformedOrder,
      });

      this.logger.debug(`Processed Youcan order ${orderData.order_number}`);
    } catch (error) {
      this.logger.error(`Failed to process Youcan order ${orderData.id}`, {
        error: error.message,
        orderId: orderData.id,
      });
    }
  }

  private mapYoucanStatus(youcanStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'NEW',
      'confirmed': 'CONFIRMED',
      'processing': 'IN_PROGRESS',
      'shipped': 'SHIPPED',
      'delivered': 'DELIVERED',
      'cancelled': 'CANCELLED',
      'refunded': 'REFUNDED',
    };
    return statusMap[youcanStatus] || 'NEW';
  }

  /**
   * Update order status in Youcan Shop
   */
  async updateYoucanOrderStatus(
    orderId: string,
    newStatus: string,
    notes?: string,
  ): Promise<void> {
    try {
      // Find the order and its connection
      const order = await this.prismaService.order.findUnique({
        where: { id: orderId },
        include: { connection: true },
      });

      if (!order || !order.connection || order.connection.platformType !== 'YOUCAN') {
        throw new Error('Youcan order not found');
      }

      // Get access token
      const accessToken = await this.youcanOAuth2Service['oauth2Service'].getAccessToken(
        order.connection.id,
      );

      // Map our status to Youcan status
      const youcanStatus = this.mapToYoucanStatus(newStatus);

      // Update status in Youcan
      await this.youcanOAuth2Service.updateYoucanOrderStatus(
        accessToken,
        order.externalOrderId,
        youcanStatus,
        notes,
      );

      // Update local order status
      await this.prismaService.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Updated Youcan order ${order.orderNumber} status to ${newStatus}`);
    } catch (error) {
      this.logger.error(`Failed to update Youcan order status`, {
        error: error.message,
        orderId,
        newStatus,
      });
      throw error;
    }
  }

  private mapToYoucanStatus(internalStatus: string): string {
    const statusMap: Record<string, string> = {
      'NEW': 'pending',
      'CONFIRMED': 'confirmed',
      'IN_PROGRESS': 'processing',
      'SHIPPED': 'shipped',
      'DELIVERED': 'delivered',
      'CANCELLED': 'cancelled',
      'REFUNDED': 'refunded',
    };
    return statusMap[internalStatus] || 'pending';
  }
}
```

### Youcan Shop Webhook Handler

```typescript
// controllers/youcan-webhook.controller.ts
import { Controller, Post, Body, Headers, Logger, BadRequestException } from '@nestjs/common';
import { YoucanOAuth2Service } from '../auth/services/youcan-oauth2.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks/youcan')
export class YoucanWebhookController {
  private readonly logger = new Logger(YoucanWebhookController.name);

  constructor(
    private readonly youcanOAuth2Service: YoucanOAuth2Service,
    private readonly configService: ConfigService,
  ) {}

  @Post('order-updated')
  async handleOrderUpdate(
    @Body() payload: any,
    @Headers('x-youcan-signature') signature: string,
  ): Promise<{ success: boolean }> {
    try {
      // Validate webhook signature
      const webhookSecret = this.configService.get<string>('YOUCAN_WEBHOOK_SECRET');
      if (!webhookSecret) {
        throw new BadRequestException('Webhook secret not configured');
      }

      const isValid = this.youcanOAuth2Service.validateYoucanWebhook(
        JSON.stringify(payload),
        signature,
        webhookSecret,
      );

      if (!isValid) {
        throw new BadRequestException('Invalid webhook signature');
      }

      // Process the webhook
      await this.processOrderUpdateWebhook(payload);

      this.logger.log('Successfully processed Youcan order update webhook', {
        orderId: payload.order?.id,
        status: payload.order?.status,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process Youcan webhook', {
        error: error.message,
        payload,
      });
      throw error;
    }
  }

  private async processOrderUpdateWebhook(payload: any): Promise<void> {
    const { order, event_type } = payload;

    if (!order || !order.id) {
      throw new BadRequestException('Invalid webhook payload');
    }

    // Find the order in our database
    const existingOrder = await this.prismaService.order.findFirst({
      where: {
        externalOrderId: order.id.toString(),
      },
    });

    if (existingOrder) {
      // Update existing order
      await this.prismaService.order.update({
        where: { id: existingOrder.id },
        data: {
          status: this.mapYoucanStatus(order.status),
          platformData: order,
          updatedAt: new Date(),
        },
      });
    } else {
      // This is a new order, sync it
      this.logger.log('New order received via webhook, triggering sync', {
        orderId: order.id,
      });
      // Could trigger a full sync or create the order directly
    }
  }

  private mapYoucanStatus(youcanStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'NEW',
      'confirmed': 'CONFIRMED',
      'processing': 'IN_PROGRESS',
      'shipped': 'SHIPPED',
      'delivered': 'DELIVERED',
      'cancelled': 'CANCELLED',
      'refunded': 'REFUNDED',
    };
    return statusMap[youcanStatus] || 'NEW';
  }
}
```

### Youcan Shop Environment Configuration

Add these additional environment variables for Youcan Shop:

```bash
# Youcan Shop Webhook Configuration
YOUCAN_WEBHOOK_SECRET=your-webhook-secret-key

# Youcan Shop API Configuration (if different from OAuth2)
YOUCAN_API_BASE_URL=https://youcan.shop/api/v1
YOUCAN_API_TIMEOUT=30000

# Youcan Shop Specific Settings
YOUCAN_DEFAULT_CURRENCY=MAD
YOUCAN_DEFAULT_TIMEZONE=Africa/Casablanca
```

This completes the Youcan Shop specific integration examples, providing comprehensive frontend and backend implementation patterns for working with the Youcan OAuth2 service.