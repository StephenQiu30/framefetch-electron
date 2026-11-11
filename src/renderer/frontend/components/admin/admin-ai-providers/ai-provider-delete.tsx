import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

export function AiProviderDelete({
  deleting,
  onClose,
  onConfirm,
  target,
}: {
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  target: API.AiProviderProfileResponse | null;
}) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除 Provider 配置？</AlertDialogTitle>
          <AlertDialogDescription>
            “{target?.display_name}
            ”的加密凭据也会一并删除。当前启用的线路不可直接删除；若为备用兜底线路请先取消备用。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={onConfirm}
            variant="destructive"
          >
            {deleting ? <Spinner aria-hidden data-icon="inline-start" /> : null}
            {deleting ? '正在删除' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
