import React from 'react';
import { Box, Typography } from '@mui/material';

export const Home: React.FC = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        p: 3,
        gap: 4,
        maxWidth: '800px',
        margin: '0 auto',
      }}
    >
      <Typography variant="h4" gutterBottom>
        Welcome to Database Chat Assistant
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Click the chat button in the bottom right corner to start a conversation.
      </Typography>
    </Box>
  );
}; 
