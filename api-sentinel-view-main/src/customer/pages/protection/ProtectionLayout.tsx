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
    <div className="flex flex-col h-full animate-fade-in w-full pb-10">
      <div className="border-b border-border-subtle -mx-6 mb-6">
        <TabNav tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
};

export default ProtectionLayout;
