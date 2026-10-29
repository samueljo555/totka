import dotenv from "dotenv";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });
const migrationDir = path.join(root, "prisma/migrations");
let pool;
function cli(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { cwd: root, env: process.env, encoding: "utf8" },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      "Perintah Prisma gagal. Periksa koneksi/schema dengan Prisma secara terpisah.",
    );
  return result.stdout;
}
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi.");
  const parsed = new URL(process.env.DATABASE_URL),
    schema = parsed.searchParams.get("schema") || "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new Error("Nama schema tidak didukung oleh prosedur adopsi.");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  const columns = (
    await pool.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1",
      [schema],
    )
  ).rows;
  if (
    columns.some(
      (r) =>
        r.table_name === "ReadingText" ||
        (r.table_name === "Question" && r.column_name === "readingId"),
    )
  )
    throw new Error(
      "Skema masih memakai bacaan terpisah. Gunakan panduan FRESH_DATABASE_STAGE5.md; adopsi dihentikan tanpa perubahan.",
    );
  // Adoption records history only when the physical schema already matches the full current model.
  // Partial/older schemas are never guessed or marked as completed migrations.
  const diff = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    { cwd: root, env: process.env, encoding: "utf8" },
  );
  if (diff.status !== 0)
    throw new Error(
      "Schema belum cocok dengan model terbaru (kolom/tipe/constraint/indeks). Tidak ada riwayat diubah.",
    );
  const applied = (await readdir(migrationDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const history = columns.some((r) => r.table_name === "_prisma_migrations")
    ? (
        await pool.query(
          'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"',
        )
      ).rows
    : [];
  for (const row of history) {
    if (!applied.includes(row.migration_name))
      throw new Error("Ada migrasi yang tidak dikenal; adopsi dihentikan.");
    if (!row.finished_at && !row.rolled_back_at)
      throw new Error(
        "Ada migrasi gagal/belum selesai; selesaikan pada clone terlebih dahulu.",
      );
    if (row.finished_at && !row.rolled_back_at) {
      const checksum = createHash("sha256")
        .update(
          await readFile(
            path.join(migrationDir, row.migration_name, "migration.sql"),
          ),
        )
        .digest("hex");
      if (row.checksum !== checksum)
        throw new Error(
          "Checksum migrasi berbeda; jangan menimpa riwayat produksi.",
        );
    }
  }
  const pending = applied.filter(
    (name) =>
      !history.some(
        (row) =>
          row.migration_name === name && row.finished_at && !row.rolled_back_at,
      ),
  );
  console.log(
    "Schema cocok. Riwayat yang perlu diadopsi:",
    pending.join(", ") || "(tidak ada)",
  );
  if (process.argv.includes("--apply")) {
    for (const name of pending) cli(["migrate", "resolve", "--applied", name]);
    console.log(
      "Adopsi riwayat selesai. Jalankan npm run db:deploy untuk pemeriksaan akhir.",
    );
  } else
    console.log(
      "Pemeriksaan saja. Gunakan --apply setelah backup dan uji pada clone.",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
