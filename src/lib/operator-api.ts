export async function writeStudent(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const duplicate = data?.error === "Siswa with this NISN already exists";
    throw new Error(
      data?.message ||
        (duplicate
          ? "NISN sudah terdaftar. Periksa kembali data siswa."
          : "Data siswa belum berhasil diproses. Silakan coba lagi."),
    );
  }
  return data;
}
export const validClasses = (data: string[]) =>
  Array.isArray(data) && data.every((value) => typeof value === "string");
