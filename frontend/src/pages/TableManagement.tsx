import React, { useState, useEffect, useCallback } from 'react';
import { DatabaseManagement } from '../components/DatabaseManagement';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Paper,
  Grid,
  MenuItem,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import {
  DataGrid,
  GridRowsProp,
  GridColDef,
  GridRowModesModel,
  GridRowModes,
  GridToolbarContainer,
  GridToolbar,
  GridActionsCellItem,
  GridEventListener,
  GridRowId,
  GridRowModel,
  GridRowEditStopReasons,
  GridRowSelectionModel,
  GridPaginationModel,
} from '@mui/x-data-grid';
import api, { AIConnection, Server } from '../services/api';
import { useConnection } from '../context/ConnectionContext';
import { Chat } from '../components/Chat';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Constants
const CELL_CONTENT_MIN_LENGTH = 20;
const DIALOG_MIN_ROWS = 4;
const DIALOG_MAX_ROWS = 20;

// Add new interfaces for pending changes
interface PendingChange {
  type: 'update' | 'delete';
  rowId: number;
  originalValues?: any;
  newValues?: any;
}

// Add new interfaces for action logging
interface TableAction {
  type: 'update' | 'delete';
  timestamp: string;
  table: string;
  database: string;
  rowId: number;
  sql_query: string;
  originalValues?: any;
  newValues?: any;
}

// Add new interface for deleted rows tracking
interface DeletedRows {
  [key: string]: Set<number>; // key is "database:table", value is set of row IDs
}

// Add SQL data types
const SQL_TYPES = [
  'INTEGER',
  'BIGINT',
  'DECIMAL',
  'NUMERIC',
  'REAL',
  'DOUBLE PRECISION',
  'SMALLINT',
  'VARCHAR',
  'CHAR',
  'TEXT',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'BOOLEAN',
  'JSON',
  'JSONB',
  'UUID'
];

export const TableManagement: React.FC = () => {
  // Group all useState hooks together at the top
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [editTable, setEditTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<GridColDef[]>([]);
  const [rowModesModel, setRowModesModel] = useState<GridRowModesModel>({});
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [newTableColumns, setNewTableColumns] = useState([{
    name: '',
    type: '',
    isPK: false,
    isFK: false,
    referencedTable: '',
    referencedColumn: ''
  }]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<any>(null);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    pageSize: 5,
    page: 0,
  });
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [pendingChanges, setPendingChanges] = useState<Map<number, PendingChange>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [actionLog, setActionLog] = useState<TableAction[]>([]);
  const [cellDialog, setCellDialog] = useState<{
    open: boolean;
    content: any;
    title: string;
    isEditing: boolean;
    originalContent: any;
    row: any;
  }>({
    open: false,
    content: null,
    title: '',
    isEditing: false,
    originalContent: null,
    row: null
  });
  const [deletedRows, setDeletedRows] = useState<DeletedRows>({});
  const [addRowDialogOpen, setAddRowDialogOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<any>({});
  const [dropTableDialogOpen, setDropTableDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [isForceDelete, setIsForceDelete] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastQueryTime, setLastQueryTime] = useState<Date | null>(null);

  const { setConnection } = useConnection();

  // Group all callbacks together using useCallback
  const handleProcessRowUpdateError = useCallback((error: Error) => {
    setError(error.message);
  }, []);

  const loadDatabases = useCallback(async (server: Server) => {
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
  }, []);

  const loadTables = useCallback(async () => {
    if (!selectedDatabase || !selectedServer) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.getTables(selectedServer.alias, selectedDatabase);
      setTables(response.data.tables);
      // Only reset selected table if it doesn't exist in the new tables list
      if (selectedTable && !response.data.tables.includes(selectedTable)) {
        setSelectedTable('');
        setTableData([]);
      }
    } catch (err) {
      setError('Failed to load tables');
      console.error('Error loading tables:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDatabase, selectedServer, selectedTable]);

  const loadTableData = useCallback(async () => {
    if (!selectedDatabase || !selectedTable || !selectedServer) return;
    setLoading(true);
    setError('');
    try {
      const connection: AIConnection = {
        ...selectedServer,
        database_name: selectedDatabase,
        name: selectedServer.alias,
        server_id: selectedServer.id
      };

      const response = await api.getTableData(connection, selectedTable);
      const contextKey = `${selectedDatabase}:${selectedTable}`;
      const deletedRowIds = deletedRows[contextKey] || new Set();

      const data = response.data.data
        .map((row: any, index: number) => ({
          ...row,
          id: index,
        }))
        .filter(row => !deletedRowIds.has(row.id));

      // Set columns from the API response
      const cols: GridColDef[] = response.data.columns
        .filter(key => key && typeof key === 'string') // Filter out any undefined or invalid columns
        .map(key => ({
          field: key,
          headerName: key,
          flex: 1,
          minWidth: 100,
          editable: key !== 'id',
          renderCell: (params) => {
            const value = params.value;
            const displayValue = value === null
              ? 'NULL'
              : isClickableContent(value)
                ? '(Click to view)'
                : String(value);

            return (
              <Box
                sx={{
                  cursor: isClickableContent(value) ? 'pointer' : 'default',
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                onClick={() => isClickableContent(value) && handleCellClick(value, params.field, params.row)}
              >
                {displayValue}
              </Box>
            );
          }
        }));

      setColumns(cols);
      setTableData(data);
      setRowSelectionModel([]);
    } catch (err) {
      setError('Failed to load table data');
      console.error('Error loading table data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDatabase, selectedTable, selectedServer, deletedRows]);

  // Group all useEffect hooks together
  useEffect(() => {
    const savedServer = localStorage.getItem('selectedServer');
    if (savedServer) {
      const server = JSON.parse(savedServer);
      setSelectedServer(server);
      loadDatabases(server);
    }
  }, [loadDatabases]);

  useEffect(() => {
    if (selectedDatabase) {
      loadTables();
    }
  }, [selectedDatabase, loadTables, refreshTrigger]);

  useEffect(() => {
    if (selectedTable) {
      loadTableData();
    }
  }, [selectedTable, loadTableData, refreshTrigger]);

  useEffect(() => {
    setRowSelectionModel([]);
  }, [selectedDatabase, selectedTable, paginationModel.page, paginationModel.pageSize]);

  // Group all callbacks together
  const handleCopyContent = () => {
    const content = typeof cellDialog.content === 'object'
      ? JSON.stringify(cellDialog.content, null, 2)
      : String(cellDialog.content);
    navigator.clipboard.writeText(content);
  };

  // Function to handle saving edited content
  const handleSaveContent = async () => {
    try {
      let parsedContent = cellDialog.content;

      // If it's a JSON string, try to parse it
      if (typeof cellDialog.content === 'string' && cellDialog.content.trim().startsWith('{')) {
        try {
          parsedContent = JSON.parse(cellDialog.content);
        } catch (e) {
          setError('Invalid JSON format');
          return;
        }
      }

      // Create update data
      const newValues = {
        [cellDialog.title]: parsedContent
      };

      const originalValues = {
        [cellDialog.title]: cellDialog.originalContent
      };

      // Generate SQL query
      const sql_query = generateUpdateSql(selectedTable, newValues, originalValues);

      // Log the update action
      logAction({
        type: 'update',
        table: selectedTable,
        database: selectedDatabase,
        rowId: cellDialog.row.id,
        sql_query,
        originalValues,
        newValues
      });

      // Update UI immediately
      setTableData(prev => prev.map(row =>
        row.id === cellDialog.row.id
          ? { ...row, [cellDialog.title]: parsedContent }
          : row
      ));

      setHasUnsavedChanges(true);

      // Close dialog
      setCellDialog(prev => ({
        ...prev,
        open: false,
        isEditing: false
      }));
    } catch (err) {
      console.error('Error saving content:', err);
      setError('Failed to save changes');
    }
  };

  // Function to check if content should be clickable
  const isClickableContent = (value: any): boolean => {
    if (value === null) return false;
    if (typeof value === 'object') return true;
    return typeof value === 'string' && value.length > CELL_CONTENT_MIN_LENGTH;
  };

  // Function to format cell content for display
  const formatCellContent = (value: any): string => {
    if (value === null) return 'NULL';
    if (typeof value === 'object') {
      try {
        // If it's a stringified JSON, parse it first
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return JSON.stringify(parsed, null, 2);
      } catch {
        return JSON.stringify(value, null, 2);
      }
    }
    return String(value);
  };

  // Function to handle cell click
  const handleCellClick = (content: any, columnName: string, row: any) => {
    const formattedContent = typeof content === 'string' && content.length > 20
      ? content
      : typeof content === 'object'
        ? content
        : null;

    if (formattedContent !== null) {
      setCellDialog({
        open: true,
        content: typeof formattedContent === 'object'
          ? JSON.stringify(formattedContent, null, 2)
          : formattedContent,
        title: columnName,
        isEditing: false,
        originalContent: content,
        row: row
      });
    }
  };

  // Function to render content in dialog
  const renderDialogContent = () => {
    if (cellDialog.isEditing) {
      return (
        <TextField
          multiline
          fullWidth
          minRows={DIALOG_MIN_ROWS}
          maxRows={DIALOG_MAX_ROWS}
          value={cellDialog.content}
          onChange={(e) => setCellDialog(prev => ({ ...prev, content: e.target.value }))}
          InputProps={{
            sx: {
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }
          }}
        />
      );
    }

    try {
      // Try to parse as JSON if it looks like JSON
      if (typeof cellDialog.content === 'string' &&
        (cellDialog.content.trim().startsWith('{') || cellDialog.content.trim().startsWith('['))) {
        const parsed = JSON.parse(cellDialog.content);
        return (
          <SyntaxHighlighter
            language="json"
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              borderRadius: '4px',
              maxHeight: '60vh',
            }}
          >
            {JSON.stringify(parsed, null, 2)}
          </SyntaxHighlighter>
        );
      }
    } catch {
      // If not valid JSON, fall back to text display
    }

    // Regular text display
    return (
      <TextField
        multiline
        fullWidth
        minRows={DIALOG_MIN_ROWS}
        maxRows={DIALOG_MAX_ROWS}
        value={cellDialog.content}
        InputProps={{
          readOnly: true,
          sx: {
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }
        }}
      />
    );
  };

  // Add function to log actions
  const logAction = (action: Omit<TableAction, 'timestamp'>) => {
    setActionLog(prev => [...prev, {
      ...action,
      timestamp: new Date().toISOString()
    }]);
  };

  // Add custom toolbar component
  const CustomToolbar = () => {
    return (
      <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
        <GridToolbarContainer>
          <GridToolbar />
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddRow}
            sx={{
              color: 'primary.main',
              minWidth: 'auto',
              textTransform: 'none'
            }}
          >
            Add Row
          </Button>
          {hasUnsavedChanges && (
            <>
              <Button
                size="small"
                startIcon={<SaveIcon />}
                onClick={handleSaveChanges}
                sx={{
                  color: 'primary.main',
                  minWidth: 'auto',
                  textTransform: 'none'
                }}
              >
                Save Changes
              </Button>
              <Button
                size="small"
                startIcon={<CancelIcon />}
                onClick={handleDiscardChanges}
                sx={{
                  color: 'error.main',
                  minWidth: 'auto',
                  textTransform: 'none'
                }}
              >
                Discard Changes
              </Button>
            </>
          )}
          {rowSelectionModel.length > 0 && (
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => handleBatchDelete(rowSelectionModel)}
              sx={{
                color: 'error.main',
                minWidth: 'auto',
                textTransform: 'none'
              }}
            >
              Delete Selected ({rowSelectionModel.length})
            </Button>
          )}
        </GridToolbarContainer>
      </Box>
    );
  };

  // Function to generate SQL query for updates
  const generateUpdateSql = (tableName: string, newValues: any, originalValues: any) => {
    // Handle SET clause
    const setClause = Object.entries(newValues)
      .map(([key, value]) => {
        if (value === null) {
          return `${key} = NULL`;
        }
        return `${key} = ${typeof value === 'string' ? `'${value}'` : value}`;
      })
      .join(', ');

    // Handle WHERE clause with proper NULL comparisons
    const whereClause = Object.entries(originalValues)
      .filter(([key]) => key !== 'id' && key !== 'actions') // Exclude id and actions
      .map(([key, value]) => {
        if (value === null) {
          return `${key} IS NULL`;
        }
        return `${key} = ${typeof value === 'string' ? `'${value}'` : value}`;
      })
      .join(' AND ');

    return `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause};`;
  };

  // Function to generate SQL query for deletes
  const generateDeleteSql = (tableName: string, values: any) => {
    const whereConditions = Object.entries(values)
      .map(([key, value]) => {
        if (value === null) {
          return `${key} IS NULL`;
        }
        return `${key} = ${typeof value === 'string' ? `'${value}'` : value}`;
      });

    return `DELETE FROM ${tableName} WHERE ${whereConditions.join(' AND ')};`;
  };

  // Modify handleBatchDelete to generate SQL queries
  const handleBatchDelete = (selectedIds: GridRowSelectionModel) => {
    const contextKey = `${selectedDatabase}:${selectedTable}`;
    const newDeletedRows = { ...deletedRows };
    if (!newDeletedRows[contextKey]) {
      newDeletedRows[contextKey] = new Set();
    }

    selectedIds.forEach((id) => {
      const row = tableData.find(r => r.id === id);
      if (row) {
        // Add to deleted rows set
        newDeletedRows[contextKey].add(row.id);

        // Generate SQL query for deletion
        const { id: rowId, ...rowWithoutId } = row;
        const sql_query = generateDeleteSql(selectedTable, rowWithoutId);

        // Log the delete action with SQL query
        logAction({
          type: 'delete',
          table: selectedTable,
          database: selectedDatabase,
          rowId: rowId,
          sql_query,
          originalValues: rowWithoutId
        });
      }
    });

    setDeletedRows(newDeletedRows);
    setHasUnsavedChanges(true);
    setRowSelectionModel([]);

    // Update the table data immediately to reflect deletions
    setTableData(prev => prev.filter(row => !selectedIds.includes(row.id)));
  };

  // Modify processRowUpdate to use generateUpdateSql
  const processRowUpdate = async (newRow: GridRowModel, oldRow: GridRowModel) => {
    try {
      const { id: newId, actions: newActions, ...newFields } = newRow;
      const { id: oldId, actions: oldActions, ...oldFields } = oldRow;

      // Find changed fields by comparing newFields with oldFields
      const changedFields: Record<string, any> = {};
      for (const [key, value] of Object.entries(newFields)) {
        if (value !== oldFields[key]) {
          changedFields[key] = value;
        }
      }

      if (Object.keys(changedFields).length === 0) {
        return oldRow;
      }

      // Generate the SQL query using generateUpdateSql
      const sql_query = generateUpdateSql(selectedTable, changedFields, oldFields);

      // Log the update action with SQL query
      logAction({
        type: 'update',
        table: selectedTable,
        database: selectedDatabase,
        rowId: newId,
        sql_query,
        originalValues: oldFields,
        newValues: changedFields
      });

      setHasUnsavedChanges(true);
      return newRow;
    } catch (err: any) {
      console.error('Row update error:', err);
      setError(err.message || 'Failed to update row');
      throw err;
    }
  };

  // Add function to trigger refresh
  const triggerRefresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // Store current selected table
      const currentSelectedTable = selectedTable;

      // First refresh databases if we have a server
      if (selectedServer) {
        const dbResponse = await api.getServerDatabases(selectedServer.id);
        setDatabases(dbResponse.data.databases);
      }

      // Then refresh tables list if we have a database selected
      if (selectedServer && selectedDatabase) {
        const tablesResponse = await api.getTables(selectedServer.alias, selectedDatabase);
        setTables(tablesResponse.data.tables);
        
        // Only reset selected table if it doesn't exist in the new tables list
        if (currentSelectedTable && !tablesResponse.data.tables.includes(currentSelectedTable)) {
          setSelectedTable('');
        }
      }

      // Finally refresh table data if a table is selected
      if (selectedServer && selectedDatabase && currentSelectedTable) {
        const connection: AIConnection = {
          ...selectedServer,
          database_name: selectedDatabase,
          name: selectedServer.alias,
          server_id: selectedServer.id
        };
        const response = await api.getTableData(connection, currentSelectedTable);
        const contextKey = `${selectedDatabase}:${currentSelectedTable}`;
        const deletedRowIds = deletedRows[contextKey] || new Set();

        const data = response.data.data
          .map((row: any, index: number) => ({
            ...row,
            id: index,
          }))
          .filter(row => !deletedRowIds.has(row.id));

        // Set columns from the API response
        const cols: GridColDef[] = response.data.columns
          .filter(key => key && typeof key === 'string')
          .map(key => ({
            field: key,
            headerName: key,
            flex: 1,
            minWidth: 100,
            editable: key !== 'id',
            renderCell: (params) => {
              const value = params.value;
              const displayValue = value === null
                ? 'NULL'
                : isClickableContent(value)
                  ? '(Click to view)'
                  : String(value);

              return (
                <Box
                  sx={{
                    cursor: isClickableContent(value) ? 'pointer' : 'default',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  onClick={() => isClickableContent(value) && handleCellClick(value, params.field, params.row)}
                >
                  {displayValue}
                </Box>
              );
            }
          }));

        setColumns(cols);
        setTableData(data);
      }

      setLastQueryTime(new Date());
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, [selectedServer, selectedDatabase, selectedTable, deletedRows]);

  // Modify handleCreateTable to handle refresh properly
  const handleCreateTable = async () => {
    try {
      if (!selectedServer) {
        setError('No server selected');
        return;
      }

      // Build column definitions
      let columnDefs = [`id int NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY`];
      newTableColumns.forEach(col => {
        if (!col.name || !col.type) return; // Skip empty columns
        let def = `${col.name} ${col.type}`;
        if (col.isFK && col.referencedTable && col.referencedColumn) {
          def += ` REFERENCES ${col.referencedTable}(${col.referencedColumn})`;
        }
        columnDefs.push(def);
      });

      const sql_query = `CREATE TABLE ${newTableName} (\n  ${columnDefs.join(',\n  ')}\n)`;

      await api.executeRawQuery(sql_query, selectedServer.alias, selectedDatabase);
      
      // Reset form
      setOpenDialog(false);
      setNewTableName('');
      setNewTableColumns([{
        name: '',
        type: '',
        isPK: false,
        isFK: false,
        referencedTable: '',
        referencedColumn: ''
      }]);

      // Refresh data and select the new table
      await triggerRefresh();
      setSelectedTable(newTableName);
    } catch (err) {
      console.error('Error creating table:', err);
      setError(typeof err === 'string' ? err : 'Failed to create table');
    }
  };

  // Modify handleDropTableClick to handle refresh properly
  const handleDropTableClick = (tableName: string) => {
    setTableToDelete(tableName);
    setIsForceDelete(false);
    setDropTableDialogOpen(true);
  };

  // Modify handleDropTableConfirm to handle refresh properly
  const handleDropTableConfirm = async () => {
    try {
      if (!selectedServer || !tableToDelete) {
        setError('No server or table selected');
        return;
      }

      const sql_query = generateDropTableSql(tableToDelete, isForceDelete);

      // Log the drop table action
      logAction({
        type: 'delete',
        table: tableToDelete,
        database: selectedDatabase,
        rowId: -1,
        sql_query,
      });

      // Execute the DROP TABLE query
      await api.executeRawQuery(sql_query, selectedServer.alias, selectedDatabase);
      
      // Update UI state
      setTables(tables.filter(t => t !== tableToDelete));
      setSelectedTable('');
      setDropTableDialogOpen(false);
      setTableToDelete(null);
      setIsForceDelete(false);
      setHasUnsavedChanges(true);

      // Refresh data
      await triggerRefresh();
    } catch (err) {
      setError('Failed to delete table');
      console.error('Error dropping table:', err);

      // Restore table in the list if the deletion failed
      if (tableToDelete && !tables.includes(tableToDelete)) {
        setTables(prev => [...prev, tableToDelete]);
      }
    }
  };

  const generateDropTableSql = (tableName: string, force: boolean = false) => {
    if (force) {
      return `
        DO $$ 
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tc.constraint_name, tc.table_name 
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.constraint_column_usage ccu 
                   ON tc.constraint_name = ccu.constraint_name
                   WHERE tc.constraint_type = 'FOREIGN KEY' 
                   AND ccu.table_name = '${tableName}')
          LOOP
            EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name) || ';';
          END LOOP;
          DROP TABLE IF EXISTS ${tableName} CASCADE;
        END $$;`;
    }
    return `DROP TABLE IF EXISTS ${tableName};`;
  };

  const handleAddColumn = () => {
    setNewTableColumns([...newTableColumns, {
      name: '',
      type: '',
      isPK: false,
      isFK: false,
      referencedTable: '',
      referencedColumn: ''
    }]);
  };

  const handleDatabaseSelect = (event: SelectChangeEvent) => {
    const dbName = event.target.value;
    setSelectedDatabase(dbName);
    if (selectedServer) {
      setConnection(selectedServer.alias, dbName);
    }
  };

  const generateInsertSql = (tableName: string, values: any) => {
    const columns = Object.keys(values).filter(k => k !== 'id' && k !== 'actions');
    const valuesList = columns.map(col => {
      const value = values[col];
      if (value === null) return 'NULL';
      return typeof value === 'string' ? `'${value}'` : value;
    });

    return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${valuesList.join(', ')});`;
  };

  const handleAddRow = () => {
    // Initialize newRowData with empty values for all columns
    const emptyRow = columns.reduce((acc, col) => {
      if (col.field !== 'id' && col.field !== 'actions') {
        acc[col.field] = null;
      }
      return acc;
    }, {});
    setNewRowData(emptyRow);
    setAddRowDialogOpen(true);
  };

  const handleSaveNewRow = async () => {
    try {
      // Generate SQL query for insertion
      const sql_query = generateInsertSql(selectedTable, newRowData);

      // Log the insert action
      logAction({
        type: 'update',
        table: selectedTable,
        database: selectedDatabase,
        rowId: -1, // Temporary ID for new row
        sql_query,
        newValues: newRowData
      });

      // Add to table data with temporary ID
      const tempId = tableData.length > 0 ? Math.max(...tableData.map(row => row.id)) + 1 : 0;
      setTableData(prev => [...prev, { ...newRowData, id: tempId }]);

      setHasUnsavedChanges(true);
      setAddRowDialogOpen(false);
      setNewRowData({});

      // Trigger refresh
      triggerRefresh();
    } catch (err) {
      setError('Failed to add row');
    }
  };

  // Add handleDiscardChanges
  const handleDiscardChanges = () => {
    setDeletedRows({});
    setHasUnsavedChanges(false);
    setRowSelectionModel([]);
    setActionLog([]);
    loadTableData();
  };

  const handleDeleteClick = (row: any) => {
    setRowToDelete(row);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (force: boolean = false) => {
    try {
      const { id: rowId, actions: _, ...rowWithoutIdAndActions } = rowToDelete;

      // Generate SQL query for deletion
      const sql_query = generateDeleteSql(selectedTable, rowWithoutIdAndActions);

      // Log the delete action with SQL query
      logAction({
        type: 'delete',
        table: selectedTable,
        database: selectedDatabase,
        rowId: rowId,
        sql_query,
        originalValues: rowWithoutIdAndActions
      });

      // Add to deleted rows
      const contextKey = `${selectedDatabase}:${selectedTable}`;
      const newDeletedRows = { ...deletedRows };
      if (!newDeletedRows[contextKey]) {
        newDeletedRows[contextKey] = new Set();
      }
      newDeletedRows[contextKey].add(rowId);
      setDeletedRows(newDeletedRows);

      // Update UI immediately
      setTableData(prev => prev.filter(row => row.id !== rowId));
      setHasUnsavedChanges(true);
      setDeleteDialogOpen(false);
      setRowToDelete(null);

      // Refresh data
      await triggerRefresh();
    } catch (err) {
      setError('Failed to delete row');
    }
  };

  // Modify handleSaveChanges to handle refresh properly
  const handleSaveChanges = async () => {
    try {
      setLoading(true);
      setError('');

      if (!selectedServer) {
        throw new Error('No server selected');
      }

      // Group changes by database
      const changesByDatabase = actionLog.reduce((acc: Record<string, any>, action) => {
        const key = action.database;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(action.sql_query);
        return acc;
      }, {});

      // Execute batch operations for each database
      for (const [database, queries] of Object.entries(changesByDatabase)) {
        await api.batchExecuteQueries(
          selectedServer.alias,
          database,
          queries
        );
      }

      // Clear all changes
      setDeletedRows({});
      setHasUnsavedChanges(false);
      setRowSelectionModel([]);
      setActionLog([]);

      // Refresh data
      await triggerRefresh();
    } catch (err) {
      setError(err);
      console.error('Error saving changes:', err);
    } finally {
      setLoading(false);
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
    <Box sx={{
      p: 3,
      height: 'calc(100vh - 64px)', // Subtract header height
      display: 'flex',
      gap: 2,
    }}>
      <Box sx={{
        flex: isChatExpanded ? '1 1 70%' : '1 1 calc(100% - 48px)',
        overflow: 'hidden'
      }}>
        <Paper sx={{
          p: 3,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <Typography variant="h5" gutterBottom>
            Table Management
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            {/* Database Management */}
            {selectedServer && (
              <DatabaseManagement 
                serverId={selectedServer.id} 
                onDatabaseChange={() => loadDatabases(selectedServer)}
                selectedDatabase={selectedDatabase}
              />
            )}

            {/* Database Selection */}
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
              <>
                <TextField
                  select
                  label="Table"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  {tables.map((table) => (
                    <MenuItem key={table} value={table}>
                      {table}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() => setOpenDialog(true)}
                >
                  Create Table
                </Button>
                {selectedTable && (
                  <>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => {
                        setIsForceDelete(false);
                        handleDropTableClick(selectedTable);
                      }}
                    >
                      Drop Table
                    </Button>
                  </>
                )}
              </>
            )}
          </Box>

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {selectedTable && (
            <Box sx={{
              flexGrow: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}>
              <Box sx={{
                flexGrow: 1,
                '& .MuiDataGrid-root': {
                  height: '100%'
                },
                '& .MuiDataGrid-cell': {
                  whiteSpace: 'normal',
                  wordWrap: 'break-word'
                }
              }}>
                <DataGrid
                  rows={tableData}
                  columns={[
                    ...columns.filter(col => col.field !== 'Columns'),
                    {
                      field: 'actions',
                      headerName: 'Actions',
                      width: 100,
                      sortable: false,
                      renderCell: (params) => (
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteClick(params.row)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      ),
                    }
                  ]}
                  paginationModel={paginationModel}
                  onPaginationModelChange={setPaginationModel}
                  pageSizeOptions={[5, 10, 20]}
                  checkboxSelection
                  disableRowSelectionOnClick
                  slots={{
                    toolbar: CustomToolbar,
                    noRowsOverlay: () => (
                      <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        gap: 2
                      }}>
                        <Typography>No rows in this table</Typography>
                      </Box>
                    ),
                  }}
                  processRowUpdate={processRowUpdate}
                  onProcessRowUpdateError={handleProcessRowUpdateError}
                  autoHeight={false}
                  density="compact"
                  rowSelectionModel={rowSelectionModel}
                  onRowSelectionModelChange={(newSelection) => {
                    setRowSelectionModel(newSelection);
                  }}
                />
              </Box>
            </Box>
          )}
        </Paper>
      </Box>

      <Box sx={{
        width: isChatExpanded ? '30%' : '48px',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
      }}>
        <Chat
          isExpanded={isChatExpanded}
          onToggleExpand={() => setIsChatExpanded(!isChatExpanded)}
          showHistory={false}
          displayMode="embedded"
          variant="side"
          onTableRefresh={() => setRefreshTrigger(prev => prev + 1)}
          onDatabaseRefresh={loadTables}
          selectedTable={selectedTable}
        />
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Row</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this row?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteConfirm(false)}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Update Cell Content Dialog */}
      <Dialog
        open={cellDialog.open}
        onClose={() => setCellDialog(prev => ({ ...prev, open: false, isEditing: false }))}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            minHeight: '40vh',
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">{cellDialog.title}</Typography>
            <Box>
              {!cellDialog.isEditing && (
                <Button
                  variant="contained"
                  onClick={handleCopyContent}
                  size="small"
                  sx={{ mr: 1 }}
                >
                  Copy
                </Button>
              )}
              {!cellDialog.isEditing ? (
                <Button
                  variant="contained"
                  onClick={() => setCellDialog(prev => ({ ...prev, isEditing: true }))}
                  size="small"
                  color="primary"
                >
                  Edit
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleSaveContent}
                  size="small"
                  color="success"
                >
                  Save
                </Button>
              )}
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {renderDialogContent()}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCellDialog(prev => ({
              ...prev,
              open: false,
              isEditing: false,
              content: prev.originalContent // Reset content if canceling
            }))}
          >
            {cellDialog.isEditing ? 'Cancel' : 'Close'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Table Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => {
          setOpenDialog(false);
          setNewTableName('');
          setNewTableColumns([{
            name: '',
            type: '',
            isPK: false,
            isFK: false,
            referencedTable: '',
            referencedColumn: ''
          }]);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create New Table</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Table Name"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              fullWidth
            />
            {newTableColumns.map((column, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  label="Column Name"
                  value={column.name}
                  onChange={(e) => {
                    const newColumns = [...newTableColumns];
                    newColumns[index].name = e.target.value;
                    setNewTableColumns(newColumns);
                  }}
                  sx={{ flex: 1, minWidth: '200px' }}
                />
                <FormControl sx={{ flex: 1, minWidth: '200px' }}>
                  <InputLabel>Column Type</InputLabel>
                  <Select
                    value={column.type}
                    label="Column Type"
                    onChange={(e) => {
                      const newColumns = [...newTableColumns];
                      newColumns[index].type = e.target.value;
                      setNewTableColumns(newColumns);
                    }}
                  >
                    {SQL_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={column.isPK}
                      onChange={(e) => {
                        const newColumns = [...newTableColumns];
                        newColumns[index].isPK = e.target.checked;
                        if (e.target.checked) {
                          // Uncheck PK for other columns
                          newColumns.forEach((col, i) => {
                            if (i !== index) col.isPK = false;
                          });
                        }
                        setNewTableColumns(newColumns);
                      }}
                    />
                  }
                  label="Primary Key"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={column.isFK}
                      onChange={(e) => {
                        const newColumns = [...newTableColumns];
                        newColumns[index].isFK = e.target.checked;
                        setNewTableColumns(newColumns);
                      }}
                    />
                  }
                  label="Foreign Key"
                />
                {column.isFK && (
                  <>
                    <TextField
                      label="Referenced Table"
                      select
                      value={column.referencedTable}
                      onChange={(e) => {
                        const newColumns = [...newTableColumns];
                        newColumns[index].referencedTable = e.target.value;
                        newColumns[index].referencedColumn = ''; // Reset column when table changes
                        setNewTableColumns(newColumns);
                      }}
                      sx={{ flex: 1, minWidth: '200px' }}
                    >
                      {tables.filter(t => t !== newTableName).map((table) => (
                        <MenuItem key={table} value={table}>
                          {table}
                        </MenuItem>
                      ))}
                    </TextField>
                    {column.referencedTable && (
                      <TextField
                        label="Referenced Column"
                        value={column.referencedColumn}
                        onChange={(e) => {
                          const newColumns = [...newTableColumns];
                          newColumns[index].referencedColumn = e.target.value;
                          setNewTableColumns(newColumns);
                        }}
                        sx={{ flex: 1, minWidth: '200px' }}
                      />
                    )}
                  </>
                )}
                {index > 0 && (
                  <IconButton
                    color="error"
                    onClick={() => {
                      const newColumns = newTableColumns.filter((_, i) => i !== index);
                      setNewTableColumns(newColumns);
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddColumn}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add Column
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpenDialog(false);
            setNewTableName('');
            setNewTableColumns([{
              name: '',
              type: '',
              isPK: false,
              isFK: false,
              referencedTable: '',
              referencedColumn: ''
            }]);
          }}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateTable}
            variant="contained"
            color="primary"
            disabled={!newTableName || newTableColumns.length === 0}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add the new row dialog */}
      <Dialog
        open={addRowDialogOpen}
        onClose={() => setAddRowDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add New Row</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {columns
              .filter(col => col.field !== 'id' && col.field !== 'actions')
              .map((column) => (
                <TextField
                  key={column.field}
                  label={column.headerName}
                  value={newRowData[column.field] || ''}
                  onChange={(e) => {
                    setNewRowData(prev => ({
                      ...prev,
                      [column.field]: e.target.value === '' ? null : e.target.value
                    }));
                  }}
                  fullWidth
                />
              ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAddRowDialogOpen(false)}
            variant="contained"
            color="error"
            startIcon={<CancelIcon />}
          >
            Discard
          </Button>
          <Button
            onClick={handleSaveNewRow}
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Drop Table Dialog */}
      <Dialog
        open={dropTableDialogOpen}
        onClose={() => {
          setDropTableDialogOpen(false);
          setTableToDelete(null);
          setIsForceDelete(false);
        }}
      >
        <DialogTitle>Drop Table</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Typography>
              Are you sure you want to drop table {tableToDelete}?
            </Typography>
            {isForceDelete && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Force delete will remove all foreign key constraints referencing this table!
              </Alert>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={isForceDelete}
                  onChange={(e) => setIsForceDelete(e.target.checked)}
                />
              }
              label="Force Delete (removes foreign key constraints)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDropTableDialogOpen(false);
              setTableToDelete(null);
              setIsForceDelete(false);
            }}
            variant="contained"
            color="error"
            startIcon={<CancelIcon />}
          >
            Discard
          </Button>
          <Button
            onClick={handleDropTableConfirm}
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TableManagement;
