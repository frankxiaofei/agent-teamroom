# Tasks

状态在验证后更新；GitHub issue 对应编号通过仓库链接追踪。每项只有通过验收才完成。

## M2.1 · 主动汇报（已完成，合入 main）

- [x] T23：持久化任务状态事件，交付与验收分别统计；历史未知不推算。
- [x] T24：默认 30 分钟有变化才汇报、北京时间 18:00 日报、手动立即汇报和设置入口。
- [x] T25：汇报消息与发送去重；休眠/退出后合并补报；演示/真实隔离。
- [x] T26：托盘驻留、即时桌面提醒、点击定位；通知失败不丢群记录。

## M2.2 · 群内讨论（已完成，合入 main）

- [x] T27：老板从群里发起问题，选择最多两位已接入员工；问题卡片关联任务与回复。
- [x] T28：Agent 在轮次结束时提出结构化讨论请求，暂停原任务并定向邀请可用员工。
- [x] T29：讨论独立只读会话，拒绝权限扩大；每轮回复和总结，最多三轮。
- [x] T30：老板补充意见、提交结论、明确确认继续原任务；取消与失败保留证据。
- [x] T31：重启不重放、模式隔离、讨论汇报、队列不死锁、桌面与协议夹具验证。

## M2.3 · 本机发现与 Grok（实验性，当前批次）

- [x] T32：Grok stdio 适配器；initialize/authenticate、session new/load、prompt 流式、审批拒绝、取消与未登录错误；4 项协议夹具测试。
- [x] T33：本机命令发现与显式 @all；v0.1 只有 Codex/Grok 有执行器（v0.2 扩展见下）；显式不可用 @ 仍阻止整条发送；添加 UI 与测试。
- [ ] T34：真实 Grok CLI/账户验证；记录版本、登录方式、极小只读任务与失败边界，完成前不得把 Grok 列为受支持适配器。

## M1 · 本地群聊基础

- [x] T01：Electron/React/TypeScript 项目；桌面可启动，保留工作群样式。 [#1](https://github.com/frankxiaofei/agent-teamroom/issues/1)
- [x] T02：带产品名牌的基础 6 位卡通员工；v0.2 增加带名牌的 Grok SVG 卡通；@ 菜单和成员点击插入。 [#2](https://github.com/frankxiaofei/agent-teamroom/issues/2)
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

- [x] T11：Claude Code 官方 SDK 流式适配器，续接、取消、逐次权限请求与估算来源；源码/注入测试完成，真实账户验收归 T13。 [#11](https://github.com/frankxiaofei/agent-teamroom/issues/11)
- [x] T12：OpenCode 改用官方 ACP 适配器，流式、续接、取消、配置隔离与最终权限预检；本机 1.19.3 极小只读请求通过。 [#12](https://github.com/frankxiaofei/agent-teamroom/issues/12)
- [ ] T13：部分完成；协议失败/取消/续接/估算累计边界有测试，OpenCode 真实只读请求通过；Claude 本机需认证，真实任务与续接验收待登录。 [#13](https://github.com/frankxiaofei/agent-teamroom/issues/13)

## M4 · ACP 与 WorkBuddy

- [ ] T14：源码/协议测试完成（初始化、版本协商、提问、权限、恢复与取消）；本机 Agent CLI 缺失，真实验收待安装登录。 [#14](https://github.com/frankxiaofei/agent-teamroom/issues/14)
- [ ] T15：源码/协议测试完成，强制 auto-approve=false；本机 CLI 握手需认证，真实任务验收待登录。 [#15](https://github.com/frankxiaofei/agent-teamroom/issues/15)
- [x] T16：WorkBuddy 官方接口能力调查与证据清单完成；公开 CodeBuddy CLI ACP 路线见本日交付文档。无现有桌面会话接管承诺，执行适配待本机 CLI 与权限验证。 [#16](https://github.com/frankxiaofei/agent-teamroom/issues/16)

## M5 · 可日用与分发

- [x] T17：北京时间日报、跨午夜任务、执行/等待时长和验收去重。 [#17](https://github.com/frankxiaofei/agent-teamroom/issues/17)
- [x] T18：同类任务耗时中位数、样本量、失败与返工；不按 token 速度总排名。 [#18](https://github.com/frankxiaofei/agent-teamroom/issues/18)
- [x] T19：人工账户别名和多工具关联去重、来源与更新时间、实际账单与估算区分；服务商实际账单未提供，明确显示未知。 [#19](https://github.com/frankxiaofei/agent-teamroom/issues/19)
- [ ] T20：Windows 安装包、恢复/备份、升级迁移、包内清单与分发验证。 [#20](https://github.com/frankxiaofei/agent-teamroom/issues/20)

## M6 · X 推荐与社区反馈

- [x] T21：真实截图、双语介绍与可复现演示，README 与能力表同步。 [#21](https://github.com/frankxiaofei/agent-teamroom/issues/21)
- [ ] T22：按发布条件在 X 发布并读回链接；整理初批用户反馈到 issue。 [#22](https://github.com/frankxiaofei/agent-teamroom/issues/22)

## 2026-10-18 收口

源码/协议测试、真实账户验收和安装包验证不是同一个完成状态。本日实现、验证命令与外部前置条件见 [delivery-2026-10-18.md](delivery-2026-10-18.md)。T13/T14/T15/T34 保留真实验收缺口，T20 以安装/升级实测收口；T22 未发布。
