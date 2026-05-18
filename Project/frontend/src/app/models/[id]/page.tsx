'use client';

import { use } from 'react';
import { useModel } from '@/hooks/useModels';
import { useModelMetrics } from '@/hooks/useMetrics';
import { Badge, Card, Spinner, Button, StatCard } from '@/components/ui';
import { formatAccuracy, formatDate, formatLatency } from '@/lib/utils';
import { ArrowLeft, Zap, TrendingUp, Activity, Clock } from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts';

export default function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: model, isLoading } = useModel(id);
  const { data: metrics = [] } = useModelMetrics(id, 24);

  if (isLoading) return <Spinner size={28} />;
  if (!model) return <p style={{ color: 'var(--text-muted)' }}>Model not found.</p>;

  const latestMetric = metrics[metrics.length - 1];

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/models">
          <Button variant="ghost" size="sm"><ArrowLeft size={14} /> Back</Button>
        </Link>
        <span style={{ color: 'var(--text-muted)' }}>/</span>
        <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
          {model.name}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
              {model.name}
            </h2>
            <Badge status={model.status} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {model.description || 'No description provided.'}
          </p>
        </div>
        <span className="font-mono text-sm px-3 py-1 rounded-lg"
          style={{ background: 'var(--bg-secondary)', color: 'var(--accent-cyan)', border: '1px solid var(--bg-border)' }}>
          v{model.version}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Accuracy" value={formatAccuracy(model.accuracy)} icon={<TrendingUp size={16} />} color="green" />
        <StatCard label="Framework" value={model.framework} icon={<Activity size={16} />} color="cyan" />
        <StatCard
          label="P50 Latency"
          value={latestMetric ? formatLatency(latestMetric.latency_p50) : '—'}
          icon={<Zap size={16} />}
          color="amber"
        />
        <StatCard
          label="Error Rate"
          value={latestMetric ? `${(latestMetric.error_rate * 100).toFixed(2)}%` : '—'}
          icon={<Clock size={16} />}
          color={latestMetric?.error_rate > 0.05 ? 'red' : 'cyan'}
        />
      </div>

      {/* Charts */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
              Latency Over Time
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={metrics} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).getHours() + 'h'}
                  tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="latency_p50" name="P50" stroke="#00D4FF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="latency_p95" name="P95" stroke="#FFB800" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
              Request Volume
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={metrics} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A855F7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).getHours() + 'h'}
                  tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="request_count" name="Requests" stroke="#A855F7"
                  strokeWidth={2} fill="url(#reqGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* Metadata */}
      <Card>
        <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
          Model Metadata
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Model ID', value: model.id },
            { label: 'Version', value: `v${model.version}` },
            { label: 'Framework', value: model.framework },
            { label: 'Status', value: model.status },
            { label: 'Created', value: formatDate(model.created_at) },
            { label: 'Updated', value: formatDate(model.updated_at) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-mono uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}>{label}</p>
              <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
        {model.metadata && Object.keys(model.metadata).length > 0 && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--bg-border)' }}>
            <p className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Extra Metadata
            </p>
            <pre className="text-xs font-mono p-3 rounded-lg overflow-x-auto"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {JSON.stringify(model.metadata, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
