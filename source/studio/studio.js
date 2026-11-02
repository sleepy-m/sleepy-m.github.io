'use strict';
// Writing studio: a card-style editor on a quiet canvas, with a Feishu-like
// selection bubble, a "/" insert menu, tag chips and a live outline.
(() => {
  const $ = id => document.getElementById(id);
  const cloudHost = location.hostname === 'sleepym-blog-studio.2036681827.workers.dev';
  const FrontMatter = window.StudioFrontMatter;
  const Commands = window.StudioCommands;
  const Tree = window.StudioDocumentTree;
  const DRAFT_KEY = 'sleepym-studio-drafts-v1';
  const PREFS_KEY = 'sleepym-studio-prefs-v1';
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format(new Date());
  const split = value => String(value || '').split(/[,，、]/).map(item => item.trim()).filter(Boolean);
  const SAMPLE = '# 从这里开始写\n\n## 先写一句最想说的话\n\n标题写好后，从这里开始。选中任意文字会出现格式浮条，输入 `/` 可以插入标题、表格、公式或图片。\n\n### 数学公式\n\n行内公式：$E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n### 表格与代码\n\n| 功能 | 体验 |\n| --- | --- |\n| Markdown | 即时渲染 |\n| LaTeX | 公式预览 |\n\n```python\ndef hello():\n    print("你好，博客！")\n```\n\n### 快捷键\n\n- `/` 插入标题、表格、公式、图片\n- 选中文字后点浮条按钮改格式\n- `Ctrl / ⌘ + S` 立即保存\n- `?` 查看全部快捷键\n';

  let drafts = [], active = null, editor = null, bubble = null, ready = false, me = null;
  let busy = false, conflict = false, uploads = 0, storageFailed = false;
  let editTimer = 0, persistTimer = 0, listTimer = 0, syncTimer = 0, outlineTimer = 0, savedTimer = 0;
  let queue = Promise.resolve();
  let prefs = loadPrefs();
  let extrasWanted = false;

  // ---------------------------------------------------------------- utilities
  function loadPrefs() {
    try {
      return {theme: 'paper', wide: false, typer: false, outline: true, notice: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')};
    } catch {
      return {theme: 'paper', wide: false, typer: false, outline: true, notice: true};
    }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }
  let toastTimer = 0;
  function toast(text, ms = 2600) {
    const box = $('toast');
    box.textContent = text;
    box.hidden = false;
    box.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.classList.remove('visible');
      setTimeout(() => { if (!box.classList.contains('visible')) box.hidden = true; }, 220);
    }, ms);
  }
  function status(text) { $('status').textContent = text; }
  const SAVE_LABEL = {loading: '正在载入', saved: '已保存', dirty: '正在保存…', saving: '保存中…', error: '保存失败', cloud: '云端已保存'};
  function setSaveState(state, text) {
    $('save-chip').dataset.state = state;
    $('save-text').textContent = text || SAVE_LABEL[state] || '';
  }
  function stamp() { return new Intl.DateTimeFormat('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date()); }

  // --------------------------------------------------------------- draft model
  function normalizeDraft(raw) {
    const draft = {...raw};
    draft.id = typeof draft.id === 'string' && draft.id ? draft.id : crypto.randomUUID();
    draft.title = typeof draft.title === 'string' ? draft.title : '';
    draft.body = typeof draft.body === 'string' ? draft.body : '';
    draft.date = /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') ? draft.date : today();
    draft.categories = Array.isArray(draft.categories) ? draft.categories.map(String) : [];
    draft.tags = Array.isArray(draft.tags) ? draft.tags.map(String) : [];
    draft.published = draft.published !== false;
    draft.entries = Array.isArray(draft.entries) ? draft.entries : [];
    draft.revision = Number.isSafeInteger(draft.revision) ? draft.revision : 0;
    return draft;
  }
  function loadDrafts() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
      if (Array.isArray(saved)) drafts = saved.filter(item => item && typeof item.body === 'string').map(normalizeDraft);
    } catch { storageFailed = true; }
    if (!drafts.length) drafts = [normalizeDraft({id: crypto.randomUUID(), title: '欢迎试写', body: SAMPLE, date: today(), revision: 0})];
    const recent = drafts.slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    active = recent[0] || drafts[0];
  }
  function writeDrafts() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
      return true;
    } catch {
      storageFailed = true;
      setSaveState('error', '本机保存失败');
      status('本机存储空间不足或被禁用，请立即下载备份。');
      return false;
    }
  }
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 350);
  }
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    if (writeDrafts()) {
      storageFailed = false;
      if (!me) setSaveState('saved', '已保存 · ' + stamp());
    }
  }
  function flushPersist() { if (persistTimer) persist(); }

  // ------------------------------------------------------------------- the form
  function tagValues(field) { return field === 'tags' ? active.tags : active.categories; }
  function setTagValues(field, values) {
    if (field === 'tags') active.tags = values; else active.categories = values;
    renderChips(field, values);
  }
  function chipBox(field) { return $(field === 'tags' ? 'tag-chips' : 'category-chips'); }
  function renderChips(field, values) {
    const box = chipBox(field);
    box.replaceChildren();
    for (const value of values) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const label = document.createElement('span');
      label.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip-remove';
      remove.setAttribute('aria-label', '移除' + value);
      remove.textContent = '×';
      remove.onclick = () => {
        setTagValues(field, tagValues(field).filter(item => item !== value));
        stateChanged();
        persist();
      };
      chip.append(label, remove);
      box.append(chip);
    }
    $(field).placeholder = values.length ? '' : field === 'tags' ? '标签' : '分类';
  }
  function fillFields() {
    $('title').value = active.title || '';
    $('date').value = active.date || today();
    $('categories').value = '';
    $('tags').value = '';
    renderChips('categories', active.categories || []);
    renderChips('tags', active.tags || []);
    $('published').checked = active.published !== false;
    $('publish').textContent = active.path ? '更新' : '发布';
    $('publish-local').hidden = !!me;
    $('crumb-title').textContent = active.title || '无标题文章';
    document.title = (active.title || '写作室') + ' · 写作室';
    showExtras();
    fillParents();
    updatePropsVisibility();
  }
  function updatePropsVisibility() {
    document.querySelector('.props-more').hidden = !extrasWanted;
    const toggle = $('props-toggle');
    toggle.setAttribute('aria-expanded', String(extrasWanted));
    toggle.textContent = extrasWanted ? '收起属性' : '更多属性';
  }
  function showExtras() {
    const button = $('extra-fields');
    const count = (active?.entries || []).filter(entry => !entry.key || !FrontMatter.MANAGED.includes(entry.key)).length;
    button.hidden = !count;
    button.textContent = '另有 ' + count + ' 项属性';
    button.title = '文件里还有其它 front matter 字段，导出时原样保留。';
  }
  function commit() {
    if (!ready || !active) return;
    active.title = $('title').value.trim();
    active.body = editor.getValue();
    active.date = $('date').value || today();
    for (const field of ['categories', 'tags']) {
      const values = split($(field).value);
      if (!values.length) continue;
      const next = tagValues(field).slice();
      for (const value of values) if (!next.includes(value)) next.push(value);
      setTagValues(field, next);
    }
    $('categories').value = '';
    $('tags').value = '';
    active.published = $('published').checked;
    active.updated = new Date().toISOString();
    $('crumb-title').textContent = active.title || '无标题文章';
    document.title = (active.title || '写作室') + ' · 写作室';
  }
  function stateChanged() {
    clearTimeout(savedTimer);
    setSaveState('dirty', '正在保存…');
    schedulePersist();
    renderListSoon();
    updateStats();
    scheduleOutline();
    if (me && !conflict) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { flushEdit(); cloudSave().catch(() => {}); }, 1200);
    }
  }
  // Ask the table helper to restore three-dash separators in the stored value.
  function normalizeTables() {
    const helper = window.StudioTableTools;
    if (!helper || !helper.normalizeSeparators || !editor) return;
    const current = editor.getValue();
    const fixed = helper.normalizeSeparators(current);
    if (fixed === current) return;
    const caret = getSelection();
    editor.setValue(fixed);
    if (caret && caret.rangeCount) {
      // Keep the user roughly where they were; exact caret is restored on next input.
    }
  }

  function flushEdit() {
    if (!editTimer) return;
    clearTimeout(editTimer);
    editTimer = 0;
    commit();
    updateStats();
    schedulePersist();
  }
  // An empty document has no caret target; give it one paragraph to start from.
  function ensureParagraph(body) {
    return /^[\s\u200B]*$/.test(body || '') ? '\u200B' : body;
  }

  function applyDraft(draft) {
    active = draft;
    conflict = !!draft.conflict;
    fillFields();
    editor.setValue(ensureParagraph(draft.body));
    editor.clearStack();
    updateStats();
    renderOutline();
    renderList();
    $('recover').hidden = !(me && (draft.path || draft.conflict));
    flashSaved(true);
  }
  // A brief "saved" confirmation instead of a badge that stays "unsaved" while typing.
  function flashSaved(immediate) {
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      if (me) { if (!active?.unsynced) setSaveState('cloud', '云端已保存'); }
      else setSaveState('saved', '已保存');
    }, immediate ? 30 : 820);
  }

  // --------------------------------------------------------------------- stats
  function wordCount(text) {
    const chars = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'’._+-]*/g) || []).length;
    return {chars, words, total: chars + words};
  }
  function updateStats() {
    if (!ready) return;
    const {chars, words, total} = wordCount(editor.getValue());
    const minutes = Math.max(1, Math.round(chars / 320 + words / 200));
    $('doc-stats').textContent = total ? total.toLocaleString('zh-CN') + ' 字 · 约 ' + minutes + ' 分钟' : '还没有内容';
    $('rail-stats').textContent = total ? total.toLocaleString('zh-CN') + ' 字' : '';
    $('empty-hint').hidden = total > 0;
  }
  function docSubtitle(draft) {
    const {total} = wordCount(draft.body || '');
    const when = draft.updated ? relativeTime(draft.updated) : '';
    return [draft.cloud ? '云端' : '本机', total ? total.toLocaleString('zh-CN') + ' 字' : '', when].filter(Boolean).join(' · ');
  }
  function relativeTime(iso) {
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return '';
    const diff = Date.now() - time;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.round(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.round(diff / 3600e3) + ' 小时前';
    if (diff < 7 * 86400e3) return Math.round(diff / 86400e3) + ' 天前';
    return new Intl.DateTimeFormat('zh-CN', {month: 'numeric', day: 'numeric'}).format(new Date(time));
  }

  // ------------------------------------------------------------------- outline
  function headingsOf(text) {
    const result = [];
    let fence = false;
    for (const line of String(text || '').split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
      if (fence) continue;
      const match = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
      if (match) result.push({level: match[1].length, text: match[2]});
    }
    return result;
  }
  function scheduleOutline() {
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(renderOutline, 240);
  }
  function renderOutline() {
    if (!ready) return;
    const rail = $('outline');
    const items = headingsOf(editor.getValue());
    rail.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'outline-empty';
      empty.textContent = '写几个标题后，这里会显示大纲。';
      rail.append(empty);
      return;
    }
    for (const item of items) {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'outline-item level-' + item.level;
      link.textContent = item.text;
      link.onclick = event => { event.preventDefault(); jumpToHeading(item.text); };
      rail.append(link);
    }
  }
  function jumpToHeading(text) {
    const root = document.querySelector('.vditor-ir .vditor-reset');
    if (!root) return;
    const heading = [...root.querySelectorAll('h1,h2,h3,h4')].find(element => element.textContent.replace(/\s+/g, ' ').trim() === text);
    if (!heading) return;
    heading.scrollIntoView({behavior: 'smooth', block: 'start'});
    heading.classList.add('heading-flash');
    setTimeout(() => heading.classList.remove('heading-flash'), 900);
  }

  // ---------------------------------------------------------------- the sidebar
  function renderList() {
    const buttons = new Map();
    for (const draft of drafts) {
      const button = document.createElement('button');
      button.className = draft === active ? 'active' : '';
      button.dataset.search = (draft.title + ' ' + draft.tags.join(' ')).trim();
      const name = document.createElement('span');
      name.className = 'doc-name';
      name.textContent = (draft.cloud ? '☁ ' : '') + (draft.title || '无标题文章') + (draft.unsynced ? ' ·' : '');
      const sub = document.createElement('small');
      sub.className = 'doc-sub';
      sub.textContent = docSubtitle(draft);
      button.append(name, sub);
      button.onclick = () => openDraft(draft);
      buttons.set(draft, button);
    }
    Tree.render($('drafts'), drafts, buttons);
    fillParents();
    filterArticles();
  }
  function renderListSoon() {
    clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 260);
  }
  function filterArticles() {
    const query = $('search').value.trim().toLocaleLowerCase();
    const results = $('results');
    results.replaceChildren();
    results.hidden = !query;
    $('drafts-section').hidden = !!query;
    if (!query) {
      Tree.filter($('drafts'), '');
      return;
    }
    Tree.filter($('drafts'), query);
    const hits = drafts.filter(draft => (draft.title + '\n' + draft.tags.join(' ') + '\n' + draft.categories.join(' ') + '\n' + draft.body).toLocaleLowerCase().includes(query)).slice(0, 30);
    if (!hits.length) {
      const empty = document.createElement('p');
      empty.className = 'results-empty';
      empty.textContent = '没有找到匹配的文章';
      results.append(empty);
      return;
    }
    for (const draft of hits) {
      const button = document.createElement('button');
      button.className = 'result';
      const name = document.createElement('span');
      name.className = 'doc-name';
      name.textContent = draft.title || '无标题文章';
      const snippet = document.createElement('small');
      snippet.className = 'doc-sub';
      snippet.textContent = excerpt(draft, query);
      button.append(name, snippet);
      button.onclick = () => openDraft(draft);
      results.append(button);
    }
  }
  function excerpt(draft, query) {
    const at = draft.body.toLocaleLowerCase().indexOf(query);
    if (at < 0) return docSubtitle(draft);
    const start = Math.max(0, at - 16);
    return (start > 0 ? '…' : '') + draft.body.slice(start, at + query.length + 32).replace(/\s+/g, ' ').replace(/[#>*`|]/g, '') + '…';
  }
  function fillParents() {
    const select = $('parent-doc');
    if (!ready || !active) return;
    const blocked = Tree.descendants(active, drafts);
    select.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '无（顶级）';
    select.append(none);
    for (const draft of drafts) {
      if (blocked.has(Tree.id(draft))) continue;
      const option = document.createElement('option');
      option.value = Tree.id(draft);
      option.textContent = draft.title || '无标题文章';
      select.append(option);
    }
    const current = Tree.parent(active);
    if (current && ![...select.options].some(option => option.value === current)) {
      const option = document.createElement('option');
      option.value = current;
      option.textContent = '父文档尚未载入';
      select.append(option);
    }
    select.value = current || '';
  }

  // ------------------------------------------------------------- editor events
  function changed() {
    if (!ready || busy) return;
    clearTimeout(savedTimer);
    setSaveState('dirty', '正在保存…');
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      editTimer = 0;
      normalizeTables();
      commit();
      updateStats();
      renderListSoon();
      scheduleOutline();
      schedulePersist();
      flashSaved();
    }, 420);
    if (me && !conflict) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { flushEdit(); cloudSave().catch(() => {}); }, 1500);
    }
  }
  // Vditor drops a second Enter on an otherwise empty line, which makes it
  // impossible to add spacing. After typing pauses, put that blank line back.
  function saveNow() {
    if (!ready) return;
    flushEdit();
    persist();
    if (me) { clearTimeout(syncTimer); cloudSave().catch(() => {}); }
    else toast('已保存到这台浏览器');
    flashSaved();
  }

  async function openDraft(draft) {
    if (busy || !ready) return;
    if (innerWidth <= 960) closeSidebar();
    if (draft === active) return;
    flushEdit();
    clearTimeout(syncTimer);
    if (me && active.unsynced && !conflict) await cloudSave().catch(() => {});
    try { await queue; } catch { /* keep local */ }
    applyDraft(draft);
    persist();
    status(draft.unsynced ? '当前是未同步的本机备份。' : draft.cloud ? '已打开云端草稿' : '已打开本机草稿');
  }

  function createDraft({title = '', body = '', date = '', categories = [], tags = [], published = true, entries = [], silent = false} = {}) {
    if (!ready || busy) return null;
    flushEdit();
    persist();
    const draft = normalizeDraft({
      id: crypto.randomUUID(), title, body, date: date || today(),
      categories, tags, published, entries, updated: new Date().toISOString(),
    });
    drafts.unshift(draft);
    applyDraft(draft);
    if (!silent) {
      status('新文章已建立，写完后自动保存。');
      $('title').focus();
      $('title').select();
    }
    if (me) cloudSave().catch(() => {});
    else { persist(); setSaveState('saved', '已保存 · ' + stamp()); }
    return draft;
  }

  // ------------------------------------------------------------------ cloud API
  async function api(path, method = 'GET', data) {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json', ...(me ? {'X-CSRF-Token': me.csrf} : {})},
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = Error(result.error || '请求失败（' + response.status + '）');
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function cloudSave() {
    if (!me || conflict || !ready) return queue;
    flushEdit();
    persist();
    const draft = active;
    const snapshot = {
      id: draft.id, title: draft.title, body: draft.body, date: draft.date,
      categories: draft.categories, tags: draft.tags, path: draft.path, baseSha: draft.baseSha,
    };
    draft.unsynced = true;
    queue = queue.catch(() => {}).then(async () => {
      if (draft.conflict) return;
      try {
        const result = await api('/api/drafts', 'PUT', {draft: snapshot, revision: draft.revision || 0});
        draft.revision = result.revision;
        draft.cloud = true;
        const unchanged = draft.body === snapshot.body && draft.title === snapshot.title
          && draft.date === snapshot.date
          && JSON.stringify(draft.tags) === JSON.stringify(snapshot.tags)
          && JSON.stringify(draft.categories) === JSON.stringify(snapshot.categories);
        draft.unsynced = !unchanged;
        writeDrafts();
        if (draft === active) setSaveState('cloud', unchanged ? '云端已保存 · ' + stamp() : '仍有修改待同步');
        renderListSoon();
      } catch (error) {
        draft.unsynced = true;
        if (error.status === 409) { draft.conflict = true; if (draft === active) conflict = true; }
        writeDrafts();
        if (draft === active) setSaveState('error', error.status === 409 ? '版本冲突' : '云端保存失败');
        renderListSoon();
        throw error;
      }
    });
    queue.catch(() => {});
    return queue;
  }
  async function loadPosts() {
    $('posts-message').textContent = '正在读取博客文章……';
    try {
      const items = await api('/api/posts');
      $('posts').replaceChildren();
      $('posts-message').textContent = items.length ? '点开即可编辑，改完点“更新”。' : '仓库里还没有文章。';
      for (const item of items) {
        const button = document.createElement('button');
        const cached = drafts.find(draft => draft.path === item.path);
        const name = document.createElement('span');
        name.className = 'doc-name';
        name.textContent = cached?.title || item.name.replace(/\.md$/i, '').replace(/^\d{4}-?\d{2}-?\d{2}[-_]?/, '').replace(/[-_]+/g, ' ').trim() || item.name;
        const file = document.createElement('small');
        file.className = 'article-file';
        file.textContent = item.name;
        button.append(name, file);
        button.title = item.path;
        button.onclick = () => openPost(item, button);
        $('posts').append(button);
      }
    } catch (error) {
      $('posts-message').textContent = '读取失败：' + error.message + '，点“刷新”重试。';
      throw error;
    }
  }
  async function openPost(item, button) {
    if (busy || !ready) return;
    flushEdit();
    controls(true);
    button.setAttribute('aria-busy', 'true');
    try {
      if (me && active.unsynced) {
        if (conflict) throw Error('当前草稿存在冲突，请先下载备份或读取最新版本。');
        await cloudSave();
      }
      await queue;
      const existing = drafts.find(draft => draft.path === item.path);
      let draft = existing;
      if (!draft) {
        const loaded = await api('/api/post?path=' + encodeURIComponent(item.path));
        draft = normalizeDraft({...loaded, entries: FrontMatter.parse(loaded.body).entries, cloud: true});
      }
      applyDraft(draft);
      persist();
      renderList();
      if (!existing) await cloudSave();
      status(existing ? '已打开原文章；点“更新”才改动原文。' : '原文章已载入，点“更新”发布修改。');
      if (innerWidth <= 960) closeSidebar();
    } catch (error) {
      status(error.message);
      toast(error.message);
    } finally {
      button.removeAttribute('aria-busy');
      controls(false);
    }
  }
  async function connect() {
    if (!cloudHost) return;
    $('login').textContent = '登录云端同步';
    $('login').href = '/auth/login';
    try {
      me = await api('/api/me');
      $('account').textContent = me.login;
      $('login').hidden = true;
      $('logout').hidden = false;
      $('publish').hidden = false;
      $('publish-local').hidden = true;
      $('save-cloud').hidden = false;
      $('posts-section').hidden = false;
      $('mobile-publish').hidden = false;
      $('notice').hidden = true;
      const remote = await api('/api/drafts');
      for (const draft of remote) {
        const local = drafts.find(item => item.id === draft.id);
        if (local?.unsynced) {
          local.cloud = true;
          if (local.revision !== draft.revision) { local.conflict = true; local.unsynced = true; }
        } else if (local) Object.assign(local, draft, {cloud: true, unsynced: false});
        else drafts.push(normalizeDraft({...draft, cloud: true, unsynced: false}));
      }
      const next = drafts.find(draft => draft.unsynced) || drafts.find(draft => draft.cloud) || drafts[0];
      applyDraft(next);
      persist();
      setSaveState(next.conflict ? 'error' : 'cloud', next.conflict ? '版本冲突' : next.unsynced ? '待同步' : '云端已保存');
      status(next.conflict ? '本机备份与云端版本冲突，请下载备份后读取最新版本。' : '云端已连接。');
      await loadPosts().catch(() => {});
    } catch (error) {
      me = null;
      if (error.status === 401) {
        setSaveState('saved', '本机保存');
        status('未登录：草稿只保存在这台电脑。');
      } else {
        toast('云端连接未完成：' + error.message);
        status(error.message);
      }
    }
  }
  async function publish() {
    if (!me || busy) return;
    if (uploads) { toast('图片正在插入，请稍后再发布。'); return; }
    if (conflict) { toast('草稿有版本冲突，请先读取最新版本。'); return; }
    flushEdit();
    if (!active.title.trim()) { toast('请先填写标题。'); $('title').focus(); return; }
    clearTimeout(syncTimer);
    controls(true);
    setSaveState('saving', '正在发布…');
    try {
      await cloudSave();
      await queue;
      if (active.unsynced) throw Error('草稿尚未同步到云端，暂不发布。');
      status('正在提交文章和图片……');
      const result = await api('/api/publish', 'POST', {id: active.id, revision: active.revision});
      Object.assign(active, result, {cloud: true, unsynced: false});
      editor.setValue(result.body);
      persist();
      $('deployment').hidden = false;
      $('deployment').href = 'https://github.com/sleepy-m/sleepy-m.github.io/commit/' + result.commit;
      status('已提交到 GitHub，网站正在构建；完成前仍可能看到旧版本。');
      setSaveState('cloud', '已发布');
      toast('已发布，网站正在构建。');
      let attempts = 0;
      const poll = async () => {
        try {
          const run = await api('/api/deployment?sha=' + result.commit);
          if (run.url) $('deployment').href = run.url;
          if (run.status === 'completed') {
            status(run.conclusion === 'success' ? '发布成功，博客已更新。' : '文章已提交，但网站构建失败，请打开发布进度。');
            return;
          }
          if (run.status === 'unknown') { status('文章已提交，请点击“查看发布进度”确认。'); return; }
          if (++attempts < 20) setTimeout(poll, 6000);
          else status('文章已提交，请在“查看发布进度”确认结果。');
        } catch { status('文章已提交，请在“查看发布进度”确认结果。'); }
      };
      setTimeout(poll, 6000);
    } catch (error) {
      status(error.message);
      toast(error.message);
      setSaveState('error', '发布失败');
    } finally {
      controls(false);
      flashSaved();
    }
  }
  async function recover() {
    if (!me || busy) return;
    flushEdit();
    controls(true);
    try {
      try { await queue; } catch { /* keep local */ }
      const old = active;
      let latest;
      if (old.path) latest = await api('/api/post?path=' + encodeURIComponent(old.path));
      else {
        const all = await api('/api/drafts');
        latest = all.find(draft => draft.id === old.id);
        if (!latest) throw Error('找不到云端版本，当前备份没有删除。');
        latest = {...latest, cloud: true, unsynced: false};
      }
      const backup = normalizeDraft({...old, id: crypto.randomUUID(), title: old.title + '（本机冲突备份）', path: null, baseSha: null, revision: 0, cloud: false, unsynced: false, conflict: false});
      drafts = drafts.filter(draft => draft !== old);
      drafts.unshift(backup, normalizeDraft(latest));
      conflict = false;
      applyDraft(drafts[1]);
      persist();
      renderList();
      status('已读取最新版本；原修改另存为“本机冲突备份”，可手工合并。');
    } catch (error) {
      status(error.message);
      toast(error.message);
    } finally {
      controls(false);
    }
  }
  async function logout() {
    if (busy || uploads) return;
    flushEdit();
    try {
      await cloudSave();
      if (drafts.some(draft => draft.cloud && draft.unsynced)) throw Error('其他草稿仍有未同步修改，请先保存或下载备份。');
      await api('/api/logout', 'POST', {});
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts.filter(draft => !draft.cloud)));
      location.reload();
    } catch (error) {
      status('退出未完成：' + error.message);
      toast('退出未完成：' + error.message);
    }
  }

  // -------------------------------------------------------------- file exchange
  function suggestFileName(draft) {
    const title = (draft.title || FrontMatter.titleFromBody(draft.body) || '未命名文章').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || '未命名文章';
    return (draft.date || today()) + '-' + title + '.md';
  }
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportDraft(withFrontMatter) {
    if (!ready) return;
    flushEdit();
    const markdown = withFrontMatter ? FrontMatter.toMarkdown({...active, entries: active.entries}, active.body) : active.body;
    download(markdown, suggestFileName(active));
    toast(withFrontMatter ? '已下载，含标题、日期、分类、标签，可直接放进 source/_posts。' : '已下载纯正文。');
  }
  function importMarkdown(text, name = '') {
    if (!ready) return;
    if (text.length > 5 * 1024 * 1024) { toast('文件不能超过 5MB。'); return; }
    const parsed = FrontMatter.fromMarkdown(text);
    const fallbackTitle = (name || '').replace(/\.(md|markdown|txt)$/i, '').replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '').replace(/[-_]+/g, ' ').trim();
    const draft = createDraft({
      title: parsed.title || fallbackTitle || FrontMatter.titleFromBody(parsed.body),
      body: parsed.body,
      date: parsed.date || today(),
      categories: parsed.categories,
      tags: parsed.tags,
      published: parsed.published !== false,
      entries: parsed.entries,
    });
    if (draft) {
      status(parsed.hasFrontMatter ? '已导入文章及其属性。' : '已导入正文，属性可以稍后填写。');
      toast(parsed.hasFrontMatter ? '已导入文章属性。' : '已导入正文。');
    }
  }
  function splitDocument(text) {
    if (!/^---\r?\n/.test(text)) return null;
    const parsed = FrontMatter.fromMarkdown(text);
    return parsed.hasFrontMatter ? parsed : null;
  }

  // ------------------------------------------------------------------ image I/O
  const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
  async function prepareImage(file) {
    if (!IMAGE_TYPES.test(file.type)) throw Error('只支持 PNG、JPEG、WebP、GIF 图片。');
    const limit = 2 * 1024 * 1024;
    if (file.type === 'image/gif') {
      if (file.size > limit) throw Error('动图超过 2MB，请先压缩。');
      return file;
    }
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { return file; }
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1600 / longest);
    if (scale === 1 && file.size <= 700 * 1024) { bitmap.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const type = file.type === 'image/png' ? 'image/png' : 'image/webp';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.86));
    if (!blob || blob.size >= file.size) return file;
    if (blob.size > limit) throw Error('图片压缩后仍超过 2MB，请换一张更小的图。');
    const extension = type === 'image/png' ? '.png' : '.webp';
    return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + extension, {type});
  }
  async function insertImage(file) {
    uploads++;
    try {
      const prepared = await prepareImage(file);
      if (prepared.size > 2 * 1024 * 1024) throw Error('图片超过 2MB，请先压缩后再插入。');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(prepared);
      });
      const alt = (prepared.name || '图片').replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
      editor.insertValue('\n![' + alt + '](' + data + ')\n');
      changed();
      const ratio = Math.round(prepared.size / Math.max(1, file.size) * 100);
      toast('图片已插入（' + Math.round(prepared.size / 1024) + 'KB' + (ratio < 100 ? '，已压缩到 ' + ratio + '%' : '') + '）。');
      return true;
    } catch (error) {
      toast(error.message);
      status(error.message);
      return false;
    } finally { uploads--; }
  }
  async function handleDrop(event) {
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    event.preventDefault();
    $('drop-hint').hidden = true;
    document.body.classList.remove('dropping');
    for (const file of files) {
      if (IMAGE_TYPES.test(file.type)) await insertImage(file);
      else if (/\.(md|markdown|txt)$/i.test(file.name)) importMarkdown(await file.text(), file.name);
    }
  }

  // -------------------------------------------------------------- slash command
  // Vditor can leave older copies of the editable area in the DOM while it
  // rebuilds one, so ask the live caret where it actually lives.
  function editorRoot() {
    const mount = $('editor');
    if (!mount) return null;
    const roots = [...mount.querySelectorAll('.vditor-ir .vditor-reset, .vditor-wysiwyg .vditor-reset, .vditor-sv .vditor-reset')];
    // Vditor can retain inactive mode roots in the DOM. Use the rendered editor
    // so first-line slash commands and caret checks never target a hidden copy.
    return roots.find(node => node.isConnected && node.getClientRects().length && node.isContentEditable)
      || roots.find(node => node.isConnected && node.getClientRects().length)
      || null;
  }

  function currentBlock() {
    const selection = getSelection();
    if (!selection.rangeCount) return null;
    let node = selection.anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node?.closest) return null;
    const block = node.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote');
    return block && block.closest('.vditor-reset') ? block : null;
  }
  function caretRect() {
    const selection = getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rects = range.getClientRects();
      if (rects.length) return rects[rects.length - 1];
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return rect;
    }
    const block = currentBlock();
    return block ? block.getBoundingClientRect() : {left: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3};
  }
  function insertSnippet(item) {
    if (!item) return;
    const root = editorRoot();
    if (!root) return;
    root.focus();
    if (item.kind === 'text') {
      document.execCommand('insertText', false, item.snippet);
    } else if (item.kind === 'block') {
      const data = new DataTransfer();
      data.setData('text/plain', item.snippet);
      root.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
    } else if (item.kind === 'action') {
      if (item.action === 'image') pickImage();
      if (item.action === 'shortcuts') showShortcuts();
    }
    changed();
  }
  function buildSlashMenu() {
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', '插入内容');
    document.body.append(menu);
    let open = false, query = '', index = 0, filtered = [], composing = false, navigated = false;

    function render() {
      filtered = Commands.search(query);
      menu.replaceChildren();
      if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'slash-empty';
        empty.textContent = query ? '没有匹配的块，按 Esc 取消' : '';
        menu.append(empty);
      }
      filtered.forEach((item, position) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'slash-item' + (position === index ? ' active' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(position === index));
        const icon = document.createElement('span');
        icon.className = 'slash-icon';
        icon.textContent = item.icon || '¶';
        const label = document.createElement('span');
        label.className = 'slash-label';
        label.textContent = item.label;
        const hint = document.createElement('span');
        hint.className = 'slash-hint';
        hint.textContent = item.hint;
        row.append(icon, label, hint);
        row.addEventListener('mousedown', event => event.preventDefault());
        row.addEventListener('click', event => { event.stopPropagation(); choose(item); });
        menu.append(row);
      });
      if (query) {
        const footer = document.createElement('p');
        footer.className = 'slash-footer';
        footer.textContent = '筛选：' + query;
        menu.append(footer);
      }
      const rect = caretRect();
      menu.hidden = false;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const left = Math.max(12, Math.min(rect.left, innerWidth - width - 16));
      let top = rect.bottom + 8;
      if (top + height > innerHeight - 16) top = Math.max(12, rect.top - height - 8);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.querySelector('.slash-item.active')?.scrollIntoView({block: 'nearest'});
    }
    function choose(item) {
      close(false);
      if (!item) return;
      insertSnippet(item);
    }
    function close(insertSlash) {
      if (!open) return;
      open = false;
      menu.hidden = true;
      menu.replaceChildren();
      if (insertSlash) {
        const root = editorRoot();
        root?.focus();
        document.execCommand('insertText', false, '/');
        changed();
      }
    }
    function openMenu() {
      open = true;
      query = '';
      index = 0;
      navigated = false;
      render();
    }
    function openFromButton() { openMenu(); navigated = true; }
    document.addEventListener('keydown', event => {
      if (!open || event.isComposing) return;
      const key = event.key;
      // Esc cancels the menu; it must not type a stray "/" into the document.
      if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); return; }
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation();
        if (!filtered.length) return;
        navigated = true;
        index = (index + (key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
        render();
        return;
      }
      if (key === 'Enter' || key === 'Tab') { event.preventDefault(); event.stopPropagation(); choose(filtered[index]); return; }
      if (key === 'Backspace') {
        event.preventDefault(); event.stopPropagation();
        if (!query) close(true);
        else { query = query.slice(0, -1); index = 0; render(); }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key.length === 1) {
        // Quick typing after slash means literal text. Keep the current key
        // for the editor and insert the slash that originally opened the menu.
        if (!navigated) { close(true); return; }
        event.preventDefault(); event.stopPropagation();
        query += key;
        index = 0;
        render();
      }
    }, true);
    document.addEventListener('compositionstart', () => { composing = true; }, true);
    document.addEventListener('compositionend', event => {
      composing = false;
      if (!open) return;
      query += event.data || '';
      index = 0;
      render();
    }, true);
    document.addEventListener('input', event => {
      if (!open || composing) return;
      const text = String(event.data || '').trim();
      if (!text) return;
      query += text.slice(-20);
      index = 0;
      render();
    }, true);
    document.addEventListener('mousedown', event => {
      if (open && !menu.contains(event.target)) close(false);
    });
    document.addEventListener('scroll', event => {
      if (open && (event.target === document || event.target === document.documentElement)) close(false);
    }, true);
    return {
      open: openFromButton,
      isOpen: () => open,
      close,
      intercept: event => {
        if (event.defaultPrevented) return true;
        const root = editorRoot();
        const target = event.target;
        const inEditor = !!root && target instanceof Node && root.contains(target);
        // The slash menu belongs to the document editor. Never steal keystrokes
        // from table cells, metadata fields, dialogs, or other page controls.
        if (!inEditor) {
          if (open) close(false);
          return false;
        }
        if (open) {
          if (event.key === 'Escape') return true;
          if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            query += '/';
            index = 0;
            render();
            return true;
          }
        }
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
        const targetElement = target.nodeType === 3 ? target.parentElement : target;
        // Slash commands work from any prose position. Keep / literal inside
        // code and table cells, where it is commonly part of the content.
        if (targetElement?.closest?.('td, th, pre:not(.vditor-reset), code')) return false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openMenu();
        return true;
      },
    };
  }

  function pickImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.multiple = true;
    input.onchange = async () => {
      for (const file of input.files || []) await insertImage(file);
    };
    input.click();
  }

  function attachEditorAssist(mount) {
    const pairs = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`'};
    mount.addEventListener('keydown', event => {
      if (handleListTab(event)) return;
      const root = editorRoot();
      const selection = getSelection();
      if (!root || !selection?.rangeCount) return;
      const node = selection.anchorNode;
      const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!element?.closest) return;
      const range = selection.getRangeAt(0);

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
        const block = element.closest('pre, table, blockquote, ul, ol, figure');
        if (!block || !root.contains(block)) return;
        const compact = value => String(value || '').replace(/\s+/g, '');
        const selectedText = compact(range.toString());
        const sameSelection = !!selectedText && selectedText === compact(block.innerText || block.textContent);
        const target = sameSelection ? root : block;
        const next = document.createRange();
        next.selectNodeContents(target);
        selection.removeAllRanges(); selection.addRange(next);
        event.preventDefault(); event.stopImmediatePropagation();
        return;
      }

      if (event.key === 'Backspace' && range.collapsed && node?.nodeType === Node.TEXT_NODE) {
        const offset = selection.anchorOffset;
        const before = node.data[offset - 1], after = node.data[offset];
        if (Object.entries(pairs).some(([open, close]) => before === open && after === close)) {
          range.setStart(node, offset - 1); range.setEnd(node, offset + 1); range.deleteContents();
          root.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'deleteContentBackward', data: null}));
          event.preventDefault(); event.stopImmediatePropagation(); changed(); return;
        }
      }

      if (event.key.length === 1 && pairs[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!range.collapsed) return;
        const next = node?.nodeType === Node.TEXT_NODE ? node.data[selection.anchorOffset] : '';
        if (event.key === pairs[event.key] && next === event.key) {
          const caret = document.createRange();
          if (node?.nodeType === Node.TEXT_NODE) caret.setStart(node, selection.anchorOffset + 1);
          else caret.setStart(node, Math.min(node.childNodes.length, selection.anchorOffset + 1));
          caret.collapse(true); selection.removeAllRanges(); selection.addRange(caret);
          event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        range.deleteContents();
        const pair = document.createTextNode(event.key + pairs[event.key]);
        range.insertNode(pair);
        const inside = document.createRange(); inside.setStart(pair, 1); inside.collapse(true);
        selection.removeAllRanges(); selection.addRange(inside);
        root.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: event.key + pairs[event.key]}));
        event.preventDefault(); event.stopImmediatePropagation(); changed();
      }
    }, true);
    function handleListTab(event) {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return false;
      const selection = getSelection();
      if (!selection?.rangeCount) return false;
      const anchorNode = selection.anchorNode;
      const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
      const li = anchorElement?.closest?.('li');
      const root = editorRoot();
      if (!li || !root?.contains(li) || li.closest('td, th, pre:not(.vditor-reset)')) return false;

      const clean = value => String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
      const visibleText = clean(li.innerText || li.textContent);
      const lines = editor.getValue().split('\n');
      const candidates = [];
      lines.forEach((line, lineIndex) => {
        const match = line.match(/^(\s*)([-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/);
        if (!match) return;
        const text = clean(match[3].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, ''));
        if (text === visibleText || (text && visibleText && (text.includes(visibleText) || visibleText.includes(text)))) {
          candidates.push({lineIndex, indent: match[1].length});
        }
      });
      if (!candidates.length) return false;
      const allItems = [...root.querySelectorAll('li')];
      const matchingBefore = allItems.slice(0, allItems.indexOf(li)).filter(item => clean(item.innerText || item.textContent) === visibleText).length;
      const target = candidates[Math.min(matchingBefore, candidates.length - 1)];
      const delta = event.shiftKey ? -2 : 2;
      if (event.shiftKey && target.indent < 2) { event.preventDefault(); return true; }
      const nextLines = lines.slice();
      for (let lineIndex = target.lineIndex; lineIndex < nextLines.length; lineIndex++) {
        const current = nextLines[lineIndex];
        if (lineIndex !== target.lineIndex && current.trim()) {
          const indent = current.match(/^\s*/)[0].length;
          if (indent <= target.indent) break;
        }
        if (!current.trim()) continue;
        if (lineIndex === target.lineIndex) nextLines[lineIndex] = ' '.repeat(Math.max(0, target.indent + delta)) + current.trimStart();
        else if (current.match(/^\s*([-+*]|\d+[.)])\s/)) nextLines[lineIndex] = ' '.repeat(Math.max(0, current.match(/^\s*/)[0].length + delta)) + current.trimStart();
      }
      event.preventDefault(); event.stopImmediatePropagation();
      editor.setValue(nextLines.join('\n'));
      changed();
      setTimeout(() => {
        const live = editorRoot();
        const match = [...(live?.querySelectorAll('li') || [])].find(item => clean(item.innerText || item.textContent) === visibleText);
        if (!match) return;
        live.focus();
        const caret = document.createRange(); caret.selectNodeContents(match); caret.collapse(true);
        const currentSelection = getSelection(); currentSelection.removeAllRanges(); currentSelection.addRange(caret);
      }, 100);
      return true;
    }
    return {handleListTab};
  }

  // -------------------------------------------------------------------- dialogs
  function dialog(title, content) {
    const box = document.createElement('dialog');
    box.className = 'studio-dialog';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const close = document.createElement('button');
    close.className = 'dialog-close';
    close.type = 'button';
    close.textContent = '关闭';
    close.onclick = () => box.close();
    box.append(heading, content, close);
    box.addEventListener('close', () => box.remove());
    document.body.append(box);
    box.showModal();
    return box;
  }
  function showShortcuts() {
    const rows = [
      ['Ctrl / ⌘ + S', '立即保存（登录后同时同步云端）'],
      ['/', '在正文任意位置打开插入菜单；直接继续输入会写入普通斜杠'],
      ['选中文字', '出现格式浮条：加粗、标题、列表、链接'],
      ['Ctrl / ⌘ + B / I / K', '加粗 / 斜体 / 链接'],
      ['Ctrl / ⌘ + Z / ⇧Z', '撤销 / 重做'],
      ['N', '新文章（不在输入框内时）'],
      ['Tab', '表格单元格之间移动；列表里缩进'],
      ['Esc', '关闭菜单、对话框或退出专注'],
      ['?', '打开这张快捷键表'],
    ];
    const list = document.createElement('dl');
    list.className = 'shortcut-list';
    for (const [keys, text] of rows) {
      const dt = document.createElement('dt');
      const kbd = document.createElement('kbd');
      kbd.textContent = keys;
      dt.append(kbd);
      const dd = document.createElement('dd');
      dd.textContent = text;
      list.append(dt, dd);
    }
    dialog('键盘快捷键', list);
  }
  function showExtrasDialog() {
    const rows = (active.entries || []).filter(entry => !entry.key || !FrontMatter.MANAGED.includes(entry.key));
    if (!rows.length) return;
    const pre = document.createElement('pre');
    pre.className = 'raw-extras';
    pre.textContent = rows.map(entry => entry.raw ?? (entry.key + ': ' + JSON.stringify(entry.items || entry.value))).join('\n');
    const note = document.createElement('p');
    note.className = 'dialog-note';
    note.textContent = '这些字段不在这里编辑，下载或发布时会原样写回文件。';
    const wrap = document.createElement('div');
    wrap.append(note, pre);
    dialog('其它文章属性', wrap);
  }

  // -------------------------------------------------------------------- controls
  function controls(disabled) {
    busy = disabled;
    for (const id of ['new', 'new-child', 'import', 'export', 'export-body', 'title', 'date', 'tags', 'categories', 'published', 'save-cloud', 'publish', 'publish-local', 'refresh-posts', 'logout', 'recover', 'parent-doc']) {
      const element = $(id);
      if (element) element.disabled = disabled;
    }
    if (ready) { if (disabled) editor.disabled(); else editor.enable(); }
  }

  // ------------------------------------------------------------------ menu & UI
  function syncSidebarButton(open) {
    const toggle = $('toggle-sidebar');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起文章栏' : '展开文章栏');
    toggle.setAttribute('title', open ? '收起文章栏' : '展开文章栏');
  }
  function closeSidebar() {
    document.body.classList.add('sidebar-hidden');
    syncSidebarButton(false);
  }
  function openSidebar() {
    document.body.classList.remove('sidebar-hidden');
    syncSidebarButton(true);
  }
  function setupMenus() {
    const more = $('more'), menu = $('more-menu');
    const closeMenu = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
    more.onclick = event => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
    };
    menu.addEventListener('click', closeMenu);
    document.addEventListener('click', event => { if (!menu.contains(event.target) && event.target !== more) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  }
  const THEMES = ['paper', 'light', 'dark'];
  const THEME_NAME = {paper: '跟随系统', light: '浅色', dark: '深色'};
  function applyTheme() {
    const theme = THEMES.includes(prefs.theme) ? prefs.theme : 'paper';
    document.body.dataset.theme = theme;
    $('theme-toggle').title = '外观：' + THEME_NAME[theme] + '（点击切换）';
    $('theme-toggle').textContent = theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐';
  }
  function applyPrefs() {
    document.body.classList.toggle('wide', !!prefs.wide);
    $('toggle-wide').setAttribute('aria-pressed', String(!!prefs.wide));
    $('toggle-typer').setAttribute('aria-pressed', String(!!prefs.typer));
    $('toggle-outline').setAttribute('aria-pressed', String(!!prefs.outline));
    $('outline-rail').hidden = !prefs.outline;
    if (ready) editor.vditor.options.typewriterMode = !!prefs.typer;
    if (!prefs.notice) $('notice').hidden = true;
    applyTheme();
  }

  // Offsets of the selection the bubble is about to act on.
  // Range captured by the format bar, waiting to be applied.
  let pendingSelection = null;

  // ---------------------------------------------------------- selection format
  // The document's plain text, which is what Vditor itself counts. Offsets are
  // measured against this so a selection maps onto the Markdown value directly.
  function walkTextNodes(root) {
    const nodes = [];
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) nodes.push(child);
        else if (child.nodeType === 1) walk(child);
      }
    };
    if (root) walk(root);
    return nodes;
  }

  function textLength(root, stopNode, stopOffset) {
    if (!root) return 0;
    let length = 0;
    for (const node of walkTextNodes(root)) {
      if (node === stopNode) return length + Math.min(stopOffset || 0, node.data.length);
      length += node.data.length;
    }
    return length;
  }

  // Offsets in the Markdown value for the range the format bar was shown for.
  function rangeOffsets(range) {
    // The range's own text is the authority; the DOM may have been re-rendered
    // since, so containers are never compared against the editor element.
    if (!range) return null;
    const selected = String(range.toString());
    if (!selected.trim() || selected.length > 20000) return null;
    const value = editor ? editor.getValue() : '';
    const found = value.indexOf(selected);
    return found < 0 ? null : {start: found, end: found + selected.length};
  }

  // Puts the caret back at a text offset after Vditor re-rendered the document.
  function setCaret(start) {
    const root = editorRoot();
    if (!root) return;
    root.focus();
    let remaining = start;
    let target = null;
    let offset = 0;
    for (const node of walkTextNodes(root)) {
      if (remaining <= node.data.length) { target = node; offset = remaining; break; }
      remaining -= node.data.length;
    }
    if (!target) return;
    const range = document.createRange();
    range.setStart(target, Math.min(offset, target.data.length));
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function applyFormat(action) {
    if (!ready) return;
    const root = editorRoot();
    if (!root) return;
    // The bar captured the user's range while it was still live; nothing else is
    // trusted, because Vditor may have re-rendered since.
    const offsets = pendingSelection;
    pendingSelection = null;
    if (!offsets) {
      toast('没能找到刚才选中的文字，请重新选中后再试');
      return;
    }
    const value = editor.getValue();
    let {start, end} = offsets;
    while (start < end && /\s/.test(value[start])) start += 1;
    while (end > start && /\s/.test(value[end - 1])) end -= 1;
    const selected = value.slice(start, end);
    if (!selected || selected.length > 20000) {
      toast('没能找到刚才选中的文字，请重新选中后再试');
      return;
    }
    const markers = {bold: '**', italic: '*', strike: '~~', code: '`'};
    if (markers[action]) {
      const result = StudioBubble.toggleMarkdown(value, start, end, markers[action], '文字');
      editor.setValue(result.value);
      setCaret(result.start);
      changed();
      return;
    }
    if (action === 'link') {
      const isUrl = /^https?:\/\//i.test(selected);
      const url = window.prompt('链接地址（留空可取消）', isUrl ? selected : 'https://');
      if (!url || !url.trim()) return;
      const text = isUrl ? url.trim() : selected;
      const inserted = '[' + text + '](' + url.trim() + ')';
      editor.setValue(value.slice(0, start) + inserted + value.slice(end));
      setCaret(start + inserted.length);
      changed();
      return;
    }
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const prefixes = {h1: '# ', h2: '## ', h3: '### ', quote: '> ', list: '- ', ol: '1. ', check: '- [ ] '};
    if (prefixes[action]) {
      const result = StudioBubble.applyLinePrefix(value, lineStart, prefixes[action]);
      editor.setValue(result.value);
      setCaret(result.caret);
      changed();
    }
  }

  // ---------------------------------------------------------------- boot & wire
  function setupTags(field) {
    const input = $(field);
    const addValues = values => {
      if (!values.length) return;
      const next = tagValues(field).slice();
      for (const value of values) if (!next.includes(value)) next.push(value);
      setTagValues(field, next);
      stateChanged();
      persist();
    };
    input.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ',' || event.key === '，') && !event.isComposing) {
        event.preventDefault();
        const values = split(input.value);
        input.value = '';
        addValues(values);
        closeSuggestions(input);
      }
      if (event.key === 'Backspace' && !input.value) {
        const current = tagValues(field);
        if (current.length) { setTagValues(field, current.slice(0, -1)); stateChanged(); persist(); }
      }
      if (event.key === 'Escape') closeSuggestions(input);
    });
    input.addEventListener('blur', () => {
      const values = split(input.value);
      input.value = '';
      addValues(values);
      closeSuggestions(input);
    });
    input.addEventListener('input', () => {
      const query = input.value.trim();
      const box = ensureSuggestions(input);
      if (!query) { box.replaceChildren(); box.hidden = true; return; }
      const pool = new Set();
      for (const draft of drafts) for (const value of draft[field] || []) pool.add(value);
      const suggestions = [...pool].filter(value => value.includes(query) && !tagValues(field).includes(value)).slice(0, 6);
      box.replaceChildren();
      box.hidden = !suggestions.length;
      for (const value of suggestions) {
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = value;
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => {
          input.value = '';
          box.hidden = true;
          addValues([value]);
          input.focus();
        });
        box.append(option);
      }
    });
  }
  function ensureSuggestions(input) {
    let box = input.parentElement.querySelector('.tag-suggest');
    if (!box) {
      box = document.createElement('div');
      box.className = 'tag-suggest';
      box.hidden = true;
      input.parentElement.append(box);
    }
    return box;
  }
  function closeSuggestions(input) {
    const box = input.parentElement.querySelector('.tag-suggest');
    if (box) { box.hidden = true; box.replaceChildren(); }
  }

  function boot() {
    loadDrafts();
    applyPrefs();
    $('new').onclick = () => createDraft();
    $('new-child').onclick = async () => {
      if (!ready || busy) return;
      if (!me && cloudHost) { toast('请先登录，再创建可跨电脑保存的子文档。'); return; }
      if (conflict) { toast('请先处理当前文档的版本冲突。'); return; }
      flushEdit();
      const parentId = Tree.id(active);
      editor.setValue(Tree.stamp(editor.getValue(), parentId, Tree.parent(active)));
      changed();
      clearTimeout(syncTimer);
      if (me) await cloudSave().catch(() => {});
      createDraft({title: '未命名子文档', body: Tree.stamp('', crypto.randomUUID(), parentId), silent: true});
      $('title').focus();
      $('title').select();
    };
    $('parent-doc').onchange = () => {
      if (!ready || busy) return;
      flushEdit();
      editor.setValue(Tree.stamp(editor.getValue(), Tree.id(active), $('parent-doc').value));
      changed();
      toast($('parent-doc').value ? '已设为子文档。' : '已设为顶级文档。');
    };
    $('title').addEventListener('input', () => {
      changed();
      $('crumb-title').textContent = $('title').value.trim() || '无标题文章';
    });
    $('title').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); editor.focus(); }
    });
    $('date').addEventListener('change', () => { commit(); stateChanged(); });
    $('published').addEventListener('change', () => {
      commit();
      stateChanged();
      persist();
      toast($('published').checked ? '已标记为发布。' : '已标记为草稿，导出时写入 published: false。');
    });
    setupTags('categories');
    setupTags('tags');
    $('props-toggle').onclick = () => {
      extrasWanted = !extrasWanted;
      updatePropsVisibility();
    };
    $('search').addEventListener('input', filterArticles);
    $('search').addEventListener('keydown', event => {
      if (event.key === 'Escape') { $('search').value = ''; filterArticles(); $('search').blur(); }
      if (event.key === 'Enter') document.querySelector('#results .result, #drafts .doc-tree-line > button')?.click();
    });
    if (innerWidth <= 960) closeSidebar();
    setupMenus();
    $('notice-close').onclick = () => { $('notice').hidden = true; prefs.notice = false; savePrefs(); };
    $('toggle-sidebar').onclick = () => { if (document.body.classList.contains('sidebar-hidden')) openSidebar(); else closeSidebar(); };
    $('close-sidebar').onclick = () => closeSidebar();
    document.addEventListener('click', event => {
      if (innerWidth > 960) return;
      if (!event.target.closest?.('aside .doc-tree-line > button, aside #posts button, aside .result, aside #new')) return;
      closeSidebar();
    });
    // Resizing across the phone breakpoint must also settle the drawer state.
    window.addEventListener('resize', () => {
      if (innerWidth > 960) document.body.classList.remove('sidebar-hidden');
      else if (innerWidth <= 960) closeSidebar();
      syncSidebarButton(!document.body.classList.contains('sidebar-hidden'));
    }, {passive: true});
    $('focus-mode').onclick = () => {
      const focus = document.body.classList.toggle('focus-mode');
      $('focus-mode').setAttribute('aria-pressed', String(focus));
      $('focus-mode').textContent = focus ? '退出' : '专注';
      $('toggle-sidebar').disabled = focus;
    };
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.body.classList.contains('focus-mode') && !document.querySelector('dialog[open], .slash-menu:not([hidden])')) {
        $('focus-mode').click();
      }
    });
    $('toggle-outline').onclick = () => {
      prefs.outline = !prefs.outline;
      savePrefs();
      applyPrefs();
      toast(prefs.outline ? '已显示大纲。' : '已收起大纲。');
    };
    $('toggle-wide').onclick = () => {
      prefs.wide = !prefs.wide;
      savePrefs();
      applyPrefs();
      toast(prefs.wide ? '宽屏写作：正文铺满窗口。' : '舒适宽度：正文限制在便于阅读的宽度。');
    };
    $('toggle-typer').onclick = () => {
      prefs.typer = !prefs.typer;
      savePrefs();
      applyPrefs();
      toast(prefs.typer ? '打字机模式：光标始终停在屏幕中间。' : '已关闭打字机模式。');
    };
    $('theme-toggle').onclick = () => {
      prefs.theme = THEMES[(THEMES.indexOf(prefs.theme || 'paper') + 1) % THEMES.length];
      savePrefs();
      applyTheme();
      toast('外观：' + THEME_NAME[prefs.theme]);
    };
    $('shortcuts').onclick = showShortcuts;
    $('extra-fields').onclick = showExtrasDialog;
    $('import').onclick = () => $('file').click();
    $('file').onchange = async () => {
      const file = $('file').files?.[0];
      if (file) importMarkdown(await file.text(), file.name);
      $('file').value = '';
    };
    $('export').onclick = () => exportDraft(true);
    $('export-body').onclick = () => exportDraft(false);
    $('publish-local').onclick = () => exportDraft(true);
    $('save-cloud').onclick = () => { clearTimeout(syncTimer); cloudSave().catch(error => toast(error.message)); };
    $('publish').onclick = publish;
    $('recover').onclick = recover;
    $('logout').onclick = logout;
    $('refresh-posts').onclick = () => loadPosts().catch(error => toast(error.message));
    $('mobile-menu').onclick = () => openSidebar();
    $('mobile-insert').onclick = () => {
      if (!ready || busy) return;
      editor.focus();
      if (innerWidth <= 960) closeSidebar();
      slash?.open();
    };
    $('mobile-save').onclick = () => {
      saveNow();
      $('mobile-save').textContent = '已保存 ✓';
      setTimeout(() => { $('mobile-save').textContent = '保存'; }, 1400);
    };
    $('mobile-publish').onclick = publish;

    document.addEventListener('keydown', event => {
      if (event.isComposing || event.defaultPrevented) return;
      const typing = !!document.activeElement?.closest?.('.vditor-reset, input, textarea, select');
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 's') { event.preventDefault(); saveNow(); return; }
      if (ready && !typing && !meta && !event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); createDraft(); return; }
      if (typing) return;
      if (!meta && !event.altKey && event.key === '/') {
        if (!ready || busy) return;
        event.preventDefault();
        editor.focus();
        slash?.open();
        return;
      }
      if (!meta && (event.key === '?' || (event.shiftKey && event.key === '/'))) { event.preventDefault(); showShortcuts(); }
    });

    window.addEventListener('pagehide', () => { if (ready) { flushEdit(); flushPersist(); } });
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushEdit(); flushPersist(); } });
    window.addEventListener('beforeunload', event => {
      if (!ready) return;
      if ((me && active?.unsynced) || (active && editor.getValue() !== active.body)) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    window.addEventListener('storage', event => {
      if (event.key === DRAFT_KEY) toast('另一个标签页修改了草稿，切换前请确认要保留哪一份。', 6000);
    });
    document.addEventListener('dragover', event => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      $('drop-hint').hidden = false;
      document.body.classList.add('dropping');
    });
    document.addEventListener('dragleave', event => {
      if (event.relatedTarget) return;
      $('drop-hint').hidden = true;
      document.body.classList.remove('dropping');
    });
    document.addEventListener('drop', handleDrop);
  }

  let slash = null, editorAssist = null;
  function startEditor() {
    fillFields();
    try {
      editor = new Vditor('editor', {
        cdn: location.origin + '/vendor/vditor',
        lang: 'zh_CN',
        mode: 'ir',
        value: ensureParagraph(active.body),
        cache: {enable: false},
        height: 'auto',
        outline: {enable: false, position: 'right'},
        placeholder: '从这里开始写……输入 / 插入标题、表格、图片',
        counter: {enable: false},
        typewriterMode: !!prefs.typer,
        toolbarConfig: {hide: true},
        toolbar: ['bold'],
        preview: {math: {engine: 'KaTeX'}, hljs: {style: 'github'}, markdown: {sanitize: true, codeBlockPreview: true}},
        upload: {
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          handler: async files => { for (const file of files) await insertImage(file); return null; },
        },
        input: changed,
        // Only the / menu intercepts keys; anything else must reach Vditor
        // untouched, otherwise Vditor re-renders and the selection collapses.
        keydown: event => {
          if (slash && slash.intercept(event)) return;
        },
        after: () => {
          ready = true;
          slash = buildSlashMenu();
          renderList();
          persist();
          setSaveState('saved', '已保存');
          status(storageFailed ? '本机保存不可用，请及时下载备份。' : '草稿自动保存在这台电脑');
          updateStats();
          renderOutline();
          connect();
        },
      });
    } catch (error) {
      status('编辑器加载失败，请刷新页面或使用备用后台。');
      toast('编辑器加载失败：' + error.message, 8000);
      return;
    }
    StudioTableTools.mount({root: $('editor'), getValue: () => editor.getValue(), setValue: value => editor.setValue(value), onChange: changed, isBusy: () => !ready || busy});
    bubble = StudioBubble.mount({
      // Runs while the selection is still live, before Vditor can re-render.
      // The bar reports the range it was shown for, while it is still live.
      // The bar reports the range it was shown for, while it is still live.
      beforeApply: (kind, rect, range) => {
        pendingSelection = rangeOffsets(range);
      },
      isInside: node => {
        // Any text inside the editor counts, including the hidden wrapper nodes
        // Vditor uses while a block is being edited.
        if (!node) return false;
        const element = node.nodeType === 3 ? node.parentElement : node;
        if (!element) return false;
        if (element.nodeType === 9) return true;
        const mount = document.getElementById('editor');
        if (mount && mount.contains(element)) return true;
        const live = editorRoot();
        return !!live && (live.contains(element) || (element.closest && !!element.closest('.vditor-reset')));
      },
      onApply: action => {
        if (action === 'more') { slash?.open(); return; }
        applyFormat(action);
      },
    });
    const root = $('editor');
    editorAssist = attachEditorAssist(root);
    // The document sees every key first; the menu only consumes editing keys
    // while it is open, so normal typing and selections are never interrupted.
    document.addEventListener('keydown', event => {
      if (editorAssist?.handleListTab(event)) return;
      if (slash) slash.intercept(event);
    }, true);
    function rewriteClipboard(event) {
      const text = event.clipboardData?.getData('text/plain') || '';
      const parsed = splitDocument(text);
      if (!parsed) return;
      const items = event.clipboardData.items;
      if (items) for (const item of items) if (item.kind === 'file') return;
      const filled = [];
      if (!$('title').value.trim() && parsed.title) { $('title').value = parsed.title; filled.push('标题'); }
      if (!active.categories.length && parsed.categories.length) { setTagValues('categories', parsed.categories); filled.push('分类'); }
      if (!active.tags.length && parsed.tags.length) { setTagValues('tags', parsed.tags); filled.push('标签'); }
      if (parsed.date) $('date').value = parsed.date;
      if (parsed.published === false) $('published').checked = false;
      active.entries = parsed.entries;
      showExtras();
      try { items?.clearData(); } catch { /* clipboard write may be forbidden */ }
      try {
        event.clipboardData?.setData('text/plain', parsed.body);
        event.clipboardData?.setData('text/html', '');
      } catch { /* keep the original payload: it still pastes as text */ }
      toast(filled.length ? '已读入文章属性（' + filled.join('、') + '），只粘贴正文。' : '已跳过文件头，只粘贴正文。');
    }
    root.addEventListener('paste', rewriteClipboard, true);
    root.addEventListener('dragover', event => event.preventDefault());
    if (new URLSearchParams(location.search).has('test')) {
      window.__studioTest = {
        value: () => editor.getValue(),
        body: () => active.body,
        state: () => ({
          ready, dirty: $('save-chip').dataset.state, title: active?.title,
          extras: (active?.entries || []).length, drafts: drafts.length,
          tags: (active?.tags || []).slice(), categories: (active?.categories || []).slice(),
          headings: headingsOf(editor.getValue()).length,
        }),
        setValue: value => editor.setValue(value),
        save: () => saveNow(),
        flush: () => { flushEdit(); persist(); },
        create: options => createDraft(options),
        outline: () => [...document.querySelectorAll('#outline .outline-item')].map(item => item.textContent),
        bubble: () => bubble?.element ? {hidden: bubble.element.hidden, buttons: bubble.element.querySelectorAll('button').length} : null,
        // Test hook: show the selection bar exactly when Vditor emits selectionchange.
        showBubble: () => { bubble.show(); return bubble.element.querySelectorAll('button').length; },
        applyFormat: action => applyFormat(action),
        headings: () => headingsOf(editor.getValue()),
      };
    }
  }

  boot();
  document.documentElement.dataset.boot = '1';
  // The canvas needs a document first: build the draft model, then the editor.
  try { loadDrafts(); startEditor(); } catch (error) { document.documentElement.dataset.boot = 'error:' + (error && error.message); }
})();
