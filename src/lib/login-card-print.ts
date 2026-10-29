export interface PrintableStudent {
  id: string;
  fullName: string;
  username?: string;
  nisn?: string | null;
  className?: string | null;
  loginPassword?: string | null;
  schoolNpsn?: string | null;
  school?: { name?: string; npsn?: string } | null;
}
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function loginCardDocument(
  students: PrintableStudent[],
  schoolName: string,
  schoolNpsn = "",
) {
  const cards = students
    .map(
      (student) =>
        `<article class="login-card"><header><span class="brand-symbol" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18"/></svg></span><div><strong>TOTKA</strong><small>TRY OUT TES KEMAMPUAN AKADEMIK</small></div><b>KARTU LOGIN</b></header><div class="school">${escapeHtml(student.school?.name || schoolName || "Sekolah")}<small>NPSN ${escapeHtml(student.school?.npsn || student.schoolNpsn || schoolNpsn || "—")}</small></div><dl><dt>Nama siswa</dt><dd>${escapeHtml(student.fullName)}</dd><dt>NISN</dt><dd class="mono">${escapeHtml(student.nisn || "—")}</dd><dt>Kelas</dt><dd>${escapeHtml(student.className || "—")}</dd></dl><div class="credentials"><div><span>Username</span><strong>${escapeHtml(student.username || student.nisn || "—")}</strong></div><div><span>Password</span><strong>${escapeHtml(student.loginPassword)}</strong></div></div><footer>Gunakan akun ini untuk masuk. Token ujian diberikan oleh sekolah.</footer></article>`,
    )
    .join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kartu Login Siswa — ${escapeHtml(schoolName || "Sekolah")}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#263c5b;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.print-toolbar{max-width:1100px;margin:auto;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:15px}.print-toolbar p{margin:4px 0 0;color:#7c91ae;font-size:11px}.print-toolbar button{border:1px solid #2563eb;background:#2563eb;color:white;padding:10px 16px;border-radius:6px;cursor:pointer;font:600 12px Arial,sans-serif}.card-container{max-width:1100px;margin:auto;padding:0 24px 24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.login-card{border:1px dashed #aebfd9;border-radius:7px;background:white;padding:18px;break-inside:avoid;page-break-inside:avoid;min-width:0}header{display:flex;align-items:center;gap:9px;padding-bottom:13px;border-bottom:1px solid #e3eaf4}.brand-symbol{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;background:#2563eb;color:white;font-size:19px;font-weight:700}header strong{font-size:17px;letter-spacing:-.4px}header small{display:block;font-size:7px;color:#8b9fba;letter-spacing:.8px}header>b{font-size:9px;color:#6986b1;margin-left:auto;white-space:nowrap}.school{font-size:12px;font-weight:650;margin:13px 0;color:#506c93;overflow-wrap:anywhere}.school small{display:block;color:#94a5bc;font-weight:400;font-size:9px;margin-top:2px}dl{display:grid;grid-template-columns:78px minmax(0,1fr);gap:7px 10px;margin:13px 0;font-size:11px}dt{color:#8598b2}dd{margin:0;color:#415b7e;font-weight:550;overflow-wrap:anywhere}.mono,.credentials strong{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.credentials{background:#f4f8ff;border:1px solid #dce7f8;border-radius:5px;padding:11px 12px}.credentials>div{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;margin:4px 0}.credentials span{font-size:10px;color:#8297b6}.credentials strong{font-size:14px;color:#284f8c;overflow-wrap:anywhere}footer{margin-top:13px;font-size:8px;color:#99a9bd}@media(max-width:600px){.card-container{grid-template-columns:minmax(0,1fr);padding:0 15px 20px}.print-toolbar{padding:18px 15px;flex-wrap:wrap}}@page{size:A4;margin:12mm}@media print{body{background:white}.print-toolbar{display:none}.card-container{max-width:none;padding:0;grid-template-columns:repeat(2,minmax(0,1fr));gap:6mm}.login-card{padding:4mm;border-color:#95a9c5}.credentials{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="print-toolbar"><div><strong>${students.length} kartu login siswa siap dicetak</strong><p>Periksa identitas dan simpan kartu untuk dibagikan kepada siswa.</p></div><button type="button" onclick="window.print()">Cetak Kartu</button></div><main class="card-container">${cards}</main></body></html>`;
}
