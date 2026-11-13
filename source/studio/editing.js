'use strict';
// Text edits use offsets inside one code block, never offsets in the document DOM.
(() => {
  function editCode(text, start, end, key, shift = false) {
    const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
    if (key === 'Enter') {
      const before = text.slice(lineStart, start);
      const indent = before.match(/^[\t ]*/)[0];
      const extra = /[{[(]\s*$/.test(before) ? '    ' : '';
      const split = extra && /^[\t ]*[}\])]/.test(text.slice(end));
      const inserted = '\n' + indent + extra + (split ? '\n' + indent : '');
      return {text: text.slice(0, start) + inserted + text.slice(end), start: start + 1 + indent.length + extra.length, end: start + 1 + indent.length + extra.length};
    }
    if (key !== 'Tab') return null;
    if (start === end && !shift) {
      const count = 4 - ((start - lineStart) % 4);
      return {text: text.slice(0, start) + ' '.repeat(count) + text.slice(end), start: start + count, end: start + count};
    }
    const stop = start !== end && text[end - 1] === '\n' ? end - 1 : end;
    const edits = [];
    let at = lineStart;
    do {
      const remove = shift ? (text.slice(at).match(/^(?:\t| {1,4})/)?.[0].length || 0) : 0;
      edits.push({at, remove, insert: shift ? '' : '    '});
      at = text.indexOf('\n', at);
      if (at < 0) break;
      at++;
    } while (at <= stop);
    let value = text;
    for (const edit of edits.slice().reverse()) value = value.slice(0, edit.at) + edit.insert + value.slice(edit.at + edit.remove);
    const map = offset => offset + edits.reduce((delta, edit) => edit.at <= offset ? delta + edit.insert.length - Math.min(edit.remove, offset - edit.at) : delta, 0);
    return {text: value, start: map(start), end: map(end)};
  }
  // A selection ending at the next line's start excludes that next line.
  function editLines(text, start, end, action) {
    const terminal = text.endsWith('\n');
    const value = terminal ? text.slice(0, -1) : text;
    start = Math.min(start, value.length); end = Math.min(end, value.length);
    const a = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const stop = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const found = value.indexOf('\n', stop), b = found < 0 ? value.length : found;
    const lines = value.split('\n'), first = value.slice(0, a).split('\n').length - 1;
    const count = value.slice(a, b).split('\n').length;
    let offset = a;
    if (action === 'delete') {
      lines.splice(first, count);
      offset = Math.min(a, lines.join('\n').length);
      start = end = offset;
    } else if (action === 'duplicate') {
      const selected = lines.slice(first, first + count);
      lines.splice(first + count, 0, ...selected);
      const delta = selected.join('\n').length + 1;
      start += delta; end += delta;
    } else {
      const up = action === 'up';
      if ((up && first === 0) || (!up && first + count >= lines.length)) return {text, start, end};
      const neighbor = lines[up ? first - 1 : first + count];
      const selected = lines.splice(first, count);
      lines.splice(up ? first - 1 : first + 1, 0, ...selected);
      const delta = (neighbor.length + 1) * (up ? -1 : 1);
      start += delta; end += delta;
    }
    return {text: lines.join('\n') + (terminal ? '\n' : ''), start, end};
  }
  const api = {editCode, editLines};
  if (typeof window !== 'undefined') window.StudioEditing = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
