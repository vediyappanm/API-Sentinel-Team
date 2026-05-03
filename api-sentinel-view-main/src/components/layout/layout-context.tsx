import React, { createContext, useContext, useMemo, useState } from 'react';

interface LayoutContextValue {
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const value = useMemo<LayoutContextValue>(() => ({
    isSidebarCollapsed,
    isMobileSidebarOpen,
    setSidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed((current) => !current),
    openMobileSidebar: () => setMobileSidebarOpen(true),
    closeMobileSidebar: () => setMobileSidebarOpen(false),
  }), [isSidebarCollapsed, isMobileSidebarOpen]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
};

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider');
  }
  return context;
}
