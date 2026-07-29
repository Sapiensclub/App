# /supabase — database & server logic

This folder holds everything that lives on the Supabase side:

| Path          | What goes here                                              |
| ------------- | ----------------------------------------------------------- |
| `migrations/` | SQL migration files — schema, RLS policies, views, triggers |
| `functions/`  | Edge Functions (Deno) — dispatch engine ticks, SMS, push    |
| `seed/`       | Seed data (e.g. the category taxonomy, Phase 2)             |

Migrations are numbered and applied in order — the database schema is defined
**only** here, never by clicking around the dashboard, so it stays reproducible.

## Applying migrations to the hosted project

One-time setup (from the repo root):

```
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

(`<your-project-ref>` is the id in your dashboard URL:
`https://supabase.com/dashboard/project/<your-project-ref>`. The link step
asks for the database password you chose when creating the project.)

Then, whenever there are new migration files:

```
npx supabase db push
```

## Rules

- RLS (Row Level Security) is **not optional** — it enforces the Sapiens
  constitution (staged disclosure, owner-only data) at the database layer.
- Secrets (service key, provider keys) live in `.env.local` / Supabase
  dashboard secrets — never in this folder, never in git.
