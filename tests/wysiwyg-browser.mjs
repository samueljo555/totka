// Build first. Uses the real UI and AnswerSync with controlled API responses; no database changes.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve("dist");
const web = http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://local").pathname;
    let file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!(await fs.stat(file)).isFile()) file = path.join(root, "index.html");
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
await new Promise((resolve) => web.once("listening", resolve));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const errors = [],
  questions = new Map(),
  answers = [],
  requests = [];
let uploads = 0,
  savedId = 0,
  rejectSave = false,
  rejectDelete = false;
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
const png = Buffer.from(
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 200;
    const x = c.getContext("2d");
    x.fillStyle = "#edf4ff";
    x.fillRect(0, 0, 360, 200);
    x.fillStyle = "#2563eb";
    x.beginPath();
    x.moveTo(180, 25);
    x.lineTo(290, 175);
    x.lineTo(70, 175);
    x.closePath();
    x.fill();
    return c.toDataURL("image/png").split(",")[1];
  }),
  "base64",
);
const pack = (items) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  hasMore: false,
  nextCursor: null,
});
await page.addInitScript(() => {
  if (!localStorage.getItem("tka_auth_user"))
    localStorage.setItem(
      "tka_auth_user",
      JSON.stringify({ id: "teacher", role: "guru", fullName: "Guru Uji" }),
    );
  localStorage.setItem("tka_jwt_token", "test-token");
  localStorage.setItem("tka_token_created_at", String(Date.now()));
  localStorage.setItem("tka_last_activity_at", String(Date.now()));
});
await page.route("**/uploads/**", (route) =>
  route.fulfill({ contentType: "image/png", body: png }),
);
await page.route("**/api/**", async (route) => {
  const req = route.request(),
    url = new URL(req.url());
  requests.push(url.pathname);
  const json = (body) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (url.pathname === "/api/auth/session-check")
    return json({ status: "valid" });
  if (url.pathname === "/api/upload") {
    uploads++;
    return json({ imageUrl: `/uploads/image-${uploads}.png` });
  }
  if (url.pathname === "/api/questions" && req.method() === "GET")
    return json(pack([...questions.values()]));
  if (url.pathname === "/api/questions" && req.method() === "POST") {
    const body = req.postDataJSON(),
      id = "new-" + ++savedId;
    questions.set(id, { id, ...body });
    return json({ id, ...body });
  }
  if (url.pathname.startsWith("/api/questions/") && req.method() === "DELETE") {
    if (rejectDelete)
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ message: "Soal sudah dipakai ujian." }),
      });
    questions.delete(url.pathname.split("/").at(-1));
    return json({ ok: true });
  }
  if (url.pathname.startsWith("/api/questions/") && req.method() === "PUT") {
    if (rejectSave)
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Konten sudah digunakan dalam ujian.",
        }),
      });
    const id = url.pathname.split("/").at(-1),
      body = req.postDataJSON();
    questions.set(id, { id, ...body });
    return json(questions.get(id));
  }
  if (url.pathname === "/api/sessions/start")
    return json({
      session: {
        id: "rich-exam",
        status: "sedang_mengerjakan",
        totalScore: null,
      },
      package: {
        name: "Paket Gambar",
        mapel: "Bahasa Indonesia",
        durationMinutes: 90,
        releaseScoreMode: "langsung",
      },
      student: {
        id: "student",
        role: "siswa",
        fullName: "Siswa Uji",
        nisn: "000001",
        className: "VI A",
        school: { name: "Sekolah Uji" },
      },
      questions: [...questions.values()].map(
        ({ correctAnswer: _correctAnswer, ...q }) => q,
      ),
      existingAnswers: [],
      remainingSeconds: 5400,
    });
  if (url.pathname.endsWith("/answer")) {
    const body = req.postDataJSON();
    answers.push(body);
    return json({ ...body, acknowledged: true });
  }
  return json(pack([]));
});
const base = `http://127.0.0.1:${web.address().port}`;
try {
  await page.goto(base + "/guru");
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  await page
    .getByLabel("Mata Pelajaran", { exact: true })
    .selectOption("Bahasa Indonesia");
  await page
    .getByLabel("Elemen / Kompetensi", { exact: true })
    .fill("Memahami");
  const body = page.getByRole("textbox", { name: "Isi soal", exact: true });
  await body.fill("Kalimat di atas gambar.");
  await body.press("Shift+Enter");
  await page.keyboard.insertText("Larik kedua tetap satu bait.");
  await body.press("Enter");
  await body.press("Control+a");
  await page
    .getByLabel("Ukuran font Isi soal", { exact: true })
    .selectOption("20");
  await body.locator("p").last().click();
  await page.keyboard.insertText("\\frac{a}{b}");
  assert.equal(await body.locator(".tiptap-mathematics-render").count(), 0);
  await body.press("Space");
  await body.locator(".tiptap-mathematics-render").waitFor();
  await body.press("Control+z");
  assert.equal(await body.locator(".tiptap-mathematics-render").count(), 0);
  assert.ok((await body.innerText()).includes("\\frac{a}{b}"));
  await body.press("Control+Shift+z");
  await body.locator(".tiptap-mathematics-render").waitFor();
  await body.locator(".tiptap-mathematics-render").click();
  await page
    .getByLabel("Rumus LaTeX Isi soal", { exact: true })
    .fill("\\frac{2}{3}");
  await page
    .getByRole("button", { name: "Terapkan rumus", exact: true })
    .click();
  await body.press("Enter");
  await page
    .getByLabel("Unggah gambar Isi soal", { exact: true })
    .setInputFiles({ name: "bentuk.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() =>
    document.querySelector('[role=textbox][aria-label="Isi soal"] img'),
  );
  await body.locator("img[src]").click();
  await page
    .getByLabel("Lebar gambar Isi soal", { exact: true })
    .selectOption("50");
  await page
    .getByLabel("Posisi gambar Isi soal", { exact: true })
    .selectOption("right");
  await page
    .getByLabel("Keterangan gambar Isi soal", { exact: true })
    .fill("Ilustrasi bangun");
  // Insert the question after the picture, preserving the preceding paragraph.
  await body.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("Apa bentuk pada gambar tersebut?");
  await page
    .getByLabel("Format Isi soal", { exact: true })
    .selectOption("poem");
  await page.getByRole("textbox", { name: "Pilihan A", exact: true }).fill("");
  await page
    .getByLabel("Unggah gambar Pilihan A", { exact: true })
    .setInputFiles({ name: "jawaban.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() =>
    document.querySelector('[role=textbox][aria-label="Pilihan A"] img'),
  );
  for (const letter of ["B", "C", "D"])
    await page
      .getByRole("textbox", { name: "Pilihan " + letter, exact: true })
      .fill("Jawaban " + letter);
  const c = page.getByRole("textbox", { name: "Pilihan C", exact: true });
  await c.fill("\\frac{a}");
  await c.press("Space");
  assert.equal(await c.locator(".tiptap-mathematics-render").count(), 0);
  assert.ok((await c.innerText()).includes("\\frac{a}"));
  await c.fill("\\left( \\sqrt{x}");
  await c.press("Space");
  assert.equal(await c.locator(".tiptap-mathematics-render").count(), 0);
  await c.fill("Jawaban C");
  await c.evaluate((el) => {
    el.focus();
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 2);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.waitForFunction(() => getSelection().toString() === "Ja");
  await page
    .getByLabel("Ukuran font Pilihan C", { exact: true })
    .selectOption("22");
  const d = page.getByRole("textbox", { name: "Pilihan D", exact: true });
  await d.fill("\\sqrt{x}");
  await d.press("Enter");
  await d.locator(".tiptap-mathematics-render").waitFor();
  await page.keyboard.insertText("Jawaban D");
  assert.equal(await d.locator("p").count(), 2);
  await page
    .getByRole("radio", { name: "Kunci pilihan A", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Sisipkan rumus — Pilihan B", exact: true })
    .click();
  await page
    .getByLabel("Rumus LaTeX Pilihan B", { exact: true })
    .fill("\\frac{1}{2}");
  await page
    .getByRole("button", { name: "Terapkan rumus", exact: true })
    .click();
  assert.ok((await page.locator(".authoring-preview .katex").count()) > 0);
  await page.screenshot({
    path: "/tmp/totka-wysiwyg-author.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Simpan ke Bank Soal", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Daftar Soal", exact: true })
    .waitFor();
  const created = questions.get("new-1");
  assert.ok(created.content.startsWith("TKA_RICH_V1:"));
  const rich = JSON.parse(created.content.slice("TKA_RICH_V1:".length));
  const types = rich.doc.content.map((n) => n.type);
  assert.ok(types.includes("image"));
  assert.equal(rich.doc.content[0].content[0].text, "Kalimat di atas gambar.");
  assert.ok(
    JSON.stringify(rich.doc.content.at(-1)).includes(
      "Apa bentuk pada gambar tersebut?",
    ),
  );
  assert.equal("readingId" in created, false);
  assert.deepEqual(created.correctAnswer, [0]);
  assert.ok(
    JSON.parse(
      created.options[0].text.slice("TKA_RICH_V1:".length),
    ).doc.content.some((n) => n.type === "image"),
  );
  assert.equal(rich.doc.content[0].content[1].type, "hardBreak");
  const picture = rich.doc.content.find((n) => n.type === "image");
  assert.equal(picture.attrs.width, 50);
  assert.equal(picture.attrs.align, "right");
  assert.equal(picture.attrs.alt, "Ilustrasi bangun");
  assert.ok(
    rich.doc.content[0].content[0].marks.some(
      (m) => m.type === "fontSize" && m.attrs.size === 20,
    ),
  );
  assert.ok(JSON.stringify(rich.doc).includes("\\\\frac{2}{3}"));
  const optionC = JSON.parse(
    created.options[2].text.slice("TKA_RICH_V1:".length),
  ).doc.content[0].content;
  assert.equal(optionC[0].text, "Ja");
  assert.equal(optionC[0].marks[0].attrs.size, 22);
  assert.equal(optionC[1].text, "waban C");
  assert.equal(optionC[1].marks, undefined);
  await page
    .getByRole("row")
    .filter({ hasText: "Kalimat di atas gambar." })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Isi soal", exact: true })
      .locator("img[src]")
      .getAttribute("data-width"),
    "50",
  );
  await page
    .getByRole("button", { name: "Simpan ke Bank Soal", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Daftar Soal", exact: true })
    .waitFor();
  assert.equal(questions.get("new-1").content, created.content);
  await page
    .getByRole("row")
    .filter({ hasText: "Kalimat di atas gambar." })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  rejectSave = true;
  await page
    .getByRole("button", { name: "Simpan ke Bank Soal", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Konten sudah digunakan dalam ujian." })
    .waitFor();
  assert.ok(
    (
      await page
        .getByRole("textbox", { name: "Isi soal", exact: true })
        .innerText()
    ).includes("Kalimat di atas gambar."),
  );
  rejectSave = false;
  await page
    .getByRole("button", { name: "Simpan ke Bank Soal", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Daftar Soal", exact: true })
    .waitFor();
  // All question types keep their answer-key indexes when a choice is removed.
  for (const [kind, title] of [
    ["Pilihan Ganda Kompleks", "Soal kompleks baru"],
    ["Pilihan Ganda Kompleks Kategori", "Soal kategori baru"],
  ]) {
    await page
      .getByRole("button", { name: "Tambah Soal", exact: true })
      .click();
    await page
      .getByLabel("Elemen / Kompetensi", { exact: true })
      .fill("Bilangan");
    await page.getByLabel("Bentuk Soal", { exact: true }).selectOption(kind);
    await page
      .getByRole("textbox", { name: "Isi soal", exact: true })
      .fill(title);
    for (const letter of ["A", "B", "C", "D"])
      await page
        .getByRole("textbox", { name: "Pilihan " + letter, exact: true })
        .fill("Isi " + letter);
    if (kind.endsWith("Kategori")) {
      await page
        .getByLabel("Kunci pernyataan 2", { exact: true })
        .selectOption("1");
      await page
        .getByLabel("Kunci pernyataan 4", { exact: true })
        .selectOption("1");
    } else {
      await page
        .getByRole("checkbox", { name: "Kunci pilihan A", exact: true })
        .check();
      await page
        .getByRole("checkbox", { name: "Kunci pilihan C", exact: true })
        .check();
    }
    await page
      .getByRole("button", { name: "Hapus pilihan B", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Simpan ke Bank Soal", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Daftar Soal", exact: true })
      .waitFor();
  }
  assert.deepEqual(questions.get("new-2").correctAnswer, [0, 1]);
  assert.deepEqual(questions.get("new-3").correctAnswer, [0, 0, 1]);
  const categoryRow = page
    .getByRole("row")
    .filter({ hasText: "Soal kategori baru" });
  rejectDelete = true;
  await categoryRow.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("button", { name: "Hapus", exact: true }).last().click();
  await page.getByText("Soal sudah dipakai ujian.", { exact: true }).waitFor();
  assert.ok(questions.has("new-3"));
  rejectDelete = false;
  await categoryRow.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("button", { name: "Hapus", exact: true }).last().click();
  await categoryRow.waitFor({ state: "hidden" });
  assert.equal(questions.has("new-3"), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Tambah Soal", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/totka-stage5-teacher-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 1100 });
  assert.equal(
    await page
      .getByRole("button", { name: "Manajemen Bacaan", exact: true })
      .count(),
    0,
  );
  assert.equal(
    requests.some((p) => p.includes("/readings")),
    false,
  );
  // The pupil receives the same ordered blocks and chooses image options by index.
  await page.evaluate(() => {
    localStorage.setItem(
      "tka_auth_user",
      JSON.stringify({ id: "student", role: "siswa", fullName: "Siswa Uji" }),
    );
    sessionStorage.removeItem("activeExamToken");
  });
  await page.goto(base + "/siswa");
  await page.getByPlaceholder("Masukkan Token").fill("GAMBAR");
  await page
    .getByRole("button", { name: "Mulai Kerjakan", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Paket Gambar", exact: true })
    .waitFor();
  const studentBlocks = await page
    .locator(".exam-question-content .rich-document")
    .evaluate((el) => [...el.children].map((node) => node.tagName));
  assert.ok(studentBlocks.indexOf("FIGURE") > 0);
  assert.equal(studentBlocks.at(-1), "P");
  assert.equal(
    await page.locator(".exam-option").first().locator("img").count(),
    1,
  );
  const sized = page
    .locator('.exam-question-content [data-font-size="20"]')
    .first();
  assert.equal(
    await sized.evaluate((el) => getComputedStyle(el).fontSize),
    "20px",
  );
  assert.equal(
    await page
      .locator(".exam-option")
      .nth(2)
      .locator('[data-font-size="22"]')
      .evaluate((el) => getComputedStyle(el).fontSize),
    "22px",
  );
  await page
    .getByRole("button", { name: "Perbesar teks", exact: true })
    .click();
  assert.ok(
    parseFloat(await sized.evaluate((el) => getComputedStyle(el).fontSize)) >
      20,
  );
  await page
    .getByRole("button", { name: "Perkecil teks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Perbesar jawaban.png", exact: true })
    .click();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  assert.equal(
    await page
      .getByRole("radio", { name: "Pilihan A", exact: true })
      .isChecked(),
    false,
  );
  await page.getByRole("radio", { name: "Pilihan A", exact: true }).check();
  await page
    .locator(".exam-save-status")
    .getByText("Jawaban telah diterima server.", { exact: true })
    .waitFor();
  assert.equal(answers.at(-1).answerData, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/totka-wysiwyg-student-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: WYSIWYG body/answer images, automatic math on Space/Enter, incomplete formula unchanged, undo/redo and click-edit math, selected/all text font size and pupil zoom, save/roundtrip, no separate readings, all key types/deletion/locking errors, grading payload and mobile.",
  );
} finally {
  await browser.close();
  web.closeAllConnections();
  await new Promise((resolve) => web.close(resolve));
}
