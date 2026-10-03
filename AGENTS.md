# 桌面端协作规范

本文件适用于 `video-electron`。桌面端是独立构建、打包和安装的 Electron 客户端，内置页面资源；复用现有 Server 的接口、身份与业务数据。用户最新要求优先于历史方案。

## 工程与复用边界

- 技术、目录与文件职责遵循 [PROJECT.md](PROJECT.md)；运行入口在 [README.md](README.md)，当前设计在 [docs/design](docs/design/README.md)。规范更新不能代替实现与验收。
- Main 只负责窗口、受限原生能力、连接配置和会话生命周期；Renderer 负责 React 页面与交互。不得以加载远端 Frontend 网页代替内置桌面界面，也不得启动 Next.js 或桌面业务服务。
- `video-server/frontend` 是页面、文案、品牌和展示语义的来源；`video-server/design.md` 是唯一视觉标准，根 `design.md` 是经同步脚本校验的原文快照。复用实际组件、主题、字体和资源，不根据截图重画基础组件，也不另立桌面视觉标准。
- 使用 TypeScript strict、React、Tailwind、官方 shadcn/Radix 和 Phosphor，基础组件保留官方交互与可访问性语义。Next.js 的路由和服务端能力只在平台接入处适配，业务页面不得分叉成另一套产品。
- pnpm 是唯一依赖管理器，版本以 package.json 和唯一 pnpm-lock.yaml 为准。添加依赖须有明确的生产或验证职责；不保留旧 Python、FFmpeg、模型引擎或运行时准备依赖。

## 数据与接口契约

- PostgreSQL 的数据库结构唯一来源是 `video-server/backend/sql/schema.sql`。桌面不复制 SQL、创建本地业务数据库、维护迁移或直接访问数据库。
- HTTP 契约遵循现有 FastAPI 注解与模型 → `/openapi.json` → Swagger `/docs` → `@umijs/openapi` 生成客户端的链路。生成的 API 请求和类型不可手改，不添加平行业务 DTO、接口别名层或旧协议兼容分支。
- 业务页面直接使用生成 API；Axios 请求基础设施统一处理连接地址、Cookie、超时、取消和错误。文件流、上传与 WebSocket 沿用现有协议，不以 REST 生成器替代实际传输。
- 账户、下载记录、剧本文档、报告、AI 配置及任务状态由已有 Server 提供。不得造假数据、维护第二个任务账本、复刻调度器或在桌面执行模型业务。
- 本地持久化仅保存连接偏好与 Chromium 会话状态。旧版本本地库保留原件，不自动导入 Server，也不因架构清理删除用户数据。

## 安全与真实运行

- 页面地址使用配置的后端 origin；Electron 在独立会话中截获该 origin 的页面与静态资源请求，从安装包返回本地 HTML/JS/资源，API 与健康请求直连已有后端。它不访问 Frontend 服务、不监听本机端口。启用 sandbox、contextIsolation，禁用 Node integration、webview 与不受信任导航。
- Main 只承接本地资源协议和受限客户端传输，不承载业务接口、数据库或调度规则。Cookie 与 WebSocket 保持真实后端同源语义，会话按后端地址隔离；不建立业务 IPC 或通用 Preload 请求桥。
- 远端连接使用 HTTPS；本机开发按受限 loopback HTTP 接入。不得关闭 webSecurity、绕过证书错误或使用宽泛 CORS 来解决联调问题。
- 沿用现有登录 Cookie 和会话失效语义；不读取或复制用户 Chrome Profile，不自建 JWT 刷新、Cookie 业务库或自动重放结果不明的业务请求。
- 凭据、Cookie、用户媒体、完整 URL query、预签名链接和原始模型内容不得进入日志、测试夹具、诊断截图或 Git。原生选文件与保存文件保留用户授权和系统对话框语义。
- 本机联调复用用户现有服务，不启动或重建基础服务，不改数据库、环境文件或 Server 的并行改动。业务权限、内容范围和平台能力由 Server 决定，桌面不扩大这些边界。

## 验证与协作

- 修改前阅读相邻实现和测试。删除文件须同步清理入口、依赖、构建配置、测试与文档；不保留无调用方的空目录、包装层和备用实现。
- `pnpm frontend:sync` 同步 Frontend 页面、组件和资源，`pnpm frontend:check` 离线校验已提交快照与 manifest hash，`pnpm frontend:check-upstream` 对照实际上游当前内容。离线校验不证明与最新上游一致，源码校验不代替真实渲染。复制的 Frontend 目录和根 design.md 都由同步脚本管理并记录来源 hash，不直接修改同步产物；仅平台 adapter 手工维护。接口变化执行 OpenAPI 生成并检查差异，不提交 schema 副本。
- 页面级空状态、错误、加载、反馈、分页、选择与确认交互复用 Frontend 的既有结构，保留真实字段、状态和时间语义。验证亮暗主题、桌面与 390px、键盘焦点、弹层关闭恢复和溢出。
- 执行 pnpm 的格式、类型、相关测试、生产构建与 Electron 验证；安装包须独立验证。技术检查、受控夹具、真实服务用户流程和跨平台验收分别报告，未验证的结果不得写成已完成。
- 并行代理只修改被分配文件，公共配置与集成由主代理管理。开始与交付前检查 Git 状态，保留他人改动；删除在当前授权范围内的旧架构源前保存可恢复快照。
- 提交只包含当前任务，禁止提交构建产物、缓存、日志、媒体、环境文件或凭据。提交信息遵循中文 Conventional Commits；提交、推送、分支与 PR 按用户授权执行，不自动改写历史。
- 文档只维护当前有效规格与实际运行方式；历史方案通过 Git 追溯。交付用中文说明修改、检查结果、未验证边界及 Git 状态。
