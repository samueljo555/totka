import { useEffect, useState } from 'react';
import { ExamDialog } from './ExamDialog';
export function RichImageDialog({ src, onClose }: { src: string | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(100);
  useEffect(() => setZoom(100), [src]);
  return <ExamDialog open={!!src} title="Gambar soal" className="rich-image-dialog" onClose={onClose}><div className="rich-image-controls"><button type="button" aria-label="Perkecil gambar" disabled={zoom <= 100} onClick={() => setZoom(value => Math.max(100, value - 25))}>−</button><span>{zoom}%</span><button type="button" aria-label="Perbesar gambar" disabled={zoom >= 300} onClick={() => setZoom(value => Math.min(300, value + 25))}>+</button></div><div className="rich-image-viewport">{src && <img src={src} alt="Gambar soal diperbesar" style={{ width: `${zoom}%`, maxWidth: 'none', height: 'auto' }} />}</div></ExamDialog>;
}
