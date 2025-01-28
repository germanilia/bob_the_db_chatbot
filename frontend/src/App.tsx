import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import Layout from './components/Layout.tsx';
import ConnectDb from './pages/ConnectDb.tsx';
import TableManagement from './pages/TableManagement.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { ConnectionProvider } from './context/ConnectionContext';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    primary: {
      main: '#90caf9',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          overflow: 'hidden', // Prevent body scrolling
        },
      },
    },
  },
});

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout><ConnectDb /></Layout>,
    },
    {
      path: '/connect-db',
      element: <Layout><ConnectDb /></Layout>,
    },
    {
      path: '/tables',
      element: <Layout><TableManagement /></Layout>,
    },
    {
      path: '/chat',
      element: <Layout><ChatPage /></Layout>,
    },
    {
      path: '*',
      element: <Layout><ConnectDb /></Layout>,
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    } as any,
  }
);

const App: React.FC = () => {
  return (
    <ConnectionProvider>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <RouterProvider router={router} />
        {/* Add portal container for modals at the root level */}
        <div id="modal-root" />
      </ThemeProvider>
    </ConnectionProvider>
  );
};

export default App; 
