import { Info, ZoomIn } from "lucide-react";
import { FormattedContent } from "./FormattedContent";
import { questionKind } from "../lib/exam-display";
import type { ExamQuestionData } from "../lib/exam-display";
import { contentText } from "../../backend/rich-content";

export function ExamQuestion({
  question,
  number,
  answer,
  disabled,
  onAnswer,
  onImage,
}: {
  question: ExamQuestionData;
  number: number;
  answer: unknown;
  disabled: boolean;
  onAnswer: (answer: unknown) => void;
  onImage: (url: string) => void;
}) {
  const kind = questionKind(question),
    options = Array.isArray(question.options) ? question.options : [];
  const selected = Array.isArray(answer) ? answer : [];
  const instruction =
    kind === "multiple"
      ? "Pilih semua jawaban yang benar. Jawaban dapat lebih dari satu."
      : kind === "category"
        ? "Tentukan Benar atau Salah untuk setiap pernyataan."
        : "Pilih satu jawaban yang paling tepat.";
  return (
    <>
      <p className="exam-instruction">
        <Info size={14} />
        {instruction}
      </p>
      <div className="exam-question-content exam-markdown">
        <FormattedContent
          onImage={onImage}
          value={
            question.content ||
            "Isi soal belum tersedia. Hubungi operator sekolah."
          }
        />
      </div>
      {question.imageUrl && (
        <figure className="exam-figure">
          <button
            type="button"
            onClick={() => onImage(question.imageUrl!)}
            aria-label={`Perbesar gambar soal ${number}`}
          >
            <img src={question.imageUrl} alt={`Gambar soal ${number}`} />
            <span>
              <ZoomIn size={14} />
              Perbesar gambar
            </span>
          </button>
        </figure>
      )}
      {(kind === "single" || kind === "multiple") && (
        <fieldset className="exam-options" disabled={disabled}>
          <legend>
            {kind === "single"
              ? "Pilihan jawaban"
              : "Pilih semua jawaban yang benar"}
          </legend>
          {options.map((option, index) => {
            const checked =
              kind === "single" ? answer === index : selected.includes(index);
            return (
              <label
                className={`exam-option${checked ? " selected" : ""}`}
                key={option.id ?? index}
              >
                <span className="exam-option-letter" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <div
                  id={`option-${question.id}-${index}`}
                  className="exam-option-text exam-markdown"
                >
                  <FormattedContent
                    value={option.text || `Pilihan ${index + 1}`}
                    inline
                    onImage={onImage}
                  />
                </div>
                <input
                  type={kind === "single" ? "radio" : "checkbox"}
                  name={`question-${question.id}`}
                  aria-label={`Pilihan ${String.fromCharCode(65 + index)}`}
                  aria-describedby={`option-${question.id}-${index}`}
                  checked={checked}
                  onChange={(event) =>
                    onAnswer(
                      kind === "single"
                        ? index
                        : event.target.checked
                          ? [...selected, index]
                          : selected.filter((value) => value !== index),
                    )
                  }
                />
              </label>
            );
          })}
        </fieldset>
      )}
      {kind === "category" && (
        <div className="exam-category">
          <div className="exam-category-heading" aria-hidden="true">
            <span>Pernyataan</span>
            <span>Benar</span>
            <span>Salah</span>
          </div>
          {options.map((option, index) => (
            <fieldset
              className="exam-category-row"
              key={option.id ?? index}
              disabled={disabled}
            >
              <legend>
                Pernyataan {index + 1}:{" "}
                {contentText(option.text || `Pernyataan ${index + 1}`)}
              </legend>
              <div className="exam-category-text exam-markdown">
                <FormattedContent
                  value={option.text || `Pernyataan ${index + 1}`}
                  onImage={onImage}
                />
              </div>
              {["Benar", "Salah"].map((label, value) => (
                <label key={label}>
                  <input
                    type="radio"
                    name={`category-${question.id}-${index}`}
                    aria-label={`Pernyataan ${index + 1}: ${label}`}
                    checked={selected[index] === value}
                    onChange={() => {
                      const updated = [...selected];
                      updated[index] = value;
                      onAnswer(updated);
                    }}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      {kind === "unknown" && (
        <p className="exam-notice" role="alert">
          Jenis soal ini belum didukung. Hubungi operator sebelum melanjutkan.
        </p>
      )}
    </>
  );
}
