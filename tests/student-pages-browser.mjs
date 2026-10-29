// Build first. Exercises the real student pages with controlled APIs and the real AnswerSync.
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
const base = `http://127.0.0.1:${web.address().port}`,
  errors = [];
const doc =
  "TKA_RICH_V1:" +
  JSON.stringify({
    version: 1,
    format: "free",
    indent: false,
    lineHeight: 1.85,
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Perhatikan gambar ini." }],
        },
        {
          type: "image",
          attrs: {
            src: "/uploads/student.svg",
            alt: "diagram",
            width: 50,
            align: "center",
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Pilih satu jawaban." }],
        },
      ],
    },
  });
let sequence = 0;
async function open(options = {}) {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  const f = {
    id: "student-flow-" + ++sequence,
    startMode: "active",
    release: "langsung",
    packageRelease: "langsung",
    score: 0,
    remaining: 1200,
    finishMode: "success",
    starts: [],
    finishes: [],
    answers: [],
    held: [],
    ...options,
  };
  await context.addInitScript(
    ({ blockSession, stored }) => {
      localStorage.setItem(
        "tka_auth_user",
        JSON.stringify({
          id: "student-ui",
          role: "siswa",
          fullName: "Siswa Login",
          nisn: "0000123401",
          className: "VI A",
          schoolNpsn: "00001234",
          school: { name: "SD Harapan", npsn: "00001234" },
        }),
      );
      localStorage.setItem("tka_jwt_token", "student-ui-token");
      localStorage.setItem("tka_token_created_at", String(Date.now()));
      localStorage.setItem("tka_last_activity_at", String(Date.now()));
      if (stored !== undefined)
        sessionStorage.setItem("activeExamToken", stored);
      if (blockSession) {
        for (const method of ["getItem", "setItem", "removeItem"]) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (key, ...args) {
            if (String(key) === "activeExamToken")
              throw new DOMException(
                "Blocked optional session token",
                "SecurityError",
              );
            return original.call(this, key, ...args);
          };
        }
      }
    },
    {
      blockSession: !!options.blockSession,
      ...(options.stored !== undefined ? { stored: options.stored } : {}),
    },
  );
  await page.route("**/uploads/student.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#eff5ff"/><path d="M150 20L270 160H30Z" fill="#6b95e4"/></svg>',
    }),
  );
  const data = () => ({
    session: {
      id: f.id,
      status: f.startMode === "finished" ? "selesai" : "sedang_mengerjakan",
      releaseScoreMode: f.release,
      ...(f.startMode === "finished" && f.score !== undefined
        ? { totalScore: f.score }
        : {}),
    },
    student: {
      id: "student-ui",
      role: "siswa",
      fullName: "Ahmad Fadli",
      nisn: "0000000001",
      className: "VI B",
      school: {
        name: "SD Negeri Nusantara Amanah dengan Nama Sekolah yang Panjang",
        npsn: "00001234",
      },
    },
    package: {
      name: "Paket Aktual Matematika dengan Nama Panjang untuk Pengujian Tampilan",
      mapel: "Matematika",
      durationMinutes: 20,
      releaseScoreMode: f.packageRelease,
    },
    questions:
      f.startMode === "malformed"
        ? []
        : [
            {
              id: "q1",
              type: "Pilihan Ganda Sederhana",
              content: doc,
              options: [{ text: "10" }, { text: "20" }],
            },
          ],
    existingAnswers: [],
    remainingSeconds: f.remaining,
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    assert.equal(req.headers().authorization, "Bearer student-ui-token");
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/api/auth/session-check")
      return json({ status: "valid" });
    if (url.pathname === "/api/sessions/start") {
      f.starts.push(req.postDataJSON());
      if (f.startMode === "invalid")
        return json(
          {
            message:
              "Token tidak dikenal. Periksa kembali token dari operator.",
          },
          404,
        );
      if (f.startMode === "network") return route.abort("failed");
      if (f.startMode === "kicked")
        return json({ message: "Sesi masuk sudah tidak aktif." }, 401);
      if (f.startMode === "hold") {
        f.held.push(() => json(data()).catch(() => {}));
        return;
      }
      return json(data());
    }
    if (url.pathname.endsWith("/answer")) {
      const answer = req.postDataJSON();
      f.answers.push(answer);
      return json({ ...answer, acknowledged: true });
    }
    if (url.pathname.endsWith("/finish")) {
      f.finishes.push(req.postDataJSON());
      const done = () =>
        json({
          id: f.id,
          status: "selesai",
          releaseScoreMode: f.release,
          ...(f.score !== undefined ? { totalScore: f.score } : {}),
        });
      if (f.finishMode === "error")
        return json(
          { message: "Penyelesaian belum berhasil. Silakan coba lagi." },
          503,
        );
      if (f.finishMode === "hold") {
        f.held.push(() => done().catch(() => {}));
        return;
      }
      return done();
    }
    throw new Error("Unexpected student endpoint " + url.pathname);
  });
  await page.goto(base + "/siswa");
  return { context, page, f };
}
const start = async (page, token = "MiXeD26") => {
  await page.getByPlaceholder("Masukkan Token").fill(token);
  await page
    .getByRole("button", { name: "Mulai Kerjakan", exact: true })
    .click();
};
const finish = async (page) => {
  await page
    .getByRole("button", { name: "Selesai ujian", exact: true })
    .click();
  const d = page.getByRole("dialog", {
    name: "Sudah selesai mengerjakan?",
    exact: true,
  });
  await d.getByRole("button", { name: "Selesai ujian", exact: true }).click();
};
const noOverflow = async (page, label) =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    label,
  );
try {
  const home = await open();
  await home.page
    .getByRole("heading", { name: "Identitas peserta", exact: true })
    .waitFor();
  const identity = home.page.getByRole("region", {
    name: "Identitas peserta",
    exact: true,
  });
  assert.ok((await identity.innerText()).includes("0000123401"));
  assert.ok((await identity.innerText()).includes("VI A"));
  await home.page
    .getByRole("button", { name: "Profil Siswa", exact: true })
    .click();
  assert.equal(await home.page.getByRole("textbox").count(), 0);
  assert.equal(home.f.starts.length, 0);
  await home.page
    .getByRole("button", { name: "Mulai Try Out", exact: true })
    .click();
  await home.page.screenshot({
    path: "/tmp/totka-stage6-token-desktop.png",
    fullPage: true,
  });
  await home.page.getByPlaceholder("Masukkan Token").fill("ab");
  await home.page
    .locator("form")
    .evaluate((el) =>
      el.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await home.page
    .getByRole("alert")
    .getByText(/minimal 3 karakter/)
    .waitFor();
  assert.equal(home.f.starts.length, 0);
  home.f.startMode = "invalid";
  await start(home.page, "BAD");
  await home.page
    .getByRole("alert")
    .getByText(/Token tidak dikenal/)
    .waitFor();
  assert.equal(
    await home.page.getByPlaceholder("Masukkan Token").inputValue(),
    "BAD",
  );
  home.f.startMode = "network";
  await start(home.page);
  await home.page
    .getByRole("alert")
    .getByText(/Tidak dapat terhubung/)
    .waitFor();
  home.f.startMode = "malformed";
  await start(home.page);
  await home.page
    .getByRole("alert")
    .getByText(/Data ujian belum dapat dimuat/)
    .waitFor();
  assert.equal(home.f.finishes.length, 0);
  for (const width of [320, 390, 820, 1440]) {
    await home.page.setViewportSize({ width, height: 900 });
    await noOverflow(home.page, "lobby " + width);
    if (width === 390)
      await home.page.screenshot({
        path: "/tmp/totka-stage6-token-mobile.png",
        fullPage: true,
      });
  }
  home.f.startMode = "hold";
  const before = home.f.starts.length;
  await start(home.page);
  await home.page
    .getByRole("button", { name: "Memproses...", exact: true })
    .waitFor();
  await home.page.locator("form").evaluate((el) => {
    el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(home.f.starts.length, before + 1);
  home.f.startMode = "active";
  await home.f.held.shift()();
  await home.page
    .getByRole("article", { name: "Soal 1", exact: true })
    .waitFor();
  assert.equal(home.f.starts.at(-1).token, "MiXeD26");
  const record = await home.page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("activeExamToken")),
  );
  assert.deepEqual(record, { studentId: "student-ui", token: "MiXeD26" });
  await home.page
    .getByRole("button", { name: "Perbesar diagram", exact: true })
    .click();
  const image = home.page.getByRole("dialog", {
    name: "Gambar soal",
    exact: true,
  });
  assert.equal(
    await home.page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  for (let i = 0; i < 12; i++) {
    await home.page.keyboard.press("Tab");
    assert.equal(
      await image.evaluate((el) => el.contains(document.activeElement)),
      true,
    );
  }
  await home.page.keyboard.press("+");
  await image.getByText("125%", { exact: true }).waitFor();
  await home.page.keyboard.press("0");
  await image.getByText("100%", { exact: true }).waitFor();
  await home.page.keyboard.press("Escape");
  assert.equal(await image.isVisible(), false);
  assert.equal(
    await home.page.evaluate(() => document.body.style.overflow),
    "",
  );
  assert.equal(home.f.answers.length, 0);
  await home.page
    .getByRole("radio", { name: "Pilihan A", exact: true })
    .check();
  await home.page
    .locator(".exam-save-status")
    .getByText("Jawaban telah diterima server.", { exact: true })
    .waitFor();
  home.f.finishMode = "error";
  await finish(home.page);
  await home.page
    .getByRole("dialog", { name: "Sudah selesai mengerjakan?", exact: true })
    .getByRole("alert")
    .filter({ hasText: "Penyelesaian belum berhasil" })
    .waitFor();
  assert.equal(await home.page.locator(".student-result-card").count(), 0);
  home.f.finishMode = "success";
  await home.page
    .getByRole("dialog", { name: "Sudah selesai mengerjakan?", exact: true })
    .getByRole("button", { name: "Selesai ujian", exact: true })
    .click();
  await home.page
    .getByRole("heading", { name: "Ujian Selesai!", exact: true })
    .waitFor();
  assert.match(
    await home.page.locator(".student-score-value").innerText(),
    /^0\s*\/\s*100$/,
  );
  assert.equal(
    await home.page.evaluate(() => document.body.style.overflow),
    "",
  );
  assert.equal(home.f.finishes.length, 2);
  assert.ok(
    (await home.page.locator(".student-result-identity").innerText()).includes(
      "0000000001",
    ),
  );
  await home.page.screenshot({
    path: "/tmp/totka-stage6-result-zero.png",
    fullPage: true,
  });
  await home.page
    .getByRole("button", { name: "Kembali ke Beranda", exact: true })
    .click();
  await home.page.waitForURL(base + "/");
  assert.equal(
    await home.page.evaluate(() => localStorage.getItem("tka_auth_user")),
    null,
  );
  await home.context.close();
  const other = await open({
    stored: JSON.stringify({ studentId: "other-student", token: "OTHER26" }),
  });
  await other.page
    .getByRole("heading", { name: "Identitas peserta", exact: true })
    .waitFor();
  assert.equal(other.f.starts.length, 0);
  assert.equal(
    await other.page.getByPlaceholder("Masukkan Token").inputValue(),
    "",
  );
  await other.context.close();
  const blocked = await open({ blockSession: true });
  await start(blocked.page);
  await blocked.page
    .getByText(/Sesi tidak dapat dilanjutkan otomatis/)
    .waitFor();
  await blocked.page
    .getByRole("radio", { name: "Pilihan B", exact: true })
    .check();
  await blocked.page
    .locator(".exam-save-status")
    .getByText("Jawaban telah diterima server.", { exact: true })
    .waitFor();
  await finish(blocked.page);
  await blocked.page
    .getByRole("heading", { name: "Ujian Selesai!", exact: true })
    .waitFor();
  assert.equal(
    await blocked.page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.includes("outbox")),
    ),
    false,
  );
  await blocked.context.close();
  for (const score of [undefined, " ", 0, "84.56"]) {
    const f = await open({ startMode: "finished", score, remaining: 0 });
    await start(f.page);
    await f.page
      .getByRole("heading", { name: "Ujian Selesai!", exact: true })
      .waitFor();
    if (score === undefined || score === " ") {
      await f.page
        .getByRole("heading", { name: "Nilai belum tersedia", exact: true })
        .waitFor();
      assert.equal(await f.page.locator(".student-score-value").count(), 0);
    } else
      assert.ok(
        (await f.page.locator(".student-score-value").innerText()).includes(
          score === 0 ? "0" : "84,56",
        ),
      );
    assert.equal(f.f.finishes.length, 0);
    await f.page.setViewportSize({ width: 320, height: 844 });
    await noOverflow(f.page, "result " + String(score));
    await f.context.close();
  }
  const deferred = await open({
    startMode: "finished",
    release: "tertunda",
    packageRelease: "langsung",
    score: 99,
    remaining: 0,
  });
  await start(deferred.page);
  await deferred.page
    .getByRole("heading", { name: "Menunggu Rilis", exact: true })
    .waitFor();
  assert.equal(await deferred.page.locator(".student-score-value").count(), 0);
  await deferred.page.screenshot({
    path: "/tmp/totka-stage6-result-deferred.png",
    fullPage: true,
  });
  await deferred.context.close();
  const revoked = await open({ startMode: "kicked" });
  await start(revoked.page);
  await revoked.page
    .getByRole("heading", { name: "Sesi Ujian Dinonaktifkan", exact: true })
    .waitFor();
  assert.equal(
    await revoked.page
      .getByRole("button", { name: "Mulai Kerjakan", exact: true })
      .count(),
    0,
  );
  assert.equal(await revoked.page.locator("dialog[open]").count(), 0);
  await revoked.page
    .getByRole("button", { name: "Kembali ke Beranda", exact: true })
    .click();
  await revoked.page.waitForURL(base + "/");
  assert.equal(
    await revoked.page.evaluate(() => localStorage.getItem("tka_auth_user")),
    null,
  );
  await revoked.context.close();
  const timeout = await open({ startMode: "hold" });
  await start(timeout.page);
  await timeout.page
    .getByRole("button", { name: "Memproses...", exact: true })
    .waitFor();
  await timeout.page.clock.runFor(15100);
  await timeout.page
    .getByRole("alert")
    .getByText(/Permintaan terlalu lama/)
    .waitFor();
  assert.equal(
    await timeout.page
      .getByRole("button", { name: "Mulai Kerjakan", exact: true })
      .isEnabled(),
    true,
  );
  await timeout.f.held.shift()();
  await timeout.context.close();
  const cancelled = await open({ startMode: "hold" });
  await start(cancelled.page);
  await cancelled.page
    .getByRole("button", { name: "Memproses...", exact: true })
    .waitFor();
  await cancelled.page
    .locator(".workspace-desktop-nav")
    .getByRole("button", { name: "Keluar", exact: true })
    .click();
  await cancelled.page.waitForURL(base + "/");
  cancelled.f.startMode = "active";
  await cancelled.f.held.shift()();
  assert.equal(new URL(cancelled.page.url()).pathname, "/");
  assert.equal(
    await cancelled.page.evaluate(() => localStorage.getItem("tka_auth_user")),
    null,
  );
  await cancelled.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: student identity/profile/token validation and exact case, single start/abort/timeout, malformed response guard, account-scoped recovery, storage failure, native image keyboard/focus/scroll cleanup, finish failure/retry, real zero/precision/unavailable/deferred results, revocation and responsive pages.",
  );
} finally {
  await browser.close();
  web.closeAllConnections();
  await new Promise((r) => web.close(r));
}
