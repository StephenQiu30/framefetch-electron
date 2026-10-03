# 桌面构建资源

`icons/` 保存正式品牌的 macOS ICNS、Windows ICO 和开发态 PNG，来源与更新规则见 [图标说明](icons/README.md)。页面 Logo 与主题 CSS 来自 Frontend 同步产物，字体使用锁定的本地字体包，随客户端构建交付。

构建不下载或冻结 Python、FFmpeg、yt-dlp、Deno、模型文件或原生任务管理扩展。包内只包含 Electron 应用入口、Renderer 与实际使用的静态资源；业务能力由配置的 Server 提供。

Renderer 的第三方代码由 Vite 编译进资源，安装包不重复包含 `node_modules`。构建按实际输出模块生成 `assets/third-party-licenses.txt`，字体 OFL 许可位于 `resources/licenses`；Electron 自带的 Chromium 许可随框架保留。

`shadcn.json` 保存上游组件配置原文，和根 `design.md` 一同由来源同步脚本校验。界面组件先在 Frontend 的官方 registry 配置下维护，再同步到桌面端；不在桌面快照中重新生成另一套基础组件。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm package:dir
```

macOS 使用 DMG，Windows 使用 NSIS，具体目标与文件范围以 `electron-builder.yml` 为准。应在目标系统构建并验证安装后的程序，不能以开发态测试替代安装态验证。

默认配置生成内部未签名安装包。macOS 签名与公证、Windows 发布者签名、最低系统版本、干净安装、升级和卸载须作为实际发布验证；文档和 CI 配置不构成通过证明。卸载不得自动清除用户数据。

历史本地引擎的忽略缓存可能留在开发工作区中，它们不属于当前源码或打包输入。不得将其中的旧媒体、凭据、用户数据或运行时重新加入安装包。
