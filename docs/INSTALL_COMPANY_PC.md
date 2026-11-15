# AgroCloud on the company computer (full version)

The full system: PostgreSQL + PostGIS database, the API server (`backend`) and the web app.
Everything comes from GitHub. Tested on a fresh PostgreSQL 16 + PostGIS: all migrations apply, the server starts and the owner account signs in.

## 1. Install once

| Program | Version | Note |
|---|---|---|
| Git | latest | |
| Node.js | 20 LTS | |
| PostgreSQL | 16 | In the installer, open **Stack Builder** → Spatial Extensions → **PostGIS** |

Redis is optional (only background jobs); leave it out.

## 2. Get the code

```powershell
git clone https://github.com/ALKAMELGIS/AgroCloud-Management.git C:\AgroCloud
cd C:\AgroCloud
```

## 3. Database

In **pgAdmin** or `psql` (as `postgres`):

```sql
CREATE USER agrocloud WITH PASSWORD '<a strong password>';
CREATE DATABASE agrocloud OWNER agrocloud;
\c agrocloud
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## 4. Server (`backend`)

```powershell
cd C:\AgroCloud\backend
copy .env.example .env
```

Edit `backend\.env`:

```
PORT=3001
DATABASE_URL=postgresql://agrocloud:<password>@localhost:5432/agrocloud
JWT_SECRET=<64 random characters>
REDIS_URL=
CORS_ORIGIN=http://<computer-name-or-IP>:3000
SUPER_ADMIN_EMAILS=admin@agrocloud.com
```

```powershell
npm ci
npm run build
npm start            # applies every migration, then listens on :3001
```

## 5. Owner account (all permissions)

In a second PowerShell window:

```powershell
cd C:\AgroCloud\backend
$env:DATABASE_URL="postgresql://agrocloud:<password>@localhost:5432/agrocloud"
node scripts/create-owner.js admin@agrocloud.com "Admin"
```

It asks for the password (hidden) and stores only its hash. Use a strong password and change any password that was shared in chat.

## 6. Web app

```powershell
cd C:\AgroCloud
$env:REACT_APP_API_URL="http://<computer-name-or-IP>:3001/api/v1"
npm ci
npm run build
npx serve -s build -l 3000
```

Open `http://<computer-name-or-IP>:3000` from any device on the company network and sign in with the owner account.

## 7. Keep it running

- Start the server and the web app at boot (Task Scheduler, or `npm i -g pm2 pm2-windows-startup`, then `pm2 start "npm start" --name agrocloud-api` in `backend` and `pm2 start "npx serve -s build -l 3000" --name agrocloud-web`, then `pm2 save`).
- Back up the database daily: `node backend\scripts\backup-db.js` (see the script header).
- Update: `git pull`, then repeat `npm ci && npm run build` in `backend` and in the root, and restart.

## Not part of this repository

- Secrets: `.env` files, ArcGIS tokens, the Sentinel Hub ID (typed in Settings on each device), passwords.
- The GitHub Pages demo (`build-demo`) stays a demo with in-browser data; the company computer runs the full version above.
