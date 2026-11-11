#!/usr/bin/env bash
# 本地 CI：类型检查 → 数据库冒烟 → 构建。任何一步失败即退出非零。
set -euo pipefail
cd "$(dirname "$0")/.."

BLUE='\033[0;34m'; RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
say(){ printf "${BLUE}▶ %s${NC}\n" "$1"; }
ok(){ printf "${GREEN}✔ %s${NC}\n" "$1"; }
die(){ printf "${RED}✘ %s${NC}\n" "$1"; exit 1; }

say "1/3 类型检查 (tsc --noEmit)"
npx tsc --noEmit || die "类型检查失败"
ok "类型检查通过"

say "2/3 数据库冒烟（临时库建表 + 种子 + 计数断言）"
CI_DB="./data/ci-smoke.db"
export CAT_DB="$CI_DB"
rm -f "$CI_DB" "$CI_DB-wal" "$CI_DB-shm"
npm run db:reset >/dev/null 2>&1 || die "db:reset 失败"
node -e '
const Database = require("better-sqlite3");
const db = new Database(process.env.CAT_DB, { readonly: true });
const q = (s) => db.prepare(s).get();
const need = { users: 1, cats: 1, daily_logs: 14, records: 3 };
let bad = [];
for (const [t, min] of Object.entries(need)) {
  const n = q(`select count(*) c from ${t}`).c;
  if (n < min) bad.push(`${t}=${n} (期望>=${min})`);
}
const cols = db.prepare("select name from sqlite_master where type=\"table\"").all().map(r => r.name);
for (const t of ["users","sessions","cats","cat_members","daily_logs","records","ai_parses"]) {
  if (!cols.includes(t)) bad.push(`缺表 ${t}`);
}
if (bad.length) { console.error("断言失败: " + bad.join(", ")); process.exit(1); }
console.log("计数与表结构正常");
' || die "数据库断言失败"
rm -f "$CI_DB" "$CI_DB-wal" "$CI_DB-shm"
unset CAT_DB
ok "数据库冒烟通过"

say "3/3 生产构建 (next build)"
NEXT_TELEMETRY_DISABLED=1 npm run build || die "构建失败"
ok "构建通过"

printf "${GREEN}全部通过 ✔${NC}\n"
