import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RICH_PREFIX, encodeRichContent, parseRichContent, contentText, contentHasValue, safeImageUrl, validateRichDocument } from '../dist/rich-content.js';
import { gradeAnswer } from '../dist/exam.js';
const paragraph = text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const document = content => ({ version: 1, format: 'poem', indent: false, lineHeight: 1.85, doc: { type: 'doc', content } });
const image = { type: 'image', attrs: { src: '/uploads/example.png', alt: 'Segitiga', width: 50, align: 'right' } };
test('structured content keeps paragraph, stanza, image ordering, formatting and math', () => {
 const doc = document([{ type:'paragraph',attrs:{textAlign:'center',indent:0},content:[{type:'text',text:'Bait satu',marks:[{type:'bold'}]},{type:'hardBreak'},{type:'text',text:'Larik dua'}]},image,paragraph('Pertanyaan di bawah.'),{type:'blockMath',attrs:{latex:'\\frac{1}{2}'}}]);
 const encoded=encodeRichContent(doc);assert.deepEqual(parseRichContent(encoded),doc);assert.equal(encodeRichContent(parseRichContent(encoded)),encoded);assert.ok(contentText(encoded).includes('Segitiga'));assert.ok(contentHasValue(encodeRichContent(document([image]))));assert.equal(contentHasValue(encodeRichContent(document([paragraph('')]))),false);
});
test('unsafe URLs, HTML nodes, invalid tables and excessive depth/size are rejected', () => {
 for(const src of ['javascript:alert(1)','data:image/svg+xml,<svg/>','//evil.example/x','/uploads/../a','https://example.com/a\\b','https://user:pass@example.com/a','https://example.com/a\n'])assert.equal(safeImageUrl(src),false,src);
 for(const node of [{type:'script',text:'alert(1)'},{type:'image',attrs:{src:'javascript:alert(1)'}},{type:'table',content:[]},{type:'heading',attrs:{level:99},content:[]},{type:'text',text:'outside paragraph'}])assert.throws(()=>encodeRichContent(document([node])));
 let deep=paragraph('deep');for(let i=0;i<18;i++)deep={type:'blockquote',content:[deep]};assert.throws(()=>encodeRichContent(document([deep])));assert.throws(()=>encodeRichContent(document([paragraph('a'.repeat(50001))])));
 assert.equal(parseRichContent(RICH_PREFIX+'{"version":99}'),null);
 assert.throws(()=>encodeRichContent(document([paragraph('a'.repeat(35000))])));
 assert.ok(parseRichContent(encodeRichContent(document([paragraph('a'.repeat(20000))]))));
});
test('unknown attributes are discarded and plain legacy Markdown stays readable', () => {
 const result=validateRichDocument(document([{...image,attrs:{...image.attrs,onclick:'alert(1)',style:'position:fixed',onerror:'x'}}]));assert.deepEqual(result.doc.content[0],image);assert.equal(contentText('**Lama** $x^2$'),'**Lama** $x^2$');assert.equal(parseRichContent('Cerita lama'),null);assert.ok(contentHasValue('Cerita lama'));
 const canonical=encodeRichContent({...document([paragraph('Teks asli')]),text:'Palsu'});assert.equal(JSON.parse(canonical.slice(RICH_PREFIX.length)).text,'Teks asli');
 const table=document([{type:'table',content:[{type:'tableRow',content:[{type:'tableHeader',content:[paragraph('Kolom')]},{type:'tableCell',content:[image]}]}]}]);assert.ok(parseRichContent(encodeRichContent(table)));
});
test('image-only options keep existing single, multiple and category grading semantics', () => {
 const options=[{text:encodeRichContent(document([image]))},{text:encodeRichContent(document([image]))}];
 assert.equal(gradeAnswer({type:'Pilihan Ganda Sederhana',options,correctAnswer:[0]},0),true);assert.equal(gradeAnswer({type:'Pilihan Ganda Sederhana',options,correctAnswer:[0]},1),false);
 assert.equal(gradeAnswer({type:'Pilihan Ganda Kompleks',options,correctAnswer:[0,1]},[1,0]),true);assert.equal(gradeAnswer({type:'Pilihan Ganda Kompleks Kategori',options,correctAnswer:[0,1]},[0,1]),true);
});
