# Admin panel — VPS deploy qadamlari

Panel tayyor bo'lib push qilingandan keyin VPS'da (95.182.119.86) bir marta:

## 1. Build

```bash
cd ~/app/admin
npm install
npm run build     # → admin/dist
```

## 2. Nginx

Mavjud server blokiga qo'shiladi:

```nginx
location /admin/ {
    alias /home/<user>/app/admin/dist/;
    try_files $uri $uri/ /admin/index.html;
}
```

`nginx -t && systemctl reload nginx`

## 3. .env (root)

```
ADMIN_PANEL_URL=https://<domen>/admin/
```

Keyin `pm2 restart backend` — botda `/admin` komandasi paydo bo'ladi (faqat adminlarga).

## 4. Backup cron (K3 — majburiy)

```bash
chmod +x ~/app/backend/scripts/backup-mongo.sh
crontab -e
# qo'shish:
15 2 * * * /home/<user>/app/backend/scripts/backup-mongo.sh >> $HOME/backups/mongo/backup.log 2>&1
```

Tekshirish: skriptni qo'lda bir marta ishga tushirib, `~/backups/mongo/<sana>/` paydo bo'lganini ko'rish.

## 5. Tekshiruv

- Brauzer: `https://<domen>/admin/` → "Войти через Telegram" → bot tasdiq → panel.
- Telegram: botda `/admin` → ⚙️ tugma → panel TMA ichida ochiladi (fullscreen).
- Eski TMA admin (do'kon ichidagi) parity tasdiqlanguncha ishlashda davom etadi.

## Lokal ishga tushirish (dev)

```bash
# 1-terminal: backend (in-memory Mongo + demo data, bot o'chiq)
cd backend && node scripts/dev-local.js

# 2-terminal: admin panel
cd admin && npm run dev
# → http://localhost:5173/admin/  (dev-bypass bilan avtomatik admin)
```
