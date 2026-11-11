# Isolated VPS Deployment Plan

Goal: publish https://potrait.takaloka.in on the existing VPS without changing other applications.

Architecture approved in conversation: native Node/Vinext, SQLite and filesystem object storage. Preserve the Cloudflare target as an optional build. Run as dedicated `loka-portrait` user/service, bind only 127.0.0.1:8791, persistent storage /var/lib/loka-portrait, releases /srv/loka-portrait, separate Nginx virtual host and certificate.

- [x] Inspect existing services, ports, resources, Nginx sites and DNS read-only.
- [x] Implement/test SQLite D1-compatible adapter and filesystem media, including transactions/persistence/path rejection.
- [x] Build and exercise native Node target locally with isolated data; public form and protected state checked; 22/22 regression suites passed.
- [x] Record existing Nginx/service baseline; provision only dedicated app paths/user/service.
- [x] Upload clean source, install locked dependencies and build as app user at lowered CPU priority.
- [x] Start on loopback; verify health; add only new Nginx HTTP virtual host after nginx -t.
- [x] Issue dedicated TLS certificate via webroot; enable HTTPS after nginx -t and graceful reload.
- [x] Verify public form, operator login, neutral screen through una and unchanged existing configs/service PIDs; record remaining operator/provider steps.
- [x] Commit/push deployment code and publish runbook/rollback instructions.
- [ ] User connects provider in production; authenticated upload/generation/export end-to-end check remains pending. Keep submissions closed until ready.

No copying participant data or OAuth secrets into the release. Operator account can be provisioned by transferring only the existing salted password hash in a private file. New event submissions stay closed until a provider is connected. Rollback affects only the new vhost/service/current symlink; never stop nginx, reset the VPS or modify other site files.
