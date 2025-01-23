import axios from 'axios';

declare global {
  interface ImportMetaEnv {
    VITE_API_BASE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const API_URL = import.meta.env.VITE_API_BASE_URL;

export interface AIConnection {
  name: string;
  db_type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database_name: string;
}

export interface Conversation {
  id: number;
  name: string;
  connection_name: string; // Add this field
  created_at: string;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: number;
  prompt: string;
  sql_query: string;
  results_summary: string;
  timestamp: string;
  result_data?: {
    query: string;
    summary: string;
    results: Record<string, any>[];
    visuals: Visualization[];
  };
}

export interface QueryResult {
  type: 'single' | 'multi';
  // Single query response
  query?: string;
  summary?: string;
  results?: Record<string, any>[];
  visuals?: Visualization[];
  // Multi query response
  steps?: Array<{
    prompt: string;
    query: string;
    results: Record<string, any>[];
    summary: string;
  }>;
  error?: string;
  failed_step?: string;
}

export interface Visualization {
  type: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'scatter_plot';
  title: string;
  labels?: string[];
  datasets?: Array<{
    label: string;
    data: number[];
    backgroundColor?: string[];
  }>;
  x_axis?: string;
  y_axis?: string;
  color_scheme?: string;
}

export interface SchemaResponse {
  schema_content: string;
  timestamp: string;
}

const api = {
  // Connections
  getConnections: () => 
    axios.get<AIConnection[]>(`${API_URL}/connections`, { withCredentials: true })
      .then(response => {
        console.log('Received connections:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error fetching connections:', error.response?.data || error.message);
        throw error;
      }),
  
  addConnection: (connection: AIConnection) =>
    axios.post(`${API_URL}/connections`, connection, { 
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => {
        console.log('Connection added successfully:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error adding connection:', error.response?.data || error.message);
        throw error;
      }),
    
  deleteConnection: (name: string) =>
    axios.delete(`${API_URL}/connections/${name}`, { withCredentials: true })
      .then(response => {
        console.log('Connection deleted successfully:', name);
        return response;
      })
      .catch(error => {
        console.error('Error deleting connection:', error.response?.data || error.message);
        throw error;
      }),

  // Schema methods
  regenerateSchema: (connectionName: string) =>
    axios.post<SchemaResponse>(
      `${API_URL}/connections/${connectionName}/schema/regenerate`,
      null,
      {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
      .then(response => {
        console.log('Schema regenerated successfully:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error regenerating schema:', error.response?.data || error.message);
        throw error;
      }),
    
  getSchema: (connectionName: string) =>
    axios.get<SchemaResponse>(`${API_URL}/connections/${connectionName}/schema`)
      .then(response => {
        console.log('Schema retrieved successfully:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error getting schema:', error.response?.data || error.message);
        throw error;
      }),

  // Queries
  executeQuery: (prompt: string, connectionName: string, conversationId: number) =>
    axios.post<QueryResult>(`${API_URL}/query`, 
    { 
      prompt: prompt,
      connection_name: connectionName,
      conversation_id: conversationId 
    }, 
    {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => {
        console.log('Query executed successfully:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error executing query:', error.response?.data || error.message);
        throw error;
      }),

  // Conversations
  createConversation: (name: string, userId: number, connectionName: string) =>
    axios.post<Conversation>(`${API_URL}/conversations`, { 
      name, 
      user_id: userId,
      connection_name: connectionName
    }, { 
      withCredentials: true 
    }),
    
  getConversations: (connectionName: string | null, userId: number) =>
    axios.get<Conversation[]>(
      connectionName 
        ? `${API_URL}/conversations/${connectionName}?user_id=${userId}`
        : `${API_URL}/conversations?user_id=${userId}`, 
      { withCredentials: true }
    ),

  deleteConversation: (conversationId: number) =>
    axios.delete(`${API_URL}/conversations/${conversationId}`, { 
      withCredentials: true 
    })
      .then(response => {
        console.log('Conversation deleted successfully:', conversationId);
        return response;
      })
      .catch(error => {
        console.error('Error deleting conversation:', error.response?.data || error.message);
        throw error;
      }),
};

export default api; 
