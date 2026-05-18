# Domain Docs — brain-memory

## Layout

**Single-context** — one project, one domain.

## Key files

| File | Role |
|------|------|
| `METHODOLOGY.md` | Project context, version history, quality red lines, metric baselines, risk register, tech rules |
| `.devdocs/技术决策/` | Architecture Decision Records (ADR format) |
| `.devdocs/版本复盘/` | Post-version retrospectives and experience distillation |
| `.devdocs/版本规划/` | Pre-version plans (goals, features, risks, batches) |
| `.devdocs/INDEX.md` | Master index of all internal documentation |

## Rules for agent skills

- Read `METHODOLOGY.md` first to understand project context, terminology, and quality baselines
- Read relevant ADRs from `.devdocs/技术决策/` for architectural decisions
- Use glossary vocabulary from METHODOLOGY.md §1.2 for naming domain concepts
- Flag ADR conflicts explicitly
- Development records are in `.devdocs/开发记录/`, performance baselines in `.devdocs/性能基准/`
