# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Agent-harness fallback

In Claude Code agent-harness sessions where `gh` isn't available
(e.g. the web agent at claude.ai/code), use the GitHub MCP tools
(`mcp__github__*`) instead. They cover the same operations:

- `mcp__github__issue_write` → create / comment / close
- `mcp__github__issue_read` / `mcp__github__list_issues` → read
- `mcp__github__pull_request_read` / `mcp__github__pull_request_review_write` → PR ops
- `mcp__github__add_issue_comment` → comment shortcut

Repo scope is enforced server-side to `lemmonchess333/maiin`. Schemas
are deferred — load via `ToolSearch` before calling.
