# Frontend 源码复用

桌面安装包内置 React 页面，运行时不启动或加载 Next.js Frontend 服务。页面组件、交互、主题 CSS、生成 API 与品牌资源直接来自 `video-server/frontend`，保持逐字节一致。Electron 只提供框架与原生能力适配，不维护另一套业务页面。

`frontend-baseline.json` 记录上游 Git 提交、源码路径和 SHA-256。同步脚本从实际页面入口计算依赖闭包，不复制 server-only、Next 服务端代理、SEO 服务端入口或未使用的 UI 组件。上游未提交修改的实际内容同样由 SHA-256 固定，提交号只标识 checkout 基线。

开发者显式更新快照：

```sh
node scripts/sync-frontend.mjs
# 其他源码 checkout：
node scripts/sync-frontend.mjs --source=/absolute/path/video-server/frontend
```

离线检查，不依赖相邻仓库：

```sh
node scripts/sync-frontend.mjs --check
```

本命令验证快照完整性，不声称上游没有更新。已有上游 checkout 时，额外验证实际源码：

```sh
node scripts/sync-frontend.mjs --check-upstream
```

同步命令也更新根 `design.md` 的原文快照；上游视觉事实源仍为 `video-server/design.md`。

`src/renderer/frontend` 是只读快照。不要直接修改、格式化或给生成 API 添加手写 DTO；应先修改上游，再同步。`src/renderer/adapters` 只适配 `next/link`、`next/navigation`、`next/image` 和构建时 Metadata 类型；桌面入口复用上游 Provider 顺序与页面包装，省略 RSC 和 SEO 请求。字体使用项目锁定的 Geist/Geist Mono 本地字体包，保持上游字体名称与 fallback 度量。

业务结构的唯一事实源为上游 `backend/sql/schema.sql`。HTTP 契约由 FastAPI 注解自动生成 `/openapi.json` 和 Swagger，再由上游 `frontend/openapi2ts.config.ts` 生成 `src/api`。桌面快照复用该生成结果，不另写 SQL、OpenAPI 文档或数据库模型。

现有后端提供账户、下载、文档、报告及管理数据。Electron 的 HTTP(S) transport 返回安装包内的页面与静态资源，并将 `/api`、`/health` 请求送到配置的现有后端；本地 `/storage-upload` 原生传输只发送后端签发的预签名文件分片，不承担业务存储或服务规则。
