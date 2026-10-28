# T Solutions website

No dependencies. Needs Node 20.6 or newer.

## Run locally
    node server.js            # http://localhost:3000, admin login disabled until configured

## Go live
1. Buy your domain. Replace `https://tsolutions.example` in `public/` (index, legal pages, sitemap.xml, robots.txt, llms.txt) with it:
   `grep -rl tsolutions.example public | xargs sed -i 's#https://tsolutions.example#https://YOURDOMAIN#g'`
2. `node hash-password.js "your long password"`, copy `.env.example` to `.env`, fill it in.
3. Put the site behind HTTPS (Caddy is easiest: `YOURDOMAIN { reverse_proxy localhost:3000 }`). Caddy gets the certificate for you.
4. `node --env-file=.env server.js` (use systemd or pm2 to keep it running).
5. Fill in every [ADD: ...] in `public/privacy.html`, and have a Kenyan advocate read the four legal pages.
6. Back up `data/` (orders and prices). Admin is at /admin.html.

## What is in here
- `public/` pages, CSS, JS, favicon, sitemap, robots.txt, llms.txt, 404 page
- `server.js` static files, security headers, admin login, orders API
- Security: scrypt password hash, signed HttpOnly SameSite=Strict (Secure in production) session, CSRF token and origin check, rate limits (login 5 per 15 min, orders 10 per hour, 300 requests per minute), input limits and cleaning, server side price calculation, strict CSP with no inline scripts, HSTS, no source maps, no uploads, no SQL (JSON files).

## Owner admin (/admin.html)
Log in with ADMIN_EMAIL and your password. You can add, edit and delete services and categories, change price, time, delivery, what to bring, the details asked on WhatsApp, the WhatsApp and M-Pesa numbers and the delivery fee, and add your own photos. Press "Save all changes" to publish.

## Keeping your changes
Everything you change lives in the `data/` folder (services.json, orders.json, uploads/). Updating the site files never touches it. Copy `data/` to a safe place regularly. The previous save is kept as `data/services.json.bak`. `seed/services.json` is only the starting list used the first time the server runs.
