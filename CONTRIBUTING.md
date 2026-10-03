# 贡献指南

感谢你改进 FrameFetch Desktop。开始前请阅读 [AGENTS.md](AGENTS.md)、[PROJECT.md](PROJECT.md) 与 [当前设计](docs/design/README.md)。本仓库只维护 Electron 客户端；Server、Web 或移动端的问题分别属于它们的独立仓库。

## 修改范围

- `src/main/` 负责窗口、连接、会话、本地资源协议和受限原生能力。
- `src/renderer/` 负责安装包内置 React 页面，复用 Frontend 组件、主题、文案与展示语义。界面唯一标准为 `video-server/design.md`。
- 生成 API 只从已有 FastAPI OpenAPI 更新；不要手写 DTO、修改生成请求或复制 Server SQL。
- `resources/icons/` 负责安装包与系统图标，`tests/` 维护实际边界验证，`docs/design/` 维护当前架构与验收条件。

界面同步在包含相邻 `video-server` 源码的工作区执行 `pnpm frontend:sync` 和 `pnpm frontend:check-upstream`。`pnpm frontend:check` 只离线校验已提交快照与 manifest hash，供独立 checkout 使用，不能证明最新上游一致。同步产物提交到本仓库；客户端运行不依赖相邻源码或 Frontend 进程。平台适配必须保持原有业务语义，避免新增平行基础组件或第二套文案。

## 开发与验证

使用 package.json 固定的 Node.js 与 pnpm，不引入 npm/yarn 锁文件：

```sh
pnpm install --frozen-lockfile
pnpm frontend:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

涉及构建或原生行为时运行 `pnpm package:dir` 并验证安装态。界面变更对照 Frontend 的相同主题、视口、身份与数据状态，覆盖桌面、390px、明暗主题、键盘焦点、空与错误恢复。生成接口、单元夹具、健康检查和安装包构建不能代替真实账户业务流程或各系统实际验收。

联调复用现有后端服务，默认地址为 `http://127.0.0.1:8111/`。不要为客户端任务启动数据库、执行 SQL、覆盖环境文件或修改 Server 并行工作。本地媒体、Cookie、密钥、完整 URL、预签名链接、诊断日志和构建产物不得进入 Git 或公开 Issue。

## 提交与反馈

一个提交包含可独立说明、验证和回滚的一组改动。提交信息建议使用中文 Conventional Commits，例如 `fix(renderer): 修复平台状态窄屏布局`、`build: 更新桌面安装包配置`。作用域可省略，不使用空括号；破坏性变更以 `!` 和 `BREAKING CHANGE:` 说明影响。

提交前检查 Git 状态与暂存内容，只包含当前任务并保留他人修改。没有明确授权时不推送、创建分支、发起 PR 或改写历史。交付说明列出修改、执行的检查、失败或未验证边界与工作区状态；不得把目标规格写成完成结果。

Bug 与建议请使用仓库 Issue 模板，提供最小复现和脱敏证据。安全问题按 [SECURITY.md](SECURITY.md) 私下报告，社区协作遵循 [行为准则](CODE_OF_CONDUCT.md)。
