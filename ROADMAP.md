# Roadmap

Where Guidon is going. Priorities can change; this file is updated when they do.

**Direction:** self-hosted first. Guidon Cloud stays free, with small storage
limits. Self-hosted instances have no limits.

## Done

- Task board with custom columns, labels, subtasks, recurring tasks, bulk actions and *My tasks*
- Decisions, knowledge base, project memory with a review queue, roadmap, calendar, whiteboard and moodboard
- REST API, MCP server and OAuth for AI agents; task claims, recorded attempts and AGENTS.md export
- Plugins for Unity, Unreal Engine, Godot, Blender, JetBrains and VS Code; desktop app, mobile app and Discord bot
- Task import from CSV, JSON and Trello
- English, Polish, German and Spanish
- Self-hosting on plain PostgreSQL with local storage and optional Ollama, installed with one command

## Now

- [ ] Test the one-command install on more machines and fix what breaks
- [ ] Tutorial videos covering setup and every part of the app
- [ ] Easier upgrades and backups for self-hosted instances

## Next

- [ ] S3-compatible file storage (`STORAGE_PROVIDER=s3` is reserved but not built)
- [ ] Reports: project progress and team workload
- [ ] Simpler defaults for new projects (fewer modules on at the start)

## Later

- [ ] Semantic search in project memory
- [ ] Customizing a self-hosted instance (own modules and features) without forking

Have an idea? [Open a feature request](https://github.com/Two-Steps-Studio/guidon/issues/new?template=feature_request.yml).
