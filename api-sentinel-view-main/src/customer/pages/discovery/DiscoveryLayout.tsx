import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TabNav } from '@/components/layout/TabNav';

const DiscoveryLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);
  const activeTab = segments[2] || '';

  const tabs = [
    { key: '', label: 'API Catalogue' },
    { key: 'parameters', label: 'Parameter Catalogue' },
    { key: 'governance', label: 'API Governance' },
    { key: 'sequence', label: 'API Sequence Flow' },
    { key: 'tree', label: 'API Tree' },
    { key: 'call-graph', label: 'Business Logic' },
    { key: 'schema', label: 'Schema Validation' },
    { key: 'sensitive-data', label: 'Sensitive Data' },
  ];

  const handleTabChange = (key: string) => {
    navigate(key ? `/app/discovery/${key}` : '/app/discovery');
  };

  return (
    <div className="flex flex-col h-full animate-fade-in w-full">
      <div className="border-b border-border-subtle -mx-6 mb-6">
        <TabNav tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
};

export default DiscoveryLayout;
