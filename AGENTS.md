# framefetch-electron 协作规范

本文件约束在本仓库工作的代码代理与贡献者。技术栈、目录与接入规则见 [PROJECT.md](PROJECT.md)，验收条件见 [docs/design](docs/design/README.md)，安全边界见 [SECURITY.md](SECURITY.md)，本地检查与提交格式见 [CONTRIBUTING.md](CONTRIBUTING.md)。规则冲突时以用户最新要求为准，其次是本文件。

## 定位

`framefetch-electron` 是帧取的桌面客户端：安装包内置由 `framefetch-server/frontend` 同步而来的页面，连接用户已有的 Server。桌面端不实现业务后端、媒体引擎、数据库或调度，不另立产品或视觉标准。

## 来源

- 页面、组件、文案、品牌与展示语义来自 `framefetch-server/frontend`；视觉标准是 `framefetch-server/design.md`。
- `src/renderer/frontend/`、根 `design.md` 与 `resources/shadcn.json` 只由同步脚本写入，不手工修改；需要改动时先改上游，再同步。
- 手工维护的只有 `src/main/`、`src/renderer/adapters/` 与桌面入口文件。
- 数据库结构只由 `framefetch-server/backend/sql/schema.sql` 维护；HTTP 契约只由 FastAPI OpenAPI 生成。桌面不复制 SQL、不写 DTO、不从页面反推接口。

## 不可违反的边界

- Renderer 启用 sandbox、contextIsolation 与 webSecurity，禁用 Node integration、webview 与不受信任导航。
- 不加载远端 Frontend 网页，不启动 Next.js 或本机业务服务，不监听本机端口，不建立业务 IPC 或通用 Preload 请求桥。
- 远端后端只用 HTTPS，HTTP 只限本机 loopback；不关闭 webSecurity、不绕过证书错误、不放宽 CORS。
- 沿用 Server 的 Cookie 会话语义；不读取或复制用户 Chrome Profile，不自建 JWT 刷新、Cookie 业务库或任务账本，不自动重放结果不明的业务请求。
- 不造假数据。账户、记录、文档、报告、AI 配置与任务状态全部来自 Server。
- 本机联调复用用户已运行的服务，不启动或重建基础服务，不修改数据库、环境文件或 Server 仓库的并行改动。

## 修改原则

- 先读相邻实现与测试。只实现当前需求，不写兼容分支、备用实现、空目录或包装层。
- 删除时同步清理入口、依赖、构建配置、测试与文档。
- 升级、卸载与源码清理都不得删除或上传用户数据。
- 并行代理只修改分配给自己的文件，公共配置与集成由主代理负责。

## 验证

- 每次改动运行 [CONTRIBUTING.md](CONTRIBUTING.md#本地检查) 中的检查。
- 源码检查、受控夹具、真实 Electron、真实服务业务流程与安装包验证分别报告，不互相代替；未执行的项不得写成已完成。
- 界面改动以相同身份、数据、主题与视口对照 Frontend，覆盖桌面与 390px、明暗主题、键盘焦点、弹层关闭后的焦点恢复与溢出。

## Git 与交付

- 每次授权推送后，按提交 SHA 等待所有必跑 CI 检查的终态；全部成功才报告交付通过。失败时读取日志、修复并重新验证，不以旧提交、进行中、取消或跳过的结果代替通过。当前提交验证完成后再推进该仓库的下一次提交。

- 开始前和提交后都执行 `git status --short`，保留他人改动，只提交当前任务文件。
- 不提交构建产物、缓存、日志、媒体、环境文件或凭据。
- 提交、推送、建分支与 PR 按用户授权执行；不改写历史，不强制推送。
- 交付说明用中文，包含修改摘要、检查结果、未验证的边界与 Git 状态。
- 文档只写当前有效规格与实际运行方式，不写过程叙述；历史通过 Git 追溯。
