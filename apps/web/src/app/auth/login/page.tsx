'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/auth/language-switcher';
import { LoginCredentials } from '@/types/auth';

type LoginFormData = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('auth');

  const loginSchema = z.object({
    email: z.string().email(t('validation.emailInvalid')),
    password: z.string().min(1, t('validation.passwordRequired')),
    rememberMe: z.boolean().optional(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      await login(data as LoginCredentials);
      router.push('/dashboard');
    } catch (error: any) {
      // Handle specific error cases
      if (error.code === 'INVALID_CREDENTIALS') {
        const message = t('errors.invalidCredentials');
        setError('email', { message });
        setError('password', { message });
      } else if (error.code === 'ACCOUNT_LOCKED') {
        setError('email', { message: t('errors.accountLocked') });
      } else if (error.code === 'ACCOUNT_SUSPENDED') {
        setError('email', { message: t('errors.accountSuspended') });
      } else {
        setError('email', { message: error.message || t('errors.serverError') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <LanguageSwitcher />
      
      <Card className="auth-card">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">C</span>
            </div>
          </div>
          <CardTitle className="text-2xl text-center">{t('login.title')}</CardTitle>
          <CardDescription className="text-center">
            {t('login.subtitle')}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
            <div className="form-group">
              <Label htmlFor="email" className="form-label">
                {t('login.email')}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t('login.emailPlaceholder')}
                className="form-input"
                {...register('email')}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>

            <div className="form-group">
              <Label htmlFor="password" className="form-label">
                {t('login.password')}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('login.passwordPlaceholder')}
                  className="form-input pr-10"
                  {...register('password')}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="rememberMe"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  {...register('rememberMe')}
                  disabled={isLoading}
                />
                <Label htmlFor="rememberMe" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  {t('login.rememberMe')}
                </Label>
              </div>
              
              <Link
                href="/auth/forgot-password"
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              className="btn-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="loading-spinner" />
                  {t('login.submitting')}
                </>
              ) : (
                t('login.submit')
              )}
            </Button>

            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('login.noAccount')}{' '}
                <Link
                  href="/auth/register"
                  className="text-blue-600 hover:text-blue-500 dark:text-blue-400 font-medium"
                >
                  {t('login.signUp')}
                </Link>
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}