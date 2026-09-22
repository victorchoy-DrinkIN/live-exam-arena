# Deployment guide

This project is an Expo web frontend plus an Express/tRPC backend. There are two supported deployment arrangements:

| Provider | Recommended role | Result |
|---|---|---|
| Render | Full-stack deployment | Serves the exported website and `/api/*` backend from one service. This is the simplest production setup. |
| Vercel | Frontend deployment | Serves the exported Expo website. Point `EXPO_PUBLIC_API_BASE_URL` at a separately deployed Render backend. |

## Option A: Deploy the complete application on Render

### 1. Create the database

Create a MySQL-compatible database, such as Render Postgres only if the application is first ported to PostgreSQL, or a MySQL/TiDB service from a compatible provider. This project currently uses `mysql2` and Drizzle MySQL, so provide a MySQL/TiDB connection string in `DATABASE_URL`.

Run the schema migrations from a trusted local environment before opening the service to users:

```bash
pnpm install
DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DATABASE' pnpm db:push
```

The migration files under `drizzle/` are committed and should be applied in order. Do not run destructive migrations against production without a backup.

### 2. Create the Render service

In Render, choose **New → Blueprint** and connect this repository. Render will detect [`render.yaml`](./render.yaml), or you can create a Node web service manually with:

```text
Build command: pnpm install --frozen-lockfile && pnpm build
Start command: pnpm start
Health check: /api/health
```

The production build performs two steps:

```text
pnpm build:web     # Expo static web export into web-dist/
pnpm build:server # Bundle Express/tRPC into dist/index.js
```

The Express server serves `web-dist/` and keeps `/api/trpc`, `/api/auth`, `/api/oauth`, `/api/health`, and storage routes available.

### 3. Configure Render environment variables

Set these in the Render service. Never commit real values to the repository.

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | MySQL/TiDB connection string. |
| `JWT_SECRET` | Yes | Long random secret used for session cookies. Generate a new production value. |
| `VITE_APP_ID` | Yes | Manus OAuth application ID used by the server. |
| `OAUTH_SERVER_URL` | Yes | OAuth backend URL, normally `https://api.manus.im`. |
| `OWNER_OPEN_ID` | Yes | Admin owner identity used by the existing auth setup. |
| `OWNER_NAME` | Yes | Display name for the owner. |
| `EXPO_PUBLIC_OAUTH_PORTAL_URL` | Yes | OAuth login portal URL used by the web bundle. |
| `EXPO_PUBLIC_OAUTH_SERVER_URL` | Yes | OAuth server URL used by the web bundle. |
| `EXPO_PUBLIC_APP_ID` | Yes | Same OAuth application ID exposed to the web build. |
| `EXPO_PUBLIC_OWNER_OPEN_ID` | Recommended | Owner identity exposed to the web bundle. |
| `EXPO_PUBLIC_OWNER_NAME` | Recommended | Owner display name exposed to the web bundle. |
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | No | Leave unset; Render supplies it automatically. |

For a single Render service, leave `EXPO_PUBLIC_API_BASE_URL` unset. The frontend then uses relative `/api/...` requests and the Express server handles them on the same origin.

### 4. Configure OAuth redirect URLs

In the Manus OAuth application settings, add the Render service callback URL:

```text
https://YOUR-SERVICE.onrender.com/api/oauth/callback
```

If you later add a custom domain, add its callback URL too:

```text
https://yourdomain.com/api/oauth/callback
```

### 5. Verify the deployment

Check the health endpoint:

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

Then test the website in a browser: admin login, draft save, release, participant join, countdown, answer submission, and live leaderboard updates. Render free services may sleep when idle, so the first request after inactivity can be slow.

## Option B: Deploy the frontend on Vercel and the backend on Render

Use this arrangement when you want Vercel previews, custom frontend domains, or Vercel's frontend workflow. Keep the Express/tRPC backend and database on Render.

### 1. Deploy the backend on Render

Follow Option A, but use the Render service only as the API/backend host if desired. Confirm this endpoint works:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

### 2. Import the repository into Vercel

Create a Vercel project from the repository. The committed [`vercel.json`](./vercel.json) configures:

```text
Install command: pnpm install --frozen-lockfile
Build command: pnpm build:web
Output directory: web-dist
```

Vercel hosts the exported Expo web files only. It does not run the Express server from this configuration.

### 3. Set Vercel environment variables

Set these for **Production**, **Preview**, and **Development** as appropriate:

```text
EXPO_PUBLIC_API_BASE_URL=https://YOUR-SERVICE.onrender.com
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://auth.manus.im
EXPO_PUBLIC_OAUTH_SERVER_URL=https://api.manus.im
EXPO_PUBLIC_APP_ID=your-manus-oauth-app-id
EXPO_PUBLIC_OWNER_OPEN_ID=your-owner-open-id
EXPO_PUBLIC_OWNER_NAME=Your Name
```

`EXPO_PUBLIC_*` values are embedded into the browser bundle at build time. Redeploy after changing them.

### 4. Configure OAuth for the Vercel frontend

Add the Vercel-backed callback URL to the OAuth application settings. Because the callback is served by Render, use the Render API domain in the callback URL:

```text
https://YOUR-SERVICE.onrender.com/api/oauth/callback
```

The browser login flow can start on Vercel and return to the Render callback, but use one canonical public domain for production if possible. The simplest arrangement is to use Render for both frontend and backend, or put a reverse proxy/custom domain in front of the Render service so the app and API share one origin.

## Custom domains and DNS

For Render, add a custom domain in the service settings and create the DNS records Render provides. For Vercel, add the domain in the Vercel project settings and create the DNS records Vercel provides. Do not guess DNS values; they vary by provider and domain.

After SSL is active, update OAuth callback allowlists and `EXPO_PUBLIC_API_BASE_URL` if the frontend is hosted separately.

## Local production smoke test

Before deploying, verify the same commands locally:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
NODE_ENV=production PORT=3000 pnpm start
```

In another terminal:

```bash
curl http://localhost:3000/api/health
```

Open `http://localhost:3000` and test the browser flow. Stop the process with `Ctrl-C` when finished.

## Security checklist

- Use a unique production `JWT_SECRET` and do not reuse development secrets.
- Keep `DATABASE_URL`, OAuth server credentials, and Manus API keys in provider secret settings.
- Restrict admin creation and live controls to the existing admin role.
- Use HTTPS for every production domain and OAuth callback.
- Back up the production database before applying migrations.
- Do not expose `BUILT_IN_FORGE_API_KEY` or other server-only values as `EXPO_PUBLIC_*` variables.
