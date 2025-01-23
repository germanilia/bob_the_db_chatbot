import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton
} from '@mui/material';
import { PieChart, Pie, BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import DeleteIcon from '@mui/icons-material/Delete';
import { AIConnection, QueryResult, Conversation as APIConversation, Visualization as VisualizationType, ConversationMessage } from '../services/api.ts';
import api from '../services/api.ts';
import HistoryIcon from '@mui/icons-material/History';
import SendIcon from '@mui/icons-material/Send';

interface UIMessage {
  type: 'user' | 'ai';
  content: string;
  queryResult?: QueryResult;
  timestamp: Date;
}

interface ExtendedConversation extends Omit<APIConversation, 'messages'> {
  messages: UIMessage[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Visualization: React.FC<{
  data: Record<string, any>[];
  config: VisualizationType;
}> = ({ data, config }) => {
  // Early return if we don't have the required data
  if (!config.labels || !config.datasets?.[0]?.data) {
    return null;
  }

  // Ensure we have the dataset for TypeScript
  const dataset = config.datasets[0];
  if (!dataset) return null;

  // Transform the data consistently for all chart types
  const chartData = config.labels.map((label, index) => ({
    name: label,
    value: dataset.data[index],
  }));

  const commonProps = {
    width: '100%',
    height: 300,
  };

  const renderChart = () => {
    switch (config.type) {
      case 'pie_chart':
        return (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                label
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={dataset.backgroundColor?.[index] || COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'bar_chart':
        return (
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name={dataset.label}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={dataset.backgroundColor?.[index] || COLORS[index % COLORS.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line_chart':
        return (
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                name={dataset.label}
                stroke={dataset.backgroundColor?.[0] || '#8884d8'}
                dot={{ fill: dataset.backgroundColor?.[0] || '#8884d8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'scatter_plot':
        return (
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" name={config.x_axis || 'X'} />
              <YAxis dataKey="value" name={config.y_axis || 'Y'} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter 
                name={dataset.label} 
                data={chartData} 
                fill={dataset.backgroundColor?.[0] || '#8884d8'} 
              />
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ 
      width: '100%', 
      height: 300,
      mb: 6  // Increase margin bottom to 48px (6 * 8px) between visualizations
    }}>
      <Typography variant="h6" align="center" gutterBottom>
        {config.title}
      </Typography>
      {renderChart()}
    </Box>
  );
};

const Home = () => {
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState<ExtendedConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ExtendedConversation | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages]);

  useEffect(() => {
    const initializeData = async () => {
      try {
        setInitialLoading(true);
        const connectionsResponse = await api.getConnections();
        setConnections(connectionsResponse.data);
        
        // Load ALL conversations once
        const conversationsResponse = await api.getConversations(null, 1);
        const extendedConversations: ExtendedConversation[] = conversationsResponse.data.map(conv => ({
          ...conv,
          messages: conv.messages.flatMap(msg => [
            {
              type: 'user' as const,
              content: msg.prompt,
              timestamp: new Date(msg.timestamp),
            },
            {
              type: 'ai' as const,
              content: msg.sql_query,
              queryResult: msg.result_data ? {
                type: 'single',
                query: msg.result_data.query,
                summary: msg.result_data.summary,
                results: msg.result_data.results,
                visuals: msg.result_data.visuals,
              } : undefined,
              timestamp: new Date(msg.timestamp),
            }
          ])
        }));
        setConversations(extendedConversations);
        
        if (connectionsResponse.data.length > 0) {
          setSelectedConnection(connectionsResponse.data[0].name);
        }
      } catch (err) {
        setError('Failed to initialize data');
      } finally {
        setInitialLoading(false);
      }
    };

    initializeData();
  }, []);

  // Remove the initialLoading dependency to prevent unnecessary reloads
  useEffect(() => {
    if (selectedConnection && activeConversation?.connection_name !== selectedConnection) {
      // Only clear active conversation if switching to a new connection's context
      setActiveConversation(null);
    }
    // Don't reload conversations here - we'll handle filtering client-side
  }, [selectedConnection]);

  const startNewConversation = async () => {
    try {
      const response = await api.createConversation(
        newMessage, 
        1, // User ID
        selectedConnection // Pass connection name
      );
      const newConversation: ExtendedConversation = {
        ...response.data,
        messages: []
      };
      setConversations([newConversation, ...conversations]);
      setActiveConversation(newConversation);
    } catch (err) {
      setError('Failed to create new conversation');
    }
  };

  const loadConversations = async () => {
    try {
      const response = await api.getConversations(selectedConnection || null, 1);
      const extendedConversations: ExtendedConversation[] = response.data.map(conv => ({
        ...conv,
        messages: conv.messages.flatMap(msg => [
          {
            type: 'user' as const,
            content: msg.prompt,
            timestamp: new Date(msg.timestamp),
          },
          {
            type: 'ai' as const,
            content: msg.sql_query,
            queryResult: msg.result_data ? {
              type: 'single',
              query: msg.result_data.query,
              summary: msg.result_data.summary,
              results: msg.result_data.results,
              visuals: msg.result_data.visuals,
            } : undefined,
            timestamp: new Date(msg.timestamp),
          }
        ])
      }));
      setConversations(extendedConversations);
      
      if (extendedConversations.length > 0 && !activeConversation) {
        setActiveConversation(extendedConversations[0]);
      }
    } catch (err) {
      setError('Failed to load conversations');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnection || !newMessage.trim()) return;

    setLoading(true);
    setError('');
    
    try {
      // Create new conversation if none is active
      if (!activeConversation) {
        await startNewConversation();
      }
      
      const currentConversation = activeConversation || conversations[conversations.length - 1];
      
      // Add user message immediately
      const userMessage = {
        type: 'user' as const,
        content: newMessage,
        timestamp: new Date(),
      };
      
      // Add AI response
      const response = await api.executeQuery(newMessage, selectedConnection, currentConversation.id);
      const aiMessage = {
        type: 'ai' as const,
        content: response.data.query || 'No query generated',
        queryResult: response.data,
        timestamp: new Date(),
      };

      // Update conversation with both messages
      const updatedConversation = {
        ...currentConversation,
        messages: [
          ...currentConversation.messages,
          userMessage,
          aiMessage
        ],
      };
      
      setActiveConversation(updatedConversation);
      setConversations(conversations.map(conv => 
        conv.id === currentConversation.id ? updatedConversation : conv
      ));
      
      setNewMessage('');
    } catch (err) {
      setError('Failed to execute query');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <Box sx={{ 
        height: '100%',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <CircularProgress />
      </Box>
    );
  }

  if (connections.length === 0) {
    return (
      <Box sx={{ 
        height: '100%',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <Typography variant="h6">
          No database connections found. Please add a connection first.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      height: '100%',
      backgroundColor: 'background.default',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <Grid container spacing={0} sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Conversation History Sidebar */}
        {showHistory && (
          <Grid item xs={12} md={3} sx={{ height: '100%' }}>
            <Paper sx={{ 
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'background.paper',
              borderRadius: 0
            }}>
              <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">Conversations</Typography>
                <Button variant="contained" onClick={startNewConversation}>
                  New
                </Button>
              </Box>
              <List sx={{ 
                flex: 1, 
                overflow: 'auto',
                px: 2,
                pb: 2
              }}>
                {conversations
                  .filter(conv => 
                    selectedConnection ? 
                    conv.connection_name === selectedConnection : 
                    true
                  )
                  .map(conversation => (
                  <ListItem
                    button
                    key={conversation.id}
                    selected={activeConversation?.id === conversation.id}
                    onClick={() => setActiveConversation(conversation)}
                    sx={{
                      borderRadius: '8px',
                      mb: 0.5,
                      '&.Mui-selected': {
                        backgroundColor: 'primary.main',
                        '&:hover': { backgroundColor: 'primary.dark' }
                      }
                    }}
                    secondaryAction={
                      <IconButton 
                        edge="end" 
                        aria-label="delete"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await api.deleteConversation(conversation.id);
                            setConversations(convs => convs.filter(c => c.id !== conversation.id));
                            if (activeConversation?.id === conversation.id) {
                              setActiveConversation(null);
                            }
                          } catch (err) {
                            setError('Failed to delete conversation');
                          }
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={conversation.messages[0]?.content || conversation.name}
                      secondary={`${conversation.messages.length} message${conversation.messages.length === 1 ? '' : 's'}`}
                      primaryTypographyProps={{
                        noWrap: true,
                        style: { 
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
        )}

        {/* Main Chat Area */}
        <Grid item xs={12} md={showHistory ? 9 : 12} sx={{ height: '100%' }}>
          <Paper sx={{ 
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'background.paper',
            borderRadius: 0
          }}>
            <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">
                {activeConversation?.name || 'Select a conversation'}
              </Typography>
              <IconButton onClick={() => setShowHistory(!showHistory)}>
                <HistoryIcon />
              </IconButton>
            </Box>

            {/* Chat Messages */}
            <Box sx={{
              flex: 1,
              overflow: 'auto',
              px: 2,
              pb: 2
            }}>
              {!activeConversation && (
                <Box sx={{ 
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary'
                }}>
                  <Typography variant="h6">
                    {conversations.length === 0 ? 
                      'No conversations found' : 
                      'Select a conversation from the sidebar'}
                  </Typography>
                </Box>
              )}
              {activeConversation?.messages.map((message, index) => (
                <React.Fragment key={index}>
                  {message.type === 'user' && (
                    <Box alignSelf="flex-end" maxWidth="80%" mb={2}>
                      <Paper sx={{ 
                        p: 2, 
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                      }}>
                        <Typography variant="caption">
                          You - {message.timestamp.toLocaleTimeString()}
                        </Typography>
                        <Typography variant="body1">
                          {message.content}
                        </Typography>
                      </Paper>
                    </Box>
                  )}

                  {message.type === 'ai' && (
                    <Box alignSelf="flex-start" maxWidth="80%" mb={2}>
                      <Paper sx={{ 
                        p: 2, 
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        borderRadius: '12px',
                        border: '1px solid',
                        borderColor: 'divider',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                      }}>
                        <Typography variant="caption" color="textSecondary">
                          AI - {message.timestamp.toLocaleTimeString()}
                        </Typography>
                        
                        <Typography variant="body1" mb={1}>
                          {message.content}
                        </Typography>

                        {message.queryResult && (
                          <>
                            <TableContainer sx={{ 
                              mb: 2,
                              '& .MuiTable-root': {
                                borderCollapse: 'separate',
                                borderSpacing: '0 4px'
                              },
                              '& .MuiTableCell-head': {
                                backgroundColor: 'transparent',
                                color: 'text.primary',
                                fontWeight: '600'
                              },
                              '& .MuiTableRow-root': {
                                backgroundColor: 'background.paper',
                                '&:hover': {
                                  backgroundColor: 'action.hover'
                                }
                              },
                              '& .MuiTableCell-body': {
                                borderBottom: 'none'
                              }
                            }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    {message.queryResult?.results?.[0] && 
                                      Object.keys(message.queryResult.results[0]).map(header => (
                                        <TableCell key={header}>{header}</TableCell>
                                      ))
                                    }
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {message.queryResult?.results?.map((row, rowIndex) => (
                                    <TableRow key={rowIndex}>
                                      {Object.entries(row ?? {}).map(([key, cell], cellIndex) => (
                                        <TableCell key={`${key}-${cellIndex}`}>
                                          {cell === null ? 'NULL' : String(cell)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>

                            {message.queryResult.summary && (
                              <Typography variant="body2" color="textSecondary">
                                {message.queryResult.summary}
                              </Typography>
                            )}

                            {message.queryResult?.visuals?.map((visual, vizIndex) => (
                              <Box key={`viz-${vizIndex}`} mt={2}>
                                {visual.type !== 'table' && (
                                  <Visualization 
                                    data={message.queryResult?.results || []}
                                    config={visual}
                                  />
                                )}
                              </Box>
                            ))}
                          </>
                        )}
                      </Paper>
                    </Box>
                  )}
                </React.Fragment>
              ))}
              <div ref={messagesEndRef} />
            </Box>

            {/* Input Area */}
            <Box 
              component="form" 
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(e);
              }}
              sx={{ 
                p: 2,
                borderTop: 1,
                borderColor: 'divider',
                backgroundColor: 'background.paper'
              }}
            >
              <Grid container spacing={1}>
                <Grid item xs={3}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Database"
                    value={selectedConnection}
                    onChange={(e) => setSelectedConnection(e.target.value)}
                  >
                    {connections.map((conn) => (
                      <MenuItem key={conn.name} value={conn.name}>
                        {conn.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={8}>
                  <TextField
                    multiline
                    rows={2}
                    size="small"
                    fullWidth
                    label="Type your question..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={!activeConversation}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    InputLabelProps={{ sx: { color: 'text.secondary' } }}
                    InputProps={{
                      sx: {
                        color: 'text.primary',
                        '& fieldset': { borderColor: 'divider' },
                        borderRadius: '8px',
                        backgroundColor: 'background.paper'
                      }
                    }}
                  />
                </Grid>
                <Grid item xs={1} sx={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={!activeConversation || loading}
                    sx={{ height: '40px' }}
                  >
                    {loading ? <CircularProgress size={24} /> : <SendIcon />}
                  </Button>
                </Grid>
              </Grid>
            </Box>

            {error && (
              <Box sx={{ p: 2, backgroundColor: 'background.paper' }}>
                <Alert severity="error">{error}</Alert>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Home; 
