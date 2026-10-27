import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import Mathematics from '@tiptap/extension-mathematics';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify, ImagePlus, List, ListOrdered, Table2, Undo2, Redo2, Sigma, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { encodeRichContent, safeImageUrl } from '../../backend/rich-content';
import type { RichDocument, RichNode } from '../../backend/rich-content';
import { editorDocument } from '../lib/rich-editor-content';
import '../rich-content.css';

const BlockLayout = Extension.create({
  name: 'blockLayout',
  addGlobalAttributes() { return [{ types: ['paragraph', 'heading'], attributes: { indent: { default: null, parseHTML: el => el.getAttribute('data-indent') === '1' ? 1 : null, renderHTML: attrs => attrs.indent == null ? {} : { 'data-indent': attrs.indent, style: `text-indent:${attrs.indent ? '1.65em' : '0'}` } } } }]; },
});
const PositionedImage = Image.extend({ parseHTML() { return [{ tag: 'img[src]', getAttrs: node => safeImageUrl((node as HTMLElement).getAttribute('src')) ? null : false }]; }, addAttributes() { return { ...this.parent?.(), align: { default: 'center', parseHTML: el => el.getAttribute('data-align'), renderHTML: attrs => ({ 'data-align': attrs.align }) }, width: { default: 100, parseHTML: el => Number(el.getAttribute('data-width')) || 100, renderHTML: attrs => ({ 'data-width': attrs.width, style: `width:${attrs.width}%` }) } }; },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]; },
});

export function RichTextEditor({ value, onChange, label, compact = false, onBlocked, legacyImage, onLegacyImageUsed }: {
  value: string; onChange: (value: string) => void; label: string; compact?: boolean; onBlocked?: (blocked: boolean) => void; legacyImage?: string; onLegacyImageUsed?: () => void;
}) {
  const [initial] = useState(() => editorDocument(value));
  const [layout, setLayout] = useState({ format: initial.format, indent: initial.indent, lineHeight: initial.lineHeight });
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const valueRef = useRef(value), changeRef = useRef(onChange), blockedRef = useRef(onBlocked);
  changeRef.current = onChange; blockedRef.current = onBlocked;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [formula, setFormula] = useState<{ latex: string; block: boolean; pos?: number } | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null), uploadController = useRef<AbortController | null>(null);
  const uploadAction = useRef<(file: File) => void>(() => {});
  const emit = (doc: RichNode, settings = layoutRef.current) => {
    try { const encoded = encodeRichContent({ version: 1, ...settings, doc }); setError(''); valueRef.current = encoded; changeRef.current(encoded); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Konten belum dapat disimpan.'); }
  };
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: false }), PositionedImage.configure({ allowBase64: false }), TextAlign.configure({ types: ['heading', 'paragraph'] }), BlockLayout, TableKit.configure({ table: { resizable: false } }), Mathematics.configure({
      katexOptions: { throwOnError: false, trust: false },
      inlineOptions: { onClick: (node, pos) => setFormula({ latex: node.attrs.latex, block: false, pos }) },
      blockOptions: { onClick: (node, pos) => setFormula({ latex: node.attrs.latex, block: true, pos }) },
    })],
    content: initial.doc,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', class: 'rich-document' },
      handlePaste: (_view, event) => { const file = event.clipboardData?.files[0]; if (!file) return false; event.preventDefault(); uploadAction.current(file); return true; },
      handleDrop: (view, event, _slice, moved) => { const file = event.dataTransfer?.files[0]; if (!file || moved) return false; event.preventDefault(); const at = view.posAtCoords({ left: event.clientX, top: event.clientY }); if (at) editor?.commands.setTextSelection(at.pos); uploadAction.current(file); return true; },
    },
    onUpdate: ({ editor, transaction }) => { if (transaction.docChanged) emit(editor.getJSON() as RichNode); },
  });
  useEffect(() => {
    if (!editor || value === valueRef.current) return;
    const doc = editorDocument(value); valueRef.current = value;
    const settings = { format: doc.format, indent: doc.indent, lineHeight: doc.lineHeight };
    layoutRef.current = settings; setLayout(settings); setError(''); editor.commands.setContent(doc.doc, { emitUpdate: false });
  }, [value, editor]);
  useEffect(() => { editor?.setEditable(!busy, false); }, [busy, editor]);
  useEffect(() => { blockedRef.current?.(busy || !!error); }, [busy, error]);
  useEffect(() => () => { uploadController.current?.abort(); blockedRef.current?.(false); }, []);
  const upload = async (file: File) => {
    if (!editor || editor.isDestroyed || busy || uploadController.current) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error('Gunakan PNG, JPEG, atau WebP maksimal 5 MB.'); return; }
    const at = editor.state.selection.from, controller = new AbortController(); uploadController.current = controller; setBusy(true);
    try {
      const form = new FormData(); form.append('image', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form, signal: controller.signal });
      const data = await response.json(); if (!response.ok || !safeImageUrl(data.imageUrl)) throw new Error(data.message || data.error || 'Gagal mengunggah gambar.');
      if (!editor.isDestroyed) editor.chain().focus().setTextSelection(at).setImage({ src: data.imageUrl, alt: file.name }).run();
    } catch (failure) { if (!controller.signal.aborted) toast.error(failure instanceof Error ? failure.message : 'Gagal mengunggah gambar.'); }
    finally { uploadController.current = null; if (!controller.signal.aborted) setBusy(false); }
  };
  uploadAction.current = file => { void upload(file); };
  const settings = (next: Partial<RichDocument>) => { const updated = { ...layoutRef.current, ...next } as typeof layout; layoutRef.current = updated; setLayout(updated); if (editor) emit(editor.getJSON() as RichNode, updated); };
  if (!editor) return <p>Memuat editor...</p>;
  const selectedImage = editor.isActive('image');
  const tools = [
    { label: 'Urungkan', icon: <Undo2 size={15} />, run: () => editor.chain().focus().undo().run() },
    { label: 'Ulangi', icon: <Redo2 size={15} />, run: () => editor.chain().focus().redo().run() },
    { label: 'Tebal', icon: <Bold size={15} />, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Miring', icon: <Italic size={15} />, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Garis bawah', icon: <Underline size={15} />, active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
    ...(!compact ? [
      { label: 'Rata kiri', icon: <AlignLeft size={15} />, run: () => editor.chain().focus().setTextAlign('left').run() },
      { label: 'Rata tengah', icon: <AlignCenter size={15} />, run: () => editor.chain().focus().setTextAlign('center').run() },
      { label: 'Rata kanan', icon: <AlignRight size={15} />, run: () => editor.chain().focus().setTextAlign('right').run() },
      { label: 'Rata kiri kanan', icon: <AlignJustify size={15} />, run: () => editor.chain().focus().setTextAlign('justify').run() },
      { label: 'Daftar poin', icon: <List size={15} />, run: () => editor.chain().focus().toggleBulletList().run() },
      { label: 'Daftar bernomor', icon: <ListOrdered size={15} />, run: () => editor.chain().focus().toggleOrderedList().run() },
      { label: 'Sisipkan tabel', icon: <Table2 size={15} />, run: () => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run() },
    ] : []),
    { label: 'Sisipkan gambar', icon: <ImagePlus size={15} />, run: () => uploadInput.current?.click() },
    { label: 'Sisipkan rumus', icon: <Sigma size={15} />, run: () => setFormula({ latex: '', block: false }) },
  ];
  return <div className={`wysiwyg-editor${compact ? ' compact' : ''}`}>
    {!compact && <div className="rich-settings"><label>Format <select aria-label={`Format ${label}`} disabled={busy} value={layout.format} onChange={event => settings({ format: event.target.value as RichDocument['format'] })}><option value="free">Bebas</option><option value="prose">Paragraf</option><option value="poem">Puisi</option></select></label><label>Jarak baris <select aria-label={`Jarak baris ${label}`} disabled={busy} value={layout.lineHeight} onChange={event => settings({ lineHeight: Number(event.target.value) })}><option value={1.6}>Rapat</option><option value={1.85}>Normal</option><option value={2.2}>Longgar</option></select></label><label><input type="checkbox" disabled={busy || layout.format !== 'prose'} checked={layout.indent} onChange={event => settings({ indent: event.target.checked })} />Inden awal</label></div>}
    <div className="rich-toolbar" role="toolbar" aria-label={`Alat format ${label}`}>
      {!compact && <select aria-label={`Gaya teks ${label}`} disabled={busy} value={editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'} onChange={event => event.target.value === 'p' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: event.target.value === 'h2' ? 2 : 3 }).run()}><option value="p">Teks biasa</option><option value="h2">Judul bagian</option><option value="h3">Subjudul</option></select>}
      {tools.map(tool => <button type="button" key={tool.label} title={tool.label} aria-label={`${tool.label} — ${label}`} aria-pressed={'active' in tool ? tool.active : undefined} disabled={busy} onMouseDown={event => event.preventDefault()} onClick={tool.run}>{tool.icon}</button>)}
      {!compact && <button type="button" disabled={busy} onClick={() => editor.chain().focus().updateAttributes('paragraph', { indent: editor.getAttributes('paragraph').indent ? 0 : 1 }).run()}>Inden</button>}
      {legacyImage && <button type="button" disabled={busy} onClick={() => { editor.chain().focus().setImage({ src: legacyImage, alt: 'Gambar soal' }).run(); onLegacyImageUsed?.(); }}>Sisipkan gambar lama di kursor</button>}
    </div>
    {editor.isActive('table') && <div className="rich-context-tools">{[['Tambah baris', () => editor.chain().focus().addRowAfter().run()], ['Tambah kolom', () => editor.chain().focus().addColumnAfter().run()], ['Hapus baris', () => editor.chain().focus().deleteRow().run()], ['Hapus tabel', () => editor.chain().focus().deleteTable().run()]].map(([text, run]) => <button key={String(text)} type="button" disabled={busy} onClick={run as () => void}>{String(text)}</button>)}</div>}
    {selectedImage && <div className="rich-context-tools"><label>Keterangan gambar <input aria-label={`Keterangan gambar ${label}`} disabled={busy} maxLength={250} value={editor.getAttributes('image').alt || ''} onChange={event => editor.commands.updateAttributes('image', { alt: event.target.value })} /></label><label>Posisi gambar <select aria-label={`Posisi gambar ${label}`} disabled={busy} value={editor.getAttributes('image').align || 'center'} onChange={event => editor.chain().focus().updateAttributes('image', { align: event.target.value }).run()}><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option></select></label><label>Lebar <select aria-label={`Lebar gambar ${label}`} disabled={busy} value={editor.getAttributes('image').width || 100} onChange={event => editor.chain().focus().updateAttributes('image', { width: Number(event.target.value) }).run()}>{[25, 50, 75, 100].map(width => <option key={width} value={width}>{width}%</option>)}</select></label><button type="button" disabled={busy} onClick={() => editor.chain().focus().deleteSelection().run()}><Trash2 size={14} />Hapus gambar</button></div>}
    {formula && <div className="rich-formula"><label>Rumus LaTeX<input aria-label={`Rumus LaTeX ${label}`} value={formula.latex} onChange={event => setFormula({ ...formula, latex: event.target.value })} placeholder="\\frac{1}{2}" /></label><label><input type="checkbox" checked={formula.block} disabled={formula.pos !== undefined} onChange={event => setFormula({ ...formula, block: event.target.checked })} />Baris tersendiri</label><button type="button" onClick={() => { const chain = editor.chain().focus(); if (formula.pos !== undefined) { if (formula.block) chain.updateBlockMath({ latex: formula.latex, pos: formula.pos }).run(); else chain.updateInlineMath({ latex: formula.latex, pos: formula.pos }).run(); } else if (formula.block) chain.insertBlockMath({ latex: formula.latex }).run(); else chain.insertInlineMath({ latex: formula.latex }).run(); setFormula(null); }}>Terapkan rumus</button><button type="button" onClick={() => setFormula(null)}>Batal rumus</button></div>}
    <div className={`rich-editor-surface format-${layout.format}${layout.indent ? ' with-indent' : ''}`} style={{ lineHeight: layout.lineHeight }}><EditorContent editor={editor} /></div>
    <input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Unggah gambar ${label}`} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
    {busy && <p className="rich-status" role="status">Mengunggah gambar... Tunggu sebelum menyimpan soal.</p>}{error && <p className="rich-status error" role="alert">{error}</p>}
    {!compact && <p className="rich-help">Enter: paragraf/bait baru · Shift+Enter: baris baru. Klik posisi tulisan lalu sisipkan gambar. Gambar dapat dipindahkan dengan seret atau potong/tempel.</p>}
  </div>;
}
