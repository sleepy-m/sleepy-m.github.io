const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('source/studio/table-tools.js','utf8'),context);
const tables=context.window.StudioTableTools.tables;
const layout=require('../scripts/table-layout');
test('real Markdown rendering carries dimensions into published HTML',()=>{
 const md=require('markdown-it')({html:true});
 const source='<!-- studio-table-layout {"widths":[250,180],"heights":[64,104]} -->\n\n| A | B |\n| --- | --- |\n| content | more |\n';
 const html=layout(md.render(source));assert.match(html,/width:430px/);assert.match(html,/height:104px/);assert.doesNotMatch(html,/studio-table-layout/);assert.match(html,/<td>content<\/td>/);
});
test('Markdown tables preserve offsets, escaped pipes, alignment and sizing metadata',()=>{
 const md='intro\n\n<!-- studio-table-layout {"widths":[200,120],"heights":[64,80]} -->\n| A | B |\n| :--- | ---: |\n| x\\|y | $a^2$ |\n\nafter';
 const result=tables(md);assert.equal(result.length,1);const t=result[0];assert.equal(t.rows[1][0],'x\\|y');assert.equal(t.rows[1][1],'$a^2$');assert.equal(t.meta.widths[0],200);assert.equal(md.slice(t.end),'\n\nafter');assert.ok(md.slice(t.start,t.end).startsWith('<!-- studio-table-layout'));
});
test('fenced examples are not editable document tables',()=>{
 assert.equal(tables('```markdown\n| A | B |\n| --- | --- |\n```\n\n| C | D |\n| --- | --- |\n').length,1);
});
test('editor-added blank lines between metadata and table retain dimensions',()=>{
 const md='<!-- studio-table-layout {"widths":[190,180],"heights":[64]} -->\n\n| A | B |\n| --- | --- |\n';
 const t=tables(md)[0];assert.equal(t.meta.widths[0],190);assert.equal(t.start,0);
});
test('published dimensions are bounded and table contents survive',()=>{
 const result=layout('<!-- studio-table-layout {"widths":[200,120],"heights":[64,80]} -->\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>value</td><td>formula</td></tr></tbody></table>');
 assert.match(result,/width:320px/);assert.match(result,/height:80px/);assert.match(result,/>value</);assert.match(result,/overflow-x:auto/);
 const hostile=layout('<!-- studio-table-layout {"widths":["red;position:fixed"],"heights":[-5]} -->\n<table><tr><td>A</td></tr></table>');assert.doesNotMatch(hostile,/position:fixed/);assert.match(hostile,/height:48px/);
});
