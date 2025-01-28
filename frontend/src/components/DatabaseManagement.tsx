import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Alert, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import api from '../services/api';

interface DatabaseManagementProps {
  serverId: string;
  onDatabaseChange: () => void;
  selectedDatabase: string;
}

export const DatabaseManagement: React.FC<DatabaseManagementProps> = ({ 
  serverId, 
  onDatabaseChange,
  selectedDatabase 
}) => {
  const [newDbName, setNewDbName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleCreateDatabase = async () => {
    try {
      setError(null);
      setSuccess(null);
      await api.manageDatabase(serverId, newDbName, 'create');
      setSuccess(`Database ${newDbName} created successfully`);
      setNewDbName('');
      setCreateDialogOpen(false);
      onDatabaseChange();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create database');
    }
  };

  const handleDeleteDatabase = async () => {
    try {
      setError(null);
      await api.manageDatabase(serverId, selectedDatabase, 'delete');
      setSuccess(`Database ${selectedDatabase} deleted successfully`);
      setDeleteDialogOpen(false);
      onDatabaseChange();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete database');
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            setError(null);
            setSuccess(null);
            setCreateDialogOpen(true);
          }}
        >
          Create DB
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={!selectedDatabase || selectedDatabase === ''}
        >
          Delete DB
        </Button>
      </Box>

      {/* Create Database Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      >
        <DialogTitle>Create New Database</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <TextField
              autoFocus
              label="Database Name"
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              fullWidth
            />
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateDatabase}
            variant="contained"
            color="primary"
            disabled={!newDbName}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Database Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Database</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete database "{selectedDatabase}"?
            This action cannot be undone!
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteDatabase}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      {success && (
        <Alert 
          severity="success" 
          sx={{ 
            position: 'fixed', 
            bottom: 24, 
            left: '50%', 
            transform: 'translateX(-50%)',
            zIndex: 9999 
          }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}
    </>
  );
};
