import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Plus, Save, Trash2 } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { ExamQuestion } from "./ExamQuestion";
import { ExamDialog } from "./ExamDialog";
import { RichImageDialog } from "./RichImageDialog";
import { contentHasValue } from "../../backend/rich-content";
import "../exam-design.css";

const elements: Record<string, string[]> = {
  Matematika: [
    "Bilangan",
    "Aljabar",
    "Geometri & Pengukuran",
    "Data & Ketidakpastian",
  ],
  "Bahasa Indonesia": [
    "Menemukan Informasi",
    "Memahami (Interpretasi & Integrasi)",
    "Mengevaluasi & Merefleksi",
  ],
};
type Option = { id: string | number; text: string };
export function QuestionEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: any;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [mapel, setMapel] = useState(initial?.mapel || "Matematika"),
    [element, setElement] = useState(initial?.element || "");
  const [type, setType] = useState(initial?.type || "Pilihan Ganda Sederhana");
  const [content, setContent] = useState(initial?.content || "");
  const [options, setOptions] = useState<Option[]>(
    initial?.options?.length
      ? initial.options.map((o: any, i: number) => ({
          id: o.id ?? `option-${i}`,
          text: o.text || "",
        }))
      : [0, 1, 2, 3].map((id) => ({ id, text: "" })),
  );
  const [key, setKey] = useState<number[]>(initial?.correctAnswer || []),
    [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<Record<string, boolean>>({}),
    [phone, setPhone] = useState(false),
    [preview, setPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const counter = useRef(0),
    saving = useRef(false),
    errorRef = useRef<HTMLDivElement>(null);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    if (saveError) errorRef.current?.focus();
  }, [saveError]);
  const status = (id: string, value: boolean) =>
    setBlocked((old) => (old[id] === value ? old : { ...old, [id]: value }));
  const remove = (index: number) => {
    if (options.length <= 2)
      return void toast.error("Minimal dua pilihan/pernyataan.");
    const removed = options[index]!;
    setOptions((old) => old.filter((_, i) => i !== index));
    status(String(removed.id), false);
    setKey((old) =>
      type === "Pilihan Ganda Kompleks Kategori"
        ? old.filter((_, i) => i !== index)
        : old.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
    );
  };
  const save = async () => {
    if (saving.current || Object.values(blocked).some(Boolean)) return;
    if (
      !contentHasValue(content) ||
      !element.trim() ||
      options.some((option) => !contentHasValue(option.text))
    )
      return void setSaveError(
        "Lengkapi isi soal, elemen, dan setiap pilihan jawaban. Pilihan boleh berupa gambar saja.",
      );
    if (
      (type === "Pilihan Ganda Sederhana" && key.length !== 1) ||
      (type === "Pilihan Ganda Kompleks" && !key.length) ||
      (type === "Pilihan Ganda Kompleks Kategori" &&
        (key.length !== options.length ||
          options.some((_, i) => key[i] !== 0 && key[i] !== 1)))
    )
      return void setSaveError("Lengkapi kunci jawaban sebelum menyimpan.");
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      const response = await fetch(
        initial?.id ? `/api/questions/${initial.id}` : "/api/questions",
        {
          method: initial?.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            mapel,
            element: element.trim(),
            content,
            options,
            correctAnswer: key,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || data.error || "Gagal menyimpan soal.");
      toast.success(
        initial?.id ? "Soal berhasil diperbarui." : "Soal berhasil disimpan.",
      );
      await onSaved();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Gagal menyimpan soal.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const question = {
    id: initial?.id || "preview-question",
    type,
    content: contentHasValue(content)
      ? content
      : "Tuliskan bacaan dan pertanyaan di editor untuk melihat pratinjau.",
    options,
  };
  return (
    <section className="question-authoring glass-panel p-8">
      <div className="report-heading">
        <div>
          <h2>{initial ? "Edit Soal" : "Tambah Soal"}</h2>
          <p>
            Susun bacaan, gambar, dan pertanyaan dalam satu editor. Pilihan dan
            kunci jawaban diatur di bawah.
          </p>
        </div>
        <button className="btn-secondary" disabled={busy} onClick={onCancel}>
          Batal
        </button>
      </div>
      <fieldset className="question-editor-fields" disabled={busy}>
        <div className="authoring-metadata">
          <label>
            Mata Pelajaran
            <select
              className="input-field"
              aria-label="Mata Pelajaran"
              value={mapel}
              onChange={(e) => {
                setMapel(e.target.value);
                setElement("");
              }}
            >
              <option>Matematika</option>
              <option>Bahasa Indonesia</option>
            </select>
          </label>
          <label>
            Elemen / Kompetensi
            <input
              className="input-field"
              aria-label="Elemen / Kompetensi"
              list="question-elements"
              value={element}
              onChange={(e) => setElement(e.target.value)}
              placeholder="Pilih atau tulis elemen"
            />
            <datalist id="question-elements">
              {elements[mapel]?.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </datalist>
          </label>
          <label>
            Bentuk Soal
            <select
              className="input-field"
              aria-label="Bentuk Soal"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setKey(
                  e.target.value === "Pilihan Ganda Kompleks Kategori"
                    ? options.map(() => 0)
                    : [],
                );
              }}
            >
              <option>Pilihan Ganda Sederhana</option>
              <option>Pilihan Ganda Kompleks</option>
              <option>Pilihan Ganda Kompleks Kategori</option>
            </select>
          </label>
        </div>
        <div className="authoring-columns">
          <div className="authoring-input">
            <h3>Isi soal</h3>
            <RichTextEditor
              value={content}
              onChange={setContent}
              label="Isi soal"
              disabled={busy}
              onBlocked={(value) => status("body", value)}
            />
            <div className="option-editor-heading">
              <h3>
                {type === "Pilihan Ganda Kompleks Kategori"
                  ? "Pernyataan & kunci"
                  : "Pilihan jawaban & kunci"}
              </h3>
              <button
                className="btn-secondary"
                onClick={() => {
                  setOptions((old) => [
                    ...old,
                    { id: `new-${++counter.current}`, text: "" },
                  ]);
                  if (type === "Pilihan Ganda Kompleks Kategori")
                    setKey((old) => [...old, 0]);
                }}
              >
                <Plus size={14} />
                Tambah pilihan
              </button>
            </div>
            {options.map((option, index) => (
              <section key={option.id} className="option-editor">
                <div className="option-editor-top">
                  <strong>Pilihan {String.fromCharCode(65 + index)}</strong>
                  {type === "Pilihan Ganda Kompleks Kategori" ? (
                    <select
                      aria-label={`Kunci pernyataan ${index + 1}`}
                      value={key[index] ?? ""}
                      onChange={(e) =>
                        setKey((old) => {
                          const next = [...old];
                          next[index] = Number(e.target.value);
                          return next;
                        })
                      }
                    >
                      <option value="" disabled>
                        Pilih kunci
                      </option>
                      <option value={0}>Benar</option>
                      <option value={1}>Salah</option>
                    </select>
                  ) : (
                    <label>
                      <input
                        type={
                          type === "Pilihan Ganda Sederhana"
                            ? "radio"
                            : "checkbox"
                        }
                        name="answer-key"
                        aria-label={`Kunci pilihan ${String.fromCharCode(65 + index)}`}
                        checked={key.includes(index)}
                        onChange={(e) =>
                          setKey((old) =>
                            type === "Pilihan Ganda Sederhana"
                              ? [index]
                              : e.target.checked
                                ? [...old, index]
                                : old.filter((i) => i !== index),
                          )
                        }
                      />
                      Jawaban benar
                    </label>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label={`Hapus pilihan ${String.fromCharCode(65 + index)}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <RichTextEditor
                  compact
                  disabled={busy}
                  label={`Pilihan ${String.fromCharCode(65 + index)}`}
                  value={option.text}
                  onChange={(text) =>
                    setOptions((old) =>
                      old.map((o) => (o.id === option.id ? { ...o, text } : o)),
                    )
                  }
                  onBlocked={(value) => status(String(option.id), value)}
                />
              </section>
            ))}
          </div>
          <aside className="authoring-preview">
            <div className="authoring-preview-heading">
              <h3>Pratinjau siswa</h3>
              <button
                className="btn-secondary"
                aria-pressed={phone}
                onClick={() => setPhone((v) => !v)}
              >
                {phone ? "Desktop" : "Ponsel"}
              </button>
            </div>
            <div
              className={`exam-workspace authoring-student${phone ? " phone" : ""}`}
            >
              <article className="exam-question-card">
                <div className="exam-question-top">
                  <h2>Soal 01</h2>
                </div>
                <div className="exam-question-body">
                  <ExamQuestion
                    question={question}
                    number={1}
                    answer={null}
                    disabled
                    onAnswer={() => {}}
                    onImage={setPreviewImage}
                  />
                </div>
              </article>
            </div>
          </aside>
        </div>
      </fieldset>
      {saveError && (
        <div
          className="teacher-save-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {saveError}
        </div>
      )}
      <div className="authoring-actions">
        <button className="btn-secondary" onClick={() => setPreview(true)}>
          <Eye size={16} />
          Lihat pratinjau lengkap
        </button>
        <button
          className="btn"
          disabled={busy || Object.values(blocked).some(Boolean)}
          onClick={() => void save()}
        >
          <Save size={16} />
          {busy ? "Menyimpan..." : "Simpan ke Bank Soal"}
        </button>
      </div>
      <ExamDialog
        open={preview}
        title="Pratinjau lengkap"
        className="question-preview-dialog"
        onClose={() => setPreview(false)}
      >
        <div className="exam-workspace authoring-student">
          <article className="exam-question-card">
            <div className="exam-question-body">
              <ExamQuestion
                question={{ ...question, id: `${question.id}-full` }}
                number={1}
                answer={null}
                disabled
                onAnswer={() => {}}
                onImage={setPreviewImage}
              />
            </div>
          </article>
        </div>
      </ExamDialog>
      <RichImageDialog
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </section>
  );
}
