import React, { useState } from 'react';
import { ArrowLeft, Globe, Terminal, Upload, Wifi, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { post } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

type TrafficSource = 'burp' | 'aws' | 'nginx' | 'envoy' | 'manual' | null;

const TRAFFIC_SOURCES: Array<{ id: TrafficSource; label: string; icon: React.FC<{ size?: number }>; desc: string }> = [
  { id: 'burp', label: 'Burp Suite', icon: Terminal, desc: 'Send traffic via Burp Suite proxy extension' },
  { id: 'aws', label: 'AWS Traffic Mirroring', icon: Wifi, desc: 'Mirror VPC traffic to Akto collector' },
  { id: 'nginx', label: 'NGINX / Kong', icon: Globe, desc: 'Use API gateway plugin to forward traffic' },
  { id: 'envoy', label: 'Envoy Proxy', icon: Globe, desc: 'Configure Envoy sidecar to send traffic' },
  { id: 'manual', label: 'Manual Upload', icon: Upload, desc: 'Upload HAR, Postman, or Swagger files' },
];

const AddApplication: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [appName, setAppName] = useState('');
  const [selectedSource, setSelectedSource] = useState<TrafficSource>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [collectionId, setCollectionId] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!appName.trim()) return;
    setCreating(true);
    try {
      const res = await post<{ id?: number }>('/api/createCollection', { collectionName: appName.trim() });
      setCollectionId(res?.id ?? null);
      setCreated(true);
      qc.invalidateQueries({ queryKey: ['discovery', 'collections'] });
      setStep(2);
    } catch {
      // error handled
    }
    setCreating(false);
  };

  const aktoToken = `AKTO_TOKEN=<your-api-key>`;
  const collectorUrl = `AKTO_COLLECTOR_URL=http://<your-server>:9090`;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/organization')} className="p-2 rounded-lg hover:bg-bg-hover text-muted-foreground hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Add Application</h1>
          <p className="text-xs text-muted-foreground">Register a new application and connect API traffic</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? 'bg-brand text-white' : 'bg-bg-elevated text-muted-foreground'}`}>
              {step > s ? <CheckCircle2 size={14} /> : s}
            </div>
            <span className={`text-xs font-medium ${step >= s ? 'text-text-primary' : 'text-muted-foreground'}`}>
              {s === 1 ? 'Name' : s === 2 ? 'Traffic Source' : 'Connect'}
            </span>
            {s < 3 && <div className={`w-12 h-px ${step > s ? 'bg-brand' : 'bg-bg-elevated'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Name */}
      {step === 1 && (
        <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Application Name</label>
            <input
              type="text"
              value={appName}
              onChange={e => setAppName(e.target.value)}
              placeholder="e.g., customer-api-prod"
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary placeholder-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-all"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!appName.trim() || creating}
            className="px-5 py-2.5 rounded-lg bg-brand text-sm font-bold text-white hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            Create Application
          </button>
        </div>
      )}

      {/* Step 2: Traffic Source */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose how to send API traffic to the platform:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TRAFFIC_SOURCES.map(src => (
              <button
                key={src.id}
                onClick={() => { setSelectedSource(src.id); setStep(3); }}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${selectedSource === src.id ? 'border-brand bg-brand/5' : 'border-border-subtle bg-bg-surface hover:border-brand/30'}`}
              >
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand shrink-0">
                  <src.icon size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-text-primary">{src.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{src.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Connection Instructions */}
      {step === 3 && (
        <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 space-y-5">
          {created && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/20 text-xs text-[#22C55E]">
              <CheckCircle2 size={14} />
              Application "{appName}" created successfully{collectionId ? ` (ID: ${collectionId})` : ''}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Connect via {TRAFFIC_SOURCES.find(s => s.id === selectedSource)?.label}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Configure your traffic source with the following environment variables:
            </p>

            <div className="space-y-2">
              {[aktoToken, collectorUrl].map(line => (
                <div key={line} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bg-base border border-border-subtle">
                  <code className="text-xs text-text-primary flex-1 font-mono">{line}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(line)}
                    className="p-1 rounded hover:bg-bg-hover text-muted-foreground hover:text-brand transition-colors"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-2">
            <p>Once traffic starts flowing, endpoints will appear automatically in the Discovery section within minutes.</p>
            <p>For detailed setup instructions, refer to the Akto documentation for your chosen traffic source.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/discovery')}
              className="px-5 py-2.5 rounded-lg bg-brand text-sm font-bold text-white hover:bg-brand/90 transition-colors"
            >
              Go to Discovery
            </button>
            <button
              onClick={() => navigate('/organization')}
              className="px-5 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-muted-foreground hover:text-text-primary hover:border-brand/30 transition-colors"
            >
              Back to Organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddApplication;
