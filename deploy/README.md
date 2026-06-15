# PM-System 客戶交付 Package

呢個 folder 係俾客戶嘅 release package。**客戶只需要跑 `install.sh`**。

## 客戶機安裝(3 步)

```bash
# 1. 解壓或者抄晒成個 folder 去客戶機
tar xzf pm-system-release-v1.0.0.tar.gz
cd pm-system-release-v1.0.0

# 2. (可選)改 .env(預設已經 auto-generate 一啲 default,想自己控制可以改)
cp .env.client.example .env
$EDITOR .env
# 必填:
#   VERSION=v1.0.0
#   DB_PASSWORD=<強密碼>
#   JWT_SECRET=$(openssl rand -hex 32)

# 3. 安裝
chmod +x install.sh
./install.sh
```

## 客戶有咩用?(30 秒版)

| 動作 | 命令 |
|------|------|
| 睇 status | `docker compose -p pm-system ps` |
| 睇 logs | `docker compose -p pm-system logs -f` |
| 重啟 | `docker compose -p pm-system restart` |
| 停機(保留 data) | `docker compose -p pm-system down` |
| 連 database | `docker exec -it pm-system-db psql -U pmuser -d pmdb` |
| 完整清除(含 data) | `docker compose -p pm-system down -v` |

## 訪問

- Frontend:`https://<server-ip>/`
- Backend API:`https://<server-ip>/api/*`(frontend 經 nginx proxy)
- HTTP 訪問 (`http://<server-ip>/`) 會自動 301 redirect 去 HTTPS

### 用非標準 port 部署(80/443 用唔到)

如果 server 嘅 80/443 已經俾其他 service 佔咗,或者冇 root 唔識 bind
privileged port,可以將 host port map 走:

```bash
# .env
FRONTEND_HOST_PORT=8888       # host → container 80
FRONTEND_HTTPS_HOST_PORT=8443 # host → container 443
```

之後訪問:
- `http://<server-ip>:8888/` → 自動 301 → `https://<server-ip>:8443/`
- `https://<server-ip>:8443/` → frontend
- `https://<server-ip>:8443/api/*` → backend API

**Cert 影響**:用非標準 port 之後,Let's Encrypt **HTTP-01 challenge**
(`certbot --standalone`) 唔可以再用(需要 port 80 inbound)。要用
**DNS-01 challenge**(下面 "用 domain 點部署?" 嗰節有完整步驟)。

### HTTPS / 憑證

客戶機用 self-signed TLS cert 嚟提供 HTTPS,原因係:
- 客戶機用 **IP** 直接訪問,冇 domain → 用唔到 Let's Encrypt
- 冇 HTTPS 嘅話,瀏覽器會當係 insecure context,Web Crypto API(`crypto.randomUUID` 等)會 fail,chat 功能就壞咗
- 自簽 cert 雖然會彈一次性「連線不安全」警告,但裝完 HSTS 之後就唔會再煩

#### 第一次訪問會見到咩?

```
⚠ Your connection is not private
  Attackers might be trying to steal your information from <server-ip>
  [Advanced] ← 撳呢個
    [Proceed to <server-ip> (unsafe)] ← 再撳呢個就見到 site
```

**撳咗之後**瀏覽器會記住(HSTS),**之後訪問同一個 IP 唔會再問**。

#### 換咗 server IP 點算?

```bash
cd <release-folder>
bash deploy/regen-cert.sh        # 重簽 cert 包含新 IP
docker compose -p pm-system restart frontend
```

#### 查睇 cert 詳情

```bash
openssl x509 -in docker/certs/server.crt -noout -subject -dates -ext subjectAltName
```

#### 用 domain 點部署?

兩個選項:

**A. Let's Encrypt(推薦,免費、真 cert,瀏覽器自動 trust)**

```bash
# 1. 裝 certbot(如果未裝)
sudo apt install certbot
```

**Step 2a — 預設 port (80/443 free):**

```bash
# 需要 port 80 暫時 free
docker compose -p pm-system down
sudo certbot certonly --standalone -d pm.david-developer.com
docker compose -p pm-system up -d
```

**Step 2b — 非標準 port (80/443 用唔到, e.g. 8888/8443):**

用 **DNS-01 challenge**,完全唔需要 bind 任何 port。配對你 registrar 嘅 plugin:

```bash
# Cloudflare 為例
sudo apt install certbot python3-certbot-dns-cloudflare

# API token 放喺呢度 (chmod 600)
echo "dns_cloudflare_api_token=YOUR_TOKEN" | sudo tee /etc/letsencrypt/cloudflare.ini
sudo chmod 600 /etc/letsencrypt/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 20 \
  -d pm.david-developer.com
```

其他 registrar 對應 plugin:`python3-certbot-dns-route53`(AWS)、
`python3-certbot-dns-godaddy`、`python3-certbot-dns-gandi`、
`python3-certbot-dns-digitalocean` 等。詳情見 certbot 文檔。

**Step 3-4 — 兩種 port 都一樣:**

```bash
# 3. 設 .env 嘅 DOMAIN
echo "DOMAIN=pm.david-developer.com" >> .env

# 4. 重新 sync cert 入 docker volume
bash deploy/regen-cert.sh
docker compose -p pm-system restart frontend
```

之後 certbot 90 日會自動 renew。renew 完之後跑一次:
```bash
bash deploy/regen-cert.sh && docker compose -p pm-system restart frontend
```

想全自動可以加落 `/etc/letsencrypt/renewal-hooks/deploy/`:
```bash
#!/bin/bash
cd /path/to/release-folder
bash deploy/regen-cert.sh
docker compose -p pm-system restart frontend
```

**B. Self-signed + 接受瀏覽器警告**

加落 `.env`:
```
EXTRA_SAN_DNS=pm.example.com
```

然後 `bash deploy/install.sh` 就會將個 domain 都簽入 cert。第一次訪問會見到「連線不安全」警告,撳進階 → 繼續前往就見到 site。

## 更新(之後每個 release)

1. 我哋 build 新 `v1.1.0.tar` 寄畀你
2. 客戶機:
   ```bash
   # 載入新 image
   docker load -i pm-system-frontend-v1.1.0.tar
   docker load -i pm-system-backend-v1.1.0-multiarch.tar
   # 改 .env VERSION=v1.1.0
   # 重啟
   docker compose -p pm-system up -d
   ```

Database migrations 會自動跑(`prisma migrate deploy` 入面 command 寫咗)。

## 出事點算?

- **Backend 起唔到**:睇 `docker compose -p pm-system logs backend`
- **Frontend 見唔到**:睇 `docker compose -p pm-system logs frontend`
- **Database 連唔到**:睇 `docker compose -p pm-system logs db`, 再 `docker exec -it pm-system-db pg_isready -U pmuser`
- **要 reset password**:改 `.env` DB_PASSWORD,再 `docker compose -p pm-system up -d`(會自動 recreate db container)
