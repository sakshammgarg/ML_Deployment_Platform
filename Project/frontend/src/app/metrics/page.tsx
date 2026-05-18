'use client';

import { useState } from 'react';
import { useAllMetrics } from '@/hooks/useMetrics';
import { useModels } from '@/hooks/useModels';
import { Card, Spinner, StatCard } from '@/components/ui';
import { formatAccuracy, formatLatency } from '@/lib/utils';
import { BarChart3, Zap, TrendingUp, AlertCircle, Activity } from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

const HOURS_OPTIONS = [
  { label: '6h', value: 6 },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
  { label: '7d', value: 168 },
];

export default function MetricsPage() {
  const [hours, setHours] = useState(24);
  const [selectedModel, setSelectedModel] = useState('all');
  const { data: metrics = [], isLoading } = useAllMetrics(hours);
  const { data: models = [] } = useModels();

  const filtered = selectedModel === 'all'
    ? metrics
    : metrics.filter((m) => m.model_id === selectedModel);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgAccuracy = avg(filtered.map((m) => m.accuracy));
  const avgLatency = avg(filtered.map((m) => m.latency_p50));
  const avgErrorRate = avg(filtered.map((m) => m.error_rate));
  const totalRequests = filtered.reduce((a, b) => a + b.request_count, 0);

  const chartData = filtered.map((m) => ({
    t: new Date(m.timestamp).getHours() + ':00',
    accuracy: +(m.accuracy * 100).toFixed(2),
    latency_p50: +m.latency_p50.toFixed(1),
    latency_p95: +m.latency_p95.toFixed(1),
    requests: m.request_count,
    errors: +(m.error_rate * 100).toFixed(2),
    throughput: +m.throughput.toFixed(2),
  }));

  // Radar data for last snapshot
  const last = filtered[filtered.length - 1];
  const radarData = last
    ? [
        { subject: 'Accuracy', value: +(last.accuracy * 100).toFixed(1) },
        { subject: 'Throughput', value: Math.min(last.throughput * 10, 100) },
        { subject: 'Reliability', value: +((1 - last.error_rate) * 100).toFixed(1) },
        { subject: 'Speed', value: Math.max(0, 100 - last.latency_p50) },
        { subject: 'P95 Perf', value: Math.max(0, 100 - last.latency_p95 * 0.5) },
      ]
    : [];

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)' }}>
          {HOURS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setHours(o.value)}
              className="px-3 py-1.5 rounded-md text-xs font-mono transition-all"
              style={
                hours === o.value
                  ? { background: 'rgba(0,212,255,0.15)', color: 'var(--accent-cyan)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          className="px-3 py-2 text-sm rounded-lg border outline-none"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--bg-border)', color: 'var(--text-secondary)' }}
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          <option value="all">All Models</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name} v{m.version}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Avg Accuracy" value={filtered.length > 0 ? formatAccuracy(avgAccuracy) : '—'}
          icon={<TrendingUp size={16} />} color="green" />
        <StatCard label="Avg P50 Latency" value={filtered.length > 0 ? formatLatency(avgLatency) : '—'}
          icon={<Zap size={16} />} color="cyan" />
        <StatCard label="Avg Error Rate"
          value={filtered.length > 0 ? `${(avgErrorRate * 100).toFixed(2)}%` : '—'}
          icon={<AlertCircle size={16} />} color={avgErrorRate > 0.05 ? 'red' : 'green'} />
        <StatCard label="Total Requests" value={totalRequests.toLocaleString()}
          icon={<Activity size={16} />} color="amber" />
      </div>

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
            No metrics data available for this time range.
          </p>
        </Card>
      ) : (
        <>
          {/* Accuracy + Error Rate */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                Accuracy Over Time
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00FF88" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => v + '%'}
                    tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v + '%', 'Accuracy']} />
                  <Area type="monotone" dataKey="accuracy" stroke="#00FF88" strokeWidth={2}
                    fill="url(#accG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                Error Rate (%)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="errG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF3B5C" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#FF3B5C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                  <YAxis tickFormatter={(v) => v + '%'}
                    tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v + '%', 'Error Rate']} />
                  <Area type="monotone" dataKey="errors" stroke="#FF3B5C" strokeWidth={2}
                    fill="url(#errG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Latency */}
          <Card>
            <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
              Latency Percentiles (ms)
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12, fontFamily: 'DM Sans' }} />
                <Line type="monotone" dataKey="latency_p50" name="P50" stroke="#00D4FF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="latency_p95" name="P95" stroke="#FFB800" strokeWidth={1.5}
                  strokeDasharray="5 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Throughput + Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                Throughput (req/s)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="thrG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A855F7" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="throughput" name="Throughput" stroke="#A855F7"
                    strokeWidth={2} fill="url(#thrG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {radarData.length > 0 && (
              <Card>
                <h3 className="font-semibold font-display text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                  Health Radar (Latest)
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="subject"
                      tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#00D4FF" fill="#00D4FF" fillOpacity={0.15} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
