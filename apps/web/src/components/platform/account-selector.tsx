'use client';

import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlatformConnection, PlatformType, ConnectionStatus } from '@/types/auth';
import { Plus, User, CheckCircle, AlertTriangle, Clock, XCircle } from 'lucide-react';

interface GoogleAccount {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  status: ConnectionStatus;
  connectionId: string;
  connectedSpreadsheets: number;
  lastSyncAt?: string;
}

interface AccountSelectorProps {
  selectedAccountId?: string;
  onAccountSelected: (accountId: string, account: GoogleAccount) => void;
  onAddNewAccount: () => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function AccountSelector({
  selectedAccountId,
  onAccountSelected,
  onAddNewAccount,
  className,
  disabled = false,
  placeholder = "Select Google account...",
}: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadGoogleAccounts();
  }, []);

  const loadGoogleAccounts = async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/oauth2/google-sheets/connections/accounts');
      
      // Transform platform connections into Google accounts
      const googleAccounts: GoogleAccount[] = response.data.accounts.map((conn: PlatformConnection) => ({
        id: conn.id,
        email: conn.platformData?.email || conn.platformName,
        name: conn.platformData?.name || conn.platformData?.given_name + ' ' + conn.platformData?.family_name,
        picture: conn.platformData?.picture,
        status: conn.status,
        connectionId: conn.id,
        connectedSpreadsheets: conn.platformData?.connectedSpreadsheets || 0,
        lastSyncAt: conn.lastSyncAt,
      }));

      setAccounts(googleAccounts);
    } catch (error: any) {
      toast({
        title: 'Failed to Load Accounts',
        description: error.message || 'Could not load Google accounts.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.ACTIVE:
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case ConnectionStatus.EXPIRED:
        return <Clock className="h-3 w-3 text-yellow-600" />;
      case ConnectionStatus.ERROR:
        return <AlertTriangle className="h-3 w-3 text-red-600" />;
      case ConnectionStatus.REVOKED:
        return <XCircle className="h-3 w-3 text-gray-600" />;
      default:
        return <AlertTriangle className="h-3 w-3 text-gray-600" />;
    }
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.ACTIVE:
        return 'bg-green-100 text-green-800';
      case ConnectionStatus.EXPIRED:
        return 'bg-yellow-100 text-yellow-800';
      case ConnectionStatus.ERROR:
        return 'bg-red-100 text-red-800';
      case ConnectionStatus.REVOKED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAccountSelect = (accountId: string) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (account) {
      onAccountSelected(accountId, account);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <LoadingSpinner className="h-4 w-4" />
        <span className="text-sm text-gray-600">Loading accounts...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center space-x-2">
        <div className="flex-1">
          <Select
            value={selectedAccountId}
            onValueChange={handleAccountSelect}
            disabled={disabled || accounts.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder}>
                {selectedAccount && (
                  <div className="flex items-center space-x-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={selectedAccount.picture} alt={selectedAccount.name} />
                      <AvatarFallback className="text-xs">
                        {selectedAccount.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="truncate">{selectedAccount.email}</span>
                      {getStatusIcon(selectedAccount.status)}
                    </div>
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <div className="flex items-center space-x-3 w-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={account.picture} alt={account.name} />
                      <AvatarFallback className="text-xs">
                        {account.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-sm truncate">{account.email}</p>
                        {getStatusIcon(account.status)}
                      </div>
                      {account.name && (
                        <p className="text-xs text-gray-600 truncate">{account.name}</p>
                      )}
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="secondary" className={`text-xs ${getStatusColor(account.status)}`}>
                          {account.status}
                        </Badge>
                        {account.connectedSpreadsheets > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {account.connectedSpreadsheets} sheets
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </SelectItem>
              ))}
              
              {/* Add New Account Option */}
              <SelectItem value="__add_new__" onSelect={(e) => {
                e.preventDefault();
                onAddNewAccount();
              }}>
                <div className="flex items-center space-x-3 w-full py-2">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-blue-600">Add New Google Account</p>
                    <p className="text-xs text-gray-600">Connect another Google account</p>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onAddNewAccount}
          disabled={disabled}
          className="flex-shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Account
        </Button>
      </div>

      {/* Account Info Display */}
      {selectedAccount && (
        <div className="p-3 bg-gray-50 rounded-lg border">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={selectedAccount.picture} alt={selectedAccount.name} />
              <AvatarFallback>
                {selectedAccount.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <p className="font-medium text-sm">{selectedAccount.email}</p>
                {getStatusIcon(selectedAccount.status)}
              </div>
              {selectedAccount.name && (
                <p className="text-xs text-gray-600">{selectedAccount.name}</p>
              )}
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="secondary" className={`text-xs ${getStatusColor(selectedAccount.status)}`}>
                  {selectedAccount.status}
                </Badge>
                {selectedAccount.connectedSpreadsheets > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {selectedAccount.connectedSpreadsheets} connected spreadsheets
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {accounts.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
          <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-2">No Google accounts connected</p>
          <Button onClick={onAddNewAccount} disabled={disabled}>
            <Plus className="h-4 w-4 mr-2" />
            Connect Your First Account
          </Button>
        </div>
      )}
    </div>
  );
}