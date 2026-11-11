import { CheckCircle, Key } from '@phosphor-icons/react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type AiServiceSelectorProps = {
  busy: boolean;
  items: API.AiProviderProfileResponse[];
  selectedEngine: API.AiProviderEngine;
  onActivate: (service: API.AiProviderProfileResponse) => void;
  onSelect: (service: API.AiProviderProfileResponse) => void;
};

export function AiServiceSelector({
  busy,
  items,
  selectedEngine,
  onActivate,
  onSelect,
}: AiServiceSelectorProps) {
  return (
    <section
      aria-label="官方 AI 服务选择"
      className="grid gap-3 md:grid-cols-3"
    >
      {items.map((item) => {
        const selected = item.engine === selectedEngine;
        return (
          <div
            className={cn(
              'flex flex-col justify-between gap-3 rounded-xl p-4 transition-colors',
              selected ? 'bg-muted' : 'bg-muted/45 hover:bg-muted/70',
            )}
            key={item.engine}
          >
            <button
              aria-pressed={selected}
              className="flex w-full flex-col items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              onClick={() => onSelect(item)}
              type="button"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-medium text-base text-foreground">
                  {item.display_name}
                </span>
                {item.is_active ? (
                  <Badge variant="default">
                    <CheckCircle
                      aria-hidden
                      className="mr-1 size-3"
                      weight="fill"
                    />
                    当前启用
                  </Badge>
                ) : item.credential_configured ? (
                  <Badge variant="secondary">
                    <Key aria-hidden className="mr-1 size-3" />
                    已配置密钥
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">未配置</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span className="font-mono text-foreground/80">
                  {item.model}
                </span>
                <span>
                  {item.supports_vision
                    ? '支持视频与文档 Skill'
                    : '仅支持文本与剧本 Skill'}
                </span>
              </div>
            </button>

            {item.credential_configured && !item.is_active ? (
              <div className="flex items-center justify-end">
                <Button
                  disabled={busy}
                  onClick={() => onActivate(item)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  设为当前启用
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
