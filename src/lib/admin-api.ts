export async function adminWrite(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.message ||
        data?.error ||
        "Data belum berhasil disimpan. Silakan coba lagi.",
    );
  return data;
}
export const roleNames: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  operator: "Operator Sekolah",
  guru: "Guru Penulis",
  siswa: "Siswa",
};
