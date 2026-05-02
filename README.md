# COP JE

Standalone Next.js app for the COP JE online rubber stamp creator.

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

## PM2 startup on reboot (systemd)

Install this service so COP JE restarts automatically after boot:

```bash
sudo cp deploy/copje-pm2.service /etc/systemd/system/copje.service
sudo systemctl daemon-reload
sudo systemctl enable copje
sudo systemctl start copje
```

Check status:

```bash
systemctl status copje
```

> If your PM2 binary is not in PATH for systemd, edit `deploy/copje-pm2.service` and replace `/usr/bin/env pm2` with your full PM2 path.

## CI-friendly deploy script

Use this on deployment runners or the server to pull, build, and hot-reload:

```bash
chmod +x deploy/redeploy.sh
COPJE_BRANCH=main ./deploy/redeploy.sh
```

What it does:
- pulls latest code from origin
- installs dependencies (`npm ci`)
- builds (`npm run build`)
- reloads PM2 with `deploy/ecosystem.config.cjs`
