# Framefetch 应用图标

本目录只保存 Electron 安装包和系统 Dock 使用的正式品牌资源。源品牌来自 `framefetch-server/frontend/public/logo.svg` 与 `logo.png`；ICNS 用于 macOS，ICO 用于 Windows，PNG 用于开发态 Dock。

业务页面复用 Frontend 的代码与资源并包含在客户端安装包中，不从 Frontend 服务加载。Logo、字体、样式和文案通过 frontend:sync 同步；发布时如正式品牌变化，同步更新本目录安装包图标，并检查它与页面 Logo 一致。
