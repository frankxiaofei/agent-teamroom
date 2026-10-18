# Teamroom 0.3 交付与剩余条件

日期：2026-10-18。此清单更新 0.2 历史交付，不把协议夹具、真实账号和安装包验证混为一项。

## 本批实现

| 功能 | 行为 | 验证 |
|---|---|---|
| WorkBuddy 实验性接入 | 官方 CodeBuddy CLI ACP，只读 Read/Grep/Glob；禁用外部 MCP 和用户/项目设置，写入请求发送前拒绝 | 协议夹具、官方 2.168.2 握手通过；新会话需认证 |
| Cursor Windows 入口 | 使用官方包的 node.exe + index.js，支持版本目录，跳过 shell 包装器 | 入口测试、官方 2026.10.16-e3cb207 握手通过；新会话需认证 |
| 账单 CSV | 空白模板、归属账户、整数分和退款、按账户/币种合计、编号去重、冲突整批拒绝、删除和恢复 | 单元测试及实际桌面导入/重复/备份恢复通过 |
| 更新 | 稳定/预览检查、限定官方仓库下载页；签名安装版确认后下载，验证同一可信证书，无活动任务时退出安装；可取消 | 通道/签名策略测试、Electron 加载真实 updater、未签名 IPC 拒绝通过 |
| 发布流程 | 手动 Windows workflow：验证、打包、启动检查、校验和及 artifact；默认不发布 Release，稳定版要求签名 | 本机及云端实际流程通过，publish=false 未创建 Release |
| 数据升级 | schema 3；迁移前保留一致副本，旧备份可恢复，未来版本库拒绝打开 | 实际 0.2→0.3 手动安装升级通过 |

原有群聊 @ 派发、带名牌卡通员工、30 分钟有变化才汇报、北京时间 18:00 日报、群讨论、老板结论、今日状态/耗时、账户登记和托盘继续可用。

账单是用户导入文件，未联网核验，不是服务商 API 自动同步，不推断余额或欠费。WorkBuddy 接入不接管其桌面里已有聊天。目前只统计 Teamroom 发起的任务。

## 验证收口

- `npm run verify`：69 项测试、TypeScript/Vite 构建通过。
- `npm run smoke:desktop`：实际 Electron 的群聊、讨论、汇报、账单导入与恢复、更新通道/限定下载页、托盘、重启通过；真实执行为夹具。受限主机使用工作区数据目录及测试用 sandbox 开关。
- `npm run smoke:package`：最终 0.3 unpacked 程序派发、账户、效率页、版本与重启持久化通过。
- `node scripts/smoke-portable.mjs`：实际便携 EXE 自解压、bridge 与派发通过。
- `node scripts/smoke-upgrade.mjs`：工作区内的 0.2 安装版实际升级到 0.3；保留 2 项任务、1 个账户、2 份汇报、1 个讨论。新版 schema 3、迁移副本 schema 2 均可读取。脚本只用于已知的旧版工作区测试安装，默认 CI 不运行。
- ASAR 共 2582 项，6 个新增/关键入口齐全，主程序与更新模块匹配当前编译源码；精简 manifest 的版本/入口/运行依赖一致，未发现 .env、用户数据库或工作缓存。
- `npm audit --json`：0 个已知漏洞。
- [Windows / Ubuntu CI](https://github.com/frankxiaofei/agent-teamroom/actions/runs/39085790529) 与 [Windows 云端打包](https://github.com/frankxiaofei/agent-teamroom/actions/runs/39085791401) 均 success，功能提交 `144bc83`。签名与真实账号缺口不因 CI 通过而关闭。

本机 0.3 安装器 SHA256：`48601a48edbbb0828ab716f85776c731c719060f5ec65f279c52a7ac8ee9983b`。

本机 0.3 便携版 SHA256：`15a9c3bce88ff8fb62d0451f5012a1c54fa07768e47ed707d98ebbfa27e4756f`。

云端重建可能因构建时间戳产生不同文件摘要，应使用对应产物的 SHA256SUMS。

## 尚未完成的验收

1. Claude/Cursor/Cline/Grok/WorkBuddy 的已登录真实任务与续接：需要各工具自己的有效认证；当前握手/夹具不证明模型可用。Codex 与 OpenCode 的真实只读任务及二者群讨论已在 0.2 通过。
2. 可信签名自动升级的完整端到端验证：需有效 Windows 代码签名证书及签名发布包；当前预览为 NotSigned，只能手动安装。没有用自签名或模拟证书冒充验收。
3. 系统通知实际投递、macOS/Linux 安装分发：当前群内记录/点击定位与 Windows 分发已验证，不能外推到其他平台或系统通知设置。
4. 自动获取各服务商账单/欠费：没有统一已验证 API；目前支持人工账户信息及真实 CSV 导入。
5. X 推荐：文案与截图已更新，浏览器读取连续超时，未确认账号、未发帖、没有帖子 URL。T22 保持开放。

## 使用与回退

首次使用保持演示模式；真实模式选择已有本地项目目录，在外部终端完成工具登录后再 @ 发只读任务。需要写入时明确启用并逐项审批。WorkBuddy 当前只读。

安装升级前结束正在执行的工作，保留备份。0.3 数据库版本为 3，旧 0.2 不能直接打开；回退程序时应恢复升级前的 `teamroom.db.before-v3-<uuid>.db`，保留新版库副本，不自动重放任务。
