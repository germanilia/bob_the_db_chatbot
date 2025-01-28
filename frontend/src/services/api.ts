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
  id: string;
  name: string;
  db_type: string;
  database_name: string;
  server_id: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ServerConnection {
  db_type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  alias: string;
}

export interface Conversation {
  id: number;
  name: string;
  connection_name: string;
  database_name: string;
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
  mode?: 'ask' | 'execute';
  conversation_id?: number;
  // Single query response
  query?: string;
  summary?: string;
  results?: Record<string, any>[];
  visuals?: Visualization[];
  affected_rows?: number;
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

export interface TableListResponse {
  tables: string[];
  timestamp: string;
}

export interface Server extends ServerConnection {
  id: string;
}

interface TableData {
  data: Record<string, any>[];
  columns: string[];
  timestamp: string;
}

const api = {
  getTables: (connectionName: string, databaseName: string) =>
    axios.get<TableListResponse>(`${API_URL}/tables/${connectionName}`, { 
      params: { database_name: databaseName },
      withCredentials: true 
    })
    .then(response => {
      console.log('Tables response:', response);
      return response;
    })
    .catch(error => {
      console.error('Tables error:', error);
      console.error('Request URL:', `${API_URL}/tables/${connectionName}`);
      throw error;
    }),
  
  getTableData: (connection: AIConnection, tableName: string) =>
    axios.get<TableData>(
      `${API_URL}/tables/${connection.name}/${tableName}`, { 
      params: { database_name: connection.database_name },
      withCredentials: true 
    })
    .then(response => {
      console.log('Table data response:', response);
      return response;
    })
    .catch(error => {
      console.error('Table data error:', error);
      throw error;
    }),

  executeQuery: (prompt: string, connectionName: string, conversationId: number | null, databaseName: string, mode: 'ask' | 'execute' = 'ask', tableName: string) => {
    const requestData = {
      prompt,
      connection_name: connectionName,
      conversation_id: conversationId ?? -1,
      database_name: databaseName,
      mode,
      table_name: tableName
    };
    console.log('Executing query with data:', requestData);
    
    return axios.post<QueryResult>(
      `${API_URL}/query`,
      requestData,
      {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json'
        },
        transformResponse: [...axios.defaults.transformResponse as any[], (data: any) => {
          if (!data) return data;
          
          if (data.results && Array.isArray(data.results)) {
            data.results = data.results.slice(0, 1000);
          }
          
          if (data.steps && Array.isArray(data.steps)) {
            data.steps = data.steps.map((step: any) => ({
              ...step,
              results: Array.isArray(step.results) ? step.results.slice(0, 1000) : step.results
            }));
          }
          
          return data;
        }]
      }
    )
    .then(response => {
      console.log('Query executed successfully:', response.data);
      return response;
    })
    .catch(error => {
      console.error('Error executing query:', error.response?.data || error.message);
      console.error('Failed request data:', requestData);
      console.error('Error response:', error.response?.data);
      
      // Format error response
      const errorDetail = error.response?.data?.detail;
      if (errorDetail) {
        if (Array.isArray(errorDetail)) {
          // Handle validation errors array
          const messages = errorDetail.map(err => {
            if (typeof err === 'string') return err;
            if (typeof err === 'object') {
              // Handle Pydantic validation error format
              if (err.msg) return err.msg;
              if (err.message) return err.message;
              return JSON.stringify(err);
            }
            return String(err);
          });
          error.response.data.detail = { message: messages.join('; ') };
        } else if (typeof errorDetail === 'object') {
          // Handle object error format
          if (!errorDetail.message && !errorDetail.error) {
            error.response.data.detail = { message: JSON.stringify(errorDetail) };
          }
        } else {
          // Handle string error format
          error.response.data.detail = { message: String(errorDetail) };
        }
      }
      throw error;
    });
  },

  addConversationMessage: (
    conversationId: number,
    prompt: string,
    sqlQuery: string,
    resultsSummary: string,
    resultData: any,
    connectionName?: string,
    databaseName?: string
  ) =>
    axios.post<void>(
      `${API_URL}/conversations/${conversationId}/messages`,
      {
        prompt,
        sql_query: sqlQuery,
        results_summary: resultsSummary,
        result_data: resultData,
        connection_name: connectionName,
        database_name: databaseName
      },
      { withCredentials: true }
    ),

  getConversations: (connectionName: string | null, userId: number) =>
    axios.get<Conversation[]>(
      connectionName
        ? `${API_URL}/conversations/${connectionName}?user_id=${userId}`
        : `${API_URL}/conversations?user_id=${userId}`,
      { withCredentials: true }
    ),

  createConversation: (
    name: string,
    userId: number,
    connectionName: string,
    databaseName: string
  ) => {
    console.log('Creating conversation:', { name, userId, connectionName, databaseName });
    return axios.post<Conversation>(
      `${API_URL}/conversations`,
      {
        name,
        user_id: userId,
        connection_name: connectionName,
        database_name: databaseName
      },
      { withCredentials: true }
    ).then(response => {
      console.log('Conversation created successfully:', response.data);
      return response;
    }).catch(error => {
      console.error('Error creating conversation:', error.response?.data || error.message);
      throw error;
    })
  },

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

  executeRawQuery: (sql: string, connectionName: string, databaseName: string) =>
    axios.post<QueryResult>(`${API_URL}/execute-raw-sql`, 
      { 
        sql, 
        connection_name: connectionName,
        database_name: databaseName
      },
      { withCredentials: true }
    ).then(response => {
      console.log('SQL executed successfully:', response.data);
      return response;
    }).catch(error => {
      console.error('Error executing SQL:', error.response?.data?.detail || error.message);
      throw {
        message: error.response?.data?.detail?.message || 'Error executing SQL query',
        error: error.response?.data?.detail?.error || error.message,
        query: error.response?.data?.detail?.query || sql
      };
    }),

  // Server management
  getServers: () =>
    axios.get<{ servers: Server[] }>(`${API_URL}/servers`, { withCredentials: true })
      .then(response => {
        console.log('Received servers:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error fetching servers:', error.response?.data || error.message);
        throw error;
      }),

  addServer: (server: AIConnection) =>
    axios.post<Server>(`${API_URL}/servers`, server, {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => {
        console.log('Server added successfully:', response.data);
        return response;
      })
      .catch(error => {
        console.error('Error adding server:', error.response?.data || error.message);
        throw error;
      }),

  getServerDatabases: (serverId: string) =>
    axios.get<{ databases: string[] }>(
      `${API_URL}/servers/${serverId}/databases`,
      { withCredentials: true }
    ).then(response => {
      return response;
    }).catch(error => {
      console.error('Error fetching databases:', error.response?.data || error.message);
      throw error;
    }),

 
  deleteServer: (serverId: string) =>
    axios.delete(`${API_URL}/servers/${serverId}`, { withCredentials: true })
      .then(response => {
        console.log('Server deleted successfully:', serverId);
        return response;
      })
      .catch(error => {
        console.error('Error deleting server:', error.response?.data || error.message);
        throw error;
      }),

  selectServer: (serverId: string) =>
    axios.post(`${API_URL}/servers/${serverId}/select`, null, { withCredentials: true })
      .then(response => {
        console.log('Server selected successfully:', serverId);
        return response;
      })
      .catch(error => {
        console.error('Error selecting server:', error.response?.data || error.message);
        throw error;
      }),

  manageDatabase: (serverId: string, databaseName: string, operation: 'create' | 'delete') =>
    axios.post(
      `${API_URL}/servers/${serverId}/databases`,
      null,
      { 
        params: {
          database_name: databaseName,
          operation: operation
        },
        withCredentials: true 
      }
    ).then(response => {
      console.log(`Database ${operation} successful:`, response.data);
      return response;
    }).catch(error => {
      const errorMessage = error.response?.data?.detail?.error || 
                         error.response?.data?.detail?.errors || 
                         error.response?.data?.detail ||
                         error.message;
      console.error(`Error ${operation}ing database:`, errorMessage);
      throw errorMessage;
    }),

  batchExecuteQueries: (serverName: string, databaseName: string, queries: string[]) => {
    return axios.post(
      `${API_URL}/tables/batch`,
      { 
        server_name: serverName,
        database_name: databaseName,
        sql_queries: queries
      },
      { 
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    ).then(response => {
      console.log('Batch execution response:', response);
      return response;
    }).catch(error => {
      console.error('Batch execution error:', error.response?.data?.detail?.errors);
      throw `Batch execution error: ${error.response?.data?.detail?.error ? error.response?.data?.detail?.error : error.response?.data?.detail?.errors}`;
    });
  },

};

export default api; 
