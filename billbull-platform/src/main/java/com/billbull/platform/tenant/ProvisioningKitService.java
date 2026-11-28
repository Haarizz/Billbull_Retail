package com.billbull.platform.tenant;

import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Generates the files a server operator needs to stand up (or re-check) one tenant: Spring
 * profile, service environment, database script, systemd unit, nginx server block and an ordered
 * checklist. It writes nothing anywhere — server changes stay a deliberate, reviewed step.
 *
 * <p>The kit encodes the fixes from the architecture audit for new tenants: secrets only in the
 * environment, a database role per tenant, its own working directory (so {@code ./uploads} and
 * {@code ./logs} aren't shared), a heap cap, the tenant code stamped into JWTs, and
 * {@code /api/platform/} reachable only from the control plane's addresses.
 */
@Service
public class ProvisioningKitService {

    private final String jarPath;
    private final List<String> platformIps;
    private final String timezone;

    public ProvisioningKitService(
            @Value("${platform.provisioning.jar-path:/root/billbull/billbull-backend/target/billbull-backend-0.0.1-SNAPSHOT.jar}") String jarPath,
            @Value("${platform.provisioning.platform-egress-ips:${PLATFORM_EGRESS_IPS:}}") String platformIps,
            @Value("${platform.provisioning.timezone:Asia/Dubai}") String timezone) {
        this.jarPath = jarPath;
        this.platformIps = Arrays.stream(platformIps == null ? new String[0] : platformIps.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
        this.timezone = timezone;
    }

    /** file name → contents, in the order the checklist uses them. */
    public Map<String, String> kit(Tenant t, List<TenantDomain> domains) {
        String code = t.code;
        String host = domains.isEmpty() ? hostOf(t.appUrl, code + ".billbull.app") : domains.get(0).host;
        List<String> hosts = domains.isEmpty() ? List.of(host) : domains.stream().map(d -> d.host).toList();
        int port = t.backendPort != null ? t.backendPort : 8080;
        String db = t.databaseName != null ? t.databaseName : "billbull_" + code.replace('-', '_');
        String dbRole = "billbull_" + code.replace('-', '_');
        String profile = t.springProfile != null ? t.springProfile : code;

        Map<String, String> files = new LinkedHashMap<>();
        files.put("01-application-" + profile + ".properties", properties(code, port, db, profile));
        files.put("02-" + code + ".env", env(code, dbRole, hosts));
        files.put("03-database.sql", database(db, dbRole));
        files.put("04-billbull-" + code + ".service", systemd(code, profile));
        files.put("05-nginx-" + code + ".conf", nginx(hosts, port));
        files.put("06-CHECKLIST.md", checklist(t, host, port, db, profile));
        return files;
    }

    private String properties(String code, int port, String db, String profile) {
        return """
                # billbull-backend/src/main/resources/application-%s.properties
                # Commit this file: it holds no secrets. Every secret is read from /etc/billbull/%s.env.
                spring.application.name=billbull-backend-%s
                server.port=%d
                spring.datasource.url=jdbc:postgresql://127.0.0.1:5432/%s
                spring.datasource.username=${DB_USERNAME}
                spring.datasource.password=${DB_PASSWORD}
                jwt.secret=${JWT_SECRET}
                jwt.expiration=86400000
                upload.path=uploads/
                financials.jv.approval-threshold-aed=10000
                spring.flyway.enabled=true
                pos.businessday.timezone=%s
                # Stamped into every JWT (tid claim) so another client's token is refused here.
                billbull.tenant.code=%s
                """.formatted(profile, code, code, port, db, timezone, code);
    }

    private String env(String code, String dbRole, List<String> hosts) {
        String origins = String.join(",", hosts.stream().map(h -> "https://" + h).toList());
        return """
                # /etc/billbull/%s.env  (install -m 600; owned by root). Generate each value once:
                #   openssl rand -base64 48
                # Back these up in the password manager, separately from database backups.
                DB_USERNAME=%s
                DB_PASSWORD=<openssl rand -base64 32>
                JWT_SECRET=<openssl rand -base64 48 — unique to this client>
                EMAIL_ENC_KEY=<openssl rand -base64 48 — unique to this client>
                LOG_DIR=/var/log/billbull/%s
                BILLBULL_CORS_EXTRA_ORIGINS=%s
                # Platform agent (admin.billbull.app). The secret is shown once in the control plane
                # when the tenant is created or its secret rotated.
                BILLBULL_PLATFORM_AGENT_ENABLED=true
                PLATFORM_AGENT_SECRET=<paste the agent secret from the control plane>
                # Support sign-ins: also create an active user 'platform.support' in this tenant.
                BILLBULL_PLATFORM_SUPPORT_ACCESS_ENABLED=false
                # Reject tokens issued before the tid claim existed, once every user has signed in again:
                # BILLBULL_JWT_REQUIRE_TENANT_CLAIM=true
                # FIRST BOOT ON AN EMPTY DATABASE ONLY (Hibernate must create tables before Flyway):
                # SPRING_FLYWAY_ENABLED=false
                """.formatted(code, dbRole, code, origins);
    }

    private String database(String db, String role) {
        return """
                -- Run as postgres:  sudo -u postgres psql -v pw="'<DB_PASSWORD from the env file>'" -f 03-database.sql
                -- One role per client, owning only its own database (no shared 'billbull' superuser).
                CREATE ROLE %2$s LOGIN PASSWORD :pw;
                CREATE DATABASE %1$s OWNER %2$s;
                REVOKE CONNECT ON DATABASE %1$s FROM PUBLIC;
                GRANT CONNECT ON DATABASE %1$s TO %2$s;
                """.formatted(db, role);
    }

    private String systemd(String code, String profile) {
        return """
                # /etc/systemd/system/billbull-%1$s.service
                # Own working directory → own ./uploads and ./logs (not shared with other clients).
                #   install -d -m 750 /srv/billbull/%1$s /var/log/billbull/%1$s
                [Unit]
                Description=BillBull - %1$s
                After=network.target postgresql.service

                [Service]
                User=root
                WorkingDirectory=/srv/billbull/%1$s
                EnvironmentFile=/etc/billbull/%1$s.env
                ExecStart=/usr/bin/java -Xms256m -Xmx1024m -jar %3$s --spring.profiles.active=%2$s
                Restart=always
                RestartSec=10
                StandardOutput=journal
                StandardError=journal

                [Install]
                WantedBy=multi-user.target
                """.formatted(code, profile, jarPath);
    }

    private String nginx(List<String> hosts, int port) {
        StringBuilder allow = new StringBuilder();
        if (platformIps.isEmpty()) {
            allow.append("        # Set PLATFORM_EGRESS_IPS on the control plane to fill this in.\n")
                 .append("        allow 127.0.0.1;\n");
        } else {
            platformIps.forEach(ip -> allow.append("        allow ").append(ip).append(";\n"));
        }
        String names = String.join(" ", hosts);
        String first = hosts.get(0);
        return """
                server {
                    listen 80;
                    server_name %1$s;
                    return 301 https://$host$request_uri;
                }

                server {
                    listen 443 ssl http2;
                    server_name %1$s;
                    root /var/www/billbull;
                    index index.html;
                    client_max_body_size 300M;

                    ssl_certificate /etc/letsencrypt/live/%2$s/fullchain.pem;
                    ssl_certificate_key /etc/letsencrypt/live/%2$s/privkey.pem;
                    include /etc/letsencrypt/options-ssl-nginx.conf;
                    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

                    include /etc/nginx/snippets/billbull-pos.conf;

                    # Platform agent: only the control plane may call it (it is HMAC-signed as well).
                    location /api/platform/ {
                %3$s        deny all;
                        proxy_pass http://127.0.0.1:%4$d;
                        proxy_set_header Host $host;
                        proxy_set_header X-Real-IP $remote_addr;
                        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                        proxy_set_header X-Forwarded-Proto $scheme;
                        # Database console: statements may run up to 10 minutes; dumps stream unbuffered.
                        proxy_read_timeout 660s;
                        proxy_buffering off;
                    }

                    location / { try_files $uri $uri/ /index.html; }
                    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
                    location /uploads/ { proxy_pass http://127.0.0.1:%4$d/uploads/; }
                    location /api/ {
                        proxy_pass http://127.0.0.1:%4$d;
                        proxy_http_version 1.1;
                        proxy_set_header Host $host;
                        proxy_set_header X-Real-IP $remote_addr;
                        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                        proxy_set_header X-Forwarded-Proto $scheme;
                    }
                }
                """.formatted(names, first, allow, port);
    }

    private String checklist(Tenant t, String host, int port, String db, String profile) {
        return """
                # Onboarding checklist — %1$s (%2$s)

                Server: %3$s · Port: %4$d · Database: %5$s · Profile: %6$s

                1. **Capacity.** Each backend needs ~1 GB RAM. Check `free -m` on the server first.
                2. **Profile.** Add `01-application-%6$s.properties` to `billbull-backend/src/main/resources/`, commit, build the jar.
                3. **Secrets.** Install `02-%1$s.env` as `/etc/billbull/%1$s.env` (`chmod 600`), generating every `<…>` value. Paste the agent secret the control plane showed.
                4. **Database.** Run `03-database.sql` with the DB_PASSWORD from the env file.
                5. **Directories.** `install -d -m 750 /srv/billbull/%1$s /var/log/billbull/%1$s`
                6. **First boot.** Uncomment `SPRING_FLYWAY_ENABLED=false` in the env file, install `04-billbull-%1$s.service`, `systemctl daemon-reload && systemctl start billbull-%1$s`, wait for "Started BillbullBackendApplication" in `journalctl -u billbull-%1$s`, then stop it.
                7. **Second boot.** Remove that line and start again: Flyway baselines and applies every migration. Check the top version in `flyway_schema_history` has `success = t`. The first boot prints the generated `admin` password in the journal.
                8. **TLS.** `certbot certonly --nginx -d %2$s`
                9. **nginx.** Install `05-nginx-%1$s.conf`, then `nginx -t && systemctl reload nginx`.
                10. **Agent.** In the control plane open this tenant → Health → *Check now*. Expect `UP`. `AUTH_FAILED` means the secret or the server clock is wrong; `AGENT_OFF` means the env flag isn't set.
                11. **Activate.** Set the status to ACTIVE in the control plane. The plan and modules are pushed automatically.
                12. **Backups.** Add the database to the server's backup script (docs/superadmin/OPERATIONS.md) and confirm a report arrives under Backups.
                """.formatted(t.code, host, t.serverLabel != null ? t.serverLabel : "(not set)", port, db, profile);
    }

    private static String hostOf(String url, String fallback) {
        try {
            String h = url == null ? null : URI.create(url).getHost();
            return h != null ? h : fallback;
        } catch (RuntimeException e) {
            return fallback;
        }
    }
}
