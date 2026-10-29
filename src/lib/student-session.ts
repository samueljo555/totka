// One atomic record scopes optional tab recovery to the authenticated student.
// AnswerSync keeps its separate durable answer storage and versioning unchanged.
export function savedExamToken(studentId?: string): string | null {
  if (!studentId) return null;
  try {
    const value = sessionStorage.getItem("activeExamToken");
    if (!value) return null;
    const record = JSON.parse(value);
    if (
      record?.studentId === studentId &&
      typeof record.token === "string" &&
      record.token.trim().length >= 3
    )
      return record.token;
  } catch {
    /* Malformed or unavailable optional storage cannot prevent login. */
  }
  forgetExamToken();
  return null;
}
export function rememberExamToken(token: string, studentId: string): boolean {
  try {
    sessionStorage.setItem(
      "activeExamToken",
      JSON.stringify({ studentId, token }),
    );
    return true;
  } catch {
    return false;
  }
}
export function forgetExamToken(): void {
  try {
    sessionStorage.removeItem("activeExamToken");
  } catch {
    /* Server finalization cannot depend on optional browser storage. */
  }
}
export function visibleScore(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= 100
    ? result
    : null;
}
