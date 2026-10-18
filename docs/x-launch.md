# X 推荐计划

## 当前阶段

源码开发预览。可以面向开发者介绍设计与已实现的 Codex 接入，但不能声称所有工具都已真实接通，不能宣称已有稳定安装包。本文是待发布草稿，不是已发布记录。

## 推荐素材

- 仓库：https://github.com/frankxiaofei/agent-teamroom
- 实际桌面截图：`docs/images/teamroom-desktop.png`
- 演示顺序：群里输入 @ → 选员工 → 发任务 → 流式回复 → 处理审批 → 验收 → 重启看到记录。
- 演示视频必须持续标明演示/真实模式；不要混剪造成所有工具均已真实工作的印象。

## 中文介绍串文草稿

1. 我开始做一个叫 Teamroom 的本地桌面工具：给 AI Agent 建个工作群。你是老板，Codex 等工具是员工，在群里 @ 谁，就把工作交给谁。每个员工都有带产品名牌的卡通形象。

2. 最想解决的是来回切工具、找聊天、等结果。现在把沟通、进展、审批和成果验收集中到一个群里，旁边能看员工状态，另有日报和工作记录。

3. 当前是 0.2 开发预览。Codex 与 OpenCode 有真实只读任务证据；Claude Code、Cursor、Cline 与 Grok 的适配已实现，真实验收仍受各自登录/CLI 条件限制。WorkBuddy 的官方 CLI 路线已调查，执行入口待验收。新增今日汇报、分项耗时、账户登记和本地备份恢复，Windows 包未签名。

4. 默认只读。任务、聊天和设置保存在本地 SQLite；工具完成和你的验收分开记。重启后不会悄悄把没完成的任务重新执行。

5. 想试的开发者可以看 README 本地运行，欢迎贡献适配器或提 issue。项目：https://github.com/frankxiaofei/agent-teamroom

## English single-post draft

Building Teamroom: a desktop group chat for AI agents.

@ an agent to assign work. Progress, approvals & deliveries stay in the group.

Preview: live Codex & OpenCode. More adapters implemented; auth/CLI acceptance pending. Local reports, read-only discussions, account notes & backups. Unsigned Windows preview.

https://github.com/frankxiaofei/agent-teamroom

## 正式推荐前检查

- README、截图、运行指令与远程 main 对应同一已验证提交。
- CI 与桌面 smoke 通过；如果介绍实际任务，保留真实工具的执行证据。
- 未实现的 adapter、签名安装包和账户账单能力必须明确标注。
- 面向普通用户推荐安装版须满足 M5；开发者尝鲜帖使用开发预览措辞。
- 发布前核对目标 X 账号；发布后打开帖子读回 URL 和正文，记录发布时间及后续反馈。

## 本次发布准备结果

GitHub 源码已公开，推荐稿和桌面截图就绪。浏览器连接在读取 X 页面时连续超时，未能确认当前登录账号及编辑器状态，因此尚未发帖。恢复连接后继续 T22：核对账号、发布开发预览介绍、读回正文与帖子 URL。

## 2026-10-18 素材更新

本日新增功能与限制已同步到上面的推荐草稿，仍未发布。不能把账户人工登记宣传成服务商实际账单查询，也不能把未签名预览包称为正式稳定安装版。
