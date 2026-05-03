import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TabNav } from '@/components/layout/TabNav';

const TestingLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const segments = location.pathname.split('/').filter(Boolean);
  const activeTab = segments[2] || '';

  const tabs = [
    { key: '', label: 'Vulnerabilities' },
    { key: 'dashboard', label: 'Test Dashboard' },
    { key: 'configuration', label: 'Profiles & Prep' },
    { key: 'inspector', label: 'Run Inspector' },
  ];

  const handleTabChange = (key: string) => {
    navigate(key ? `/app/testing/${key}` : '/app/testing');
  };

  return (
    <div className="flex flex-col h-full animate-fade-in w-full pb-10">
      <div className="border-b border-border-subtle -mx-6 mb-6">
        <TabNav tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      <div className="flex-1 w-full">
        <Outlet />
      </div>
    </div>
  );
};

export default TestingLayout;
