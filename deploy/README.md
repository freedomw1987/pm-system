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

- Frontend:`http://<server-ip>:80/`
- Backend API:`http://<server-ip>/api/*`(frontend 經 nginx proxy)

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
