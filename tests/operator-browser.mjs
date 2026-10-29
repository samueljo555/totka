// Real Operator UI with controlled APIs; no production data or physical printing.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve("dist"),
  web = http
    .createServer(async (req, res) => {
      let file = path.join(root, new URL(req.url, "http://local").pathname);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        if (!(await fs.stat(file)).isFile())
          file = path.join(root, "index.html");
      } catch {
        file = path.join(root, "index.html");
      }
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        }[path.extname(file)] || "application/octet-stream",
      );
      res.end(await fs.readFile(file));
    })
    .listen(0, "127.0.0.1");
await new Promise((r) => web.once("listening", r));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [],
  reads = [],
  writes = [],
  popups = [];
page.on("pageerror", (e) => errors.push(e.message));
context.on("page", (p) => {
  if (p !== page) {
    popups.push(p);
    p.on("pageerror", (e) => errors.push(e.message));
  }
});
const school = { name: "SD Negeri Harapan <Uji> & Sekolah", npsn: "00001234" };
const students = Array.from({ length: 123 }, (_, i) => ({
  id: "s" + String(i + 1).padStart(3, "0"),
  fullName: "Siswa " + String(i + 1).padStart(3, "0"),
  username: String(i + 1).padStart(10, "0"),
  nisn: String(i + 1).padStart(10, "0"),
  className: i % 2 ? "VI A" : "VI B",
  schoolNpsn: school.npsn,
  school,
  loginPassword: "ABC234",
}));
students[0].username = "login.legacy";
students[0].fullName = "Ahmad <img src=x onerror=alert(1)> & Uji";
students[0].loginPassword = "A<&\"'1";
const pkgs = [
  {
    id: "p1",
    name: "Paket Matematika",
    mapel: "Matematika",
    token: "MATH26",
    status: "aktif",
    registeredStudents: 123,
    notStarted: 120,
    ongoing: 1,
    finished: 2,
  },
  {
    id: "p2",
    name: "Paket Bahasa Indonesia",
    mapel: "Bahasa Indonesia",
    token: "BIND26",
    status: "aktif",
    registeredStudents: 123,
    notStarted: 123,
    ongoing: 0,
    finished: 0,
  },
];
let listFails = true,
  classesFail = false,
  createFails = true,
  holdCreate = false,
  releaseCreate = null,
  importFails = true,
  resetFails = false,
  cardMode = "normal",
  releaseCards = null,
  hidePackage = false,
  monitorFails = false,
  participantsFail = false,
  historyFails = false;
await context.addInitScript((school) => {
  localStorage.setItem(
    "tka_auth_user",
    JSON.stringify({
      id: "op",
      role: "operator",
      fullName: "Operator Uji",
      schoolNpsn: school.npsn,
      school,
    }),
  );
  localStorage.setItem("tka_jwt_token", "operator-token");
  localStorage.setItem("tka_token_created_at", String(Date.now()));
  localStorage.setItem("tka_last_activity_at", String(Date.now()));
}, school);
function pack(data, url) {
  const q = url.searchParams;
  let rows = [...data];
  const query = q.get("search");
  if (query)
    rows = rows.filter((r) =>
      [r.fullName, r.name, r.nisn, r.className, r.studentName, r.packageName]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  if (q.get("className"))
    rows = rows.filter((r) => r.className === q.get("className"));
  if (q.get("packageId"))
    rows = rows.filter((r) => r.packageId === q.get("packageId"));
  if (q.get("status")) {
    const status = q.get("status");
    if (["belum", "sedang_mengerjakan", "selesai"].includes(status))
      rows = rows.filter((r) =>
        status === "belum" ? !r.session : r.session?.status === status,
      );
  }
  rows.sort(
    (a, b) =>
      (a.fullName || a.name || a.studentName || a.id).localeCompare(
        b.fullName || b.name || b.studentName || b.id,
      ) * (q.get("sort") === "name_desc" ? -1 : 1),
  );
  const total = rows.length,
    size = Number(q.get("pageSize") || 10),
    pageNo = Number(q.get("page") || 1),
    start = q.has("after")
      ? rows.findIndex((r) => r.id === q.get("after")) + 1
      : (pageNo - 1) * size;
  rows = rows.slice(start, start + size);
  return {
    items: rows,
    total,
    page: pageNo,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size)),
    hasMore: start + size < total,
    nextCursor: start + size < total ? rows.at(-1).id : null,
  };
}
const sessionFor = (s) =>
  s.id === "s001"
    ? { status: "selesai", totalScore: 0 }
    : s.id === "s002"
      ? { status: "sedang_mengerjakan", totalScore: 88 }
      : s.id === "s003"
        ? { status: "selesai", totalScore: 75 }
        : null;
await page.route("**/api/**", async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    method = req.method(),
    body = method === "GET" ? null : req.postDataJSON();
  assert.equal(req.headers().authorization, "Bearer operator-token");
  if (method === "GET") reads.push(url);
  else writes.push({ path: url.pathname, method, body });
  const json = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  if (url.pathname === "/api/auth/session-check")
    return json({ status: "valid" });
  if (url.pathname === "/api/users/classes")
    return classesFail
      ? json({ message: "Kelas gagal diuji" }, 503)
      : json([...new Set(students.map((s) => s.className))]);
  if (url.pathname === "/api/users/login-cards") {
    if (listFails) return json({ message: "Siswa gagal diuji" }, 503);
    if (url.searchParams.has("after") && cardMode === "failSecond") {
      releaseCards = () =>
        json({ message: "Halaman kartu gagal diuji" }, 503).catch(() => {});
      return;
    }
    if (
      cardMode === "holdFirst" &&
      url.searchParams.get("pageSize") === "100"
    ) {
      releaseCards = () => json(pack(students, url)).catch(() => {});
      return;
    }
    return json(pack(students, url));
  }
  if (url.pathname === "/api/users")
    return json(
      pack(
        students.map(({ loginPassword: _pw, ...s }) => s),
        url,
      ),
    );
  if (url.pathname === "/api/users/siswa") {
    if (createFails)
      return json({ error: "Siswa with this NISN already exists" }, 400);
    const done = () => {
      const s = {
        id: "new-one",
        username: body.nisn,
        ...body,
        school,
        loginPassword: "NEW234",
      };
      students.push(s);
      return json({ user: { ...s, tempPassword: "NEW234" } }).catch(() => {});
    };
    if (holdCreate) {
      releaseCreate = done;
      return;
    }
    return done();
  }
  if (url.pathname === "/api/users/siswa/batch") {
    if (importFails) return json({ message: "Impor siswa gagal diuji" }, 503);
    let count = 0;
    for (const s of body.students) {
      if (students.some((row) => row.nisn === s.nisn)) continue;
      students.push({
        id: "import-" + s.nisn,
        username: s.nisn,
        ...s,
        schoolNpsn: school.npsn,
        school,
        loginPassword: "IMP234",
      });
      count++;
    }
    return json({ count, credentials: [] });
  }
  if (url.pathname.endsWith("/login-card/reset")) {
    if (resetFails) return json({ message: "Reset password gagal diuji" }, 503);
    const s = students.find((s) => s.id === url.pathname.split("/")[3]);
    s.loginPassword = "RESET6";
    return json(s);
  }
  if (url.pathname.endsWith("/login-card"))
    return json(students.find((s) => s.id === url.pathname.split("/")[3]));
  if (url.pathname === "/api/monitoring/packages") {
    if (monitorFails) return json({ message: "Paket gagal diuji" }, 503);
    return json(
      pack(
        pkgs.filter((p) => !hidePackage || p.id !== "p1"),
        url,
      ),
    );
  }
  if (
    url.pathname.includes("/api/monitoring/packages/") &&
    url.pathname.endsWith("/students")
  )
    return participantsFail
      ? json({ message: "Peserta gagal diuji" }, 503)
      : json(
          pack(
            students.map((s) => ({ ...s, session: sessionFor(s) })),
            url,
          ),
        );
  if (url.pathname === "/api/packages") return json(pack(pkgs, url));
  if (url.pathname === "/api/monitoring/history") {
    if (historyFails) return json({ message: "Riwayat gagal diuji" }, 503);
    return json(
      pack(
        [
          {
            id: "h1",
            studentId: "s001",
            studentName: students[0].fullName,
            nisn: students[0].nisn,
            school: school.name,
            npsn: school.npsn,
            className: "VI B",
            packageId: "p1",
            packageName: pkgs[0].name,
            mapel: "Matematika",
            status: "Selesai",
            score: 0,
            endTime: "2026-10-29T01:00:00Z",
          },
          {
            id: "h2",
            studentId: "s003",
            studentName: "Siswa 003",
            nisn: "0000000003",
            school: school.name,
            npsn: school.npsn,
            className: "VI B",
            packageId: "p2",
            packageName: pkgs[1].name,
            mapel: "Bahasa Indonesia",
            status: "Selesai",
            score: 75,
            endTime: "2026-10-29T02:00:00Z",
          },
        ],
        url,
      ),
    );
  }
  return json({ message: "Unexpected API" }, 404);
});
const nav = async (name) => {
  if (
    await page
      .getByRole("button", { name: "Buka menu", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Buka menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Menu utama", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
};
const tableRow = (name) => page.getByRole("row").filter({ hasText: name });
const popupFor = async (button) => {
  const wait = page.waitForEvent("popup");
  await button.click();
  return wait;
};
const saved = () => page.getByRole("dialog").waitFor({ state: "hidden" });
const confirmReset = () =>
  page
    .getByRole("button", { name: "Atur ulang password", exact: true })
    .click();
try {
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${web.address().port}/operator`);
  await page
    .getByRole("alert")
    .getByText("Siswa gagal diuji", { exact: true })
    .waitFor();
  listFails = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await tableRow(students[0].fullName).waitFor();
  assert.ok(
    (await tableRow(students[0].fullName).innerText()).includes(
      students[0].loginPassword,
    ),
  );
  await page.getByLabel("Kelas siswa", { exact: true }).selectOption("VI A");
  await page.getByRole("status").filter({ hasText: "dari 61 entri" }).waitFor();
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  const csv = await fs.readFile(await (await waiting).path(), "utf8");
  assert.equal(csv.trimEnd().split("\n").length, 62);
  assert.ok(!csv.includes("ABC234"));
  assert.ok(csv.includes("0000000002"));
  await page
    .getByRole("button", { name: "Reset Filter", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Tambah Siswa", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("NISN", { exact: true }).fill("0000099999");
  await dialog.getByLabel("Nama Lengkap", { exact: true }).fill("Siswa Baru");
  await dialog.getByLabel("Kelas", { exact: true }).fill("VIII C");
  await dialog
    .getByRole("button", { name: "Simpan Data Siswa", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .getByText(/NISN sudah terdaftar/)
    .waitFor();
  assert.equal(
    await dialog.getByLabel("NISN", { exact: true }).inputValue(),
    "0000099999",
  );
  createFails = false;
  holdCreate = true;
  const before = writes.length;
  await dialog
    .getByRole("button", { name: "Simpan Data Siswa", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Menyimpan...", exact: true })
    .waitFor();
  await dialog
    .locator("form")
    .evaluate((el) =>
      el.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  assert.equal(writes.length, before + 1);
  await releaseCreate();
  await saved();
  assert.equal(writes.at(-1).body.schoolNpsn, school.npsn);
  assert.equal(writes.at(-1).body.nisn, "0000099999");
  await page
    .getByRole("option", { name: "VIII C", exact: true })
    .waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("File CSV siswa", { exact: true })
    .setInputFiles({
      name: "empty.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(""),
    });
  await dialog
    .getByRole("alert")
    .getByText(/CSV kosong/)
    .waitFor();
  await dialog
    .getByLabel("File CSV siswa", { exact: true })
    .setInputFiles({
      name: "siswa.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "\ufeffnisn,fullName,className\n0000099999,Siswa Baru,VIII C\n0000088881,Siswa Impor A,VI A\n0000088882,Siswa Impor B,VI B\n,Baris tidak lengkap,VI A\n",
      ),
    });
  await dialog.getByText("Siswa Impor A", { exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "Impor Siswa", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .getByText("Impor siswa gagal diuji", { exact: true })
    .waitFor();
  assert.ok((await dialog.innerText()).includes("Siswa Impor A"));
  importFails = false;
  await dialog
    .getByRole("button", { name: "Impor Siswa", exact: true })
    .click();
  await saved();
  await page
    .getByText(
      "Berhasil mengimpor 2 siswa. Password tersedia pada kartu login.",
      { exact: true },
    )
    .waitFor();
  assert.equal(writes.at(-1).body.students[1].nisn, "0000088881");
  const first = tableRow(students[0].fullName);
  await first.getByRole("button", { name: "Atur ulang", exact: true }).click();
  const beforeCancel = writes.length;
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(writes.length, beforeCancel);
  resetFails = true;
  await first.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await confirmReset();
  await page.getByText("Reset password gagal diuji", { exact: true }).waitFor();
  assert.notEqual(students[0].loginPassword, "RESET6");
  resetFails = false;
  await first.getByRole("button", { name: "Atur ulang", exact: true }).click();
  await confirmReset();
  await first.getByText("RESET6", { exact: true }).waitFor();
  const one = await popupFor(
    first.getByRole("button", {
      name: "Cetak kartu " + students[0].fullName,
      exact: true,
    }),
  );
  await one.locator(".login-card").waitFor();
  assert.equal(await one.locator(".login-card").count(), 1);
  assert.equal(
    await one.locator(".credentials strong").first().innerText(),
    "login.legacy",
  );
  assert.equal(
    await one.locator(".credentials strong").last().innerText(),
    "RESET6",
  );
  assert.equal(await one.locator("img").count(), 0);
  assert.ok((await one.locator("dl").innerText()).includes("0000000001"));
  await one.screenshot({ path: "/tmp/totka-stage4-card.png" });
  await one.emulateMedia({ media: "print" });
  assert.equal(await one.locator(".print-toolbar").isVisible(), false);
  await one.close();
  await page.getByLabel("Kelas siswa", { exact: true }).selectOption("VI A");
  const all = await popupFor(
    page.getByRole("button", { name: "Cetak Kartu Login", exact: true }),
  );
  await all.waitForFunction(
    (expected) => document.querySelectorAll(".login-card").length === expected,
    students.length,
  );
  assert.ok(
    reads.some(
      (u) =>
        u.pathname === "/api/users/login-cards" && u.searchParams.has("after"),
    ),
  );
  assert.ok((await all.locator("body").innerText()).includes("Siswa Impor B"));
  await all.close();
  await page
    .getByRole("button", { name: "Reset Filter", exact: true })
    .first()
    .click();
  cardMode = "failSecond";
  const failed = await popupFor(
    page.getByRole("button", { name: "Cetak Kartu Login", exact: true }),
  );
  await page.waitForFunction(() =>
    document.querySelector(".export-progress")?.textContent.includes("100"),
  );
  assert.equal(await failed.locator(".login-card").count(), 0);
  await releaseCards();
  await page.getByText("Halaman kartu gagal diuji", { exact: true }).waitFor();
  assert.equal(failed.isClosed(), true);
  cardMode = "normal";
  students[1].loginPassword = null;
  const missing = await popupFor(
    page.getByRole("button", { name: "Cetak Kartu Login", exact: true }),
  );
  await page.getByText(/1 siswa belum memiliki password kartu/).waitFor();
  assert.equal(missing.isClosed(), true);
  students[1].loginPassword = "ABC234";
  cardMode = "holdFirst";
  const cancelled = await popupFor(
    page.getByRole("button", { name: "Cetak Kartu Login", exact: true }),
  );
  await page
    .getByRole("button", { name: "Menyiapkan kartu...", exact: true })
    .waitFor();
  await nav("Pantau Ujian");
  assert.equal(cancelled.isClosed(), true);
  await releaseCards();
  cardMode = "normal";
  await nav("Manajemen Siswa");
  assert.equal(
    await page
      .getByRole("button", { name: "Cetak Kartu Login", exact: true })
      .isEnabled(),
    true,
  );
  await page.screenshot({
    path: "/tmp/totka-stage4-students.png",
    fullPage: true,
  });
  monitorFails = true;
  await nav("Pantau Ujian");
  await page
    .getByRole("alert")
    .getByText("Paket gagal diuji", { exact: true })
    .waitFor();
  monitorFails = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await page.getByText("MATH26", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/totka-stage4-monitoring.png",
    fullPage: true,
  });
  await tableRow("Paket Matematika")
    .getByRole("button", { name: "Lihat peserta", exact: true })
    .click();
  await tableRow(students[0].fullName).waitFor();
  assert.equal(await first.locator(".table-score").innerText(), "0");
  assert.equal(await tableRow("Siswa 002").locator(".table-score").count(), 0);
  assert.equal(
    await page.locator(".operator-token-band .operator-token").innerText(),
    "MATH26",
  );
  await page
    .getByLabel("Status ujian", { exact: true })
    .selectOption("sedang_mengerjakan");
  await page.getByRole("status").filter({ hasText: "dari 1 entri" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page
    .getByRole("button", { name: "Reset Filter", exact: true })
    .first()
    .click();
  await tableRow(students[0].fullName).waitFor();
  await page.screenshot({
    path: "/tmp/totka-stage4-participants.png",
    fullPage: true,
  });
  await page.bringToFront();
  await page.waitForFunction(() => document.visibilityState === "visible");
  const prior = reads.filter(
    (u) => u.pathname === "/api/monitoring/packages",
  ).length;
  const poll = page.waitForRequest(
    (req) => new URL(req.url()).pathname === "/api/monitoring/packages",
  );
  await page.clock.runFor(15100);
  await poll;
  await page.waitForFunction(
    () =>
      !document.querySelector(
        ".operator-panel .data-table-scroll [role=status]",
      ),
  );
  assert.ok(
    reads.filter((u) => u.pathname === "/api/monitoring/packages").length >
      prior,
  );
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    }),
  );
  const hidden = reads.filter(
    (u) => u.pathname === "/api/monitoring/packages",
  ).length;
  await page.clock.runFor(15100);
  assert.equal(
    reads.filter((u) => u.pathname === "/api/monitoring/packages").length,
    hidden,
  );
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    }),
  );
  hidePackage = true;
  await page.getByRole("button", { name: "Perbarui", exact: true }).click();
  await page
    .getByText(/Paket ini tidak ada pada halaman daftar aktif terbaru/)
    .waitFor();
  assert.equal(
    await page.locator(".operator-token-band .operator-token").innerText(),
    "—",
  );
  hidePackage = false;
  await page.getByRole("button", { name: "Perbarui", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".operator-token-band .operator-token")
        .textContent === "MATH26",
  );
  historyFails = true;
  await nav("Riwayat Ujian");
  await page
    .getByRole("alert")
    .getByText("Riwayat gagal diuji", { exact: true })
    .waitFor();
  historyFails = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await page.getByText("0,0", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Paket try out", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: /^Paket Bahasa Indonesia\s*Bahasa Indonesia$/,
    })
    .click();
  await page.getByRole("status").filter({ hasText: "dari 1 entri" }).waitFor();
  const reportDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh CSV Hasil", exact: true })
    .click();
  const reportCsv = await fs.readFile(
    await (await reportDownload).path(),
    "utf8",
  );
  assert.ok(reportCsv.includes("Paket Bahasa Indonesia"));
  assert.ok(!reportCsv.includes("Paket Matematika"));
  await page.screenshot({
    path: "/tmp/totka-stage4-history.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Manajemen Siswa", "Pantau Ujian", "Riwayat Ujian"]) {
    await nav(name);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      name + " mobile",
    );
  }
  await nav("Manajemen Siswa");
  await page.getByRole("button", { name: "Tambah Siswa", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "student form mobile",
  );
  await page.screenshot({
    path: "/tmp/totka-stage4-form-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.screenshot({
    path: "/tmp/totka-stage4-students-mobile.png",
    fullPage: true,
  });
  assert.ok(
    writes.every(
      (w) =>
        w.method === "POST" &&
        (w.path === "/api/users/siswa" ||
          w.path === "/api/users/siswa/batch" ||
          w.path.endsWith("/login-card/reset")),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Operator school scope/pagination/CSV, add/import failure retention and duplicate guard, explicit six-character reset, single/all-page cards with escaping/latest username/password, incomplete/missing/cancelled printing, active tokens/finished-only scores/visible polling, history filters/export and mobile.",
  );
} finally {
  for (const p of popups) if (!p.isClosed()) await p.close();
  await browser.close();
  web.closeAllConnections();
  await new Promise((r) => web.close(r));
}
