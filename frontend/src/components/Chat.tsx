import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Alert,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButtonGroup,
  ToggleButton,
  Fab,
  useMediaQuery,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { Visualization } from './Visualization';
import { useChat } from '../hooks/useChat';
import { AIConnection, QueryResult } from '../services/api';
import { useConnection, Conversation } from '../context/ConnectionContext';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import ChatIcon from '@mui/icons-material/Chat';
import { useTheme } from '@mui/material/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

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

interface ExtendedConversation {
  id?: number;
  messages: UIMessage[];
  connection: AIConnection;
  database_name: string;
  created_at?: string;
}

interface ChatProps {
  displayMode: 'widget' | 'embedded';
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  variant?: 'full' | 'side';
  showHistory?: boolean;
  onTableRefresh?: () => void;
  onDatabaseRefresh?: () => void;
  selectedTable?: string;
}

const ThinkingMessage = () => (
  <Box
    sx={{
      mb: 2,
      p: 2,
      bgcolor: 'primary.dark',
      borderRadius: 2,
      maxWidth: '80%',
      boxShadow: 3,
      display: 'flex',
      alignItems: 'center',
      gap: 1,
    }}
  >
    <Typography variant="body2" sx={{ color: 'primary.light' }}>AI is thinking</Typography>
    <CircularProgress size={16} thickness={4} />
  </Box>
);

const ChatInput: React.FC<{
  query: string;
  setQuery: (query: string) => void;
  handleSendMessage: () => void;
  handleKeyPress: (event: React.KeyboardEvent) => void;
  sqlMode: boolean;
  setSqlMode: (mode: boolean) => void;
  mode: 'ask' | 'execute';
  setMode: (mode: 'ask' | 'execute') => void;
  loading: boolean;
  chatLoading: boolean;
  disabled?: boolean;
  onNewChat: () => void;
}> = ({
  query,
  setQuery,
  handleSendMessage,
  handleKeyPress,
  sqlMode,
  setSqlMode,
  mode,
  setMode,
  loading,
  chatLoading,
  disabled,
  onNewChat
}) => (
  <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
      <Button
        variant="outlined"
        color={sqlMode ? 'primary' : 'inherit'}
        onClick={() => setSqlMode(!sqlMode)}
        size="small"
        disabled={disabled}
      >
        {sqlMode ? 'SQL Mode' : 'Natural Language'}
      </Button>
      
      {!sqlMode && (
        <>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, newMode) => newMode && setMode(newMode)}
            size="small"
            disabled={disabled}
          >
            <ToggleButton value="ask">Ask</ToggleButton>
            <ToggleButton value="execute">Execute</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            size="small"
            onClick={onNewChat}
            disabled={disabled}
          >
            New Chat
          </Button>
        </>
      )}
    </Box>
    <TextField
      fullWidth
      multiline
      maxRows={4}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyPress={handleKeyPress}
      placeholder={disabled ? "Select a database to start chatting" : "Type your message..."}
      disabled={disabled || chatLoading || loading}
      sx={{ mb: 1 }}
    />
    <Button
      fullWidth
      variant="contained"
      onClick={handleSendMessage}
      disabled={!query.trim() || disabled || chatLoading || loading}
    >
      {(chatLoading || loading) ? <CircularProgress size={24} /> : 'Send'}
    </Button>
  </Box>
);

export const Chat: React.FC<ChatProps> = ({ 
  displayMode,
  isExpanded = true, 
  onToggleExpand, 
  variant = displayMode === 'widget' ? 'full' : 'side',
  showHistory = true,
  onTableRefresh,
  onDatabaseRefresh,
  selectedTable
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [query, setQuery] = useState('');
  const [sqlMode, setSqlMode] = useState(false);
  const [mode, setMode] = useState<'ask' | 'execute'>('ask');
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { 
    serverName, 
    databaseName, 
    currentConversation, 
    setCurrentConversation, 
    setConversations,
    conversations 
  } = useConnection();
  const { 
    sendMessage, 
    loading: chatLoading, 
    startNewConversation,
    loadConversationHistory 
  } = useChat({
    onTableRefresh,
    onDatabaseRefresh
  });
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyLoadedRef = useRef<{[key: string]: boolean}>({});

  // Add state for delete confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState<{open: boolean; conversation: Conversation | null}>({
    open: false,
    conversation: null
  });

  const loadHistory = async () => {
    if (!serverName || historyLoadedRef.current[serverName]) {
      return;
    }

    try {
      setHistoryError(null);
      const conversations = await loadConversationHistory(serverName);
      
      setConversations(conversations);
      if (conversations.length > 0) {
        setCurrentConversation(conversations[0]); // Set the most recent conversation
      } else {
        setCurrentConversation({
          messages: [],
          connection: { name: serverName } as AIConnection,
          database_name: databaseName || '',
          created_at: new Date().toISOString()
        });
      }
      historyLoadedRef.current[serverName] = true;
    } catch (error) {
      console.error('Error loading conversation history:', error);
      setHistoryError('Failed to load conversation history. Please try again later.');
      setCurrentConversation({
        messages: [],
        connection: { name: serverName } as AIConnection,
        database_name: databaseName || '',
        created_at: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    if (serverName) {
      loadHistory();
    }
  }, [serverName]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversation?.messages]);

  const handleMessageUpdate = (userMessage: UIMessage, assistantMessage: UIMessage, conversationId: number) => {
    if (!conversationId) {
      console.error('No conversation ID provided for message update');
      return;
    }

    // Update conversations list
    setConversations(prevConversations => {
      const existingConversation = prevConversations.find(conv => conv.id === conversationId);
      
      if (existingConversation) {
        const updatedConversation = {
          ...existingConversation,
          messages: [...existingConversation.messages, assistantMessage]
        };

        // Update current conversation
        setCurrentConversation(updatedConversation);

        // Update conversations list
        return prevConversations.map(conv => 
          conv.id === conversationId ? updatedConversation : conv
        );
      } else {
        console.error('Conversation not found in list:', conversationId);
        return prevConversations;
      }
    });
  };

  const handleNewChat = async () => {
    if (!serverName || !databaseName) {
      console.error('Server name and database name are required');
      return;
    }

    console.log('Creating new chat');
    
    try {
      // Create new conversation in backend first
      const response = await api.createConversation(
        'New Conversation',
        1, // Default user ID
        serverName,
        databaseName
      );
      
      console.log('Created new conversation:', response.data);
      
      // Create new conversation object with the ID from backend
      const newConversation = {
        id: response.data.id,
        messages: [],
        connection: { name: serverName } as AIConnection,
        database_name: databaseName,
        created_at: response.data.created_at || new Date().toISOString(),
        name: response.data.name
      };
      
      // Update current conversation with the new one
      setCurrentConversation(newConversation);
      
      // Update conversations list
      setConversations(prev => {
        // Remove any temporary conversations
        const withoutTemp = prev.filter(conv => conv.id || conv.messages.length > 0);
        return [newConversation, ...withoutTemp];
      });

      // Set the conversation ID in the chat hook
      startNewConversation(response.data.id);
    } catch (error) {
      console.error('Error creating new conversation:', error);
      alert('Failed to create new conversation. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    // Don't allow sending messages if no conversation is selected or we're in a temporary state
    if (!query.trim() || !serverName || !currentConversation || !databaseName || chatLoading) return;
    if (!currentConversation.id) {
      console.error('No conversation ID available');
      return;
    }

    const userMessage: UIMessage = {
      role: 'user',
      content: sqlMode ? `[SQL] ${query}` : `[${mode.toUpperCase()}] ${query}`,
      timestamp: new Date(),
    };

    // Update conversations list
    setConversations(prev => {
      const existingIndex = prev.findIndex(conv => conv.id === currentConversation.id);
      if (existingIndex === -1) return prev;

      const updatedConversation = {
        ...prev[existingIndex],
        messages: [...prev[existingIndex].messages, userMessage]
      };

      // Update current conversation
      setCurrentConversation(updatedConversation);

      // Update conversations list
      const newConversations = [...prev];
      newConversations[existingIndex] = updatedConversation;
      return newConversations;
    });

    setQuery('');

    try {
      if (sqlMode) {
        setLoading(true);
      }
      const response = sqlMode 
        ? await api.executeRawQuery(query, serverName, databaseName)
        : await sendMessage(serverName, query, databaseName, mode, selectedTable || '');
      
      if (!response) return;

      const responseData = sqlMode 
        ? (response as any).data 
        : response;
      console.log('Response data in handleSendMessage:', responseData);
      
      // Create assistant message from response
      const assistantMessage: UIMessage = sqlMode ? {
        role: 'assistant',
        content: responseData.summary || '',
        timestamp: new Date(),
        queryResult: {
          type: responseData.type || 'single',
          query: responseData.query || '',
          summary: responseData.summary || '',
          results: responseData.results || [],
          visuals: responseData.visuals || []
        }
      } : responseData;

      // Call handleMessageUpdate with both messages but it will only add the assistant message
      handleMessageUpdate(userMessage, assistantMessage, currentConversation.id);

      // Force refresh after query execution
      if (sqlMode) {
        await loadHistory();
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage = error.message || 'Sorry, there was an error processing your request.';
      const errorDetails = error.error || '';
      const errorQuery = error.query || '';
      
      const assistantMessage: UIMessage = {
        role: 'assistant',
        content: sqlMode ? 
          `Error executing SQL query:\n${errorMessage}\n\n${errorDetails}${errorQuery ? `\n\nQuery:\n${errorQuery}` : ''}` 
          : errorMessage,
        timestamp: new Date(),
      };
      
      // Update conversation with error message
      handleMessageUpdate(userMessage, assistantMessage, currentConversation.id);
    } finally {
      if (sqlMode) {
        setLoading(false);
      }
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  // Add delete handler
  const handleDeleteConversation = async (conversation: Conversation) => {
    if (!conversation.id) return;
    
    try {
      await api.deleteConversation(conversation.id);
      
      // Update conversations list atomically
      setConversations(prevConversations => {
        const remainingConversations = prevConversations.filter(conv => conv.id !== conversation.id);
        
        // If the deleted conversation was the current one, set current to the most recent
        if (currentConversation?.id === conversation.id) {
          if (remainingConversations.length > 0) {
            setCurrentConversation(remainingConversations[0]);
          } else {
            // Create new empty conversation
            const newConversation = {
              messages: [],
              connection: { name: serverName } as AIConnection,
              database_name: databaseName || '',
              created_at: new Date().toISOString()
            };
            setCurrentConversation(newConversation);
            return [newConversation, ...remainingConversations];
          }
        }
        
        return remainingConversations;
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      // Show error message to user
      alert('Failed to delete conversation. Please try again.');
    }
  };

  if (!serverName || !databaseName) {
    if (displayMode === 'widget') {
      return (
        <Fab
          color="primary"
          aria-label="chat"
          onClick={() => setIsDialogOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: theme.zIndex.modal + 1,
          }}
          disabled
          title="Please select a server and database first"
        >
          <ChatIcon />
        </Fab>
      );
    }
    return null;
  }

  const chatContent = (
    <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
      {/* Conversation History Sidebar */}
      {variant === 'full' && showHistory && (
        <Box sx={{ width: 250, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
            <Button
              fullWidth
              variant="contained"
              onClick={handleNewChat}
              disabled={!serverName || !databaseName}
            >
              New Chat
            </Button>
          </Box>
          <List sx={{ overflow: 'auto', flexGrow: 1 }}>
            {conversations
              .filter(conv => conv.connection.name === serverName)
              .map((conv, index) => (
                <ListItem
                  key={index}
                  secondaryAction={
                    <IconButton 
                      edge="end" 
                      aria-label="delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmation({ open: true, conversation: conv });
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                  button
                  selected={currentConversation === conv}
                  onClick={() => setCurrentConversation(conv)}
                  disabled={!serverName || !databaseName}
                >
                  <ListItemText
                    primary={conv.messages[0]?.content || 'New Conversation'}
                    secondary={`${conv.messages.length} messages`}
                    primaryTypographyProps={{
                      noWrap: true,
                      style: { maxWidth: '200px' }
                    }}
                  />
                </ListItem>
              ))}
          </List>
        </Box>
      )}

      {/* Chat Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Messages Container */}
        <Box sx={{ 
          flex: 1, 
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}>
          {/* New Chat Button for widget mode */}
          {displayMode === 'widget' && !showHistory && (
            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleNewChat}
                disabled={!serverName || !databaseName}
              >
                New Chat
              </Button>
            </Box>
          )}
          {currentConversation?.messages.map((message, index) => (
            <Box
              key={index}
              sx={{
                p: 2,
                bgcolor: message.role === 'user' ? 'grey.800' : 'primary.dark',
                borderRadius: 2,
                maxWidth: '80%',
                ml: message.role === 'user' ? 'auto' : 0,
                boxShadow: 3,
              }}
            >
              <Typography 
                variant="caption" 
                sx={{ 
                  color: message.role === 'user' ? 'grey.400' : 'primary.light',
                  display: 'block',
                  mb: 1
                }}
              >
                {message.role === 'user' ? 'You' : 'AI'} - {message.timestamp.toLocaleTimeString()}
              </Typography>

              {/* Show content only if it's a user message or if there's no query result */}
              {(message.role === 'user' || !message.queryResult) && (
                <Typography
                  sx={{
                    whiteSpace: 'pre-wrap',
                    color: 'common.white',
                    mb: 2,
                  }}
                >
                  {message.content}
                </Typography>
              )}

              {message.queryResult && (
                <>
                  {/* Verbal explanation */}
                  <Typography
                    sx={{
                      whiteSpace: 'pre-wrap',
                      color: 'common.white',
                      mb: 2,
                    }}
                  >
                    {message.queryResult.summary}
                  </Typography>

                  {/* SQL Query */}
                  {message.queryResult.query && (
                    <Box 
                      sx={{ 
                        mt: 2,
                        p: 2,
                        backgroundColor: 'grey.900',
                        borderRadius: 1,
                        fontFamily: 'monospace'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'grey.500'
                          }}
                        >
                          SQL Query:
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => {
                            navigator.clipboard.writeText(message.queryResult?.query || '');
                          }}
                          title="Copy SQL query"
                          sx={{
                            color: 'grey.400',
                            '&:hover': {
                              color: 'primary.main',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)'
                            },
                            transition: 'color 0.2s ease-in-out'
                          }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Typography
                        sx={{
                          color: 'grey.100',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {message.queryResult.query}
                      </Typography>
                    </Box>
                  )}

                  {/* Results Table */}
                  {message.queryResult.results && message.queryResult.results.length > 0 && (
                    <TableContainer 
                      sx={{ 
                        mt: 2, 
                        mb: 2,
                        backgroundColor: 'background.paper',
                        borderRadius: 1,
                        '& th': {
                          backgroundColor: 'grey.900',
                          color: 'common.white',
                        },
                        '& td': {
                          borderColor: 'grey.800',
                        },
                      }}
                    >
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            {Object.keys(message.queryResult.results[0]).map(header => (
                              <TableCell key={header}>{header}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {message.queryResult.results.map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {Object.entries(row).map(([key, value], cellIndex) => (
                                <TableCell key={`${key}-${cellIndex}`}>
                                  {value === null ? 'NULL' : 
                                    typeof value === 'object' ? 
                                      // Handle nested objects like airport_name
                                      (value as any).en ? (value as any).en :  // If it has en/ru, show English
                                      JSON.stringify(value, null, 2) // Otherwise stringify
                                    : typeof value === 'number' ? 
                                      Number.isInteger(value) ? value : value.toFixed(2)  // Format decimals
                                    : String(value)
                                  }
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  {/* Visualizations */}
                  {message.queryResult.visuals?.map((visual, vizIndex) => (
                    <Box 
                      key={vizIndex} 
                      mt={2}
                      sx={{
                        backgroundColor: 'background.paper',
                        borderRadius: 1,
                        p: 2
                      }}
                    >
                      <Visualization data={message.queryResult?.results || []} config={visual} />
                    </Box>
                  ))}
                </>
              )}
            </Box>
          ))}
        </Box>
        {(chatLoading || loading) && <ThinkingMessage />}
        <div ref={messagesEndRef} />
      </Box>
    </Box>
  );

  if (displayMode === 'widget') {
    return (
      <>
        <Fab
          color="primary"
          aria-label="chat"
          onClick={() => setIsDialogOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: theme.zIndex.modal + 1,
          }}
        >
          <ChatIcon />
        </Fab>

        <Dialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          fullScreen={isMobile}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">Chat with {serverName}/{databaseName}</Typography>
              <Box display="flex" gap={1}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleNewChat}
                  disabled={!serverName || !databaseName}
                >
                  New Chat
                </Button>
                <IconButton onClick={() => onToggleExpand?.()}>
                  <HistoryIcon />
                </IconButton>
                <IconButton
                  aria-label="close"
                  onClick={() => setIsDialogOpen(false)}
                  sx={{ ml: 1 }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>
          </DialogTitle>

          <DialogContent dividers>
            <Box sx={{ height: '60vh', display: 'flex' }}>
              {chatContent}
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Box sx={{ width: '100%' }}>
              <ChatInput
                query={query}
                setQuery={setQuery}
                handleSendMessage={handleSendMessage}
                handleKeyPress={handleKeyPress}
                sqlMode={sqlMode}
                setSqlMode={setSqlMode}
                mode={mode}
                setMode={setMode}
                loading={loading}
                chatLoading={chatLoading}
                onNewChat={handleNewChat}
              />
            </Box>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  return (
    <Paper 
      sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        opacity: !serverName || !databaseName ? 0.7 : 1,
      }}
    >
      {variant === 'side' && (
        <IconButton
          onClick={onToggleExpand}
          sx={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
            bgcolor: 'background.paper',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
          disabled={!serverName || !databaseName}
        >
          {isExpanded ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      )}

      <Box sx={{ 
        p: 2, 
        borderBottom: 1, 
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {serverName && databaseName ? (
            `Chat with ${serverName}/${databaseName}`
          ) : (
            'Please select a database to start chatting'
          )}
        </Typography>
        {variant === 'full' && (
          <IconButton 
            onClick={() => onToggleExpand?.()} 
            size="small"
            disabled={!serverName || !databaseName}
          >
            <HistoryIcon />
          </IconButton>
        )}
      </Box>

      {chatContent}

      <ChatInput
        query={query}
        setQuery={setQuery}
        handleSendMessage={handleSendMessage}
        handleKeyPress={handleKeyPress}
        sqlMode={sqlMode}
        setSqlMode={setSqlMode}
        mode={mode}
        setMode={setMode}
        loading={loading}
        chatLoading={chatLoading}
        onNewChat={handleNewChat}
        disabled={!serverName || !databaseName}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmation.open}
        onClose={() => setDeleteConfirmation({ open: false, conversation: null })}
      >
        <DialogTitle>Delete Conversation</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this conversation? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeleteConfirmation({ open: false, conversation: null })}
          >
            Cancel
          </Button>
          <Button 
            color="error"
            onClick={() => {
              if (deleteConfirmation.conversation) {
                handleDeleteConversation(deleteConfirmation.conversation);
              }
              setDeleteConfirmation({ open: false, conversation: null });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}; 
