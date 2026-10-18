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
- In v0.2 Codex and OpenCode have live read-only inference evidence. Claude SDK, Cursor/Cline ACP and Grok have source/fixture coverage; auth or missing Agent CLI still block their live acceptance. WorkBuddy has a documented official CLI route, no execution adapter yet. Never promote fixture coverage into live evidence.
- Scheduled reports are derived locally from persisted status events. Never invoke models for periodic reporting or count delivery as acceptance.
- Discussion consultations use fresh read-only sessions and decline all privilege requests. At most two invited agents and three explicitly requested rounds.
- An agent may request discussion only at a completed tool turn. Paused work resumes only after the boss explicitly confirms a conclusion and continuation.
- Persist report deduplication and interrupted discussions. Restart must never replay consultations or paused work automatically.

- OpenCode must isolate user/project config, verify final tool permissions, and explicitly select the verified plan/build mode before prompting. Mode names alone are not a permission boundary.
- Backup restore validates schema, timestamps and agent identities before replacing data; preserve a rollback copy, disable restored write authorizations and never replay work.
