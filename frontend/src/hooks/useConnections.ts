import { useState, useEffect } from 'react';
import api from '../services/api';
import { AIConnection } from '../services/api';

export const useConnections = () => {
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        setLoading(true);
        const response = await api.getConnections();
        setConnections(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to load database connections');
        console.error('Error loading connections:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConnections();
  }, []);

  return { connections, loading, error };
}; 