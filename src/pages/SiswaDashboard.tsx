import toast from "react-hot-toast";
import { useState, useEffect, useRef } from "react";
import { AnswerSync } from "../lib/answer-sync";
import type { SyncSnapshot } from "../lib/answer-sync";
import {
  savedExamToken,
  rememberExamToken,
  forgetExamToken,
  visibleScore,
} from "../lib/student-session";
import { ImageModal } from "../components/ImageModal";
import { ExamWorkspace } from "../components/ExamWorkspace";
import { StudentHome } from "../components/student/StudentHome";
import {
  StudentResult,
  StudentSessionEnded,
} from "../components/student/StudentOutcome";
import "../student-design.css";
import "katex/dist/katex.min.css";

const SiswaDashboard = ({
  user,
  onLogout,
}: {
  user?: any;
  onLogout: () => void;
}) => {
  const [studentProfile, setStudentProfile] = useState(user);
  const [hasEnteredToken, setHasEnteredToken] = useState(false);
  const [token, setToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState(""),
    [finishError, setFinishError] = useState("");
  const startRequest = useRef<AbortController | null>(null);

  // Engine State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const hasAnswer = (value: any) =>
    value !== undefined &&
    value !== null &&
    (Array.isArray(value)
      ? value.some((item) => item !== null && item !== undefined)
      : typeof value === "number");
  const answeredCount = Object.values(answers).filter(hasAnswer).length;
  const [timeLeft, setTimeLeft] = useState(90 * 60); // 90 minutes
  const [isFinished, setIsFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [releaseScoreMode, setReleaseScoreMode] = useState<string>("langsung");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const sync = useRef<AnswerSync | null>(null);
  const finishResult = useRef<(session: any, rejected?: boolean) => void>(
    () => {},
  );
  const startAttempt = useRef(0);
  const startHandler = useRef<(value: string) => Promise<void>>(async () => {});
  const deadlineAt = useRef<number | null>(null);
  const finishHandler = useRef<(expired?: boolean) => Promise<void>>(
    async () => {},
  );
  const finishedRef = useRef(false);
  const [examInfo, setExamInfo] = useState<{
    name?: string;
    mapel?: string;
    durationMinutes?: number;
  }>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Offline & Auto-Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncSnapshot | null>(null);

  // Single Device Policy State (Kicked)
  const [kickedData, setKickedData] = useState<{
    show: boolean;
    message: string;
  } | null>(null);

  // Server supplies the remaining budget. A monotonic clock avoids local wall-clock changes
  // and interval drift when the browser tab is throttled. The server enforces the deadline.
  useEffect(() => {
    if (!hasEnteredToken || isFinished || kickedData) return;
    let lastAttempt = -Infinity;
    const tick = () => {
      if (deadlineAt.current === null) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadlineAt.current - performance.now()) / 1000),
      );
      setTimeLeft(remaining);
      if (
        remaining === 0 &&
        navigator.onLine &&
        performance.now() - lastAttempt >= 5000
      ) {
        lastAttempt = performance.now();
        void finishHandler.current(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hasEnteredToken, isFinished, kickedData]);

  const acceptFinishedSession = (session: any, rejected = false) => {
    if (session?.status !== "selesai") return;
    if (rejected || (sync.current?.snapshot().pendingCount || 0) > 0) {
      toast.error(
        "Ujian telah ditutup. Jawaban yang belum diterima server sebelum batas waktu tidak dinilai.",
        { duration: 8000 },
      );
    }
    finishedRef.current = true;
    setReleaseScoreMode(session.releaseScoreMode || "ditunda");
    setFinalScore(visibleScore(session.totalScore));
    setIsFinished(true);
    forgetExamToken();
    try {
      if (sessionId)
        sessionStorage.removeItem(`tka_exam_review_v1_${sessionId}`);
    } catch {
      /* Optional review marks cannot block finalization. */
    }
    sync.current?.complete();
  };

  // Listeners call the current engine, so closures never retain an old queue.
  useEffect(() => {
    const online = () => {
      setIsOnline(true);
      sync.current?.wake();
    };
    const offline = () => {
      setIsOnline(false);
      sync.current?.wake();
    };
    const storage = () => sync.current?.refresh();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("storage", storage);
      startAttempt.current += 1;
      startRequest.current?.abort();
      startRequest.current = null;
      sync.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!hasEnteredToken || isFinished || kickedData || !user?.id) return;
    const heartbeat = async () => {
      if (!navigator.onLine) return;
      try {
        const response = await fetch(
          `/api/auth/session-check?studentId=${user.id}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (response.status === 401) {
          const data = await response.json();
          sync.current?.dispose();
          setKickedData({
            show: true,
            message: data.message || "Sesi login tidak aktif.",
          });
        }
      } catch {
        /* Heartbeat failure does not mean navigator is offline. */
      }
    };
    const timer = setInterval(() => {
      void heartbeat();
    }, 15000);
    return () => clearInterval(timer);
  }, [hasEnteredToken, isFinished, kickedData, user?.id]);
  useEffect(() => {
    if (kickedData) sync.current?.dispose();
  }, [kickedData]);

  const handleAnswer = (qNumber: number, answer: any) => {
    if (
      kickedData ||
      submittingRef.current ||
      finishedRef.current ||
      (deadlineAt.current !== null && performance.now() >= deadlineAt.current)
    )
      return;
    const question = questions[qNumber - 1];
    if (!question || !sync.current) return;
    try {
      sync.current.enqueue(question.id, answer);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Jawaban belum dapat disimpan.",
      );
    }
  };

  const startExamWithToken = async (examToken: string) => {
    if (startRequest.current || finishedRef.current || kickedData) return;
    if (examToken.trim().length < 3) {
      setErrorMsg("Masukkan token ujian minimal 3 karakter.");
      return;
    }
    const controller = new AbortController();
    startRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort("timeout"), 15000);
    const attempt = ++startAttempt.current;
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-session-token": user?.activeToken || "",
          "x-student-id": user?.id || "",
        },
        body: JSON.stringify({
          studentId: user.id,
          token: examToken,
          sessionToken: user?.activeToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (attempt !== startAttempt.current) return;

      if (res.status === 401) {
        setKickedData({
          show: true,
          message:
            data?.message || "Sesi login tidak aktif. Silakan masuk kembali.",
        });
        return;
      }

      if (!res.ok) {
        forgetExamToken();
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Ujian belum dapat dimulai. Periksa token atau coba lagi.",
        );
      }

      const remainingBudget = Number(data?.remainingSeconds);
      if (
        !data?.session ||
        typeof data.session.id !== "string" ||
        !data.session.id ||
        !["sedang_mengerjakan", "selesai"].includes(data.session.status) ||
        !Array.isArray(data.questions) ||
        data.questions.some(
          (q: any) => !q || typeof q.id !== "string" || !q.id,
        ) ||
        new Set(data.questions.map((q: any) => q.id)).size !==
          data.questions.length ||
        (data.session.status === "sedang_mengerjakan" &&
          !data.questions.length) ||
        !Number.isInteger(remainingBudget) ||
        remainingBudget < 0
      )
        throw new Error(
          "Data ujian belum dapat dimuat dengan lengkap. Silakan coba lagi.",
        );
      const stored = rememberExamToken(examToken, user.id);
      setSessionNotice(
        stored
          ? ""
          : "Sesi tidak dapat dilanjutkan otomatis setelah halaman dimuat ulang. Simpan token Anda untuk masuk kembali.",
      );

      if (data.student?.id === user.id) setStudentProfile(data.student);
      setSessionId(data.session.id);
      setExamInfo(data.package || {});
      setCurrentQuestion(1);
      setQuestions(data.questions || []);
      setReleaseScoreMode(
        data.session.releaseScoreMode ||
          data.package?.releaseScoreMode ||
          "ditunda",
      );

      sync.current?.dispose();
      const engine = new AnswerSync({
        sessionId: data.session.id,
        questionIds: data.questions.map((q: any) => q.id),
        existingAnswers: data.existingAnswers || [],
        storage: {
          getItem: (key) => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
          removeItem: (key) => localStorage.removeItem(key),
        },
        online: () => navigator.onLine,
        canSend: () =>
          deadlineAt.current !== null &&
          performance.now() < deadlineAt.current &&
          !finishedRef.current,
        send: (answer, signal) =>
          fetch(`/api/sessions/${data.session.id}/answer`, {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: answer.questionId,
              answerData: answer.answerData,
              version: answer.version,
              mutationId: answer.mutationId,
            }),
          }),
        onChange: (snapshot) => {
          const loaded: Record<number, any> = {};
          data.questions.forEach((q: any, index: number) => {
            if (Object.hasOwn(snapshot.answers, q.id))
              loaded[index + 1] = snapshot.answers[q.id];
          });
          setAnswers(loaded);
          setSyncStatus(snapshot);
        },
        onClosed: (session) => finishResult.current(session, true),
        onAuthError: (message) => setKickedData({ show: true, message }),
      });
      sync.current = engine;

      const remaining = Math.max(0, Number(data.remainingSeconds));
      deadlineAt.current = performance.now() + remaining * 1000;
      setTimeLeft(remaining);

      setHasEnteredToken(true);
      if (data.session.status === "selesai") {
        finishedRef.current = true;
        if (engine.snapshot().pendingCount)
          toast.error(
            "Waktu ujian telah berakhir. Jawaban offline yang belum diterima server tidak dinilai.",
            { duration: 8000 },
          );
        engine.complete();
        forgetExamToken();
        try {
          sessionStorage.removeItem(`tka_exam_review_v1_${data.session.id}`);
        } catch {
          /* Optional review marks cannot block finalization. */
        }
        setFinalScore(visibleScore(data.session.totalScore));
        setIsFinished(true);
      } else engine.wake();
    } catch (err: any) {
      if (attempt === startAttempt.current)
        setErrorMsg(
          controller.signal.reason === "timeout"
            ? "Permintaan terlalu lama. Silakan coba lagi."
            : err instanceof TypeError
              ? "Tidak dapat terhubung. Periksa koneksi internet Anda, lalu coba lagi."
              : err.message || "Ujian belum dapat dimulai.",
        );
    } finally {
      window.clearTimeout(timeout);
      if (startRequest.current === controller) startRequest.current = null;
      if (attempt === startAttempt.current) setIsLoading(false);
    }
  };

  startHandler.current = startExamWithToken;
  const handleStartExam = () => startExamWithToken(token);

  useEffect(() => {
    const savedToken = savedExamToken(user?.id);
    if (savedToken) {
      setToken(savedToken);
      void startHandler.current(savedToken);
    }
  }, [user?.id]);

  const handleFinishExam = async (expired = false) => {
    if (
      !sessionId ||
      kickedData ||
      submittingRef.current ||
      finishedRef.current
    )
      return;
    if (!navigator.onLine) {
      if (!expired)
        toast.error(
          "Koneksi terputus. Hubungkan kembali untuk memastikan hasil ujian.",
        );
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    setFinishError("");
    try {
      if (!expired) {
        const snapshot = await sync.current?.flush();
        if (finishedRef.current) return;
        expired =
          deadlineAt.current !== null &&
          performance.now() >= deadlineAt.current;
        if (
          !expired &&
          (!snapshot || snapshot.pendingCount > 0 || snapshot.recoveryError)
        ) {
          toast.error(
            "Masih ada jawaban yang belum dikonfirmasi. Periksa status penyimpanan dan coba kembali.",
          );
          return;
        }
      }
      const res = await fetch(`/api/sessions/${sessionId}/finish`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          "x-session-token": user?.activeToken || "",
          "x-student-id": user?.id || "",
        },
        body: JSON.stringify({
          expectedAnswers: sync.current?.manifest() || [],
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        setKickedData({
          show: true,
          message: data?.message || "Sesi login tidak aktif.",
        });
        return;
      }
      if (!res.ok || data?.status !== "selesai")
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Penyelesaian ujian belum terkonfirmasi. Periksa koneksi dan coba lagi.",
        );
      acceptFinishedSession(data, expired);
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Tidak dapat terhubung. Periksa koneksi internet Anda, lalu coba selesaikan lagi."
          : error instanceof Error
            ? error.message
            : "Ujian belum berhasil diselesaikan.";
      setFinishError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  finishHandler.current = handleFinishExam;
  finishResult.current = acceptFinishedSession;

  const exit = () => {
    forgetExamToken();
    onLogout();
  };
  if (kickedData)
    return <StudentSessionEnded message={kickedData.message} onExit={exit} />;
  if (!hasEnteredToken)
    return (
      <StudentHome
        user={studentProfile}
        token={token}
        onToken={setToken}
        onStart={handleStartExam}
        loading={isLoading}
        error={errorMsg}
        online={isOnline}
        onExit={exit}
      />
    );
  if (isFinished)
    return (
      <StudentResult
        user={studentProfile}
        exam={examInfo}
        score={finalScore}
        release={releaseScoreMode}
        onExit={exit}
      />
    );
  return (
    <>
      <ExamWorkspace
        key={sessionId}
        sessionId={sessionId!}
        user={studentProfile}
        exam={examInfo}
        questions={questions}
        current={currentQuestion}
        answers={answers}
        answeredCount={answeredCount}
        remaining={timeLeft}
        online={isOnline}
        submitting={isSubmitting}
        snapshot={syncStatus}
        sessionNotice={sessionNotice}
        finishError={finishError}
        onNavigate={setCurrentQuestion}
        onAnswer={handleAnswer}
        onRetry={() => sync.current?.retry()}
        onResolve={(id, choice) => sync.current?.resolve(id, choice)}
        onFinish={() => handleFinishExam()}
        onImage={setPreviewImage}
      />
      <ImageModal
        isOpen={!!previewImage}
        imageUrl={previewImage}
        altText={`Gambar Soal No. ${currentQuestion}`}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
};
export default SiswaDashboard;
