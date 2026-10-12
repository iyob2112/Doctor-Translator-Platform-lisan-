# Lisan — Hospital–Translator Video Consultation

Live clinic interpretation: the patient stays in the hospital exam room. When language is a barrier, the **hospital login** pages an online translator who joins by video or voice.

**Production on DigitalOcean:** see [DIGITALOCEAN.md](./DIGITALOCEAN.md) for Droplet size, install steps, nginx, HTTPS, env vars, and redeploy.

There is no doctor login. One hospital account is shared for that hospital’s exam room.

## Run locally

1. Start Postgres:

```bash
docker compose up -d
```

2. Backend:

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

3. Frontend (another terminal):

```bash
cd frontend
npm install
npm run dev
```

Open [https://localhost:5173](https://localhost:5173).

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Platform admin | admin@demo.com | Admin123! |
| Hospital | hospital@demo.com | Hospital123! |
| Translator (approved) | translator@demo.com | Translator123! |

- Platform admin creates hospitals, hospital logins, and **translator** accounts (email, password, languages).
- Translators cannot apply themselves. The admin assigns languages; translators cannot change them.
- The hospital account starts consults, pages interpreters, and joins the live call.

Use two browsers: put the approved translator **online**, then from the hospital desk start a consult and request Spanish.

Video uses browser WebRTC with extra STUN servers, plus optional TURN (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`) so hospital Wi‑Fi can connect. To use Daily.co (relayed media that works behind most clinic firewalls), set `VIDEO_PROVIDER=daily` and `DAILY_API_KEY` in `backend/.env`.

Forgot password is on the sign-in page. Without SMTP, development servers print the reset link in the API log (not in the browser). Set `SMTP_HOST` (and related vars) to send real email.
