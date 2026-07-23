# Meiborg Shuttles — Fleet Management

Internal fleet-management app for Meiborg Shuttles: driver timesheets, stops, fuel/toll
receipts, hours, and Geodis pre-billing. React + Vite + TypeScript on Supabase, styled in
the Meiborg **dark-glass** design system.

## Stack
- React 18 + Vite + TypeScript, Tailwind CSS
- Supabase (Postgres + Auth + Storage) — client in `src/lib/supabase.ts`
- Deployed on Vercel

## Local development
```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

## Environment variables
| Var | Where |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/public) |

Set both locally in `.env.local` and in **Vercel → Project → Settings → Environment Variables**.

## Database setup (new Supabase project)
Run `supabase/full_setup.sql` once in the project's **SQL editor**. It applies all 24
migrations in order and creates the private `receipts` storage bucket. No auth users need
to be created by hand — office/driver/Geodis accounts self-register on first login.

Access passwords: Office `2210`, Drivers `3814` (then pick your name), Geodis `60152`.

## Deploy (Vercel)
```bash
vercel            # link + preview
vercel --prod     # production
```
`vercel.json` pins the Vite framework preset, `dist` output, and an SPA rewrite.
