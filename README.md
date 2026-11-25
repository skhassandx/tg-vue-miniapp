# Telegram Mini App (Vue 3 + Pinia + Vue Router + Cloudflare Pages & D1)

Full-stack Telegram Mini App starter built with **Vue 3**, **Pinia**, **Vue Router**, and **Cloudflare Pages Functions + Cloudflare D1** for persistent user login sessions.

## Project Structure

- `src/` — Vue 3 + Pinia + Vue Router frontend
- `functions/api/[[path]].js` — Serverless backend API running on Cloudflare Edge
- `schema.sql` — Cloudflare D1 (SQLite) database schema
- `wrangler.toml` — Cloudflare Pages & D1 binding config
- `public/_redirects` — SPA fallback routing for Cloudflare Pages

## Quick Deployment (GitHub -> Cloudflare Pages + D1)

1. Push this folder to a GitHub repository.
2. In Cloudflare Dashboard -> **Workers & Pages** -> **D1 SQL Database**, create a database named `tg-miniapp-db`.
3. Run `schema.sql` inside the D1 Console (or run `npm run db:init:remote`).
4. Go to **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git** and select your GitHub repo:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. In your Pages project **Settings -> Functions -> D1 database bindings**, bind variable name `DB` to `tg-miniapp-db`.
6. In **Settings -> Environment variables**, add `BOT_TOKEN` (from `@BotFather`) and redeploy.
7. Set the generated `https://*.pages.dev` URL in `@BotFather` (`/newapp` or `/setmenubutton`).
