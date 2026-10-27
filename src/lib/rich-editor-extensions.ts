import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import katex from 'katex';
import { FONT_SIZES } from '../../backend/rich-content';

export const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() { return { size: { default: 16, renderHTML: () => ({}) } }; },
  parseHTML() { return [{ style: 'font-size', getAttrs: value => {
    const size = Number(String(value).replace(/px$/, ''));
    return FONT_SIZES.includes(size as typeof FONT_SIZES[number]) ? { size } : false;
  } }]; },
  renderHTML({ mark, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-font-size': mark.attrs.size, style: `font-size:${mark.attrs.size}px` }), 0];
  },
});

export function applyFontSize(editor: Editor, value: string) {
  // Native selectionchange can arrive after a fast keyboard selection + toolbar change.
  // Read the visible range before applying the mark so the selected characters agree.
  const selection = editor.view.dom.ownerDocument.getSelection();
  if (selection?.anchorNode && selection.focusNode && editor.view.dom.contains(selection.anchorNode) && editor.view.dom.contains(selection.focusNode)) {
    const from = editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset), to = editor.view.posAtDOM(selection.focusNode, selection.focusOffset);
    editor.commands.setTextSelection({ from: Math.min(from, to), to: Math.max(from, to) });
  }
  const chain = editor.chain().focus();
  return value ? chain.setMark('fontSize', { size: Number(value) }).run() : chain.unsetMark('fontSize').run();
}

/** Convert only a complete LaTeX suffix at the cursor; leave ordinary/incomplete text intact. */
function convertMath(editor: Editor, space: boolean): boolean {
  const { state, view } = editor, { $from, empty } = state.selection;
  if (!editor.isEditable || view.composing || !empty || !$from.parent.isTextblock || editor.isActive('codeBlock') || editor.isActive('code')) return false;
  // Leaf placeholders prevent scanning across existing formulas, images or line breaks.
  const before = $from.parent.textBetween(0, $from.parentOffset, '\ufffc', '\ufffc');
  const boundary = before.lastIndexOf('\ufffc') + 1, tail = before.slice(boundary);
  const commands = [...tail.matchAll(/\\[a-zA-Z]+/g)];
  for (const command of commands) {
    const index = command.index!;
    if (index && /[\w\\$]/.test(tail[index - 1]!)) continue;
    const latex = tail.slice(index).trimEnd();
    if (!latex || latex.length > 2000 || /[\r\n]/.test(latex)) continue;
    // Do not reinterpret commands nested in an unfinished outer formula.
    let depth = 0;
    for (let i = 0; i < index; i++) if (tail[i] === '{' && tail[i - 1] !== '\\') depth++; else if (tail[i] === '}' && tail[i - 1] !== '\\') depth--;
    if (depth !== 0) continue;
    try { katex.renderToString(latex, { throwOnError: true, trust: false, maxExpand: 1000 }); }
    catch { return false; } // An unfinished outer command must not convert its inner formula.
    const start = $from.start() + boundary + index, at = state.doc.resolve(start), marks = at.nodeAfter?.marks || at.marks();
    const math = state.schema.nodes.inlineMath!.create({ latex }, null, marks);
    const tr = closeHistory(state.tr).replaceWith(start, $from.pos, math);
    if (space) tr.insertText(' ', start + 1);
    tr.setSelection(TextSelection.create(tr.doc, start + (space ? 2 : 1)));
    tr.ensureMarks(marks);
    view.dispatch(tr.scrollIntoView());
    return true;
  }
  return false;
}

export const AutomaticMath = Extension.create({
  name: 'automaticMath', priority: 1100,
  addKeyboardShortcuts() {
    return {
      Space: () => convertMath(this.editor, true),
      // Let the regular Enter handler create the paragraph/list item after conversion.
      Enter: () => { convertMath(this.editor, false); return false; },
    };
  },
});
