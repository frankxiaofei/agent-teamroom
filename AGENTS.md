# Teamroom contributor rules

- The product is a group chat. Use explicit @ mentions for recipients; never silently broadcast.
- Keep demo and live records separate. Never describe fixture responses as live integration evidence.
- Live execution belongs in the Electron main process. Do not expose arbitrary IPC, shell, filesystem, or credentials to the renderer.
- Send task prompts through JSON stdin. Never interpolate prompts into shell commands.
- Default to read-only. Any change to workspace-write or approval handling needs tests and an explicit product explanation.
- A tool completing a turn creates a pending-review delivery, not an accepted task.
- Preserve local task data. On restart, unfinished tasks become interrupted; never automatically replay them.
- Do not commit `.env`, auth files, user databases, absolute machine-specific paths or raw provider stderr.
- Run `npm run verify` and `npm run smoke:desktop` before pushing changes to desktop behavior.
- The supported live integration in v0.1 is Codex. Grok is an experimental adapter with protocol-fixture evidence only; never present it as verified without a real CLI/account run. Other mascots represent planned adapters and demo capabilities.
- Scheduled reports are derived locally from persisted status events. Never invoke models for periodic reporting or count delivery as acceptance.
- Discussion consultations use fresh read-only sessions and decline all privilege requests. At most two invited agents and three explicitly requested rounds.
- An agent may request discussion only at a completed tool turn. Paused work resumes only after the boss explicitly confirms a conclusion and continuation.
- Persist report deduplication and interrupted discussions. Restart must never replay consultations or paused work automatically.
