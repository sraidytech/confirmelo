'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function DebugSessionsPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testApiCall = async (endpoint: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let response;
      switch (endpoint) {
        case 'sessions':
          response = await api.getSessions(false);
          break;
        case 'stats':
          response = await api.getSessionStats();
          break;
        case 'activity':
          response = await api.getSessionActivity();
          break;
        case 'me':
          response = await api.getCurrentUser();
          break;
        default:
          throw new Error('Unknown endpoint');
      }
      
      console.log(`${endpoint} response:`, response);
      setResult(response);
    } catch (err: any) {
      console.error(`${endpoint} error:`, err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Debug Sessions API</h1>
      
      <div className="space-y-4">
        <div className="flex gap-4">
          <button 
            onClick={() => testApiCall('me')}
            className="px-4 py-2 bg-blue-500 text-white rounded"
            disabled={loading}
          >
            Test /auth/me
          </button>
          <button 
            onClick={() => testApiCall('sessions')}
            className="px-4 py-2 bg-green-500 text-white rounded"
            disabled={loading}
          >
            Test Sessions
          </button>
          <button 
            onClick={() => testApiCall('stats')}
            className="px-4 py-2 bg-yellow-500 text-white rounded"
            disabled={loading}
          >
            Test Stats
          </button>
          <button 
            onClick={() => testApiCall('activity')}
            className="px-4 py-2 bg-purple-500 text-white rounded"
            disabled={loading}
          >
            Test Activity
          </button>
        </div>

        {loading && <div>Loading...</div>}
        
        {error && (
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {result && (
          <div className="p-4 bg-green-100 border border-green-400 rounded">
            <strong>Result:</strong>
            <pre className="mt-2 text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}