#!/usr/bin/env bash
set -euo pipefail
umask 077
kit_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$kit_dir"
export K6_BIN="${K6_BIN:-k6}"
command -v node >/dev/null || { echo 'Node.js belum terpasang.' >&2; exit 1; }
command -v "$K6_BIN" >/dev/null || { echo 'k6 belum terpasang; isi K6_BIN atau tambahkan ke PATH.' >&2; exit 1; }
export LIVE_ADMIN_FILE="${LIVE_ADMIN_FILE:-$kit_dir/admin-login.json}"
[[ -f "$LIVE_ADMIN_FILE" ]] || { echo 'Salin admin-login.example.json menjadi admin-login.json dan isi akun admin.' >&2; exit 1; }
chmod 600 "$LIVE_ADMIN_FILE"
export LIVE_FIXTURE_FILE="$kit_dir/data/fixture.json"
export LIVE_QUESTION_SOURCE_FILE="$kit_dir/data/source-questions.json"
export LIVE_REUSE_QUESTIONS_DIR="$kit_dir/data/question-bank"
case "${1:-smoke}" in
  smoke) export LIVE_SMOKE_ONLY=true; unset LIVE_STAGES LIVE_PREVIOUS_RUN_DIR ;;
  full) export LIVE_SMOKE_ONLY=false; unset LIVE_STAGES LIVE_PREVIOUS_RUN_DIR ;;
  stage) export LIVE_SMOKE_ONLY=false; unset LIVE_PREVIOUS_RUN_DIR; export LIVE_STAGES="${2:?Isi jumlah peserta, contoh: ./run.sh stage 250}" ;;
  *) echo 'Penggunaan: ./run.sh smoke | full | stage JUMLAH' >&2; exit 1 ;;
esac
exec node "$kit_dir/backend/scripts/run-live-load.mjs"
