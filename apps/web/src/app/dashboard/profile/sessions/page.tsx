'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Globe
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { 
  SessionInfo, 
  SessionStats, 
  SessionActivity, 
  DeviceInfo, 
  LocationInfo 
} from '@/types/auth';

export default function SessionsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [activities, setActivities] = useState<SessionActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState<string | null>(null);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    loadSessionData();
  }, [includeExpired]);

  const loadSessionData = async () => {
    try {
      setLoading(true);
      setApiError(null);
      
      // Load sessions
      try {
        const sessionsResponse = await api.getSessions(includeExpired);
        console.log('Sessions response:', sessionsResponse);
        setSessions(sessionsResponse?.sessions || []);
      } catch (sessionError: any) {
        console.error('Error loading sessions:', sessionError);
        setSessions([]);
        if (sessionError?.message?.includes('Cannot read properties of undefined')) {
          setApiError('API client not properly initialized. Please refresh the page.');
        }
      }

      // Load stats
      try {
        const statsResponse = await api.getSessionStats();
        console.log('Stats response:', statsResponse);
        setStats(statsResponse);
      } catch (statsError: any) {
        console.error('Error loading stats:', statsError);
        setStats(null);
      }

      // Load activities
      try {
        const activitiesResponse = await api.getSessionActivity();
        console.log('Activities response:', activitiesResponse);
        setActivities(activitiesResponse || []);
      } catch (activitiesError: any) {
        console.error('Error loading activities:', activitiesError);
        setActivities([]);
      }

    } catch (error: any) {
      console.error('Error loading session data:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      setApiError(errorMessage);
      toast({
        title: 'Error',
        description: `Failed to load session data: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      setTerminating(sessionId);
      await api.terminateSession(sessionId, 'Terminated by user');
      
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

  const getDeviceTypeCount = (type: keyof SessionStats['deviceBreakdown']) => {
    return stats?.deviceBreakdown[type] || 0;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Session Management</h1>
          <p className="text-muted-foreground">
            Manage your active sessions and monitor security
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => loadSessionData()}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setIncludeExpired(!includeExpired)}
          >
            {includeExpired ? 'Hide Expired' : 'Show Expired'}
          </Button>
        </div>
      </div>

      {apiError && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>API Error:</strong> {apiError}
            <br />
            <span className="text-sm">
              This might be because the API server is not running or there's a connectivity issue.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Overview */}
      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activeSessions}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalSessions} total sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspicious Sessions</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.suspiciousSessions}</div>
              <p className="text-xs text-muted-foreground">
                Require attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Device Types</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Desktop</span>
                  <span>{getDeviceTypeCount('desktop')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Mobile</span>
                  <span>{getDeviceTypeCount('mobile')}</span>
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
      ) : !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">--</div>
              <p className="text-xs text-muted-foreground">
                Data unavailable
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspicious Sessions</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">--</div>
              <p className="text-xs text-muted-foreground">
                Data unavailable
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Device Types</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Desktop</span>
                  <span>--</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Mobile</span>
                  <span>--</span>
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
              <div className="text-2xl font-bold text-muted-foreground">--</div>
              <p className="text-xs text-muted-foreground">
                Data unavailable
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          {sessions.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <p className="text-muted-foreground">No sessions found</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {includeExpired ? 'No sessions available' : 'No active sessions found'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <Card key={session.id} className={session.isCurrent ? 'border-primary' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getDeviceIcon(session.deviceInfo)}
                        <div>
                          <CardTitle className="text-lg">
                            {session.deviceInfo.browser} on {session.deviceInfo.os}
                            {session.isCurrent && (
                              <Badge variant="default" className="ml-2">Current</Badge>
                            )}
                            {session.isSuspicious && (
                              <Badge variant="destructive" className="ml-2">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Suspicious
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription>
                            {session.deviceInfo.device} • {session.ipAddress}
                          </CardDescription>
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
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Suspicious Activity Detected:</strong>
                          <ul className="list-disc list-inside mt-1">
                            {session.suspiciousReasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Session ID: {session.sessionToken}</span>
                      <span>
                        Expires {formatDistanceToNow(new Date(session.expiresAt), { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {activities.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">No recent activity</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Recent Session Activity</CardTitle>
                <CardDescription>
                  Latest session-related activities across all your devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start space-x-3 pb-3 border-b last:border-b-0">
                      <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{activity.description}</p>
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-1">
                          <span>{formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}</span>
                          {activity.ipAddress && (
                            <span>IP: {activity.ipAddress}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Session Locations</CardTitle>
              <CardDescription>
                Geographic distribution of your sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats ? (
                <div className="space-y-3">
                  {Object.entries(stats.locationBreakdown).length > 0 ? (
                    Object.entries(stats.locationBreakdown).map(([location, count]) => (
                      <div key={location} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span>{location}</span>
                        </div>
                        <Badge variant="secondary">{count} sessions</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No location data available
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Location data unavailable
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}