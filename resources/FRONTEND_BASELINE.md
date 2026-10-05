# Frontend 源码同步

桌面安装包内置的页面、组件、主题 CSS、生成 API 与品牌资源逐字节来自 `video-server/frontend`。同步规则见 [PROJECT.md 第 3 节](../PROJECT.md#3-来源同步)，本文只说明命令用法。

## 更新快照

默认读取相邻的 `../video-server/frontend`：

```sh
pnpm frontend:sync
```

上游在其他位置时：

```sh
node scripts/sync-frontend.mjs --source=/absolute/path/video-server/frontend
```

同步结果写入 `src/renderer/frontend/`、`src/renderer/public/`、根 `design.md` 与 `resources/shadcn.json`，来源路径与 SHA-256 记录在 `resources/frontend-baseline.json`。上游未提交的修改同样按实际内容的 hash 固定，提交号只标识 checkout 基线。

## 检查

```sh
pnpm frontend:check            # 离线校验已提交快照，不依赖相邻仓库
pnpm frontend:check-upstream   # 对照实际上游当前内容
```

离线校验通过只说明快照完整，不说明上游没有更新。

## 手工维护范围

`src/renderer/adapters/` 只适配 `next/link`、`next/navigation`、`next/image` 与构建时 Metadata 类型。桌面入口复用上游 Provider 顺序与页面包装，省略 RSC 与 SEO 请求。其余同步产物不手工修改、不单独格式化。
