---
name: SQL dollar-quote stripping
description: $$ in schema.sql PL/pgSQL bodies has repeatedly been collapsed to bare $ by some editors and agents; always verify before asking the user to run the file.
---

## Rule
Before telling the user to run `schema.sql`, grep for bare `$` delimiters that should be `$$`:

```bash
grep -n '^\$;' artifacts/track-tracker/src/db/schema.sql
grep -n '^as \$' artifacts/track-tracker/src/db/schema.sql | grep -v '\$\$'
```

Both commands should return no output. If they do, the `$$` dollar-quoting was stripped and must be restored before the file will parse.

**Why:** Multiple agent iterations and some text editors strip repeated `$` characters or treat `$$` as two separate tokens. The schema has PL/pgSQL function bodies and anonymous `DO` blocks that all require `$$` delimiters. A bare `$` causes a Postgres parse error.

**How to apply:** Any time you edit `schema.sql` or a subagent touches it, run the grep check before marking the task done.
