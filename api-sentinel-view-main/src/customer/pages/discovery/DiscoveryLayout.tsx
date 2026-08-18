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
    { key: 'call-graph', label: 'Business Logic' },
    { key: 'schema', label: 'Schema Validation' },
    { key: 'sensitive-data', label: 'Sensitive Data' },
  ];

  const handleTabChange = (key: string) => {
    navigate(key ? `/app/discovery/${key}` : '/app/discovery');
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

export default DiscoveryLayout;
