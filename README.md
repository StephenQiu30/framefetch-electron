# FrameFetch Desktop · 帧取桌面端

FrameFetch 的 Electron 客户端，支持独立构建、打包和安装。React 页面、主题、字体与品牌资源包含在安装包中，展示复用 `video-server/frontend`；登录、记录、剧本、报告和任务使用已有 Server 的接口与数据。

客户端使用配置后端的 origin，由 Electron 在独立会话中从安装包返回页面与静态资源；API、健康请求及 WebSocket 连接已有 Server。页面不由远端 Frontend 提供，不启动 Frontend 进程或本机监听端口。业务操作需要 Server 可达；桌面不提供 Python 媒体引擎、SQLite 业务库或单独的业务后端。

## 开发与启动

使用 package.json 规定的 Node.js 与 pnpm 版本：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

默认后端为 `http://127.0.0.1:8111/`。连接已有远端部署时指定 HTTPS 根地址：

```sh
FRAMEFETCH_BACKEND_URL=https://framefetch.example.com/ pnpm dev
```

已有构建可直接运行：

```sh
pnpm build
pnpm start
```

连接优先级为 `--backend-url=<地址>`、`FRAMEFETCH_BACKEND_URL`、应用数据目录的 `connection.json`、默认地址。配置文件只包含 `{ "backend_url": "http://127.0.0.1:8111/" }`；根地址不带账户凭据、路径、参数或片段。HTTP 仅允许本机 loopback，远端须使用 HTTPS。

安装态可使用 `--backend-url=<地址>` 与 `--user-data-dir=<绝对目录>` 指定连接和独立应用数据目录。会话使用桌面自己的持久 Chromium Profile，按服务地址隔离，不读取浏览器已有登录材料。登录同一服务端账户后使用其既有业务数据。

## 页面与接口同步

界面唯一视觉标准源为 `video-server/design.md`，本仓库 [design.md](design.md) 是原文同步快照，页面来源为 `video-server/frontend`。修改上游后，在包含相邻 Server 源码的开发工作区执行：

```sh
pnpm frontend:sync
pnpm frontend:check
pnpm frontend:check-upstream
```

`frontend:check` 离线校验已提交快照与 manifest hash，供独立 checkout 和 CI 使用；`frontend:check-upstream` 对照实际上游当前内容，需要相邻源码，才能证明与该 checkout 一致。两者不代替真实渲染。同步产物提交到本仓库，安装和运行不需要相邻源码或 Frontend 进程。平台接入只适配客户端路由、传输、会话与原生能力；不另画基础组件或维护第二套页面文案。来源、离线检查和其他 checkout 的同步方式见 [源码复用说明](resources/FRONTEND_BASELINE.md)。

接口变化先在 `video-server/frontend` 执行 `pnpm openapi`，再同步到桌面。桌面 `openapi2ts.config.ts` 使用同一生成约定，生成到 `src/renderer/frontend/api`；在当前后端或源码导出的临时契约上检查：

```sh
pnpm openapi:check
# 指向其他当前契约时：
OPENAPI_SCHEMA_URL=http://127.0.0.1:8111/openapi.json pnpm openapi:check
```

生成差异须与上游同步并检查来源 hash，不手工修改 API 文件，也不提交临时 schema。

数据库结构只由 `video-server/backend/sql/schema.sql` 维护。接口遵循 FastAPI 注解/Pydantic → `/openapi.json` → Swagger `/docs` → `@umijs/openapi`，客户端使用生成的请求和 `API.*` 类型，不手写 DTO、SQL 或 Swagger 副本。工程规范见 [PROJECT.md](PROJECT.md)。

## 检查与打包

```sh
pnpm frontend:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm package:dir
```

在目标系统构建安装包：

```sh
pnpm build
# Apple Silicon macOS
pnpm exec electron-builder --mac --arm64 --publish never
# Intel macOS
pnpm exec electron-builder --mac --x64 --publish never
# Windows x64
pnpm exec electron-builder --win --x64 --publish never
```

产物位于 `release/`。构建资源与签名边界见 [资源说明](resources/README.md)。自动化检查、真实服务流程和各系统安装验证分别执行；配置了 CI 或能够生成安装包不代表全部产品场景已验收。当前签名、公证与外部分发须单独验证。

## 数据与贡献

业务记录保存在现有 Server；本地只维护连接偏好与浏览器会话。旧版本的本地媒体、数据库、报告及凭据文件保留原件，不自动上传或迁入 Server，也不自动删除。

当前架构与验收条件见 [设计文档](docs/design/README.md)。协作规则见 [AGENTS.md](AGENTS.md)，贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全报告见 [SECURITY.md](SECURITY.md)。源码采用 [MIT](LICENSE) 许可，依赖和品牌资源保留各自适用许可。
