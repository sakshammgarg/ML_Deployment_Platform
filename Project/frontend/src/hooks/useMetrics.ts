import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['metrics', 'summary'],
    queryFn: metricsApi.summary,
    refetchInterval: 10_000,
  });
}

export function useModelMetrics(modelId: string, hours = 24) {
  return useQuery({
    queryKey: ['metrics', 'model', modelId, hours],
    queryFn: () => metricsApi.forModel(modelId, hours),
    enabled: !!modelId,
    refetchInterval: 30_000,
  });
}

export function useAllMetrics(hours = 24) {
  return useQuery({
    queryKey: ['metrics', 'all', hours],
    queryFn: () => metricsApi.all(hours),
    refetchInterval: 30_000,
  });
}
