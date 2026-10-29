import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
const url = process.env.INTEGRITY_TEST_DATABASE_URL;
const root = new URL("..", import.meta.url),
  migration = "20261029090000_unify_question_content";
const cli = (args, connection) =>
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: connection },
      encoding: "utf8",
      timeout: 60000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
test(
  "unified-content migration deploys cleanly and refuses existing separate reading data atomically",
  { skip: !url, timeout: 120000 },
  async (t) => {
    const admin = new Pool({ connectionString: url });
    const schemas = [],
      pools = [];
    const create = async () => {
      const schema = "unified_" + crypto.randomUUID().replaceAll("-", "");
      schemas.push(schema);
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const connection = new URL(url);
      connection.searchParams.set("schema", schema);
      const pool = new Pool({
        connectionString: url,
        options: `-c search_path=${schema}`,
        max: 1,
      });
      pools.push(pool);
      return { schema, connection: connection.toString(), pool };
    };
    try {
      await t.test(
        "fresh database receives the complete history and matches the current Prisma model",
        async () => {
          const target = await create();
          cli(["migrate", "deploy"], target.connection);
          cli(
            [
              "migrate",
              "diff",
              "--from-config-datasource",
              "--to-schema",
              "prisma/schema.prisma",
              "--exit-code",
            ],
            target.connection,
          );
          const tables = await target.pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema=$1`,
            [target.schema],
          );
          assert.ok(!tables.rows.some((r) => r.table_name === "ReadingText"));
          const columns = await target.pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='Question'`,
            [target.schema],
          );
          assert.ok(!columns.rows.some((r) => r.column_name === "readingId"));
          assert.ok(
            (
              await target.pool.query(
                'SELECT migration_name FROM "_prisma_migrations"',
              )
            ).rows.some((r) => r.migration_name === migration),
          );
        },
      );
      await t.test(
        "nonempty reading stores block migration without deleting source rows",
        async () => {
          const target = await create(),
            base = new URL("../prisma/migrations/", import.meta.url);
          const names = (await readdir(base, { withFileTypes: true }))
            .filter((d) => d.isDirectory() && d.name < migration)
            .map((d) => d.name)
            .sort();
          for (const name of names)
            await target.pool.query(
              await readFile(new URL(`${name}/migration.sql`, base), "utf8"),
            );
          await target.pool.query(
            `INSERT INTO "ReadingText" (id,title,content) VALUES ('r','Bacaan','Isi yang harus tetap ada'); INSERT INTO "Question" (id,type,mapel,element,content,options,"correctAnswer","readingId") VALUES ('q','PG_Sederhana','Bahasa Indonesia','Membaca','Pertanyaan','[]','[]','r')`,
          );
          const sql = await readFile(
            new URL(`${migration}/migration.sql`, base),
            "utf8",
          );
          await assert.rejects(
            target.pool.query(sql),
            /Separate reading data still exists/,
          );
          await target.pool.query("ROLLBACK");
          assert.equal(
            (await target.pool.query('SELECT content FROM "ReadingText"'))
              .rows[0].content,
            "Isi yang harus tetap ada",
          );
          assert.equal(
            (await target.pool.query('SELECT "readingId" FROM "Question"'))
              .rows[0].readingId,
            "r",
          );
          await target.pool.query('DELETE FROM "Question"');
          await assert.rejects(
            target.pool.query(sql),
            /Separate reading data still exists/,
          );
          await target.pool.query("ROLLBACK");
          await target.pool.query('DELETE FROM "ReadingText"');
          await target.pool.query(sql);
          assert.equal(
            (
              await target.pool.query(
                `SELECT to_regclass('"ReadingText"') AS name`,
              )
            ).rows[0].name,
            null,
          );
        },
      );
    } finally {
      for (const pool of pools) await pool.end();
      for (const schema of schemas)
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
