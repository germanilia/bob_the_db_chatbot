import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { text: 'Dashboard', path: '/' },
    { text: 'Connections', path: '/connect-db' },
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

  return (
    <div className="layout">
      {/* Header */}
      <header className="header">
        <button 
          className="menu-button"
          onClick={toggleDrawer}
        >
          ☰
        </button>
        <h1>Bob The DB Chatbot</h1>
      </header>

      {/* Navigation Drawer */}
      <nav className={`drawer ${isDrawerOpen ? 'open' : ''} ${isMobile ? 'mobile' : ''}`}>
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