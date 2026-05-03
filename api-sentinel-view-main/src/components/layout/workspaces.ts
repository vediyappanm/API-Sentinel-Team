import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart2,
  Bell,
  Blocks,
  BrainCircuit,
  Building2,
  Cpu,
  FlaskConical,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  Radar,
  Radio,
  Rocket,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  WalletCards,
  Bot,
} from 'lucide-react';
import type { WorkspaceKey } from '@/lib/auth-context';

export interface WorkspaceNavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  section?: string;
  live?: boolean;
}

export interface WorkspaceShortcut {
  label: string;
  path: string;
  hint: string;
  keywords?: string[];
}

export interface WorkspaceConfig {
  key: WorkspaceKey;
  label: string;
  shortLabel: string;
  badge: string;
  basePath: string;
  homePath: string;
  navItems: WorkspaceNavItem[];
  bottomItems: WorkspaceNavItem[];
  searchShortcuts: WorkspaceShortcut[];
  pageLabels: Record<string, string>;
}

export const customerWorkspace: WorkspaceConfig = {
  key: 'customer',
  label: 'Customer Workspace',
  shortLabel: 'Customer',
  badge: 'Tenant',
  basePath: '/app',
  homePath: '/app/dashboard',
  navItems: [
    { icon: Building2, label: 'Organization', path: '/app/organization', section: 'OVERVIEW' },
    { icon: LayoutDashboard, label: 'Dashboard', path: '/app/dashboard', section: 'OVERVIEW' },
    { icon: Radio, label: 'Live Feed', path: '/app/live', section: 'MONITOR', live: true },
    { icon: Bell, label: 'Alerts', path: '/app/alerts', section: 'MONITOR' },
    { icon: Radar, label: 'Discovery', path: '/app/discovery', section: 'ANALYZE' },
    { icon: FlaskConical, label: 'Testing', path: '/app/testing', section: 'ANALYZE' },
    { icon: ShieldCheck, label: 'Protection', path: '/app/protection', section: 'PROTECT' },
    { icon: Blocks, label: 'Blocklist', path: '/app/blocklist', section: 'PROTECT' },
    { icon: BarChart2, label: 'Reports', path: '/app/reports', section: 'ANALYZE' },
    { icon: BrainCircuit, label: 'Intel', path: '/app/intelligence', section: 'ANALYZE' },
    { icon: Bot, label: 'AI Security', path: '/app/intelligence/agentic', section: 'ANALYZE' },
  ],
  bottomItems: [
    { icon: Settings, label: 'Workspace', path: '/app/organization' },
  ],
  searchShortcuts: [
    { label: 'Organization', path: '/app/organization', hint: 'Tenant overview and posture', keywords: ['overview', 'apps'] },
    { label: 'Dashboard', path: '/app/dashboard', hint: 'KPI overview', keywords: ['home', 'metrics'] },
    { label: 'Live Feed', path: '/app/live', hint: 'Real-time traffic', keywords: ['stream', 'events'] },
    { label: 'Alerts', path: '/app/alerts', hint: 'Active detections', keywords: ['incidents', 'detections'] },
    { label: 'Discovery', path: '/app/discovery', hint: 'API inventory and catalog', keywords: ['inventory', 'catalog'] },
    { label: 'Testing', path: '/app/testing', hint: 'Vulnerabilities and test runs', keywords: ['scan', 'vulns'] },
    { label: 'Protection', path: '/app/protection', hint: 'Policies and enforcement', keywords: ['policy', 'waf'] },
    { label: 'Reports', path: '/app/reports', hint: 'Exports and summaries', keywords: ['export', 'summary'] },
    { label: 'AI Security', path: '/app/intelligence/agentic', hint: 'AI agent monitoring, MCP, prompt injection', keywords: ['agent', 'mcp', 'llm', 'agentic'] },
    { label: 'Business Logic', path: '/app/discovery/call-graph', hint: 'API call graph and sequence violations', keywords: ['graph', 'sequence', 'logic'] },
    { label: 'Schema Validation', path: '/app/discovery/schema', hint: 'OpenAPI schema violations', keywords: ['schema', 'openapi', 'validation'] },
    { label: 'Sensitive Data', path: '/app/discovery/sensitive-data', hint: 'PII and credential exposure', keywords: ['pii', 'gdpr', 'sensitive'] },
    { label: 'MCP Shield', path: '/app/protection/mcp-shield', hint: 'Shadow MCP servers and tool monitoring', keywords: ['mcp', 'shadow', 'tools'] },
  ],
  pageLabels: {
    organization: 'Organization',
    dashboard: 'Dashboard',
    discovery: 'Discovery',
    testing: 'Testing',
    protection: 'Protection',
    reports: 'Reports',
    intelligence: 'Intel',
    agentic: 'AI Security',
    live: 'Live Feed',
    alerts: 'Alerts',
    blocklist: 'Blocklist',
  },
};

export const adminWorkspace: WorkspaceConfig = {
  key: 'admin',
  label: 'Org Admin Workspace',
  shortLabel: 'Org Admin',
  badge: 'Tenant Admin',
  basePath: '/admin',
  homePath: '/admin/onboarding',
  navItems: [
    { icon: Rocket, label: 'Onboarding', path: '/admin/onboarding', section: 'SETUP' },
    { icon: Layers3, label: 'Applications', path: '/admin/applications/add', section: 'SETUP' },
    { icon: Users, label: 'Users & Roles', path: '/admin/settings/users', section: 'ADMIN' },
    { icon: KeyRound, label: 'API Keys', path: '/admin/settings/api-keys', section: 'ADMIN' },
    { icon: LockKeyhole, label: 'Attribute Mapping', path: '/admin/settings/attribute-mapping', section: 'ADMIN' },
    { icon: WalletCards, label: 'License', path: '/admin/settings/license', section: 'ADMIN' },
    { icon: Activity, label: 'System Health', path: '/admin/system-health', section: 'OPERATE' },
    { icon: Settings, label: 'Settings Home', path: '/admin/settings', section: 'OPERATE' },
  ],
  bottomItems: [
    { icon: SlidersHorizontal, label: 'Audit Logs', path: '/admin/settings/audit-logs' },
    { icon: Cpu, label: 'Operations', path: '/admin/operations' },
  ],
  searchShortcuts: [
    { label: 'Onboarding', path: '/admin/onboarding', hint: 'Deployment and go-live wizard', keywords: ['setup', 'deploy'] },
    { label: 'Add Application', path: '/admin/applications/add', hint: 'Register a new application', keywords: ['app', 'register'] },
    { label: 'User Management', path: '/admin/settings/users', hint: 'Manage organization users', keywords: ['roles', 'rbac'] },
    { label: 'API Keys', path: '/admin/settings/api-keys', hint: 'Create and rotate org keys', keywords: ['keys', 'tokens'] },
    { label: 'Attribute Mapping', path: '/admin/settings/attribute-mapping', hint: 'Session, user, and tenant mapping', keywords: ['identity', 'tenant'] },
    { label: 'License Usage', path: '/admin/settings/license', hint: 'Capacity and rollout limits', keywords: ['license', 'capacity'] },
    { label: 'System Health', path: '/admin/system-health', hint: 'Controllers and sensors', keywords: ['health', 'status'] },
    { label: 'Audit Logs', path: '/admin/settings/audit-logs', hint: 'Administrative activity trail', keywords: ['audit', 'logs'] },
  ],
  pageLabels: {
    onboarding: 'Onboarding',
    applications: 'Applications',
    settings: 'Settings',
    'system-health': 'System Health',
    operations: 'Operations',
  },
};

export const platformWorkspace: WorkspaceConfig = {
  key: 'platform',
  label: 'Platform Admin Workspace',
  shortLabel: 'Platform',
  badge: 'Internal',
  basePath: '/platform',
  homePath: '/platform/overview',
  navItems: [
    { icon: Globe2, label: 'Overview', path: '/platform/overview', section: 'CONTROL' },
    { icon: Building2, label: 'Tenant Directory', path: '/platform/tenants', section: 'CONTROL' },
    { icon: LifeBuoy, label: 'Infrastructure', path: '/platform/infrastructure', section: 'CONTROL' },
  ],
  bottomItems: [
    { icon: Settings, label: 'Internal Ops', path: '/platform/overview' },
  ],
  searchShortcuts: [
    { label: 'Platform Overview', path: '/platform/overview', hint: 'Internal control-plane summary', keywords: ['internal', 'ops'] },
    { label: 'Tenant Directory', path: '/platform/tenants', hint: 'Tenant-facing account inventory', keywords: ['accounts', 'tenants'] },
    { label: 'Infrastructure', path: '/platform/infrastructure', hint: 'Controller and module posture', keywords: ['infra', 'runtime'] },
  ],
  pageLabels: {
    overview: 'Platform Overview',
    tenants: 'Tenant Directory',
    infrastructure: 'Infrastructure',
  },
};
