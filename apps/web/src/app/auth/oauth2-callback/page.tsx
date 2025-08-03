'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { CompletePlatformConnectionDto } from '@/types/auth';
import { CheckCircle, XCircle, ArrowLeft } from 'lucide-react';

function OAuth2CallbackContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [connectionName, setConnectionName] = useState<string>('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const handleOAuth2Callback = async () => {
      try {
        // Get parameters from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (!code && !error) {
          throw new Error('Missing authorization code or error parameter');
        }

        if (!state) {
          throw new Error('Missing state parameter');
        }

        // Prepare the completion request
        const completionData: CompletePlatformConnectionDto = {
          code: code || '',
          state,
          error: error || undefined,
          error_description: errorDescription || undefined,
        };

        // Complete the OAuth2 flow
        const connection = await api.completePlatformConnection(completionData);
        
        setConnectionName(connection.platformName);
        setStatus('success');
        
        toast({
          title: 'Connection Successful',
          description: `Successfully connected to ${connection.platformName}`,
        });

        // Redirect to platform connections page after a short delay
        setTimeout(() => {
          router.push('/dashboard/platform-connections');
        }, 3000);

      } catch (error: any) {
        console.error('OAuth2 callback error:', error);
        setErrorMessage(error.message || 'Failed to complete the connection');
        setStatus('error');
        
        toast({
          title: 'Connection Failed',
          description: error.message || 'Failed to complete the platform connection',
          variant: 'destructive',
        });
      }
    };

    handleOAuth2Callback();
  }, [searchParams, router, toast]);

  const handleReturnToDashboard = () => {
    router.push('/dashboard/platform-connections');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === 'loading' && (
              <LoadingSpinner className="h-12 w-12 text-blue-600" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-12 w-12 text-green-600" />
            )}
            {status === 'error' && (
              <XCircle className="h-12 w-12 text-red-600" />
            )}
          </div>
          
          <CardTitle>
            {status === 'loading' && 'Completing Connection...'}
            {status === 'success' && 'Connection Successful!'}
            {status === 'error' && 'Connection Failed'}
          </CardTitle>
          
          <CardDescription>
            {status === 'loading' && 'Please wait while we complete your platform connection.'}
            {status === 'success' && `Successfully connected to ${connectionName}. You will be redirected shortly.`}
            {status === 'error' && 'There was an issue completing your platform connection.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="text-center text-sm text-gray-600">
              <p>Processing your authorization...</p>
              <p className="mt-2">This may take a few moments.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">
                  Your platform connection has been established successfully. 
                  You can now start importing orders and managing your data.
                </p>
              </div>
              
              <p className="text-sm text-gray-600">
                Redirecting to platform connections in 3 seconds...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm font-medium mb-2">Error Details:</p>
                <p className="text-red-700 text-sm">{errorMessage}</p>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  <strong>What you can do:</strong>
                </p>
                <ul className="text-yellow-700 text-sm mt-2 space-y-1">
                  <li>• Try connecting again from the platform connections page</li>
                  <li>• Make sure you have the necessary permissions on the platform</li>
                  <li>• Contact support if the issue persists</li>
                </ul>
              </div>
            </div>
          )}

          {(status === 'success' || status === 'error') && (
            <Button 
              onClick={handleReturnToDashboard}
              className="w-full"
              variant={status === 'error' ? 'outline' : 'default'}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Return to Platform Connections
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuth2CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    }>
      <OAuth2CallbackContent />
    </Suspense>
  );
}