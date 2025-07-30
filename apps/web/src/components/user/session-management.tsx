'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Monitor, 
  Smartphone, 
  Tablet, 
  MapPin, 
  Clock, 
  Shield, 
  AlertTriangle,
  LogOut,
  Activity,
  Globe,
  RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface DeviceInfo {
  browser?: string;
  os?: string;
  device?: string;
  isMobile: boolean;
}

interface LocationInfo {
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
}

interface SessionInfo {
  id: string;
  sessionToken: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo: DeviceInfo;
  locationInfo: LocationInfo;
  createdAt: string;
  expiresAt: string;
  lastActivity?: string;
  isCurrent: boolean;
  isSuspicious: boolean;
  suspiciousReasons?: string[];
}

interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  suspiciousSessions: number;
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
  locationBreakdown: Record<string, number>;
  recentActivityCount: number;
}

export function SessionManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState<string | null>(null);

  useEffect(() => {
    loadSessionData();
  }, []);

  const loadSessionData = async () => {
    try {
      setLoading(true);
      const [sessionsResponse, statsResponse] = await Promise.all([
        api.get('/auth/sessions'),
        api.get('/auth/sessions/stats'),
      ]);

      setSessions(sessionsResponse.data.sessions);
      setStats(statsResponse.data);
    } catch (error) {
      console.error('Error loading session data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load session data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      setTerminating(sessionId);
      await api.delete(`/auth/sessions/${sessionId}`, {
        data: { reason: 'Terminated by user' }
      });
      
      toast({
        title: 'Success',
        description: 'Session terminated successfully',
      });
      
      await loadSessionData();
    } catch (error) {
      console.error('Error terminating session:', error);
      toast({
        title: 'Error',
        description: 'Failed to terminate session',
        variant: 'destructive',
      });
    } finally {
      setTerminating(null);
    }
  };

  const getDeviceIcon = (deviceInfo: DeviceInfo) => {
    if (deviceInfo.isMobile) {
      return <Smartphone className="h-4 w-4" />;
    } else if (deviceInfo.device?.toLowerCase().includes('tablet')) {
      return <Tablet className="h-4 w-4" />;
    } else {
      return <Monitor className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Session Management</h3>
          <p className="text-sm text-muted-foreground">
            Monitor and manage your active sessions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSessionData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeSessions}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalSessions} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspicious</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.suspiciousSessions}</div>
              <p className="text-xs text-muted-foreground">
                Need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Devices</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Desktop</span>
                  <span>{stats.deviceBreakdown.desktop}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Mobile</span>
                  <span>{stats.deviceBreakdown.mobile}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.recentActivityCount}</div>
              <p className="text-xs text-muted-foreground">
                Last 24 hours
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            Your currently active sessions across all devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No active sessions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.slice(0, 5).map((session) => (
                <div key={session.id} className={`p-4 border rounded-lg ${session.isCurrent ? 'border-primary bg-primary/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getDeviceIcon(session.deviceInfo)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">
                            {session.deviceInfo.browser} on {session.deviceInfo.os}
                          </span>
                          {session.isCurrent && (
                            <Badge variant="default" className="text-xs">Current</Badge>
                          )}
                          {session.isSuspicious && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Suspicious
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {session.deviceInfo.device} • {session.ipAddress}
                        </div>
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => terminateSession(session.id)}
                        disabled={terminating === session.id}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        {terminating === session.id ? 'Terminating...' : 'Terminate'}
                      </Button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {session.locationInfo.city}, {session.locationInfo.country}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        Created {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {session.lastActivity 
                          ? `Active ${formatDistanceToNow(new Date(session.lastActivity), { addSuffix: true })}`
                          : 'No recent activity'
                        }
                      </span>
                    </div>
                  </div>

                  {session.isSuspicious && session.suspiciousReasons && (
                    <Alert className="mt-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Suspicious Activity:</strong>
                        <ul className="list-disc list-inside mt-1">
                          {session.suspiciousReasons.map((reason, index) => (
                            <li key={index}>{reason}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
              
              {sessions.length > 5 && (
                <div className="text-center pt-4">
                  <Button variant="outline" asChild>
                    <a href="/dashboard/profile/sessions">
                      View All Sessions ({sessions.length})
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Overview */}
      {stats && Object.keys(stats.locationBreakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Session Locations</CardTitle>
            <CardDescription>
              Geographic distribution of your sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.locationBreakdown).slice(0, 3).map(([location, count]) => (
                <div key={location} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span>{location}</span>
                  </div>
                  <Badge variant="secondary">{count} sessions</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}