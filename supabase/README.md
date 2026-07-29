# /supabase — database & server logic

This folder holds everything that lives on the Supabase side:

| Path          | What goes here                                              |
| ------------- | ----------------------------------------------------------- |
| `migrations/` | SQL migration files — schema, RLS policies, views, triggers |
| `functions/`  | Edge Functions (Deno) — dispatch engine ticks, SMS, push    |
| `seed/`       | Seed data (e.g. the category taxonomy, Phase 2)             |

Migrations are numbered and applied in order — the database schema is defined
**only** here, never by clicking around the dashboard, so it stays reproducible.

The Supabase CLI config (`config.toml`) is generated when we first link the
hosted project (Phase 0, Chunk B).

## Rules

- RLS (Row Level Security) is **not optional** — it enforces the Sapiens
  constitution (staged disclosure, owner-only data) at the database layer.
- Secrets (service key, provider keys) live in `.env.local` / Supabase
  dashboard secrets — never in this folder, never in git.
