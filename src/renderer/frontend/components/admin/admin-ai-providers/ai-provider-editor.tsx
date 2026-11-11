import { CheckCircle, PlugsConnected } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { ItemDescription } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';

import { AiProviderFields } from './ai-provider-fields';
import type { AiProviderEditorState } from './model';

type Props = {
  editor: AiProviderEditorState;
  onChange: (values: Partial<AiProviderEditorState>) => void;
  onClose: () => void;
  onSave: () => void;
  onTest?: () => void;
  onRestoreFocus?: () => void;
  presets?: readonly API.AiProviderPresetResponse[];
};

export function AiProviderEditor({
  editor,
  onChange,
  onClose,
  onSave,
  onTest,
  onRestoreFocus,
  presets,
}: Props) {
  const creating = editor.mode === 'create';
  const busy = editor.saving || editor.testing;
  return (
    <Dialog
      open={editor.mode !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-svh overflow-y-auto overscroll-contain sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
      >
        <DialogHeader>
          <ItemDescription className="line-clamp-none mb-4">
            官方 AI 服务路由
          </ItemDescription>
          <DialogTitle>
            {creating ? '新增 AI 服务' : `编辑 ${editor.displayName}`}
          </DialogTitle>
          <DialogDescription className="max-w-lg">
            仅支持火山引擎方舟、DeepSeek 与 OpenAI 官方 API 渠道；API Key
            会加密保存在服务端，仅由容器化 analysis-worker 在执行任务时读取。
          </DialogDescription>
        </DialogHeader>
        <Form
          aria-busy={busy}
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onSave();
          }}
        >
          <AiProviderFields
            editor={editor}
            onChange={onChange}
            presets={presets}
          />
          <DialogFooter>
            {onTest ? (
              <Button
                className="sm:mr-auto"
                disabled={busy}
                onClick={onTest}
                type="button"
                variant="outline"
              >
                {editor.testing ? (
                  <Spinner aria-hidden data-icon="inline-start" />
                ) : (
                  <PlugsConnected aria-hidden data-icon="inline-start" />
                )}
                {editor.testing ? '正在测试' : '测试连接'}
              </Button>
            ) : null}
            <Button
              disabled={busy}
              onClick={onClose}
              type="button"
              variant="ghost"
            >
              取消
            </Button>
            <Button disabled={busy} type="submit">
              {editor.saving ? (
                <Spinner aria-hidden data-icon="inline-start" />
              ) : (
                <CheckCircle aria-hidden data-icon="inline-start" />
              )}
              {editor.saving ? '正在保存' : '保存配置'}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
