#!/usr/bin/env bash
#
# deploy-production.sh — deploy multi-tenant-sass-api ke production.
#
# Urutan: install deps → emit contract → apply migration → verify schema → seed → build.
# Flag:
#   --dry-run     read-only: tampilkan rencana migration + verify, tidak mengubah apa pun
#   --seed        jalankan `npm run seed` setelah migration (idempoten)
#   --backup      pg_dump ke backups/ sebelum migration (butuh pg_dump di PATH)
#   --no-install  lewati npm ci
#   --no-build    lewati npm run build
#   --yes         lewati prompt konfirmasi (untuk CI)
#   -h, --help    tampilkan bantuan
#
# Env:
#   DATABASE_URL   WAJIB. Tidak dibaca dari .env — sengaja, biar tidak salah
#                  nembak DB development. Set dari secret manager/CI.
#   ALLOW_LOCAL_DB Set ke 1 kalau memang mau deploy ke DB lokal (staging lokal).
#
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="${APP_DIR:-$ROOT_DIR/multi-tenant-sass-api}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

DRY_RUN=0
RUN_SEED=0
DO_BACKUP=0
RUN_INSTALL=1
RUN_BUILD=1
ASSUME_YES=0

# ---------------------------------------------------------------- util
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[1;34m'; C_OK=$'\033[1;32m'
  C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_DIM=''
fi

log()  { printf '%s[deploy]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
step() { printf '\n%s[deploy]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$C_OK" "$C_RESET" "$*"; }
info() { printf '%s  ·%s %s\n' "$C_DIM" "$C_RESET" "$*"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_RESET" >&2; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_RESET" >&2; exit 1; }

trap 'die "Gagal di baris $LINENO. Deploy DIHENTIKAN — database mungkin sudah berubah, cek dengan: npx prisma db verify --db \"\$DATABASE_URL\""' ERR

usage() { sed -n '3,20p' "$0" | sed -e 's/^#\{1,\} \{0,1\}//' -e '/^$/d'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --seed)       RUN_SEED=1 ;;
    --backup)     DO_BACKUP=1 ;;
    --no-install) RUN_INSTALL=0 ;;
    --no-build)   RUN_BUILD=0 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "Opsi tidak dikenal: '$1' (pakai --help)" ;;
  esac
  shift
done

# ---------------------------------------------------------------- preflight
[[ -d "$API_DIR" ]] || die "Folder API tidak ditemukan: $API_DIR"

# Tanpa paket migration, `db migrate` menolak (MIGRATION.PATH_UNREACHABLE) dan
# database produksi yang kosong tidak akan pernah terbentuk. Gagalkan lebih awal
# dengan pesan yang jelas.
MIGRATION_PKGS=0
if [[ -d "$API_DIR/migrations/app" ]]; then
  # 'refs' bukan paket migration — hanya penunjuk ref.
  MIGRATION_PKGS="$(find "$API_DIR/migrations/app" -mindepth 1 -maxdepth 1 -type d ! -name refs | wc -l)"
fi
if [[ "$MIGRATION_PKGS" -eq 0 ]]; then
  die "Tidak ada paket migration di migrations/app/ — database produksi baru tidak akan terbentuk.
       Di dev: npx prisma migration plan --name init, lalu commit folder migrations/."
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  die "DATABASE_URL belum di-set. Script ini tidak membaca .env — export dulu:
       export DATABASE_URL='postgresql://user:pass@host:5432/dbname'"
fi

# Mask password sebelum apa pun dicetak/di-log.
MASKED_DB_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#')"
DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^:/?]+).*#\2#')"

case "$DB_HOST" in
  localhost|127.0.0.1|::1|host.docker.internal)
    if [[ "${ALLOW_LOCAL_DB:-0}" != "1" ]]; then
      die "DATABASE_URL menunjuk ke DB lokal ($DB_HOST). Kalau ini memang staging lokal,
       jalankan ulang dengan ALLOW_LOCAL_DB=1."
    fi
    warn "Deploy ke DB LOKAL ($DB_HOST) karena ALLOW_LOCAL_DB=1."
    ;;
esac

# -E di set di atas + die eksplisit di sini: trap ERR sendiri tidak menyala
# untuk kegagalan di dalam subshell, jadi jangan bergantung padanya.
in_api() { ( cd "$API_DIR" && trap - ERR && "$@" ) || die "Perintah gagal di $API_DIR: $*"; }

step "Target deploy"
info "API dir   : $API_DIR"
info "Database  : $MASKED_DB_URL"
info "Mode      : $([[ "$DRY_RUN" == 1 ]] && echo 'DRY-RUN (read-only)' || echo 'APPLY')"

if [[ -d "$ROOT_DIR/.git" ]]; then
  REV="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"
  info "Git revisi: $REV"
  if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then
    warn "Working tree kotor — artefak yang di-deploy bisa beda dari commit."
  fi
fi

# Konfirmasi: ketik nama database, mengikuti gaya consent Prisma.
DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^?]*/([^/?]+).*#\1#')"
if [[ "$DRY_RUN" == 0 && "$ASSUME_YES" == 0 ]]; then
  if [[ -t 0 ]]; then
    printf '\n%sKetik nama database (%s) untuk melanjutkan: %s' "$C_WARN" "$DB_NAME" "$C_RESET"
    read -r ANSWER
    [[ "$ANSWER" == "$DB_NAME" ]] || die "Konfirmasi tidak cocok — dibatalkan."
  else
    warn "Tidak ada TTY & tanpa --yes: melanjutkan tanpa konfirmasi (mode CI)."
  fi
fi

# ---------------------------------------------------------------- 1. deps
step "1/6  Dependencies"
if [[ "$DRY_RUN" == 1 ]]; then
  info "dry-run: dilewati."
elif [[ "$RUN_INSTALL" == 0 ]]; then
  info "--no-install: dilewati."
elif [[ -f "$API_DIR/package-lock.json" ]]; then
  in_api npm ci --no-audit --no-fund
  ok "npm ci selesai."
else
  in_api npm install --no-audit --no-fund
  ok "npm install selesai."
fi

# ---------------------------------------------------------------- 2. contract emit
step "2/6  Emit contract"
if [[ "$DRY_RUN" == 1 ]]; then
  info "dry-run: dilewati (memakai contract.json yang sudah ada)."
  [[ -f "$API_DIR/src/prisma/contract.json" ]] || die "contract.json belum ada — jalankan 'npx prisma contract emit' dulu."
else
  in_api npx prisma contract emit >/dev/null
  ok "contract.json & contract.d.ts ter-emit."

  if [[ -d "$ROOT_DIR/.git" ]] && ! git -C "$ROOT_DIR" diff --quiet -- multi-tenant-sass-api/src/prisma 2>/dev/null; then
    warn "Artefak contract BERUBAH setelah emit — berarti yang ter-commit sudah stale."
    warn "Commit ulang src/prisma/contract.json & contract.d.ts supaya deploy berikutnya deterministik."
  else
    ok "Artefak contract cocok dengan yang ter-commit."
  fi
fi

# ---------------------------------------------------------------- 3. backup
step "3/6  Backup (opsional)"
if [[ "$DO_BACKUP" == 0 ]]; then
  info "Dilewati (pakai --backup untuk mengaktifkan)."
elif [[ "$DRY_RUN" == 1 ]]; then
  info "dry-run: dilewati."
elif ! command -v pg_dump >/dev/null 2>&1; then
  warn "pg_dump tidak ada di PATH — backup dilewati."
else
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  DUMP="$BACKUP_DIR/pre-deploy-$STAMP.sql"
  info "pg_dump → $DUMP"
  pg_dump --no-owner --no-privileges --dbname="$DATABASE_URL" > "$DUMP"
  ok "Backup dibuat ($(du -h "$DUMP" | cut -f1))."
fi

# ---------------------------------------------------------------- 4. migration
step "4/6  Migration"
if [[ "$DRY_RUN" == 1 ]]; then
  info "Rencana migration (read-only):"
  in_api npx prisma db migrate --db "$DATABASE_URL" --show --format human
  ok "dry-run selesai — tidak ada perubahan."
else
  in_api npx prisma db migrate --db "$DATABASE_URL" --format human
  ok "Migration diterapkan."
fi

# ---------------------------------------------------------------- 5. verify
step "5/6  Verify schema"
if in_api npx prisma db verify --db "$DATABASE_URL" >/dev/null 2>&1; then
  ok "Database cocok dengan contract."
else
  warn "Verifikasi gagal/bermasalah. Detail:"
  in_api npx prisma db verify --db "$DATABASE_URL" --format human || true
  die "Database tidak lolos verifikasi — jangan lanjut start service."
fi

if [[ "$RUN_SEED" == 1 && "$DRY_RUN" == 0 ]]; then
  info "Seeding (--seed)..."
  in_api npm run seed
  ok "Seed selesai."
fi

# ---------------------------------------------------------------- 6. build
step "6/6  Build"
if [[ "$DRY_RUN" == 1 ]]; then
  info "dry-run: dilewati."
elif [[ "$RUN_BUILD" == 0 ]]; then
  info "--no-build: dilewati."
elif in_api node -e 'const s=require("./package.json").scripts||{}; process.exit(s.build?0:1)'; then
  in_api npm run build
  ok "Build selesai."
else
  info "Tidak ada script \"build\" — dilewati."
fi

# ---------------------------------------------------------------- ringkasan
printf '\n'
ok "Deploy selesai."
if [[ "$DRY_RUN" == 1 ]]; then
  info "Itu dry-run: belum ada perubahan yang ditulis."
else
  info "Langkah berikutnya: restart service API (mis. 'npm start', systemd, pm2, atau"
  info "'npx prisma deploy' kalau pakai Prisma Platform)."
  info "Kalau ada masalah: 'npx prisma db verify --db \"\$DATABASE_URL\"' + 'docker compose logs'."
fi
