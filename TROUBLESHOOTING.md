# Troubleshooting: Router Login Page Instead of Game

If accessing your domain (https://shredgame.duckdns.org) shows your router's login page, follow these steps:

## Problem Diagnosis

This happens when:
1. Port forwarding isn't configured for HTTPS (port 443)
2. Your router's admin interface uses HTTPS on port 443
3. The router intercepts external HTTPS connections

## Solution Steps

### Step 1: Test HTTP First (Port 80)

Try accessing your game via HTTP instead of HTTPS:
```
http://shredgame.duckdns.org
```

If this works, the issue is specifically with HTTPS port forwarding.

### Step 2: Check Port Forwarding Configuration

Log into your router admin panel and verify:

1. **Port 80 (HTTP) forwarding:**
   - External Port: 80
   - Internal IP: Your Raspberry Pi's IP (e.g., 192.168.1.100)
   - Internal Port: 80 (if using Nginx) or 3001 (if direct)

2. **Port 443 (HTTPS) forwarding:**
   - External Port: 443
   - Internal IP: Your Raspberry Pi's IP
   - Internal Port: 443 (if using Nginx) or 3001 (if direct)

### Step 3: Disable Router's HTTPS Admin Access

Many routers intercept HTTPS traffic. You need to:

1. **Change router admin HTTPS port:**
   - In router settings, find "Remote Management" or "Admin Access"
   - Change HTTPS admin port from 443 to something else (e.g., 8443, 4443)
   - Save and restart router

2. **Or disable HTTPS admin access:**
   - Disable "Remote Management via HTTPS"
   - Keep only HTTP admin access (usually on port 80 internally)

### Step 4: Verify Server is Running

On your Raspberry Pi, check:

```bash
# Check if server is running
pm2 status

# Check if Nginx is running (if using it)
sudo systemctl status nginx

# Check if ports are listening
sudo netstat -tulpn | grep -E ':(80|443|3001)'
```

### Step 5: Test Locally First

Before testing externally:

```bash
# Test HTTP locally
curl http://localhost:3001

# Test HTTPS locally (if Nginx is configured)
curl https://localhost:443
```

### Step 6: Check Firewall

Ensure firewall allows the ports:

```bash
# Check firewall status
sudo ufw status

# Allow ports if needed
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp
```

### Step 7: Alternative Solutions

#### Option A: Use HTTP Only (Temporary)

If HTTPS is problematic, use HTTP temporarily:

1. Update Nginx config to not redirect HTTP to HTTPS
2. Access via `http://shredgame.duckdns.org`
3. Update `VITE_SERVER_URL` to use HTTP

#### Option B: Use Non-Standard HTTPS Port

Forward a different external port for HTTPS:

1. Forward external port 8443 → internal port 443
2. Access via `https://shredgame.duckdns.org:8443`
3. Update Nginx to listen on 443 internally

#### Option C: Direct Port Access (Bypass Nginx)

If Nginx is causing issues, access directly:

1. Forward external port 3001 → internal port 3001
2. Access via `http://shredgame.duckdns.org:3001`
3. Update `VITE_SERVER_URL` accordingly

### Step 8: Router-Specific Settings

Common router settings to check:

- **"Remote Management"** - Should be disabled or use different port
- **"Port Forwarding"** or **"Virtual Server"** - Configure ports 80 and 443
- **"Firewall Rules"** - Ensure ports aren't blocked
- **"DMZ"** - Don't use DMZ (security risk), use port forwarding instead

### Step 9: Verify DuckDNS

Ensure DuckDNS is pointing to your public IP:

```bash
# Check your public IP
curl ifconfig.me

# Verify DuckDNS is updated
curl "https://www.duckdns.org/update?domains=shredgame&token=YOUR_TOKEN&ip="
```

## Quick Test Checklist

- [ ] Server running on Pi? (`pm2 status`)
- [ ] Port forwarding configured for 80 and 443?
- [ ] Router HTTPS admin disabled or on different port?
- [ ] Firewall allows ports?
- [ ] Can access locally? (`curl http://localhost:3001`)
- [ ] DuckDNS pointing to correct IP?
- [ ] Try HTTP first: `http://shredgame.duckdns.org`

## Still Not Working?

1. **Check router logs** - Look for blocked/redirected connections
2. **Try direct IP access** - `http://YOUR_PUBLIC_IP:3001` (bypasses DNS)
3. **Check ISP restrictions** - Some ISPs block port 80/443
4. **Use port 3001 directly** - Forward 3001→3001 and access via `http://shredgame.duckdns.org:3001`

