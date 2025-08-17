import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AccountSelector } from '../account-selector';
import { ErrorRecoveryDialog, ErrorType } from '../error-recovery-dialog';
import { ConnectionHealthIndicator, HealthStatus } from '../connection-health-indicator';

// Mock the API
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock the toast hook
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '2 hours ago'),
}));

describe('Google Sheets Components', () => {
  describe('AccountSelector', () => {
    const mockAccounts = [
      {
        id: '1',
        email: 'user1@example.com',
        name: 'User One',
        status: 'ACTIVE' as const,
        connectionId: '1',
        connectedSpreadsheets: 3,
      },
      {
        id: '2',
        email: 'user2@example.com',
        name: 'User Two',
        status: 'EXPIRED' as const,
        connectionId: '2',
        connectedSpreadsheets: 1,
      },
    ];

    beforeEach(() => {
      const { api } = require('@/lib/api');
      api.get.mockResolvedValue({
        data: { accounts: mockAccounts },
      });
    });

    it('renders account selector with accounts', async () => {
      const onAccountSelected = jest.fn();
      const onAddNewAccount = jest.fn();

      render(
        <AccountSelector
          onAccountSelected={onAccountSelected}
          onAddNewAccount={onAddNewAccount}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Select Google account...')).toBeInTheDocument();
      });
    });

    it('calls onAddNewAccount when add button is clicked', async () => {
      const onAccountSelected = jest.fn();
      const onAddNewAccount = jest.fn();

      render(
        <AccountSelector
          onAccountSelected={onAccountSelected}
          onAddNewAccount={onAddNewAccount}
        />
      );

      await waitFor(() => {
        const addButton = screen.getByText('Add Account');
        fireEvent.click(addButton);
        expect(onAddNewAccount).toHaveBeenCalled();
      });
    });
  });

  describe('ErrorRecoveryDialog', () => {
    const mockError = {
      type: ErrorType.TOKEN_EXPIRED,
      message: 'Access token has expired',
      connectionId: 'conn-123',
      timestamp: new Date().toISOString(),
    };

    it('renders error dialog with correct title and message', () => {
      const onClose = jest.fn();

      render(
        <ErrorRecoveryDialog
          isOpen={true}
          onClose={onClose}
          error={mockError}
        />
      );

      expect(screen.getByText('Access Token Expired')).toBeInTheDocument();
      expect(screen.getByText('Access token has expired')).toBeInTheDocument();
    });

    it('shows appropriate recovery actions for token expired error', () => {
      const onClose = jest.fn();

      render(
        <ErrorRecoveryDialog
          isOpen={true}
          onClose={onClose}
          error={mockError}
        />
      );

      expect(screen.getByText('Refresh Token')).toBeInTheDocument();
      expect(screen.getByText('Re-authenticate')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn();

      render(
        <ErrorRecoveryDialog
          isOpen={true}
          onClose={onClose}
          error={mockError}
        />
      );

      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('ConnectionHealthIndicator', () => {
    const mockHealthData = {
      status: HealthStatus.HEALTHY,
      connectionStatus: 'ACTIVE' as const,
      lastChecked: new Date().toISOString(),
      uptime: 99.5,
      errorCount: 0,
      warnings: [],
    };

    beforeEach(() => {
      const { api } = require('@/lib/api');
      api.get.mockResolvedValue({
        data: mockHealthData,
      });
    });

    it('renders health indicator with correct status', async () => {
      render(
        <ConnectionHealthIndicator
          connectionId="conn-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument();
      });
    });

    it('shows detailed information when showDetails is true', async () => {
      render(
        <ConnectionHealthIndicator
          connectionId="conn-123"
          showDetails={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Uptime: 99.5%')).toBeInTheDocument();
      });
    });

    it('calls onHealthChange when health status changes', async () => {
      const onHealthChange = jest.fn();

      render(
        <ConnectionHealthIndicator
          connectionId="conn-123"
          onHealthChange={onHealthChange}
        />
      );

      await waitFor(() => {
        expect(onHealthChange).toHaveBeenCalledWith(mockHealthData);
      });
    });
  });
});