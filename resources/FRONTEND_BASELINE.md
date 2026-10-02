# Frontend 一致性基线

界面规范来自 `video-server/design.md`。桌面仓库保存同一份 `design.md`、frontend 的 `globals.css`、19 个官方 Radix/shadcn 组件，以及正式 SVG/PNG Logo。它们是本仓库的实际文件，开发、构建和运行都不需要相邻服务仓库。Geist 与 Geist Mono 使用随构建打包的字体，不请求字体 CDN。

`frontend-baseline.json` 记录上游与本地 SHA-256；`icons/brand-manifest.json` 记录 Logo 和生成图标的 SHA-256。默认构建与开发启动都会检查基线，防止未经确认的公共样式或品牌漂移。

## 检查

在本仓库运行，不依赖上游目录：

```sh
pnpm frontend:check
pnpm brand:check
```

显式比较相邻服务的当前源码，不修改任何文件：

```sh
pnpm frontend:sync --check --source ../video-server
pnpm brand:sync --check --source ../video-server/frontend
```

## 更新

```sh
pnpm brand:sync --source ../video-server/frontend
pnpm frontend:sync --source ../video-server
```

品牌更新从正式 PNG 生成 ICNS/ICO 和缩放 PNG。Frontend 更新复制规范和样式；公共组件 API 需要开发者逐项集成后登记，脚本不会自动覆盖组件。组件来源和必要适配写在 manifest 中，普通组件只允许格式差异；弹窗关闭标签使用中文，Sonner 显式接收桌面主题。

业务组件组合这些基础组件，统一顶部导航、页面标题、首页三种入口、56px 主输入、10/20/50 条分页、明暗主题、错误重试和完成提示。下载、导入、分析和导出状态使用中文展示；日期、大小、时长、文件元数据和关联报告来自本机真实记录。

桌面不迁移 Web 下载历史、剧本或报告，不依赖部署服务。平台页只描述当前已配置的匿名线路；真实网络下载、远端模型调用和 Windows 安装仍需各自的产品验收。已生成的旧安装包需要重新构建后才会包含新的界面和图标。
