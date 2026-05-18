// ─────────────────────────────────────────────
// Core domain types — aligned to FastAPI backend
// ─────────────────────────────────────────────

export type ModelStatus = 'active' | 'inactive' | 'deprecated' | 'training';

export interface ModelVersion {
  id: string;
  name: string;
  version: string;
  description?: string;
  accuracy: number;
  status: ModelStatus;
  framework: string;      // e.g. "scikit-learn"
  created_at: string;     // ISO 8601
  updated_at: string;
  file_path?: string;
  metadata?: Record<string, unknown>;
}

export type DeploymentStatus = 'running' | 'stopped' | 'rolling_back' | 'error';

export interface Deployment {
  id: string;
  model_id: string;
  model_version: string;
  name: string;
  status: DeploymentStatus;
  traffic_percentage: number;
  endpoint_url: string;
  created_at: string;
  updated_at: string;
  last_request_at?: string;
}

export type ABTestStatus = 'running' | 'completed' | 'stopped';

export interface ABTest {
  id: string;
  name: string;
  description?: string;
  model_a_id: string;
  model_b_id: string;
  model_a_traffic: number;   // 0-100
  model_b_traffic: number;   // 0-100
  status: ABTestStatus;
  start_date: string;
  end_date?: string;
  winner_model_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MetricsSnapshot {
  model_id: string;
  model_version: string;
  timestamp: string;
  accuracy: number;
  latency_p50: number;    // ms
  latency_p95: number;    // ms
  latency_p99: number;    // ms
  request_count: number;
  error_rate: number;
  throughput: number;     // req/s
}

export interface DashboardSummary {
  total_models: number;
  active_deployments: number;
  running_ab_tests: number;
  avg_accuracy: number;
  avg_latency_ms: number;
  total_requests_today: number;
  recent_events: ActivityEvent[];
}

export interface ActivityEvent {
  id: string;
  event_type: 'deployment' | 'rollback' | 'model_upload' | 'ab_test' | 'alert';
  message: string;
  model_id?: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export interface PredictRequest {
  model_id?: string;         // if omitted, uses active deployment
  features: Record<string, unknown>;
}

export interface PredictResponse {
  prediction: unknown;
  prediction_label?: string;
  confidence?: number;
  model_id: string;
  model_version: string;
  latency_ms: number;
  timestamp: string;
}

// API pagination wrapper
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

// Chart data
export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ComparisonMetrics {
  model_a: MetricsSnapshot[];
  model_b: MetricsSnapshot[];
}
