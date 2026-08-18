import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TabNav } from '@/components/layout/TabNav';

const ProtectionLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);
  const activeTab = segments[2] || '';

  const tabs = [
    { key: '', label: 'Security Events' },
    { key: 'threats', label: 'Threat Actors' },
    { key: 'enforcement', label: 'Enforcement History' },
    { key: 'policy', label: 'Policy Configuration' },
    { key: 'settings', label: 'Settings' },
    { key: 'mcp-shield', label: 'MCP Shield' },
  ];

  const handleTabChange = (key: string) => {
    navigate(key ? `/app/protection/${key}` : '/app/protection');
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col animate-fade-in">
      <div className="-mx-6 mb-6 min-w-0 border-b border-border-subtle">
        <TabNav tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <Outlet />
      </div>
    </div>
  );
};

export default ProtectionLayout;
