# ERP Branding Assets

Place your branding images here:

- `logo.png` — used as Website Settings brand image (login header and navbar). Recommended: transparent background PNG, ~256–512 px width.
- `favicon.png` or `favicon.ico` — used as Website Settings favicon. Recommended: 32×32 PNG (or ICO).

Then run:

```bash
make brand-erp
```

Environment used (from `.env`):
- `ERP_API_URL` (e.g., `http://localhost:3036` or `http://site.local:3036`)
- `ERP_API_HOST_HEADER` (use `site.local` when running behind nginx/site mode)
- `ERP_BOOTSTRAP_ADMIN_EMAIL`, `ERP_BOOTSTRAP_ADMIN_PASSWORD`
- Optional: `ERP_API_KEY`, `ERP_API_SECRET` (script can generate when missing)

Notes:
- Files are uploaded to ERPNext (`/files/...`) as public files.
- If you change images later, re-run `make brand-erp` to update Website Settings.


