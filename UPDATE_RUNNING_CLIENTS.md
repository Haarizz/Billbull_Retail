# Update Running Clients - Step-by-Step Guide

## Current Status
- **Current Branch:** `feature/bbpos`
- **Target Branch:** `main`
- **Changed Files:** Multiple backend Java files + frontend components

---

## Steps to Update All 8 Running Clients

### Step 1: Merge Changes to Main Branch

```bash
cd /root/billbull

# Switch to main branch
git checkout main

# Merge feature/bbpos into main
git merge feature/bbpos

# Push to remote
git push origin main
```

**OR** Create a Pull Request and merge via GitHub if you prefer code review.

---

### Step 2: Pull Latest Code on VPS

```bash
cd /root/billbull
git pull origin main
```

Verify you see the latest commit:
```bash
git log --oneline -1
```

---

### Step 3: Rebuild Frontend

```bash
cd /root/billbull/billbull-frontend

# Install dependencies (if needed)
npm install

# Build for production
npm run build

# Copy to web root (replaces old build)
rm -rf /var/www/billbull/*
cp -r dist/* /var/www/billbull/

# Verify
ls -la /var/www/billbull/ | head -20
```

**Expected:** Should show `index.html`, `assets/` folder, etc.

---

### Step 4: Rebuild Backend JAR

```bash
cd /root/billbull/billbull-backend

# Clean and package
mvn clean package -DskipTests

# Verify JAR created
ls -lh target/billbull-backend-0.0.1-SNAPSHOT.jar
```

**Expected:** JAR size should be ~80MB+

---

### Step 5: Restart All 8 Client Services

**Restart all at once:**
```bash
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

**Or one by one (with 5-second wait between):**
```bash
systemctl restart billbull-royaltools && sleep 5
systemctl restart billbull-leroyalflowers && sleep 5
systemctl restart billbull-leroyalgifts && sleep 5
systemctl restart billbull-fashionhouse && sleep 5
systemctl restart billbull-jewelrystore && sleep 5
systemctl restart billbull-electronicshub && sleep 5
systemctl restart billbull-beautyboutique && sleep 5
systemctl restart billbull-sportsgear
```

---

### Step 6: Verify All Services are Running

```bash
systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

**Expected:** All show `active (running)`

---

### Step 7: Check Backend Logs for Errors

```bash
# Check each service (watch for 10 seconds)
journalctl -u billbull-royaltools -n 30 --no-pager

journalctl -u billbull-leroyalflowers -n 30 --no-pager

journalctl -u billbull-leroyalgifts -n 30 --no-pager

journalctl -u billbull-fashionhouse -n 30 --no-pager

journalctl -u billbull-jewelrystore -n 30 --no-pager

journalctl -u billbull-electronicshub -n 30 --no-pager

journalctl -u billbull-beautyboutique -n 30 --no-pager

journalctl -u billbull-sportsgear -n 30 --no-pager
```

**Look for:** 
- ✅ `Started BillbullBackendApplication`
- ✅ `Tomcat initialized with port 808X`
- ❌ NO ERROR lines about database connection
- ❌ NO OutOfMemoryError

---

### Step 8: Test All Client URLs in Browser

Visit each domain (should load login page immediately):

```
https://royaltools.billbull.app
https://leroyalflowers.billbull.app
https://leroyalgifts.billbull.app
https://fashionhouse.billbull.app
https://jewelrystore.billbull.app
https://electronicshub.billbull.app
https://beautyboutique.billbull.app
https://sportsgear.billbull.app
```

**Expected:** All load the login page, no 502/503 errors

---

### Step 9: Test Admin Login on Each Client

For any client (e.g., royaltools):

1. Go to https://royaltools.billbull.app
2. Enter:
   - **Username:** `admin`
   - **Password:** `admin123`
3. Click Login

**Expected:** Should redirect to dashboard without errors

---

### Step 10: Verify API Endpoints

Open browser DevTools (F12) → Network tab → login and check:
- API requests should return 200/201 status
- No CORS errors
- No 502 Bad Gateway

---

## Quick Restart All Command (Copy & Paste)

```bash
cd /root/billbull && git pull origin main && cd billbull-frontend && npm run build && cp -r dist/* /var/www/billbull/ && cd /root/billbull/billbull-backend && mvn clean package -DskipTests && systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

---

## Rollback (If Something Breaks)

**Go back to previous working version:**

```bash
cd /root/billbull

# Reset to previous commit
git log --oneline -5  # Find the good commit hash

git reset --hard <commit-hash>  # Replace with actual hash

# Rebuild and restart
cd billbull-backend
mvn clean package -DskipTests
systemctl restart billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

---

## Common Issues & Fixes

### Issue: 502 Bad Gateway on all clients
**Cause:** Backend not running  
**Fix:**
```bash
systemctl status billbull-royaltools
journalctl -u billbull-royaltools -n 50 -f
```

### Issue: Login page loads but API calls fail
**Cause:** Frontend/backend mismatch  
**Fix:**
```bash
# Clear browser cache (Ctrl+Shift+Delete)
# Hard refresh (Ctrl+Shift+R)
# Or rebuild frontend:
cd /root/billbull/billbull-frontend && npm run build && cp -r dist/* /var/www/billbull/
```

### Issue: OutOfMemory errors in logs
**Cause:** Old Java process still running  
**Fix:**
```bash
# Kill stray processes
pkill -f billbull

# Wait 5 seconds
sleep 5

# Restart services
systemctl start billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear
```

### Issue: Database connection refused
**Cause:** PostgreSQL not running  
**Fix:**
```bash
systemctl status postgresql
systemctl restart postgresql
```

---

## Monitoring After Update

### Watch all services in real-time:
```bash
watch -n 5 'systemctl status billbull-royaltools billbull-leroyalflowers billbull-leroyalgifts billbull-fashionhouse billbull-jewelrystore billbull-electronicshub billbull-beautyboutique billbull-sportsgear | grep -E "Active|running"'
```

### Follow backend logs:
```bash
journalctl -u billbull-royaltools -f
```

---

## Notes
- Updates are **zero-downtime** if you restart one client at a time
- All clients use the **same frontend** (one build), so rebuild once
- Each client has **independent backend JAR** (same binary, different config)
- **No database migration needed** (schema updates via `ddl-auto=update`)
- Restarting takes ~10-15 seconds per service to fully boot

