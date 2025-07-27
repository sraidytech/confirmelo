'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';

import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/auth/language-switcher';
import { PasswordStrength } from '@/components/auth/password-strength';
import { RegisterData } from '@/types/auth';
import { validatePassword } from '@/lib/utils';

const registerSchema = z.object({
  // Organization details
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
  organizationEmail: z.string().email('Please enter a valid email address'),
  organizationPhone: z.string().optional(),
  organizationAddress: z.string().optional(),
  organizationCity: z.string().optional(),
  organizationCountry: z.string().min(2, 'Country is required'),
  organizationWebsite: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  organizationTaxId: z.string().optional(),
  
  // Admin user details
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().refine(
    (password) => validatePassword(password).isValid,
    'Password does not meet security requirements'
  ),
  confirmPassword: z.string(),
  phone: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const router = useRouter();

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
      await registerUser(registerData as RegisterData);
      router.push('/dashboard');
    } catch (error: any) {
      if (error.code === 'EMAIL_EXISTS') {
        setError('email', { message: 'An account with this email already exists' });
        setCurrentStep(2); // Go back to user details step
      } else if (error.code === 'ORGANIZATION_EXISTS') {
        setError('organizationName', { message: 'An organization with this name already exists' });
        setCurrentStep(1); // Go back to organization step
      } else {
        setError('email', { message: error.message || 'Registration failed. Please try again.' });
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
          <CardTitle className="text-2xl text-center">Create your account</CardTitle>
          <CardDescription className="text-center">
            {currentStep === 1 
              ? 'Set up your organization' 
              : 'Create your admin account'
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
                    Organization Name *
                  </Label>
                  <Input
                    id="organizationName"
                    placeholder="Enter organization name"
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
                    Organization Email *
                  </Label>
                  <Input
                    id="organizationEmail"
                    type="email"
                    placeholder="Enter organization email"
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
                      Phone
                    </Label>
                    <Input
                      id="organizationPhone"
                      type="tel"
                      placeholder="Phone number"
                      className="form-input"
                      {...register('organizationPhone')}
                      disabled={isLoading}
                    />
                  </div>

                  <div className="form-group">
                    <Label htmlFor="organizationCountry" className="form-label">
                      Country *
                    </Label>
                    <Input
                      id="organizationCountry"
                      placeholder="Country"
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
                    Address
                  </Label>
                  <Input
                    id="organizationAddress"
                    placeholder="Enter address"
                    className="form-input"
                    {...register('organizationAddress')}
                    disabled={isLoading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <Label htmlFor="organizationCity" className="form-label">
                      City
                    </Label>
                    <Input
                      id="organizationCity"
                      placeholder="City"
                      className="form-input"
                      {...register('organizationCity')}
                      disabled={isLoading}
                    />
                  </div>

                  <div className="form-group">
                    <Label htmlFor="organizationWebsite" className="form-label">
                      Website
                    </Label>
                    <Input
                      id="organizationWebsite"
                      type="url"
                      placeholder="https://example.com"
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
                  Next Step
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <Label htmlFor="firstName" className="form-label">
                      First Name *
                    </Label>
                    <Input
                      id="firstName"
                      placeholder="First name"
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
                      Last Name *
                    </Label>
                    <Input
                      id="lastName"
                      placeholder="Last name"
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
                    Email Address *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
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
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Enter your phone number"
                    className="form-input"
                    {...register('phone')}
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <Label htmlFor="password" className="form-label">
                    Password *
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password"
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
                    Confirm Password *
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
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
                    Back
                  </Button>
                  
                  <Button
                    type="submit"
                    className="flex-1 btn-primary"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="loading-spinner" />
                        Creating...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </div>
              </>
            )}

            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <Link
                  href="/auth/login"
                  className="text-blue-600 hover:text-blue-500 dark:text-blue-400 font-medium"
                >
                  Sign in
                </Link>
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}