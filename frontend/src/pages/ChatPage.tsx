import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  SelectChangeEvent,
  TextField,
  Alert,
} from '@mui/material';
import { useConnection } from '../context/ConnectionContext';
import { Chat } from '../components/Chat';
import api, { Server, AIConnection } from '../services/api';

export const ChatPage: React.FC = () => {
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const { setConnection } = useConnection();

  useEffect(() => {
    // Load selected server from localStorage
    const savedServer = localStorage.getItem('selectedServer');
    if (savedServer) {
      const server = JSON.parse(savedServer);
      setSelectedServer(server);
      loadDatabases(server);
    }
  }, []);

  const loadDatabases = async (server: Server) => {
    setLoading(true);
    setError('');
    try {
      await api.selectServer(server.id);
      const response = await api.getServerDatabases(server.id);
      setDatabases(response.data.databases);
    } catch (err) {
      setError('Failed to load databases');
      console.error('Error loading databases:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTables = async () => {
    if (!selectedDatabase || !selectedServer) return;
    
    setLoading(true);
    setError('');
    try {
      const response = await api.getTables(selectedServer.alias, selectedDatabase);
      setTables(response.data.tables);
      setSelectedTable('');
    } catch (err) {
      setError('Failed to load tables');
      console.error('Error loading tables:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDatabase) {
      loadTables();
    } else {
      // Clear tables when database is deselected
      setTables([]);
      setSelectedTable('');
    }
  }, [selectedDatabase]);

  const handleDatabaseSelect = (event: SelectChangeEvent) => {
    const dbName = event.target.value;
    setSelectedDatabase(dbName);
    if (selectedServer) {
      setConnection(selectedServer.alias, dbName);
    }
  };

  const handleTableSelect = async (event: SelectChangeEvent) => {
    const tableName = event.target.value;
    setSelectedTable(tableName);
    
    if (tableName && selectedServer && selectedDatabase) {
      setLoading(true);
      setError('');
      try {
        // Get table data
        await api.getTableData({
          ...selectedServer,
          name: selectedServer.alias,
          database_name: selectedDatabase
        } as AIConnection, tableName);

        // Refresh tables list
        const tablesResponse = await api.getTables(selectedServer.alias, selectedDatabase);
        setTables(tablesResponse.data.tables);
      } catch (err) {
        setError('Failed to load table data');
        console.error('Error loading table data:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!selectedServer) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          Please select a server from the Connections page first.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Database Chat
        </Typography>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="database-select-label">Database</InputLabel>
            <Select
              labelId="database-select-label"
              id="database-select"
              value={selectedDatabase}
              label="Database"
              onChange={handleDatabaseSelect}
            >
              {databases.map((db) => (
                <MenuItem key={db} value={db}>
                  {db}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedDatabase && (
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel id="table-select-label">Table</InputLabel>
              <Select
                labelId="table-select-label"
                id="table-select"
                value={selectedTable}
                label="Table"
                onChange={handleTableSelect}
              >
                {tables.map((table) => (
                  <MenuItem key={table} value={table}>
                    {table}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Paper>

      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <Chat 
          displayMode="embedded"
          isExpanded={true}
          onToggleExpand={() => setShowHistory(!showHistory)}
          showHistory={showHistory}
          variant="full"
        />
      </Box>
    </Box>
  );
}; 