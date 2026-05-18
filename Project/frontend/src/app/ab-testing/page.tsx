'use client';

import { useState } from 'react';
import { Plus, FlaskConical, Square, Trash2, BarChart2 } from 'lucide-react';
import { useABTests, useCreateABTest, useStopABTest, useDeleteABTest, useABTestComparison } from '@/hooks/useABTests';
import { useModels } from '@/hooks/useModels';
import { Badge, Button, Card, Spinner, EmptyState, Modal, Input, Textarea, StatCard } from '@/components/ui';
import { formatDate, relativeTime, formatAccuracy, formatLatency } from '@/lib/utils';
import type { ABTest } from '@/lib/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

function CreateABTestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mutate: create, isPending } = useCreateABTest();
  const { data: models = [] } = useModels();
  const [form, setForm] = useState({
    name: '', description: '', model_a_id: '', model_b_id: '', model_a_traffic: 50,
  });
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    create(
      {
        name: form.name,
        description: form.description,
        model_a_id: form.model_a_id,
        model_b_id: form.model_b_id,
        model_a_traffic: form.model_a_traffic,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Start A/B Test" width="max-w-xl">
      <div className="space-y-4">
        <Input label="Test Name" placeholder="e.g. fraud-detector-v2-vs-v3"
          value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Textarea label="Description" placeholder="What hypothesis are you testing?"
          rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-2"
              style={{ color: 'var(--text-secondary)' }}>
              Model A (Control)
            </label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--bg-border)', color: 'var(--text-primary)' }}
              value={form.model_a_id} onChange={(e) => set('model_a_id', e.target.value)}
            >
              <option value="">— Select —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name} v{m.version}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono uppercase tracking-wider block mb-2"
              style={{ color: 'var(--text-secondary)' }}>
              Model B (Challenger)
            </label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--bg-border)', color: 'var(--text-primary)' }}
              value={form.model_b_id} onChange={(e) => set('model_b_id', e.target.value)}
            >
              <option value="">— Select —</option>
              {models.filter((m) => m.id !== form.model_a_id).map((m) => (
                <option key={m.id} value={m.id}>{m.name} v{m.version}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Traffic slider */}
        <div>
          <div className="flex justify-between text-xs font-mono mb-2">
            <span style={{ color: 'var(--accent-cyan)' }}>A: {form.model_a_traffic}%</span>
            <span style={{ color: 'var(--accent-green)' }}>B: {100 - form.model_a_traffic}%</span>
          </div>
          <div className="relative h-8 flex items-center">
            <div className="w-full h-2 rounded-full overflow-hidden flex">
              <div className="h-full transition-all duration-200"
                style={{ width: `${form.model_a_traffic}%`, background: 'var(--accent-cyan)' }} />
              <div className="h-full flex-1" style={{ background: 'var(--accent-green)' }} />
            </div>
            <input
              type="range" min="10" max="90" step="5"
              value={form.model_a_traffic}
              onChange={(e) => set('model_a_traffic', Number(e.target.value))}
              className="absolute w-full opacity-0 h-8 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            <span>Model A (Control)</span><span>Model B (Challenger)</span>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={isPending}
            disabled={!form.name || !form.model_a_id || !form.model_b_id}
            onClick={handleSubmit}>
            <FlaskConical size={14} /> Start Experiment
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ComparisonModal({ open, onClose, test }: { open: boolean; onClose: () => void; test: ABTest | null }) {
  const { data: comparison, isLoading } = useABTestComparison(test?.id ?? '');
  if (!test) return null;

  const chartData = comparison?.model_a.map((a, i) => ({
    name: new Date(a.timestamp).getHours() + 'h',
    'Model A Accuracy': +(a.accuracy * 100).toFixed(2),
    'Model B Accuracy': +(comparison.model_b[i]?.accuracy * 100 || 0).toFixed(2),
    'Model A Latency': +a.latency_p50.toFixed(1),
    'Model B Latency': +(comparison.model_b[i]?.latency_p50 || 0).toFixed(1),
  })) ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`Comparison: ${test.name}`} width="max-w-3xl">
      {isLoading ? (
        <Spinner />
      ) : chartData.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          No metrics data yet. Metrics will appear once traffic is being served.
        </p>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Accuracy Comparison (%)
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <YAxis domain={[85, 100]} tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12, fontFamily: 'DM Sans' }} />
                <Bar dataKey="Model A Accuracy" fill="#00D4FF" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Model B Accuracy" fill="#00FF88" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Latency P50 (ms)
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4B6080', fontFamily: 'JetBrains Mono' }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E2D45', borderRadius: 8, fontSize: 12 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12, fontFamily: 'DM Sans' }} />
                <Bar dataKey="Model A Latency" fill="#FFB800" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Model B Latency" fill="#A855F7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ABTestCard({ test }: { test: ABTest }) {
  const { mutate: stop, isPending: stopping } = useStopABTest();
  const { mutate: del, isPending: deleting } = useDeleteABTest();
  const [showComparison, setShowComparison] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <>
      <Card>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
                {test.name}
              </h3>
              <Badge status={test.status} />
            </div>
            {test.description && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{test.description}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowComparison(true)}>
              <BarChart2 size={13} />
            </Button>
            {test.status === 'running' && (
              <Button variant="ghost" size="sm" loading={stopping} onClick={() => stop(test.id)}>
                <Square size={13} />
              </Button>
            )}
            {confirmDel ? (
              <>
                <Button variant="danger" size="sm" loading={deleting} onClick={() => del(test.id)}>Yes</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>✕</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </div>

        {/* Traffic visual */}
        <div className="mb-3">
          <div className="h-2 rounded-full overflow-hidden flex"
            style={{ background: 'var(--bg-border)' }}>
            <div className="h-full transition-all"
              style={{ width: `${test.model_a_traffic}%`, background: 'var(--accent-cyan)' }} />
            <div className="h-full flex-1" style={{ background: 'var(--accent-green)' }} />
          </div>
          <div className="flex justify-between text-xs font-mono mt-1.5">
            <span style={{ color: 'var(--accent-cyan)' }}>A · {test.model_a_traffic}%</span>
            <span style={{ color: 'var(--accent-green)' }}>B · {test.model_b_traffic}%</span>
          </div>
        </div>

        <div className="flex justify-between text-xs border-t pt-3"
          style={{ borderColor: 'var(--bg-border)', color: 'var(--text-muted)' }}>
          <span>Started {relativeTime(test.start_date)}</span>
          {test.end_date && <span>Ended {relativeTime(test.end_date)}</span>}
          {test.winner_model_id && (
            <span style={{ color: 'var(--accent-green)' }}>🏆 Winner declared</span>
          )}
        </div>
      </Card>
      <ComparisonModal open={showComparison} onClose={() => setShowComparison(false)} test={test} />
    </>
  );
}

export default function ABTestingPage() {
  const { data: tests = [], isLoading } = useABTests();
  const [createOpen, setCreateOpen] = useState(false);

  const running = tests.filter((t) => t.status === 'running').length;
  const completed = tests.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Tests" value={tests.length} icon={<FlaskConical size={16} />} color="purple" />
        <StatCard label="Running" value={running} icon={<FlaskConical size={16} />} color="green" />
        <StatCard label="Completed" value={completed} icon={<FlaskConical size={16} />} color="cyan" />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="font-semibold font-display" style={{ color: 'var(--text-primary)' }}>
          Experiments
        </h2>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New A/B Test
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : tests.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FlaskConical size={40} />}
            title="No A/B tests yet"
            description="Compare model versions with controlled traffic splitting"
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> Start Experiment
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tests.map((t) => <ABTestCard key={t.id} test={t} />)}
        </div>
      )}

      <CreateABTestModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
