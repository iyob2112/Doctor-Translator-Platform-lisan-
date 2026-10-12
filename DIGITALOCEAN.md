# Deploy Lisan on DigitalOcean (paid, fast, secure)

This guide puts **frontend + backend + Socket.IO + PostgreSQL** on one DigitalOcean Droplet behind **HTTPS**. One domain = simpler CORS, faster sockets, better for hospitals.

Estimated cost: **~$12–40 / month** (Droplet + optional Managed Postgres).

---

## What you need before you start

| Item | Notes |
|------|--------|
| DigitalOcean account | [digitalocean.com](https://www.digitalocean.com) |
| Domain name | e.g. `lisan.example.com` (or use DuckDNS for free DNS) |
| GitHub/GitLab repo | Push this project (without `.env` secrets) |
| Strong secrets | Random JWT strings; Chapa keys if you take payments |
| SSH key | Add in DigitalOcean → Settings → Security |

**Recommended Droplet size**

| Spec | Why |
|------|-----|
| **Ubuntu 22.04 or 24.04 LTS** | Stable |
| **Basic / Regular** | Enough for pilot |
| **2 GB RAM / 1–2 vCPU** | Node + Postgres + nginx (minimum for live calls) |
| **Datacenter** | Closest to your users (or EU/US if Africa options are limited) |

Optional upgrade: **DigitalOcean Managed PostgreSQL** (~$15/mo) instead of Postgres in Docker on the same VM (more secure backups).

---

## What the DigitalOcean server will have

After setup, the Droplet runs:

1. **nginx** — HTTPS, serves the React build, proxies `/api` and `/socket.io` to Node  
2. **Node.js 22+** — Lisan backend (`pm2`) on port `4000` (local only)  
3. **PostgreSQL** — via Docker Compose (or Managed DB)  
4. **Let’s Encrypt certificates** — free HTTPS  
5. **UFW firewall** — only ports 22, 80, 443 open  

Users open: `https://your-domain.com`  
API health: `https://your-domain.com/api/v1/health`

---

## Architecture (same domain)

```text
Browser (hospital / translator / admin)
        │
        ▼
https://your-domain.com          ← nginx (443)
   ├── /                 → frontend/dist (static files)
   ├── /api/*            → http://127.0.0.1:4000
   └── /socket.io/*      → http://127.0.0.1:4000 (WebSocket)
                │
                ▼
         Lisan backend (pm2)
                │
                ▼
         PostgreSQL (Docker or Managed)
```

---

## Step 1 — Create the Droplet

1. DigitalOcean → **Create** → **Droplets**  
2. Image: **Ubuntu 24.04 LTS**  
3. Plan: **Basic**, **2 GB RAM** (or larger)  
4. Authentication: **SSH key** (safer than password)  
5. Hostname: e.g. `lisan-prod`  
6. Create Droplet → copy the **public IP**

Point your domain DNS **A record** to that IP:

```text
your-domain.com     A    YOUR_DROPLET_IP
www.your-domain.com A    YOUR_DROPLET_IP   (optional)
```

Wait until DNS resolves (often a few minutes).

---

## Step 2 — First login and system packages

```bash
ssh root@YOUR_DROPLET_IP
# or: ssh ubuntu@YOUR_DROPLET_IP  (if using ubuntu user)
```

```bash
apt update && apt upgrade -y
apt install -y git curl ufw nginx certbot python3-certbot-nginx \
  docker.io docker-compose-plugin
```

Enable Docker:

```bash
systemctl enable --now docker
usermod -aG docker $USER
# log out and SSH back in if you added your user to docker group
```

Firewall (SSH + web only):

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

---

## Step 3 — Install Node.js 22

Frontend requires **Node ≥ 22.14**.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # should show v22.x
npm -v
npm install -g pm2
```

---

## Step 4 — Clone the project

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USER/YOUR_REPO.git lisan
cd /var/www/lisan
```

(Or upload with `scp` / `rsync` if you are not using Git yet.)

---

## Step 5 — Start PostgreSQL

Using the repo’s Docker Compose (Postgres only):

```bash
cd /var/www/lisan
docker compose up -d
docker compose ps
```

Default local URL (matches `docker-compose.yml`):

```text
postgresql://doctor:translator@127.0.0.1:5432/doctor_translator
```

**Security tip:** Change the Postgres password in production. Edit `docker-compose.yml` and your `DATABASE_URL` to match. Do **not** expose port `5432` to the public internet (bind to `127.0.0.1` only if you publish the port).

---

## Step 6 — Backend environment and migrate

```bash
cd /var/www/lisan/backend
npm ci
```

Create `/var/www/lisan/backend/.env` (never commit this file):

```env
PORT=4000
DATABASE_URL=postgresql://doctor:translator@127.0.0.1:5432/doctor_translator
CLIENT_URL=https://your-domain.com

# Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=REPLACE_WITH_LONG_RANDOM_STRING
JWT_REFRESH_SECRET=REPLACE_WITH_ANOTHER_LONG_RANDOM_STRING
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

VIDEO_PROVIDER=webrtc
DAILY_API_KEY=
TURN_URLS=
TURN_USERNAME=
TURN_CREDENTIAL=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Lisan <noreply@your-domain.com>

CHAPA_SECRET_KEY=your_chapa_secret
CHAPA_PUBLIC_KEY=your_chapa_public
CHAPA_BASE_URL=https://api.chapa.co
CHAPA_MOCK=false

# Comma-separated extra allowed browser origins (optional if same domain via nginx)
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

Apply database migrations and optional seed:

```bash
npx prisma generate
npx prisma migrate deploy
# Optional demo users (admin@demo.com etc.):
# npm run db:seed
```

Start the API with pm2:

```bash
cd /var/www/lisan/backend
pm2 start src/server.js --name lisan-api
pm2 save
pm2 startup
# run the command pm2 prints so it restarts after reboot
```

Check:

```bash
curl -s http://127.0.0.1:4000/api/v1/health
# expect: {"ok":true,"service":"lisan-api"}
```

---

## Step 7 — Build the frontend

```bash
cd /var/www/lisan/frontend
npm ci
npm run build
```

This creates `frontend/dist`. With nginx on the **same domain**, the app keeps using `/api/v1` and same-origin sockets — no `VITE_API_URL` required.

---

## Step 8 — nginx config

Create `/etc/nginx/sites-available/lisan`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    root /var/www/lisan/frontend/dist;
    index index.html;

    # SPA routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO (paging, live session events)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Enable and test:

```bash
ln -sf /etc/nginx/sites-available/lisan /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## Step 9 — HTTPS (Let’s Encrypt)

DNS must already point to the Droplet.

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts. Certbot renews automatically.

Open: `https://your-domain.com`

---

## Step 10 — Production checklist

| Check | How |
|------|-----|
| Health | `https://your-domain.com/api/v1/health` |
| Login | Admin / hospital / translator |
| Socket | Translator online → hospital pages interpreter |
| Video | Two browsers; if hospital Wi‑Fi fails, add TURN or Daily |
| Payments | Chapa return URL uses `CLIENT_URL` |
| Secrets | JWT secrets are **not** the example `dev-*-secret` values |
| Firewall | `ufw status` shows only 22/80/443 |
| Postgres | Not reachable from the internet |

---

## Updates (redeploy after code changes)

```bash
cd /var/www/lisan
git pull

cd backend
npm ci
npx prisma migrate deploy
pm2 restart lisan-api

cd ../frontend
npm ci
npm run build
# nginx already serves frontend/dist — no restart needed
```

---

## Optional: Managed Postgres on DigitalOcean

1. Create → Databases → PostgreSQL  
2. Whitelist your Droplet  
3. Copy the connection string into `DATABASE_URL`  
4. Stop local Docker Postgres if unused: `docker compose down`  
5. `npx prisma migrate deploy` again  

Safer backups; costs more.

---

## Video (hospital Wi‑Fi)

Default WebRTC may fail behind strict NAT. Options:

1. Set TURN in `.env` (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`)  
2. Or use Daily: `VIDEO_PROVIDER=daily` and `DAILY_API_KEY=...`  

Then `pm2 restart lisan-api`.

---

## Security notes

- Never commit `backend/.env`  
- Use SSH keys; disable password login when ready  
- Keep Ubuntu updated: `apt update && apt upgrade`  
- Use strong Chapa **live** keys only when ready for real money  
- Remove unused huge assets from the repo before upload if present (`frontend/Image/L-cochlea.png`)  
- CORS: with same-domain nginx, browsers talk to one origin. Still set `CLIENT_URL` and `ALLOWED_ORIGINS` to your HTTPS URL so payment return URLs and origin checks work (see code note below)

### Code note (origins)

`backend/src/utils/origins.js` originally only allowed localhost and private LAN IPs. Before or right after first deploy, ensure production domains are allowed via `ALLOWED_ORIGINS` / `CLIENT_URL` (or same-origin nginx so most browser calls stay on your domain). If logins or sockets fail from the public URL, check that file and the env vars above.

---

## Quick cost summary

| Resource | Typical |
|----------|---------|
| Droplet 2 GB | ~$12/mo |
| Managed Postgres (optional) | ~$15/mo |
| Domain | varies |
| Let’s Encrypt | free |
| **Total** | **~$12–40/mo** |

---

## Where things live on the server

| Path | Purpose |
|------|---------|
| `/var/www/lisan` | Project root |
| `/var/www/lisan/backend/.env` | Secrets (private) |
| `/var/www/lisan/frontend/dist` | Built UI (nginx root) |
| `pm2` process `lisan-api` | Backend |
| `/etc/nginx/sites-available/lisan` | nginx site |
| Docker `pgdata` volume | Database files (if using Compose) |

---

## Need help next?

After the Droplet exists, you can:

1. Put your real domain in this guide’s placeholders  
2. Add `ALLOWED_ORIGINS` support in code if not already done  
3. Add a simple `deploy.sh` that runs `git pull` + migrate + build + `pm2 restart`

Ask if you want those added in the repo.
