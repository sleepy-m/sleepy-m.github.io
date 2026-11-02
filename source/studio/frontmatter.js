'use strict';
// Blog front matter stays the source of truth for a post's metadata.
// Only the five fields the studio exposes are rewritten; every other line
// (math, layout, photos, comments…) is carried through untouched.
(() => {
  const MANAGED = ['title', 'date', 'published', 'categories', 'tags'];
  const KEY = /^([A-Za-z_][\w.-]*)[ \t]*:[ \t]*(.*)$/;

  function unquote(raw) {
    const text = String(raw).trim();
    if (text.length >= 2) {
      const quote = text[0];
      if ((quote === '"' || quote === "'") && text.endsWith(quote)) {
        const inner = text.slice(1, -1);
        return quote === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
      }
    }
    return text;
  }

  // "a, 'b, c', d" -> ['a', 'b, c', 'd']
  function splitInline(text) {
    const items = [];
    let current = '', quote = '';
    for (const character of text) {
      if (quote) { if (character === quote) quote = ''; else current += character; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === ',') { items.push(current.trim()); current = ''; continue; }
      current += character;
    }
    items.push(current.trim());
    return items.filter(Boolean);
  }

  function parseValue(raw) {
    const text = String(raw).trim();
    if (text === '') return '';
    if (/^\[[\s\S]*\]$/.test(text)) return splitInline(text.slice(1, -1));
    if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);
    if (/^(null|~)$/i.test(text)) return null;
    return unquote(text);
  }

  function entriesOf(lines) {
    const entries = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim()) continue;
      if (/^\s*#/.test(line)) { entries.push({kind: 'raw', raw: line}); continue; }
      const match = line.match(KEY);
      if (match) {
        const key = match[1], rest = match[2];
        if (rest.trim() === '') {
          const items = [];
          let next = index + 1;
          while (next < lines.length && /^[ \t]*-[ \t]+/.test(lines[next])) {
            items.push(String(parseValue(lines[next].replace(/^[ \t]*-[ \t]+/, '')) ?? ''));
            next++;
          }
          if (items.length) { entries.push({kind: 'list', key, items, raw: lines.slice(index, next).join('\n')}); index = next - 1; }
          else entries.push({kind: 'scalar', key, value: '', raw: line});
        } else {
          entries.push({kind: 'scalar', key, value: parseValue(rest), raw: line});
        }
        continue;
      }
      if (/^[ \t]*-[ \t]+/.test(line)) { entries.push({kind: 'raw', raw: line}); continue; }
      entries.push({kind: 'raw', raw: line});
    }
    return entries;
  }

  function normalizeDate(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + '-' + match[2] + '-' + match[3] : text;
  }

  function listOf(value) {
    if (value === undefined || value === null) return [];
    const items = Array.isArray(value) ? value : [value];
    return items.map(item => String(item ?? '').trim()).filter(Boolean);
  }

  function fieldsOf(entries) {
    const fields = {title: '', date: '', categories: [], tags: [], published: undefined};
    for (const entry of entries) {
      if (!entry.key || !MANAGED.includes(entry.key)) continue;
      if (entry.key === 'categories' || entry.key === 'tags') fields[entry.key] = listOf(entry.kind === 'list' ? entry.items : entry.value);
      else if (entry.key === 'date') fields.date = normalizeDate(entry.value);
      else if (entry.key === 'published') fields.published = entry.value === true;
      else fields.title = String(entry.value ?? '').trim();
    }
    return fields;
  }

  function parse(text) {
    const raw = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const match = raw.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (!match) return {...fieldsOf([]), entries: [], body: raw, hasFrontMatter: false};
    const entries = entriesOf(match[1].split('\n'));
    return {...fieldsOf(entries), entries, body: raw.slice(match[0].length).replace(/^\n+/, ''), hasFrontMatter: true};
  }

  function quote(text) {
    return JSON.stringify(text).replace(/\\u([\da-f]{4})/gi, (all, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function scalar(text) {
    const value = String(text).trim();
    if (!value) return "''";
    if (/^[-?:,[\]{}#&*!|>'"%@`\s]/.test(value)) return quote(value);
    if (/\s#|: |\t|\n|^\s|\s$/.test(value)) return quote(value);
    if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return quote(value);
    if (/^[-+]?(\d|[.])/.test(value)) return quote(value);
    return value;
  }

  function formatEntry(key, value) {
    if (key === 'categories' || key === 'tags') {
      const items = listOf(value);
      if (!items.length) return '';
      return key + ':\n' + items.map(item => '  - ' + scalar(item)).join('\n');
    }
    if (key === 'published') return typeof value === 'boolean' ? 'published: ' + value : '';
    if (key === 'date') {
      const date = normalizeDate(value);
      return date ? 'date: ' + date : '';
    }
    if (key === 'title') {
      const title = String(value ?? '').trim();
      return title ? 'title: ' + scalar(title) : '';
    }
    return '';
  }

  // Rewrites managed keys in place, keeps every other entry byte-identical.
  function stringify(state) {
    const values = {
      title: state.title,
      date: state.date,
      published: state.published,
      categories: listOf(state.categories),
      tags: listOf(state.tags),
    };
    const source = Array.isArray(state.entries) ? state.entries : [];
    const written = new Set();
    const lines = [];
    for (const entry of source) {
      if (!entry.key || !MANAGED.includes(entry.key)) { if (entry.raw !== undefined && entry.raw !== '') lines.push(entry.raw); continue; }
      if (written.has(entry.key)) continue;
      written.add(entry.key);
      const formatted = formatEntry(entry.key, values[entry.key]);
      if (formatted) lines.push(formatted);
    }
    for (const key of MANAGED) {
      if (written.has(key)) continue;
      const formatted = formatEntry(key, values[key]);
      if (formatted) lines.push(formatted);
    }
    return lines.join('\n');
  }

  function toMarkdown(state, body) {
    const front = stringify(state);
    const content = String(body ?? '').replace(/^\n+/, '').replace(/\n+$/, '');
    const head = front ? '---\n' + front + '\n---\n' : '';
    return head ? head + '\n' + content + '\n' : content + '\n';
  }

  function fromMarkdown(text) {
    return parse(text);
  }

  // First ATX heading of a body, used for file names and auto titles.
  function titleFromBody(body) {
    const match = String(body ?? '').match(/^#{1,3}[ \t]+(.+?)[ \t]*#*[ \t]*$/m);
    return match ? match[1].trim() : '';
  }

  const api = {MANAGED, parse, stringify, toMarkdown, fromMarkdown, titleFromBody, normalizeDate, listOf};
  if (typeof window !== 'undefined') window.StudioFrontMatter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
