# FrameFetch Desktop · 帧取桌面端

`video-electron` 是独立 Electron 产品。安装包包含本地 Python 引擎、FFmpeg/ffprobe、yt-dlp 与 Deno；任务、媒体索引和报告保存在本机 SQLite 与文件系统。构建和运行不导入相邻 server/app，不需要 Docker、数据库服务器或部署 API。

**当前状态：0.1.0 内部测试版。** macOS arm64 已运行开发版及真正打包后的应用，验证中文路径导入、视频播放与跳转、封面、文档读取、退出及重启后的数据保留。Windows x64、macOS x64 已配置原生构建 CI，尚未在本次本机环境完成验收；正式签名、公证和外部分发仍有发布门槛。

用户已确认：目录名为 `video-electron`，首批支持 macOS + Windows，首版使用用户自备模型 API，本地模型后续可选。

已实现工作区、链接解析/下载任务、本地 MP4 导入、媒体库与播放器、TXT/Markdown/Fountain/PDF/DOCX 文档、任务取消与恢复、模型配置、五种内置分析方式、Markdown/DOCX 报告。平台和云端分析的实现及受控测试不能代替真实平台/模型服务验收。

本地导入、播放、历史查询和已有报告可以离线使用；下载需要平台网络，AI 需要用户自备公网 HTTPS Chat Completions 服务，且模型支持严格 JSON Schema。视频分析还需要视觉输入。首版不读取浏览器 Cookie，不包含登录平台、DRM、本地模型、云同步和自动更新。

首版视频分析基于最多12个抽帧，不含音频转写；图像证据不能代表完整音轨或逐秒内容。当前网络返回非公网fake-IP时，解析与模型配置会被拒绝，需要能得到真实公网地址的网络环境。

## 开发与构建

开发机使用 Node.js 24.19、pnpm 12.4.2、uv 0.11.32；原生资源固定 Python 3.12.13。终端用户无需安装这些工具。

```sh
pnpm install --frozen-lockfile
uv sync --project engine --frozen --group dev --python 3.12.13
pnpm contract:generate
pnpm runtime:prepare
pnpm runtime:freeze
pnpm runtime:verify
pnpm dev
```

首次资源准备需要网络、空间和编译时间。macOS 构建机需要 Xcode Command Line Tools；Windows 需要 MSYS2 MinGW64、make、Node 原生编译工具，并在冻结前执行 `node scripts/build-native.mjs`。开发引擎使用 uv，安装包使用冻结可执行文件；包内资源没有 Python/FFmpeg 的 PATH 回退。

```sh
pnpm build
pnpm exec electron-builder --mac --arm64 --publish never
# Intel 构建机使用 --mac --x64
# Windows 构建机使用 --win --x64
```

制品位于 `release/`，默认是内部未签名 DMG 或完整 NSIS，配置不会自动发布。资源来源、hash、签名顺序和许可证见 [资源说明](resources/README.md) 与 [第三方声明](resources/THIRD_PARTY_NOTICES.md)。

## 验证

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:engine
uv run --project engine --frozen ruff check engine/src engine/tests
uv run --project engine --frozen mypy engine/src/framefetch_desktop
pnpm contract:check
pnpm build
pnpm runtime:verify
pnpm test:e2e
```

E2E 在真实 Electron 中运行，用主进程测试选择器选取明确文件，renderer 没有任意路径接口。第一方 H264 夹具使 CI 无需系统编码器或远端媒体样本。测试使用临时用户目录；设置 `FRAMEFETCH_E2E_EXECUTABLE=<包内绝对可执行路径>` 验证安装态时清空 PATH。[跨平台 CI](.github/workflows/internal-build.yml) 需要手动触发；配置存在不表示 CI 已运行成功。

任务、授权及凭据默认位于系统应用数据目录。媒体库可在空库时选择，已有库迁移未实现。原生 `--user-data-dir=<绝对目录>` 可隔离工作区。API Key 由主进程保存到系统加密存储；系统保护不可用时仅当前会话保留。未知模型调用不会自动重发，用户需从素材明确重新开始分析。

## 阅读入口

完整规划见 [设计索引](docs/design/README.md)：

1. [产品定位与功能范围](docs/design/01-产品定位与功能范围.md)：独立性定义、首版范围、桌面使用流程。
2. [本地架构与复用边界](docs/design/02-本地架构与复用边界.md)：方案比较、进程职责、技术栈、源码复用和目标目录。
3. [任务存储与安全边界](docs/design/03-任务存储与安全边界.md)：IPC、SQLite、文件事务、取消恢复、凭据与 AI 调用。
4. [打包分发与版本升级](docs/design/04-打包分发与版本升级.md)：离线安装包、资源、签名、公证、升级和平台差异。
5. [实施阶段与验收](docs/design/05-实施阶段与验收.md)：分阶段任务、依赖顺序、工作量、验收和风险。
6. [首版实施记录](docs/design/06-首版实施记录.md)：已交付内容、实际证据、独立审查和未通过的验收边界。

三个项目分别承担不同职责：`video-server` 继续提供自部署服务与 Web，`video-app` 继续作为 iOS/Android 服务端客户端，`video-electron` 独立构建与运行。桌面产品的安装和构建不得依赖相邻两个源码目录。

设计中的备份迁移、完整分页、平台登录、更新、本地模型和全部跨平台发布门槛仍是后续工作。
