'use client';

import { Boxes, Rocket, FlaskConical, Activity, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { useDashboardSummary } from '@/hooks/useMetrics';
import { useModels } from '@/hooks/useModels';
import { useDeployments } from '@/hooks/useDeployments';
import { useABTests } from '@/hooks/useABTests';
import { StatCard, Card, Badge, Spinner } from '@/components/ui';
import { formatAccuracy, formatLatency, formatNumber, relativeTime } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from 'recharts';
import Link from 'next/link';

// Demo sparkline data for when API is loading
const DEMO_LATENCY = Array.from({ length: 12 }, (_, i) => ({
  t: `${i * 2}h`,
  latency: 40 + Math.sin(i * 0.7) * 15 + Math.random() * 10,
}));

const DEMO_ACCURACY = Array.from({ length: 12 }, (_, i) => ({
  t: `${i * 2}h`,
  accuracy: 0.90 + Math.sin(i * 0.4) * 0.03 + Math.random() * 0.01,
}));

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: models = [] } = useModels();
  const { data: deployments = [] } = useDeployments();
  const { data: abTests = [] } = useABTests();

  const activeDeployments = deployments.filter((d) => d.status === 'running');
  const runningTests = abTests.filter((t) => t.status === 'running');

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Models"
          value={summaryLoading ? '—' : (summary?.total_models ?? models.length)}
          sub={`${models.filter((m) => m.status === 'active').length} active`}
          icon={<Boxes size={18} />}
          color="cyan"
        />
        <StatCard
          label="Active Deployments"
          value={summaryLoading ? '—' : (summary?.active_deployments ?? activeDeployments.length)}
          sub="Live endpoints"
          icon={<Rocket size={18} />}
          color="green"
        />
        <StatCard
          label="Running A/B Tests"
          value={summaryLoading ? '—' : (summary?.running_ab_tests ?? runningTests.length)}
          sub="Experiments live"
          icon={<FlaskConical size={18} />}
          color="purple"
        />
        <StatCard
          label="Requests Today"
          value={summaryLoading ? '—' : formatNumber(summary?.total_requests_today ?? 0)}
          sub={summary ? `Avg ${formatLatency(summary.avg_latency_ms)} latency` : 'Loading…'}
          icon={<Activity size={18} />}
          color="amber"
          trend={{ value: 12.4, label: 'vs yesterday' }}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latency Chart */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
                Avg Inference Latency
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Last 24 hours (ms)
              </p>
            </div>
            <Zap size={16} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={DEMO_LATENCY} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
              <YAxis tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94A3B8' }}
                itemStyle={{ color: '#00D4FF' }}
              />
              <Area type="monotone" dataKey="latency" stroke="#00D4FF" strokeWidth={2}
                fill="url(#latGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Accuracy Chart */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
                Model Accuracy Trend
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Last 24 hours (active models)
              </p>
            </div>
            <TrendingUp size={16} style={{ color: 'var(--accent-green)' }} />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={DEMO_ACCURACY} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00FF88" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
              <YAxis domain={[0.85, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, 'Accuracy']}
                itemStyle={{ color: '#00FF88' }}
              />
              <Area type="monotone" dataKey="accuracy" stroke="#00FF88" strokeWidth={2}
                fill="url(#accGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Bottom Row: Recent Models + Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Models */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
              Recent Models
            </h3>
            <Link href="/models" className="text-xs font-mono hover:underline"
              style={{ color: 'var(--accent-cyan)' }}>
              View all →
            </Link>
          </div>
          {models.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
              No models yet. <Link href="/models" className="underline" style={{ color: 'var(--accent-cyan)' }}>Upload one →</Link>
            </p>
          ) : (
            <div className="space-y-2">
              {models.slice(0, 5).map((m) => (
                <Link key={m.id} href={`/models/${m.id}`}>
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ border: '1px solid var(--bg-border)' }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {m.name}
                      </p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        v{m.version} · {m.framework}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono" style={{ color: 'var(--accent-green)' }}>
                        {formatAccuracy(m.accuracy)}
                      </span>
                      <Badge status={m.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Active Deployments */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
              Live Deployments
            </h3>
            <Link href="/deployments" className="text-xs font-mono hover:underline"
              style={{ color: 'var(--accent-cyan)' }}>
              Manage →
            </Link>
          </div>
          {deployments.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
              No deployments yet.
            </p>
          ) : (
            <div className="space-y-2">
              {deployments.slice(0, 5).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                  style={{ border: '1px solid var(--bg-border)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {d.name}
                    </p>
                    <p className="text-xs font-mono truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
                      {d.endpoint_url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {d.traffic_percentage}%
                    </span>
                    <Badge status={d.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* A/B Tests running */}
      {runningTests.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: 'var(--accent-amber)' }} />
            <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
              Active Experiments
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {runningTests.map((t) => (
              <Link key={t.id} href="/ab-testing">
                <div
                  className="px-4 py-3 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.05)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                  <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                    Model A: {t.model_a_traffic}% · Model B: {t.model_b_traffic}%
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Started {relativeTime(t.start_date)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
