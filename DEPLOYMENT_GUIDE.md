# BillBull Retail ERP - Complete VPS Deployment Guide

**Date:** June 2026  
**Version:** 1.0  
**Platform:** Ubuntu 24.04 LTS  
**Target:** 3+ Client Multi-Tenant Setup

---

## Table of Contents

1. [Server Overview](#server-overview)
2. [Initial Setup](#initial-setup)
3. [Database Setup](#database-setup)
4. [Code Deployment](#code-deployment)
5. [Backend Configuration](#backend-configuration)
6. [Systemd Services](#systemd-services)
7. [Nginx Reverse Proxy](#nginx-reverse-proxy)
8. [SSL Certificates](#ssl-certificates)
9. [Admin User Setup](#admin-user-setup)
10. [Testing](#testing)
11. [Deployment Checklist](#deployment-checklist)

---

## Server Overview

### Architecture
- **Single Shared Frontend** (React build) served by Nginx
- **Multiple Backend Instances** (one per client, different ports)
- **Single PostgreSQL** with separate databases per client
- **One Nginx** routing domains to correct backend ports

### Clients Setup (Example)
- **royaltools.billbull.app** → Backend port 8080 → Database: billbull_royaltools
- **leroyalflowers.billbull.app** → Backend port 8081 → Database: billbull_leroyalflowers
- **leroyalgifts.billbull.app** → Backend port 8082 → Database: billbull_leroyalgifts

### Prerequisites
- Fresh Ubuntu 24.04 LTS VPS
- Root access via SSH
- Domain DNS records pointing to VPS IP (62.72.59.119 in example)

---

## Initial Setup

### Step 1: Update System

```bash
apt update && apt upgrade -y
apt install -y ufw curl wget git unzip
```

### Step 2: Configure Firewall

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

### Step 3: Install Java 17

```bash
apt install -y openjdk-17-jdk
java -version
```

**Expected Output:** `openjdk version "17.0.x"`

### Step 4: Install Maven

```bash
apt install -y maven
mvn -version
```

### Step 5: Install PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

### Step 6: Install Node.js (for frontend build only)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v && npm -v
```

### Step 7: Install Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

### Step 8: Install Certbot (for SSL)

```bash
apt install -y certbot python3-certbot-nginx
```

---

## Database Setup

### Step 1: Connect to PostgreSQL

```bash
sudo -u postgres psql
```

### Step 2: Create Databases and User

Run these SQL commands inside psql:

```sql
CREATE USER billbull WITH PASSWORD 'root';

CREATE DATABASE billbull_royaltools;
CREATE DATABASE billbull_leroyalflowers;
CREATE DATABASE billbull_leroyalgifts;

GRANT ALL PRIVILEGES ON DATABASE billbull_royaltools TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_leroyalflowers TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_leroyalgifts TO billbull;

\l
\q
```

**Verify:** All 3 databases should be listed and owned by postgres with billbull having privileges.

---

## Code Deployment

### Step 1: Clone Repository

```bash
cd /root
git clone https://github.com/Haarizz/Billbull_Retail.git billbull
cd billbull
```

### Step 2: Verify Branch

```bash
git status
git log --oneline -5
```

Ensure you're on the `main` branch or the branch with the latest code.

---

## Frontend Build & Deployment

### Step 1: Build React Frontend

```bash
cd /root/billbull/billbull-frontend
npm install
npm run build
```

**Expected:** `dist/` folder created with `index.html` and `assets/`

### Step 2: Copy to Web Root

```bash
mkdir -p /var/www/billbull
cp -r /root/billbull/billbull-frontend/dist/* /var/www/billbull/
```

**Verify:**
```bash
ls /var/www/billbull/
```

Should show: `index.html`, `assets/`, etc.

---

## Backend Configuration

### Step 1: Add CORS Configuration

Update the CORS config to include the new client domains.

**File:** `billbull-backend/src/main/java/com/billbull/backend/config/CorsConfig.java`

Add to the `setAllowedOrigins(List.of(...))` array:

```java
"https://royaltools.billbull.app",
"https://leroyalflowers.billbull.app",
"https://leroyalgifts.billbull.app"
```

### Step 2: Create Client-Specific Properties Files

**File:** `billbull-backend/src/main/resources/application-royaltools.properties`

```properties
spring.application.name=billbull-backend-royaltools
server.port=8080

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_royaltools
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/royaltools/

jwt.secret=${JWT_SECRET_ROYALTOOLS:royaltools-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
```

**File:** `billbull-backend/src/main/resources/application-leroyalflowers.properties`

```properties
spring.application.name=billbull-backend-leroyalflowers
server.port=8081

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_leroyalflowers
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/leroyalflowers/

jwt.secret=${JWT_SECRET_LEROYALFLOWERS:leroyalflowers-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
```

**File:** `billbull-backend/src/main/resources/application-leroyalgifts.properties`

```properties
spring.application.name=billbull-backend-leroyalgifts
server.port=8082

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_leroyalgifts
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/leroyalgifts/

jwt.secret=${JWT_SECRET_LEROYALGIFTS:leroyalgifts-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
```

### Step 3: Commit & Push Changes

```bash
cd /root/billbull
git add -A
git commit -m "Add CORS for new clients + application property files for royaltools, leroyalflowers, leroyalgifts"
git push origin main
```

### Step 4: Build Backend JAR

```bash
cd /root/billbull
git pull origin main
cd billbull-backend
mvn clean package -DskipTests
```

**Expected:** Jar created at `target/billbull-backend-0.0.1-SNAPSHOT.jar` (size ~80MB+)

---

## Systemd Services

### Step 1: Create Upload Directories

```bash
mkdir -p /root/billbull/uploads/royaltools
mkdir -p /root/billbull/uploads/leroyalflowers
mkdir -p /root/billbull/uploads/leroyalgifts
```

### Step 2: Create Systemd Service - Royal Tools

```bash
cat > /etc/systemd/system/billbull-royaltools.service << 'EOF'
[Unit]
Description=BillBull - Royal Tools
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=royaltools
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Step 3: Create Systemd Service - Le Royal Flowers

```bash
cat > /etc/systemd/system/billbull-leroyalflowers.service << 'EOF'
[Unit]
Description=BillBull - Le Royal Flowers
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=leroyalflowers
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Step 4: Create Systemd Service - Le Royal Gifts

```bash
cat > /etc/systemd/system/billbull-leroyalgifts.service << 'EOF'
[Unit]
Description=BillBull - Le Royal Gifts
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=leroyalgifts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Step 5: Enable and Start Services

```bash
systemctl daemon-reload
systemctl enable billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
systemctl start billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
```

### Step 6: Verify Services Running

```bash
systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
```

**Expected:** All three show `active (running)`

### Step 7: Check Backend Logs

```bash
journalctl -u billbull-royaltools -n 50 -f
```

**Look for:** 
- `Tomcat initialized with port 8080`
- `Started BillbullBackendApplication`
- No ERROR lines about database

---

## Nginx Reverse Proxy

### Step 1: Create SSL Files (Temporary, before Certbot)

```bash
cat > /etc/letsencrypt/options-ssl-nginx.conf << 'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
EOF

mkdir -p /etc/letsencrypt
openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
```

### Step 2: Create Nginx Configuration

```bash
cat > /etc/nginx/sites-available/billbull << 'EOF'
server {
    listen 80;
    server_name royaltools.billbull.app leroyalflowers.billbull.app leroyalgifts.billbull.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name royaltools.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/royaltools.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/royaltools.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8080/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

server {
    listen 443 ssl;
    server_name leroyalflowers.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/leroyalflowers.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/leroyalflowers.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8081/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

server {
    listen 443 ssl;
    server_name leroyalgifts.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/leroyalgifts.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/leroyalgifts.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8082/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}
EOF
```

### Step 3: Enable Nginx Configuration

```bash
ln -s /etc/nginx/sites-available/billbull /etc/nginx/sites-enabled/billbull
rm -f /etc/nginx/sites-enabled/default
```

---

## SSL Certificates

### Step 1: Get SSL Certs with Certbot (Standalone Mode)

Use standalone mode because we need certs before Nginx can fully start:

```bash
certbot certonly --standalone -d royaltools.billbull.app
certbot certonly --standalone -d leroyalflowers.billbull.app
certbot certonly --standalone -d leroyalgifts.billbull.app
```

**During prompt:**
- Enter email: `your-email@example.com`
- Agree to terms: `Y`
- Share email with EFF: `Y` (optional)

### Step 2: Verify Certificates Created

```bash
ls -la /etc/letsencrypt/live/
```

Should show 3 directories:
- `royaltools.billbull.app/`
- `leroyalflowers.billbull.app/`
- `leroyalgifts.billbull.app/`

Each containing: `fullchain.pem`, `privkey.pem`

### Step 3: Test Nginx Configuration

```bash
nginx -t
```

**Expected:** `nginx: configuration file /etc/nginx/nginx.conf test is successful`

### Step 4: Reload Nginx

```bash
systemctl reload nginx
systemctl status nginx
```

**Expected:** `active (running)`

---

## Admin User Setup

### Step 1: Generate Bcrypt Hash for Password

Use an online bcrypt generator or bcrypt tool. For password `admin123`:

Hash: `$2a$12$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS`

Or generate your own with a different password.

### Step 2: Update Admin Password for All Clients

**Royal Tools (billbull_royaltools):**
```bash
sudo -u postgres psql -d billbull_royaltools -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"
```

**Le Royal Flowers (billbull_leroyalflowers):**
```bash
sudo -u postgres psql -d billbull_leroyalflowers -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"
```

**Le Royal Gifts (billbull_leroyalgifts):**
```bash
sudo -u postgres psql -d billbull_leroyalgifts -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"
```

### Step 3: Restart Backends to Pick Up Changes

```bash
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
```

Wait 10 seconds for services to restart.

---

## Testing

### Step 1: Test Frontend Loading

Visit in browser:
- https://royaltools.billbull.app → Should load login page
- https://leroyalflowers.billbull.app → Should load login page
- https://leroyalgifts.billbull.app → Should load login page

### Step 2: Test Admin Login

On any of the above URLs:

**Username:** `admin`  
**Password:** `admin123` (or whatever you set)

**Expected:** Login succeeds, redirects to dashboard

### Step 3: Verify Database Tables Created

```bash
sudo -u postgres psql -d billbull_royaltools -c "\dt"
```

Should show 50+ tables (users, roles, branches, sales_invoices, etc.)

### Step 4: Check Service Health

```bash
systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
```

All should show `active (running)` with no recent errors.

---

## Deployment Checklist

### Pre-Deployment
- [ ] Fresh Ubuntu 24.04 LTS VPS provisioned
- [ ] DNS A records for all 3 domains point to VPS IP
- [ ] SSH access confirmed
- [ ] Firewall rules configured (80, 443, 22)

### Installation
- [ ] Java 17 installed
- [ ] Maven installed
- [ ] Node.js installed
- [ ] PostgreSQL installed and running
- [ ] Nginx installed
- [ ] Certbot installed

### Database
- [ ] PostgreSQL user "billbull" created
- [ ] 3 databases created (royaltools, leroyalflowers, leroyalgifts)
- [ ] Permissions granted to billbull user

### Code
- [ ] Repository cloned to /root/billbull
- [ ] CORS config updated with new domains
- [ ] 3 application-*.properties files created
- [ ] Changes committed and pushed to main
- [ ] Frontend built and copied to /var/www/billbull
- [ ] Backend JAR built successfully

### Services
- [ ] 3 systemd service files created
- [ ] Services enabled and started
- [ ] All 3 services show "active (running)"
- [ ] Backend logs show successful startup

### Nginx & SSL
- [ ] Nginx config created
- [ ] SSL certificates obtained from Let's Encrypt
- [ ] Nginx test passes (`nginx -t`)
- [ ] Nginx reloaded
- [ ] HTTPS accessible on all 3 domains

### Admin Access
- [ ] Admin password hash updated for all 3 databases
- [ ] Backends restarted
- [ ] Login successful with admin/admin123

### Final Testing
- [ ] All 3 domains load login page
- [ ] Admin can log in on all 3 domains
- [ ] Database tables created on login
- [ ] No 500 errors in logs
- [ ] API endpoints responding (check network tab)

---

## Troubleshooting

### Backend Won't Start

**Check logs:**
```bash
journalctl -u billbull-royaltools -n 100 -f
```

**Common issues:**
- Database connection failed → Check PostgreSQL is running
- Port already in use → Change port in application-*.properties
- Flyway migration error → Ensure Flyway is disabled

### Nginx 502 Bad Gateway

**Cause:** Backend not responding  
**Fix:**
```bash
systemctl status billbull-royaltools
curl http://127.0.0.1:8080/api/auth/login
```

### SSL Certificate Not Found

**Check:**
```bash
ls -la /etc/letsencrypt/live/
```

**Fix:** Re-run certbot for missing domains

### Password Not Working After Update

**Root cause:** Backend cached user in memory  
**Fix:**
```bash
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
```

---

## Monitoring & Maintenance

### Daily Health Check

```bash
# Check all services running
systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts

# Check for recent errors
journalctl -u billbull-royaltools -n 20 --no-pager
journalctl -u billbull-leroyalflowers -n 20 --no-pager
journalctl -u billbull-leroyalgifts -n 20 --no-pager

# Check Nginx
systemctl status nginx
```

### SSL Certificate Renewal

Certbot auto-renews every 60 days. Verify:

```bash
certbot renew --dry-run
```

### Database Backups

```bash
# Backup all databases
pg_dump -U postgres billbull_royaltools > /backups/royaltools_$(date +%Y%m%d).sql
pg_dump -U postgres billbull_leroyalflowers > /backups/leroyalflowers_$(date +%Y%m%d).sql
pg_dump -U postgres billbull_leroyalgifts > /backups/leroyalgifts_$(date +%Y%m%d).sql
```

### Deploying Updates

```bash
cd /root/billbull
git pull origin main
cd billbull-backend
mvn clean package -DskipTests
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts
```

---

## Support

For issues or questions:
- Check backend logs: `journalctl -u billbull-royaltools -f`
- Check Nginx logs: `tail -f /var/log/nginx/error.log`
- Check PostgreSQL: `sudo -u postgres psql -d billbull_royaltools`

---

**End of Deployment Guide**
