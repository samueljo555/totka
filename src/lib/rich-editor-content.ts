import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { parseRichContent } from '../../backend/rich-content';
import type { RichDocument, RichNode } from '../../backend/rich-content';

/** Conversion is local to the editor. Merely opening an old question never rewrites it. */
export function editorDocument(value: string): RichDocument {
  const existing = parseRichContent(value); if (existing) return existing;
  const ast = unified().use(remarkParse).use(remarkMath).parse(value);
  const convert = (node: any): RichNode[] => {
    const content: RichNode[] = (node.children || []).flatMap(convert);
    switch (node.type) {
      case 'root': return [{ type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }];
      case 'paragraph': { const blocks: RichNode[] = []; let run: RichNode[] = []; for (const part of content) { if (part.type === 'image') { if (run.length) blocks.push({ type: 'paragraph', content: run }); run = []; blocks.push(part); } else run.push(part); } if (run.length || !blocks.length) blocks.push({ type: 'paragraph', content: run }); return blocks; }
      case 'heading': return [{ type: 'heading', attrs: { level: node.depth > 2 ? 3 : 2 }, content }];
      case 'text': return String(node.value).split('\n').flatMap((text, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(text ? [{ type: 'text', text }] : [])]);
      case 'break': return [{ type: 'hardBreak' }];
      case 'image': return [{ type: 'image', attrs: { src: node.url, alt: node.alt || 'Gambar', width: 100, align: 'center' } }];
      case 'strong': case 'emphasis': case 'delete': return content.map(part => part.type === 'text' ? { ...part, marks: [...(part.marks || []), { type: node.type === 'strong' ? 'bold' : node.type === 'emphasis' ? 'italic' : 'strike' }] } : part);
      case 'inlineMath': case 'math': return [{ type: node.type === 'math' ? 'blockMath' : 'inlineMath', attrs: { latex: node.value } }];
      case 'inlineCode': return [{ type: 'text', text: node.value, marks: [{ type: 'code' }] }];
      case 'code': return [{ type: 'codeBlock', content: node.value ? [{ type: 'text', text: node.value }] : [] }];
      case 'blockquote': return [{ type: 'blockquote', content }];
      case 'list': return [{ type: node.ordered ? 'orderedList' : 'bulletList', attrs: node.ordered ? { start: node.start || 1 } : {}, content }];
      case 'listItem': return [{ type: 'listItem', content }];
      case 'thematicBreak': return [{ type: 'horizontalRule' }];
      case 'link': return [...content, { type: 'text', text: ` (${node.url})` }];
      default: return content.length ? content : node.value ? [{ type: 'text', text: node.value }] : [];
    }
  };
  return { version: 1, format: 'free', indent: false, lineHeight: 1.85, doc: convert(ast)[0]! };
}
