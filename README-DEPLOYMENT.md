# Deployment Guide - Raspberry Pi Hosting

This guide will help you host the Shred game on a Raspberry Pi 4 and make it accessible from the internet.

## Prerequisites

- Raspberry Pi 4 (or similar)
- Raspberry Pi OS installed
- Internet connection
- Router access (for port forwarding)

## Quick Setup

1. **Clone/Copy the project to your Raspberry Pi**
   ```bash
   cd ~
   git clone <your-repo-url> shred
   cd shred
   ```

2. **Run the setup script**
   ```bash
   chmod +x setup-pi.sh
   ./setup-pi.sh
   ```

3. **Edit environment variables**
   ```bash
   nano .env
   ```
   Set `VITE_SERVER_URL` to your public IP or domain:
   ```
   VITE_SERVER_URL=http://your-ip-address:3001
   ```

4. **Rebuild client with new URL**
   ```bash
   ./build-and-start.sh
   ```

## Manual Setup Steps

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install PM2

```bash
sudo npm install -g pm2
```

### 3. Install Project Dependencies

```bash
npm install
```

### 4. Build the Client

```bash
npm run build
```

### 5. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
nano .env
```

Set `VITE_SERVER_URL` to your public URL/IP before building.

### 6. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start on boot
```

## Making It Accessible from Internet

### Option 1: Direct Port Forwarding (Simplest)

1. **Find your Raspberry Pi's local IP**
   ```bash
   hostname -I
   ```

2. **Configure router port forwarding**
   - Log into your router admin panel
   - Forward external port 3001 to your Pi's IP on port 3001
   - Or use a different external port (e.g., 80) and forward to Pi's 3001

3. **Find your public IP**
   ```bash
   curl ifconfig.me
   ```

4. **Update VITE_SERVER_URL**
   ```bash
   # Edit .env
   VITE_SERVER_URL=http://your-public-ip:3001
   
   # Rebuild
   npm run build
   pm2 restart shred
   ```

### Option 2: Dynamic DNS (Recommended for Dynamic IPs)

1. **Set up DuckDNS** (free)
   - Go to https://www.duckdns.org/
   - Create account and domain (e.g., `myshred.duckdns.org`)
   - Install DuckDNS updater on Pi:
     ```bash
     sudo apt-get install curl
     mkdir ~/duckdns
     cd ~/duckdns
     echo 'echo url="https://www.duckdns.org/update?domains=YOUR_DOMAIN&token=YOUR_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -' > duck.sh
     chmod +x duck.sh
     ```
   - Add to crontab (updates every 5 minutes):
     ```bash
     crontab -e
     # Add: */5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
     ```

2. **Update VITE_SERVER_URL**
   ```bash
   VITE_SERVER_URL=https://myshred.duckdns.org
   npm run build
   pm2 restart shred
   ```

### Option 3: Nginx Reverse Proxy with HTTPS (Most Secure)

1. **Install Nginx**
   ```bash
   sudo apt-get install nginx
   ```

2. **Install Certbot** (for Let's Encrypt SSL)
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   ```

3. **Configure Nginx**
   ```bash
   sudo cp nginx/shred.conf /etc/nginx/sites-available/shred
   sudo nano /etc/nginx/sites-available/shred
   # Edit server_name to your domain
   
   sudo ln -s /etc/nginx/sites-available/shred /etc/nginx/sites-enabled/
   sudo nginx -t  # Test configuration
   sudo systemctl reload nginx
   ```

4. **Get SSL Certificate**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

5. **Update VITE_SERVER_URL**
   ```bash
   VITE_SERVER_URL=https://your-domain.com
   npm run build
   pm2 restart shred
   ```

## PM2 Management Commands

```bash
pm2 status              # Check server status
pm2 logs shred          # View logs
pm2 logs shred --lines 100  # Last 100 lines
pm2 restart shred       # Restart server
pm2 stop shred          # Stop server
pm2 start shred         # Start server
pm2 monit               # Monitor resources
```

## Troubleshooting

### Server won't start
- Check logs: `pm2 logs shred`
- Verify Node.js version: `node --version` (should be 18+)
- Check if port 3001 is available: `sudo netstat -tulpn | grep 3001`

### Can't access from internet
- Check firewall: `sudo ufw status`
- Allow port: `sudo ufw allow 3001`
- Verify port forwarding on router
- Test locally first: `curl http://localhost:3001`

### Client can't connect
- Verify `VITE_SERVER_URL` in `.env` matches your public URL
- Rebuild client: `npm run build`
- Check browser console for connection errors
- Verify CORS settings in server.js

### High memory usage
- PM2 is configured to restart at 500MB
- Check memory: `pm2 monit`
- Consider reducing max players or optimizing assets

## Security Considerations

1. **Firewall**: Only expose necessary ports
   ```bash
   sudo ufw allow 22    # SSH
   sudo ufw allow 3001   # Game server (or 80/443 if using Nginx)
   sudo ufw enable
   ```

2. **Keep system updated**
   ```bash
   sudo apt-get update && sudo apt-get upgrade
   ```

3. **Use HTTPS**: Always use HTTPS in production (Nginx + Let's Encrypt)

4. **Change default passwords**: If SSH is exposed, use key-based auth

## Performance Tips

- Raspberry Pi 4 can handle 4-8 concurrent players comfortably
- Monitor CPU/memory: `pm2 monit`
- Consider overclocking Pi if needed (with proper cooling)
- Use wired Ethernet for better network performance

## Updating the Game

```bash
git pull                    # Pull latest changes
npm install                 # Update dependencies
npm run build              # Rebuild client
pm2 restart shred          # Restart server
```

## Support

For issues, check:
- PM2 logs: `pm2 logs shred`
- Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- System logs: `journalctl -u nginx`

