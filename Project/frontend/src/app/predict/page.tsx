'use client';

import { useState } from 'react';
import { predictApi } from '@/lib/api';
import { useModels } from '@/hooks/useModels';
import { useDeployments } from '@/hooks/useDeployments';
import { Card, Button, Select } from '@/components/ui';
import { formatLatency, formatDate } from '@/lib/utils';
import { Cpu, Play, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PredictResponse } from '@/lib/types';

interface HistoryEntry {
  id: number;
  payload: string;
  response: PredictResponse;
  ts: string;
}

export default function PredictPage() {
  const { data: models = [] } = useModels();
  const { data: deployments = [] } = useDeployments();

  const [modelId, setModelId] = useState('');
  const [payload, setPayload] = useState('{\n  "sepal_length": 5.1,\n  "sepal_width": 3.5,\n  "petal_length": 1.4,\n  "petal_width": 0.2\n}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [jsonError, setJsonError] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  const handleRun = async () => {
    setJsonError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setJsonError('Invalid JSON — please fix the syntax above.');
      return;
    }

    setLoading(true);
    try {
      const res = await predictApi.predict({
        model_id: modelId || undefined,
        features: parsed,
      });
      setResult(res);
      setHistory((h) => [
        { id: Date.now(), payload, response: res, ts: new Date().toISOString() },
        ...h.slice(0, 9),
      ]);
      toast.success(`Prediction in ${formatLatency(res.latency_ms)}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const activeDeployments = deployments.filter((d) => d.status === 'running');

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input Panel */}
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold font-display text-sm mb-4 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}>
              <Cpu size={16} style={{ color: 'var(--accent-cyan)' }} />
              Inference Request
            </h3>

            <div className="space-y-4">
              {/* Model selector */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider block mb-2"
                  style={{ color: 'var(--text-secondary)' }}>
                  Target Model (optional — uses active deployment if blank)
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--bg-border)', color: 'var(--text-primary)' }}
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  <option value="">— Active Deployment —</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} v{m.version}
                    </option>
                  ))}
                </select>
              </div>

              {/* JSON payload editor */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider block mb-2"
                  style={{ color: 'var(--text-secondary)' }}>
                  Feature Payload (JSON)
                </label>
                <textarea
                  rows={10}
                  className="w-full px-4 py-3 rounded-lg text-sm font-mono outline-none border resize-none focus:border-cyan-500/50"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderColor: jsonError ? 'var(--accent-red)' : 'var(--bg-border)',
                    color: 'var(--text-primary)',
                    lineHeight: '1.6',
                  }}
                  value={payload}
                  onChange={(e) => {
                    setPayload(e.target.value);
                    setJsonError('');
                  }}
                  spellCheck={false}
                />
                {jsonError && (
                  <p className="text-xs mt-1 font-mono" style={{ color: 'var(--accent-red)' }}>
                    ⚠ {jsonError}
                  </p>
                )}
              </div>

              <Button variant="primary" fullWidth onClick={handleRun} loading={loading} size="lg">
                <Play size={15} /> Run Inference
              </Button>
            </div>
          </Card>

          {/* Active deployments info */}
          {activeDeployments.length > 0 && (
            <Card>
              <h4 className="text-xs font-mono uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-muted)' }}>
                Available Endpoints
              </h4>
              <div className="space-y-2">
                {activeDeployments.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{d.name}</span>
                    <span className="font-mono truncate ml-3 max-w-[160px]"
                      style={{ color: 'var(--text-muted)' }}>
                      {d.endpoint_url}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Result Panel */}
        <div className="space-y-4">
          <Card className="min-h-[200px]">
            <h3 className="font-semibold font-display text-sm mb-4 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}>
              <Play size={16} style={{ color: 'var(--accent-green)' }} />
              Result
            </h3>

            {!result ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Cpu size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--accent-cyan)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Run inference to see results
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Prediction value */}
                <div
                  className="p-4 rounded-xl text-center gradient-border"
                  style={{ background: 'var(--bg-secondary)' }}
                >
                  <p className="text-xs font-mono uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-muted)' }}>
                    Prediction
                  </p>
                  <p className="text-3xl font-bold font-display" style={{ color: 'var(--accent-cyan)' }}>
                    {typeof result.prediction === 'object'
                      ? JSON.stringify(result.prediction)
                      : String(result.prediction)}
                  </p>
                  {result.prediction_label && (
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {result.prediction_label}
                    </p>
                  )}
                  {result.confidence !== undefined && (
                    <p className="text-sm font-mono mt-2" style={{ color: 'var(--accent-green)' }}>
                      {(result.confidence * 100).toFixed(1)}% confidence
                    </p>
                  )}
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Latency', value: formatLatency(result.latency_ms), color: 'var(--accent-amber)' },
                    { label: 'Model', value: result.model_version || result.model_id, color: 'var(--accent-cyan)' },
                    { label: 'Timestamp', value: formatDate(result.timestamp), color: 'var(--text-secondary)' },
                    { label: 'Model ID', value: result.model_id.slice(0, 12) + '…', color: 'var(--text-secondary)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{label}</p>
                      <p className="text-xs mt-1 font-medium truncate" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* History */}
          {history.length > 0 && (
            <Card>
              <h4 className="font-semibold font-display text-sm mb-3 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}>
                <Clock size={14} /> Request History
              </h4>
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id}>
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                      style={{ border: '1px solid var(--bg-border)' }}
                      onClick={() =>
                        setExpandedHistory(expandedHistory === h.id ? null : h.id)
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono px-2 py-0.5 rounded"
                          style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--accent-cyan)' }}>
                          {typeof h.response.prediction === 'object'
                            ? '{ obj }'
                            : String(h.response.prediction).slice(0, 12)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatLatency(h.response.latency_ms)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {new Date(h.ts).toLocaleTimeString()}
                        </span>
                        {expandedHistory === h.id
                          ? <ChevronUp size={12} style={{ color: 'var(--text-muted)' }} />
                          : <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    </button>
                    {expandedHistory === h.id && (
                      <pre
                        className="mt-1 p-3 rounded-lg text-xs font-mono overflow-x-auto"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      >
                        {JSON.stringify(h.response, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
