import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katex from 'katex';
import { parseRichContent, RICH_PREFIX, safeImageUrl } from '../../backend/rich-content';
import type { RichNode } from '../../backend/rich-content';
import '../rich-content.css';

export function FormattedContent({ value, onImage, inline = false }: { value: string; onImage?: (src: string) => void; inline?: boolean }) {
  const data = parseRichContent(value);
  if (!data) return value.startsWith(RICH_PREFIX) ? <span role="alert">Konten belum dapat ditampilkan. Hubungi operator.</span> : <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{
    ...(inline ? { p: ({ children }: { children?: ReactNode }) => <span className="exam-markdown-line">{children}</span> } : {}),
    img: ({ src, alt }) => src && safeImageUrl(src) ? <img src={src} alt={alt || 'Gambar'} className={onImage ? 'rich-zoomable' : undefined} onClick={onImage ? event => { event.preventDefault(); event.stopPropagation(); onImage(src); } : undefined} /> : null,
  }}>{value}</ReactMarkdown>;
  const render = (node: RichNode, key: number): ReactNode => {
    const parts = node.content?.map(render), a = node.attrs || {};
    const style = { ...(a.textAlign ? { textAlign: a.textAlign } : {}), ...(a.indent != null ? { textIndent: a.indent ? '1.65em' : '0' } : {}) } as CSSProperties;
    switch (node.type) {
      case 'text': return <Fragment key={key}>{(node.marks || []).reduce<ReactNode>((text, mark) => mark.type === 'bold' ? <strong>{text}</strong> : mark.type === 'italic' ? <em>{text}</em> : mark.type === 'underline' ? <u>{text}</u> : mark.type === 'strike' ? <s>{text}</s> : <code>{text}</code>, node.text)}</Fragment>;
      case 'paragraph': return <p key={key} style={style}>{parts?.length ? parts : <br />}</p>;
      case 'heading': return a.level === 3 ? <h3 key={key} style={style}>{parts}</h3> : <h2 key={key} style={style}>{parts}</h2>;
      case 'hardBreak': return <br key={key} />;
      case 'bulletList': return <ul key={key}>{parts}</ul>;
      case 'orderedList': return <ol key={key} start={Number(a.start) || 1}>{parts}</ol>;
      case 'listItem': return <li key={key}>{parts}</li>;
      case 'blockquote': return <blockquote key={key}>{parts}</blockquote>;
      case 'codeBlock': return <pre key={key}><code>{parts}</code></pre>;
      case 'horizontalRule': return <hr key={key} />;
      case 'image': return <figure key={key} className={`rich-image align-${a.align || 'center'}`} style={{ width: `${a.width || 100}%` }}><img src={String(a.src)} alt={String(a.alt || 'Gambar')} className={onImage ? 'rich-zoomable' : undefined} tabIndex={onImage ? 0 : undefined} role={onImage ? 'button' : undefined} aria-label={onImage ? `Perbesar ${a.alt || 'gambar'}` : undefined} onClick={onImage ? event => { event.preventDefault(); event.stopPropagation(); onImage(String(a.src)); } : undefined} onKeyDown={onImage ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onImage(String(a.src)); } } : undefined} /></figure>;
      case 'table': return <div key={key} className="rich-table-scroll"><table><tbody>{parts}</tbody></table></div>;
      case 'tableRow': return <tr key={key}>{parts}</tr>;
      case 'tableCell': return <td key={key} colSpan={Number(a.colspan)} rowSpan={Number(a.rowspan)}>{parts}</td>;
      case 'tableHeader': return <th key={key} colSpan={Number(a.colspan)} rowSpan={Number(a.rowspan)}>{parts}</th>;
      case 'inlineMath': case 'blockMath': return <span key={key} className={node.type === 'blockMath' ? 'rich-math-block' : 'rich-math'} dangerouslySetInnerHTML={{ __html: katex.renderToString(String(a.latex || ''), { throwOnError: false, trust: false, displayMode: node.type === 'blockMath' }) }} />;
      default: return null;
    }
  };
  return <div className={`rich-document format-${data.format}${data.indent ? ' with-indent' : ''}`} style={{ lineHeight: data.lineHeight }}>{data.doc.content?.map(render)}</div>;
}
