# 开发预览验证记录

日期：2026-10-17。证据来自本次本机运行；不是稳定版或全平台兼容承诺。

| 检查 | 当前结果 | 证据边界 |
|---|---|---|
| `npm run verify` | 通过 | 单元/服务/子进程协议夹具与 TypeScript/Vite 构建 |
| `npm run smoke:desktop` | 通过 | Windows Electron 真机：隔离 preload、多员工提及、接收人保护、最终回复可见、SQLite 重启 |
| `node scripts/smoke-desktop.mjs --live-account` | 通过 | Electron 主进程发现真实 Codex CLI，并查询当前账户额度；不调用推理 |
| `node scripts/smoke-codex.mjs --inference` | 通过 | 当前账号真实返回 `TEAMROOM_SMOKE_OK`；请求明确不读写文件、不调用工具 |
| 实际项目修改、真实文件审批和所有工具兼容性 | 未在此批次完整验证 | 文件/命令审批和拒绝由协议夹具测试覆盖，不能替代真实项目验收 |

本机版本：Node 22.16.0、Electron 44.8.0、Codex CLI 0.144.6。第一次模型烟测在 90 秒期限内未结束，增加诊断后的 180 秒烟测成功；不保证当前账户的首次响应延迟。

GitHub CI 会独立验证 Ubuntu/Windows 的测试、构建和桌面烟测，具体结果以对应提交的 Actions 页面为准。CI 不使用个人账号执行模型请求。

远程 CI：源码提交 `7e8206763490174d3cc5d4cbaf6e717d34b41782` 的 [Windows/Ubuntu workflow](https://github.com/frankxiaofei/agent-teamroom/actions/runs/39007641186) 已成功。后续文档提交的 CI 以 Actions 的最新结果为准。
