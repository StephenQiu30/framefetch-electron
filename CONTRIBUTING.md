# 贡献指南

感谢你改进 Framefetch Desktop。开始前请阅读 [AGENTS.md](AGENTS.md)、[PROJECT.md](PROJECT.md) 与 [验收条件](docs/design/README.md)。本仓库只维护 Electron 客户端；Server、Web 与移动端问题分别属于各自仓库。

## 本地检查

使用 `package.json` 固定的 Node.js 与 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm frontend:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

- 同步上游界面时，在包含相邻 `framefetch-server` 的工作区执行 `pnpm frontend:sync` 与 `pnpm frontend:check-upstream`，并提交同步产物。
- 涉及构建或原生行为时运行 `pnpm package:dir` 并验证安装态。
- 联调使用已运行的 Server（默认 `http://127.0.0.1:8111/`），不为客户端任务启动数据库、执行 SQL 或覆盖环境文件。

## CI

`internal-build.yml` 在 macOS 与 Windows 上执行 `frontend:check`、lint、typecheck、test、build、e2e，并生成未签名的内部安装包。CI 产物不代表签名、公证或公开发布已通过。

缓存只复用依赖下载，不跳过锁文件安装、代码生成、测试或构建。main 的 CI 按提交 SHA 独立运行；PR 的新提交会取消同一 PR 的旧运行。

每次推送后，检查本次提交对应的运行并等待终态：

```bash
commit_sha=$(git rev-parse HEAD)
gh run list --commit "$commit_sha" --event push --workflow internal-build.yml --json databaseId,headSha,status,conclusion,url
gh run watch <run_id> --exit-status --interval 30
gh run view <run_id> --json headSha,status,conclusion,jobs
```

`<run_id>` 取自列表中的本次推送。确认 `headSha` 与 `commit_sha` 相同，且全部必跑 Job 为 `success`，才报告通过；没有运行、进行中、取消或跳过均不算通过。失败时读取 `gh run view <run_id> --log-failed`，修复后重新检查新 SHA。当前提交验证完成后再推进下一次提交；多个本地提交一次推送只会检查最终提交。

## 提交规范

提交信息使用 Conventional Commits，类型与作用域为小写英文，描述为中文：

```text
<type>(<scope>): <中文描述>
```

- 类型：`feat`、`fix`、`refactor`、`docs`、`test`、`perf`、`build`、`ci`、`chore`、`style`、`revert`。
- 作用域使用 `main`、`renderer`、`frontend`、`build`、`docs` 等模块名；无法准确归属时省略，不留空括号。
- 破坏性变更在类型或作用域后加 `!`，并在正文写 `BREAKING CHANGE: <中文说明>`。

```text
fix(renderer): 修复平台状态窄屏布局
build: 更新桌面安装包配置
```

本地媒体、Cookie、密钥、完整 URL、预签名链接、诊断日志与构建产物不得进入 Git 或公开 Issue。Bug 与建议使用 Issue 模板并提供脱敏的最小复现；安全问题按 [SECURITY.md](SECURITY.md) 私下报告。
