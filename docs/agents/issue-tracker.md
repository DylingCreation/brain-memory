# Issue Tracker — brain-memory

Issues are tracked on **GitHub Issues** at `https://github.com/DylingCreation/brain-memory/issues`.

## CLI usage

```bash
gh issue list -R DylingCreation/brain-memory
gh issue create -R DylingCreation/brain-memory -t "Title" -b "Body"
gh issue view -R DylingCreation/brain-memory <number>
gh issue comment -R DylingCreation/brain-memory <number> -b "Comment"
gh issue edit -R DylingCreation/brain-memory <number> -l "bug,needs-triage"
```

## Auth

GITHUB_TOKEN env var required. Token stored in project `.env`.
