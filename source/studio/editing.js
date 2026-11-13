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
  const api = {editCode};
  if (typeof window !== 'undefined') window.StudioEditing = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
