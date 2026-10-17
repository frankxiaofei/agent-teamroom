# Teamroom

**Your AI agents, in one local desktop group chat.**

给本地 AI 工具建一个工作群。你是老板，Agent 是带着产品名牌的卡通员工：在群里 @ 指定员工交代工作，他们在群里回复进展与成果。

![Teamroom desktop](docs/images/teamroom-desktop.png)

## 当前版本：0.1.0 开发预览

- Electron + React + TypeScript 桌面应用，沿用已确认的群聊设计。
- `@Claude Code`、`@Codex` 等产品名识别、多人 @、接收人去重与整体预检查。
- SQLite 保存群消息、任务、模式和工作目录；重复消息 ID 不会重复派发。
- 真实 **Codex App Server** 接入：流式回复、会话续接、命令/文件审批、取消和额度查询。
- 演示模式支持前五位员工，不调用真实模型；WorkBuddy 始终标明待接入。
- 工具完成与老板验收分开；失败、中断、取消保留在记录里。
- 默认只读；修改项目文件需在连接设置中明确启用目录写入，并继续遵守 Codex 审批。

| 工具 | 演示 | 真实适配器 |
|---|---|---|
| Codex | 支持 | v0.1 已实现 |
| Claude Code | 支持 | M3 |
| OpenCode | 支持 | M3 |
| Cursor | 支持 | M4 |
| Cline | 支持 | M4 |
| WorkBuddy | 待接入 | M4 接口评估后决定能力范围 |

**这些卡通形象是原创概念设计，并非对应厂商的官方吉祥物。** 产品名称及商标归各自权利人所有。

## 本地运行

需要 Node.js 22.16+、npm 和 Git。

```sh
git clone https://github.com/frankxiaofei/agent-teamroom.git
cd agent-teamroom
npm ci
npm run dev
```

发布构建后的源码运行：

```sh
npm run build
npm start
```

浏览器只看演示：`npm run web`。浏览器演示使用 LocalStorage；真实工具和 SQLite 仅在桌面运行。

## 连接真实 Codex

1. 通过 [Codex 官方文档](https://learn.chatgpt.com/docs/app-server) 安装 CLI，并在外部终端完成登录。
2. 在 Teamroom 的「连接设置」选择真实模式和一个本地项目目录。
3. 保持只读进行首次验证；需要改代码时再启用「允许修改工作目录中的文件」。
4. 在群里输入 `@Codex 阅读项目说明，汇报你理解的结构`。

不需要把 API key 或登录文件交给 Teamroom。它复用 CLI 自己的认证方式。检测到 CLI 只证明已安装；模型、登录和额度是否可用以实际请求为准。

## 工作记录与能力边界

- 目前只统计由 Teamroom 发起的任务，不接管工具桌面界面里已有的所有聊天。
- 多人 @ 把同一条指令分别交给指定工具，不自动拆解目标或替老板选择员工。
- v0.1 全局串行执行任务，避免多个员工同时覆盖工作目录；后续并行先实现 workspace 隔离。
- 重启后未完成任务标记中断，需检查原工具后再明确发送；不会自动重派。
- 命令和文件变更审批已实现。其他 Codex 交互请求明确返回不支持，不自动批准。
- 账户额度不是余额或账单。没有账单来源时不推断欠费，不把 token 折算当实际消费。
- 当前为源码开发预览，尚无签名安装包、自动更新或稳定版承诺。

## 开发与验证

```sh
npm run verify
npm run smoke:desktop
node scripts/smoke-codex.mjs
# 可选：会调用已登录 Codex 的一次极小推理请求
node scripts/smoke-codex.mjs --inference
```

测试包括接收人边界、幂等派发、SQLite 事务与重启、取消、Codex 真实子进程协议夹具以及桌面烟测。夹具测试与真实服务验证分别记录。

## 规划与协作

- [需求清单](docs/requirements.md)
- [Milestones](docs/milestones.md)
- [Tasks](docs/tasks.md)
- [架构与数据边界](docs/architecture.md)
- [X 推荐计划与文案](docs/x-launch.md)
- [形象素材说明](docs/assets.md)
- [本机验证与证据边界](docs/verification.md)

欢迎提交 issue，优先贡献 Claude Code / OpenCode 适配器、ACP 集成和真实使用反馈。
