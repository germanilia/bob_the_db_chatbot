import { useState, useCallback, useEffect } from 'react';
import { useConnection } from '../context/ConnectionContext';
import api, { AIConnection } from '../services/api';

interface RefreshCallbacks {
  onTableRefresh?: () => void;
  onDatabaseRefresh?: () => void;
}

const DEFAULT_USER_ID = 1; // This matches the auto-created user in the backend

export const useChat = ({ onTableRefresh, onDatabaseRefresh }: RefreshCallbacks = {}) => {
  const { serverName, databaseName, setCurrentConversation, setConversations } = useConnection();
  const [loading, setLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);

  const loadConversationHistory = useCallback(async (connectionId: string) => {
    if (!connectionId) return [];
    
    try {
      setLoading(true);
      const conversationsResponse = await api.getConversations(connectionId, DEFAULT_USER_ID);
      // Sort conversations by timestamp, newest first
      const sortedConversations = conversationsResponse.data.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Map each conversation to our UI format
      const uiConversations = sortedConversations.map(conv => ({
        id: conv.id,
        messages: conv.messages.map((msg: any) => {
          const baseMessage = {
            timestamp: new Date(msg.timestamp),
          };

          // Create user message
          const userMessage = {
            ...baseMessage,
            role: 'user' as const,
            content: msg.prompt,
          };

          // Create assistant message if there's a response
          const assistantMessage = msg.result_data ? {
            ...baseMessage,
            role: 'assistant' as const,
            content: msg.results_summary,
            queryResult: {
              type: 'single' as const,
              query: msg.result_data.query,
              summary: msg.result_data.summary,
              results: msg.result_data.results,
              visuals: msg.result_data.visuals,
            }
          } : null;

          // Return array of messages
          return assistantMessage ? [userMessage, assistantMessage] : [userMessage];
        }).flat(), // Flatten the array of message pairs
        connection: { name: connectionId } as AIConnection,
        database_name: conv.database_name,
        created_at: conv.created_at
      }));

      // Set the current conversation ID to the most recent one if no current conversation is selected
      if (uiConversations.length > 0 && !currentConversationId) {
        setCurrentConversationId(uiConversations[0].id);
      }

      return uiConversations;
    } catch (error) {
      console.error('Error loading conversation history:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [currentConversationId]);

  const startNewConversation = useCallback((conversationId?: number) => {
    console.log('Starting new conversation with ID:', conversationId);
    setCurrentConversationId(conversationId || null);
    setLoading(false);
  }, []);

  const selectConversation = useCallback((conversationId: number) => {
    setCurrentConversationId(conversationId);
  }, []);

  // Add refresh callback
  const refreshData = useCallback(async () => {
    if (!serverName || !databaseName) return;
    
    try {
      // Refresh conversations
      const conversationsResponse = await api.getConversations(serverName, DEFAULT_USER_ID);
      const sortedConversations = conversationsResponse.data.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Map conversations to UI format
      const uiConversations = sortedConversations.map(conv => ({
        id: conv.id,
        messages: conv.messages.map((msg: any) => {
          const baseMessage = {
            timestamp: new Date(msg.timestamp),
          };

          const userMessage = {
            ...baseMessage,
            role: 'user' as const,
            content: msg.prompt,
          };

          const assistantMessage = msg.result_data ? {
            ...baseMessage,
            role: 'assistant' as const,
            content: msg.results_summary,
            queryResult: {
              type: 'single' as const,
              query: msg.result_data.query,
              summary: msg.result_data.summary,
              results: msg.result_data.results,
              visuals: msg.result_data.visuals,
            }
          } : null;

          return assistantMessage ? [userMessage, assistantMessage] : [userMessage];
        }).flat(),
        connection: { name: serverName } as AIConnection,
        database_name: conv.database_name,
        created_at: conv.created_at
      }));

      setConversations(uiConversations);

      // Update current conversation if it exists
      if (currentConversationId) {
        const currentConv = uiConversations.find(conv => conv.id === currentConversationId);
        if (currentConv) {
          setCurrentConversation(currentConv);
        }
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [serverName, databaseName, currentConversationId, setConversations, setCurrentConversation]);

  const sendMessage = useCallback(async (
    serverName: string | null,
    prompt: string,
    databaseName: string | null,
    mode: 'ask' | 'execute' = 'ask',
    tableName: string
  ) => {
    if (!serverName || !databaseName) {
      throw new Error('Server name and database name are required');
    }

    setLoading(true);
    try {
      const response = await api.executeQuery(
        prompt,
        serverName,
        currentConversationId,
        databaseName,
        mode,
        tableName
      );
      const data = response.data;
      
      const conversationId = data.conversation_id;
      if (conversationId) {
        console.log('Received conversation ID:', conversationId);
        setCurrentConversationId(conversationId);
      }

      // Force refresh after query execution
      await refreshData();
      
      if (mode === 'execute' || prompt.startsWith('[SQL]')) {
        // Trigger refreshes but preserve the selected table
        if (onTableRefresh) {
          // We need to ensure the table selection is maintained
          // by letting the refresh complete before any state updates
          await new Promise(resolve => {
            onTableRefresh();
            setTimeout(resolve, 100);
          });
        }
        if (onDatabaseRefresh) {
          await new Promise(resolve => {
            onDatabaseRefresh();
            setTimeout(resolve, 100);
          });
        }
      }

      return {
        role: 'assistant' as const,
        content: data.summary || '',
        timestamp: new Date(),
        queryResult: {
          type: 'single' as const,
          query: data.query || '',
          summary: data.summary || '',
          results: data.results || [],
          visuals: data.visuals || [],
          conversation_id: conversationId
        }
      };
    } catch (error: any) {
      console.error('Error sending message:', error);
      console.error('Error response data:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Current conversation ID:', currentConversationId);
      
      // Extract error message from the error object, handling structured error responses
      let errorMessage = 'An error occurred while sending the message';
      
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        console.error('Error detail:', detail);
        if (typeof detail === 'object') {
          errorMessage = detail.message || detail.error || JSON.stringify(detail);
        } else {
          errorMessage = String(detail);
        }
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Clean up error message if it's a validation error
      if (error.response?.status === 422) {
        errorMessage = errorMessage.replace(/^validation error/i, '').trim();
        errorMessage = errorMessage.replace(/^for/i, '').trim();
      }
      
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentConversationId, refreshData, onTableRefresh, onDatabaseRefresh]);

  useEffect(() => {
    let mounted = true;
    
    if (serverName) {
      const loadHistory = async () => {
        try {
          const conversations = await loadConversationHistory(serverName);
          if (!mounted) return;
          setConversations(conversations);
        } catch (error) {
          console.error('Error loading chat history:', error);
        }
      };

      loadHistory();
    }
    
    return () => {
      mounted = false;
    };
  }, [serverName, setConversations, loadConversationHistory]);

  return {
    loading,
    sendMessage,
    startNewConversation,
    selectConversation,
    loadConversationHistory,
    currentConversationId
  };
}; 
