'use client';

import { useTranslation } from 'react-i18next';
import { validatePassword } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  const { t } = useTranslation('auth');
  
  if (!password) return null;

  const { strength, errors } = validatePassword(password);

  const getStrengthColor = () => {
    switch (strength) {
      case 'weak':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'strong':
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStrengthWidth = () => {
    switch (strength) {
      case 'weak':
        return 'w-1/3';
      case 'medium':
        return 'w-2/3';
      case 'strong':
        return 'w-full';
      default:
        return 'w-0';
    }
  };

  return (
    <div className={`password-strength ${className}`}>
      <div className="flex items-center space-x-2 mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Password strength:
        </span>
        <span className={`text-sm font-medium ${
          strength === 'weak' ? 'text-red-600' :
          strength === 'medium' ? 'text-yellow-600' :
          'text-green-600'
        }`}>
          {strength === 'weak' && t('passwordStrength.weak')}
          {strength === 'medium' && t('passwordStrength.fair')}
          {strength === 'strong' && t('passwordStrength.strong')}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
        <div
          className={`strength-bar ${getStrengthWidth()} ${getStrengthColor()}`}
        />
      </div>

      {errors.length > 0 && (
        <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
          {errors.map((error, index) => (
            <li key={index}>• {error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}