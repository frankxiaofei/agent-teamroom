# Tasks

状态在验证后更新；GitHub issue 对应编号通过仓库链接追踪。每项只有通过验收才完成。

## M2.1 · 主动汇报（当前批次）

- [x] T23：持久化任务状态事件，交付与验收分别统计；历史未知不推算。
- [x] T24：默认 30 分钟有变化才汇报、北京时间 18:00 日报、手动立即汇报和设置入口。
- [x] T25：汇报消息与发送去重；休眠/退出后合并补报；演示/真实隔离。
- [x] T26：托盘驻留、即时桌面提醒、点击定位；通知失败不丢群记录。

## M2.2 · 群内讨论（当前批次）

- [x] T27：老板从群里发起问题，选择最多两位已接入员工；问题卡片关联任务与回复。
- [x] T28：Agent 在轮次结束时提出结构化讨论请求，暂停原任务并定向邀请可用员工。
- [x] T29：讨论独立只读会话，拒绝权限扩大；每轮回复和总结，最多三轮。
- [x] T30：老板补充意见、提交结论、明确确认继续原任务；取消与失败保留证据。
- [x] T31：重启不重放、模式隔离、讨论汇报、队列不死锁、桌面与协议夹具验证。

## M1 · 本地群聊基础

- [x] T01：Electron/React/TypeScript 项目；桌面可启动，保留工作群样式。 [#1](https://github.com/frankxiaofei/agent-teamroom/issues/1)
- [x] T02：带产品名牌的 6 位卡通员工；@ 菜单和成员点击插入。 [#2](https://github.com/frankxiaofei/agent-teamroom/issues/2)
- [x] T03：多人提及、去重、未知名称与整条发送预检查；无隐式广播。 [#3](https://github.com/frankxiaofei/agent-teamroom/issues/3)
- [x] T04：SQLite 群消息/任务/设置；事务与消息 ID 幂等；演示/真实隔离。 [#4](https://github.com/frankxiaofei/agent-teamroom/issues/4)
- [x] T05：自动测试、桌面 smoke、重启持久化；GitHub CI。 [#5](https://github.com/frankxiaofei/agent-teamroom/issues/5)

## M2 · Codex 真实闭环

- [x] T06：本机 CLI 发现、stdio JSON-RPC、握手和启动错误处理。 [#6](https://github.com/frankxiaofei/agent-teamroom/issues/6)
- [x] T07：thread/start/resume、turn/start、文本流与最终交付。 [#7](https://github.com/frankxiaofei/agent-teamroom/issues/7)
- [x] T08：命令/文件单次审批、拒绝与取消；不自动批准其他请求。 [#8](https://github.com/frankxiaofei/agent-teamroom/issues/8)
- [x] T09：只读默认、目录写入显式授权、窄 IPC、凭据不进记录。 [#9](https://github.com/frankxiaofei/agent-teamroom/issues/9)
- [x] T10：额度查询；真实账户与极小推理验证，和协议夹具证据分开。 [#10](https://github.com/frankxiaofei/agent-teamroom/issues/10)

## M3 · Claude 与 OpenCode

- [ ] T11：Claude Code CLI 流式适配器，续接、取消与权限请求。 [#11](https://github.com/frankxiaofei/agent-teamroom/issues/11)
- [ ] T12：OpenCode 本地 Server 适配器，异步任务、事件与中止。 [#12](https://github.com/frankxiaofei/agent-teamroom/issues/12)
- [ ] T13：两种适配器的实际任务、断线、失败、使用量去重测试。 [#13](https://github.com/frankxiaofei/agent-teamroom/issues/13)

## M4 · ACP 与 WorkBuddy

- [ ] T14：Cursor ACP 初始化、版本协商、提问、权限、恢复与取消。 [#14](https://github.com/frankxiaofei/agent-teamroom/issues/14)
- [ ] T15：Cline ACP 初始化、模型/提供方、权限、恢复与取消。 [#15](https://github.com/frankxiaofei/agent-teamroom/issues/15)
- [ ] T16：WorkBuddy 官方接口能力调查与证据清单；只实现可验证接口。 [#16](https://github.com/frankxiaofei/agent-teamroom/issues/16)

## M5 · 可日用与分发

- [ ] T17：北京时间日报、跨午夜任务、执行/等待时长和验收去重。 [#17](https://github.com/frankxiaofei/agent-teamroom/issues/17)
- [ ] T18：同类任务耗时中位数、样本量、失败与返工；不按 token 速度总排名。 [#18](https://github.com/frankxiaofei/agent-teamroom/issues/18)
- [ ] T19：账户身份归并、额度来源与刷新时间、实际账单与估算区分。 [#19](https://github.com/frankxiaofei/agent-teamroom/issues/19)
- [ ] T20：Windows 安装包、恢复/备份、升级迁移、包内清单与分发验证。 [#20](https://github.com/frankxiaofei/agent-teamroom/issues/20)

## M6 · X 推荐与社区反馈

- [x] T21：真实截图、双语介绍与可复现演示，README 与能力表同步。 [#21](https://github.com/frankxiaofei/agent-teamroom/issues/21)
- [ ] T22：按发布条件在 X 发布并读回链接；整理初批用户反馈到 issue。 [#22](https://github.com/frankxiaofei/agent-teamroom/issues/22)
