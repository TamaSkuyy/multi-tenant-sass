#!/usr/bin/env bash
#
# develop.sh — siapkan & jalankan environment dev multi-tenant-sass
# (Postgres + API Express + client Next.js).
#
#   ./develop.sh                Postgres + deps + migrate + seed + API + client
#   ./develop.sh --db-only      berhenti setelah DB siap & di-seed
#   ./develop.sh --api-only     hanya API (client tidak dijalankan)
#   ./develop.sh --client-only  hanya client Next.js (Postgres & API dilewati)
#   ./develop.sh --no-seed      lewati seeding template
#   ./develop.sh --no-install   lewati npm ci/install
#   ./develop.sh --reset-db     HAPUS container + volume Postgres (semua data)
#   ./develop.sh --help         tampilkan bantuan ini
#
# Port: API dari api/.env (PORT, default 8080); client dari CLIENT_PORT (default 3000).
# Contoh: CLIENT_PORT=3001 ./develop.sh
#
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/api"
CLIENT_DIR="$ROOT_DIR/client"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
LOG_DIR="$ROOT_DIR/.dev-logs"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

API_PORT_DEFAULT=8080
CLIENT_PORT="${CLIENT_PORT:-3000}"
# Override lewat environment: `API_PORT=8090 ./develop.sh` (tanpa mengubah api/.env)
API_PORT_OVERRIDE="${API_PORT:-}"
SERVERS_STARTED=0

RUN_SEED=1
RUN_INSTALL=1
RESET_DB=0
RUN_DB=1
RUN_API=1
RUN_CLIENT=1

# ---------------------------------------------------------------- util
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[1;34m'; C_OK=$'\033[1;32m'
  C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_DIM=''
fi

log()  { printf '%s[develop]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
step() { printf '\n%s[develop]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$C_OK" "$C_RESET" "$*"; }
info() { printf '%s  ·%s %s\n' "$C_DIM" "$C_RESET" "$*"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_RESET" >&2; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_RESET" >&2; exit 1; }

trap 'die "Gagal di baris $LINENO. Lihat pesan di atas."' ERR

usage() { sed -n '3,16p' "$0" | sed -e 's/^#\{1,\} \{0,1\}//' -e '/^$/d'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only)     RUN_API=0; RUN_CLIENT=0 ;;
    --api-only)    RUN_CLIENT=0 ;;
    --client-only) RUN_DB=0; RUN_API=0 ;;
    --no-seed)     RUN_SEED=0 ;;
    --no-install)  RUN_INSTALL=0 ;;
    --reset-db)    RESET_DB=1 ;;
    -h|--help)     usage; exit 0 ;;
    *)             die "Opsi tidak dikenal: '$1' (pakai --help)" ;;
  esac
  shift
done

# ---------------------------------------------------------------- preflight
command -v node >/dev/null 2>&1 || die "node tidak ditemukan di PATH."

if [[ "$RUN_DB" == 1 ]]; then
  command -v docker >/dev/null 2>&1 || die "docker tidak ditemukan di PATH."
  docker compose version >/dev/null 2>&1 || die "'docker compose' v2 tidak tersedia."
  [[ -f "$COMPOSE_FILE" ]] || die "docker-compose.yml tidak ditemukan di $ROOT_DIR"
fi

[[ "$RUN_API" == 1 || "$RUN_CLIENT" == 1 || "$RUN_DB" == 1 ]] || die "Tidak ada yang dijalankan."

if [[ "$RUN_DB" == 1 || "$RUN_API" == 1 ]]; then
  [[ -d "$API_DIR" ]] || die "folder api/ tidak ditemukan di $ROOT_DIR"
fi
if [[ "$RUN_CLIENT" == 1 ]]; then
  [[ -d "$CLIENT_DIR" ]] || die "folder client/ tidak ditemukan di $ROOT_DIR"
fi

# -E di set di atas + die eksplisit di sini: trap ERR sendiri tidak menyala
# untuk kegagalan di dalam subshell, jadi jangan bergantung padanya.
in_api()    { ( cd "$API_DIR"    && trap - ERR && "$@" ) || die "Perintah gagal di api/: $*"; }
in_client() { ( cd "$CLIENT_DIR" && trap - ERR && "$@" ) || die "Perintah gagal di client/: $*"; }

install_deps() {
  local dir="$1" label="$2"
  if [[ "$RUN_INSTALL" == 0 ]]; then
    info "$label: --no-install, dilewati."
  elif [[ -d "$dir/node_modules" ]]; then
    ok "$label: node_modules sudah ada — dilewati."
  elif [[ -f "$dir/package-lock.json" ]]; then
    ( cd "$dir" && trap - ERR && npm ci --no-audit --no-fund ) || die "$label: npm ci gagal."
    ok "$label: npm ci selesai."
  else
    ( cd "$dir" && trap - ERR && npm install --no-audit --no-fund ) || die "$label: npm install gagal."
    ok "$label: npm install selesai."
  fi
}

# ---------------------------------------------------------------- Postgres
if [[ "$RUN_DB" == 1 ]]; then
  step "Postgres"

  if [[ "$RESET_DB" == 1 ]]; then
    warn "--reset-db: menghapus container DAN volume Postgres (semua data hilang)."
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi

  "${COMPOSE[@]}" up -d

  CID="$("${COMPOSE[@]}" ps -q postgres)"
  [[ -n "$CID" ]] || die "Container postgres tidak berjalan. Cek: docker compose logs postgres"

  printf '  %smenunggu Postgres sehat' "$C_DIM"
  STATUS=""
  for _ in $(seq 1 60); do
    STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CID" 2>/dev/null || echo unknown)"
    [[ "$STATUS" == "healthy" || "$STATUS" == "none" ]] && break
    printf '.'
    sleep 2
  done
  printf '%s\n' "$C_RESET"

  case "$STATUS" in
    healthy) ok "Postgres sehat." ;;
    none)    warn "Container tanpa healthcheck — melanjutkan dengan asumsi siap." ;;
    *)       die "Postgres tidak sehat setelah 120 detik (status: $STATUS). Cek: docker compose logs postgres" ;;
  esac
fi

# ---------------------------------------------------------------- Environment API
API_PORT="$API_PORT_DEFAULT"

if [[ "$RUN_DB" == 1 || "$RUN_API" == 1 ]]; then
  step "Environment API"

  if [[ ! -f "$API_DIR/.env" ]]; then
    [[ -f "$API_DIR/.env.example" ]] || die ".env dan .env.example dua-duanya tidak ada di api/"
    cp "$API_DIR/.env.example" "$API_DIR/.env"
    ok "api/.env dibuat dari .env.example."
  else
    ok "api/.env sudah ada (tidak ditimpa)."
  fi

  ENV_PORT="$(grep -E '^PORT=' "$API_DIR/.env" | head -1 | cut -d= -f2- | tr -d "\"'" | xargs || true)"

  if [[ -n "$API_PORT_OVERRIDE" ]]; then
    API_PORT="$API_PORT_OVERRIDE"
    ok "override dari environment: API_PORT=$API_PORT"
  elif [[ -z "$ENV_PORT" ]]; then
    printf '\nPORT=%s\n' "$API_PORT_DEFAULT" >> "$API_DIR/.env"
    ok "api/.env: PORT=$API_PORT_DEFAULT ditambahkan."
  else
    API_PORT="$ENV_PORT"
  fi

  [[ "$API_PORT" =~ ^[0-9]+$ ]] || die "PORT API tidak valid: '$API_PORT'"

  if [[ "$RUN_CLIENT" == 1 && "$API_PORT" == "$CLIENT_PORT" ]]; then
    die "PORT API ($API_PORT) bentrok dengan port client ($CLIENT_PORT). Jalankan mis. CLIENT_PORT=3001 ./develop.sh"
  fi

  if port_open "$API_PORT"; then
    warn "Port $API_PORT sudah dipakai proses lain (mungkin dev server lama)."
    warn "Hentikan dulu, atau jalankan dengan port lain: API_PORT=8090 ./develop.sh"
    die "Port $API_PORT tidak bebas."
  fi

  info "API akan jalan di :$API_PORT"
fi

# ---------------------------------------------------------------- Environment client
if [[ "$RUN_CLIENT" == 1 ]]; then
  step "Environment client"

  CLIENT_ENV="$CLIENT_DIR/.env.local"

  if [[ ! -f "$CLIENT_ENV" ]]; then
    if [[ -f "$CLIENT_DIR/.env.example" ]]; then
      cp "$CLIENT_DIR/.env.example" "$CLIENT_ENV"
      ok "client/.env.local dibuat dari .env.example."
    else
      printf '# Dibuat otomatis oleh develop.sh\nNEXT_PUBLIC_API_URL="http://localhost:%s"\nAPI_URL="http://localhost:%s"\n' \
        "$API_PORT" "$API_PORT" > "$CLIENT_ENV"
      ok "client/.env.local dibuat (API → http://localhost:${API_PORT})."
    fi

    # AUTH_SECRET acak supaya placeholder di .env.example tidak terpakai di dev.
    if ! grep -q '^AUTH_SECRET=.\{10,\}' "$CLIENT_ENV"; then
      AUTH_SECRET_VALUE="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
      if grep -q '^AUTH_SECRET=' "$CLIENT_ENV"; then
        sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=\"$AUTH_SECRET_VALUE\"#" "$CLIENT_ENV"
      else
        printf 'AUTH_SECRET="%s"\n' "$AUTH_SECRET_VALUE" >> "$CLIENT_ENV"
      fi
      ok "client/.env.local: AUTH_SECRET acak dibuat."
    fi
  else
    ok "client/.env.local sudah ada (tidak ditimpa)."
  fi

  # Sesuaikan URL API saja — jangan sentuh AUTH_SECRET/rahasia lain.
  if ! grep -q "localhost:${API_PORT}\"" "$CLIENT_ENV"; then
    sed -i -E \
      "s#^(NEXT_PUBLIC_API_URL=).*#\\1\"http://localhost:${API_PORT}\"#; s#^(API_URL=).*#\\1\"http://localhost:${API_PORT}\"#" \
      "$CLIENT_ENV"
    ok "client/.env.local: URL API disesuaikan ke :${API_PORT}."
  fi

  # INTERNAL_API_SECRET wajib identik dengan api/.env — samakan otomatis.
  API_SECRET_VALUE="$(grep -E '^INTERNAL_API_SECRET=' "$API_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'" | xargs || true)"

  if [[ -n "$API_SECRET_VALUE" ]]; then
    if grep -q '^INTERNAL_API_SECRET=' "$CLIENT_ENV"; then
      sed -i "s#^INTERNAL_API_SECRET=.*#INTERNAL_API_SECRET=\"$API_SECRET_VALUE\"#" "$CLIENT_ENV"
    else
      printf 'INTERNAL_API_SECRET="%s"\n' "$API_SECRET_VALUE" >> "$CLIENT_ENV"
    fi
    ok "client/.env.local: INTERNAL_API_SECRET disinkronkan dengan api/.env."
  else
    warn "INTERNAL_API_SECRET belum ada di api/.env — jalankan 'prisma init' pada api/.env.example."
  fi
fi

# ---------------------------------------------------------------- Dependencies
if [[ "$RUN_DB" == 1 || "$RUN_API" == 1 || "$RUN_CLIENT" == 1 ]]; then
  step "Dependencies"

  if [[ "$RUN_DB" == 1 || "$RUN_API" == 1 ]]; then
    install_deps "$API_DIR" "api"
  fi
  if [[ "$RUN_CLIENT" == 1 ]]; then
    install_deps "$CLIENT_DIR" "client"
  fi
fi

# ---------------------------------------------------------------- Contract + schema
if [[ "$RUN_DB" == 1 || "$RUN_API" == 1 ]]; then
  step "Emit contract"
  in_api npx prisma contract emit >/dev/null
  ok "contract.json & contract.d.ts ter-emit ke api/src/prisma/."

  step "Siapkan schema database"

  MIGRATION_PKGS=0
  if [[ -d "$API_DIR/migrations/app" ]]; then
    # 'refs' bukan paket migration — hanya penunjuk ref.
    MIGRATION_PKGS="$(find "$API_DIR/migrations/app" -mindepth 1 -maxdepth 1 -type d ! -name refs | wc -l)"
  fi

  if [[ "$MIGRATION_PKGS" -gt 0 ]]; then
    info "Ada $MIGRATION_PKGS paket migration — menerapkan lewat 'prisma db migrate'."
    # --advance-ref db: tanpa ini ref 'db' tertinggal di migration lama dan
    # `migration plan` berikutnya akan mem-fork graph (kejadian nyata).
    in_api npx prisma db migrate --advance-ref db --format human
    ok "Migration terbaru sudah diterapkan (perintah ini idempoten)."
  elif in_api npx prisma db verify --marker-only >/dev/null 2>&1; then
    ok "Database sudah ter-sign & belum ada paket migration — dilewati."
  else
    info "Belum ada paket migration — bootstrap pertama lewat 'prisma db init'."
    in_api npx prisma db init --format human
    ok "Database di-bootstrap & di-sign."
    warn "Sekali saja: jalankan 'npx prisma migration plan --name init' lalu commit folder migrations/."
  fi

  if [[ "$RUN_SEED" == 1 ]]; then
    in_api npm run seed
  else
    info "--no-seed: seeding dilewati."
  fi
fi

# ---------------------------------------------------------------- Dev servers
PIDS=()
TAIL_PID=""

# pgrep -P menelusuri anak npm → node/next supaya tidak ada proses yatim.
kill_tree() {
  local pid="$1" sig="${2:-TERM}" kid
  for kid in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$kid" "$sig"
  done
  kill -"$sig" "$pid" 2>/dev/null || true
}

# Terkam sampai benar-benar mati, tapi JANGAN menunggu tanpa batas: `wait`
# pada proses yang mengabaikan SIGTERM bikin script menggantung saat Ctrl+C.
stop_tree() {
  local pid="$1" i
  kill_tree "$pid" TERM
  for (( i = 0; i < 20; i++ )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  kill_tree "$pid" KILL
  return 0
}

cleanup() {
  trap - EXIT INT TERM ERR
  printf '\n'
  log "Menghentikan dev server…"
  local pid
  for pid in "${PIDS[@]:-}"; do
    if [[ -n "$pid" ]]; then
      stop_tree "$pid"
    fi
  done
  if [[ -n "$TAIL_PID" ]]; then
    kill "$TAIL_PID" 2>/dev/null || true
  fi

  # Kadang ada anak proses (next/tsx) yang lolos dari kill_tree. Jangan diam —
  # beri tahu port mana yang masih ditempati beserta cara membersihkannya.
  if [[ "$SERVERS_STARTED" == 1 ]]; then
    local port
    for port in "$API_PORT" "$CLIENT_PORT"; do
      if port_open "$port"; then
        warn "Port $port masih dipakai proses lain — bersihkan dengan: pkill -f 'tsx watch src/index.ts'; pkill -f 'next dev'"
      fi
    done
  fi

  ok "Semua proses dihentikan. Log lengkap: .dev-logs/"
  exit 0
}

port_open() { ( timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" ) >/dev/null 2>&1; }

wait_port() {
  local port="$1" tries="$2" i
  for (( i = 1; i <= tries; i++ )); do
    if port_open "$port"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [[ "$RUN_API" == 1 || "$RUN_CLIENT" == 1 ]]; then
  step "Dev server"

  mkdir -p "$LOG_DIR"
  API_LOG="$LOG_DIR/api.log"
  CLIENT_LOG="$LOG_DIR/client.log"
  : > "$API_LOG"
  : > "$CLIENT_LOG"

  trap cleanup EXIT INT TERM
  SERVERS_STARTED=1

  if [[ "$RUN_API" == 1 ]]; then
    info "API    → http://localhost:${API_PORT}   (log: .dev-logs/api.log)"
    # PORT di environment menang atas api/.env (dotenv tidak menimpa env).
    ( cd "$API_DIR" && PORT="$API_PORT" exec npm run dev ) >"$API_LOG" 2>&1 &
    PIDS+=("$!")
  fi

  if [[ "$RUN_CLIENT" == 1 ]]; then
    info "Client → http://localhost:${CLIENT_PORT}   (log: .dev-logs/client.log)"
    ( cd "$CLIENT_DIR" && exec npm run dev -- --port "$CLIENT_PORT" ) >"$CLIENT_LOG" 2>&1 &
    PIDS+=("$!")
  fi

  STARTED=1

  if [[ "$RUN_API" == 1 ]] && ! wait_port "$API_PORT" 90; then
    STARTED=0
    warn "API tidak merespons di :$API_PORT. 20 baris terakhir log:"
    tail -n 20 "$API_LOG" >&2 || true
  fi

  if [[ "$STARTED" == 1 && "$RUN_CLIENT" == 1 ]] && ! wait_port "$CLIENT_PORT" 150; then
    STARTED=0
    warn "Client tidak merespons di :$CLIENT_PORT. 20 baris terakhir log:"
    tail -n 20 "$CLIENT_LOG" >&2 || true
  fi

  [[ "$STARTED" == 1 ]] || die "Dev server gagal start (lihat .dev-logs/)."

  printf '\n'
  log "Siap dipakai:"
  if [[ "$RUN_CLIENT" == 1 ]]; then
    info "  Landing     http://localhost:${CLIENT_PORT}"
    info "  Contoh tenant  http://budi.localhost:${CLIENT_PORT}   (subdomain → /tenant/<slug>)"
  fi
  if [[ "$RUN_API" == 1 ]]; then
    info "  API health  http://localhost:${API_PORT}/health"
  fi
  info "  Stop        Ctrl+C (menghentikan semuanya)"
  printf '\n'

  # -F pada dua file: tail menandai blok dengan nama file sebagai header.
  tail -n +1 -F "$API_LOG" "$CLIENT_LOG" 2>/dev/null &
  TAIL_PID=$!

  wait -n "${PIDS[@]}" 2>/dev/null || true
  warn "Salah satu dev server berhenti — menghentikan sisanya."
  exit 0
fi

printf '\n'
ok "Selesai (--db-only: server tidak dijalankan)."
