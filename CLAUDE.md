# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CloudPulse — a multi-cloud blog aggregator. A single Express server (`server.js`) polls RSS feeds and scrapes HTML pages for AWS/Azure/GCP blog posts, stores them in SQLite (`cloudpulse.db`, gitignored), and serves a vanilla HTML/CSS/JS frontend from `public/`. No build step, no test suite, no framework.

## Commands

- `npm install` — install dependencies
- `npm start` — run the server on port 3000 (override with `PORT`)
- No lint or test tooling exists. Verify changes by running the server and hitting the endpoints/UI at http://localhost:3000.

`GEMINI_API_KEY` env var enables the `/api/chat` RAG endpoint; without it that endpoint returns 503 but everything else works.

## Architecture

Everything server-side lives in `server.js` (~500 lines):

- **Two ingestion paths**, dispatched by the `type` column on the `feeds` table: `parseRssFeed()` (rss-parser) for `type='rss'`, `scrapeHtmlPage()` (cheerio + fetch, optional per-feed CSS `selector`) for `type='scrape'`. Both normalize into the same article shape; article `id` is the RSS guid or a sha1 of the link, and inserts use `INSERT OR IGNORE` so re-fetching is idempotent.
- **SQLite** via `sqlite3` with hand-rolled promise wrappers (`dbRun`/`dbAll`/`dbGet`). Schema (two tables: `feeds`, `articles`) is created and default feeds seeded in `initDatabase()` on startup — there are no migration files; schema changes go there.
- **API**: `GET /api/blogs` (add `?refresh=true` to re-fetch all feeds), `GET/POST/DELETE /api/feeds` (feed management), `POST /api/chat` (keyword-scored SQL search over articles → context stuffed into a Gemini `generateContent` call).
- **Frontend** (`public/app.js`) is plain DOM scripting: fetches `/api/blogs` and `/api/feeds`, does client-side search/tag filtering, dashboard metrics, theming, and the chat panel. `index.css` uses HSL variables for dark/light themes.

## Deployment

Two mechanisms target a Raspberry Pi running the app under PM2 as `cloudpulse`:
- Push-based: `.github/workflows/deploy.yml` SSHes in on push to `main` and pulls/restarts.
- Pull-based: `update.sh` run by cron on the Pi checks for new commits and pulls/restarts.

So merging to `main` deploys to production — don't push broken code to `main`.

## Notes

- `GEMINI.md` predates the SQLite/scraping/chat features (it claims "no database"); prefer this file and the code as the source of truth.
- Keep dependencies minimal and maintain the server (`server.js`) / frontend (`public/`) split.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
