'use client';

import React, { useState, useEffect } from 'react';
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
import { Search, FileSpreadsheet, ExternalLink, Calendar, Plus, Link } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CreateSpreadsheetDialog } from './create-spreadsheet-dialog';

interface SpreadsheetSelectorProps {
  connectionId: string;
  onSpreadsheetSelected: (spreadsheetId: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

interface Spreadsheet {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
}

export function SpreadsheetSelector({
  connectionId,
  onSpreadsheetSelected,
  onClose,
  isLoading,
}: SpreadsheetSelectorProps) {
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [filteredSpreadsheets, setFilteredSpreadsheets] = useState<Spreadsheet[]>([]);
  const [isLoadingSpreadsheets, setIsLoadingSpreadsheets] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSpreadsheets();
  }, [connectionId]);

  useEffect(() => {
    // Filter spreadsheets based on search query
    if (searchQuery.trim()) {
      const filtered = spreadsheets.filter(sheet =>
        sheet.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSpreadsheets(filtered);
    } else {
      setFilteredSpreadsheets(spreadsheets);
    }
  }, [searchQuery, spreadsheets]);

  const loadSpreadsheets = async (pageToken?: string) => {
    setIsLoadingSpreadsheets(true);
    try {
      const params = new URLSearchParams({
        pageSize: '20',
      });
      
      if (pageToken) {
        params.append('pageToken', pageToken);
      }

      const response = await api.get(
        `/auth/oauth2/google-sheets/connections/${connectionId}/available-spreadsheets?${params.toString()}`
      );

      const newSpreadsheets = response.data.spreadsheets || [];
      
      if (pageToken) {
        // Append to existing spreadsheets for pagination
        setSpreadsheets(prev => [...prev, ...newSpreadsheets]);
      } else {
        // Replace spreadsheets for initial load
        setSpreadsheets(newSpreadsheets);
      }

      setNextPageToken(response.data.nextPageToken);
      setHasMore(!!response.data.nextPageToken);
    } catch (error: any) {
      toast({
        title: 'Failed to Load Spreadsheets',
        description: error.message || 'Could not load available spreadsheets.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpreadsheets(false);
    }
  };

  const loadMoreSpreadsheets = () => {
    if (nextPageToken && !isLoadingSpreadsheets) {
      loadSpreadsheets(nextPageToken);
    }
  };

  const handleSpreadsheetSelect = (spreadsheet: Spreadsheet) => {
    onSpreadsheetSelected(spreadsheet.id);
  };

  const openSpreadsheetInNewTab = (webViewLink: string) => {
    window.open(webViewLink, '_blank');
  };

  const handleImportSpreadsheet = async () => {
    if (!importUrl.trim()) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid Google Sheets URL.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    try {
      const response = await api.post(
        `/auth/oauth2/google-sheets/connections/${connectionId}/add-existing-spreadsheet`,
        {
          spreadsheetUrl: importUrl.trim(),
        }
      );

      if (response.data.success) {
        toast({
          title: 'Spreadsheet Imported',
          description: `Successfully imported "${response.data.spreadsheet.name}".`,
        });
        
        // Add the imported spreadsheet to the list
        const newSpreadsheet: Spreadsheet = {
          id: response.data.spreadsheet.id,
          name: response.data.spreadsheet.name,
          createdTime: new Date().toISOString(),
          modifiedTime: new Date().toISOString(),
          webViewLink: `https://docs.google.com/spreadsheets/d/${response.data.spreadsheet.id}`,
        };
        
        setSpreadsheets(prev => [newSpreadsheet, ...prev]);
        setShowImportDialog(false);
        setImportUrl('');
      } else {
        toast({
          title: 'Import Failed',
          description: response.data.error || 'Could not import the spreadsheet.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Import Failed',
        description: error.message || 'Could not import the spreadsheet.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSpreadsheetCreated = (createdSpreadsheet: any) => {
    // Add the created spreadsheet to the list
    const newSpreadsheet: Spreadsheet = {
      id: createdSpreadsheet.id,
      name: createdSpreadsheet.name,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink: createdSpreadsheet.webViewLink,
    };
    
    setSpreadsheets(prev => [newSpreadsheet, ...prev]);
    
    // Auto-select the newly created spreadsheet
    onSpreadsheetSelected(createdSpreadsheet.id);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select a Spreadsheet</DialogTitle>
          <DialogDescription>
            Choose a Google Spreadsheet to connect to this integration.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          {/* Search and Actions */}
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search spreadsheets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create New</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowImportDialog(true)}
              className="flex items-center space-x-2"
            >
              <Link className="h-4 w-4" />
              <span>Import</span>
            </Button>
          </div>

          {/* Spreadsheets List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {isLoadingSpreadsheets && spreadsheets.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner className="h-6 w-6 mr-2" />
                <span>Loading spreadsheets...</span>
              </div>
            ) : filteredSpreadsheets.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? (
                  'No spreadsheets match your search.'
                ) : (
                  <div className="space-y-4">
                    <p>No spreadsheets found.</p>
                    <p className="text-sm">
                      With the current permissions, only spreadsheets created by this app or explicitly shared are visible.
                    </p>
                    <div className="flex flex-col space-y-2">
                      <Button
                        onClick={() => setShowCreateDialog(true)}
                        className="flex items-center space-x-2"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Create New Spreadsheet</span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowImportDialog(true)}
                        className="flex items-center space-x-2"
                      >
                        <Link className="h-4 w-4" />
                        <span>Import Existing Spreadsheet</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {filteredSpreadsheets.map((spreadsheet) => (
                  <div
                    key={spreadsheet.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <FileSpreadsheet className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <h4 className="font-medium text-gray-900 truncate">
                            {spreadsheet.name}
                          </h4>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              Modified {formatDistanceToNow(new Date(spreadsheet.modifiedTime), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSpreadsheetInNewTab(spreadsheet.webViewLink)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSpreadsheetSelect(spreadsheet)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <LoadingSpinner className="h-4 w-4" />
                          ) : (
                            'Select'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Load More Button */}
                {hasMore && !searchQuery && (
                  <div className="text-center py-4">
                    <Button
                      variant="outline"
                      onClick={loadMoreSpreadsheets}
                      disabled={isLoadingSpreadsheets}
                    >
                      {isLoadingSpreadsheets ? (
                        <>
                          <LoadingSpinner className="h-4 w-4 mr-2" />
                          Loading...
                        </>
                      ) : (
                        'Load More'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
        </div>

        {/* Create Spreadsheet Dialog */}
        <CreateSpreadsheetDialog
          connectionId={connectionId}
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSpreadsheetCreated={handleSpreadsheetCreated}
        />

        {/* Import Dialog */}
        {showImportDialog && (
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Import Existing Spreadsheet</DialogTitle>
                <DialogDescription>
                  Enter the URL of a Google Sheets document you want to import.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Google Sheets URL
                  </label>
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={isImporting}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Make sure the spreadsheet is shared with your Google account or is publicly accessible.
                  </p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportUrl('');
                    }}
                    disabled={isImporting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImportSpreadsheet}
                    disabled={isImporting || !importUrl.trim()}
                  >
                    {isImporting ? (
                      <>
                        <LoadingSpinner className="h-4 w-4 mr-2" />
                        Importing...
                      </>
                    ) : (
                      'Import'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}