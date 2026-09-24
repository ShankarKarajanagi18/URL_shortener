# Shortly: URL Shortener

React + Node/Express + PostgreSQL, containerised with Docker, deployable on AWS EC2 + RDS.

**Features:** shorten URLs, custom aliases, link expiry (date and/or max clicks), QR code per link (PNG download), JWT auth, click analytics (per day, referrers, devices), rate limiting.

## Run locally
```bash
cp .env.example .env      # set JWT_SECRET
docker compose up --build
# open http://localhost:8080
```
Without Docker: run Postgres, then in `backend/` run `DATABASE_URL=postgres://user:pass@localhost:5432/db BASE_URL=http://localhost:4000 npm run dev`, and in `frontend/` run `npm install && npm run dev`. Tables are created automatically on startup.

## API
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | returns JWT |
| POST | /api/links | `{url, alias?, expiresAt?, maxClicks?}` (auth) |
| GET | /api/links | your links (auth) |
| DELETE | /api/links/:id | (auth) |
| GET | /api/links/:id/stats | clicks/day, referrers, devices (auth) |
| GET | /api/qr/:code | PNG, or `?format=svg` |
| GET | /:code | 302 redirect, or 410 if expired / limit reached |

## How it works
- **Code generation:** random 7-char base62 code, retried on a unique-constraint collision.
- **Expiry and click limit:** one atomic `UPDATE ... WHERE not expired AND click_count < max_clicks RETURNING`. No race condition, even under concurrent clicks.
- **302, not 301:** browsers cache 301s, so repeat clicks would never reach the server and analytics would break.
- **Async click logging:** the redirect is sent first, the analytics insert happens after.
- **Validation:** only http/https, and links pointing back to this service are rejected (prevents redirect loops).
- **Nginx** serves the React build, proxies `/api` and short codes to the API.

## Deploy on AWS (EC2 + RDS)
1. **RDS:** create a PostgreSQL instance (db name `shortener`), private access. Note the endpoint.
2. **EC2:** Ubuntu t3.micro. Security group: allow 22 (your IP), 80 and 443 (anywhere).
3. **RDS security group:** allow inbound 5432 from the EC2 security group.
4. On EC2: `sudo apt update && sudo apt install -y docker.io docker-compose-v2 git && sudo usermod -aG docker $USER`, then log out and back in.
5. `git clone` your repo, create `.env` with `DATABASE_URL`, `JWT_SECRET`, and `BASE_URL=http://<EC2 public IP or domain>`.
6. `docker compose -f docker-compose.prod.yml up -d --build`
7. Open the EC2 public IP. Optional: point a domain at it and add HTTPS with Let's Encrypt (certbot), then set `BASE_URL` to the https domain.

## Next steps
Redis cache for redirects, GitHub Actions deploy, Jest + Supertest tests, k6 load test for a resume number.
