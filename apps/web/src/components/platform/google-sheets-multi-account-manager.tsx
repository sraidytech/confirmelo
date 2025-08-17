'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlatformConnection, ConnectionStatus, PlatformType } from '@/types/auth';
import { AccountSelector } from './account-selector';
import { ErrorRecoveryDialog, ErrorType, ErrorDetails } from './error-recovery-dialog';
import { ConnectionHealthIndicator, HealthStatus } from './connection-health-indicator';
import {
    Plus,
    Settings,
    RefreshCw,
    FileSpreadsheet,
    Users,
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    Trash2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface GoogleAccount {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    status: ConnectionStatus;
    connectionId: string;
    connectedSpreadsheets: number;
    lastSyncAt?: string;
    tokenExpiresAt?: string;
    platformData?: any;
}

interface ConnectedSpreadsheet {
    id: string;
    name: string;
    accountEmail: string;
    connectedAt: string;
    lastSyncAt?: string;
    hasError?: boolean;
    lastError?: string;
    webViewLink: string;
}

interface GoogleSheetsMultiAccountManagerProps {
    className?: string;
}

export function GoogleSheetsMultiAccountManager({ className }: GoogleSheetsMultiAccountManagerProps) {
    const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>();
    const [connectedSpreadsheets, setConnectedSpreadsheets] = useState<ConnectedSpreadsheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showErrorDialog, setShowErrorDialog] = useState(false);
    const [currentError, setCurrentError] = useState<ErrorDetails | null>(null);
    const [activeTab, setActiveTab] = useState('accounts');
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedAccountId) {
            loadSpreadsheets(selectedAccountId);
        }
    }, [selectedAccountId]);

    const loadData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadAccounts(),
                loadAllSpreadsheets()
            ]);
        } catch (error: any) {
            handleError(error, ErrorType.NETWORK_ERROR);
        } finally {
            setLoading(false);
        }
    };

    const loadAccounts = async () => {
        try {
            const response = await api.get('/auth/oauth2/google-sheets/connections/accounts');
            const googleAccounts: GoogleAccount[] = response.data.accounts.map((conn: PlatformConnection) => ({
                id: conn.id,
                email: conn.platformData?.email || conn.platformName,
                name: conn.platformData?.name || `${conn.platformData?.given_name || ''} ${conn.platformData?.family_name || ''}`.trim(),
                picture: conn.platformData?.picture,
                status: conn.status,
                connectionId: conn.id,
                connectedSpreadsheets: conn.platformData?.connectedSpreadsheets || 0,
                lastSyncAt: conn.lastSyncAt,
                tokenExpiresAt: conn.tokenExpiresAt,
                platformData: conn.platformData,
            }));

            setAccounts(googleAccounts);

            // Auto-select first active account if none selected
            if (!selectedAccountId && googleAccounts.length > 0) {
                const activeAccount = googleAccounts.find(acc => acc.status === ConnectionStatus.ACTIVE) || googleAccounts[0];
                setSelectedAccountId(activeAccount.id);
            }
        } catch (error: any) {
            throw new Error(`Failed to load accounts: ${error.message}`);
        }
    };

    const loadAllSpreadsheets = async () => {
        try {
            const response = await api.get('/auth/oauth2/google-sheets/connections/all-spreadsheets');
            setConnectedSpreadsheets(response.data.spreadsheets || []);
        } catch (error: any) {
            // Non-critical error, just log it
            console.warn('Failed to load all spreadsheets:', error.message);
        }
    };

    const loadSpreadsheets = async (accountId: string) => {
        try {
            const response = await api.get(`/auth/oauth2/google-sheets/connections/${accountId}/connected-spreadsheets`);
            const accountSpreadsheets = response.data.spreadsheets || [];

            // Update the connected spreadsheets for this account
            setConnectedSpreadsheets(prev => [
                ...prev.filter(sheet => sheet.accountEmail !== accounts.find(acc => acc.id === accountId)?.email),
                ...accountSpreadsheets.map((sheet: any) => ({
                    ...sheet,
                    accountEmail: accounts.find(acc => acc.id === accountId)?.email || '',
                }))
            ]);
        } catch (error: any) {
            handleError(error, ErrorType.SPREADSHEET_ACCESS_DENIED, accountId);
        }
    };

    const handleError = (error: any, type: ErrorType, connectionId?: string) => {
        const errorDetails: ErrorDetails = {
            type,
            message: error.message || 'An unexpected error occurred',
            connectionId: connectionId || selectedAccountId,
            timestamp: new Date().toISOString(),
            code: error.code,
            details: error.response?.data,
        };

        setCurrentError(errorDetails);
        setShowErrorDialog(true);
    };

    const handleAccountSelected = (accountId: string, account: GoogleAccount) => {
        setSelectedAccountId(accountId);

        // Check for potential issues
        if (account.status !== ConnectionStatus.ACTIVE) {
            toast({
                title: 'Account Status Warning',
                description: `Selected account has status: ${account.status}`,
                variant: 'destructive',
            });
        }

        // Check token expiration
        if (account.tokenExpiresAt) {
            const expiresIn = Math.floor((new Date(account.tokenExpiresAt).getTime() - Date.now()) / (1000 * 60));
            if (expiresIn < 60) {
                toast({
                    title: 'Token Expiring Soon',
                    description: `Access token expires in ${expiresIn} minutes`,
                    variant: 'destructive',
                });
            }
        }
    };

    const handleAddNewAccount = async () => {
        try {
            const response = await api.post('/auth/oauth2/google-sheets/initiate', {
                platformType: PlatformType.GOOGLE_SHEETS,
                platformName: `Google Sheets Account ${accounts.length + 1}`,
            });

            // Redirect to OAuth authorization
            window.location.href = response.data.authorizationUrl;
        } catch (error: any) {
            handleError(error, ErrorType.NETWORK_ERROR);
        }
    };

    const handleRefreshAll = async () => {
        setRefreshing(true);
        try {
            await loadData();
            toast({
                title: 'Data Refreshed',
                description: 'All account and spreadsheet data has been refreshed.',
            });
        } catch (error: any) {
            handleError(error, ErrorType.NETWORK_ERROR);
        } finally {
            setRefreshing(false);
        }
    };

    const handleDisconnectSpreadsheet = async (spreadsheetId: string, accountId: string) => {
        if (!confirm('Are you sure you want to disconnect this spreadsheet?')) {
            return;
        }

        try {
            await api.delete(`/auth/oauth2/google-sheets/connections/${accountId}/spreadsheets/${spreadsheetId}/disconnect`);

            toast({
                title: 'Spreadsheet Disconnected',
                description: 'Successfully disconnected from the spreadsheet.',
            });

            await loadSpreadsheets(accountId);
        } catch (error: any) {
            handleError(error, ErrorType.SPREADSHEET_ACCESS_DENIED, accountId);
        }
    };

    const handleRevokeAccount = async (accountId: string) => {
        if (!confirm('Are you sure you want to revoke this Google account? This will disconnect all associated spreadsheets.')) {
            return;
        }

        try {
            await api.delete(`/auth/oauth2/google-sheets/connections/${accountId}`);

            toast({
                title: 'Account Revoked',
                description: 'Google account has been successfully revoked.',
            });

            await loadAccounts();

            // Clear selection if revoked account was selected
            if (selectedAccountId === accountId) {
                setSelectedAccountId(undefined);
            }
        } catch (error: any) {
            handleError(error, ErrorType.NETWORK_ERROR, accountId);
        }
    };

    const handleErrorRecovered = () => {
        toast({
            title: 'Error Recovered',
            description: 'The connection issue has been resolved.',
        });

        // Refresh data after recovery
        loadData();
    };

    const getAccountStats = () => {
        const total = accounts.length;
        const active = accounts.filter(acc => acc.status === ConnectionStatus.ACTIVE).length;
        const expired = accounts.filter(acc => acc.status === ConnectionStatus.EXPIRED).length;
        const errors = accounts.filter(acc => acc.status === ConnectionStatus.ERROR).length;
        const totalSpreadsheets = connectedSpreadsheets.length;

        return { total, active, expired, errors, totalSpreadsheets };
    };

    const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
    const accountSpreadsheets = connectedSpreadsheets.filter(
        sheet => sheet.accountEmail === selectedAccount?.email
    );
    const stats = getAccountStats();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <LoadingSpinner className="h-8 w-8 mr-2" />
                <span>Loading Google Sheets accounts...</span>
            </div>
        );
    }

    return (
        <div className={className}>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Google Sheets Multi-Account Manager</h2>
                        <p className="text-muted-foreground">
                            Manage multiple Google accounts and their connected spreadsheets.
                        </p>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            onClick={handleRefreshAll}
                            disabled={refreshing}
                        >
                            {refreshing ? (
                                <LoadingSpinner className="h-4 w-4 mr-2" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Refresh All
                        </Button>

                        <Button onClick={handleAddNewAccount}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Google Account
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center">
                                <Users className="h-4 w-4 mr-2" />
                                Total Accounts
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.total}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center">
                                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                Active
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center">
                                <Clock className="h-4 w-4 mr-2 text-yellow-600" />
                                Expired
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-yellow-600">{stats.expired}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center">
                                <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                                Errors
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center">
                                <FileSpreadsheet className="h-4 w-4 mr-2 text-blue-600" />
                                Spreadsheets
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">{stats.totalSpreadsheets}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="accounts">Account Management</TabsTrigger>
                        <TabsTrigger value="spreadsheets">Spreadsheets</TabsTrigger>
                        <TabsTrigger value="health">Health Monitoring</TabsTrigger>
                    </TabsList>

                    <TabsContent value="accounts" className="space-y-6">
                        {/* Account Selector */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Select Google Account</CardTitle>
                                <CardDescription>
                                    Choose which Google account to manage or add a new one.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <AccountSelector
                                    selectedAccountId={selectedAccountId}
                                    onAccountSelected={handleAccountSelected}
                                    onAddNewAccount={handleAddNewAccount}
                                    placeholder="Select a Google account..."
                                />
                            </CardContent>
                        </Card>

                        {/* Account Details */}
                        {selectedAccount && (
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Account Details</CardTitle>
                                            <CardDescription>{selectedAccount.email}</CardDescription>
                                        </div>
                                        <ConnectionHealthIndicator
                                            connectionId={selectedAccount.id}
                                            showDetails={false}
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="font-medium text-gray-600">Status:</span>
                                            <Badge
                                                variant={selectedAccount.status === ConnectionStatus.ACTIVE ? 'default' : 'secondary'}
                                                className="ml-2"
                                            >
                                                {selectedAccount.status}
                                            </Badge>
                                        </div>

                                        <div>
                                            <span className="font-medium text-gray-600">Connected Spreadsheets:</span>
                                            <span className="ml-2">{selectedAccount.connectedSpreadsheets}</span>
                                        </div>

                                        {selectedAccount.lastSyncAt && (
                                            <div>
                                                <span className="font-medium text-gray-600">Last Sync:</span>
                                                <span className="ml-2">
                                                    {formatDistanceToNow(new Date(selectedAccount.lastSyncAt), { addSuffix: true })}
                                                </span>
                                            </div>
                                        )}

                                        {selectedAccount.tokenExpiresAt && (
                                            <div>
                                                <span className="font-medium text-gray-600">Token Expires:</span>
                                                <span className="ml-2">
                                                    {formatDistanceToNow(new Date(selectedAccount.tokenExpiresAt), { addSuffix: true })}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <Separator />

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <Button variant="outline" size="sm">
                                                <Settings className="h-4 w-4 mr-2" />
                                                Account Settings
                                            </Button>
                                            <Button variant="outline" size="sm">
                                                <RefreshCw className="h-4 w-4 mr-2" />
                                                Refresh Token
                                            </Button>
                                        </div>

                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleRevokeAccount(selectedAccount.id)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Revoke Account
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="spreadsheets" className="space-y-6">
                        {selectedAccount ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Connected Spreadsheets</CardTitle>
                                    <CardDescription>
                                        Spreadsheets connected to {selectedAccount.email}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {accountSpreadsheets.length > 0 ? (
                                        <div className="space-y-3">
                                            {accountSpreadsheets.map((spreadsheet) => (
                                                <div key={spreadsheet.id} className="border rounded-lg p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center space-x-2">
                                                                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                                                <h4 className="font-medium">{spreadsheet.name}</h4>
                                                                {spreadsheet.hasError && (
                                                                    <Badge variant="destructive" className="text-xs">
                                                                        Error
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-gray-600 mt-1">
                                                                Connected {formatDistanceToNow(new Date(spreadsheet.connectedAt), { addSuffix: true })}
                                                            </p>
                                                            {spreadsheet.hasError && spreadsheet.lastError && (
                                                                <p className="text-xs text-red-600 mt-1">{spreadsheet.lastError}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => window.open(spreadsheet.webViewLink, '_blank')}
                                                            >
                                                                Open
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() => handleDisconnectSpreadsheet(spreadsheet.id, selectedAccount.id)}
                                                            >
                                                                Disconnect
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8">
                                            <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">No Spreadsheets Connected</h3>
                                            <p className="text-gray-600 mb-4">
                                                Connect spreadsheets to start managing your data.
                                            </p>
                                            <Button>
                                                <Plus className="h-4 w-4 mr-2" />
                                                Connect Spreadsheet
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardContent className="text-center py-8">
                                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Account</h3>
                                    <p className="text-gray-600">
                                        Please select a Google account to view its connected spreadsheets.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="health" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {accounts.map((account) => (
                                <Card key={account.id}>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-base">{account.email}</CardTitle>
                                                <CardDescription>{account.name}</CardDescription>
                                            </div>
                                            <Badge
                                                variant={account.status === ConnectionStatus.ACTIVE ? 'default' : 'secondary'}
                                            >
                                                {account.status}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <ConnectionHealthIndicator
                                            connectionId={account.id}
                                            showDetails={true}
                                            autoRefresh={true}
                                            refreshInterval={30}
                                        />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {accounts.length === 0 && (
                            <Card>
                                <CardContent className="text-center py-8">
                                    <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Accounts to Monitor</h3>
                                    <p className="text-gray-600 mb-4">
                                        Add Google accounts to monitor their health status.
                                    </p>
                                    <Button onClick={handleAddNewAccount}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Google Account
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Error Recovery Dialog */}
            {showErrorDialog && currentError && (
                <ErrorRecoveryDialog
                    isOpen={showErrorDialog}
                    onClose={() => setShowErrorDialog(false)}
                    error={currentError}
                    onRetry={() => loadData()}
                    onRecovered={handleErrorRecovered}
                />
            )}
        </div>
    );
}