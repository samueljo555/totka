export interface ExamQuestionData {
  id: string; type?: string; content?: string; imageUrl?: string | null;
  options?: { id?: string | number; text?: string }[];
  reading?: { title: string; content: string } | null;
}
export function questionKind(question?: ExamQuestionData) {
  const type = question?.type || 'Pilihan Ganda Sederhana';
  if (['Pilihan Ganda Sederhana', 'PG_Sederhana'].includes(type)) return 'single';
  if (['Pilihan Ganda Kompleks', 'PG_Kompleks'].includes(type)) return 'multiple';
  if (['Pilihan Ganda Kompleks Kategori', 'PG_Kategori'].includes(type)) return 'category';
  return 'unknown';
}
export function questionTypeLabel(question?: ExamQuestionData) {
  return { single: 'Pilihan Ganda', multiple: 'Pilihan Ganda Kompleks', category: 'Benar / Salah', unknown: question?.type || 'Soal' }[questionKind(question)];
}
