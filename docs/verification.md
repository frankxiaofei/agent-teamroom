# 开发预览验证记录

日期：2026-10-17。证据来自本次本机运行；不是稳定版或全平台兼容承诺。

| 检查 | 当前结果 | 证据边界 |
|---|---|---|
| `npm run verify` | 通过 | 单元/服务/子进程协议夹具与 TypeScript/Vite 构建 |
| `npm run smoke:desktop` | 通过 | Windows Electron 真机：隔离 preload、多员工提及、接收人保护、最终回复可见、SQLite 重启 |
| `node scripts/smoke-desktop.mjs --live-account` | 通过 | Electron 主进程发现真实 Codex CLI，并查询当前账户额度；不调用推理 |
| `node scripts/smoke-codex.mjs --inference` | 通过 | 当前账号真实返回 `TEAMROOM_SMOKE_OK`；请求明确不读写文件、不调用工具 |
| 实际项目修改、真实文件审批和所有工具兼容性 | 未在此批次完整验证 | 文件/命令审批和拒绝由协议夹具测试覆盖，不能替代真实项目验收 |

上表是 13:xx 提交时点的记录；合并 Grok/@all 与 M2.1/M2.2 后的当前工作树复验见下方「2026-10-17 合并后复验」。

本机版本：Node 22.16.0、Electron 44.8.0、Codex CLI 0.144.6。第一次模型烟测在 90 秒期限内未结束，增加诊断后的 180 秒烟测成功；不保证当前账户的首次响应延迟。

GitHub CI 会独立验证 Ubuntu/Windows 的测试、构建和桌面烟测，具体结果以对应提交的 Actions 页面为准。CI 不使用个人账号执行模型请求。

远程 CI：源码提交 `7e8206763490174d3cc5d4cbaf6e717d34b41782` 的 [Windows/Ubuntu workflow](https://github.com/frankxiaofei/agent-teamroom/actions/runs/39007641186) 已成功。后续文档提交的 CI 以 Actions 的最新结果为准。

## M2.1 / M2.2：主动汇报与群内讨论（2026-10-17）

- `npm run verify`：36 项测试通过，TypeScript 与 Vite 构建通过。
- `npm run smoke:desktop`：真实 Electron 验证群聊路由、立即汇报、多人演示讨论、结论草稿跨快照保持、汇报设置保存、通知定位事件、托盘隐藏/再次打开和 SQLite 重启恢复。
- `node scripts/smoke-discussion.mjs --inference`：已登录 Codex 返回真实回复与总结；没有创建执行任务，写入权限保持关闭；老板提交结论后讨论结束。
- 定时逻辑使用可控时间验证 30 分钟变化检查、北京时间日界、跨午夜验收归属、休眠合并补报、重启去重及修改设置不丢事件。未把等待真实半小时当作测试方法。
- 并发用例覆盖讨论取消时切换模式、重复取消覆盖已确认结论、旧取消覆盖新排队轮次，以及任务与讨论共享串行执行槽。
- 多产品讨论用演示/协议夹具验证；v0.1 受支持的真实适配器仅 Codex；Grok 只有协议夹具。系统通知的实际系统投递仍在 M5 安装包验收中复验，不把测试发送定位事件说成系统已投递。
- 此段记录的是分支时点；后续已将该分支合入 main，并保留原开发目录的 Grok/@all 改动。

## 2026-10-17 合并后复验（M2.1/M2.2 + Grok/@all）

- `npm run verify`：45 项测试通过，TypeScript 与 Vite 构建通过。覆盖 M1/M2、M2.1/M2.2、Grok 协议夹具、@all 和安装发现。
- `npm run smoke:desktop`：通过（受限主机）。直接启动时 Electron 在当前非交互桌面会话中因 Chromium sandbox 失败；使用 `TEAMROOM_SMOKE_NO_SANDBOX=1` 和 `TEAMROOM_SMOKE_DATA_DIR=<workspace>/.smoke-data` 后，真实 Electron 烟测通过，覆盖群聊路由、立即汇报、两人演示讨论、结论草稿、汇报设置、通知定位、托盘隐藏/再次打开、SQLite 重启恢复和目录恢复（真实执行仍为夹具）。这不等于常规桌面环境也无需该开关。
- `docs/images/teamroom-desktop.png` 与 `teamroom-discussion.png` 已由本次烟测重新生成，显示 7 位员工（含 Grok 占位）与讨论卡片。
- Grok：仅 4 项协议夹具测试（流式、审批拒绝、未登录、取消）。本机 PATH 未发现 `grok` 命令，未执行真实 Grok CLI/账户验证；T34 保持开放。
- `@all`：自动测试覆盖“只发给当前可用员工、显式不可用 @ 仍阻止整条发送”；演示模式由 LocalStorage bridge 验证。没有把测试夹具说成真实多工具验证。
- 合并后代码在 main 的工作树中运行；本轮 Node 24.19.0、Electron 44.8.0。历史记录中的 Node 22.16.0 是前一时点。
- 真实项目文件修改、真实 Codex 文件审批、Grok 真实接入、Windows 安装包和系统通知实际投递仍不在本轮验证范围内。
## 2026-10-18 v0.2 开发与本机验证

- `npm run verify`：60 项测试、TypeScript 与 Vite 构建通过。新增 SDK/ACP 权限与终态、历史回放隔离、跨权限线程隔离、统计等待时长、续做样本、账户去重、损坏备份/schema/时间/身份拒绝、恢复中途回滚和旧库迁移用例。
- `npm run smoke:desktop`：通过（受限主机使用 `TEAMROOM_SMOKE_NO_SANDBOX=1` 和工作区数据目录）。实际 Electron 覆盖分类、账户零余额与共享关联、效率页、导出、取消恢复、确认恢复、群讨论、托盘与重启；真实执行使用夹具，协议验证不冒充真实任务。
- `npm audit --json`：运行时与开发依赖 0 已知漏洞。electron-builder 固定 26.15.3，并将 global-agent 覆盖为 4.1.3，避免旧日志依赖公告；打包构建实测通过。
- `node scripts/smoke-codex.mjs --inference`：账户额度端点及真实 `TEAMROOM_SMOKE_OK` 通过；连接重试后完成。
- `node scripts/smoke-adapters.mjs --inference --opencode`：OpenCode 1.19.3 真实返回 `TEAMROOM_OK`，先验证最终 plan 权限，不执行文件工具。
- `node scripts/smoke-discussion.mjs --inference --multi`：Codex + OpenCode 真实回复、建议总结及老板结论通过；未创建执行任务，写入保持关闭。
- Claude Code：官方 SDK 真实极小请求返回认证要求；Cline/Grok CLI 握手或新会话需认证；Cursor Agent CLI 未发现。未声称这些工具完成真实验收。Grok 当前本机版本 1.0.62。
- `npm run package:win`：生成 NSIS 安装器及 portable EXE。受限主机首次 NSIS uninstaller 构建失败，改用工作区 `TEMP/TMP` 后构建通过。Authenticode 检查为 `NotSigned`；不是签名稳定版。
- `npm run smoke:package`：最终 `release/win-unpacked/Teamroom.exe` 实际运行通过，验证群聊、账户、统计、版本及重启持久化；首次系统临时目录锁失败，使用工作区隔离数据目录后通过。
- ASAR 检查：2327 项、8 个关键模块/素材入口齐全、未发现 `.env`、数据库、工作记录或测试缓存。未将用户登录凭据打入包。
- 自解压 portable 与 NSIS 安装/升级不能仅由 unpacked smoke 代替；本机静默安装的最终结果另列，未通过前 T20 保留验收缺口。系统通知真实投递、签名和自动更新不在本次通过范围内。
