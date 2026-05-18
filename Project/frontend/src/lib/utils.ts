import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatLatency(ms: number) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatAccuracy(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const STATUS_COLORS: Record<string, string> = {
  active: 'text-accent-green border-accent-green/30 bg-accent-green/10',
  running: 'text-accent-green border-accent-green/30 bg-accent-green/10',
  completed: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10',
  inactive: 'text-slate-400 border-slate-600 bg-slate-800/50',
  stopped: 'text-slate-400 border-slate-600 bg-slate-800/50',
  deprecated: 'text-accent-amber border-accent-amber/30 bg-accent-amber/10',
  rolling_back: 'text-accent-amber border-accent-amber/30 bg-accent-amber/10',
  training: 'text-accent-purple border-accent-purple/30 bg-accent-purple/10',
  error: 'text-accent-red border-accent-red/30 bg-accent-red/10',
};
