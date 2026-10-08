# framefetch-electron 工程规范

本文规定 `framefetch-electron` 的技术栈、目录与接入规则。协作见 [AGENTS.md](AGENTS.md)，运行入口见 [README.md](README.md)，验收条件见 [docs/design](docs/design/README.md)。视觉标准是 `framefetch-server/design.md`，根 [design.md](design.md) 是其同步快照。

## 1. 技术栈

| 范围 | 标准 |
| --- | --- |
| 桌面宿主 | Electron Main：窗口、独立会话、连接配置、资源协议与受限原生能力 |
| 页面 | 安装包内置的 React、TypeScript strict、Tailwind，经 Vite 构建 |
| 组件与品牌 | 同步自 Frontend 的 shadcn/Radix、Phosphor、主题 token、Logo；Geist 字体使用锁定的本地字体包 |
| 后端 | 用户已有的 FastAPI 服务 |
| 依赖与构建 | pnpm、唯一 `pnpm-lock.yaml`、Vite、electron-builder（macOS DMG、Windows NSIS） |
| 检查 | Biome、TypeScript、Vitest、Playwright Electron |

精确版本以 `package.json` 与锁文件为准。新依赖须有明确的生产或验证职责。

## 2. 目录

```text
src/
├── main/                     Electron 入口、连接、启动与传输
└── renderer/
    ├── frontend/             同步自 framefetch-server/frontend 的页面依赖闭包（只读）
    ├── adapters/             next/link、next/navigation、next/image、next/dynamic 与 Metadata 类型适配
    ├── public/               同步的 Logo、favicon
    ├── main.tsx              桌面 React 入口与路由组合
    ├── styles.css / fonts.css
    └── index.html
resources/                    安装包图标、字体许可、shadcn.json 快照
scripts/                      来源同步与许可汇总
tests/                        main 单元测试与 e2e
docs/design/                  验收条件
```

- 同步脚本只复制实际页面入口的依赖闭包，不复制 server-only 代码、Next 服务端代理、RSC/SSR、SEO 服务端入口或未使用的组件。`src/renderer/frontend/api/` 随同步保持生成器命名。
- 普通源码 `kebab-case`，Hook 文件 `use-*.ts`、函数 `useXxx`。
- 不设 `services/`、`utils/`、`types/` 聚合层，不建 barrel、纯转发文件或类型改名文件。业务类型直接使用 `API.*`；平台桥接只描述原生能力，不复制业务字段。
- 不为凑齐结构创建空目录。

## 3. 来源同步

| 命令 | 作用 |
| --- | --- |
| `pnpm frontend:sync` | 从相邻 `framefetch-server/frontend` 同步页面、组件、生成 API、资源、根 `design.md` 与 `resources/shadcn.json`，并把来源路径与 SHA-256 写入 `resources/frontend-baseline.json` |
| `pnpm frontend:check` | 离线校验已提交快照与 manifest hash；不证明与最新上游一致 |
| `pnpm frontend:check-upstream` | 按内容对照实际上游当前文件 |

- 同步产物以内容 hash 固定，提交号只标识 checkout 基线。
- 接口变化的顺序是：Server 修改注解 → Frontend `pnpm openapi` → 本仓库 `pnpm frontend:sync`。桌面不独立生成 API，不提交 schema 副本。
- 界面同步覆盖页面结构、文案、资源、字段与空/错误状态；只同步 Logo 或部分 CSS 不算完成。
- 不通过隐藏或忽略差异跳过同步。

## 4. 运行时接入

- Renderer 使用配置后端的 origin 与相对路径。Main 在按后端 origin 隔离的持久会话中截获该 origin 的页面与静态资源请求，从安装包返回本地 HTML/JS/资源。
- `/api/` 与 `/health/` 请求直连后端；WebSocket 保持同源 Cookie 协议；`/storage-upload` 由原生传输只发送后端签发的预签名分片。
- 地址拼接、错误解包、登录跳转与业务规则只在上游实现与平台 adapter 中各有一处，不在页面复制。
- 连接配置：默认 `http://127.0.0.1:8111/`；优先级为 `--backend-url=`、`FRAMEFETCH_BACKEND_URL`、userData 中的 `connection.json`、默认值。只接受无凭据、无参数、无路径的根地址。
- 本地只保存连接偏好与独立 Chromium 会话，没有本地业务数据。

## 5. 验证层级

| 层级 | 证明 |
| --- | --- |
| 源码检查与生产构建 | 工程可构建 |
| Playwright Electron | 窗口、原生能力、会话与导航 |
| 真实 Server | 身份与业务数据接线 |
| 目标系统安装 | 安装、升级、卸载与发布行为 |

各层分别留证，不互相代替。界面对照使用相同视口、主题、身份与数据，覆盖首页、登录、记录、剧本、平台、详情与有权限的管理页面；不得用假数据证明与 Server 一致。
