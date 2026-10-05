# 桌面构建资源

| 路径 | 内容 |
| --- | --- |
| `icons/` | macOS ICNS、Windows ICO 与 PNG 图标，见[图标说明](icons/README.md) |
| `licenses/` | 字体 OFL 与需单独随附的第三方许可 |
| `frontend-baseline.json` | Frontend 同步来源与 SHA-256，见[源码同步](FRONTEND_BASELINE.md) |
| `shadcn.json` | 上游 `components.json` 快照，由同步脚本维护 |

## 打包

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm package:dir
```

- 安装包只包含 Electron 入口、Renderer 与实际使用的静态资源；Renderer 第三方代码由 Vite 编译，不重复打包 `node_modules`。业务能力全部由配置的 Server 提供。
- 构建按实际输出模块生成 `assets/third-party-licenses.txt`；Electron 自带的 Chromium 许可随框架保留。
- macOS 生成 DMG，Windows 生成 NSIS，具体目标以 `electron-builder.yml` 为准。在目标系统构建并验证安装后的程序，开发态结果不代替安装态。
- 默认生成未签名的内部安装包。签名、公证、最低系统版本、干净安装、升级与卸载属于发布验证；卸载不得清除用户数据。
