# Beads - AI-Native Issue Tracking

This repository uses **br** (beads_rust) for issue tracking — a modern, AI-native tool that lives directly in your codebase.

**Note:** `br` never executes git commands. After `br sync --flush-only`, manually run `git add .beads/ && git commit`.

## Quick Start

### Essential Commands

```bash
# Create new issues
br create "Add user authentication"

# View all issues
br list

# View issue details
br show <issue-id>

# Update issue status
br update <issue-id> --status in_progress
br update <issue-id> --status done

# Sync and commit
br sync --flush-only
git add .beads/
git commit -m "sync beads"
```

### Working with Issues

Issues in Beads are:
- **Git-native**: Stored in `.beads/issues.jsonl` and synced like code
- **AI-friendly**: CLI-first design works perfectly with AI coding agents
- **Branch-aware**: Issues can follow your branch workflow

## Learn More

- **Documentation**: [github.com/anthropics/beads_rust](https://github.com/anthropics/beads_rust)
- **Quick Start Guide**: Run `br quickstart`
