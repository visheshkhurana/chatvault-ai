# AGENTS.md

## Cursor Cloud specific instructions

**Product**: Rememora (ChatVault AI) — a WhatsApp-native AI memory layer built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

### Services

| Service | Command | Port | Notes |
|---|---|---|---|
| Next.js App (frontend + API) | `npm run dev` | 3000 | Main dev server; serves landing page, login, dashboard, and all API routes |
| Baileys WhatsApp Bridge | `npx tsx src/server/baileys.ts` | 3001 | Separate Express server; requires Docker or direct tsx. Excluded from `tsconfig.json` |

### Environment Variables

Copy `.env.example` to `.env.local`. The following env vars are required for the build to succeed (module-level client instantiation will throw without them):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (Stripe SDK initializes at import time in billing routes)
- `OPENAI_API_KEY` (OpenAI SDK initializes at import time in voice-notes route)

Placeholder values are sufficient for build/dev startup; real values are needed for actual API calls.

### Lint / Build / Test

- **Lint**: `npm run lint` — runs `next lint`. The codebase has pre-existing lint warnings/errors (unescaped entities, missing hook deps); these are not blockers.
- **Build**: `npm run build` — runs `next build`. TypeScript and ESLint errors are ignored during build (`ignoreBuildErrors: true`, `ignoreDuringBuilds: true` in `next.config.js`).
- **Dev**: `npm run dev` — starts Next.js dev server on port 3000.
- No automated test suite exists (no test framework or test files).

### Gotchas

- The Stripe and OpenAI SDKs are initialized at module scope in several API route files. If `STRIPE_SECRET_KEY` or `OPENAI_API_KEY` is missing/empty, `next build` will fail during page data collection even though `next dev` may start fine (dev server lazy-loads routes).
- The `src/server/` directory is excluded from `tsconfig.json` (`"exclude": ["node_modules", "src/server"]`), so TypeScript checks do not cover the Baileys bridge code.
- The landing page (`/`) and static pages (`/terms`, `/privacy`) render without any external services. The `/login` and `/dashboard` routes require Supabase for auth.
