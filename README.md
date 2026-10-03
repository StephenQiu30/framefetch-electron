<div align="center">

<img src="src/renderer/public/logo.png" width="96" alt="FrameFetch 正式 Logo" />

# FrameFetch Desktop · 帧取桌面端

**开源、自托管的个人视频与剧本工作站，桌面入口。**

接入素材，理解内容，交付可继续编辑的报告。<br />
独立安装，内置共享 React 页面；连接你的 FrameFetch Server，与 Web、App 使用同一套账户、素材、任务和报告。媒体处理与 AI 执行由 Server 和宿主 AI Worker 完成。

[![Desktop CI](https://github.com/StephenQiu30/video-electron/actions/workflows/internal-build.yml/badge.svg)](https://github.com/StephenQiu30/video-electron/actions/workflows/internal-build.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Latest preview](https://img.shields.io/github/v/release/StephenQiu30/video-electron?include_prereleases&color=111111)](https://github.com/StephenQiu30/video-electron/releases)

[核心功能](#核心功能) · [完整工作流](#从素材到报告) · [开始使用](#开始使用) · [开发与构建](#开发与构建) · [设计文档](docs/design/README.md) · [English](README.en.md)

</div>

![帧取桌面工作区](docs/images/desktop-workspace.png)

> 当前 FrameFetch Desktop 0.2.0 的真实 Electron Renderer 截图。页面使用正式 Logo 与共享 Web 组件；截图会话及下方记录、分析和剧本文字均为演示数据。

## 为什么使用帧取桌面端

帧取（FrameFetch）面向创作者、内容研究者和开发者，把素材获取、视频复盘、剧本审阅与报告整理连接成一个个人工作站。桌面端适合在电脑上集中处理素材、阅读长篇分析、核对剧本文档，并通过系统保存对话框获取制品和报告。部署者控制基础设施、文件存储和模型配置。

- **一个工作区，三种入口。** 粘贴公开链接或完整分享文案、导入本地 MP4、上传剧本文档，从同一页面开始处理。
- **先确认，再获取。** 查看解析结果与真实可用格式，选择分辨率、容器、编码和帧率；图集与有限视频合集按平台实际能力提供带 `manifest.json` 的 ZIP 制品。
- **素材之后，继续分析。** 使用 Server 提供的分析 Skill，查看摘要、场景、分镜、高光和视觉资产，导出 Markdown 或 DOCX 报告。
- **剧本可以阅读，也可以处理。** 导入多种文档格式，阅读规范化正文和目录，选择剧本分析、改写或语言转换任务。
- **熟悉的页面，同一套数据。** Web 和桌面复用实际业务组件、主题、字体与品牌；连接同一 Server 并登录同一账户，使用已有素材、任务、文档和报告。
- **符合桌面习惯。** 系统文件选择与保存、原生菜单、后退、重连、缩放和全屏，以及独立持久登录会话。

## 核心功能

| 能力 | 可以做什么 |
| --- | --- |
| 链接解析 | 解析有权处理的单视频、图集与有限视频合集链接；公众号文章仅做来源发现，当前候选不提供下载格式，按提示官方播放或合法文件导入。实际可用能力以 Server 的平台状态和解析结果为准 |
| 格式选择 | 核对视频尺寸、容器、视频/音频编码与帧率，选择目标规格并创建任务；图集与有限视频合集按来源能力交付带 `manifest.json` 的原图／视频 ZIP |
| 本地视频 | 从系统选择 MP4，完成 SHA-256 校验与带进度的分片上传；导入完成后继续预览、管理与分析 |
| 下载记录 | 搜索、筛选、分页、多选，批量获取文件、重试或删除；详情展示状态、进度、恢复操作与媒体预览 |
| 视频 AI 分析 | 选择服务端统一的 12 项视频 Skill、中文或英文输出与自定义分析重点；阅读摘要、场景、分镜、高光、资产、文章或通用结构化报告 |
| 剧本文档 | 导入 DOCX、文字型 PDF、TXT、Markdown 和 Fountain；查看文档信息、提取规模、规范化正文与目录，继续分析或改写 |
| 报告与运行记录 | 预览报告，导出 Markdown/DOCX；查看同一素材的处理记录和分析运行记录，按需重新执行 |
| 平台与账户 | 查看平台接入状态，管理用户名和头像；具备 Server 管理权限的账户可访问用户、文件、平台目录、AI 线路、统计和操作日志页面 |
| 亮暗主题 | 使用与 Web 一致的黑白中性色、Geist 排版和官方组件交互；保留正式 Logo 的品牌色 |

### 专业方法与成果

桌面与 Web、App 使用服务端同一份方法清单：**12 项视频方法**覆盖画面整理、导演拉片、剪辑与连续性审阅、文章和短视频包装；**8 项剧本方法**覆盖故事、人物、场景、对白、结构、连续性与中英改写。选择方法、输出语言和分析重点后，即可围绕同一素材开展不同角度的研究。完整清单见 Server 的 [视频方法目录](https://github.com/StephenQiu30/video-server#12-种视频分析方法)与[剧本方法目录](https://github.com/StephenQiu30/video-server#8-种剧本分析方法)。

12／8 是当前方法目录的数量，不代表每种方法都已完成真实模型验收；可用方法、模型线路与运行结果以连接的 Server 为准。

方法对应 **5 类成果**：视频视觉分析、视频文章、通用结构化报告、剧本分析与剧本改写。桌面按统一结果结构展示正文和证据，并提供 Markdown/DOCX 导出，便于继续编辑、审阅和归档。两种格式由同一结构化结果生成，导出无需重新调用模型；文章、包装文案与改写结果都是供人工复核和修订的候选。

### 当前界面

| 下载记录 | AI 分析 |
| --- | --- |
| ![下载记录，含搜索筛选、多选和演示任务](docs/images/desktop-history.png) | ![AI 分析，含摘要、分镜和报告导出](docs/images/desktop-analysis.png) |

![剧本文档，含文档信息、规范化正文和目录](docs/images/desktop-screenplay.png)

这些图片来自当前生产构建在独立 Electron 会话中的真实渲染，未重绘页面。演示 API 仅提供读取响应；视频分析与剧本文档基于现有 Frontend 测试夹具，影视素材分析内容和剧本文字是用于展示结果结构的示例。图片不含真实账户或私人素材。完整阅读与分析配置截图见 [剧本阅读视图](docs/images/desktop-screenplay-reader.png)。

## 从素材到报告

1. **接入**：粘贴单条媒体链接或含单条链接的分享文案，按平台实际能力处理单视频、图集或有限视频合集；也可从系统选择 MP4，或导入 DOCX、文字型 PDF、TXT、Markdown、Fountain 剧本。公众号文章仅做来源发现，当前候选不提供下载格式，按提示官方播放或合法文件导入。
2. **确认**：核对媒体信息、访问决策和真实格式，选择视频画质、容器、编码与音轨，或确认图集／合集条目和 ZIP 下载。过期解析结果可显式刷新，格式变化时重新确认。
3. **获取**：Server 后台执行下载和导入，桌面显示排队、进度与结果，提供取消、重试和历史找回。本地视频经受限分片上传后由 Worker 复验。
4. **管理**：视频提供详情、预览与文件交付；图集／有限合集以包含 `manifest.json` 的 ZIP 交付；剧本保留原件与规范化场景文本。从记录继续查看文件、历史运行和报告。
5. **分析**：选择视频或剧本 Skill、中文／英文输出与关注重点。素材获取与分析分别记录状态，AI 失败不会改变已经取得的素材。
6. **交付**：结合时间证据或剧本场景复核结论，导出 Markdown／DOCX 继续编辑和交接；导出恢复复用已有分析结果。

耗时任务由 Server 的 Worker 和宿主 AI Worker 执行。桌面接收任务状态更新；连接同一服务并登录同一账户后，可以从 Web、桌面或 App 的相应页面继续查看业务记录。完整视频提供技术信息、时间段和关键帧证据，剧本结论关联规范化场景；这些证据与原文一起帮助你复核模型判断。完整分析实现见 [Server AI 分析](https://github.com/StephenQiu30/video-server/blob/main/docs/design/10-AI分析.md)。

## 三个项目，一套产品

| 项目 | 负责什么 |
| --- | --- |
| [FrameFetch Server / Web](https://github.com/StephenQiu30/video-server) | FastAPI 业务接口、Next.js Web 页面、用户与权限、解析/下载/导入/分析、队列与 Worker、数据库、对象存储和报告 |
| **FrameFetch Desktop，本仓库** | 独立 Electron 安装包，内置共享 React 页面，连接现有 Server，提供窗口、会话与受限原生能力 |
| [FrameFetch App](https://github.com/StephenQiu30/video-app) | Flutter iOS/Android 原生客户端，通过同一 Server 契约提供移动端文件导入、播放、分析、报告与管理入口 |

桌面运行时，Electron 使用配置的 Server origin，在独立 Chromium 会话中从安装包返回 HTML、JS、字体和图片。`/api`、`/health` 请求连接已有 Server，WebSocket 沿用同源会话协议。页面随客户端安装，不依赖远端 Frontend 页面或本机 Frontend 进程。

原件、规范化文本、任务与报告保存在 Server 配置的存储中。桌面本地保存连接偏好与独立 Chromium 会话，按 Server 地址隔离登录状态；安装包提供界面，业务操作需要 Server 可达。桌面不运行离线媒体引擎、离线 AI 模型或独立业务数据库。

### 技术如何支持体验

| 技术 | 产品中的职责 |
| --- | --- |
| Electron / Chromium | 原生窗口、系统保存文件、原生菜单、独立会话和桌面生命周期 |
| React / TypeScript strict / Vite | 复用实际 Frontend 页面，将页面与资源编译进安装包 |
| Tailwind CSS / shadcn / Radix / Phosphor / Geist | 保持多端品牌、视觉层级、键盘与焦点交互一致 |
| Axios / TanStack Query | 统一请求、缓存、状态刷新、取消与会话失效处理 |
| FastAPI OpenAPI / @umijs/openapi | 与 Web 使用同一份自动生成接口和类型，保持业务契约一致 |
| WebSocket / HTTP 文件流 | 任务实时更新、断线恢复，以及带 HEAD/Range 语义的文件访问 |
| SHA-256 / 分片上传 | 文件完整性校验、进度反馈与 Server 签发的受限上传入口 |
| electron-builder | macOS DMG 与 Windows NSIS 安装包 |

## 开始使用

### 下载公开预览版

当前公开版本为 **[v0.2.0-beta.1](https://github.com/StephenQiu30/video-electron/releases/tag/v0.2.0-beta.1)**。安装包内版本与文件名为 `0.2.0`，tag 的 `beta.1` 表示公开预览渠道。

| 系统 | 安装包 |
| --- | --- |
| macOS 14.0+，Apple Silicon（ARM64） | [FrameFetch-0.2.0-mac-arm64.dmg](https://github.com/StephenQiu30/video-electron/releases/download/v0.2.0-beta.1/FrameFetch-0.2.0-mac-arm64.dmg) |
| Windows x64 | [FrameFetch-0.2.0-win-x64.exe](https://github.com/StephenQiu30/video-electron/releases/download/v0.2.0-beta.1/FrameFetch-0.2.0-win-x64.exe) |
| SHA-256 校验清单 | [SHA256SUMS.txt](https://github.com/StephenQiu30/video-electron/releases/download/v0.2.0-beta.1/SHA256SUMS.txt) |

安装包尚未完成发布者签名，macOS 未公证，系统可能显示安全提示；当前不提供 Intel macOS 或 Linux 安装包。下载后计算对应文件的 SHA-256，并与校验清单比较：

```sh
# macOS
shasum -a 256 FrameFetch-0.2.0-mac-arm64.dmg
```

```powershell
# Windows PowerShell
Get-FileHash .\FrameFetch-0.2.0-win-x64.exe -Algorithm SHA256
```

### 连接你的工作站

1. 准备可访问的 [FrameFetch Server](https://github.com/StephenQiu30/video-server#快速开始)，确认其登录、文件存储和所需业务能力已经配置。
2. 下载并安装目标系统的 FrameFetch 桌面包；自行构建的命令见下文。
3. 指定 Server 根地址，打开客户端并登录该 Server 的账户。默认连接 `http://127.0.0.1:8111/`，远端部署使用 HTTPS。
4. 从链接解析、本地视频或剧本文档开始，或进入已有记录继续处理。

macOS 安装态指定连接地址的示例：

```sh
"/Applications/FrameFetch.app/Contents/MacOS/FrameFetch" \
  --backend-url=https://framefetch.example.com/
```

连接优先级为：`--backend-url=<地址>` → `FRAMEFETCH_BACKEND_URL` → 应用数据目录中的 `connection.json` → 默认地址。配置文件内容为：

```json
{ "backend_url": "http://127.0.0.1:8111/" }
```

地址须为无账户凭据、路径、参数或片段的根地址。远端仅接受 HTTPS，本机允许 `localhost`、`127.0.0.1` 或 `::1` 的 HTTP。`--user-data-dir=<绝对目录>` 可用于独立应用数据目录；客户端不读取浏览器已有的登录 Profile。

## 开发与构建

Node.js 要求 `>=24.15.0 <25`，pnpm 为 `12.4.2`。准确版本以 [package.json](package.json) 和唯一锁文件为准。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

连接已有远端 Server：

```sh
FRAMEFETCH_BACKEND_URL=https://framefetch.example.com/ pnpm dev
```

运行已有构建：

```sh
pnpm build
pnpm start
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

产物位于 `release/`；当前 macOS 构建配置最低版本为 macOS 14.0。默认构建配置生成内部未签名安装包，外部分发时的签名、公证和目标系统安装验证见 [构建资源](resources/README.md)。

### 页面与接口同步

`video-server/frontend` 是业务页面、文案、品牌和主题的来源。[design.md](design.md) 保留 Server 视觉规范的原文快照。上游文件由同步脚本管理，仅平台 adapters 手工维护。

在具有相邻 Server 源码的工作区更新并检查：

```sh
pnpm frontend:sync
pnpm frontend:check
pnpm frontend:check-upstream
```

`frontend:check` 离线检查已提交快照与 manifest hash，可用于独立 checkout 和 CI；`frontend:check-upstream` 对照选定上游 checkout 的实际内容。安装和运行不需要相邻源码，其他 checkout 的同步方式见 [源码复用说明](resources/FRONTEND_BASELINE.md)。

接口变更先在 Server Frontend 执行 OpenAPI 生成，再同步到桌面。需要对照其他当前契约时：

```sh
OPENAPI_SCHEMA_URL=http://127.0.0.1:8111/openapi.json pnpm openapi:check
```

契约链路为 FastAPI 注解/Pydantic → `/openapi.json` → Swagger `/docs` → `@umijs/openapi`。数据库结构唯一来源是 Server 的 `backend/sql/schema.sql`；不手工修改生成 API，不复制维护桌面 SQL、DTO 或 Swagger 文档。

### 检查

```sh
pnpm frontend:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm package:dir
```

检查分别覆盖源码一致性、格式和类型、单元测试、生产构建、真实 Electron 传输及安装包。真实 Server 用户流程和各目标系统安装行为按 [验收边界](docs/design/01-验收边界.md) 单独验证。

`v0.2.0-beta.1` 安装包来自提交 `c8a85c94548a20619bf8b34a71a6916992654a17` 的 [成功 CI](https://github.com/StephenQiu30/video-electron/actions/runs/37096373778)。macOS ARM64 与 Windows x64 的单元测试、开发态及打包态传输 E2E 通过，E2E 使用受控夹具，只证明相应传输行为，不等于真实 Server 全业务验收。干净安装、升级、卸载和真实 Server 完整业务流程仍需独立验证。

## 使用范围

- 只处理已获授权的 HTTP(S) 非 DRM 素材。平台、身份与网络条件会影响实际可用性，准确状态和完整文件证据以 [Server 平台目录与验证边界](https://github.com/StephenQiu30/video-server/blob/main/docs/design/17-解析引擎重建.md#8-平台能力与验证边界) 为准。
- 部署者提供服务、存储、网络和模型；外部模型可能产生费用，并接收分析所需的文本或画面。
- 当前产品覆盖素材获取、管理、分析与报告。文章、包装与剧本改写需要人工复核；ASR／OCR、DRM 解密、直播录制、无限播放列表、在线协作编辑和自动平台发布不在当前范围内。

## 文档与贡献

- [工程规范](PROJECT.md)：技术、目录职责、接口和连接边界。
- [设计文档](docs/design/README.md)：当前架构与验收条件。
- [源码复用](resources/FRONTEND_BASELINE.md)：页面依赖闭包、来源 hash 与同步方法。
- [资源说明](resources/README.md)：图标、字体、依赖许可、构建与签名。
- [贡献指南](CONTRIBUTING.md) · [问题反馈](https://github.com/StephenQiu30/video-electron/issues) · [安全报告](SECURITY.md)。

业务操作沿用 Server 的身份、所有者权限和平台能力，请仅处理已获授权内容。历史版本的本地媒体、数据库、报告和凭据文件保留原件，不自动上传、导入 Server 或删除。

源码采用 [MIT 许可](LICENSE)。依赖、字体和品牌资源保留各自适用许可。

如果帧取有助于你的创作、研究或自托管工作，欢迎 **Star** 本仓库、关注 [Releases](https://github.com/StephenQiu30/video-electron/releases)，或从 `good first issue`／`help wanted` 的 [Issues](https://github.com/StephenQiu30/video-electron/issues) 开始贡献。
