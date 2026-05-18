import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deploymentsApi } from '@/lib/api';
import toast from 'react-hot-toast';

export function useDeployments() {
  return useQuery({
    queryKey: ['deployments'],
    queryFn: deploymentsApi.list,
    refetchInterval: 15_000, // auto-refresh every 15s
  });
}

export function useCreateDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deploymentsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments'] });
      toast.success('Deployment created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof deploymentsApi.update>[1] }) =>
      deploymentsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments'] });
      toast.success('Deployment updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deploymentsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments'] });
      toast.success('Deployment removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRollback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetModelId }: { id: string; targetModelId?: string }) =>
      deploymentsApi.rollback(id, targetModelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployments'] });
      toast.success('Rollback initiated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
