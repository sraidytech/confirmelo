import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PasswordStrength } from '../password-strength';

describe('PasswordStrength', () => {
  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordStrength password="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows weak strength for simple password', () => {
    render(<PasswordStrength password="123" />);
    expect(screen.getByText('weak')).toBeInTheDocument();
  });

  it('shows validation errors for weak password', () => {
    render(<PasswordStrength password="weak" />);
    expect(screen.getByText(/Password must be at least 12 characters long/)).toBeInTheDocument();
    expect(screen.getByText(/Password must contain at least one uppercase letter/)).toBeInTheDocument();
  });

  it('shows strong strength for complex password', () => {
    render(<PasswordStrength password="StrongPassword123!" />);
    expect(screen.getByText('strong')).toBeInTheDocument();
  });
});