#!/usr/bin/env bash
# =============================================================================
#  PARTIDO SOCIALISTA DE TIMOR (PST) — portal installer for Ubuntu 26.04 LTS
#  "Pelo Progresso, Igualdade"
#
#  Run as root from the project directory on the server:
#
#    sudo DOMAIN=pst.tl CERTBOT_EMAIL=tech@pst.tl ./deploy-ubuntu-26.04.sh
#
#  Safe to re-run: the second run upgrades (rebuilds images, applies new
#  migrations, restarts services) and never overwrites secrets, data or
#  certificates.
#
#  What it does
#    1. Preflight checks (OS, resources, DNS)
#    2. System update, timezone, unattended security upgrades
#    3. Swap file + kernel/network tuning
#    4. Docker Engine + Compose plugin (official Docker repository)
#    5. UFW firewall (SSH, 80/tcp, 443/tcp, 443/udp for HTTP/3)
#    6. Fail2Ban (SSH, nginx rate-limit abuse, login brute force, scanners)
#    7. App files in $APP_DIR, secrets generated into .env.production
#    8. Images built, database migrated and seeded
#    9. Let's Encrypt certificate (HTTP-01 webroot) — by continuing you accept
#       the Let's Encrypt Subscriber Agreement for $CERTBOT_EMAIL
#   10. Stack started and health-checked
#
#  Options (environment variables)
#    DOMAIN            (required) canonical host, e.g. pst.tl
#    DOMAIN_ALIASES    extra hosts redirected to DOMAIN, space/comma separated (default: www.$DOMAIN)
#    CERTBOT_EMAIL     (required unless SKIP_CERTBOT=1) expiry notices
#    APP_DIR           install directory (default /opt/pst-portal)
#    SSH_PORT          SSH port to allow in UFW (default: detected from sshd)
#    SWAP_SIZE         swap file size if none exists (default 2G)
#    CERTBOT_STAGING   1 = use Let's Encrypt staging (testing)
#    SKIP_CERTBOT      1 = keep a self-signed certificate (no public DNS yet)
#    HARDEN_SSH        1 = disable SSH password + root password login
#                          (only if an authorized_keys file exists)
#    SEED_SUPER_ADMIN_PASSWORD  optional; otherwise a one-time password is generated
# =============================================================================

set -Eeuo pipefail
umask 027

# ---------------------------------------------------------------- settings
DOMAIN="${DOMAIN:-}"
DOMAIN_ALIASES="${DOMAIN_ALIASES-www.${DOMAIN}}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
APP_DIR="${APP_DIR:-/opt/pst-portal}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
CERTBOT_STAGING="${CERTBOT_STAGING:-0}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"
HARDEN_SSH="${HARDEN_SSH:-0}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$APP_DIR/.env.production"
COMPOSE=(docker compose --project-directory "$APP_DIR" --env-file "$ENV_FILE")
LOG_FILE="/var/log/pst-deploy.log"

RED=$'\033[0;31m'; GOLD=$'\033[1;33m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
log()  { echo -e "${GOLD}[PST]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${GOLD}[WARN]${NC} $*" >&2; }
die()  { echo -e "${RED}[FAIL]${NC} $*" >&2; exit 1; }
step() { echo; echo -e "${RED}━━━${NC} ${GOLD}★${NC} $* ${RED}━━━${NC}"; }
trap 'die "error on line $LINENO: $BASH_COMMAND (see $LOG_FILE)"' ERR

exec > >(tee -a "$LOG_FILE") 2>&1

cat <<BANNER
${RED}═══════════════════════════════════════════════════════════════════${NC}
${GOLD}   ★  PARTIDO SOCIALISTA DE TIMOR — PORTAL INSTALLER  ★${NC}
${DIM}      Pelo Progresso, Igualdade · Ubuntu 26.04 LTS · $(date -Is)${NC}
${RED}═══════════════════════════════════════════════════════════════════${NC}
BANNER

# =============================================================================
step "1/10 Preflight"
# =============================================================================
[[ $EUID -eq 0 ]] || die "run as root (sudo)"
[[ -n "$DOMAIN" ]] || die "DOMAIN is required, e.g. DOMAIN=pst.tl"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "invalid DOMAIN: $DOMAIN"
[[ "$SKIP_CERTBOT" == "1" || -n "$CERTBOT_EMAIL" ]] || die "CERTBOT_EMAIL is required (or SKIP_CERTBOT=1)"
[[ -f "$SOURCE_DIR/docker-compose.yml" && -f "$SOURCE_DIR/Dockerfile" ]] || die "run this script from the project directory"

# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "Ubuntu required (found ${ID:-unknown})"
[[ "${VERSION_ID:-}" == "26.04" ]] || warn "tested on Ubuntu 26.04 LTS; found ${VERSION_ID:-?} — continuing"
ARCH="$(dpkg --print-architecture)"
[[ "$ARCH" == "amd64" || "$ARCH" == "arm64" ]] || die "unsupported architecture $ARCH"

MEM_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
DISK_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
(( MEM_MB >= 1800 )) || warn "only ${MEM_MB} MB RAM — 4 GB recommended"
(( DISK_GB >= 15 )) || warn "only ${DISK_GB} GB free disk — 40 GB recommended"
ok "Ubuntu ${VERSION_ID} ${ARCH}, ${MEM_MB} MB RAM, ${DISK_GB} GB free"

# Normalise aliases: comma/space separated → space separated, drop empties and the domain itself.
ALIASES="$(echo "$DOMAIN_ALIASES" | tr ',' ' ' | xargs -n1 2>/dev/null | grep -vx "$DOMAIN" | xargs || true)"
SERVER_NAMES="$DOMAIN${ALIASES:+ $ALIASES}"

# SSH port detection. A wrong port here would lock you out once UFW is
# enabled, so the sources are tried from most to least reliable. Every probe
# tolerates failure (set -e + pipefail): on Ubuntu 26.04 sshd is socket-
# activated and `sshd -T` fails when /run/sshd doesn't exist yet.
detect_ssh_port() {
  local p=""
  # 1. The SSH session running this script: "client_ip client_port server_ip server_port".
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    p="$(awk '{print $4}' <<<"$SSH_CONNECTION")"
  fi
  # 2. systemd socket activation (Ubuntu default): Listen=[::]:22 (Stream)
  if [[ -z "$p" ]]; then
    p="$({ systemctl show -p Listen ssh.socket 2>/dev/null || true; } | grep -oE ':[0-9]+ \(Stream\)' | head -1 | tr -dc '0-9' || true)"
  fi
  # 3. Effective sshd configuration.
  if [[ -z "$p" ]]; then
    p="$({ sshd -T 2>/dev/null || true; } | awk '/^port /{print $2; exit}' || true)"
  fi
  # 4. Port directives in the config files.
  if [[ -z "$p" ]]; then
    p="$({ grep -hiE '^[[:space:]]*Port[[:space:]]+[0-9]+' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || true; } | awk '{print $2; exit}' || true)"
  fi
  [[ "$p" =~ ^[0-9]+$ ]] || p=22
  echo "$p"
}

if [[ -z "${SSH_PORT:-}" ]]; then
  SSH_PORT="$(detect_ssh_port)"
fi
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || die "invalid SSH_PORT: $SSH_PORT"
ok "SSH port ${SSH_PORT} will stay open (override with SSH_PORT=…)"

# =============================================================================
step "2/10 System packages & updates"
# =============================================================================
export DEBIAN_FRONTEND=noninteractive
timedatectl set-timezone Asia/Dili || warn "could not set timezone"
apt-get update -y
apt-get -o Dpkg::Options::="--force-confold" upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release openssl git rsync jq dnsutils \
  ufw fail2ban unattended-upgrades apt-listchanges logrotate chrony htop
systemctl enable --now chrony >/dev/null 2>&1 || true

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "security updates install automatically"

# DNS sanity check (non-fatal).
PUBLIC_IP="$(curl -4fsS --max-time 5 https://api.ipify.org || true)"
DNS_IP="$(dig +short A "$DOMAIN" | tail -1 || true)"
if [[ -n "$PUBLIC_IP" && -n "$DNS_IP" && "$PUBLIC_IP" != "$DNS_IP" ]]; then
  warn "$DOMAIN resolves to $DNS_IP but this server is $PUBLIC_IP (fine if behind a proxy/CDN)"
elif [[ -z "$DNS_IP" ]]; then
  warn "$DOMAIN has no A record yet — Let's Encrypt will fail until DNS points here"
else
  ok "DNS: $DOMAIN → $DNS_IP"
fi

# =============================================================================
step "3/10 Swap & kernel tuning"
# =============================================================================
if ! swapon --show | grep -q .; then
  fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$(( ${SWAP_SIZE%G} * 1024 ))
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "swap file ${SWAP_SIZE} created"
else
  ok "swap already active"
fi

cat >/etc/sysctl.d/99-pst.conf <<'EOF'
# PST portal tuning
vm.swappiness = 10
vm.overcommit_memory = 1            # Redis background saves
net.core.somaxconn = 4096
net.core.rmem_max = 7500000         # QUIC / HTTP/3 UDP buffers
net.core.wmem_max = 7500000
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
fs.file-max = 200000
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
EOF
sysctl --system >/dev/null
ok "kernel parameters applied"

# =============================================================================
step "4/10 Docker Engine"
# =============================================================================
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  CODENAME="${VERSION_CODENAME:-$(lsb_release -cs)}"
  # Docker publishes a repo for each Ubuntu release shortly after GA; fall
  # back to 24.04 (noble) packages if 26.04's isn't available yet.
  if ! curl -fsSL --max-time 10 "https://download.docker.com/linux/ubuntu/dists/${CODENAME}/Release" >/dev/null; then
    warn "Docker repo for ${CODENAME} not found — using noble packages"
    CODENAME="noble"
  fi
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true,
  "userland-proxy": false
}
EOF
fi
systemctl enable --now docker >/dev/null
systemctl restart docker
docker compose version >/dev/null || die "docker compose plugin missing"
ok "$(docker --version)"

# =============================================================================
step "5/10 Firewall (UFW)"
# =============================================================================
# Existing rules are kept. Only nginx (host network) listens publicly; the app
# binds to 127.0.0.1 and PostgreSQL/Redis publish no ports at all, so Docker's
# iptables rules cannot bypass UFW for this stack.
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw limit "${SSH_PORT}/tcp" comment 'SSH (rate limited)' >/dev/null
ufw allow 80/tcp  comment 'HTTP (ACME + redirect)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 443/udp comment 'HTTP/3 (QUIC)' >/dev/null
ufw --force enable >/dev/null
ok "UFW active: ${SSH_PORT}/tcp, 80/tcp, 443/tcp, 443/udp"

# =============================================================================
step "6/10 Fail2Ban"
# =============================================================================
NGINX_LOG_DIR="$APP_DIR/data/nginx-logs"
mkdir -p "$NGINX_LOG_DIR"
touch "$NGINX_LOG_DIR/access.log" "$NGINX_LOG_DIR/error.log"

cat >/etc/fail2ban/filter.d/pst-auth.conf <<'EOF'
# Repeated failed backoffice logins / 2FA / password-reset attempts.
# Fail2Ban strips the timestamp before matching, hence the empty \[\].
[Definition]
failregex = ^<HOST> - \[\] "POST /api/auth/(login|2fa/verify|password/forgot|password/reset) HTTP/[0-9.]+" (401|423|429)
ignoreregex =
EOF

cat >/etc/fail2ban/filter.d/pst-scanner.conf <<'EOF'
# Vulnerability scanners probing for software we don't run.
[Definition]
failregex = ^<HOST> - \[\] "(GET|POST|HEAD) /(wp-login\.php|wp-admin|xmlrpc\.php|\.env|\.git/|phpmyadmin|pma/|vendor/phpunit|cgi-bin/|boaform|HNAP1)[^"]*" \d{3}
ignoreregex =
EOF

cat >/etc/fail2ban/jail.d/pst.local <<EOF
[DEFAULT]
banaction = ufw
banaction_allports = ufw
bantime  = 1h
findtime = 10m
maxretry = 5
bantime.increment = true
bantime.maxtime = 1w
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled  = true
port     = ${SSH_PORT}
backend  = systemd

[pst-nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = ${NGINX_LOG_DIR}/error.log
maxretry = 20
findtime = 2m
bantime  = 30m

[pst-auth]
enabled  = true
filter   = pst-auth
logpath  = ${NGINX_LOG_DIR}/access.log
maxretry = 10
findtime = 15m
bantime  = 2h

[pst-scanner]
enabled  = true
filter   = pst-scanner
logpath  = ${NGINX_LOG_DIR}/access.log
maxretry = 3
findtime = 10m
bantime  = 24h
EOF

cat >/etc/logrotate.d/pst-nginx <<EOF
${NGINX_LOG_DIR}/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

systemctl enable fail2ban >/dev/null
systemctl restart fail2ban
ok "Fail2Ban jails: $(fail2ban-client status 2>/dev/null | awk -F: '/Jail list/{print $2}' | xargs)"

if [[ "$HARDEN_SSH" == "1" ]]; then
  if compgen -G "/root/.ssh/authorized_keys" >/dev/null || compgen -G "/home/*/.ssh/authorized_keys" >/dev/null; then
    cat >/etc/ssh/sshd_config.d/90-pst-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
EOF
    sshd -t && systemctl reload ssh
    ok "SSH: key-only authentication"
  else
    warn "HARDEN_SSH=1 ignored: no authorized_keys found (would lock you out)"
  fi
fi

# =============================================================================
step "7/10 Application files & secrets"
# =============================================================================
mkdir -p "$APP_DIR"
if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.next/' --exclude 'src/generated/' \
    --exclude 'data/' --exclude 'storage/' --exclude 'legacy/' \
    --exclude '.env' --exclude '.env.production' --exclude '*.rar' --exclude '*.zip' \
    "$SOURCE_DIR/" "$APP_DIR/"
  ok "source synced to $APP_DIR"
fi
mkdir -p "$APP_DIR/data/letsencrypt" "$APP_DIR/data/certbot-www" "$APP_DIR/data/backups" "$NGINX_LOG_DIR"
chmod 700 "$APP_DIR/data/backups" "$APP_DIR/data/letsencrypt"
chmod 755 "$APP_DIR"/docker/postgres/init/*.sh 2>/dev/null || true

rand_hex() { openssl rand -hex "$1"; }
rand_b64() { openssl rand -base64 "$1" | tr -d '\n'; }

# set_env KEY VALUE — replace or append KEY=VALUE in the env file.
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    KEY="$key" VALUE="$value" awk 'BEGIN{k=ENVIRON["KEY"]; v=ENVIRON["VALUE"]} $0 ~ "^"k"=" {print k"="v; next} {print}' \
      "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
# Missing keys return "" (exit 0) so `set -e` + pipefail never abort on a lookup.
get_env() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
# only_if_empty KEY VALUE — never overwrite an existing secret.
only_if_empty() { [[ -n "$(get_env "$1")" ]] || set_env "$1" "$2"; }

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  log "creating $ENV_FILE with fresh secrets"
fi
chmod 600 "$ENV_FILE"

only_if_empty POSTGRES_PASSWORD "$(rand_hex 24)"
only_if_empty APP_DB_PASSWORD   "$(rand_hex 24)"
only_if_empty REDIS_PASSWORD    "$(rand_hex 24)"
only_if_empty AUTH_SECRET       "$(rand_b64 48)"
only_if_empty DATA_ENCRYPTION_KEY "$(rand_b64 32)"
only_if_empty BLIND_INDEX_KEY   "$(rand_b64 32)"
only_if_empty HEALTHCHECK_TOKEN "$(rand_hex 24)"
only_if_empty TELEGRAM_WEBHOOK_SECRET "$(rand_hex 24)"
if [[ -z "$(get_env KTA_SIGNING_PRIVATE_KEY)" ]]; then
  KEY_TMP="$(mktemp -d)"
  openssl genpkey -algorithm ed25519 -out "$KEY_TMP/kta.pem" 2>/dev/null
  openssl pkey -in "$KEY_TMP/kta.pem" -pubout -out "$KEY_TMP/kta.pub.pem"
  set_env KTA_SIGNING_KEY_ID "kta-$(date +%Y)-1"
  set_env KTA_SIGNING_PRIVATE_KEY "\"$(awk 'BEGIN{ORS="\\n"} {print}' "$KEY_TMP/kta.pem")\""
  set_env KTA_SIGNING_PUBLIC_KEY "\"$(awk 'BEGIN{ORS="\\n"} {print}' "$KEY_TMP/kta.pub.pem")\""
  # Offline copy of the signing key — move it somewhere safe and delete it here.
  install -m 600 "$KEY_TMP/kta.pem" "/root/pst-kta-signing-key-$(date +%Y%m%d).pem"
  rm -rf "$KEY_TMP"
  warn "KTA signing key backup: /root/pst-kta-signing-key-*.pem — store it offline, then delete it"
fi

# Values derived from the domain / passwords (always refreshed).
POSTGRES_USER_V="$(get_env POSTGRES_USER)"; POSTGRES_USER_V="${POSTGRES_USER_V:-pst_owner}"
POSTGRES_DB_V="$(get_env POSTGRES_DB)";     POSTGRES_DB_V="${POSTGRES_DB_V:-pst}"
APP_DB_USER_V="$(get_env APP_DB_USER)";     APP_DB_USER_V="${APP_DB_USER_V:-pst_app}"
set_env NODE_ENV production
set_env DOMAIN "$DOMAIN"
set_env DOMAIN_ALIASES "$(echo "$ALIASES" | tr ' ' ',')"
set_env NGINX_SERVER_NAMES "\"$SERVER_NAMES\""
set_env NGINX_UPSTREAM "127.0.0.1:3000"
set_env APP_URL "https://$DOMAIN"
set_env NEXT_PUBLIC_APP_URL "https://$DOMAIN"
set_env ADMIN_URL "https://$DOMAIN/admin"
set_env KTA_VERIFY_URL "https://$DOMAIN/verify"
set_env STORAGE_DRIVER local
set_env STORAGE_LOCAL_PATH /app/storage
set_env STORAGE_PUBLIC_BASE_URL "https://$DOMAIN/media"
set_env TRUST_PROXY true
set_env SESSION_COOKIE_NAME "__Host-pst_session"
[[ -n "$CERTBOT_EMAIL" ]] && set_env CERTBOT_EMAIL "$CERTBOT_EMAIL"
set_env POSTGRES_USER "$POSTGRES_USER_V"
set_env POSTGRES_DB "$POSTGRES_DB_V"
set_env APP_DB_USER "$APP_DB_USER_V"
set_env DATABASE_URL "postgresql://${APP_DB_USER_V}:$(get_env APP_DB_PASSWORD)@postgres:5432/${POSTGRES_DB_V}?schema=public"
set_env MIGRATE_DATABASE_URL "postgresql://${POSTGRES_USER_V}:$(get_env POSTGRES_PASSWORD)@postgres:5432/${POSTGRES_DB_V}?schema=public"
set_env REDIS_URL "redis://:$(get_env REDIS_PASSWORD)@redis:6379/0"
[[ -n "${SEED_SUPER_ADMIN_PASSWORD:-}" ]] && set_env SEED_SUPER_ADMIN_PASSWORD "$SEED_SUPER_ADMIN_PASSWORD"
set_env SEED_SUPER_ADMIN_RESET false
chmod 600 "$ENV_FILE"
ok "secrets in $ENV_FILE (mode 600)"

# =============================================================================
step "8/10 Build, database migrations & seed"
# =============================================================================
cd "$APP_DIR"
"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d postgres redis
"${COMPOSE[@]}" run --rm migrate
ok "database migrated"

SEED_MARKER="$APP_DIR/data/.seeded"
if [[ ! -f "$SEED_MARKER" ]]; then
  SEED_OUT="$("${COMPOSE[@]}" run --rm migrate npx prisma db seed 2>&1)" || { echo "$SEED_OUT"; die "seed failed"; }
  echo "$SEED_OUT" | grep -E '^\[seed\]' || true
  if echo "$SEED_OUT" | grep -q "ONE-TIME SUPER ADMIN PASSWORD"; then
    echo "$SEED_OUT" | sed -n '/ONE-TIME SUPER ADMIN PASSWORD/,/====/p' > /root/pst-initial-admin.txt
    chmod 600 /root/pst-initial-admin.txt
  fi
  date -Is > "$SEED_MARKER"
  ok "database seeded (municípios, postos, categories, super admin)"
else
  ok "seed already applied on $(cat "$SEED_MARKER")"
fi

# =============================================================================
step "9/10 TLS certificate"
# =============================================================================
LE_LIVE="$APP_DIR/data/letsencrypt/live/$DOMAIN"
is_real_cert() { [[ -f "$LE_LIVE/fullchain.pem" ]] && ! openssl x509 -in "$LE_LIVE/fullchain.pem" -noout -issuer | grep -q "PST bootstrap"; }

if ! [[ -f "$LE_LIVE/fullchain.pem" ]]; then
  # Self-signed placeholder so nginx can start and answer the ACME challenge.
  mkdir -p "$LE_LIVE"
  openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -days 30 \
    -keyout "$LE_LIVE/privkey.pem" -out "$LE_LIVE/fullchain.pem" \
    -subj "/CN=$DOMAIN/O=PST bootstrap" >/dev/null 2>&1
  ok "temporary self-signed certificate created"
fi

"${COMPOSE[@]}" up -d app nginx

if [[ "$SKIP_CERTBOT" != "1" ]] && ! is_real_cert; then
  log "requesting Let's Encrypt certificate for: $SERVER_NAMES"
  DOMAIN_ARGS=(); for n in $SERVER_NAMES; do DOMAIN_ARGS+=(-d "$n"); done
  STAGING_ARG=(); [[ "$CERTBOT_STAGING" == "1" ]] && STAGING_ARG=(--staging)
  # certbot refuses to write into a live/ dir it didn't create: remove the placeholder first.
  # nginx keeps the placeholder loaded in memory until the reload below.
  rm -rf "$LE_LIVE" "$APP_DIR/data/letsencrypt/archive/$DOMAIN" "$APP_DIR/data/letsencrypt/renewal/$DOMAIN.conf"
  if "${COMPOSE[@]}" run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
       "${DOMAIN_ARGS[@]}" "${STAGING_ARG[@]}" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email \
       --key-type ecdsa --non-interactive; then
    ok "certificate issued"
  else
    warn "Let's Encrypt failed (DNS? port 80 blocked?) — restoring self-signed certificate"
    mkdir -p "$LE_LIVE"
    openssl req -x509 -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -days 30 \
      -keyout "$LE_LIVE/privkey.pem" -out "$LE_LIVE/fullchain.pem" -subj "/CN=$DOMAIN/O=PST bootstrap" >/dev/null 2>&1
    warn "re-run this script once DNS points to this server"
  fi
  "${COMPOSE[@]}" exec -T nginx nginx -s reload
fi

# =============================================================================
step "10/10 Start & verify"
# =============================================================================
"${COMPOSE[@]}" up -d --remove-orphans
"${COMPOSE[@]}" exec -T nginx nginx -t -q
"${COMPOSE[@]}" exec -T nginx nginx -s reload

for i in $(seq 1 30); do
  if curl -fsS --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" -k "https://$DOMAIN/api/health" | grep -q '"ok"'; then
    ok "health check passed (https://$DOMAIN/api/health)"
    break
  fi
  [[ $i -eq 30 ]] && { "${COMPOSE[@]}" ps; die "app not healthy — check: docker compose logs app"; }
  sleep 4
done
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
docker image prune -f >/dev/null 2>&1 || true

cat <<DONE

${GREEN}═══════════════════════════════════════════════════════════════════${NC}
${GOLD}  ★ PST portal is live: https://${DOMAIN}${NC}
${GREEN}═══════════════════════════════════════════════════════════════════${NC}
  Backoffice      https://${DOMAIN}/admin
  Admin account   $(get_env SEED_SUPER_ADMIN_EMAIL || echo admin@pst.tl)
$( [[ -f /root/pst-initial-admin.txt ]] && echo "  One-time pass   see /root/pst-initial-admin.txt (delete it after first login)" )
  Secrets         ${ENV_FILE}  (back it up offline — losing DATA_ENCRYPTION_KEY
                  makes encrypted ID numbers unreadable)
  Backups         ${APP_DIR}/data/backups  (nightly ${DIM}$(get_env BACKUP_SCHEDULE)${NC}) — copy off-site!

  Next steps
   1. Sign in, change the password, enrol 2FA, store the recovery codes.
   2. Telegram alerts: set TELEGRAM_ENABLED=true, TELEGRAM_BOT_TOKEN and
      TELEGRAM_ADMIN_CHAT_ID in ${ENV_FILE}, then re-run this script. Optional bot commands:
      curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \\
        -d url=https://${DOMAIN}/api/telegram/webhook -d secret_token=$(get_env TELEGRAM_WEBHOOK_SECRET)
   3. E-mail: set SMTP_* in ${ENV_FILE} and re-run.
   4. Encrypted backups: set BACKUP_ENCRYPTION_PUBLIC_KEY (age1…) and re-run.

  Useful commands (from ${APP_DIR})
   docker compose --env-file .env.production ps | logs -f app | restart app
   docker compose --env-file .env.production exec backup pg-backup      # backup now
   sudo fail2ban-client status pst-auth                                  # banned IPs
DONE
