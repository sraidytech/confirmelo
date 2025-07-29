'use client';

import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConditionalRender } from '@/components/auth/protected-route';
import { UserRole } from '@/types/auth';
import { getRoleDisplayName, getRolePermissions } from '@/lib/auth-utils';
import { User, Building, Shield } from 'lucide-react';

export default function DashboardPage() {
    const { user } = useAuth();

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* User Info Card */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">User Information</CardTitle>
                                    <User className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    {user && (
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Role</p>
                                                <p className="text-sm font-medium">{getRoleDisplayName(user.role)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Status</p>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.status === 'ACTIVE'
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                    }`}>
                                                    {user.status}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Organization Info Card */}
                            {user?.organization && (
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Organization</CardTitle>
                                        <Building className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-sm font-medium">{user.organization.name}</p>
                                                <p className="text-xs text-muted-foreground">{user.organization.email}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Code</p>
                                                <p className="text-sm font-medium">{user.organization.code}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Country</p>
                                                <p className="text-sm font-medium">{user.organization.country}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Role Permissions Card */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Role Permissions</CardTitle>
                                    <Shield className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    {user && (
                                        <div className="space-y-1">
                                            {getRolePermissions(user.role).slice(0, 4).map((permission, index) => (
                                                <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                                                    • {permission}
                                                </div>
                                            ))}
                                            {getRolePermissions(user.role).length > 4 && (
                                                <div className="text-xs text-gray-500">
                                                    +{getRolePermissions(user.role).length - 4} more...
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Quick Actions Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                                    <CardDescription>
                                        Role-based actions
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <ConditionalRender
                                        requiredRoles={[
                                            UserRole.SUPER_ADMIN,
                                            UserRole.ADMIN,
                                            UserRole.TEAM_LEADER,
                                            UserRole.CALL_CENTER_AGENT,
                                            UserRole.FOLLOWUP_AGENT,
                                        ]}
                                    >
                                        <Button variant="outline" className="w-full justify-start" disabled>
                                            View Orders
                                        </Button>
                                    </ConditionalRender>

                                    <ConditionalRender
                                        requiredRoles={[
                                            UserRole.SUPER_ADMIN,
                                            UserRole.ADMIN,
                                            UserRole.TEAM_LEADER,
                                        ]}
                                    >
                                        <Button variant="outline" className="w-full justify-start" disabled>
                                            Manage Team
                                        </Button>
                                    </ConditionalRender>

                                    <ConditionalRender
                                        requiredRoles={[
                                            UserRole.SUPER_ADMIN,
                                            UserRole.ADMIN,
                                            UserRole.TEAM_LEADER,
                                            UserRole.CLIENT_ADMIN,
                                            UserRole.CLIENT_USER,
                                        ]}
                                    >
                                        <Button variant="outline" className="w-full justify-start" disabled>
                                            Analytics
                                        </Button>
                                    </ConditionalRender>

                                    <ConditionalRender
                                        requiredRoles={[UserRole.SUPER_ADMIN, UserRole.ADMIN]}
                                    >
                                        <Button variant="outline" className="w-full justify-start" disabled>
                                            System Settings
                                        </Button>
                                    </ConditionalRender>
                                </CardContent>
                            </Card>
            </div>

            {/* Welcome Message */}
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle>Welcome to Confirmelo!</CardTitle>
                                <CardDescription>
                                    Your authentication system with middleware protection is working correctly.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        You have successfully accessed the protected dashboard. The authentication system includes:
                                    </p>
                                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                                        <li>• Next.js middleware for route protection</li>
                                        <li>• JWT token validation and refresh</li>
                                        <li>• Role-based access control</li>
                                        <li>• Client-side route guards</li>
                                        <li>• Conditional component rendering</li>
                                        <li>• Automatic redirects based on authentication state</li>
                                    </ul>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        The navigation menu shows only the routes you have access to based on your role: <strong>{user && getRoleDisplayName(user.role)}</strong>
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
        </div>
    );
}