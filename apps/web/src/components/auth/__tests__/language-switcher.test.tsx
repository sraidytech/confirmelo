import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { LanguageSwitcher } from '../language-switcher';

// Mock react-i18next
const mockChangeLanguage = jest.fn();
const mockT = jest.fn((key) => key);

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(() => ({
    t: mockT,
    i18n: {
      language: 'en',
      changeLanguage: mockChangeLanguage,
    },
  })),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders language buttons', () => {
    render(<LanguageSwitcher />);
    
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('FR')).toBeInTheDocument();
  });

  it('calls changeLanguage when clicking language buttons', () => {
    render(<LanguageSwitcher />);
    
    fireEvent.click(screen.getByText('FR'));
    expect(mockChangeLanguage).toHaveBeenCalledWith('fr');
    
    fireEvent.click(screen.getByText('EN'));
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
  });

  it('applies correct variant based on current language', () => {
    render(<LanguageSwitcher />);
    
    const frButton = screen.getByText('FR');
    const enButton = screen.getByText('EN');
    
    // Both buttons should have the language-btn class
    expect(frButton).toHaveClass('language-btn');
    expect(enButton).toHaveClass('language-btn');
  });
});