import { describe, expect, it } from 'vitest';
import {
  availabilityLabel,
  bytes,
  dateTime,
  duration,
  errorMessage,
  importModeLabel,
  localizedError,
  platformLabel,
  skillLabel,
  taskError,
  taskKind,
  taskStage,
  taskStatus,
  videoFormatLabel,
} from '../../src/renderer/lib/format';
import type { Task, VideoFormat } from '../../src/shared/generated';

function task(patch: Partial<Task> = {}): Task {
  return {
    id: 'task-id',
    kind: 'export_report',
    status: 'succeeded',
    stage: 'succeeded',
    message: 'Report exported',
    created_at: '2026-10-02T12:00:00Z',
    updated_at: '2026-10-02T12:00:01Z',
    revision: 1,
    ...patch,
  };
}

describe('desktop data presentation', () => {
  it('identifies report export without presenting it as an import or an engine message', () => {
    const exported = task();
    expect(taskKind(exported)).toBe('报告导出');
    expect(taskStatus(exported)).toBe('已完成');
    expect(taskStage(exported)).toBe('处理已完成');
    expect(taskStage(exported)).not.toContain(exported.message);
  });

  it('keeps unknown model outcomes distinct from a retryable failure', () => {
    const unknown = task({
      kind: 'analysis',
      status: 'needs_attention',
      stage: 'model_unknown',
      error_code: 'model_result_unknown',
    });
    expect(taskStatus(unknown)).toBe('结果待确认');
    expect(taskError(unknown)).toContain('不会自动再次调用');
    expect(taskError(unknown)).toContain('核对服务记录');
  });

  it('does not expose unknown engine codes, stages, or external error text', () => {
    const unknown = task({ stage: 'internal_future_stage', error_code: 'internal_future_error' });
    expect(taskStage(unknown)).not.toContain('internal_future_stage');
    expect(taskError(unknown)).not.toContain('internal_future_error');
    expect(errorMessage(new Error('provider details and credentials'))).toBe(localizedError(null));
    expect(errorMessage(new Error('ENOENT: /Users/某人/private-file'))).toBe(localizedError(null));
    expect(errorMessage(new Error('引擎请求失败 (-32602)'))).toBe(localizedError(null));
    expect(errorMessage({ message: 'untrusted protocol text' })).toBe(localizedError(null));
    expect(localizedError('constructor')).toBe(localizedError(null));
    expect(taskStage(task({ stage: 'constructor' }))).toBe('已完成');
  });

  it('preserves actionable local messages after removing the Electron IPC wrapper', () => {
    expect(
      errorMessage(
        new Error("Error invoking remote method 'saveProvider': Error: 请重新输入 API Key"),
      ),
    ).toBe('请重新输入 API Key');
    expect(errorMessage(new Error('asset_changed'))).toContain('重新导入');
    expect(taskError(task())).toBeNull();
  });

  it('uses the frontend date, duration and file size notation with unavailable values intact', () => {
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(1024 ** 2)).toBe('1 MB');
    expect(bytes(Number.NaN)).toBe('—');
    expect(duration(3661)).toBe('1:01:01');
    expect(duration(null)).toBe('—');
    expect(dateTime('invalid-date')).toBe('—');
    expect(dateTime('2026-10-02T12:00:00Z')).toContain('2026');
  });

  it('keeps file availability and storage ownership visible', () => {
    expect(availabilityLabel('missing')).toBe('文件缺失');
    expect(availabilityLabel('changed')).toBe('文件已变更');
    expect(availabilityLabel(undefined)).toBe('文件状态待确认');
    expect(importModeLabel('reference')).toBe('引用原文件');
    expect(importModeLabel('copy')).toBe('复制到媒体库');
  });

  it('presents real format fields without inventing an audio track or estimate', () => {
    const format: VideoFormat = {
      id: 'selected',
      label: '1080p · mp4',
      height: 1080,
      width: 1920,
      video_codec: 'avc1',
      audio_codec: null,
      filesize_bytes: null,
      ext: 'mp4',
    };
    expect(videoFormatLabel(format)).toBe('1080P · MP4 · 1920×1080 · AVC1');
    expect(videoFormatLabel(format)).not.toMatch(/预计|无音轨/);
    expect(platformLabel('bilibili')).toBe('哔哩哔哩');
    expect(skillLabel('visual-shots')).toBe('分镜分析');
  });
});
