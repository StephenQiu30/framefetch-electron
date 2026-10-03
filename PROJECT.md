# 桌面端工程规范

本文件规定 `video-electron` 的技术与目录职责。AGENTS.md 管理协作，README.md 管理运行入口，docs/design 管理当前架构。界面标准统一以 `video-server/design.md` 为源，根 [design.md](design.md) 保留同步的原文快照，来源 hash 经同步检查；页面实现复用 `video-server/frontend`，不维护第二份视觉规范。

## 技术与职责

| 范围 | 标准 |
| --- | --- |
| 桌面宿主 | Electron Main，窗口、会话、连接配置与受限原生能力 |
| 页面 | 打包内置 React、TypeScript strict、Tailwind，虚拟同源本地资源协议 |
| 组件与品牌 | 复用 Frontend 的官方 shadcn/Radix、Phosphor、Geist、主题 token 与 Logo |
| 后端 | 连接已有 FastAPI 服务；桌面不实现业务后端、媒体引擎或数据库 |
| 数据结构 | `video-server/backend/sql/schema.sql`，桌面不复制维护 |
| REST 契约 | 同一 FastAPI OpenAPI/Swagger，自动生成请求和 `API.*` 类型 |
| 请求基础设施 | Renderer Axios 与 Main 受限客户端传输，API/健康和 WebSocket 沿用后端同源协议 |
| 本地持久化 | 连接偏好及独立 Chromium 会话，无本地业务事实 |
| 依赖与构建 | pnpm、唯一锁文件、Vite、electron-builder；具体版本以清单为准 |
| 验证 | Biome、TypeScript、Vitest、Playwright Electron 与安装包验证 |

独立安装指页面资源随安装包交付，启动无需相邻源码仓库或本机 Frontend 进程。业务操作需要配置的 Server 可达，并受现有身份、权限和服务能力约束。

## 目录与命名

```text
src/
├── main/                     Electron 入口、窗口、连接与原生能力
└── renderer/
    ├── frontend/             上游页面依赖闭包，只经同步脚本维护
    │   ├── app/              页面入口，保留上游目录与命名
    │   ├── api/              OpenAPI 生成请求和类型，不手工编辑
    │   ├── components/       上游业务组件及官方 ui 基础组件
    │   ├── hooks/            上游跨业务 React Hook
    │   └── lib/              上游 Axios、上传、会话及共享代码
    ├── adapters/             仅适配 Next Link、Image、导航和框架类型
    ├── public/               同步的 Logo、favicon 等页面资源
    ├── main.tsx              桌面 React 入口与路由组合
    ├── styles.css            本地字体加载与平台样式入口
    └── index.html            Vite 页面入口
resources/icons/              安装包及系统 Dock 图标
scripts/                      有实际入口的来源同步与一致性检查
tests/                        单元与 Electron 验证
docs/design/                  当前架构与可判定验收条件
```

该结构定义职责，禁止为了凑齐目录创建空文件。上游文件只复制实际页面依赖闭包，完整 api 目录保持生成器命名；不复制 server-only、Next 服务端代理、RSC/SSR 或未使用组件。路由入口按实际客户端路由组织，平台 adapter 不改上游业务逻辑。

- 普通源码使用 kebab-case，Hook 文件 `use-*.ts`、函数 `useXxx`；生成 API 保留生成器命名。
- 业务专用状态与 Hook 就近放置，跨业务复用再进入 hooks 或 lib。不设置 services/utils/types 聚合层，不增加无用途 barrel、纯转发文件和类型改名文件。
- 业务类型直接使用 `API.*`。UI 独有类型在所属业务附近定义；平台桥接只描述原生能力，不复制业务字段。
- 官方组件沿用对应 registry 的 API、键盘和焦点语义。业务 className 负责布局；共享主题和无边框例外统一维护，不在页面散布外观覆盖。
- 界面同步须同时覆盖页面结构、文案、资源、字段、状态、空与错误展示；只同步 Logo 或部分 CSS 不能视为完成。

## 契约与接入规则

数据库结构只由 Server 的当前态 SQL 维护；HTTP 请求与响应只由 FastAPI 注解及模型生成。二者职责不同，不能从 SQL 手写客户端 DTO，也不能从已有页面反推接口。

更新接口时核对后端源码对应的 `/openapi.json`，使用 `@umijs/openapi` 生成客户端并检查差异，不以运行中的旧契约证明新代码一致。生成配置保持单一入口，不提交临时 schema 或手写 Swagger 文档。

Frontend 的 `pnpm openapi` 与桌面生成入口使用同一后端契约。`pnpm frontend:sync` 维护可追溯的页面和资源来源，`pnpm frontend:check` 离线校验本地同步产物与已提交 manifest hash，包括根 design.md；`pnpm frontend:check-upstream` 严格对照实际上游当前内容，不只比较提交号。离线校验不证明最新上游一致，源码校验不代替真实渲染。复制的 Frontend 目录由同步脚本管理，只手工维护平台 adapter；不通过隐藏或忽略差异跳过页面同步。

平台适配统一承接路由、请求地址、登录会话、文件传输和外部链接。Renderer 使用配置后端的 origin 与相对 `/api` 路径；Main 在独立持久会话中截获页面和静态资源请求，从安装包返回本地资源，API 与健康请求直连已有后端，WebSocket 保持其原生同源 Cookie 协议。没有本机监听端口或业务 IPC。不得在各页面复制地址拼接、错误解包、登录跳转或业务规则。

## 验证与清理

源码检查与生产构建证明工程可构建；真实 Electron 证明窗口、原生能力、会话和导航；真实服务证明身份与业务数据接线；真实系统安装验证发布行为。各项分别保留证据，不互相代替。

界面对照使用相同视口、主题、登录身份和数据状态，覆盖首页、登录、记录、剧本、平台、详情及有权限的管理页面。390px、长文本、空数据、失败恢复、弹层与焦点必须可用。不能用假业务数据证明与 Server 一致。

删除旧实现时同步清理依赖、构建入口、测试和文档；用户数据与并行改动按授权范围处理。历史实现由 Git 或任务快照追溯，当前源码不保留旧架构兼容链路。

## 连接与历史数据

默认后端为 `http://127.0.0.1:8111/`，连接优先级为 `--backend-url=`、`FRAMEFETCH_BACKEND_URL`、userData 中的 `connection.json`、默认值。配置只保存 backend_url，接受无凭据、参数和路径的根地址；远端 HTTPS，本机受限 loopback HTTP。详细命令见 README。

本地只保存连接偏好与独立 Chromium 会话。历史版本的媒体库、数据库、报告和凭据文件保留原件，不自动导入 Server、不自动删除，也不作为新服务端数据展示。
