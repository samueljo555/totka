// Real Super Admin UI, controlled API responses, no production database.
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
  }),
  page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [],
  writes = [],
  reads = [];
page.on("pageerror", (e) => errors.push(e.message));
const schools = [
    { npsn: "00001234", name: "Sekolah Harapan", region: "Jakarta" },
  ],
  users = [
    {
      id: "student",
      username: "0000123401",
      nisn: "0000123401",
      role: "siswa",
      fullName: "Siswa Uji",
      schoolNpsn: "00001234",
      school: schools[0],
    },
    { id: "admin", username: "admin", role: "admin", fullName: "Admin Uji" },
  ];
const packages = [
  {
    id: "p1",
    name: "Paket Aktif",
    mapel: "Matematika",
    durationMinutes: 90,
    navigationMode: "bebas",
    releaseScoreMode: "langsung",
    token: "MATH26",
    status: "aktif",
    questions: [{ questionId: "m1" }],
    _count: { questions: 1 },
  },
  {
    id: "p2",
    name: "Paket Draft",
    mapel: "Bahasa Indonesia",
    durationMinutes: 75,
    navigationMode: "maju_terus",
    releaseScoreMode: "tertunda",
    token: "BIND26",
    status: "draft",
    questions: [{ questionId: "b1" }],
    _count: { questions: 1 },
  },
];
const questions = [
  ...Array.from({ length: 7 }, (_, i) => ({
    id: "m" + (i + 1),
    mapel: "Matematika",
    content: "Matematika soal " + (i + 1),
    type: "Pilihan Ganda Sederhana",
    element: "Bilangan",
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: "b" + (i + 1),
    mapel: "Bahasa Indonesia",
    content: "Bacaan Indonesia " + (i + 1),
    type: "Pilihan Ganda Sederhana",
    element: "Membaca",
  })),
];
let overviewFails = true,
  saveFails = true,
  schoolFails = false,
  locked = true,
  statusFails = false,
  deleteFails = false;
await context.addInitScript(() => {
  localStorage.setItem(
    "tka_auth_user",
    JSON.stringify({ id: "admin", role: "super_admin", fullName: "Admin Uji" }),
  );
  localStorage.setItem("tka_jwt_token", "admin-test-token");
  localStorage.setItem("tka_token_created_at", String(Date.now()));
  localStorage.setItem("tka_last_activity_at", String(Date.now()));
});
const pack = (rows, url) => {
  let items = [...rows],
    q = url.searchParams;
  const search = q.get("search");
  if (search)
    items = items.filter((r) =>
      [r.fullName, r.name, r.username, r.content, r.npsn]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  if (q.get("role")) items = items.filter((r) => r.role === q.get("role"));
  if (q.get("mapel")) items = items.filter((r) => r.mapel === q.get("mapel"));
  items.sort(
    (a, b) =>
      (a.fullName || a.name || a.id).localeCompare(
        b.fullName || b.name || b.id,
      ) * (q.get("sort") === "name_desc" ? -1 : 1),
  );
  const total = items.length,
    size = Number(q.get("pageSize") || 10),
    page = Number(q.get("page") || 1),
    start = q.get("after")
      ? items.findIndex((r) => (r.id || r.npsn) === q.get("after")) + 1
      : (page - 1) * size;
  items = items.slice(start, start + size);
  return {
    items,
    total,
    page,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size)),
    hasMore: start + size < total,
    nextCursor:
      start + size < total ? items.at(-1).id || items.at(-1).npsn : null,
  };
};
await page.route("**/api/**", async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    method = req.method(),
    body = method === "GET" ? null : req.postDataJSON();
  const json = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  if (method !== "GET") writes.push({ path: url.pathname, method, body });
  else reads.push(url);
  assert.equal(req.headers().authorization, "Bearer admin-test-token");
  if (url.pathname === "/api/auth/session-check")
    return json({ status: "valid" });
  if (url.pathname === "/api/overview")
    return overviewFails
      ? json({ message: "Ringkasan gagal diuji" }, 503)
      : json({ totalUsers: 2, students: 1, teachers: 0, packages: 2 });
  if (url.pathname.endsWith("/login-card"))
    return json({ loginPassword: "siswa1" });
  if (url.pathname === "/api/users" && method === "GET")
    return json(pack(users, url));
  if (url.pathname.startsWith("/api/users") && method !== "GET") {
    if (saveFails) return json({ message: "Username sudah digunakan" }, 409);
    if (method === "POST")
      users.push({
        id: "new-user",
        ...body,
        school: schools.find((s) => s.npsn === body.schoolNpsn),
      });
    if (method === "PUT")
      Object.assign(
        users.find((u) => u.id === url.pathname.split("/").at(-1)),
        body,
      );
    return json({ ok: true });
  }
  if (url.pathname === "/api/schools" && method === "GET")
    return json(pack(schools, url));
  if (url.pathname === "/api/schools/batch") {
    schools.push(...body.schools);
    return json({ ok: true });
  }
  if (url.pathname.startsWith("/api/schools") && method !== "GET") {
    if (method === "DELETE") {
      if (deleteFails) return json({ message: "Sekolah masih digunakan" }, 409);
      schools.splice(
        schools.findIndex((s) => s.npsn === url.pathname.split("/").at(-1)),
        1,
      );
    } else if (schoolFails)
      return json({ message: "Sekolah gagal disimpan" }, 503);
    else if (method === "POST") schools.push(body);
    else
      Object.assign(
        schools.find((s) => s.npsn === body.npsn),
        body,
      );
    return json({ ok: true });
  }
  if (url.pathname === "/api/packages" && method === "GET")
    return json(pack(packages, url));
  if (url.pathname === "/api/questions") return json(pack(questions, url));
  if (url.pathname.startsWith("/api/packages") && method !== "GET") {
    if (Object.keys(body).length === 1 && body.status) {
      if (statusFails) return json({ message: "Status gagal diubah" }, 503);
    } else if (locked && method === "PUT")
      return json(
        { message: "Konten paket sudah digunakan dalam ujian." },
        409,
      );
    if (method === "POST")
      packages.push({
        id: "new-package",
        ...body,
        questions: body.questionIds.map((questionId) => ({ questionId })),
        _count: { questions: body.questionIds.length },
      });
    else
      Object.assign(
        packages.find((p) => p.id === url.pathname.split("/").at(-1)),
        body,
      );
    return json({ ok: true });
  }
  if (url.pathname === "/api/users/classes") return json(["VI A"]);
  return json(pack([], url));
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
const confirm = async (name) =>
  page.getByRole("button", { name, exact: true }).last().click();
try {
  await page.goto(`http://127.0.0.1:${web.address().port}/admin`);
  await page
    .getByRole("alert")
    .getByText("Ringkasan gagal diuji", { exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-stat=totalUsers]").innerText(), "—");
  overviewFails = false;
  await page.getByRole("button", { name: "Coba Lagi", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("[data-stat=totalUsers]").textContent === "2",
  );
  assert.equal(await page.locator("[data-stat=teachers]").innerText(), "0");
  await page.screenshot({
    path: "/tmp/totka-stage3-overview.png",
    fullPage: true,
  });
  await nav("Manajemen Akun");
  await page.getByRole("row").filter({ hasText: "Siswa Uji" }).waitFor();
  assert.equal(
    await page
      .getByRole("row")
      .filter({ hasText: "Admin Uji" })
      .locator(".admin-role-tag")
      .innerText(),
    "Admin",
  );
  await page.getByRole("button", { name: "Tambah Akun", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await page.screenshot({
    path: "/tmp/totka-stage3-account.png",
    fullPage: true,
  });
  await dialog.getByLabel("Username", { exact: true }).fill("guru.uji");
  await dialog.getByLabel("Password", { exact: true }).fill("ABC123");
  await dialog
    .getByLabel("Nama Lengkap / Nama Institusi", { exact: true })
    .fill("Guru Uji");
  await dialog.getByLabel("Peran (Role)", { exact: true }).selectOption("guru");
  await dialog
    .getByRole("combobox", { name: "Pilih sekolah", exact: true })
    .selectOption("00001234");
  await dialog
    .getByRole("button", { name: "Simpan Data Pengguna", exact: true })
    .click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(
    await dialog.getByLabel("Username", { exact: true }).inputValue(),
    "guru.uji",
  );
  saveFails = false;
  await dialog
    .getByRole("button", { name: "Simpan Data Pengguna", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "Guru Uji" }).waitFor();
  assert.equal(writes.at(-1).body.schoolNpsn, "00001234");
  await page
    .getByRole("row")
    .filter({ hasText: "Siswa Uji" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await page.waitForFunction(
    () =>
      document.querySelector(
        'input[placeholder="Kosongkan untuk mempertahankan password"]',
      ).value === "siswa1",
  );
  assert.equal(
    await dialog.getByLabel("Password", { exact: true }).getAttribute("type"),
    "text",
  );
  await dialog
    .getByLabel("Nama Lengkap / Nama Institusi", { exact: true })
    .fill("Siswa Uji Baru");
  await dialog
    .getByRole("button", { name: "Simpan Perubahan", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "Siswa Uji Baru" }).waitFor();
  assert.equal(writes.at(-1).body.password, "siswa1");
  await page.screenshot({
    path: "/tmp/totka-stage3-accounts.png",
    fullPage: true,
  });
  await nav("Data Sekolah");
  await page
    .getByRole("button", { name: "Tambah Sekolah", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("NPSN", { exact: true }).fill("00005678");
  await dialog
    .getByLabel("Nama Sekolah / Instansi", { exact: true })
    .fill("Sekolah Baru");
  schoolFails = true;
  await dialog
    .getByRole("button", { name: "Simpan Data Sekolah", exact: true })
    .click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(
    await dialog.getByLabel("NPSN", { exact: true }).inputValue(),
    "00005678",
  );
  schoolFails = false;
  await dialog
    .getByRole("button", { name: "Simpan Data Sekolah", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "Sekolah Baru" }).waitFor();
  await page
    .getByRole("row")
    .filter({ hasText: "Sekolah Baru" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  assert.equal(
    await dialog.getByLabel("NPSN", { exact: true }).isDisabled(),
    true,
  );
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("File CSV sekolah", { exact: true })
    .setInputFiles({
      name: "sekolah.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("npsn,name,region\n00000099,Sekolah Impor,Jakarta\n"),
    });
  await dialog.getByText("Sekolah Impor", { exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "Impor Sekolah", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "Sekolah Impor" }).waitFor();
  assert.equal(writes.at(-1).body.schools[0].npsn, "00000099");
  deleteFails = true;
  await page
    .getByRole("row")
    .filter({ hasText: "Sekolah Impor" })
    .getByRole("button", { name: "Hapus", exact: true })
    .click();
  await confirm("Hapus");
  await page.getByText("Sekolah masih digunakan", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("row").filter({ hasText: "Sekolah Impor" }).count(),
    1,
  );
  deleteFails = false;
  await nav("Paket Try Out");
  await page.getByText("MATH26", { exact: true }).waitFor();
  await page
    .getByRole("row")
    .filter({ hasText: "Paket Aktif" })
    .getByRole("button", { name: "Edit Paket", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Pilih soal m1", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Pilih soal m1", exact: true })
      .isChecked(),
    true,
  );
  await page.getByLabel("Durasi Waktu (Menit)", { exact: true }).fill("91");
  await page
    .getByRole("button", { name: "Simpan Paket Try Out", exact: true })
    .click();
  await page
    .getByRole("alert")
    .getByText("Konten paket sudah digunakan dalam ujian.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Durasi Waktu (Menit)", { exact: true }).inputValue(),
    "91",
  );
  locked = false;
  await page
    .getByRole("button", { name: "Simpan Paket Try Out", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "Paket Aktif" }).waitFor();
  assert.equal(writes.at(-1).body.status, undefined);
  assert.equal(packages[0].status, "aktif");
  statusFails = true;
  await page
    .getByRole("row")
    .filter({ hasText: "Paket Draft" })
    .getByRole("button", { name: "Buka Ujian", exact: true })
    .click();
  await confirm("Buka ujian");
  await page.getByText("Status gagal diubah", { exact: true }).waitFor();
  assert.equal(packages[1].status, "draft");
  statusFails = false;
  await page
    .getByRole("row")
    .filter({ hasText: "Paket Draft" })
    .getByRole("button", { name: "Buka Ujian", exact: true })
    .click();
  await confirm("Buka ujian");
  await page
    .getByRole("row")
    .filter({ hasText: "Paket Draft" })
    .getByRole("button", { name: "Tutup Ujian", exact: true })
    .waitFor();
  assert.deepEqual(writes.at(-1).body, { status: "aktif" });
  await page
    .getByRole("button", { name: "Buat Paket Baru", exact: true })
    .click();
  await page.getByLabel("Nama Paket", { exact: true }).fill("Paket Baru");
  await page.getByLabel("Token Ujian", { exact: true }).fill("BARU26");
  await page
    .getByRole("checkbox", { name: "Pilih soal m1", exact: true })
    .check();
  await page.getByRole("button", { name: "Halaman 2", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Pilih soal m7", exact: true })
    .check();
  await page.getByRole("button", { name: "Halaman 1", exact: true }).click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Pilih soal m1", exact: true })
      .isChecked(),
    true,
  );
  await page
    .getByLabel("Mata Pelajaran", { exact: true })
    .selectOption("Bahasa Indonesia");
  await page
    .getByRole("checkbox", { name: "Pilih soal b1", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Pilih soal m1", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("checkbox", { name: "Pilih soal b1", exact: true })
    .check();
  await page.getByLabel("Cari soal paket", { exact: true }).fill("Indonesia 2");
  await page
    .getByRole("checkbox", { name: "Pilih soal b2", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Pilih soal b2", exact: true })
    .check();
  await page.screenshot({
    path: "/tmp/totka-stage3-package.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Simpan Paket Try Out", exact: true })
    .click();
  await page.getByRole("row").filter({ hasText: "Paket Baru" }).waitFor();
  assert.deepEqual(writes.at(-1).body.questionIds, ["b1", "b2"]);
  assert.equal(writes.at(-1).body.status, "draft");
  assert.ok(
    reads.some(
      (u) =>
        u.pathname === "/api/questions" &&
        u.searchParams.get("search") === "Indonesia 2" &&
        u.searchParams.get("mapel") === "Bahasa Indonesia",
    ),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  const csv = await fs.readFile(await (await download).path(), "utf8");
  assert.ok(!csv.includes("BARU26"));
  assert.ok(csv.includes("Paket Baru"));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of [
    "Ringkasan",
    "Manajemen Akun",
    "Data Sekolah",
    "Paket Try Out",
    "Analitik Hasil",
    "Pengaturan Ujian",
  ]) {
    await nav(tab);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      tab + " mobile",
    );
  }
  await page
    .getByRole("button", { name: "Buka paket try out", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Buat Paket Baru", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "package form mobile",
  );
  await page.screenshot({
    path: "/tmp/totka-stage3-package-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await nav("Manajemen Akun");
  await page.getByRole("button", { name: "Tambah Akun", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "account dialog mobile",
  );
  await page.screenshot({
    path: "/tmp/totka-stage3-account-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Admin overview retry/real zero, account CRUD/password cards, school failure retention/import/delete rejection, package locks/status preservation/activation/search/subject filtering/paged selection/export and mobile forms/menus.",
  );
} finally {
  await browser.close();
  web.closeAllConnections();
  await new Promise((r) => web.close(r));
}
