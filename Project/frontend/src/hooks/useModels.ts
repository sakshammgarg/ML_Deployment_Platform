import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modelsApi } from '@/lib/api';
import toast from 'react-hot-toast';

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: modelsApi.list,
  });
}

export function useModel(id: string) {
  return useQuery({
    queryKey: ['models', id],
    queryFn: () => modelsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: modelsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model uploaded successfully');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: modelsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useActivateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: modelsApi.activate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model activated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeactivateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: modelsApi.deactivate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model deactivated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
