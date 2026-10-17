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
- The supported live integration in v0.1 is Codex. Other mascots represent planned adapters and demo capabilities.
