'use client';

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Boxes, Search, Trash2, Play, Pause, Eye } from 'lucide-react';
import { useModels, useDeleteModel, useActivateModel, useDeactivateModel } from '@/hooks/useModels';
import { Badge, Button, Card, Spinner, EmptyState, Modal, Input, Textarea, Select } from '@/components/ui';
import { formatAccuracy, formatDate } from '@/lib/utils';
import Link from 'next/link';
import type { ModelVersion } from '@/lib/types';

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [form, setForm] = useState({
    name: '',
    version: 'v1',
    description: '',
    framework: 'scikit-learn',
    owner: 'admin',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const FRAMEWORK_MAP: Record<string, string> = {
    'scikit-learn': 'sklearn',
    'pytorch': 'pytorch',
    'tensorflow': 'tensorflow',
    'xgboost': 'xgboost',
    'other': 'other',
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.pkl')) {
        setError('Only .pkl files are supported by the backend inference engine.');
        setFileName('');
        e.target.value = '';
        return;
      }
      setFileName(file.name);
      setError('');
    }
  };

  const handleSubmit = async () => {
    setError('');
    // Validate
    if (!form.name.trim()) { setError('Model name is required.'); return; }
    if (!form.version.trim()) { setError('Version is required.'); return; }
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please select a .pkl model file.'); return; }

    setLoading(true);
    try {
      // Step 1: Create the model
      const modelRes = await fetch('/api/v1/models/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          framework: FRAMEWORK_MAP[form.framework] ?? form.framework,
          owner: form.owner.trim() || 'admin',
          tags: [],
        }),
      });
      if (!modelRes.ok) {
        const err = await modelRes.json().catch(() => ({}));
        throw new Error(err.detail || `Model creation failed (${modelRes.status})`);
      }
      const model = await modelRes.json();
      const modelId = model.id;

      // Step 2: Upload the .pkl version file
      const versionTag = form.version.startsWith('v') ? form.version : `v${form.version}`;
      const vfd = new FormData();
      vfd.append('version_tag', versionTag);
      vfd.append('file', file);
      const versionRes = await fetch(`/api/v1/models/${modelId}/versions`, {
        method: 'POST',
        body: vfd,
      });
      if (!versionRes.ok) {
        const err = await versionRes.json().catch(() => ({}));
        throw new Error(err.detail || `Version upload failed (${versionRes.status})`);
      }

      // Step 3: Activate the version
      await fetch(`/api/v1/models/${modelId}/activate`, { method: 'POST' });

      qc.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model uploaded & activated!');
      onClose();
      // Reset form
      setForm({ name: '', version: 'v1', description: '', framework: 'scikit-learn', owner: 'admin' });
      setFileName('');
    } catch (e: any) {
      setError(e.message || 'Upload failed. Check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Model" width="max-w-xl">
      <div className="space-y-4">
        {error && (
          <div className="px-3 py-2 rounded-lg text-sm border"
            style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
            ⚠ {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Model Name *" placeholder="e.g. fraud-detector"
            value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Version *" placeholder="e.g. v1.0.0"
            value={form.version} onChange={(e) => set('version', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Owner" placeholder="e.g. admin"
            value={form.owner} onChange={(e) => set('owner', e.target.value)} />
          <Select label="Framework" value={form.framework} onChange={(e) => set('framework', e.target.value)}>
            <option value="scikit-learn">scikit-learn</option>
            <option value="pytorch">PyTorch</option>
            <option value="tensorflow">TensorFlow</option>
            <option value="xgboost">XGBoost</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <Textarea label="Description" placeholder="What does this model do?" rows={2}
          value={form.description} onChange={(e) => set('description', e.target.value)} />

        <div>
          <label className="text-xs font-medium font-mono uppercase tracking-wider block mb-2"
            style={{ color: 'var(--text-secondary)' }}>
            Model File (.pkl only) *
          </label>
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-cyan-500/50 transition-colors"
            style={{ borderColor: fileName ? 'rgba(34,211,238,0.5)' : 'var(--bg-border)' }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={20} className="mx-auto mb-2" style={{ color: fileName ? 'rgb(34,211,238)' : 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: fileName ? 'rgb(34,211,238)' : 'var(--text-muted)' }}>
              {fileName || 'Click to browse — only .pkl files accepted'}
            </p>
            <input ref={fileRef} type="file" accept=".pkl" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            <Upload size={14} /> Upload Model
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModelRow({ model }: { model: ModelVersion }) {
  const { mutate: del, isPending: deleting } = useDeleteModel();
  const { mutate: activate, isPending: activating } = useActivateModel();
  const { mutate: deactivate, isPending: deactivating } = useDeactivateModel();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <tr className="border-b hover:bg-white/[0.02] transition-colors"
      style={{ borderColor: 'var(--bg-border)' }}>
      <td className="px-4 py-3">
        <Link href={`/models/${model.id}`} className="hover:underline"
          style={{ color: 'var(--accent-cyan)' }}>
          <span className="font-medium">{model.name}</span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs px-2 py-0.5 rounded"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          v{model.version}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-mono" style={{ color: 'var(--accent-green)' }}>
          {formatAccuracy(model.accuracy)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{model.framework}</td>
      <td className="px-4 py-3"><Badge status={model.status} /></td>
      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
        {formatDate(model.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Link href={`/models/${model.id}`}>
            <Button variant="ghost" size="sm"><Eye size={13} /></Button>
          </Link>
          {model.status === 'active' ? (
            <Button variant="ghost" size="sm" loading={deactivating}
              onClick={() => deactivate(model.id)}>
              <Pause size={13} />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" loading={activating}
              onClick={() => activate(model.id)}>
              <Play size={13} />
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button variant="danger" size="sm" loading={deleting}
                onClick={() => del(model.id)}>Confirm</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>✕</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = models.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.version.includes(search);
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }} />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none focus:border-cyan-500/50"
            style={{
              background: 'var(--bg-card)', borderColor: 'var(--bg-border)',
              color: 'var(--text-primary)',
            }}
            placeholder="Search models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-sm rounded-lg border outline-none"
          style={{
            background: 'var(--bg-card)', borderColor: 'var(--bg-border)',
            color: 'var(--text-secondary)',
          }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="deprecated">Deprecated</option>
          <option value="training">Training</option>
        </select>
        <Button variant="primary" onClick={() => setUploadOpen(true)}>
          <Plus size={14} /> Upload Model
        </Button>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--bg-border)' }}>
                {['Name', 'Version', 'Accuracy', 'Framework', 'Status', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7}><Spinner /></td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Boxes size={40} />}
                      title="No models found"
                      description="Upload your first model to get started"
                      action={
                        <Button variant="primary" onClick={() => setUploadOpen(true)}>
                          <Plus size={14} /> Upload Model
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((m) => <ModelRow key={m.id} model={m} />)
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--bg-border)' }}>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} model{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </Card>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}