# 架构与数据边界

```text
React 工作群 ── 窄类型 IPC ── Electron 主进程
                                 │
                         Teamroom 任务服务
                          │             │
                     SQLite Store    CodexRun
                                        │ stdio JSON-RPC
                                  本地 Codex CLI
```

浏览器演示使用单独的 LocalStorage bridge，不接触主进程、SQLite 或真实工具。桌面使用自定义 `teamroom://app` 静态资源协议、sandbox、contextIsolation 与 CSP。禁止新窗口、外部导航、通用 IPC 和任意文件访问接口。

## 接口

Bridge 只有 snapshot、send、settings、chooseWorkspace、cancel、accept、approve、quota 和 subscribe。主进程校验主窗口/frame 来源、消息 ID、提及、工具可用性、已有目录和布尔权限。

Message 保存群内发言；Task 保存一位接收人的独立执行；Approval 保存当前进程有效的单次审批。一个消息可以产生多个 Task。SQLite 事务确保发送前检查失败时不会部分落库；相同 message ID 重试不重派。

每个任务捕获发送时的目录和写入权限。后续设置变化不能提高已排队任务权限。任务全局串行；多 workspace 并行属于后续设计，先提供隔离与锁。

## Codex

通过本机实际 CLI 的 schema 验证协议，v0.1 在 Codex CLI 0.144.6 上开发验证。线程及 turn 事件对应官方 [App Server](https://learn.chatgpt.com/docs/app-server)。prompt 通过 JSON stdin 传递，shell=false。Windows npm shim 转为 Node 直接执行官方 CLI 入口，避免拼接 .cmd 命令。

权限初始为 `read-only`、`on-request`、用户审批。已支持 commandExecution/fileChange 单次 accept/decline；其他 server request 返回不支持。终态 completed 才进入待验收；不根据进程退出或“完成”文本判断成功。

## 持久化与失败

数据库位于 Electron userData。测试可以用 TEAMROOM_DATA_DIR 指定独立临时目录。应用启动时把 queued/running/waiting_approval 转为 interrupted，保留成果与原始任务；不自动重派。会话 ID 可用于下一条明确任务续接。

任务失败不自动重试，避免重复修改或计费。RPC 请求有 30 秒超时；模型执行使用 provider 的 turn 生命周期。原始 stderr 被消费但不保存，防止诊断内容中的凭据或本机信息进入公共记录。

## 证据界限

协议夹具测试证明客户端处理消息、审批与终态；真实极小请求证明当前账户和模型可用。两者都不证明所有工具任务、订阅账户或平台完全兼容。额度接口与费用估算不能作为真实账单或欠费依据。
