import React from 'react';
import { LayoutGrid, Users, Key, Shield, Radio, FileText, ShieldAlert, ClipboardList, CheckSquare, Bell, Webhook, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SettingsCard from '@/components/shared/SettingsCard';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 animate-fade-in w-full pb-10 max-w-6xl mx-auto px-6 mt-4">
      {/* Search Header */}
      <div className="flex flex-col items-center justify-center mb-10 mt-6">
        <h1 className="text-2xl font-bold font-display text-text-primary mb-6 tracking-wide">Settings</h1>
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <input
            type="text"
            placeholder="Search settings..."
            className="w-full bg-bg-surface border border-border-subtle rounded-xl py-3.5 pl-12 pr-4 text-sm text-text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand shadow-lg placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1 font-display">Access & Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SettingsCard
            icon={LayoutGrid}
            title="Manage Applications"
            description="Add and register new applications, assign them to users or groups, and remove applications no longer in use."
            onClick={() => navigate('/add-application')}
          />
          <SettingsCard
            icon={Users}
            title="User & Role Administration"
            description="Manage organizational users, update role assignments, and deactivate or delete accounts."
            onClick={() => navigate('/settings/users')}
          />
          <SettingsCard
            icon={Key}
            title="API Keys Management"
            description="Securely create, manage, and rotate API keys used across the organization."
          />
          <SettingsCard
            icon={Shield}
            title="Private/Internal IPs"
            description="Define IP ranges owned by your organization."
          />
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1 font-display">Platform & Infrastructure</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SettingsCard
            icon={Radio}
            title="Controller & Sensor Configuration"
            description="Configure and manage controller and sensor settings, define ingress filters, and monitor statistics."
            onClick={() => navigate('/system-health')}
          />
          <SettingsCard
            icon={FileText}
            title="License Usage"
            description="Monitor license consumption and track active usage."
          />
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1 font-display">Security & Governance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <SettingsCard icon={ShieldAlert} title="Threat Policies" description="Global rules for active threats and baseline deviations." onClick={() => navigate('/protection/policy')} />
          <SettingsCard icon={ClipboardList} title="Audit Logs" description="Review all administrative operations and policy changes." onClick={() => navigate('/settings/audit-logs')} />
          <SettingsCard icon={CheckSquare} title="Compliance Reports" description="Generate raw exports for SOC2, PCI-DSS, and HIPAA." onClick={() => navigate('/reports')} />
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1 font-display">Notifications</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SettingsCard icon={Bell} title="Alert Channels" description="Configure Slack, Teams, and Email notification routing." />
          <SettingsCard icon={Webhook} title="Webhook Configuration" description="Set up custom HTTP callbacks for security events integration." />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
