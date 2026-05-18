import axios from 'axios';
import type {
  ModelVersion,
  Deployment,
  ABTest,
  MetricsSnapshot,
  DashboardSummary,
  PredictRequest,
  PredictResponse,
  ComparisonMetrics,
} from './types';

const BASE_URL =
  typeof window !== 'undefined'
    ? '/api/v1'
    : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`;

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.detail ||
      err?.response?.data?.message ||
      err?.message ||
      'Unknown error';
    return Promise.reject(new Error(msg));
  }
);

// ─────────────────────────────────────
// Framework value mapping
// ─────────────────────────────────────
const FRAMEWORK_MAP: Record<string, string> = {
  'scikit-learn': 'sklearn',
  'scikit_learn': 'sklearn',
};

function mapFramework(value: string): string {
  return FRAMEWORK_MAP[value.toLowerCase().trim()] ?? value;
}

// ─────────────────────────────────────
// Models
// ─────────────────────────────────────
export const modelsApi = {
  list: () =>
    api.get<ModelVersion[]>('/models/').then((r) => r.data),

  get: (id: string) =>
    api.get<ModelVersion>(`/models/${id}`).then((r) => r.data),

  /**
   * Two-step upload:
   *  1. POST /models/  — creates the model record (JSON)
   *  2. POST /models/{id}/versions — uploads the .pkl file (multipart)
   *
   * The form sends FormData with: name, version, description, framework, accuracy, file
   */
  create: async (formData: FormData | Record<string, unknown>): Promise<ModelVersion> => {
    if (formData instanceof FormData) {
      // ── Extract fields from FormData ──────────────────────────────
      const name        = String(formData.get('name') ?? '').trim();
      const version_tag = String(formData.get('version') ?? 'v1').trim();
      const description = String(formData.get('description') ?? '').trim();
      const framework   = mapFramework(String(formData.get('framework') ?? 'sklearn'));
      const accuracy    = parseFloat(String(formData.get('accuracy') ?? '0')) || 0;
      const file        = formData.get('file') as File | null;

      if (!name) throw new Error('Model name is required');

      // ── Step 1: Create the model ──────────────────────────────────
      const modelRes = await api.post<{ id: string }>('/models/', {
        name,
        description: description || undefined,
        framework,
        owner: 'admin',          // default owner; form doesn't collect this
        tags: [],
      });

      const modelId = (modelRes.data as any).id;

      // ── Step 2: Upload the version file (if provided) ─────────────
      if (file) {
        const versionTag = version_tag.startsWith('v') ? version_tag : `v${version_tag}`;
        const vfd = new FormData();
        vfd.append('version_tag', versionTag);
        vfd.append('file', file);

        await api.post(
          `/models/${modelId}/versions`,
          vfd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        // ── Step 3: Activate the version so it's ready to deploy ─────
        await api.post(`/models/${modelId}/activate`).catch(() => null);
      }

      // Return the enriched model from the bridge endpoint
      const finalModel = await api.get<ModelVersion>(`/models/${modelId}`);
      return finalModel.data;
    }

    // Plain JSON body path (no file)
    const body = {
      ...formData,
      framework: mapFramework(String((formData as Record<string, unknown>).framework ?? 'sklearn')),
    };
    return api.post<ModelVersion>('/models/', body).then((r) => r.data);
  },

  update: (id: string, data: Partial<ModelVersion>) =>
    api.patch<ModelVersion>(`/models/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/models/${id}`).then((r) => r.data),

  activate: (id: string) =>
    api.post<ModelVersion>(`/models/${id}/activate`).then((r) => r.data),

  deactivate: (id: string) =>
    api.post<ModelVersion>(`/models/${id}/deactivate`).then((r) => r.data),
};

// ─────────────────────────────────────
// Deployments
// ─────────────────────────────────────
export const deploymentsApi = {
  list: () =>
    api.get<Deployment[]>('/deployments/').then((r) => r.data),

  get: (id: string) =>
    api.get<Deployment>(`/deployments/${id}`).then((r) => r.data),

  create: (data: { model_id: string; name: string; traffic_percentage: number }) =>
    api.post<Deployment>('/deployments/', data).then((r) => r.data),

  update: (id: string, data: Partial<Deployment>) =>
    api.put<Deployment>(`/deployments/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/deployments/${id}`).then((r) => r.data),

  activate: (id: string) =>
    api.post<Deployment>(`/deployments/${id}/activate`).then((r) => r.data),

  deactivate: (id: string) =>
    api.post<Deployment>(`/deployments/${id}/deactivate`).then((r) => r.data),

  rollback: (id: string, targetModelId?: string) =>
    api
      .post<Deployment>(`/deployments/${id}/rollback`, { target_model_id: targetModelId })
      .then((r) => r.data),
};

// ─────────────────────────────────────
// A/B Tests
// ─────────────────────────────────────
export const abTestsApi = {
  list: () =>
    api.get<ABTest[]>('/ab-tests').then((r) => r.data),

  get: (id: string) =>
    api.get<ABTest>(`/ab-tests/${id}`).then((r) => r.data),

  create: (data: {
    name: string;
    description?: string;
    model_a_id: string;
    model_b_id: string;
    model_a_traffic: number;
  }) => api.post<ABTest>('/ab-tests', data).then((r) => r.data),

  update: (id: string, data: Partial<ABTest>) =>
    api.put<ABTest>(`/ab-tests/${id}`, data).then((r) => r.data),

  stop: (id: string) =>
    api.post<ABTest>(`/ab-tests/${id}/stop`).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/ab-tests/${id}`).then((r) => r.data),

  getComparison: (id: string) =>
    api.get<ComparisonMetrics>(`/ab-tests/${id}/comparison`).then((r) => r.data),
};

// ─────────────────────────────────────
// Metrics
// ─────────────────────────────────────
export const metricsApi = {
  summary: () =>
    api.get<DashboardSummary>('/metrics/summary').then((r) => r.data),

  forModel: (modelId: string, hours = 24) =>
    api
      .get<MetricsSnapshot[]>(`/metrics/model/${modelId}`, { params: { hours } })
      .then((r) => r.data),

  all: (hours = 24) =>
    api.get<MetricsSnapshot[]>('/metrics/', { params: { hours } }).then((r) => r.data),
};

// ─────────────────────────────────────
// Predict
// ─────────────────────────────────────
export const predictApi = {
  predict: (payload: PredictRequest) =>
    api.post<PredictResponse>('/predict', payload).then((r) => r.data),
};