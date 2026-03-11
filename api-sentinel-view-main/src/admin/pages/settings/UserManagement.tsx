import React, { useState } from 'react';
import { useTeamData, useCustomRoles } from '@/hooks/use-admin';
import { ArrowLeft, Users, Shield, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { removeUser } from '@/services/admin.service';
import { useQueryClient } from '@tanstack/react-query';

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { data: teamData, isLoading: teamLoading } = useTeamData();
  const { data: rolesData, isLoading: rolesLoading } = useCustomRoles();
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);

  const users = teamData?.users ?? [];
  const pendingInvites = teamData?.pendingInvitees ?? [];
  const roles = rolesData?.customRoles ?? [];

  const handleRemove = async (email: string) => {
    if (!confirm(`Remove user ${email}?`)) return;
    setRemoving(email);
    try {
      await removeUser(email);
      qc.invalidateQueries({ queryKey: ['admin', 'team'] });
    } catch { /* handled by toast */ }
    setRemoving(null);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/settings')} className="p-2 rounded-lg hover:bg-bg-hover text-muted-foreground hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">User & Role Administration</h1>
          <p className="text-xs text-muted-foreground">Manage users, roles, and pending invitations</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center gap-2">
          <Users size={16} className="text-brand" />
          <span className="text-sm font-semibold text-text-primary">Team Members ({users.length})</span>
        </div>
        {teamLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">No team members found</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-muted-foreground">
                <th className="text-left px-5 py-2.5 font-medium">User</th>
                <th className="text-left px-5 py-2.5 font-medium">Role</th>
                <th className="text-left px-5 py-2.5 font-medium">Last Login</th>
                <th className="text-right px-5 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.login} className="border-b border-border-subtle hover:bg-bg-hover">
                  <td className="px-5 py-3">
                    <div className="text-text-primary font-medium">{u.name || u.login}</div>
                    <div className="text-muted-foreground">{u.login}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded bg-brand/10 text-brand font-semibold uppercase text-[10px]">{u.role}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {u.lastLoginTs ? new Date(u.lastLoginTs).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleRemove(u.login)}
                      disabled={removing === u.login}
                      className="p-1.5 rounded hover:bg-[#EF4444]/10 text-muted-foreground hover:text-[#EF4444] transition-colors disabled:opacity-50"
                    >
                      {removing === u.login ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <span className="text-sm font-semibold text-text-primary">Pending Invitations ({pendingInvites.length})</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {pendingInvites.map(email => (
              <div key={email} className="px-5 py-3 text-xs text-muted-foreground">{email}</div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Roles */}
      <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center gap-2">
          <Shield size={16} className="text-brand" />
          <span className="text-sm font-semibold text-text-primary">Custom Roles ({roles.length})</span>
        </div>
        {rolesLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
        ) : roles.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">No custom roles defined</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {roles.map(r => (
              <div key={r.name} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-text-primary">{r.name}</div>
                  {r.baseRole && <div className="text-[10px] text-muted-foreground">Base: {r.baseRole}</div>}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {r.apiCollectionIds?.length ?? 0} collections
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
