import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { abTestsApi } from '@/lib/api';
import toast from 'react-hot-toast';

export function useABTests() {
  return useQuery({
    queryKey: ['ab-tests'],
    queryFn: abTestsApi.list,
    refetchInterval: 20_000,
  });
}

export function useABTestComparison(id: string) {
  return useQuery({
    queryKey: ['ab-tests', id, 'comparison'],
    queryFn: () => abTestsApi.getComparison(id),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

export function useCreateABTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: abTestsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      toast.success('A/B test started');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useStopABTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: abTestsApi.stop,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      toast.success('A/B test stopped');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteABTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: abTestsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      toast.success('A/B test deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
