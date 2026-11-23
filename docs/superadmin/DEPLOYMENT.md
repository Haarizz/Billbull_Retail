# Deploying admin.billbull.app

> **Status:** built and tested locally (unit tests, plus an end-to-end run against a testdb clone).
> **Nothing has been deployed.** No server, DNS record, certificate or tenant has been touched.
> Each step below that writes to a server needs explicit go-ahead.

## Where to run it

The platform is small (~300 MB heap). VPS1 (62.72.59.119) was at 98% RAM in the last infrastructure
report, so either add RAM/swap there first or use a separate small host. It needs outbound HTTPS to
every client host and a public HTTPS name.

## 1. DNS and certificate

`admin.billbull.app` → the chosen server. Then `certbot certonly --nginx -d admin.billbull.app`.

## 2. Database

```bash
sudo -u postgres psql -c "CREATE ROLE billbull_platform LOGIN PASSWORD '<PLATFORM_DB_PASSWORD>'"
sudo -u postgres psql -c "CREATE DATABASE billbull_platform OWNER billbull_platform"
sudo -u postgres psql -c "REVOKE CONNECT ON DATABASE billbull_platform FROM PUBLIC"
```
Flyway creates the schema on first start (`V1__platform_schema.sql`).

## 3. Service

```bash
useradd --system --home /opt/billbull-platform --shell /usr/sbin/nologin billbull-platform
cd /root/billbull/billbull-platform && mvn package -DskipTests
install -d -o billbull-platform -m 750 /opt/billbull-platform
install -o billbull-platform -m 640 target/billbull-platform-0.1.0.jar /opt/billbull-platform/billbull-platform.jar
install -m 600 docs/superadmin/platform.env.example /etc/billbull/platform.env   # then fill in every <…>
install -m 644 docs/superadmin/billbull-platform.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now billbull-platform
journalctl -u billbull-platform -f   # "Created the first platform OWNER …", "Started PlatformApplication"
```
The service refuses to start without `PLATFORM_JWT_SECRET` and `PLATFORM_ENC_KEY` (32+ chars, different).

## 4. Admin app and nginx

```bash
cd /root/billbull/billbull-frontend && npm ci && npm run build:admin
install -d /var/www/billbull-admin && rm -rf /var/www/billbull-admin/* && cp -r apps/admin/dist/* /var/www/billbull-admin/
cp docs/superadmin/nginx-admin.billbull.app.conf /etc/nginx/sites-available/billbull-admin
ln -s /etc/nginx/sites-available/billbull-admin /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```
`/var/www/billbull-admin` is separate from `/var/www/billbull` (which the Retail update step empties).

## 5. First sign-in

Open https://admin.billbull.app, sign in with the bootstrap email/password, scan the QR code into an
authenticator app, then choose a new password. Remove `PLATFORM_BOOTSTRAP_*` from the env file and
restart. Add the rest of the team under Platform users (each gets a one-time password and must set
up MFA).

## 6. Connect the existing clients (one at a time)

Each tenant backend needs the build that contains the agent (migration V148).

1. In the control plane, **New client**: code = the backend's Spring profile (e.g. `royaltools`,
   `client1`), plan, app URL, server, port, database. Copy the agent secret shown once.
2. On the client's server, add to `/etc/billbull/<code>.env`:
   ```
   BILLBULL_PLATFORM_AGENT_ENABLED=true
   PLATFORM_AGENT_SECRET=<the secret>
   ```
   Profiles named `client1` etc. resolve to that code automatically; set `billbull.tenant.code`
   only if the registry code differs.
3. Add the `location /api/platform/` block from the client's provisioning kit (allow-listed to the
   control plane's IP) to its nginx server block; `nginx -t && systemctl reload nginx`.
4. Restart the client backend in a quiet hour. Then **Check health** → `UP`, and **Push state now**.

Until a client is pushed its behaviour is unchanged. Assigning a plan whose limits are lower than the
client's current usage blocks only *new* users/branches/terminals.

## 7. Backups

Install `billbull-backup.sh` on each server (see `OPERATIONS.md`) and confirm reports arrive under Backups.

## Rollback

- Control plane: `systemctl stop billbull-platform`, remove the nginx site. Clients keep enforcing the
  last state they received.
- A client: set its status to ACTIVE and modules to "follow plan" with no plan *before* stopping the
  platform — or on the client, `DELETE FROM platform_tenant_state;` (the 15 s cache then returns it to
  unmanaged). Setting `BILLBULL_PLATFORM_AGENT_ENABLED=false` disables the agent API but **does not**
  clear enforcement; clear the row as above.
