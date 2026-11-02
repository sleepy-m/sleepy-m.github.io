'use strict';
// Blocks offered by the "/" menu and the 插入 button.
// kind:"text" types a marker at the caret (Markdown/IR turns it into a block);
// kind:"block" pastes a small Markdown fragment; kind:"action" runs a callback.
(() => {
  // icon = short glyph shown on the tile of each row.
  const items = [
    {id: 'h1', icon: 'H1', label: '一级标题', hint: '#', kind: 'text', snippet: '# ', keywords: 'h1 heading 标题 一级'},
    {id: 'h2', icon: 'H2', label: '二级标题', hint: '##', kind: 'text', snippet: '## ', keywords: 'h2 heading 标题 二级'},
    {id: 'h3', icon: 'H3', label: '三级标题', hint: '###', kind: 'text', snippet: '### ', keywords: 'h3 heading 标题 三级'},
    {id: 'h4', icon: 'H4', label: '四级标题', hint: '####', kind: 'text', snippet: '#### ', keywords: 'h4 heading 标题 四级'},
    {id: 'bullet', icon: '•', label: '无序列表', hint: '-', kind: 'text', snippet: '- ', keywords: 'list bullet 列表 无序'},
    {id: 'ordered', icon: '1.', label: '有序列表', hint: '1.', kind: 'text', snippet: '1. ', keywords: 'list ordered 列表 有序 编号'},
    {id: 'task', icon: '☑', label: '待办事项', hint: '- [ ]', kind: 'text', snippet: '- [ ] ', keywords: 'todo task checkbox 待办 任务'},
    {id: 'quote', icon: '❝', label: '引用', hint: '>', kind: 'text', snippet: '> ', keywords: 'quote blockquote 引用'},
    {id: 'code', icon: '</>', label: '代码块', hint: '```', kind: 'block', snippet: '```js\n\n```\n', keywords: 'code 代码'},
    {id: 'math', icon: '∑', label: '公式块', hint: '$$', kind: 'block', snippet: '$$\n\n$$\n', keywords: 'math latex formula 公式 数学'},
    {id: 'table', icon: '▦', label: '表格', hint: '|', kind: 'block', snippet: '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n', keywords: 'table 表格'},
    {id: 'divider', icon: '—', label: '分割线', hint: '---', kind: 'block', snippet: '\n---\n', keywords: 'divider hr 分割线 分隔'},
    {id: 'more', icon: '⋯', label: '摘要分隔（more）', hint: '<!-- more -->', kind: 'block', snippet: '\n<!-- more -->\n', keywords: 'more excerpt 摘要 分隔 截断'},
    {id: 'link', icon: '🔗', label: '链接', hint: '[]()', kind: 'block', snippet: '[链接文字](https://example.com)', keywords: 'link 链接 网址'},
    {id: 'image', icon: '🖼', label: '图片', hint: '![]()', kind: 'action', action: 'image', keywords: 'image picture upload 图片 上传'},
    {id: 'footnote', icon: '¹', label: '脚注', hint: '[^1]', kind: 'block', snippet: '[^1]\n\n[^1]: 脚注内容\n', keywords: 'footnote 脚注 注释'},
  ];

  function find(id) {
    return items.find(item => item.id === id) || null;
  }

  function search(query) {
    const text = String(query || '').trim().toLocaleLowerCase();
    if (!text) return items.slice();
    return items.filter(item => (item.label + ' ' + item.keywords + ' ' + item.hint).toLocaleLowerCase().includes(text));
  }

  const api = {items, find, search};
  if (typeof window !== 'undefined') window.StudioCommands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
