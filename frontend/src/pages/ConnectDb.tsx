import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Alert,
  CircularProgress,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { AIConnection, ServerConnection, Server } from '../services/api.ts';
import api from '../services/api.ts';
import { useConnection } from '../context/ConnectionContext';

const ConnectDb = () => {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{open: boolean; server: Server | null}>({
    open: false,
    server: null
  });
  const [newServer, setNewServer] = useState<AIConnection>({
    db_type: 'postgresql',
    host: '',
    port: 5432,
    username: '',
    password: '',
    alias: '',
    database_name: '',
    server_id: '',
    name: '',
    id: ''
  });
  const { setConnection } = useConnection();

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      const response = await api.getServers();
      setServers(response.data.servers);
    } catch (err) {
      setError('Failed to load servers');
    }
  };

  const handleServerSelect = async (server: Server) => {
    try {
      setLoading(true);
      await api.selectServer(server.id);
      setSelectedServer(server);
      localStorage.setItem('selectedServer', JSON.stringify(server));
      setConnection(server.alias, null);
      setSuccess(`Connected to ${server.host}`);
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAddServer = async () => {
    setLoading(true);
    setError('');
    
    try {
      const serverToAdd = {
        ...newServer,
        name: newServer.alias
      };
      
      const response = await api.addServer(serverToAdd);
      const newServerData = response.data;
      
      // Select the newly added server
      await api.selectServer(newServerData.id);
      
      setServers(prevServers => [...prevServers, newServerData]);
      setSelectedServer(newServerData);
      localStorage.setItem('selectedServer', JSON.stringify(newServerData));
      
      setShowAddDialog(false);
      setNewServer({
        db_type: 'postgresql',
        host: '',
        port: 5432,
        username: '',
        password: '',
        alias: '',
        id: '',
        name: '',
        database_name: '',
        server_id: ''
      });
      setSuccess('Server added and connected successfully');
    } catch (err) {
      setError('Failed to add server');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (server: Server, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmation({ open: true, server });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.server) return;
    
    setLoading(true);
    setError('');
    
    try {
      await api.deleteServer(deleteConfirmation.server.id);
      await loadServers();
      if (selectedServer?.id === deleteConfirmation.server.id) {
        setSelectedServer(null);
        localStorage.removeItem('selectedServer');
      }
      setSuccess('Server deleted successfully');
    } catch (err) {
      setError('Failed to delete server');
    } finally {
      setLoading(false);
      setDeleteConfirmation({ open: false, server: null });
    }
  };

  return (
    <Box sx={{ 
      height: '100%',
      backgroundColor: 'background.default',
      overflow: 'auto',
      p: 3
    }}>
      <Box sx={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">
            Database Servers
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowAddDialog(true)}
          >
            Add Server
          </Button>
        </Box>

        <Grid container spacing={3}>
          {servers.map((server) => (
            <Grid item xs={12} sm={6} md={4} key={server.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.02)',
                  },
                  border: selectedServer?.id === server.id ? '2px solid primary.main' : 'none'
                }}
                onClick={() => handleServerSelect(server)}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <Typography variant="h6" gutterBottom>
                        {server.alias}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {server.db_type === 'postgresql' ? 'PostgreSQL' : 'MySQL'} - {server.host}:{server.port}
                      </Typography>
                    </div>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => handleDeleteClick(server, e)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Username: {server.username}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button 
                    size="small" 
                    color="primary"
                    variant={selectedServer?.id === server.id ? "contained" : "outlined"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleServerSelect(server);
                    }}
                  >
                    {selectedServer?.id === server.id ? 'Connected' : 'Connect'}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {servers.length === 0 && !loading && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            No servers configured. Please add a server configuration.
          </Typography>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Add Server Dialog */}
        <Dialog 
          open={showAddDialog} 
          onClose={() => setShowAddDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Add New Server
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  select
                  fullWidth
                  label="Database Type"
                  value={newServer.db_type}
                  onChange={(e) => setNewServer({
                    ...newServer,
                    db_type: e.target.value,
                    port: e.target.value === 'mysql' ? 3306 : 5432
                  })}
                >
                  <MenuItem value="postgresql">PostgreSQL</MenuItem>
                  <MenuItem value="mysql">MySQL</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Host"
                  value={newServer.host}
                  onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Port"
                  type="number"
                  value={newServer.port}
                  onChange={(e) => setNewServer({ ...newServer, port: Number(e.target.value) })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Username"
                  value={newServer.username}
                  onChange={(e) => setNewServer({ ...newServer, username: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={newServer.password}
                  onChange={(e) => setNewServer({ ...newServer, password: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Server Name/Alias"
                  value={newServer.alias}
                  onChange={(e) => setNewServer({ ...newServer, alias: e.target.value })}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Database Name"
                  value={newServer.database_name}
                  onChange={(e) => setNewServer({ ...newServer, database_name: e.target.value })}
                  required
                  helperText="The name of the default database to connect to"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddServer}
              variant="contained"
              disabled={loading || !newServer.host || !newServer.username || !newServer.password || !newServer.alias || !newServer.database_name}
            >
              Add Server
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteConfirmation.open}
          onClose={() => setDeleteConfirmation({ open: false, server: null })}
        >
          <DialogTitle>Confirm Delete</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete the server "{deleteConfirmation.server?.alias}"? 
              This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={() => setDeleteConfirmation({ open: false, server: null })}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteConfirm} 
              color="error" 
              variant="contained"
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}
      </Box>
    </Box>
  );
};

export default ConnectDb; 
