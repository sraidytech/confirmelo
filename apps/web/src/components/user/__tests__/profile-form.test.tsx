import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileForm } from '../profile-form';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiClient } from '@/lib/api';

// Mock dependencies
jest.mock('@/contexts/auth-context');
jest.mock('@/hooks/use-toast');
jest.mock('@/hooks/use-translation');
jest.mock('@/lib/api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseTranslation = useTranslation as jest.MockedFunction<typeof useTranslation>;
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const mockUser = {
  id: '1',
  email: 'john.doe@example.com',
  username: 'johndoe',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1234567890',
  avatar: 'https://example.com/avatar.jpg',
  role: 'CLIENT_USER' as any,
  status: 'ACTIVE' as any,
  isOnline: true,
  organizationId: 'org-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockToast = jest.fn();
const mockT = jest.fn((key: string) => key);

describe('ProfileForm', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      refreshToken: jest.fn(),
      resetPassword: jest.fn(),
      confirmPasswordReset: jest.fn(),
      changePassword: jest.fn(),
    });

    mockUseToast.mockReturnValue({
      toast: mockToast,
    });

    mockUseTranslation.mockReturnValue({
      t: mockT,
    });

    jest.clearAllMocks();
  });

  it('renders profile form with user data', () => {
    render(<ProfileForm user={mockUser} />);

    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('johndoe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
  });

  it('displays user avatar with initials fallback', () => {
    render(<ProfileForm user={mockUser} />);

    const avatar = screen.getByRole('img');
    expect(avatar).toHaveAttribute('src', mockUser.avatar);
    
    // Check for initials fallback
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(<ProfileForm user={mockUser} />);

    const firstNameInput = screen.getByDisplayValue('John');
    fireEvent.change(firstNameInput, { target: { value: '' } });
    fireEvent.blur(firstNameInput);

    await waitFor(() => {
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    });
  });

  it('submits form with updated data', async () => {
    const mockUpdateProfile = jest.fn().mockResolvedValue({
      user: { ...mockUser, firstName: 'Jane' },
    });
    mockApiClient.updateProfile = mockUpdateProfile;

    const onUpdate = jest.fn();
    render(<ProfileForm user={mockUser} onUpdate={onUpdate} />);

    const firstNameInput = screen.getByDisplayValue('John');
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });

    const saveButton = screen.getByRole('button', { name: /profile\.save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
      });
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'profile.updateSuccess',
      description: 'profile.updateSuccessDescription',
    });

    expect(onUpdate).toHaveBeenCalledWith({ ...mockUser, firstName: 'Jane' });
  });

  it('handles avatar upload', async () => {
    const mockUpdateAvatar = jest.fn().mockResolvedValue({
      success: true,
      avatarUrl: 'https://example.com/new-avatar.jpg',
    });
    mockApiClient.updateAvatar = mockUpdateAvatar;

    render(<ProfileForm user={mockUser} />);

    const file = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' });
    const avatarInput = screen.getByLabelText(/change avatar/i);
    
    fireEvent.change(avatarInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUpdateAvatar).toHaveBeenCalled();
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'profile.avatarSuccess',
      description: 'profile.avatarSuccessDescription',
    });
  });

  it('validates avatar file type', async () => {
    render(<ProfileForm user={mockUser} />);

    const file = new File(['document'], 'document.pdf', { type: 'application/pdf' });
    const avatarInput = screen.getByLabelText(/change avatar/i);
    
    fireEvent.change(avatarInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'profile.avatarError',
        description: 'profile.avatarInvalidType',
      });
    });
  });

  it('validates avatar file size', async () => {
    render(<ProfileForm user={mockUser} />);

    // Create a file larger than 5MB
    const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    const avatarInput = screen.getByLabelText(/change avatar/i);
    
    fireEvent.change(avatarInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'profile.avatarError',
        description: 'profile.avatarTooLarge',
      });
    });
  });

  it('handles API errors gracefully', async () => {
    const mockUpdateProfile = jest.fn().mockRejectedValue(new Error('API Error'));
    mockApiClient.updateProfile = mockUpdateProfile;

    render(<ProfileForm user={mockUser} />);

    const firstNameInput = screen.getByDisplayValue('John');
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });

    const saveButton = screen.getByRole('button', { name: /profile\.save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'profile.updateError',
        description: 'API Error',
      });
    });
  });

  it('disables form during submission', async () => {
    const mockUpdateProfile = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );
    mockApiClient.updateProfile = mockUpdateProfile;

    render(<ProfileForm user={mockUser} />);

    const firstNameInput = screen.getByDisplayValue('John');
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });

    const saveButton = screen.getByRole('button', { name: /profile\.save/i });
    fireEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(firstNameInput).toBeDisabled();
  });
});