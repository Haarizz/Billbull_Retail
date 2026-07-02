# Update Commands for 8 Running Clients

## Your Running Clients
```
royaltools       → Port 8080 (PID: 117851)
leroyalflowers   → Port 8081 (PID: 131002)
citrine6         → Port 8082 (PID: 131502)
leroyalgifts     → Port 8083 (PID: 131023)
qa               → Port 8084 (PID: 131085)
client5          → Port 8085 (PID: 148312)
demo             → Port 8086 (PID: 145596)
leroyalgifts     → Port 8087 (PID: 148679)
```

---

## Execute These Commands on VPS (in order)

### 1. Pull Latest Code
```bash
cd /root/billbull
git pull origin main
git log --oneline -1
```

---

### 2. Rebuild Frontend (Once for all clients)
```bash
cd /root/billbull/billbull-frontend
npm install
npm run build
rm -rf /var/www/billbull/*
cp -r dist/* /var/www/billbull/
echo "✓ Frontend rebuilt"
```

---

### 3. Rebuild Backend JAR
```bash
cd /root/billbull/billbull-backend
mvn clean package -DskipTests
echo "✓ Backend JAR rebuilt"
```

---

### 4. Restart All 8 Clients (One by One)

```bash
# Client 1: royaltools (Port 8080)
systemctl restart billbull-royaltools
echo "✓ royaltools restarted"
sleep 5

# Client 2: leroyalflowers (Port 8081)
systemctl restart billbull-leroyalflowers
echo "✓ leroyalflowers restarted"
sleep 5

# Client 3: citrine6 (Port 8082)
systemctl restart billbull-citrine6
echo "✓ citrine6 restarted"
sleep 5

# Client 4: leroyalgifts (Port 8083)
systemctl restart billbull-leroyalgifts
echo "✓ leroyalgifts restarted"
sleep 5

# Client 5: qa (Port 8084)
systemctl restart billbull-qa
echo "✓ qa restarted"
sleep 5

# Client 6: client5 (Port 8085)
systemctl restart billbull-client5
echo "✓ client5 restarted"
sleep 5

# Client 7: demo (Port 8086)
systemctl restart billbull-demo
echo "✓ demo restarted"
sleep 5

# Client 8: leroyalgifts2 (Port 8087)
systemctl restart billbull-leroyalgifts2
echo "✓ leroyalgifts2 restarted"
```

**OR Restart All at Once (faster, but clients will be down briefly):**
```bash
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-citrine6 billbull-leroyalgifts billbull-qa billbull-client5 billbull-demo billbull-leroyalgifts2
echo "✓ All 8 clients restarted"
```

---

### 5. Verify All Services Running
```bash
systemctl status billbull-royaltools billbull-leroyalflowers billbull-citrine6 billbull-leroyalgifts billbull-qa billbull-client5 billbull-demo billbull-leroyalgifts2
```

**Expected:** All show `active (running)`

---

### 6. Check Backend Logs
```bash
echo "=== royaltools (8080) ==="
journalctl -u billbull-royaltools -n 20 --no-pager | tail -10

echo "=== leroyalflowers (8081) ==="
journalctl -u billbull-leroyalflowers -n 20 --no-pager | tail -10

echo "=== citrine6 (8082) ==="
journalctl -u billbull-citrine6 -n 20 --no-pager | tail -10

echo "=== leroyalgifts (8083) ==="
journalctl -u billbull-leroyalgifts -n 20 --no-pager | tail -10

echo "=== qa (8084) ==="
journalctl -u billbull-qa -n 20 --no-pager | tail -10

echo "=== client5 (8085) ==="
journalctl -u billbull-client5 -n 20 --no-pager | tail -10

echo "=== demo (8086) ==="
journalctl -u billbull-demo -n 20 --no-pager | tail -10

echo "=== leroyalgifts2 (8087) ==="
journalctl -u billbull-leroyalgifts2 -n 20 --no-pager | tail -10
```

**Look for:** `Started BillbullBackendApplication` (no errors)

---

### 7. Verify Processes Running (should match your ps aux output)
```bash
ps aux | grep java | grep billbull | grep -v grep
```

**Expected:** 8 Java processes running (one per client)

---

## One-Command Full Update

Copy and paste this to execute everything:

```bash
cd /root/billbull && \
git pull origin main && \
cd billbull-frontend && \
npm run build && \
rm -rf /var/www/billbull/* && \
cp -r dist/* /var/www/billbull/ && \
cd /root/billbull/billbull-backend && \
mvn clean package -DskipTests && \
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-citrine6 billbull-leroyalgifts billbull-qa billbull-client5 billbull-demo billbull-leroyalgifts2 && \
echo "✓ All clients updated and restarted" && \
sleep 10 && \
systemctl status billbull-royaltools billbull-leroyalflowers billbull-citrine6 billbull-leroyalgifts billbull-qa billbull-client5 billbull-demo billbull-leroyalgifts2
```

---

## Test All Clients in Browser

Visit these URLs and verify login page loads:

```
https://royaltools.billbull.app              (Port 8080)
https://leroyalflowers.billbull.app          (Port 8081)
https://citrine6.billbull.app                (Port 8082)
https://leroyalgifts.billbull.app            (Port 8083)
https://qa.billbull.app                      (Port 8084)
https://client5.billbull.app                 (Port 8085)
https://demo.billbull.app                    (Port 8086)
https://leroyalgifts2.billbull.app           (Port 8087)
```

**Expected:** All load login page, no 502/503 errors

---

## Test Admin Login on Each Client

```
Username: admin
Password: admin123
```

Login on at least one client to verify database connectivity.

---

## Monitor Restart Progress (Real-time)

```bash
watch -n 2 'ps aux | grep java | grep billbull | grep -v grep | wc -l'
```

Should show: `8` (all 8 clients running)

---

## Rollback (If Something Goes Wrong)

```bash
cd /root/billbull
git log --oneline -5
git reset --hard <PREVIOUS-COMMIT-HASH>
cd billbull-backend
mvn clean package -DskipTests
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-citrine6 billbull-leroyalgifts billbull-qa billbull-client5 billbull-demo billbull-leroyalgifts2
```

---

## Troubleshooting

### If a client won't start:
```bash
# Check specific client logs
journalctl -u billbull-royaltools -n 100 -f

# Check if port is in use
lsof -i :8080

# Kill stray process if needed
pkill -f "spring.profiles.active=royaltools"
sleep 5
systemctl start billbull-royaltools
```

### If database connection fails:
```bash
sudo -u postgres psql -d billbull_royaltools -c "SELECT 1"
```

### Clear browser cache if UI doesn't update:
- Press `Ctrl+Shift+Delete` in browser
- Clear all cache
- Hard refresh: `Ctrl+Shift+R`

---

## Summary

| Step | Command | Time |
|------|---------|------|
| Pull code | `git pull origin main` | 10s |
| Build frontend | `npm run build` | 30s |
| Build backend | `mvn clean package -DskipTests` | 60s |
| Restart all | `systemctl restart ...` | 30s |
| **Total** | | **~2 minutes** |

All 8 clients will be updated with **minimal downtime** (~30 seconds if restarting one at a time).

