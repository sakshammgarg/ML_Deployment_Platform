'use client';

import { useState } from 'react';
import { Plus, Rocket, RotateCcw, Trash2, Play, Pause, Globe } from 'lucide-react';
import {
  useDeployments, useCreateDeployment, useRollback,
  useDeleteDeployment, useUpdateDeployment,
} from '@/hooks/useDeployments';
import { useModels } from '@/hooks/useModels';
import { Badge, Button, Card, Spinner, EmptyState, Modal, Select, Input, StatCard } from '@/components/ui';
import { formatDate, relativeTime } from '@/lib/utils';
import type { Deployment } from '@/lib/types';

function CreateDeploymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mutate: create, isPending } = useCreateDeployment();
  const { data: models = [] } = useModels();
  const [form, setForm] = useState({ model_id: '', name: '', traffic_percentage: '100' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    create(
      { model_id: form.model_id, name: form.name, traffic_percentage: Number(form.traffic_percentage) },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Deployment">
      <div className="space-y-4">
        <Input label="Deployment Name" placeholder="e.g. prod-fraud-v2"
          value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Select label="Model Version" value={form.model_id}
          onChange={(e) => set('model_id', e.target.value)}>
          <option value="">— Select a model —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} v{m.version} ({(m.accuracy * 100).toFixed(1)}% acc)
            </option>
          ))}
        </Select>
        <div>
          <label className="text-xs font-mono uppercase tracking-wider block mb-2"
            style={{ color: 'var(--text-secondary)' }}>
            Traffic Percentage: <span style={{ color: 'var(--accent-cyan)' }}>{form.traffic_percentage}%</span>
          </label>
          <input
            type="range" min="0" max="100" step="5"
            value={form.traffic_percentage}
            onChange={(e) => set('traffic_percentage', e.target.value)}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-xs font-mono mt-1"
            style={{ color: 'var(--text-muted)' }}>
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={isPending}
            disabled={!form.model_id || !form.name}>
            <Rocket size={14} /> Deploy
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RollbackModal({
  open, onClose, deployment,
}: { open: boolean; onClose: () => void; deployment: Deployment | null }) {
  const { mutate: rollback, isPending } = useRollback();
  const { data: models = [] } = useModels();
  const [targetModelId, setTargetModelId] = useState('');

  if (!deployment) return null;

  return (
    <Modal open={open} onClose={onClose} title="Rollback Deployment">
      <div className="space-y-4">
        <div className="p-3 rounded-lg" style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.2)' }}>
          <p className="text-sm" style={{ color: 'var(--accent-red)' }}>
            ⚠ This will immediately switch traffic to the selected model version.
          </p>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Rolling back: <strong style={{ color: 'var(--text-primary)' }}>{deployment.name}</strong>
        </p>
        <Select label="Rollback to Model" value={targetModelId}
          onChange={(e) => setTargetModelId(e.target.value)}>
          <option value="">— Latest stable version —</option>
          {models.filter((m) => m.id !== deployment.model_id).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} v{m.version}
            </option>
          ))}
        </Select>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={isPending}
            onClick={() => rollback({ id: deployment.id, targetModelId: targetModelId || undefined }, { onSuccess: onClose })}>
            <RotateCcw size={14} /> Confirm Rollback
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeploymentCard({ d, onRollback }: { d: Deployment; onRollback: () => void }) {
  const { mutate: del, isPending: deleting } = useDeleteDeployment();
  const { mutate: update, isPending: updating } = useUpdateDeployment();
  const [confirmDel, setConfirmDel] = useState(false);

  const toggle = () => {
    update({
      id: d.id,
      data: { status: d.status === 'running' ? 'stopped' : 'running' },
    });
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold font-display" style={{ color: 'var(--text-primary)' }}>
              {d.name}
            </h3>
            <Badge status={d.status} />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono"
            style={{ color: 'var(--text-muted)' }}>
            <Globe size={11} />
            <span className="truncate max-w-[240px]">{d.endpoint_url || '/predict'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" loading={updating} onClick={toggle}>
            {d.status === 'running' ? <Pause size={13} /> : <Play size={13} />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRollback}>
            <RotateCcw size={13} />
          </Button>
          {confirmDel ? (
            <>
              <Button variant="danger" size="sm" loading={deleting} onClick={() => del(d.id)}>
                Yes
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>✕</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* Traffic bar */}
      <div>
        <div className="flex justify-between text-xs font-mono mb-1.5">
          <span style={{ color: 'var(--text-muted)' }}>Traffic</span>
          <span style={{ color: 'var(--accent-cyan)' }}>{d.traffic_percentage}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${d.traffic_percentage}%`,
              background: d.status === 'running'
                ? 'linear-gradient(90deg, #00D4FF, #00FF88)'
                : 'var(--text-muted)',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 border-t" style={{ borderColor: 'var(--bg-border)' }}>
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Model Version</p>
          <p className="text-sm font-mono mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {d.model_version || 'Unknown'}
          </p>
        </div>
        <div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Last Active</p>
          <p className="text-sm font-mono mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {d.last_request_at ? relativeTime(d.last_request_at) : formatDate(d.updated_at)}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function DeploymentsPage() {
  const { data: deployments = [], isLoading } = useDeployments();
  const [createOpen, setCreateOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<Deployment | null>(null);

  const running = deployments.filter((d) => d.status === 'running').length;
  const stopped = deployments.filter((d) => d.status === 'stopped').length;
  const errors = deployments.filter((d) => d.status === 'error').length;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total" value={deployments.length} icon={<Rocket size={16} />} color="cyan" />
        <StatCard label="Running" value={running} icon={<Play size={16} />} color="green" />
        <StatCard label="Stopped" value={stopped} icon={<Pause size={16} />} color="amber" />
        <StatCard label="Errors" value={errors} icon={<Rocket size={16} />} color={errors > 0 ? 'red' : 'cyan'} />
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <h2 className="font-semibold font-display" style={{ color: 'var(--text-primary)' }}>
          All Deployments
        </h2>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New Deployment
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <Spinner />
      ) : deployments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Rocket size={40} />}
            title="No deployments yet"
            description="Deploy a model to start serving predictions"
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> Create Deployment
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deployments.map((d) => (
            <DeploymentCard key={d.id} d={d} onRollback={() => setRollbackTarget(d)} />
          ))}
        </div>
      )}

      <CreateDeploymentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <RollbackModal
        open={!!rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        deployment={rollbackTarget}
      />
    </div>
  );
}
