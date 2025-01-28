import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConnection } from '../context/ConnectionContext';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { serverName, databaseName } = useConnection();

  const menuItems = [
    { text: 'Connections', path: '/' },
    { text: 'Database Tables', path: '/tables' },
    { text: 'Chat', path: '/chat' },
  ];

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen);
  };

  const getTitle = () => {
    let title = 'Bob The DB Chatbot';
    if (serverName) {
      title += ` - ${serverName}`;
      if (databaseName) {
        title += `/${databaseName}`;
      }
    }
    return title;
  };

  return (
    <div className="layout">
      {/* Header */}
      <header className="header">
        <button 
          className="menu-button"
          onClick={toggleDrawer}
          aria-label="Toggle navigation menu"
          aria-expanded={isDrawerOpen}
          aria-controls="navigation-drawer"
        >
          ☰
        </button>
        <h1>{getTitle()}</h1>
      </header>

      {/* Navigation Drawer */}
      <nav 
        className={`drawer ${isDrawerOpen ? 'open' : ''} ${isMobile ? 'mobile' : ''}`}
        id="navigation-drawer"
      >
        <ul className="nav-list">
          {menuItems.map((item) => (
            <li 
              key={item.text}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <button
                onClick={() => {
                  navigate(item.path);
                  if (isMobile) setIsDrawerOpen(false);
                }}
                aria-current={location.pathname === item.path ? 'page' : undefined}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content */}
      <main className={`main-content ${isDrawerOpen ? 'drawer-open' : ''}`}>
        {children}
      </main>

      {/* Overlay for mobile */}
      {isMobile && isDrawerOpen && (
        <div 
          className="overlay"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout; 
