import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { readAllPages, readJson } from "./paging";
import { loginCardDocument } from "./login-card-print";
import type { PrintableStudent } from "./login-card-print";

export function useLoginCardPrint(
  schoolName: string,
  schoolNpsn: string,
  active: boolean,
) {
  const [progress, setProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const task = useRef<{ controller: AbortController; popup: Window } | null>(
    null,
  );
  useEffect(() => {
    setProgress(null);
    return () => {
      const pending = task.current;
      task.current = null;
      pending?.controller.abort();
      pending?.popup.close();
    };
  }, [active]);
  const print = async (studentId?: string) => {
    if (!active || task.current) return;
    const popup = window.open("", "_blank");
    if (!popup)
      return void toast.error(
        "Pop-up diblokir. Izinkan pop-up untuk mencetak kartu login.",
      );
    popup.opener = null;
    popup.document.title = "Menyiapkan kartu login";
    popup.document.body.textContent =
      "Menyiapkan kartu login siswa. Tunggu hingga seluruh data selesai dimuat.";
    const controller = new AbortController(),
      current = { controller, popup };
    task.current = current;
    setProgress({ loaded: 0, total: 0 });
    try {
      const cards = studentId
        ? [
            await readJson<PrintableStudent>(
              `/api/users/${encodeURIComponent(studentId)}/login-card`,
              controller.signal,
            ),
          ]
        : await readAllPages<PrintableStudent>(
            "/api/users/login-cards",
            {},
            {
              signal: controller.signal,
              onProgress: (loaded, total) => {
                if (task.current === current) setProgress({ loaded, total });
              },
            },
          );
      controller.signal.throwIfAborted();
      if (!cards.length) throw new Error("Belum ada data siswa untuk dicetak.");
      const missing = cards.filter((student) => !student.loginPassword).length;
      if (missing)
        throw new Error(
          `${missing} siswa belum memiliki password kartu. Gunakan Atur ulang pada siswa tersebut sebelum mencetak.`,
        );
      if (popup.closed)
        throw new Error(
          "Jendela kartu sudah ditutup. Silakan pilih cetak kembali.",
        );
      popup.document.open();
      popup.document.write(loginCardDocument(cards, schoolName, schoolNpsn));
      popup.document.close();
      toast.success(
        `${cards.length} kartu login siap. Gunakan tombol Cetak Kartu pada jendela yang terbuka.`,
      );
    } catch (error) {
      popup.close();
      if (!controller.signal.aborted)
        toast.error(
          error instanceof Error ? error.message : "Gagal memuat kartu login.",
        );
    } finally {
      if (task.current === current) {
        task.current = null;
        setProgress(null);
      }
    }
  };
  return { print, progress };
}
