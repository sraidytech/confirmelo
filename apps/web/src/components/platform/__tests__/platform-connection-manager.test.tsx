import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PlatformConnectionManager } from '../platform-connection-manager';
import { api } from '@/lib/api';
import { PlatformType, ConnectionStatus } from '@/types/auth';

// Mock the API
jest.mock('@/lib/api');
const mockApi = api as jest.Mocked<typeof api>;

// Mock the hooks
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

const mockConnections = [
  {
    id: 'conn-1',
    platformType: PlatformType.YOUCAN,
    platformName: 'My Youcan Store',
    status: ConnectionStatus.ACTIVE,
    scopes: ['read_orders', 'write_orders'],
    tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    lastSyncAt: new Date().toISOString(),
    syncCount: 5,
    platformData: { storeId: 'store-123' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conn-2',
    platformType: PlatformType.GOOGLE_SHEETS,
    platformName: 'Order Sheet',
    status: ConnectionStatus.EXPIRED,
    scopes: ['read_sheets'],
    tokenExpiresAt: new Date(Date.now() - 3600000).toISOString(),
    lastSyncAt: new Date().toISOString(),
    syncCount: 2,
    platformData: { sheetId: 'sheet-456' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('PlatformConnectionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getPlatformConnections.mockResolvedValue({
      connections: mockConnections,
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('renders platform connections manager', async () => {
    render(<PlatformConnectionManager />);

    expect(screen.getByText('Loading platform connections...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Platform Connections')).toBeInTheDocument();
    });

    expect(screen.getByText('Manage your integrations with e-commerce platforms and data sources.')).toBeInTheDocument();
  });

  it('displays connection statistics', async () => {
    render(<PlatformConnectionManager />);

    await waitFor(() => {
      expect(screen.getByText('Total Connections')).toBeInTheDocument();
    });

    expect(screen.getAllByText('2')[0]).toBeInTheDocument(); // Total connections
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('displays connection cards', async () => {
    render(<PlatformConnectionManager />);

    await waitFor(() => {
      expect(screen.getByText('My Youcan Store')).toBeInTheDocument();
    });

    expect(screen.getByText('Order Sheet')).toBeInTheDocument();
    expect(screen.getByText('YOUCAN')).toBeInTheDocument();
    expect(screen.getByText('GOOGLE_SHEETS')).toBeInTheDocument();
  });

  it('shows add connection button', async () => {
    render(<PlatformConnectionManager />);

    await waitFor(() => {
      expect(screen.getByText('Add Connection')).toBeInTheDocument();
    });
  });

  it('shows refresh button', async () => {
    render(<PlatformConnectionManager />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('handles empty state', async () => {
    mockApi.getPlatformConnections.mockResolvedValue({
      connections: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    render(<PlatformConnectionManager />);

    await waitFor(() => {
      expect(screen.getByText('No Platform Connections')).toBeInTheDocument();
    });

    expect(screen.getByText('Connect your e-commerce platforms and data sources to start managing orders.')).toBeInTheDocument();
    expect(screen.getByText('Add Your First Connection')).toBeInTheDocument();
  });

  it('handles API error', async () => {
    mockApi.getPlatformConnections.mockRejectedValue(new Error('API Error'));

    render(<PlatformConnectionManager />);

    await waitFor(() => {
      expect(mockApi.getPlatformConnections).toHaveBeenCalled();
    });

    // The component should handle the error gracefully
    // Error handling is done through toast notifications
  });
});