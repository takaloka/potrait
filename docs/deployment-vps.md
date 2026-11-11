# VPS deployment

Published 2026-11-11: https://potrait.takaloka.in

- Participant: `/`; operator: `/operator`; event screen: `/layar`.
- Native app release: `/srv/loka-portrait/releases/def677e`, selected by `/srv/loka-portrait/current`.
- Service: `loka-portrait`, dedicated user, loopback `127.0.0.1:8791`, automatically enabled at boot.
- Persistent data: `/var/lib/loka-portrait/app.sqlite` (SQLite WAL) and `photos/`. Keep this directory across releases.
- Source: https://github.com/takaloka/potrait. Install locked dependencies with `npm ci`, build with `npm run build:vps`; Node >=22.13 required.
- Service limits: 2 GB memory, two CPU equivalents. Nginx config: `/etc/nginx/sites-available/loka-portrait`.
- TLS: dedicated Let's Encrypt certificate, expires 2027-02-09, certbot renewal timer; domain-specific reload hook.
- Existing Nginx config checksums and service PIDs: `/root/loka-deployment-baseline/`.

## Operator handoff

The existing local operator salted password hash was provisioned privately. Use the same operator password; existing browser sessions were not copied. Connect the AI provider from the operator panel, then enable photo submissions. Production contains no copied participant records, photos, or provider OAuth sessions. Original local data remains in the original workspace.

Public participant form, operator login and neutral QR event screen were checked through the browser. Native storage tests cover migrations, atomic batch rollback and restart/media persistence. 22/22 suites and TypeScript passed; lint has zero errors and seven warnings. VPS clean install/build and service restart succeeded. Existing eight services remained active with unchanged main PIDs and all original Nginx checksums matched.

Pending: authenticated production upload/generation/export, provider connection, real-device/load tests and backup restoration rehearsal. Do not interpret the closed public form as a live AI generation test.

## Operations

```sh
systemctl status loka-portrait --no-pager
journalctl -u loka-portrait -n 50 --no-pager
nginx -t
sha256sum -c /root/loka-deployment-baseline/nginx.sha256
```

For updates, build into a new release directory as `loka-portrait`, back up the database/media, switch `current`, and restart only `loka-portrait`. Never deploy local `node_modules`, `.wrangler`, environment secrets, or participant data in source archives. Startup applies SQL migrations and creates a pre-migration SQLite backup when needed.

For consistent full backups, briefly stop only `loka-portrait`, copy the entire `/var/lib/loka-portrait` directory to private backup storage, then start that service again. Backups contain sensitive material and need restricted access and retention. Restore database and photos together with compatible code.

Rollback to a previous compatible release by switching `current` and restarting `loka-portrait`. Removing this deployment requires disabling only `loka-portrait`, removing only its Nginx enabled symlink, then `nginx -t` and a graceful reload. Preserve persistent data and certificate until explicitly approved for deletion. Never stop Nginx or other applications.
