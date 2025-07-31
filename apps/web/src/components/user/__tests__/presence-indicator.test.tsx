import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { PresenceIndicator, UserPresenceCard } from '../presence-indicator';
import { usePresence } from '@/hooks/use-websocket';
import { useTranslation } from '@/hooks/use-translation';
import { apiClient } from '@/lib/api';

// Mock dependencies
jest.mock('@/hooks/use-websocket');
jest.mock('@/hooks/use-translation');
jest.mock('@/lib/api');

const mockUsePresence = usePresence as jest.MockedFunction<typeof usePresence>;
const mockUseTranslation = useTranslation as jest.MockedFunction<typeof useTranslation>;
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const mockT = jest.fn((key: string, options?: any) => {
  if (key === 'presence.minutesAgo' && options?.count) {
    return `${options.count} min ago`;
  }
  if (key === 'presence.hoursAgo' && options?.count) {
    return `${options.count}h ago`;
  }
  return key;
});

describe('PresenceIndicator', () => {
  beforeEach(() => {
    mockUsePresence.mockReturnValue({
      onlineUsers: ['user1', 'user2'],
      updateActivity: jest.fn(),
      isConnected: true,
    });

    mockUseTranslation.mockReturnValue({
      t: mockT,
    });

    mockApiClient.getUserPresence = jest.fn().mockResolvedValue({
      userId: 'user1',
      isOnline: true,
      lastActiveAt: new Date(),
      status: 'ACTIVE',
    });

    jest.clearAllMocks();
  });

  it('shows online indicator for online user', async () => {
    await act(async () => {
      render(<PresenceIndicator userId="user1" showLabel />);
    });

    await waitFor(() => {
      expect(screen.getByText('presence.online')).toBeInTheDocument();
    });

    // Check that the component renders without error
    expect(screen.getByText('presence.online')).toBeInTheDocument();
  });

  it('shows offline indicator for offline user', async () => {
    mockUsePresence.mockReturnValue({
      onlineUsers: ['user2'], // user1 is not in the list
      updateActivity: jest.fn(),
      isConnected: true,
    });

    await act(async () => {
      render(<PresenceIndicator userId="user1" showLabel />);
    });

    await waitFor(() => {
      expect(screen.getByText('presence.offline')).toBeInTheDocument();
    });

    // Check that the component renders without error
    expect(screen.getByText('presence.offline')).toBeInTheDocument();
  });

  it('renders different sizes correctly', async () => {
    await act(async () => {
      const { rerender } = render(<PresenceIndicator userId="user1" size="sm" />);
      expect(screen.getByRole('generic')).toBeInTheDocument();

      rerender(<PresenceIndicator userId="user1" size="md" />);
      expect(screen.getByRole('generic')).toBeInTheDocument();

      rerender(<PresenceIndicator userId="user1" size="lg" />);
      expect(screen.getByRole('generic')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', async () => {
    // Mock a slow API response to catch loading state
    mockApiClient.getUserPresence = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        userId: 'user1',
        isOnline: true,
        lastActiveAt: new Date(),
        status: 'ACTIVE',
      }), 100))
    );

    await act(async () => {
      render(<PresenceIndicator userId="user1" showLabel />);
    });

    expect(screen.getByText('presence.loading')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockApiClient.getUserPresence = jest.fn().mockRejectedValue(new Error('API Error'));
    
    // Mock user as offline since API failed
    mockUsePresence.mockReturnValue({
      onlineUsers: [], // user1 is not in the list
      updateActivity: jest.fn(),
      isConnected: true,
    });

    await act(async () => {
      render(<PresenceIndicator userId="user1" showLabel />);
    });

    await waitFor(() => {
      expect(screen.getByText('presence.offline')).toBeInTheDocument();
    });
  });
});

describe('UserPresenceCard', () => {
  beforeEach(() => {
    mockUsePresence.mockReturnValue({
      onlineUsers: ['user1'],
      updateActivity: jest.fn(),
      isConnected: true,
    });

    mockUseTranslation.mockReturnValue({
      t: mockT,
    });

    mockApiClient.getUserPresence = jest.fn().mockResolvedValue({
      userId: 'user1',
      isOnline: true,
      lastActiveAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      status: 'ACTIVE',
    });

    jest.clearAllMocks();
  });

  it('renders user information correctly', async () => {
    await act(async () => {
      render(
        <UserPresenceCard
          userId="user1"
          userName="John Doe"
          userAvatar="https://example.com/avatar.jpg"
        />
      );
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    // Check for avatar image if it exists, otherwise check for initials
    const avatarImg = screen.queryByRole('img');
    if (avatarImg) {
      expect(avatarImg).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    }
    expect(screen.getByText('JD')).toBeInTheDocument(); // Initials fallback
  });

  it('shows online status for online user', async () => {
    await act(async () => {
      render(
        <UserPresenceCard
          userId="user1"
          userName="John Doe"
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('presence.online')).toBeInTheDocument();
    });
  });

  it('shows offline status with last active time', async () => {
    mockUsePresence.mockReturnValue({
      onlineUsers: [], // User is offline
      updateActivity: jest.fn(),
      isConnected: true,
    });

    mockApiClient.getUserPresence = jest.fn().mockResolvedValue({
      userId: 'user1',
      isOnline: false,
      lastActiveAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      status: 'ACTIVE',
    });

    await act(async () => {
      render(
        <UserPresenceCard
          userId="user1"
          userName="John Doe"
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('presence.offline')).toBeInTheDocument();
      expect(screen.getByText('30 min ago')).toBeInTheDocument();
    });
  });

  it('generates correct initials for user names', async () => {
    await act(async () => {
      render(
        <UserPresenceCard
          userId="user1"
          userName="John Michael Doe"
        />
      );
    });

    expect(screen.getByText('JM')).toBeInTheDocument();
  });

  it('handles single name correctly', async () => {
    await act(async () => {
      render(
        <UserPresenceCard
          userId="user1"
          userName="John"
        />
      );
    });

    expect(screen.getByText('J')).toBeInTheDocument();
  });
});