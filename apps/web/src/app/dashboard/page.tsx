'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, User, Building } from 'lucide-react';

export default function DashboardPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/auth/login');
        }
    }, [user, loading, router]);

    const handleLogout = async () => {
        await logout();
        router.push('/auth/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                    <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return null; // Will redirect to login
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <header className="bg-white dark:bg-gray-800 shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                                <span className="text-white font-bold">C</span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                Confirmelo Dashboard
                            </h1>
                        </div>

                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Welcome, {user.firstName}!
                            </span>
                            <Button
                                onClick={handleLogout}
                                variant="outline"
                                size="sm"
                                className="flex items-center"
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* User Info Card */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">User Information</CardTitle>
                                <User className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Role</p>
                                        <p className="text-sm font-medium">{user.role.replace('_', ' ')}</p>
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
                            </CardContent>
                        </Card>

                        {/* Organization Info Card */}
                        {user.organization && (
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

                        {/* Quick Actions Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                                <CardDescription>
                                    Common tasks and features
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Button variant="outline" className="w-full justify-start" disabled>
                                    View Orders
                                </Button>
                                <Button variant="outline" className="w-full justify-start" disabled>
                                    Manage Team
                                </Button>
                                <Button variant="outline" className="w-full justify-start" disabled>
                                    Analytics
                                </Button>
                                <Button variant="outline" className="w-full justify-start" disabled>
                                    Settings
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Welcome Message */}
                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle>Welcome to Confirmelo!</CardTitle>
                            <CardDescription>
                                Your authentication system is working correctly. This is a basic dashboard to verify the login flow.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    You have successfully logged in to the Confirmelo platform. The authentication system includes:
                                </p>
                                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                                    <li>• Secure JWT-based authentication</li>
                                    <li>• Role-based access control</li>
                                    <li>• Password strength validation</li>
                                    <li>• Multi-step registration process</li>
                                    <li>• Password reset functionality</li>
                                    <li>• Session management</li>
                                </ul>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Additional features like order management, team collaboration, and analytics will be added in future iterations.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}