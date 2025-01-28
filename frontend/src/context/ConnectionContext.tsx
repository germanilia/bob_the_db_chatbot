import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AIConnection } from '../services/api';

interface UIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  queryResult?: {
    type: 'single';
    query: string;
    summary: string;
    results: any[];
    visuals: any[];
  };
}

export interface Conversation {
  id?: number;
  messages: UIMessage[];
  connection: AIConnection;
  database_name: string;
  created_at?: string;
}

interface ConnectionState {
  serverName: string | null;
  databaseName: string | null;
  currentConversation: Conversation | null;
  conversations: Conversation[];
  setConnection: (server: string | null, database: string | null) => void;
  setCurrentConversation: (conversation: Conversation | null | ((prev: Conversation | null) => Conversation | null)) => void;
  setConversations: (conversations: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
}

const ConnectionContext = createContext<ConnectionState>({
  serverName: null,
  databaseName: null,
  currentConversation: null,
  conversations: [],
  setConnection: () => {},
  setCurrentConversation: () => {},
  setConversations: () => {},
});

export const useConnection = () => useContext(ConnectionContext);

export const ConnectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [serverName, setServerName] = useState<string | null>(null);
  const [databaseName, setDatabaseName] = useState<string | null>(null);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const setConnection = (server: string | null, database: string | null) => {
    setServerName(server);
    setDatabaseName(database);
  };

  return (
    <ConnectionContext.Provider 
      value={{ 
        serverName, 
        databaseName, 
        currentConversation,
        conversations,
        setConnection,
        setCurrentConversation,
        setConversations,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}; 