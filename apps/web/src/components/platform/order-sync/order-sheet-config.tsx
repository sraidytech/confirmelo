'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  Settings,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  MapPin
} from 'lucide-react';

interface OrderSheetConfigProps {
  connectionId: string;
  sheetId: string;
  onConfigUpdated?: () => void;
  onCancel?: () => void;
}

interface ColumnMapping {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  productName: string;
  productPrice: string;
  quantity: string;
  orderDate: string;
  notes?: string;
  orderId?: string;
  status?: string;
}

interface ValidationRule {
  field: string;
  type: 'required' | 'phone' | 'email' | 'number' | 'date';
  message: string;
  enabled: boolean;
}

interface SheetConfig {
  columnMapping: ColumnMapping;
  validationRules: ValidationRule[];
  syncSettings: {
    autoSync: boolean;
    syncInterval: number; // minutes
    webhookEnabled: boolean;
    duplicateHandling: 'skip' | 'flag' | 'create';
  };
  sheetInfo?: {
    name: string;
    columns: string[];
    rowCount: number;
  };
}

const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  { field: 'customerName', type: 'required', message: 'Customer name is required', enabled: true },
  { field: 'customerPhone', type: 'phone', message: 'Valid phone number is required', enabled: true },
  { field: 'productName', type: 'required', message: 'Product name is required', enabled: true },
  { field: 'productPrice', type: 'number', message: 'Valid price is required', enabled: true },
  { field: 'quantity', type: 'number', message: 'Valid quantity is required', enabled: true },
];

export function OrderSheetConfig({ 
  connectionId, 
  sheetId, 
  onConfigUpdated, 
  onCancel 
}: OrderSheetConfigProps) {
  const [config, setConfig] = useState<SheetConfig>({
    columnMapping: {
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      customerCity: '',
      productName: '',
      productPrice: '',
      quantity: '',
      orderDate: '',
      notes: '',
      orderId: '',
      status: ''
    },
    validationRules: DEFAULT_VALIDATION_RULES,
    syncSettings: {
      autoSync: true,
      syncInterval: 15,
      webhookEnabled: true,
      duplicateHandling: 'flag'
    }
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadSheetConfig();
  }, [connectionId, sheetId]);

  const loadSheetConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get(
        `/auth/oauth2/google-sheets/order-sheets/${sheetId}/config`
      );
      
      if (response.data.config) {
        setConfig(prev => ({
          ...prev,
          ...response.data.config,
          sheetInfo: response.data.sheetInfo
        }));
      } else {
        // If no config exists, set sheet info for column selection
        setConfig(prev => ({
          ...prev,
          sheetInfo: response.data.sheetInfo
        }));
      }
    } catch (error: any) {
      toast({
        title: 'Failed to Load Configuration',
        description: error.message || 'Could not load sheet configuration.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const validateConfig = (): boolean => {
    const errors: Record<string, string> = {};
    const requiredMappings = ['customerName', 'customerPhone', 'productName', 'productPrice', 'quantity'];
    
    requiredMappings.forEach(field => {
      if (!config.columnMapping[field as keyof ColumnMapping]) {
        errors[field] = `${field.replace(/([A-Z])/g, ' $1').toLowerCase()} mapping is required`;
      }
    });

    // Check for duplicate column mappings
    const usedColumns = Object.values(config.columnMapping).filter(col => col);
    const duplicates = usedColumns.filter((col, index) => usedColumns.indexOf(col) !== index);
    
    if (duplicates.length > 0) {
      errors.general = 'Each column can only be mapped once';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveConfig = async () => {
    if (!validateConfig()) {
      return;
    }

    setSaving(true);
    try {
      await api.put(
        `/auth/oauth2/google-sheets/order-sheets/${sheetId}/config`,
        { config }
      );

      toast({
        title: 'Configuration Saved',
        description: 'Order sheet configuration has been updated successfully.',
      });

      onConfigUpdated?.();
    } catch (error: any) {
      toast({
        title: 'Failed to Save Configuration',
        description: error.message || 'Could not save the configuration.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleColumnMappingChange = (field: keyof ColumnMapping, value: string) => {
    setConfig(prev => ({
      ...prev,
      columnMapping: {
        ...prev.columnMapping,
        [field]: value
      }
    }));

    // Clear validation error
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleValidationRuleChange = (index: number, field: keyof ValidationRule, value: any) => {
    setConfig(prev => ({
      ...prev,
      validationRules: prev.validationRules.map((rule, i) => 
        i === index ? { ...rule, [field]: value } : rule
      )
    }));
  };

  const handleSyncSettingChange = (field: keyof typeof config.syncSettings, value: any) => {
    setConfig(prev => ({
      ...prev,
      syncSettings: {
        ...prev.syncSettings,
        [field]: value
      }
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner className="h-6 w-6 mr-2" />
          <span>Loading sheet configuration...</span>
        </CardContent>
      </Card>
    );
  }

  const availableColumns = config.sheetInfo?.columns || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <CardTitle>Order Sheet Configuration</CardTitle>
          </div>
          <CardDescription>
            Configure column mapping and sync settings for {config.sheetInfo?.name}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* General Validation Error */}
          {validationErrors.general && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-800 text-sm">{validationErrors.general}</span>
              </div>
            </div>
          )}

          {/* Sheet Info */}
          {config.sheetInfo && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800">Sheet Information</span>
              </div>
              <div className="text-sm text-blue-700">
                <p><strong>Name:</strong> {config.sheetInfo.name}</p>
                <p><strong>Columns:</strong> {config.sheetInfo.columns.length}</p>
                <p><strong>Rows:</strong> {config.sheetInfo.rowCount}</p>
              </div>
            </div>
          )}

          {/* Column Mapping */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-gray-600" />
              <h3 className="text-lg font-semibold">Column Mapping</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Map your sheet columns to order fields. Required fields are marked with *.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(config.columnMapping).map(([field, value]) => {
                const isRequired = ['customerName', 'customerPhone', 'productName', 'productPrice', 'quantity'].includes(field);
                const fieldLabel = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                
                return (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field}>
                      {fieldLabel} {isRequired && <span className="text-red-500">*</span>}
                    </Label>
                    <Select
                      value={value}
                      onValueChange={(newValue) => handleColumnMappingChange(field as keyof ColumnMapping, newValue)}
                    >
                      <SelectTrigger className={validationErrors[field] ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {availableColumns.map((column) => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {validationErrors[field] && (
                      <div className="flex items-center space-x-1 text-red-600 text-sm">
                        <AlertCircle className="h-3 w-3" />
                        <span>{validationErrors[field]}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sync Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Sync Settings</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="autoSync"
                    checked={config.syncSettings.autoSync}
                    onChange={(e) => handleSyncSettingChange('autoSync', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="autoSync">Enable automatic sync</Label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="webhookEnabled"
                    checked={config.syncSettings.webhookEnabled}
                    onChange={(e) => handleSyncSettingChange('webhookEnabled', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="webhookEnabled">Enable webhook notifications</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="syncInterval">Sync interval (minutes)</Label>
                <Input
                  id="syncInterval"
                  type="number"
                  min="5"
                  max="1440"
                  value={config.syncSettings.syncInterval}
                  onChange={(e) => handleSyncSettingChange('syncInterval', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duplicateHandling">Duplicate handling</Label>
                <Select
                  value={config.syncSettings.duplicateHandling}
                  onValueChange={(value) => handleSyncSettingChange('duplicateHandling', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip duplicates</SelectItem>
                    <SelectItem value="flag">Flag for review</SelectItem>
                    <SelectItem value="create">Create anyway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Validation Rules */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Validation Rules</h3>
            
            <div className="space-y-3">
              {config.validationRules.map((rule, index) => (
                <div key={index} className="flex items-center space-x-4 p-3 border rounded-lg">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => handleValidationRuleChange(index, 'enabled', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  
                  <div className="flex-1">
                    <span className="font-medium">
                      {rule.field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                    <p className="text-sm text-muted-foreground">{rule.message}</p>
                  </div>
                  
                  <Badge variant="secondary" className="text-xs">
                    {rule.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-2 pt-4 border-t">
            <Button
              onClick={handleSaveConfig}
              disabled={saving}
              className="flex-1"
            >
              {saving ? (
                <>
                  <LoadingSpinner className="h-4 w-4 mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
            
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}