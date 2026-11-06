# PROMPTS.md – AI Usage Log

Record of prompts given to the AI assistant, what it produced, problems found, and my corrections.

---

## Entry 1 – Task 1: Project Setup

**Date:** 2026-11-06

**Prompt used:**
"LedgerLine – Day 1 Development Master Prompt" (full Day 1 plan), starting with Task 1: project setup,
folder structure, npm packages, Express server, health check, env config, .gitignore.
Plus instructions: AI must not run any Git commands; I commit and push manually.

**AI-generated solution:**
- Created folder structure (`backend/src/{config,controllers,middleware,routes,services,utils}`, `backend/prisma`, `backend/tests`, `frontend`).
- Installed: express 5, dotenv, helmet, cors, express-rate-limit, zod, bcrypt, jsonwebtoken.
- `src/config/env.js` – validates environment variables with Zod at startup.
- `src/app.js` – Express app with Helmet, CORS, 10 KB JSON limit, rate limiting, health route, 404 and error handlers.
- `src/server.js` – starts the server, handles graceful shutdown.
- `GET /api/health` endpoint.
- `.gitignore`, `.env`, `.env.example`, README.md, THREATS.md, this file.

**Problems found (actual observations):**
- npm 11 printed a warning that it skipped bcrypt's install script. Checked: bcrypt 6 still works
  because it ships prebuilt binaries (`bcrypt.hash` ran successfully).
- PostgreSQL (`psql`) is not installed on my Mac yet – needs to be installed in Task 2.
- Prisma was intentionally not installed in Task 1; it will be added in Task 2 together with the schema.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `chore: initialize LedgerLine project and backend`

---
