# AuthBot

A Discord verification bot with anti-alt detection, VPN blocking, and device fingerprinting.

## Features

- OAuth2 Discord verification flow
- VPN/Proxy detection via VpnApi
- Device fingerprinting to prevent alts
- IP duplicate detection
- Account age requirements
- Blacklist management (users & IPs)
- Auto-kick after failed attempts
- Member pullback (re-add verified users who left)

## Requirements

- [Bun](https://bun.sh) runtime
- PostgreSQL 17
- Discord Bot
- VPNAPI.io API key (free tier: 1000 requests/day)

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/JustBlaxe/DiscordAuthBot.git
   cd authbot
   bun install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Generate an encryption key:

   ```bash
   openssl rand -hex 32
   ```

3. **Discord Developer Portal**

   - Create application at https://discord.com/developers
   - Add redirect URI: `https://yourdomain.com/callback`
   - Copy Bot Token, Client ID, and Client Secret

4. **Discord Server Setup**

   - Ensure bot role is above Member role
   - Copy all IDs to `.env`

## Configuration

| Variable                | Description                              |
| ----------------------- | ---------------------------------------- |
| `DISCORD_TOKEN`         | Bot token                                |
| `DISCORD_CLIENT_ID`     | OAuth2 client ID                         |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret                     |
| `GUILD_ID`              | Server ID                                |
| `REDIRECT_URI`          | OAuth2 callback URL (HTTPS in prod)      |
| `CHANNEL_VERIFY`        | Verification channel ID                  |
| `CHANNEL_LOGS`          | Logs channel ID                          |
| `ROLE_MEMBER`           | Verified member role ID                  |
| `ROLE_ADMIN`            | Admin role ID (for commands)             |
| `DATABASE_URL`          | PostgreSQL connection string             |
| `ENCRYPTION_KEY`        | 32-byte hex key for token encryption     |
| `VPNAPI_KEY`            | VPNAPI.io API key                        |
| `TRUST_PROXY`           | Set `true` if behind reverse proxy       |
| `CORS_ORIGIN`           | Override CORS origin (optional)          |

## Commands

All commands require the Admin role.

| Command                                  | Description                        |
| ---------------------------------------- | ---------------------------------- |
| `/help`                                  | List commands                      |
| `/check <user>`                          | View user's verification data      |
| `/stats`                                 | Verification statistics with graph |
| `/audit`                                 | Recent verification attempts       |
| `/pullback`                              | Re-add verified members who left   |
| `/blacklist add <type> <value> <reason>` | Blacklist user/IP                  |
| `/blacklist remove <value>`              | Remove from blacklist              |
| `/blacklist list`                        | View blacklist                     |

## Production Deployment

1. Use HTTPS (required for Discord OAuth2)
2. Set `TRUST_PROXY=true` if behind nginx/Cloudflare
3. Set `CORS_ORIGIN` to your domain

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name verify.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## License

MIT
