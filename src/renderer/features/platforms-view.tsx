import { PageHeader } from '../components/ui';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

const platforms = [
  {
    name: 'YouTube',
    identity: '匿名访问 · 无需配置 Cookie',
    capability: '公开单视频',
    description: '仅处理能够公开访问的非 DRM 视频。不包含账号登录、私密或付费内容。',
  },
  {
    name: 'Bilibili',
    identity: '匿名访问 · 无需配置 Cookie',
    capability: '公开单视频',
    description: '仅处理能够公开访问的非 DRM 视频。不包含会员、付费或需要登录的清晰度。',
  },
] as const;

export function PlatformsView() {
  return (
    <>
      <PageHeader
        title="平台状态"
        description="这里展示平台的接入与身份要求。下载是否成功以实际文件结果为准。"
      />
      <Table className="table-borderless">
        <TableHeader>
          <TableRow>
            <TableHead>平台</TableHead>
            <TableHead className="hidden md:table-cell">接入与身份</TableHead>
            <TableHead className="hidden lg:table-cell">已登记能力</TableHead>
            <TableHead className="hidden md:table-cell">说明</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {platforms.map((platform) => (
            <TableRow key={platform.name}>
              <TableCell className="whitespace-normal">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">{platform.name}</span>
                  <Badge variant="secondary">匿名线路已配置</Badge>
                  <span className="text-xs text-muted-foreground md:hidden">
                    {platform.identity} · {platform.capability}
                    <br />
                    {platform.description}
                  </span>
                  <span className="text-xs text-muted-foreground hidden md:block lg:hidden">
                    {platform.capability}
                  </span>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell whitespace-normal">
                {platform.identity}
              </TableCell>
              <TableCell className="hidden lg:table-cell">{platform.capability}</TableCell>
              <TableCell className="hidden md:table-cell whitespace-normal text-muted-foreground">
                {platform.description}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        以上是桌面端的接入声明，不代表当前网络已通过平台下载验证。无法取得媒体时，可从首页导入已经合法取得的本地文件。
      </p>
    </>
  );
}
