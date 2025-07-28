'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/auth-context';
import { useLoginRedirect } from '@/hooks/use-auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/auth/language-switcher';
import { PasswordStrength } from '@/components/auth/password-strength';
import { RegisterData } from '@/types/auth';
import { validatePassword } from '@/lib/utils';

type RegisterFormData = {
  organizationName: string;
  organizationEmail: string;
  organizationPhone?: string;
  organizationAddress?: string;
  organizationCity?: string;
  organizationCountry: string;
  organizationWebsite?: string;
  organizationTaxId?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
};

function RegisterPageContent() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('auth');
  const { redirectAfterLogin } = useLoginRedirect();

  const registerSchema = z.object({
    // Organization details
    organizationName: z.string().min(2, t('validation.organizationNameTooShort', { min: 2 })),
    organizationEmail: z.string().email(t('validation.emailInvalid')),
    organizationPhone: z.string().optional(),
    organizationAddress: z.string().optional(),
    organizationCity: z.string().optional(),
    organizationCountry: z.string().min(2, t('validation.countryRequired')),
    organizationWebsite: z.string().url(t('validation.websiteInvalid')).optional().or(z.literal('')),
    organizationTaxId: z.string().optional(),

    // Admin user details
    firstName: z.string().min(2, t('validation.firstNameTooShort', { min: 2 })),
    lastName: z.string().min(2, t('validation.lastNameTooShort', { min: 2 })),
    email: z.string().email(t('validation.emailInvalid')),
    password: z.string().refine(
      (password) => validatePassword(password).isValid,
      t('validation.passwordTooWeak')
    ),
    confirmPassword: z.string(),
    phone: z.string().optional(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('validation.passwordsMustMatch'),
    path: ["confirmPassword"],
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    watch,
    trigger,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
  });

  const password = watch('password');

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setIsLoading(true);
      const { confirmPassword, ...registerData } = data;
      const result = await registerUser(registerData as RegisterData);
      redirectAfterLogin(result.user.role);
    } catch (error: any) {
      if (error.code === 'EMAIL_EXISTS') {
        setError('email', { message: t('errors.emailExists') });
        setCurrentStep(2); // Go back to user details step
      } else if (error.code === 'ORGANIZATION_EXISTS') {
        setError('organizationName', { message: t('errors.organizationExists') });
        setCurrentStep(1); // Go back to organization step
      } else {
        setError('email', { message: error.message || t('errors.serverError') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = async () => {
    const fieldsToValidate = currentStep === 1
      ? ['organizationName', 'organizationEmail', 'organizationCountry']
      : ['firstName', 'lastName', 'email', 'password', 'confirmPassword'];

    const isValid = await trigger(fieldsToValidate as any);
    if (isValid) {
      setCurrentStep(2);
    }
  };

  const prevStep = () => {
    setCurrentStep(1);
  };

  return (
    <div className="relative">
      <LanguageSwitcher />

      <Card className="auth-card max-w-lg">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">C</span>
            </div>
          </div>
          <CardTitle className="text-2xl text-center">{t('register.title')}</CardTitle>
          <CardDescription className="text-center">
            {currentStep === 1
              ? t('register.organizationStep')
              : t('register.adminStep')
            }
          </CardDescription>

          {/* Progress indicator */}
          <div className="flex items-center justify-center space-x-2 mt-4">
            <div className={`w-3 h-3 rounded-full ${currentStep >= 1 ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`w-8 h-1 ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`w-3 h-3 rounded-full ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
            {currentStep === 1 && (
              <>
                <div className="form-group">
                  <Label htmlFor="organizationName" className="form-label">
                    {t('register.organizationName')} {t('register.required')}
                  </Label>
                  <Input
                    id="organizationName"
                    placeholder={t('register.organizationNamePlaceholder')}
                    className="form-input"
                    {...register('organizationName')}
                    disabled={isLoading}
                  />
                  {errors.organizationName && (
                    <p className="form-error">{errors.organizationName.message}</p>
                  )}
                </div>

                <div className="form-group">
                  <Label htmlFor="organizationEmail" className="form-label">
                    {t('register.organizationEmail')} {t('register.required')}
                  </Label>
                  <Input
                    id="organizationEmail"
                    type="email"
                    placeholder={t('register.organizationEmailPlaceholder')}
                    className="form-input"
                    {...register('organizationEmail')}
                    disabled={isLoading}
                  />
                  {errors.organizationEmail && (
                    <p className="form-error">{errors.organizationEmail.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <Label htmlFor="organizationPhone" className="form-label">
                      {t('register.phone')}
                    </Label>
                    <Input
                      id="organizationPhone"
                      type="tel"
                      placeholder={t('register.phonePlaceholder')}
                      className="form-input"
                      {...register('organizationPhone')}
                      disabled={isLoading}
                    />
                  </div>

                  <div className="form-group">
                    <Label htmlFor="organizationCountry" className="form-label">
                      {t('register.country')} {t('register.required')}
                    </Label>
                    <Input
                      id="organizationCountry"
                      placeholder={t('register.countryPlaceholder')}
                      className="form-input"
                      {...register('organizationCountry')}
                      disabled={isLoading}
                    />
                    {errors.organizationCountry && (
                      <p className="form-error">{errors.organizationCountry.message}</p>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <Label htmlFor="organizationAddress" className="form-label">
                    {t('register.address')}
                  </Label>
                  <Input
                    id="organizationAddress"
                    placeholder={t('register.addressPlaceholder')}
                    className="form-input"
                    {...register('organizationAddress')}
                    disabled={isLoading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <Label htmlFor="organizationCity" className="form-label">
                      {t('register.city')}
                    </Label>
                    <Input
                      id="organizationCity"
                      placeholder={t('register.cityPlaceholder')}
                      className="form-input"
                      {...register('organizationCity')}
                      disabled={isLoading}
                    />
                  </div>

                  <div className="form-group">
                    <Label htmlFor="organizationWebsite" className="form-label">
                      {t('register.website')}
                    </Label>
                    <Input
                      id="organizationWebsite"
                      type="url"
                      placeholder={t('register.websitePlaceholder')}
                      className="form-input"
                      {...register('organizationWebsite')}
                      disabled={isLoading}
                    />
                    {errors.organizationWebsite && (
                      <p className="form-error">{errors.organizationWebsite.message}</p>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={nextStep}
                  className="btn-primary"
                  disabled={isLoading}
                >
                  {t('register.nextStep')}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <Label htmlFor="firstName" className="form-label">
                      {t('register.firstName')} {t('register.required')}
                    </Label>
                    <Input
                      id="firstName"
                      placeholder={t('register.firstNamePlaceholder')}
                      className="form-input"
                      {...register('firstName')}
                      disabled={isLoading}
                    />
                    {errors.firstName && (
                      <p className="form-error">{errors.firstName.message}</p>
                    )}
                  </div>

                  <div className="form-group">
                    <Label htmlFor="lastName" className="form-label">
                      {t('register.lastName')} {t('register.required')}
                    </Label>
                    <Input
                      id="lastName"
                      placeholder={t('register.lastNamePlaceholder')}
                      className="form-input"
                      {...register('lastName')}
                      disabled={isLoading}
                    />
                    {errors.lastName && (
                      <p className="form-error">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <Label htmlFor="email" className="form-label">
                    {t('login.email')} {t('register.required')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('register.emailPlaceholder')}
                    className="form-input"
                    {...register('email')}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="form-error">{errors.email.message}</p>
                  )}
                </div>

                <div className="form-group">
                  <Label htmlFor="phone" className="form-label">
                    {t('register.phone')}
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={t('register.phoneNumberPlaceholder')}
                    className="form-input"
                    {...register('phone')}
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <Label htmlFor="password" className="form-label">
                    {t('login.password')} {t('register.required')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('register.passwordPlaceholder')}
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
                  <PasswordStrength password={password || ''} />
                </div>

                <div className="form-group">
                  <Label htmlFor="confirmPassword" className="form-label">
                    {t('register.confirmPassword')} {t('register.required')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={t('register.confirmPasswordPlaceholder')}
                      className="form-input pr-10"
                      {...register('confirmPassword')}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="form-error">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <div className="flex space-x-4">
                  <Button
                    type="button"
                    onClick={prevStep}
                    variant="outline"
                    className="flex-1"
                    disabled={isLoading}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    {t('register.back')}
                  </Button>

                  <Button
                    type="submit"
                    className="flex-1 btn-primary"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="loading-spinner" />
                        {t('register.submitting')}
                      </>
                    ) : (
                      t('register.submit')
                    )}
                  </Button>
                </div>
              </>
            )}

            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('register.haveAccount')}{' '}
                <Link
                  href="/auth/login"
                  className="text-blue-600 hover:text-blue-500 dark:text-blue-400 font-medium"
                >
                  {t('register.signIn')}
                </Link>
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageContent />
    </Suspense>
  );
}