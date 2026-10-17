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

## M2.1 / M2.2：主动汇报与群内讨论（2026-10-17）

- `npm run verify`：36 项测试通过，TypeScript 与 Vite 构建通过。
- `npm run smoke:desktop`：真实 Electron 验证群聊路由、立即汇报、多人演示讨论、结论草稿跨快照保持、汇报设置保存、通知定位事件、托盘隐藏/再次打开和 SQLite 重启恢复。
- `node scripts/smoke-discussion.mjs --inference`：已登录 Codex 返回真实回复与总结；没有创建执行任务，写入权限保持关闭；老板提交结论后讨论结束。
- 定时逻辑使用可控时间验证 30 分钟变化检查、北京时间日界、跨午夜验收归属、休眠合并补报、重启去重及修改设置不丢事件。未把等待真实半小时当作测试方法。
- 并发用例覆盖讨论取消时切换模式、重复取消覆盖已确认结论、旧取消覆盖新排队轮次，以及任务与讨论共享串行执行槽。
- 多产品讨论用演示/协议夹具验证；此分支基线的真实适配器仅 Codex。系统通知的实际系统投递仍在 M5 安装包验收中复验，不把测试发送定位事件说成系统已投递。
- 所有验收使用独立测试数据目录，原开发目录的未提交工具接入改动保持不变。