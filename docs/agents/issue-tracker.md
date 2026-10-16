# Issue tracker: GitHub

Issues and specs live as GitHub issues in this repository. Use the `gh` CLI; it infers the repo from `git remote -v`.

The owner closes issues. Agents never close them; report what is left instead.

## Conventions

- **Create**: `gh issue create --title "..." --body "..."`, with a heredoc for multi-line bodies. When a skill says "publish to the issue tracker", create an issue.
- **Read**: `gh issue view <number> --comments`. When a skill says "fetch the relevant ticket", run this.
- **List**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, with `--label` and `--state` filters as needed.
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`

Issues and PRs share one number space: resolve a bare `#42` with `gh pr view 42`, falling back to `gh issue view 42`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(`/triage` reads this flag.)_
