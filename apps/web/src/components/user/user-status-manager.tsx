'use client';

import { useState } from 'react';
import { User, UserStatus, UpdateUserStatusDto } from '@/types/auth';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, MoreVertical, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface UserStatusManagerProps {
  user: User;
  onStatusUpdate?: (updatedUser: User) => void;
  canManageStatus?: boolean;
}

export function UserStatusManager({ user, onStatusUpdate, canManageStatus = false }: UserStatusManagerProps) {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<UserStatus | null>(null);
  const [reason, setReason] = useState('');

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';
  const canChangeStatus = canManageStatus && isAdmin && currentUser?.id !== user.id;

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ACTIVE:
        return (
          <Badge variant="success" className="flex items-center">
            <CheckCircle className="h-3 w-3 mr-1" />
            {t('userStatus.active')}
          </Badge>
        );
      case UserStatus.SUSPENDED:
        return (
          <Badge variant="destructive" className="flex items-center">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {t('userStatus.suspended')}
          </Badge>
        );
      case UserStatus.PENDING:
        return (
          <Badge variant="warning" className="flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {t('userStatus.pending')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusDescription = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ACTIVE:
        return t('userStatus.activeDescription');
      case UserStatus.SUSPENDED:
        return t('userStatus.suspendedDescription');
      case UserStatus.PENDING:
        return t('userStatus.pendingDescription');
      default:
        return '';
    }
  };

  const handleStatusChange = (newStatus: UserStatus) => {
    setSelectedStatus(newStatus);
    setReason('');
    setShowConfirmDialog(true);
  };

  const confirmStatusChange = async () => {
    if (!selectedStatus) return;

    try {
      setIsLoading(true);

      const updateData: UpdateUserStatusDto = {
        status: selectedStatus,
        reason: reason.trim() || undefined,
      };

      const response = await apiClient.updateUserStatus(user.id, updateData);

      toast({
        title: t('userStatus.updateSuccess'),
        description: t('userStatus.updateSuccessDescription', {
          name: `${user.firstName} ${user.lastName}`,
          status: t(`userStatus.${selectedStatus.toLowerCase()}`),
        }),
      });

      onStatusUpdate?.(response.user);
      setShowConfirmDialog(false);
      setSelectedStatus(null);
      setReason('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('userStatus.updateError'),
        description: error.message || t('userStatus.updateErrorDescription'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailableStatuses = (): UserStatus[] => {
    const allStatuses = [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.PENDING];
    return allStatuses.filter(status => status !== user.status);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            {t('userStatus.title')}
          </span>
          {canChangeStatus && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {getAvailableStatuses().map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className="flex items-center"
                  >
                    {status === UserStatus.ACTIVE && <CheckCircle className="h-4 w-4 mr-2" />}
                    {status === UserStatus.SUSPENDED && <AlertTriangle className="h-4 w-4 mr-2" />}
                    {status === UserStatus.PENDING && <Clock className="h-4 w-4 mr-2" />}
                    {t('userStatus.changeTo')} {t(`userStatus.${status.toLowerCase()}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardTitle>
        <CardDescription>{t('userStatus.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('userStatus.currentStatus')}</p>
            <p className="text-xs text-muted-foreground">{getStatusDescription(user.status)}</p>
          </div>
          {getStatusBadge(user.status)}
        </div>

        {!canChangeStatus && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              {currentUser?.id === user.id
                ? t('userStatus.cannotChangeOwnStatus')
                : t('userStatus.insufficientPermissions')
              }
            </p>
          </div>
        )}

        {/* Status Change Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('userStatus.confirmChange')}</DialogTitle>
              <DialogDescription>
                {t('userStatus.confirmChangeDescription', {
                  name: `${user.firstName} ${user.lastName}`,
                  status: selectedStatus ? t(`userStatus.${selectedStatus.toLowerCase()}`) : '',
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">{t('userStatus.reason')}</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('userStatus.reasonPlaceholder')}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  {t('userStatus.reasonHint')}
                </p>
              </div>

              {selectedStatus === UserStatus.SUSPENDED && (
                <div className="bg-destructive/10 p-3 rounded-lg">
                  <p className="text-sm text-destructive font-medium">
                    {t('userStatus.suspendWarning')}
                  </p>
                  <p className="text-xs text-destructive/80 mt-1">
                    {t('userStatus.suspendWarningDescription')}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
                disabled={isLoading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={confirmStatusChange}
                disabled={isLoading}
                variant={selectedStatus === UserStatus.SUSPENDED ? 'destructive' : 'default'}
              >
                {isLoading && <LoadingSpinner size="sm" className="mr-2" />}
                {t('userStatus.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}