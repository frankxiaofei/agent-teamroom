# 架构与数据边界

## 主动汇报与讨论扩展

```text
Task 状态变化 → SQLite task_events → 本地汇报/持久化去重 → 群消息 + 桌面提醒
                           ↑
群内讨论邀请 → 全局串行队列 → 新只读咨询会话 → 建议总结 → 老板确认 → 原任务续接
```

新增表：`task_events`（仅状态变化）、`reports`（不可变汇报与唯一发送键）、`discussions`（问题/轮次/回复/结论）、`preferences`（汇报配置及检查游标）。迁移仅新增表，不删除旧消息、任务或设置。任务快照和状态事件用 SQLite savepoint 一起保存，嵌套发送事务可回滚；结论与父任务续接状态一起提交。

新增窄 IPC：reporting、report、discuss、discussionReply、discussionRound、discussionResolve、discussionCancel，以及只接收通知定位事件的 onFocus。所有写入仍在主进程验证；renderer 不能访问通用 IPC、shell 或数据库。

调度器在主进程每 15 秒检查持久化到期时间，不依赖页面是否可见。进度依据事件游标和讨论状态变更；日报使用北京时间固定日界，间隔为前一次指定时刻至本次指定时刻。休眠和退出后只补最近一期日报与一份增量汇报，不重放每个错过的时钟。汇报唯一键、群消息和汇报记录共同持久化；系统通知是附加提醒，不作为送达凭证。

讨论与任务共享串行执行槽，暂停的父任务不占执行槽。咨询不产生执行任务，不累计为交付。只读咨询使用全新会话、禁用写入、拒绝审批扩权，最多两位被邀员工，每轮增加一次总结，最多三轮；下一轮由老板明确发起。适配器在 turn 完成后解析 `<teamroom-discussion>` JSON 请求；不会猜测普通“不确定”文本，不尝试不受支持的中途注入。

每次任务继续保留父任务 threadId、目录及写入授权，附带老板确认结论。应用重启将运行/排队的讨论置为等老板决定；等待讨论的父任务保持暂停。回退旧版前应在新版结束讨论并将未继续父任务置为中断；旧版不认识 waiting_discussion 状态，不能直接接管该状态的任务。新增表可保留，不需要删除数据。

老板对已交付任务发起讨论时，不撤销原来的待验收状态；仅提交结论仍可继续验收。Agent 在执行轮次结束主动提问时，才将原任务置为 waiting_discussion。取消结束以发起取消时的模式、轮次和状态为准，旧取消回执不能覆盖老板已经排入的新轮次或已确认的结论。

```text
React 工作群 ── 窄类型 IPC ── Electron 主进程
                                 │
                         Teamroom 任务服务
                          │             │
                     SQLite Store   Runner factory
                                      │       │
                                 CodexRun   GrokRun (experimental)
                                      │ stdio JSON-RPC
                                本地 CLI
```

浏览器演示使用单独的 LocalStorage bridge，不接触主进程、SQLite 或真实工具。桌面使用自定义 `teamroom://app` 静态资源协议、sandbox、contextIsolation 与 CSP。禁止新窗口、外部导航、通用 IPC 和任意文件访问接口。

## 接口

Bridge 只有 snapshot、send、settings、chooseWorkspace、cancel、accept、approve、quota、reporting、report、discuss、discussionReply、discussionRound、discussionResolve、discussionCancel、onFocus 和 subscribe。主进程校验主窗口/frame 来源、消息 ID、提及、工具可用性、已有目录和布尔权限。

Message 保存群内发言；Task 保存一位接收人的独立执行；Approval 保存当前进程有效的单次审批。一个消息可以产生多个 Task。SQLite 事务确保发送前检查失败时不会部分落库；相同 message ID 重试不重派。

每个任务捕获发送时的目录和写入权限。后续设置变化不能提高已排队任务权限。任务全局串行；多 workspace 并行属于后续设计，先提供隔离与锁。

## Codex

通过本机实际 CLI 的 schema 验证协议，v0.1 在 Codex CLI 0.144.6 上开发验证。线程及 turn 事件对应官方 [App Server](https://learn.chatgpt.com/docs/app-server)。prompt 通过 JSON stdin 传递，shell=false。Windows npm shim 转为 Node 直接执行官方 CLI 入口，避免拼接 .cmd 命令。

权限初始为 `read-only`、`on-request`、用户审批。已支持 commandExecution/fileChange 单次 accept/decline；其他 server request 返回不支持。终态 completed 才进入待验收；不根据进程退出或“完成”文本判断成功。

## 本机发现与 Grok（实验性）

真实模式通过 `where`/`which` 检测 Codex、Grok、Claude Code、OpenCode、Cursor、Cline、WorkBuddy 命令。只有存在执行适配器的 Codex/Grok 会显示可用；编辑器命令（如 `cursor`）只表示已安装，不能当作 Agent 执行器。命令存在不等于登录、模型和额度可用，实际以请求为准。检测结果不写数据库，设置变更后重新探测。

Grok 适配器沿用 stdio JSON-RPC 边界：initialize/authenticate、session/new 或 session/load、session/prompt、流式 `session/update`、权限请求单次批准/拒绝、取消。prompt 通过 JSON stdin，不进入命令行参数；认证复用 CLI 自己的 `cached_token`/`xai.api_key`，Teamroom 不读取或保存凭据。当前只有协议夹具验证，真实 Grok CLI 尚未验证，因此在文档和 UI 中必须标为实验性。

`@all` 的展开在主进程完成：只选择当前 `availability` 中可用的员工；显式 @ 到不可用员工仍在写入前阻止整条消息。展开后每个接收人仍创建独立 Task，保留发送时的目录和写入权限，不形成隐式广播或部分派发。

## 持久化与失败

数据库位于 Electron userData。测试可以用 TEAMROOM_DATA_DIR 指定独立临时目录。应用启动时把 queued/running/waiting_approval 转为 interrupted，保留成果与原始任务；不自动重派。会话 ID 可用于下一条明确任务续接。

任务失败不自动重试，避免重复修改或计费。RPC 请求有 30 秒超时；模型执行使用 provider 的 turn 生命周期。原始 stderr 被消费但不保存，防止诊断内容中的凭据或本机信息进入公共记录。

## 证据界限

协议夹具测试证明客户端处理消息、审批与终态；真实极小请求证明当前账户和模型可用。两者都不证明所有工具任务、订阅账户或平台完全兼容。额度接口与费用估算不能作为真实账单或欠费依据。
