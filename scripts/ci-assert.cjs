// CI 断言：表结构齐全 + 种子计数达标。只用标准库 + better-sqlite3。
const Database = require("better-sqlite3");

const dbPath = process.env.CAT_DB;
if (!dbPath) {
  console.error("CAT_DB 未设置");
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const bad = [];

// 1. 必需的表
const tables = new Set(
  db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name)
);
for (const t of ["users", "sessions", "cats", "cat_members", "daily_logs", "records", "ai_parses"]) {
  if (!tables.has(t)) bad.push(`缺表 ${t}`);
}

// 2. 种子数据下限
const min = { users: 1, cats: 1, daily_logs: 14, records: 3 };
for (const [t, n] of Object.entries(min)) {
  if (!tables.has(t)) continue;
  const got = db.prepare(`select count(*) as c from ${t}`).get().c;
  if (got < n) bad.push(`${t}=${got}（期望 >= ${n}）`);
}

// 3. 关键唯一约束存在（同日记录不能出现两行）
const idx = db
  .prepare("select name, sql from sqlite_master where type = 'index' and tbl_name = 'daily_logs'")
  .all();
if (!idx.some((i) => (i.sql || "").toUpperCase().includes("UNIQUE") && (i.sql || "").includes("log_date"))) {
  bad.push("daily_logs 缺少 (cat_id, log_date) 唯一约束");
}

// 4. cats 有且仅有 1 只，且名字正确
if (tables.has("cats")) {
  const cat = db.prepare("select name from cats limit 1").get();
  if (!cat) bad.push("cats 表为空");
  else if (cat.name !== "煤球") bad.push(`猫名应为「煤球」，实际「${cat.name}」`);
}

if (bad.length) {
  console.error("断言失败：" + bad.join("；"));
  process.exit(1);
}
console.log("表结构与种子计数正常");
