# 随包许可来源

Geist 与 Geist Mono 的 OFL 文本来自锁定的 `@fontsource-variable/*` 包。
构建根据实际 Renderer 输出模块收集依赖的 LICENSE/NOTICE，并包含 vendor 子目录的许可。

以下包的 npm 发布物缺少根 LICENSE，因此在本仓库保留其官方来源原文供离线构建使用：

- react-remove-scroll-bar：[官方 LICENSE](https://github.com/theKashey/react-remove-scroll-bar/blob/master/LICENSE)
- victory-vendor：[Victory 官方 LICENSE](https://github.com/FormidableLabs/victory/blob/main/LICENSE.txt)，其发布物内 `lib-vendor` 的各份许可仍由构建同时收集。

更新对应依赖时核对这些来源。安装包包含许可文件及 `out/renderer/assets/third-party-licenses.txt`。
