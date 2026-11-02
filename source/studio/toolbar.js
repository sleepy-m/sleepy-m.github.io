'use strict';
// The selected-text bubble keeps its buttons in one place so tests can reach them.
(() => {
  const ICONS = {
    bold: '<b>B</b>',
    italic: '<i>I</i>',
    strike: '<s>S</s>',
    code: '<code>&lt;/&gt;</code>',
    link: '🔗',
    h1: 'H1',
    h2: 'H2',
    h3: 'H3',
    quote: '❝',
    list: '•',
    ol: '1.',
    check: '☑',
  };
  const LABELS = {
    bold: '加粗 ⌘B',
    italic: '斜体 ⌘I',
    strike: '删除线',
    code: '行内代码',
    link: '链接 ⌘K',
    h1: '一级标题',
    h2: '二级标题',
    h3: '三级标题',
    quote: '引用',
    list: '无序列表',
    ol: '有序列表',
    check: '待办事项',
  };
  const INLINE = ['bold', 'italic', 'strike', 'code', 'link'];
  const BLOCKS = ['h1', 'h2', 'h3', 'quote', 'list', 'ol', 'check'];

  // Wraps (or unwraps) a selection with a Markdown marker, like ⌘B does.
  function toggleMarkdown(value, start, end, marker, placeholder) {
    const inner = value.slice(start, end);
    const open = value.slice(Math.max(0, start - marker.length), start);
    const close = value.slice(end, end + marker.length);
    if (open === marker && close === marker) {
      return {value: value.slice(0, start - marker.length) + inner + value.slice(end + marker.length), start: start - marker.length, end: end - marker.length};
    }
    const trimmed = inner.trim();
    if (trimmed.startsWith(marker) && trimmed.endsWith(marker) && trimmed.length >= marker.length * 2) {
      const bare = inner.replace(marker, '');
      const bareTrimmed = bare.trim().slice(0, -marker.length);
      const head = inner.slice(0, inner.indexOf(trimmed));
      const tail = inner.slice(inner.indexOf(trimmed) + trimmed.length);
      const result = head + bareTrimmed + tail;
      const shift = inner.length - result.length;
      return {value: value.slice(0, start) + result + value.slice(end), start, end: end - shift};
    }
    const inserted = marker + (inner || placeholder || '') + marker;
    const at = start + marker.length;
    return {value: value.slice(0, start) + inserted + value.slice(end), start: at, end: at + (inner || placeholder || '').length};
  }

  // Switches the current line to a block prefix; repeating it removes the prefix.
  function applyLinePrefix(value, lineStart, prefix) {
    const end = value.indexOf('\n', lineStart);
    const stop = end < 0 ? value.length : end;
    const line = value.slice(lineStart, stop);
    const prefixes = [/^#{1,6}\s+/, /^>\s+/, /^[-*+]\s+\[[ x]\]\s+/, /^[-*+]\s+/, /^\d+\.\s+/];
    let rest = line;
    for (const pattern of prefixes) {
      const hit = line.match(pattern);
      if (hit) { rest = line.slice(hit[0].length); break; }
    }
    const same = prefixes.some(pattern => line.match(pattern) && line.startsWith(prefix));
    const next = same ? rest : prefix + rest;
    return {value: value.slice(0, lineStart) + next + value.slice(stop), caret: lineStart + (same ? 0 : prefix.length)};
  }

  function mount({isInside, onApply, beforeApply}) {
    const onBeforeApply = beforeApply;
    const bar = document.createElement('div');
    bar.className = 'bubble';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', '文字格式');
    bar.hidden = true;
    document.body.append(bar);
    let timer = 0;
    // Where the selection bar was last anchored, in page coordinates.
    const anchored = {rect: null, range: null};
    function button(kind) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'bubble-button';
      element.dataset.action = kind;
      element.title = LABELS[kind];
      element.setAttribute('aria-label', LABELS[kind]);
      element.innerHTML = ICONS[kind];
      // A mouse down would move focus out of the text and drop the selection, so
      // the press is cancelled and handled here; the click only fires when the
      // user really clicks (keyboard activation, for example).
      let pressed = false;
      const press = label => {
        if (pressed) return;
        pressed = true;
        if (onBeforeApply) onBeforeApply(kind, anchored.rect, anchored.range);
        onApply(kind);
        hide();
      };
      element.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        press('pointer');
      });
      element.addEventListener('mousedown', event => {
        event.preventDefault();
        press('mouse');
      });
      element.addEventListener('focus', () => element.blur());
      element.addEventListener('click', () => press('click'));
      return element;
    }
    function render(multiLine) {
      bar.replaceChildren();
      const inline = document.createElement('div');
      inline.className = 'bubble-group';
      for (const kind of INLINE) inline.append(button(kind));
      const blocks = document.createElement('div');
      blocks.className = 'bubble-group';
      if (!multiLine) for (const kind of BLOCKS) blocks.append(button(kind));
      bar.append(inline, blocks);
    }
    function position(rect, multiLine) {
      render(multiLine);
      bar.hidden = false;
      bar.style.display = 'flex';
      bar.style.left = '0px';
      bar.style.top = '0px';
      const box = bar.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - box.width / 2, innerWidth - box.width - 8));
      let top = rect.top - box.height - 10;
      const below = top < 70;
      if (below) top = rect.bottom + 10;
      bar.classList.toggle('below', below);
      bar.style.left = Math.round(left) + 'px';
      bar.style.top = Math.round(top) + 'px';
    }
    function hide() {
      bar.hidden = true;
      bar.style.display = '';
      bar.style.left = '';
      bar.style.top = '';
      bar.replaceChildren();
    }
    function show() {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return hide();
      const range = selection.getRangeAt(0);
      
      if (!isInside(range.commonAncestorContainer)) return hide();
      const text = selection.toString();
      if (!text.trim()) return hide();
      const rects = range.getClientRects();
      const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return hide();
      anchored.rect = rect;
      anchored.range = range.cloneRange();
      position(rect, text.includes('\n'));
      return undefined;
    }
    document.addEventListener('selectionchange', () => {
      clearTimeout(timer);
      timer = setTimeout(show, 180);
    });
    document.addEventListener('mouseup', event => {
      if (!bar.contains(event.target)) hide();
    });
    document.addEventListener('keyup', event => {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) return;
      clearTimeout(timer);
      timer = setTimeout(show, 120);
    });
    // Scroll events would dismiss the bar while it sits inside a scrollable page;
    // only a real scroll of the page behind it should close it.
    document.addEventListener('mousedown', event => {
      // A press inside the bar is the user choosing a format, not a request to
      // dismiss it or to drop the selection they made a moment ago.
      if (bar.contains(event.target)) {
        event.preventDefault();
        return;
      }
      if (!bar.hidden) hide();
    }, true);
    document.addEventListener('scroll', event => { if (event.target === document) hide(); }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    return {show, hide, element: bar};
  }

  window.StudioBubble = {mount, toggleMarkdown, applyLinePrefix, ICONS, LABELS, INLINE, BLOCKS};
})();