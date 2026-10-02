import type { Task } from '../../shared/generated';

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[index]}`;
}
export function duration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const seconds = Math.floor(value);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
const statuses: Record<Task['status'], string> = {
  queued: '等待中',
  running: '进行中',
  cancelling: '正在取消',
  cancelled: '已取消',
  succeeded: '已完成',
  failed: '失败',
  interrupted: '已中断',
  needs_attention: '需要处理',
};
export function taskStatus(task: Task): string {
  return statuses[task.status] ?? task.status;
}
export function isActive(task: Task): boolean {
  return ['queued', 'running', 'cancelling'].includes(task.status);
}
export function errorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  return '操作未完成，请重试。';
}
