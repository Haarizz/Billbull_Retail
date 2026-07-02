# BillBull Retail ERP - 8 Client Deployment Commands

## Client Setup Reference
```
Client 1: royaltools.billbull.app          → Port 8080 → DB: billbull_royaltools
Client 2: leroyalflowers.billbull.app      → Port 8081 → DB: billbull_leroyalflowers
Client 3: leroyalgifts.billbull.app        → Port 8082 → DB: billbull_leroyalgifts
Client 4: fashionhouse.billbull.app        → Port 8083 → DB: billbull_fashionhouse
Client 5: jewelrystore.billbull.app        → Port 8084 → DB: billbull_jewelrystore
Client 6: electronicshub.billbull.app      → Port 8085 → DB: billbull_electronicshub
Client 7: beautyboutique.billbull.app      → Port 8086 → DB: billbull_beautyboutique
Client 8: sportsgear.billbull.app          → Port 8087 → DB: billbull_sportsgear
```

---

## Phase 1: Database Setup

### Create All 8 Databases and User

```bash
sudo -u postgres psql << 'EOF'

-- Create billbull user (if not exists)
CREATE USER billbull WITH PASSWORD 'root';

-- Create 8 databases
CREATE DATABASE billbull_royaltools;
CREATE DATABASE billbull_leroyalflowers;
CREATE DATABASE billbull_leroyalgifts;
CREATE DATABASE billbull_fashionhouse;
CREATE DATABASE billbull_jewelrystore;
CREATE DATABASE billbull_electronicshub;
CREATE DATABASE billbull_beautyboutique;
CREATE DATABASE billbull_sportsgear;

-- Grant privileges to billbull user for all databases
GRANT ALL PRIVILEGES ON DATABASE billbull_royaltools TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_leroyalflowers TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_leroyalgifts TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_fashionhouse TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_jewelrystore TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_electronicshub TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_beautyboutique TO billbull;
GRANT ALL PRIVILEGES ON DATABASE billbull_sportsgear TO billbull;

-- Verify
\l

\q
EOF
```

---

## Phase 2: Application Properties Files

Create 8 application property files in `billbull-backend/src/main/resources/`:

### Client 1: Royal Tools
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-royaltools.properties << 'EOF'
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
EOF
```

### Client 2: Le Royal Flowers
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-leroyalflowers.properties << 'EOF'
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
EOF
```

### Client 3: Le Royal Gifts
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-leroyalgifts.properties << 'EOF'
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
EOF
```

### Client 4: Fashion House
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-fashionhouse.properties << 'EOF'
spring.application.name=billbull-backend-fashionhouse
server.port=8083

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_fashionhouse
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/fashionhouse/

jwt.secret=${JWT_SECRET_FASHIONHOUSE:fashionhouse-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
EOF
```

### Client 5: Jewelry Store
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-jewelrystore.properties << 'EOF'
spring.application.name=billbull-backend-jewelrystore
server.port=8084

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_jewelrystore
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/jewelrystore/

jwt.secret=${JWT_SECRET_JEWELRYSTORE:jewelrystore-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
EOF
```

### Client 6: Electronics Hub
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-electronicshub.properties << 'EOF'
spring.application.name=billbull-backend-electronicshub
server.port=8085

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_electronicshub
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/electronicshub/

jwt.secret=${JWT_SECRET_ELECTRONICSHUB:electronicshub-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
EOF
```

### Client 7: Beauty Boutique
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-beautyboutique.properties << 'EOF'
spring.application.name=billbull-backend-beautyboutique
server.port=8086

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_beautyboutique
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/beautyboutique/

jwt.secret=${JWT_SECRET_BEAUTYBOUTIQUE:beautyboutique-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
EOF
```

### Client 8: Sports Gear
```bash
cat > /root/billbull/billbull-backend/src/main/resources/application-sportsgear.properties << 'EOF'
spring.application.name=billbull-backend-sportsgear
server.port=8087

spring.datasource.url=jdbc:postgresql://localhost:5432/billbull_sportsgear
spring.datasource.username=postgres
spring.datasource.password=root

upload.path=uploads/sportsgear/

jwt.secret=${JWT_SECRET_SPORTSGEAR:sportsgear-secret-key-32chars-minimum!!!}
jwt.expiration=86400000

financials.jv.approval-threshold-aed=10000

spring.flyway.enabled=false
EOF
```

---

## Phase 3: Commit and Build

```bash
cd /root/billbull
git add billbull-backend/src/main/resources/application-*.properties
git commit -m "Add application property files for 8 clients: royaltools, leroyalflowers, leroyalgifts, fashionhouse, jewelrystore, electronicshub, beautyboutique, sportsgear"
git push origin main

cd billbull-backend
mvn clean package -DskipTests
```

---

## Phase 4: Create Upload Directories

```bash
mkdir -p /root/billbull/uploads/royaltools
mkdir -p /root/billbull/uploads/leroyalflowers
mkdir -p /root/billbull/uploads/leroyalgifts
mkdir -p /root/billbull/uploads/fashionhouse
mkdir -p /root/billbull/uploads/jewelrystore
mkdir -p /root/billbull/uploads/electronicshub
mkdir -p /root/billbull/uploads/beautyboutique
mkdir -p /root/billbull/uploads/sportsgear
```

---

## Phase 5: Create Systemd Services (All 8 Clients)

### Client 1: Royal Tools
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

### Client 2: Le Royal Flowers
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

### Client 3: Le Royal Gifts
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

### Client 4: Fashion House
```bash
cat > /etc/systemd/system/billbull-fashionhouse.service << 'EOF'
[Unit]
Description=BillBull - Fashion House
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=fashionhouse
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Client 5: Jewelry Store
```bash
cat > /etc/systemd/system/billbull-jewelrystore.service << 'EOF'
[Unit]
Description=BillBull - Jewelry Store
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=jewelrystore
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Client 6: Electronics Hub
```bash
cat > /etc/systemd/system/billbull-electronicshub.service << 'EOF'
[Unit]
Description=BillBull - Electronics Hub
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=electronicshub
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Client 7: Beauty Boutique
```bash
cat > /etc/systemd/system/billbull-beautyboutique.service << 'EOF'
[Unit]
Description=BillBull - Beauty Boutique
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=beautyboutique
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

### Client 8: Sports Gear
```bash
cat > /etc/systemd/system/billbull-sportsgear.service << 'EOF'
[Unit]
Description=BillBull - Sports Gear
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/root/billbull/billbull-backend
ExecStart=/usr/bin/java -jar target/billbull-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=sportsgear
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

---

## Phase 6: Enable and Start All Services

```bash
systemctl daemon-reload
systemctl enable billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
systemctl start billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

### Verify All Services Running
```bash
systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

---

## Phase 7: SSL Certificates (Using Certbot)

```bash
certbot certonly --standalone -d royaltools.billbull.app
certbot certonly --standalone -d leroyalflowers.billbull.app
certbot certonly --standalone -d leroyalgifts.billbull.app
certbot certonly --standalone -d fashionhouse.billbull.app
certbot certonly --standalone -d jewelrystore.billbull.app
certbot certonly --standalone -d electronicshub.billbull.app
certbot certonly --standalone -d beautyboutique.billbull.app
certbot certonly --standalone -d sportsgear.billbull.app
```

### Verify Certificates Created
```bash
ls -la /etc/letsencrypt/live/
```

---

## Phase 8: Nginx Configuration

Create comprehensive Nginx config for all 8 clients:

```bash
cat > /etc/nginx/sites-available/billbull << 'EOF'
# HTTP to HTTPS redirects
server {
    listen 80;
    server_name royaltools.billbull.app leroyalflowers.billbull.app leroyalgifts.billbull.app fashionhouse.billbull.app jewelrystore.billbull.app electronicshub.billbull.app beautyboutique.billbull.app sportsgear.billbull.app;
    return 301 https://$host$request_uri;
}

# Client 1: Royal Tools
server {
    listen 443 ssl http2;
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

# Client 2: Le Royal Flowers
server {
    listen 443 ssl http2;
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

# Client 3: Le Royal Gifts
server {
    listen 443 ssl http2;
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

# Client 4: Fashion House
server {
    listen 443 ssl http2;
    server_name fashionhouse.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/fashionhouse.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fashionhouse.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8083/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8083;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

# Client 5: Jewelry Store
server {
    listen 443 ssl http2;
    server_name jewelrystore.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/jewelrystore.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jewelrystore.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8084/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8084;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

# Client 6: Electronics Hub
server {
    listen 443 ssl http2;
    server_name electronicshub.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/electronicshub.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/electronicshub.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8085/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

# Client 7: Beauty Boutique
server {
    listen 443 ssl http2;
    server_name beautyboutique.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/beautyboutique.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/beautyboutique.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8086/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8086;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}

# Client 8: Sports Gear
server {
    listen 443 ssl http2;
    server_name sportsgear.billbull.app;
    root /var/www/billbull;
    index index.html;
    client_max_body_size 300M;

    ssl_certificate /etc/letsencrypt/live/sportsgear.billbull.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sportsgear.billbull.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /uploads/ { proxy_pass http://127.0.0.1:8087/uploads/; }
    location /api/ {
        proxy_pass http://127.0.0.1:8087;
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

### Enable Nginx
```bash
ln -s /etc/nginx/sites-available/billbull /etc/nginx/sites-enabled/billbull
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## Phase 9: Admin User Setup (All 8 Clients)

### Update Admin Passwords (Using bcrypt hash: `$2a$12$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS`)

```bash
# Client 1: Royal Tools
sudo -u postgres psql -d billbull_royaltools -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 2: Le Royal Flowers
sudo -u postgres psql -d billbull_leroyalflowers -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 3: Le Royal Gifts
sudo -u postgres psql -d billbull_leroyalgifts -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 4: Fashion House
sudo -u postgres psql -d billbull_fashionhouse -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 5: Jewelry Store
sudo -u postgres psql -d billbull_jewelrystore -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 6: Electronics Hub
sudo -u postgres psql -d billbull_electronicshub -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 7: Beauty Boutique
sudo -u postgres psql -d billbull_beautyboutique -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"

# Client 8: Sports Gear
sudo -u postgres psql -d billbull_sportsgear -c "UPDATE users SET password = '\$2a\$12\$2TQT8Cs6a4fRh5bPEcEr1e/1aD7eWUWR9sqZyMNYpOSsiRrX66VkS' WHERE username = 'admin';"
```

### Restart All Services
```bash
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

---

## Phase 10: Verification

### Check All Services Status
```bash
systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

### Test Frontend Loading (via Browser)
- https://royaltools.billbull.app
- https://leroyalflowers.billbull.app
- https://leroyalgifts.billbull.app
- https://fashionhouse.billbull.app
- https://jewelrystore.billbull.app
- https://electronicshub.billbull.app
- https://beautyboutique.billbull.app
- https://sportsgear.billbull.app

### Verify Databases Created
```bash
for db in billbull_royaltools billbull_leroyalflowers billbull_leroyalgifts billbull_fashionhouse billbull_jewelrystore billbull_electronicshub billbull_beautyboutique billbull_sportsgear; do
    echo "=== Database: $db ==="
    sudo -u postgres psql -d $db -c "\dt" | head -10
done
```

---

## Quick Reference: Login Credentials (All Clients)
**Username:** `admin`  
**Password:** `admin123`

---

## Notes
- All clients use the same React frontend (shared at `/var/www/billbull`)
- Each client has its own backend instance on unique port (8080-8087)
- Each client has its own PostgreSQL database
- SSL certificates auto-renew every 60 days via Certbot
- All services are configured to restart automatically on failure

