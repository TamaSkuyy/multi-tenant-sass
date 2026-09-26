#!/usr/bin/env bash
#
# develop.sh — siapkan & jalankan environment development multi-tenant-sass.
#
#   ./develop.sh              Postgres + deps + emit + init DB + seed + dev server
#   ./develop.sh --db-only    berhenti setelah DB siap & di-seed (tanpa dev server)
#   ./develop.sh --no-seed    lewati seeding template
#   ./develop.sh --no-install lewati npm ci/install
#   ./develop.sh --reset-db   HATI-HATI: hapus container + VOLUME Postgres, bootstrap dari nol
#
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/multi-tenant-sass-api"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

RUN_SEED=1
RUN_INSTALL=1
DB_ONLY=0
RESET_DB=0

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

usage() { sed -n '3,10p' "$0" | sed -e 's/^#\{1,\} \{0,1\}//' -e '/^$/d'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only)    DB_ONLY=1 ;;
    --no-seed)    RUN_SEED=0 ;;
    --no-install) RUN_INSTALL=0 ;;
    --reset-db)   RESET_DB=1 ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "Opsi tidak dikenal: '$1' (pakai --help)" ;;
  esac
  shift
done

# ---------------------------------------------------------------- preflight
command -v docker >/dev/null 2>&1 || die "docker tidak ditemukan di PATH."
docker compose version >/dev/null 2>&1 || die "'docker compose' v2 tidak tersedia."
command -v node   >/dev/null 2>&1 || die "node tidak ditemukan di PATH."
[[ -f "$COMPOSE_FILE" ]] || die "docker-compose.yml tidak ditemukan di $ROOT_DIR"
[[ -d "$API_DIR" ]]      || die "folder multi-tenant-sass-api tidak ditemukan di $ROOT_DIR"

# -E di set di atas + die eksplisit di sini: trap ERR sendiri tidak menyala
# untuk kegagalan di dalam subshell, jadi jangan bergantung padanya.
in_api() { ( cd "$API_DIR" && trap - ERR && "$@" ) || die "Perintah gagal di $API_DIR: $*"; }

# ---------------------------------------------------------------- 1. database
step "1/6  Postgres"

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

# ---------------------------------------------------------------- 2. .env
step "2/6  Environment"

if [[ -f "$API_DIR/.env" ]]; then
  ok ".env sudah ada (tidak ditimpa)."
elif [[ -f "$API_DIR/.env.example" ]]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  ok ".env dibuat dari .env.example."
else
  die ".env dan .env.example dua-duanya tidak ada di $API_DIR"
fi

# ---------------------------------------------------------------- 3. dependencies
step "3/6  Dependencies"

if [[ "$RUN_INSTALL" == 0 ]]; then
  info "--no-install: dilewati."
elif [[ -d "$API_DIR/node_modules" ]]; then
  ok "node_modules sudah ada — dilewati (jalankan 'npm ci' sendiri bila perlu)."
elif [[ -f "$API_DIR/package-lock.json" ]]; then
  in_api npm ci --no-audit --no-fund
  ok "npm ci selesai."
else
  in_api npm install --no-audit --no-fund
  ok "npm install selesai."
fi

# ---------------------------------------------------------------- 4. contract
step "4/6  Emit contract"

in_api npx prisma contract emit >/dev/null
ok "contract.json & contract.d.ts ter-emit ke src/prisma/."

# ---------------------------------------------------------------- 5. database state
step "5/6  Siapkan schema database"

MIGRATION_PKGS=0
if [[ -d "$API_DIR/migrations/app" ]]; then
  # 'refs' bukan paket migration — hanya penunjuk ref.
  MIGRATION_PKGS="$(find "$API_DIR/migrations/app" -mindepth 1 -maxdepth 1 -type d ! -name refs | wc -l)"
fi

if [[ "$MIGRATION_PKGS" -gt 0 ]]; then
  info "Ada $MIGRATION_PKGS paket migration — menerapkan lewat 'prisma db migrate'."
  in_api npx prisma db migrate --format human
  ok "Migration terbaru sudah diterapkan (perintah ini idempoten)."
elif in_api npx prisma db verify --marker-only >/dev/null 2>&1; then
  ok "Database sudah ter-sign & belum ada paket migration — dilewati."
else
  info "Belum ada paket migration — bootstrap pertama lewat 'prisma db init'."
  in_api npx prisma db init --format human
  ok "Database di-bootstrap & di-sign."
  warn "Sekali saja: jalankan 'npx prisma migration plan --name init' lalu commit folder migrations/."
  warn "Tanpa paket migration, database produksi yang kosong TIDAK akan terbentuk saat deploy."
fi

if [[ "$RUN_SEED" == 1 ]]; then
  in_api npm run seed
else
  info "--no-seed: seeding dilewati."
fi

# ---------------------------------------------------------------- 6. dev server
step "6/6  Dev server"

if [[ "$DB_ONLY" == 1 ]]; then
  info "--db-only: dev server tidak dijalankan."
elif in_api node -e 'const s=require("./package.json").scripts||{}; process.exit(s.dev?0:1)'; then
  log "Menjalankan 'npm run dev' (Ctrl+C untuk stop)..."
  cd "$API_DIR" && exec npm run dev
else
  warn "Belum ada script \"dev\" di multi-tenant-sass-api/package.json — dilewati."
  info "Database siap dipakai. Contoh query: lihat src/prisma/db.ts"
fi

printf '\n'
ok "Selesai."
