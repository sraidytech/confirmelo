'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function TestPage() {
  const [apiStatus, setApiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [apiResponse, setApiResponse] = useState<string>('');

  const testApiConnection = async () => {
    setApiStatus('loading');
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const data = await response.text();
        setApiResponse(data);
        setApiStatus('success');
      } else {
        setApiResponse(`HTTP ${response.status}: ${response.statusText}`);
        setApiStatus('error');
      }
    } catch (error) {
      setApiResponse(error instanceof Error ? error.message : 'Unknown error');
      setApiStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Confirmelo System Test
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Test the frontend and backend connectivity
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Frontend Test */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                Frontend Status
              </CardTitle>
              <CardDescription>
                Next.js application is running
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Framework:</span>
                  <span className="text-sm font-medium">Next.js 14</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Environment:</span>
                  <span className="text-sm font-medium">{process.env.NODE_ENV}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">API URL:</span>
                  <span className="text-sm font-medium">{process.env.NEXT_PUBLIC_API_URL}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Backend Test */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                {apiStatus === 'success' && <CheckCircle className="h-5 w-5 text-green-500 mr-2" />}
                {apiStatus === 'error' && <XCircle className="h-5 w-5 text-red-500 mr-2" />}
                {apiStatus === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />}
                {apiStatus === 'idle' && <div className="h-5 w-5 bg-gray-300 rounded-full mr-2" />}
                Backend Status
              </CardTitle>
              <CardDescription>
                Test connection to NestJS API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button 
                  onClick={testApiConnection}
                  disabled={apiStatus === 'loading'}
                  className="w-full"
                >
                  {apiStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test API Connection'
                  )}
                </Button>
                
                {apiResponse && (
                  <div className={`p-3 rounded-md text-sm ${
                    apiStatus === 'success' 
                      ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    <strong>Response:</strong> {apiResponse}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Authentication Test */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Authentication System Test</CardTitle>
              <CardDescription>
                Test the authentication flow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Button variant="outline" asChild>
                  <a href="/auth/login">Login Page</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/auth/register">Register Page</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/auth/forgot-password">Forgot Password</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/dashboard">Dashboard</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Information */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>System Information</CardTitle>
              <CardDescription>
                Current system configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium mb-2">Frontend</h4>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>• Next.js 14 with App Router</li>
                    <li>• TypeScript</li>
                    <li>• Tailwind CSS</li>
                    <li>• Radix UI Components</li>
                    <li>• React Hook Form</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Backend</h4>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>• NestJS Framework</li>
                    <li>• PostgreSQL Database</li>
                    <li>• Redis Cache</li>
                    <li>• JWT Authentication</li>
                    <li>• Prisma ORM</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            If all tests pass, your Confirmelo authentication system is ready to use!
          </p>
        </div>
      </div>
    </div>
  );
}