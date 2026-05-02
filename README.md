# CopJe

Standalone Next.js app for the CopJe online rubber stamp creator.

## Getting Started

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## Deployment (Nginx + PM2)

This repo includes:

- `deploy/ecosystem.config.cjs` (PM2 process manager config)
- `deploy/nginx-hana2-copje.conf` (Nginx reverse proxy config)

Deploy on VPS (example host: `hana2.ronniefrom.my`):

```bash
npm ci
npm run build

pm2 startOrReload deploy/ecosystem.config.cjs
```

If you change the app code:

```bash
git pull
npm ci
npm run build
pm2 startOrReload deploy/ecosystem.config.cjs
```

Reload nginx after adding/updating the site config:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify:

```bash
curl -I http://127.0.0.1:3000
curl -I https://hana2.ronniefrom.my
```
