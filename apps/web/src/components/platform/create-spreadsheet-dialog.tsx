'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { FileSpreadsheet, Plus } from 'lucide-react';

interface CreateSpreadsheetDialogProps {
  connectionId: string;
  isOpen: boolean;
  onClose: () => void;
  onSpreadsheetCreated: (spreadsheet: CreatedSpreadsheet) => void;
}

interface CreatedSpreadsheet {
  id: string;
  name: string;
  webViewLink: string;
  sheets: Array<{
    id: number;
    name: string;
    index: number;
  }>;
}

export function CreateSpreadsheetDialog({
  connectionId,
  isOpen,
  onClose,
  onSpreadsheetCreated,
}: CreateSpreadsheetDialogProps) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const generateDefaultName = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    return `Orders Spreadsheet - ${dateStr}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const spreadsheetName = name.trim() || generateDefaultName();
    
    if (spreadsheetName.length > 100) {
      toast({
        title: 'Invalid Name',
        description: 'Spreadsheet name must be less than 100 characters.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await api.post(
        `/auth/oauth2/google-sheets/connections/${connectionId}/create-orders-spreadsheet`,
        {
          name: spreadsheetName,
        }
      );

      if (response.data.success) {
        toast({
          title: 'Spreadsheet Created',
          description: `Successfully created "${response.data.spreadsheet.name}".`,
        });
        
        onSpreadsheetCreated(response.data.spreadsheet);
        handleClose();
      } else {
        toast({
          title: 'Creation Failed',
          description: response.data.error || 'Could not create the spreadsheet.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Failed to create spreadsheet:', error);
      
      let errorMessage = 'Could not create the spreadsheet.';
      
      if (error.response?.status === 403) {
        errorMessage = 'Permission denied. Please check your Google Sheets connection.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Google Sheets connection not found. Please reconnect.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      toast({
        title: 'Creation Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            <span>Create New Spreadsheet</span>
          </DialogTitle>
          <DialogDescription>
            Create a new Google Sheets document with predefined Orders template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Spreadsheet Name
            </label>
            <Input
              placeholder={generateDefaultName()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use default name with current date
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="text-sm font-medium text-blue-900 mb-2">
              What will be created:
            </h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Orders sheet with predefined headers</li>
              <li>• Order ID, Date, Name, Phone, Address, City</li>
              <li>• Product, Product SKU, Product Qty, Product Variant</li>
              <li>• Price, Page URL</li>
              <li>• Proper formatting for dates and currency</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating}
              className="flex items-center space-x-2"
            >
              {isCreating ? (
                <>
                  <LoadingSpinner className="h-4 w-4" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create Spreadsheet</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}