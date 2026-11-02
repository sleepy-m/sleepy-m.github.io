const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync('source/studio/frontmatter.js', 'utf8'), context);
const fm = context.window.StudioFrontMatter;

const post = `---
title: 在线写作与发布指南
published: true
date: 2026-10-13
categories:
  - 学习笔记
tags:
  - Markdown
  - 使用说明
---
现在可以直接在浏览器里写文章。

## 小节
`;

test('reads the metadata of a published blog post', () => {
  const parsed = fm.fromMarkdown(post);
  assert.equal(parsed.hasFrontMatter, true);
  assert.equal(parsed.title, '在线写作与发布指南');
  assert.equal(parsed.published, true);
  assert.equal(parsed.date, '2026-10-13');
  assert.deepEqual([...parsed.categories], ['学习笔记']);
  assert.deepEqual([...parsed.tags], ['Markdown', '使用说明']);
  assert.match(parsed.body, /^现在可以直接在浏览器里写文章。/);
  assert.equal(parsed.body.includes('---'), false);
});

test('re-serializes an untouched post without changing a single metadata line', () => {
  const parsed = fm.fromMarkdown(post);
  const front = post.slice(4, post.indexOf('\n---\n'));
  const output = fm.toMarkdown(parsed, parsed.body);
  assert.equal(output.slice(4, output.indexOf('\n---\n')), front);
  assert.equal(output.slice(output.indexOf('\n---\n') + 5).trim(), parsed.body.trim());
});

test('keeps unknown keys, comments and ordering while editing known ones', () => {
  const source = `---
layout: about
title: '关于'
# 手工维护
date: '2026-10-13'
math: true
photos:
  - /img/a.png
---
正文
`;
  const parsed = fm.fromMarkdown(source);
  const output = fm.toMarkdown({...parsed, title: '关于我', tags: ['随笔']}, parsed.body);
  assert.match(output, /^---\nlayout: about\ntitle: 关于我\n# 手工维护\ndate: 2026-10-13\nmath: true\nphotos:\n {2}- \/img\/a\.png\ntags:\n {2}- 随笔\n---\n\n正文\n$/);
});

test('quotes values that YAML would otherwise misread', () => {
  const parsed = fm.fromMarkdown('---\ndate: 2026-10-13\n---\n正文');
  const output = fm.toMarkdown({...parsed, title: '笔记: 一个带冒号的标题', categories: ['-以横线开头', 'true']}, parsed.body);
  assert.match(output, /title: "笔记: 一个带冒号的标题"/);
  assert.match(output, /categories:\n {2}- "-以横线开头"\n {2}- "true"/);
  assert.match(output, /date: 2026-10-13/);
});

test('parses inline lists and drops the keys the studio leaves blank', () => {
  const parsed = fm.fromMarkdown('---\ntitle: 测试\ntags: [Markdown, LaTeX]\ncategories:\n---\n正文');
  assert.deepEqual([...parsed.tags], ['Markdown', 'LaTeX']);
  assert.deepEqual([...parsed.categories], []);
  const output = fm.toMarkdown({...parsed, categories: [], tags: []}, parsed.body);
  assert.doesNotMatch(output, /tags:/);
  assert.doesNotMatch(output, /categories:/);
  assert.match(output, /title: 测试/);
});

test('tolerates BOM and CRLF endings from Windows editors', () => {
  const parsed = fm.fromMarkdown('\uFEFF---\r\ntitle: 你好\r\ndate: 2026-10-13 12:00:00\r\n---\r\n\r\n正文');
  assert.equal(parsed.title, '你好');
  assert.equal(parsed.date, '2026-10-13');
  assert.equal(parsed.body, '正文');
});

test('a document without front matter is body only', () => {
  const parsed = fm.fromMarkdown('# 标题\n\n正文');
  assert.equal(parsed.hasFrontMatter, false);
  assert.equal(parsed.body, '# 标题\n\n正文');
  assert.equal(fm.titleFromBody(parsed.body), '标题');
});

test('new documents get a canonical front matter block', () => {
  const output = fm.toMarkdown({title: '新文章', date: '2026-11-02', published: true, categories: ['学习笔记'], tags: ['Hexo'], entries: []}, '## 开头\n\n内容');
  assert.equal(output, `---\ntitle: 新文章\ndate: 2026-11-02\npublished: true\ncategories:\n  - 学习笔记\ntags:\n  - Hexo\n---\n\n## 开头\n\n内容\n`);
});

test('literal dates and numbers in other keys survive a round trip', () => {
  const source = '---\ntitle: 测试\nsidebar: 1\nweight: 20261013\ndraft_of: 2026-01-01\n---\n正文';
  const parsed = fm.fromMarkdown(source);
  const output = fm.toMarkdown({...parsed}, parsed.body);
  assert.equal(output.slice(4, output.indexOf('\n---\n')), source.slice(4, source.indexOf('\n---\n')));
  assert.match(output, /\n---\n\n正文\n$/);
});
