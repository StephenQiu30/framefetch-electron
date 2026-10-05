# 安全策略

## 客户端边界

本仓库是打包内置页面的 Electron 客户端。业务权限、内容范围与任务由用户已有的 Server 控制；桌面端不扩展平台权限，不绕过访问控制，只处理用户有权获取的非 DRM 内容。

- Renderer 启用 sandbox、contextIsolation 与 webSecurity，禁用 Node integration、webview 与不受信任导航。
- 页面与静态资源由独立会话的资源协议从安装包返回；API、健康检查与 WebSocket 直连配置的后端。没有本机监听端口，没有任意目标代理，没有 shell、文件或 SQL 执行桥。
- 远端后端只用 HTTPS，HTTP 只限本机 loopback；不绕过 TLS 证书错误。
- 会话使用桌面自己的持久 Chromium 存储并按后端 origin 隔离；不读取或复制普通 Chrome Profile，不维护 JWT 或 Cookie 业务库。
- 凭据、Cookie、用户内容、完整媒体 URL query、预签名链接与原始模型响应不进入日志、测试夹具、诊断附件或 Git。
- 升级、卸载与源码清理不删除或上传用户数据。

## 报告漏洞

请勿在公开 Issue 中披露利用细节、凭据或用户内容。优先使用 GitHub 私有漏洞报告；未启用时通过 [@StephenQiu30](https://github.com/StephenQiu30) 资料页列出的私密联系方式联系维护者。报告请包含版本、操作系统、前置条件、影响范围与脱敏的最小复现，无需提供真实账户密钥、Cookie 或私有媒体。

## 发布门禁

涉及会话、导航、资源协议、请求传输、文件保存或原生能力的变更，须验证对应的失败与越权边界。签名、公证、最低系统版本、安装、升级与依赖许可按实际发布范围检查；自动化测试或生成安装包不构成这些项已通过的证明。
