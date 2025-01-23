import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  CircularProgress,
  MenuItem
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AIConnection } from '../services/api.ts';
import api from '../services/api.ts';

const ConnectDb = () => {
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [newConnection, setNewConnection] = useState<AIConnection>({
    name: '',
    db_type: 'postgresql',
    host: '',
    port: 5432,  // Default PostgreSQL port
    username: '',
    password: '',
    database_name: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schemas, setSchemas] = useState<Record<string, { schema_content: string }>>({});
  const [schemaLoading, setSchemaLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    // Load schemas for all connections
    connections.forEach(conn => {
      loadSchema(conn.name);
    });
  }, [connections]);

  const loadConnections = async () => {
    try {
      const response = await api.getConnections();
      setConnections(response.data);
    } catch (err) {
      setError('Failed to load connections');
    }
  };

  const loadSchema = async (connectionName: string) => {
    setSchemaLoading(prev => ({ ...prev, [connectionName]: true }));
    try {
      const response = await api.getSchema(connectionName);
      setSchemas(prev => ({ ...prev, [connectionName]: { schema_content: response.data.schema_content } }));
    } catch (err) {
      setSchemas(prev => ({ ...prev, [connectionName]: { schema_content: 'Failed to load schema' } }));
    } finally {
      setSchemaLoading(prev => ({ ...prev, [connectionName]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.addConnection(newConnection);
      await loadConnections();
      setNewConnection({ name: '', db_type: '', host: '', port: 0, username: '', password: '', database_name: '' });
      setSuccess('Connection added successfully');
    } catch (err) {
      setError('Failed to add connection');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.deleteConnection(name);
      await loadConnections();
      setSuccess('Connection deleted successfully');
    } catch (err) {
      setError('Failed to delete connection');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateSchema = async (connectionName: string) => {
    setSchemaLoading(prev => ({ ...prev, [connectionName]: true }));
    try {
      const response = await api.regenerateSchema(connectionName);
      setSchemas(prev => ({ ...prev, [connectionName]: { schema_content: response.data.schema_content } }));
      setSuccess('Schema regenerated successfully');
    } catch (err) {
      setError('Failed to regenerate schema');
    } finally {
      setSchemaLoading(prev => ({ ...prev, [connectionName]: false }));
    }
  };

  return (
    <Box sx={{ 
      height: '100%',
      backgroundColor: 'background.default',
      overflow: 'auto',
      p: 3
    }}>
      <Box sx={{ maxWidth: '1600px', margin: '0 auto' }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="h4" gutterBottom>
              Add Database Connection
            </Typography>

            <Paper sx={{ 
              p: 3, 
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '12px'
            }}>
              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  label="Connection Name"
                  value={newConnection.name}
                  onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
                  sx={{ mb: 2 }}
                  InputLabelProps={{ sx: { color: 'text.secondary' } }}
                  InputProps={{
                    sx: {
                      color: 'text.primary',
                      '& fieldset': { borderColor: 'divider' }
                    }
                  }}
                />

                <TextField
                  select
                  fullWidth
                  label="Database Type"
                  value={newConnection.db_type}
                  onChange={(e) => setNewConnection({
                    ...newConnection,
                    db_type: e.target.value,
                    port: e.target.value === 'mysql' ? 3306 : 5432  // Update port based on DB type
                  })}
                  sx={{ mb: 2 }}
                >
                  <MenuItem value="postgresql">PostgreSQL</MenuItem>
                  <MenuItem value="mysql">MySQL</MenuItem>
                </TextField>

                <TextField
                  fullWidth
                  label="Host"
                  value={newConnection.host}
                  onChange={(e) => setNewConnection({ ...newConnection, host: e.target.value })}
                  sx={{ mb: 2 }}
                  required
                />

                <TextField
                  fullWidth
                  label="Port"
                  type="number"
                  value={newConnection.port}
                  onChange={(e) => setNewConnection({ ...newConnection, port: Number(e.target.value) })}
                  sx={{ mb: 2 }}
                  required
                />

                <TextField
                  fullWidth
                  label="Username"
                  value={newConnection.username}
                  onChange={(e) => setNewConnection({ ...newConnection, username: e.target.value })}
                  sx={{ mb: 2 }}
                  required
                />

                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={newConnection.password}
                  onChange={(e) => setNewConnection({ ...newConnection, password: e.target.value })}
                  sx={{ mb: 2 }}
                  required
                />

                <TextField
                  fullWidth
                  label="Database Name"
                  value={newConnection.database_name}
                  onChange={(e) => setNewConnection({ ...newConnection, database_name: e.target.value })}
                  sx={{ mb: 2 }}
                  required
                />

                <Button
                  variant="contained"
                  color="primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={24} /> : 'Add Connection'}
                </Button>
              </form>
            </Paper>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="h4" gutterBottom>
              Existing Connections
            </Typography>

            <Paper>
              <List>
                {connections.map((connection) => (
                  <React.Fragment key={connection.name}>
                    <ListItem sx={{
                      backgroundColor: 'background.paper',
                      borderRadius: '8px',
                      mb: 1,
                      transition: '0.2s',
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}>
                      <ListItemText 
                        primary={connection.name}
                        secondary={
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="textSecondary">
                              Schema:
                            </Typography>
                            <pre style={{ 
                              whiteSpace: 'pre-wrap', 
                              wordBreak: 'break-word',
                              backgroundColor: 'background.default',
                              color: 'text.primary',
                              padding: '8px',
                              borderRadius: '6px',
                              maxHeight: '200px',
                              overflow: 'auto',
                              fontSize: '0.8rem',
                              border: '1px solid',
                              borderColor: 'divider'
                            }}>
                              {schemaLoading[connection.name] ? 
                                'Loading...' : 
                                schemas[connection.name]?.schema_content || 'No schema available'}
                            </pre>
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => handleRegenerateSchema(connection.name)}
                          disabled={schemaLoading[connection.name]}
                          sx={{ mr: 1 }}
                        >
                          <RefreshIcon />
                        </IconButton>
                        <IconButton
                          edge="end"
                          onClick={() => handleDelete(connection.name)}
                          disabled={loading}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </Paper>

            {connections.length === 0 && (
              <Typography color="textSecondary" sx={{ mt: 2 }}>
                No connections found
              </Typography>
            )}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default ConnectDb; 
