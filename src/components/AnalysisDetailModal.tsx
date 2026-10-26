import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, MinusCircle, Printer, AlertTriangle, TrendingUp, BarChart2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface AnalysisDetailModalProps {
  sessionId: string;
  onClose: () => void;
}

const AnalysisDetailModal: React.FC<AnalysisDetailModalProps> = ({ sessionId, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/analytics/${sessionId}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="glass-panel p-8 text-center animate-pulse">
          Memuat data analisis detail...
        </div>
      </div>
    );
  }

  if (!data || !data.session) {
    return (
      <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="glass-panel p-8 text-center">
          <p>Data tidak ditemukan.</p>
          <button className="btn mt-4" onClick={onClose}>Tutup</button>
        </div>
      </div>
    );
  }

  if (data.session.status !== 'selesai' || data.session.totalScore == null) {
    return (
      <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="glass-panel p-8 text-center">
          <p>Nilai belum tersedia. Laporan hasil dapat dibuka setelah ujian selesai dan nilai akhir tersedia.</p>
          <button className="btn mt-4" onClick={onClose}>Tutup</button>
        </div>
      </div>
    );
  }

  const { session, averageScore } = data;
  const questions = session.package.questions.map((pq: any) => pq.question);
  const answers = session.answers;

  let correctCount = 0;
  let wrongCount = 0;
  let emptyCount = 0;

  const elementStats: Record<string, { total: number, correct: number }> = {};

  questions.forEach((q: any) => {
    const el = q.element || 'Umum';
    if (!elementStats[el]) elementStats[el] = { total: 0, correct: 0 };
    elementStats[el].total += 1;

    const ans = answers.find((a: any) => a.questionId === q.id);
    if (!ans || ans.answerData === null || ans.answerData === undefined || ans.answerData === '') {
      emptyCount += 1;
    } else if (ans.isCorrect) {
      correctCount += 1;
      elementStats[el].correct += 1;
    } else {
      wrongCount += 1;
    }
  });

  const score = session.totalScore ? parseFloat(session.totalScore) : 0;
  
  let predikat = 'Perlu Latihan';
  if (score >= 90) predikat = 'Sangat Baik';
  else if (score >= 75) predikat = 'Baik';
  else if (score >= 60) predikat = 'Cukup';

  const startTime = new Date(session.startTime);
  const endTime = new Date(session.endTime);
  const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

  // Find lowest element
  let lowestElement = '';
  let lowestPercent = 100;
  Object.keys(elementStats).forEach(el => {
    const stat = elementStats[el];
    const pct = (stat.correct / stat.total) * 100;
    if (pct < lowestPercent) {
      lowestPercent = pct;
      lowestElement = el;
    }
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-center items-start z-50 overflow-y-auto print:bg-white print:overflow-visible">
      <div className="bg-white text-slate-800 w-full max-w-5xl my-8 p-8 rounded-xl shadow-2xl relative print:my-0 print:p-0 print:shadow-none" style={{ minHeight: '80vh' }}>
        
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 print:hidden">
          <X size={24} />
        </button>

        <div className="flex justify-between items-start mb-8 print:mb-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Laporan Hasil Try Out</h1>
            <p className="text-slate-500">Nama Siswa: <strong>{session.student.fullName}</strong> ({session.student.username})</p>
            <p className="text-slate-500">Sekolah: {session.student.school?.name || '-'}</p>
          </div>
          <div className="text-right print:hidden">
            <button className="btn flex items-center gap-2" onClick={handlePrint}>
              <Printer size={18} /> Cetak Laporan
            </button>
          </div>
        </div>

        {/* Section 1: Informasi Umum & Ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><BarChart2 size={18}/> Informasi Pengerjaan</h3>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <span className="text-slate-500">Mata Pelajaran</span>
              <strong className="text-right">{session.package.mapel}</strong>
              
              <span className="text-slate-500">Nama Paket</span>
              <strong className="text-right">{session.package.name}</strong>
              
              <span className="text-slate-500">Tanggal Ujian</span>
              <strong className="text-right">{startTime.toLocaleDateString('id-ID')}</strong>
              
              <span className="text-slate-500">Durasi Terpakai</span>
              <strong className="text-right">{durationMins} Menit</strong>
            </div>
          </div>
          
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 flex flex-col justify-center items-center text-center">
            <div className="text-5xl font-black text-blue-600 mb-2">{score.toFixed(1)}</div>
            <div className="text-lg font-semibold text-slate-700 mb-4">Predikat: {predikat}</div>
            
            <div className="flex gap-4 text-sm w-full justify-center">
              <div className="flex flex-col items-center"><CheckCircle size={20} className="text-green-500 mb-1"/> {correctCount} Benar</div>
              <div className="flex flex-col items-center"><XCircle size={20} className="text-red-500 mb-1"/> {wrongCount} Salah</div>
              <div className="flex flex-col items-center"><MinusCircle size={20} className="text-slate-400 mb-1"/> {emptyCount} Kosong</div>
            </div>
          </div>
        </div>

        {/* Section 2: Breakdown per Topik & Perbandingan */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg border border-slate-200">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><TrendingUp size={18}/> Analisis per Elemen</h3>
            <div className="flex flex-col gap-4">
              {Object.keys(elementStats).map(el => {
                const stat = elementStats[el];
                const pct = (stat.correct / stat.total) * 100;
                return (
                  <div key={el}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{el}</span>
                      <strong>{pct.toFixed(0)}% ({stat.correct}/{stat.total})</strong>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><AlertTriangle size={18}/> Rekomendasi Belajar</h3>
              {lowestElement ? (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded text-sm text-blue-800">
                  <p className="mb-2">Berdasarkan hasil ujian, kamu perlu lebih banyak berlatih pada materi <strong>{lowestElement}</strong>.</p>
                  <p>Skor penguasaan kamu di materi ini baru mencapai <strong>{lowestPercent.toFixed(0)}%</strong>.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Tidak ada rekomendasi khusus. Pertahankan prestasimu!</p>
              )}
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="font-semibold text-sm mb-2 text-slate-600">Perbandingan Skor Populasi</h4>
              <div className="flex items-center gap-4 text-sm">
                <div>Skor Kamu: <strong className="text-blue-600">{score.toFixed(1)}</strong></div>
                <div>Rata-rata: <strong className="text-slate-600">{averageScore.toFixed(1)}</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Review Butir Soal */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 print:break-inside-avoid">
          <h3 className="font-semibold text-lg mb-6">Review Detail Jawaban</h3>
          <div className="flex flex-col gap-6">
            {questions.map((q: any, i: number) => {
              const ans = answers.find((a: any) => a.questionId === q.id);
              const isCorrect = ans?.isCorrect;
              const hasAnswer = ans && ans.answerData;
              
              let statusLabel = 'Kosong';
              let statusColor = 'bg-slate-100 text-slate-600';
              if (hasAnswer) {
                if (isCorrect) {
                  statusLabel = 'Benar';
                  statusColor = 'bg-green-100 text-green-700';
                } else {
                  statusLabel = 'Salah';
                  statusColor = 'bg-red-100 text-red-700';
                }
              }

              return (
                <div key={q.id} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-semibold text-slate-700">Soal No. {i + 1}</div>
                    <div className={`text-xs px-2 py-1 rounded font-semibold ${statusColor}`}>
                      {statusLabel}
                    </div>
                  </div>
                  
                  <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider">{q.element} • {q.type}</div>
                  
                  <div className="text-slate-800 text-sm mb-4 bg-slate-50 p-4 rounded katex-container">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.content}</ReactMarkdown>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-red-50/50 rounded border border-red-100">
                      <div className="text-xs text-red-600 font-semibold mb-1">Jawaban Siswa</div>
                      <div className="text-slate-700 font-mono text-xs overflow-auto">
                        {hasAnswer ? JSON.stringify(ans.answerData) : '-'}
                      </div>
                    </div>
                    <div className="p-3 bg-green-50/50 rounded border border-green-100">
                      <div className="text-xs text-green-600 font-semibold mb-1">Kunci Jawaban</div>
                      <div className="text-slate-700 font-mono text-xs overflow-auto">
                        {q.correctAnswer === undefined ? 'Tidak ditampilkan untuk peran ini' : JSON.stringify(q.correctAnswer)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AnalysisDetailModal;
