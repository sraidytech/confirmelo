'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Play, 
  Activity,
  Clock,
  Database,
  Zap
} from 'lucide-react';

interface SyncDiagnosticProps {
  connectionId: string;
  spreadsheetId?: string;
  className?: string;
}

interface DiagnosticStep {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  data?: any;
  error?: string;
  duration?: number;
}

interface HealthCheck {
  component: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: any;
}

export function SyncDiagnostic({ connectionId, spreadsheetId, className }: SyncDiagnosticProps) {
  const [testing, setTesting] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [testResults, setTestResults] = useState<{
    success: boolean;
    steps: DiagnosticStep[];
    summary: {
      totalSteps: number;
      successfulSteps: number;
      failedSteps: number;
      totalDuration: number;
    };
  } | null>(null);
  const [healthData, setHealthData] = useState<{
    overall: 'healthy' | 'warning' | 'critical';
    checks: HealthCheck[];
    statistics: any;
  } | null>(null);
  const { toast } = useToast();

  const runDiagnosticTest = async (bypassQueue: boolean = false) => {
    if (!spreadsheetId) {
      toast({
        title: 'Missing Spreadsheet ID',
        description: 'Please select a spreadsheet to test.',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    try {
      const result = await api.testSyncPipeline(connectionId, spreadsheetId, bypassQueue);
      setTestResults(result);
      
      toast({
        title: result.success ? 'Diagnostic Test Completed' : 'Diagnostic Test Failed',
        description: `${result.summary.successfulSteps}/${result.summary.totalSteps} steps successful`,
        variant: result.success ? 'default' : 'destructive',
      });
    } catch (error: any) {
      toast({
        title: 'Diagnostic Test Error',
        description: error.message || 'Failed to run diagnostic test',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const checkSyncHealth = async () => {
    setHealthLoading(true);
    try {
      const health = await api.getSyncHealth(connectionId);
      setHealthData(health);
      
      toast({
        title: 'Health Check Complete',
        description: `System status: ${health.overall}`,
        variant: health.overall === 'healthy' ? 'default' : 'destructive',
      });
    } catch (error: any) {
      toast({
        title: 'Health Check Error',
        description: error.message || 'Failed to check sync health',
        variant: 'destructive',
      });
    } finally {
      setHealthLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'skipped':
        return <Clock className="h-4 w-4 text-gray-500" />;
      default:
        return <Activity className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      success: 'default',
      healthy: 'default',
      failed: 'destructive',
      critical: 'destructive',
      warning: 'secondary',
      skipped: 'outline',
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status}
      </Badge>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Diagnostic Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Sync Diagnostics
          </CardTitle>
          <CardDescription>
            Test the complete sync pipeline and check system health
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={() => runDiagnosticTest(true)}
              disabled={testing || !spreadsheetId}
              className="flex items-center gap-2"
            >
              {testing ? <LoadingSpinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              Test Direct Sync
            </Button>
            <Button
              onClick={() => runDiagnosticTest(false)}
              disabled={testing || !spreadsheetId}
              variant="outline"
              className="flex items-center gap-2"
            >
              {testing ? <LoadingSpinner className="h-4 w-4" /> : <Database className="h-4 w-4" />}
              Test Queue Sync
            </Button>
            <Button
              onClick={checkSyncHealth}
              disabled={healthLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              {healthLoading ? <LoadingSpinner className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              Check Health
            </Button>
          </div>
          
          {!spreadsheetId && (
            <p className="text-sm text-muted-foreground">
              Select a spreadsheet to enable diagnostic testing
            </p>
          )}
        </CardContent>
      </Card>

      {/* Health Check Results */}
      {healthData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(healthData.overall)}
              System Health
            </CardTitle>
            <CardDescription>
              Overall status: {getStatusBadge(healthData.overall)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{healthData.statistics.totalSheets}</div>
                <div className="text-sm text-muted-foreground">Total Sheets</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{healthData.statistics.activeSheets}</div>
                <div className="text-sm text-muted-foreground">Active Sheets</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{healthData.statistics.successfulSyncs}</div>
                <div className="text-sm text-muted-foreground">Successful Syncs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{healthData.statistics.failedSyncs}</div>
                <div className="text-sm text-muted-foreground">Failed Syncs</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Component Status</h4>
              {healthData.checks.map((check, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(check.status)}
                    <span className="font-medium capitalize">{check.component.replace('_', ' ')}</span>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(check.status)}
                    <div className="text-sm text-muted-foreground mt-1">{check.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(testResults.success ? 'success' : 'failed')}
              Diagnostic Test Results
            </CardTitle>
            <CardDescription>
              {testResults.summary.successfulSteps}/{testResults.summary.totalSteps} steps completed successfully 
              in {testResults.summary.totalDuration}ms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testResults.steps.map((step, index) => (
                <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(step.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium capitalize">
                        {step.step.replace(/_/g, ' ')}
                      </h4>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(step.status)}
                        {step.duration && (
                          <span className="text-xs text-muted-foreground">
                            {step.duration}ms
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{step.message}</p>
                    {step.error && (
                      <p className="text-sm text-red-600 mt-1 font-mono">{step.error}</p>
                    )}
                    {step.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          View Details
                        </summary>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(step.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}