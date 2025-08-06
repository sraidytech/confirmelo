import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GoogleSheetsConnectionCard } from '../google-sheets-connection-card';
import { PlatformConnection, ConnectionStatus, PlatformType } from '@/types/auth';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Mock dependencies
jest.mock('@/lib/api');
jest.mock('@/hooks/use-toast');
jest.mock('../spreadsheet-selector', () => ({
  SpreadsheetSelector: ({ onSpreadsheetSelected, onClose }: any) => (
    <div data-testid="spreadsheet-selector">
      <button onClick={() => onSpreadsheetSelected('test-spreadsheet-id')}>
        Select Spreadsheet
      </button>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const mockToast = jest.fn();
(useToast as jest.Mock).mockReturnValue({ toast: mockToast });

const mockConnection: PlatformConnection = {
  id: 'test-connection-id',
  platformType: PlatformType.GOOGLE_SHEETS,
  platformName: 'Google Sheets - test@gmail.com',
  status: ConnectionStatus.ACTIVE,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ],
  tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  lastSyncAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
  syncCount: 5,
  platformData: {
    google_email: 'test@gmail.com',
    google_name: 'Test User',
  },
  createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
  updatedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
};

const mockConnectedSpreadsheets = [
  {
    id: 'spreadsheet-1',
    name: 'Orders Spreadsheet',
    connectedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet-1',
    sheets: [
      { id: 0, name: 'Orders', index: 0, rowCount: 1000, columnCount: 12 },
      { id: 1, name: 'Products', index: 1, rowCount: 500, columnCount: 8 },
    ],
    syncCount: 10,
    lastSyncAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'spreadsheet-2',
    name: 'Customers Spreadsheet',
    connectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    webViewLink: 'https://docs.google.com/spreadsheets/d/spreadsheet-2',
    sheets: [
      { id: 0, name: 'Customers', index: 0, rowCount: 800, columnCount: 10 },
    ],
    hasError: true,
    lastError: 'Permission denied',
    syncCount: 3,
  },
];

describe('GoogleSheetsConnectionCard', () => {
  const mockOnConnectionUpdated = jest.fn();
  const mockOnConnectionDeleted = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockResolvedValue({
      data: { spreadsheets: mockConnectedSpreadsheets },
    });
  });

  const renderComponent = (connection = mockConnection) => {
    return render(
      <GoogleSheetsConnectionCard
        connection={connection}
        onConnectionUpdated={mockOnConnectionUpdated}
        onConnectionDeleted={mockOnConnectionDeleted}
      />
    );
  };

  describe('Basic Rendering', () => {
    it('should render connection information correctly', async () => {
      renderComponent();

      expect(screen.getByText('Google Sheets - test@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('Google Sheets')).toBeInTheDocument();
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();

      // Wait for connected spreadsheets to load
      await waitFor(() => {
        expect(screen.getByText('Connected Spreadsheets (2)')).toBeInTheDocument();
      });
    });

    it('should display connection scopes', () => {
      renderComponent();

      expect(screen.getByText('spreadsheets')).toBeInTheDocument();
      expect(screen.getByText('drive.file')).toBeInTheDocument();
    });

    it('should show token expiration status', () => {
      renderComponent();

      expect(screen.getByText(/Token Expires:/)).toBeInTheDocument();
      expect(screen.getByText(/in about 1 hour/)).toBeInTheDocument();
    });

    it('should display expired token warning', () => {
      const expiredConnection = {
        ...mockConnection,
        tokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      };

      renderComponent(expiredConnection);

      expect(screen.getByText(/\(Expired\)/)).toBeInTheDocument();
    });
  });

  describe('Connected Spreadsheets', () => {
    it('should display connected spreadsheets', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Orders Spreadsheet')).toBeInTheDocument();
        expect(screen.getByText('Customers Spreadsheet')).toBeInTheDocument();
      });

      expect(screen.getByText('10 syncs')).toBeInTheDocument();
      expect(screen.getByText('3 syncs')).toBeInTheDocument();
    });

    it('should show spreadsheet sheets information', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Sheets (2):')).toBeInTheDocument();
        expect(screen.getByText('Orders (1000×12)')).toBeInTheDocument();
        expect(screen.getByText('Products (500×8)')).toBeInTheDocument();
      });
    });

    it('should display error status for problematic spreadsheets', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
        expect(screen.getByText('Permission denied')).toBeInTheDocument();
      });
    });

    it('should show empty state when no spreadsheets are connected', async () => {
      (api.get as jest.Mock).mockResolvedValue({
        data: { spreadsheets: [] },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No spreadsheets connected')).toBeInTheDocument();
        expect(screen.getByText('Click "Connect" to select a spreadsheet')).toBeInTheDocument();
      });
    });
  });

  describe('Connection Actions', () => {
    it('should refresh connection when refresh button is clicked', async () => {
      (api.refreshPlatformConnection as jest.Mock) = jest.fn().mockResolvedValue({});

      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(api.refreshPlatformConnection).toHaveBeenCalledWith('test-connection-id');
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Connection Refreshed',
          description: 'The Google Sheets connection has been successfully refreshed.',
        });
        expect(mockOnConnectionUpdated).toHaveBeenCalled();
      });
    });

    it('should test connection when test button is clicked', async () => {
      (api.testPlatformConnection as jest.Mock) = jest.fn().mockResolvedValue({
        success: true,
        details: { platform: 'Google Sheets' },
      });

      renderComponent();

      const testButton = screen.getByRole('button', { name: /test/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(api.testPlatformConnection).toHaveBeenCalledWith('test-connection-id');
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Connection Test Successful',
          description: 'The Google Sheets connection is working properly.',
        });
      });
    });

    it('should handle test connection failure', async () => {
      (api.testPlatformConnection as jest.Mock) = jest.fn().mockResolvedValue({
        success: false,
        error: 'Token expired',
      });

      renderComponent();

      const testButton = screen.getByRole('button', { name: /test/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Connection Test Failed',
          description: 'Token expired',
          variant: 'destructive',
        });
      });
    });

    it('should revoke connection when delete button is clicked', async () => {
      (api.revokePlatformConnection as jest.Mock) = jest.fn().mockResolvedValue({});
      window.confirm = jest.fn().mockReturnValue(true);

      renderComponent();

      const deleteButton = screen.getByRole('button', { name: /revoke/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(
          'Are you sure you want to revoke this connection? This action cannot be undone.'
        );
        expect(api.revokePlatformConnection).toHaveBeenCalledWith('test-connection-id');
        expect(mockOnConnectionDeleted).toHaveBeenCalled();
      });
    });

    it('should not revoke connection when user cancels confirmation', async () => {
      window.confirm = jest.fn().mockReturnValue(false);

      renderComponent();

      const deleteButton = screen.getByRole('button', { name: /revoke/i });
      fireEvent.click(deleteButton);

      expect(api.revokePlatformConnection).not.toHaveBeenCalled();
      expect(mockOnConnectionDeleted).not.toHaveBeenCalled();
    });
  });

  describe('Spreadsheet Management', () => {
    it('should open spreadsheet selector when connect button is clicked', async () => {
      renderComponent();

      await waitFor(() => {
        const connectButton = screen.getByRole('button', { name: /connect/i });
        fireEvent.click(connectButton);
      });

      expect(screen.getByTestId('spreadsheet-selector')).toBeInTheDocument();
    });

    it('should connect to spreadsheet when selected', async () => {
      (api.post as jest.Mock).mockResolvedValue({
        data: { name: 'New Spreadsheet' },
      });

      renderComponent();

      await waitFor(() => {
        const connectButton = screen.getByRole('button', { name: /connect/i });
        fireEvent.click(connectButton);
      });

      const selectButton = screen.getByText('Select Spreadsheet');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/auth/oauth2/google-sheets/connections/test-connection-id/connect-spreadsheet',
          { spreadsheetId: 'test-spreadsheet-id' }
        );
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Spreadsheet Connected',
          description: 'Successfully connected to "New Spreadsheet".',
        });
      });
    });

    it('should disconnect from spreadsheet when disconnect button is clicked', async () => {
      (api.delete as jest.Mock).mockResolvedValue({});
      window.confirm = jest.fn().mockReturnValue(true);

      renderComponent();

      await waitFor(() => {
        const disconnectButtons = screen.getAllByTitle('Disconnect');
        fireEvent.click(disconnectButtons[0]);
      });

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(
          '/auth/oauth2/google-sheets/connections/test-connection-id/spreadsheets/spreadsheet-1/disconnect'
        );
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Spreadsheet Disconnected',
          description: 'Successfully disconnected from the spreadsheet.',
        });
      });
    });

    it('should open spreadsheet in new tab when external link is clicked', async () => {
      window.open = jest.fn();

      renderComponent();

      await waitFor(() => {
        const externalLinkButtons = screen.getAllByTitle('Open in Google Sheets');
        fireEvent.click(externalLinkButtons[0]);
      });

      expect(window.open).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/spreadsheet-1',
        '_blank'
      );
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner during refresh', async () => {
      (api.refreshPlatformConnection as jest.Mock) = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      // Should show loading spinner
      expect(refreshButton.querySelector('.animate-spin')).toBeInTheDocument();

      await waitFor(() => {
        expect(refreshButton.querySelector('.animate-spin')).not.toBeInTheDocument();
      });
    });

    it('should show loading spinner during connection test', async () => {
      (api.testPlatformConnection as jest.Mock) = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      renderComponent();

      const testButton = screen.getByRole('button', { name: /test/i });
      fireEvent.click(testButton);

      // Should show loading spinner
      expect(testButton.querySelector('.animate-spin')).toBeInTheDocument();

      await waitFor(() => {
        expect(testButton.querySelector('.animate-spin')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (api.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      renderComponent();

      // Should not crash and show empty state
      await waitFor(() => {
        expect(screen.getByText('No spreadsheets connected')).toBeInTheDocument();
      });
    });

    it('should display error toast for failed operations', async () => {
      (api.refreshPlatformConnection as jest.Mock) = jest.fn().mockRejectedValue(
        new Error('Refresh failed')
      );

      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Refresh Failed',
          description: 'Refresh failed',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      renderComponent();

      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      refreshButton.focus();
      expect(document.activeElement).toBe(refreshButton);

      // Tab to next button
      fireEvent.keyDown(refreshButton, { key: 'Tab' });
      const testButton = screen.getByRole('button', { name: /test/i });
      expect(document.activeElement).toBe(testButton);
    });
  });

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      const { rerender } = renderComponent();

      // Re-render with same props
      rerender(
        <GoogleSheetsConnectionCard
          connection={mockConnection}
          onConnectionUpdated={mockOnConnectionUpdated}
          onConnectionDeleted={mockOnConnectionDeleted}
        />
      );

      // Should only call API once for initial load
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('should handle large numbers of connected spreadsheets efficiently', async () => {
      const manySpreadsheets = Array.from({ length: 50 }, (_, i) => ({
        ...mockConnectedSpreadsheets[0],
        id: `spreadsheet-${i}`,
        name: `Spreadsheet ${i}`,
      }));

      (api.get as jest.Mock).mockResolvedValue({
        data: { spreadsheets: manySpreadsheets },
      });

      const startTime = Date.now();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Connected Spreadsheets (50)')).toBeInTheDocument();
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should render quickly
    });
  });
});