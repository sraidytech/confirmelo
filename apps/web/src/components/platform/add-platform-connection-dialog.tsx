'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PlatformType, InitiatePlatformConnectionDto } from '@/types/auth';
import { ExternalLink, Store, FileSpreadsheet, Edit3 } from 'lucide-react';

interface AddPlatformConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddConnection: (data: InitiatePlatformConnectionDto) => Promise<void>;
}

interface PlatformOption {
  type: PlatformType;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
  setupInstructions: string;
}

const platformOptions: PlatformOption[] = [
  {
    type: PlatformType.YOUCAN,
    name: 'Youcan Shop',
    description: 'Connect your Youcan e-commerce store to import orders automatically.',
    icon: <Store className="h-6 w-6" />,
    color: 'bg-blue-500',
    features: ['Order Import', 'Product Sync', 'Customer Data', 'Inventory Tracking'],
    setupInstructions: 'You will be redirected to Youcan to authorize access to your store.',
  },
  {
    type: PlatformType.SHOPIFY,
    name: 'Shopify',
    description: 'Integrate with your Shopify store for seamless order management.',
    icon: <Store className="h-6 w-6" />,
    color: 'bg-green-500',
    features: ['Order Import', 'Product Sync', 'Customer Data', 'Fulfillment'],
    setupInstructions: 'You will be redirected to Shopify to install the Confirmelo app.',
  },
  {
    type: PlatformType.GOOGLE_SHEETS,
    name: 'Google Sheets',
    description: 'Import orders from Google Sheets for manual order processing.',
    icon: <FileSpreadsheet className="h-6 w-6" />,
    color: 'bg-yellow-500',
    features: ['Order Import', 'Data Validation', 'Batch Processing', 'Custom Mapping'],
    setupInstructions: 'You will be redirected to Google to grant access to your sheets.',
  },
  {
    type: PlatformType.MANUAL,
    name: 'Manual Entry',
    description: 'Set up manual order entry for custom workflows.',
    icon: <Edit3 className="h-6 w-6" />,
    color: 'bg-gray-500',
    features: ['Custom Forms', 'Data Validation', 'Workflow Integration', 'Team Access'],
    setupInstructions: 'Configure manual entry settings and team permissions.',
  },
];

export function AddPlatformConnectionDialog({ 
  open, 
  onOpenChange, 
  onAddConnection 
}: AddPlatformConnectionDialogProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformOption | null>(null);
  const [connectionName, setConnectionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'configure'>('select');

  const handlePlatformSelect = (platform: PlatformOption) => {
    setSelectedPlatform(platform);
    setConnectionName(`My ${platform.name} Connection`);
    setStep('configure');
  };

  const handleBack = () => {
    setStep('select');
    setSelectedPlatform(null);
    setConnectionName('');
  };

  const handleConnect = async () => {
    if (!selectedPlatform || !connectionName.trim()) return;

    setLoading(true);
    try {
      const data: InitiatePlatformConnectionDto = {
        platformType: selectedPlatform.type,
        platformName: connectionName.trim(),
        platformData: {
          // Add any platform-specific configuration here
        },
      };

      await onAddConnection(data);
      
      // Dialog will close when the user is redirected to OAuth
      // or when they return from the OAuth flow
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setStep('select');
      setSelectedPlatform(null);
      setConnectionName('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'select' ? 'Add Platform Connection' : `Connect to ${selectedPlatform?.name}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' 
              ? 'Choose a platform to connect with your Confirmelo account.'
              : 'Configure your connection settings and authorize access.'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {platformOptions.map((platform) => (
              <Card 
                key={platform.type}
                className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-200"
                onClick={() => handlePlatformSelect(platform)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${platform.color} text-white`}>
                      {platform.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{platform.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {platform.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Features:</h4>
                    <div className="flex flex-wrap gap-1">
                      {platform.features.map((feature) => (
                        <span 
                          key={feature}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center text-blue-600 text-sm">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    <span>Click to connect</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {step === 'configure' && selectedPlatform && (
          <div className="space-y-6 py-4">
            {/* Platform Info */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${selectedPlatform.color} text-white`}>
                    {selectedPlatform.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{selectedPlatform.name}</CardTitle>
                    <CardDescription>
                      {selectedPlatform.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Setup Instructions:</h4>
                  <p className="text-blue-800 text-sm">{selectedPlatform.setupInstructions}</p>
                </div>
              </CardContent>
            </Card>

            {/* Connection Configuration */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="connectionName">Connection Name</Label>
                <Input
                  id="connectionName"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder={`My ${selectedPlatform.name} Connection`}
                  className="mt-1"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Give your connection a memorable name to identify it later.
                </p>
              </div>

              {/* Platform-specific configuration could go here */}
              {selectedPlatform.type === PlatformType.GOOGLE_SHEETS && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-900 mb-2">Google Sheets Requirements:</h4>
                  <ul className="text-yellow-800 text-sm space-y-1">
                    <li>• Your sheet must have headers in the first row</li>
                    <li>• Required columns: Customer Name, Phone, Address, Product, Quantity</li>
                    <li>• The sheet must be accessible with your Google account</li>
                  </ul>
                </div>
              )}

              {selectedPlatform.type === PlatformType.YOUCAN && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Youcan Integration:</h4>
                  <ul className="text-blue-800 text-sm space-y-1">
                    <li>• You must be an admin or have API access to your Youcan store</li>
                    <li>• Orders will be imported automatically every 15 minutes</li>
                    <li>• Order status updates will sync back to Youcan</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={handleBack} disabled={loading}>
                Back
              </Button>
              
              <Button 
                onClick={handleConnect} 
                disabled={!connectionName.trim() || loading}
              >
                {loading ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect to {selectedPlatform.name}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}