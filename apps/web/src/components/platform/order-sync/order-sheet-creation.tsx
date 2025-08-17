'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlatformConnection } from '@/types/auth';
import { 
  FileSpreadsheet,
  Plus,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface OrderSheetCreationProps {
  connection: PlatformConnection;
  onSheetCreated?: (sheetInfo: any) => void;
  onCancel?: () => void;
}

interface CreateOrderSheetRequest {
  name: string;
  config?: {
    includeHeaders?: boolean;
    enableSync?: boolean;
  };
}

export function OrderSheetCreation({ 
  connection, 
  onSheetCreated, 
  onCancel 
}: OrderSheetCreationProps) {
  const [formData, setFormData] = useState<CreateOrderSheetRequest>({
    name: `Orders - ${new Date().toLocaleDateString()}`,
    config: {
      includeHeaders: true,
      enableSync: true
    }
  });
  const [creating, setCreating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Sheet name is required';
    } else if (formData.name.length < 3) {
      errors.name = 'Sheet name must be at least 3 characters';
    } else if (formData.name.length > 100) {
      errors.name = 'Sheet name must be less than 100 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSheet = async () => {
    if (!validateForm()) {
      return;
    }

    setCreating(true);
    try {
      const response = await api.post(
        `/auth/oauth2/google-sheets/connections/${connection.id}/create-order-sheet`,
        formData
      );

      toast({
        title: 'Order Sheet Created',
        description: `Successfully created "${formData.name}" with order sync enabled.`,
      });

      onSheetCreated?.(response.data);
    } catch (error: any) {
      toast({
        title: 'Failed to Create Sheet',
        description: error.message || 'Could not create the order sheet.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (field === 'name') {
      setFormData(prev => ({ ...prev, name: value }));
    } else if (field === 'includeHeaders' || field === 'enableSync') {
      setFormData(prev => ({ 
        ...prev, 
        config: { ...prev.config, [field]: value }
      }));
    }
    
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          <CardTitle>Create Order Sheet</CardTitle>
        </div>
        <CardDescription>
          Create a new Google Sheet configured for order sync
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection Info */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">
              Using: {connection.platformName}
            </span>
          </div>
        </div>

        {/* Sheet Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Sheet Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Enter sheet name..."
            className={validationErrors.name ? 'border-red-500' : ''}
          />
          {validationErrors.name && (
            <div className="flex items-center space-x-1 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{validationErrors.name}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This will be the name of your new Google Sheet
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="includeHeaders"
              checked={formData.config?.includeHeaders || false}
              onChange={(e) => handleInputChange('includeHeaders', e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="includeHeaders" className="text-sm">
              Include column headers
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            Add headers like &quot;Customer Name&quot;, &quot;Phone&quot;, &quot;Product&quot;, etc.
          </p>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enableSync"
              checked={formData.config?.enableSync || false}
              onChange={(e) => handleInputChange('enableSync', e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="enableSync" className="text-sm">
              Enable automatic order sync
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            Automatically sync new orders from this sheet to your system
          </p>
        </div>

        {/* What will be created */}
        <div className="p-3 bg-gray-50 rounded-lg border">
          <h4 className="text-sm font-medium mb-2">What will be created:</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• New Google Sheet with order columns</li>
            <li>• Webhook for real-time sync notifications</li>
            <li>• Order validation and processing rules</li>
            <li>• Automatic duplicate detection</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex space-x-2 pt-4">
          <Button
            onClick={handleCreateSheet}
            disabled={creating}
            className="flex-1"
          >
            {creating ? (
              <>
                <LoadingSpinner className="h-4 w-4 mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Sheet
              </>
            )}
          </Button>
          
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={creating}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}