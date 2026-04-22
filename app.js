// ─── State ───────────────────────────────────────────────────────────────────

const State = {
  topics: [],
  statuses: {},
  filters: {},      // topicId -> boolean
  testState: null
};

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadState() {
  const topicsRaw   = localStorage.getItem('mb_topics');
  const statusesRaw = localStorage.getItem('mb_statuses');

  if (topicsRaw) {
    State.topics = JSON.parse(topicsRaw);
  } else if (typeof BIBLE_DATA !== 'undefined') {
    State.topics = JSON.parse(JSON.stringify(BIBLE_DATA));
  } else {
    console.error('data.js가 로드되지 않았습니다. index.html과 같은 폴더에 data.js를 추가하세요.');
    State.topics = [];
  }

  if (statusesRaw) {
    State.statuses = JSON.parse(statusesRaw);
  } else {
    State.statuses = {};
    State.topics.forEach(t => t.verses.forEach(v => {
      State.statuses[v.id] = 'unknown';
    }));
  }

  // ensure any verse without a status gets one
  State.topics.forEach(t => t.verses.forEach(v => {
    if (!State.statuses[v.id]) State.statuses[v.id] = 'unknown';
  }));

  if (!topicsRaw) saveTopics();
  if (!statusesRaw) saveStatuses();
}

function saveTopics()   { localStorage.setItem('mb_topics',   JSON.stringify(State.topics)); }
function saveStatuses() { localStorage.setItem('mb_statuses', JSON.stringify(State.statuses)); }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTopicById(id) { return State.topics.find(t => t.id === id); }

function getTopicCompletion(topic) {
  const total = topic.verses.length;
  if (!total) return { done: 0, total: 0, pct: 0 };
  const done = topic.verses.filter(v => State.statuses[v.id] === 'complete').length;
  return { done, total, pct: Math.round(done / total * 100) };
}

function statusLabel(s) {
  return s === 'complete' ? '완료' : s === 'incomplete' ? '불완전' : '아예 모름';
}

function statusClass(s) {
  return s === 'complete' ? 'st-complete' : s === 'incomplete' ? 'st-incomplete' : 'st-unknown';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => { v.hidden = true; });
  document.getElementById(viewId).hidden = false;
  const isHome = viewId === 'view-main';
  document.getElementById('btn-settings').hidden = !isHome;
  document.getElementById('btn-back').hidden      = isHome;
}

// ─── Main View ───────────────────────────────────────────────────────────────

function renderMainView() {
  document.getElementById('view-main').innerHTML =
    State.topics.map(renderTopicCard).join('');
  showView('view-main');
}

function renderTopicCard(topic) {
  const { done, total, pct } = getTopicCompletion(topic);
  const checked = State.filters[topic.id] ? 'checked' : '';
  return `
<div class="topic-card" id="card-${topic.id}">
  <div class="topic-header">
    <span class="topic-title">${esc(topic.title)}</span>
    <span class="completion-badge" id="completion-${topic.id}">완료 ${done}/${total} (${pct}%)</span>
  </div>
  <div class="progress-bar"><div class="progress-fill" id="progress-${topic.id}" style="width:${pct}%"></div></div>
  <label class="filter-label">
    <input type="checkbox" class="filter-checkbox" data-topic-id="${topic.id}" ${checked}>
    불완전/모름만 보기
  </label>
  <ul class="verse-list" id="verse-list-${topic.id}">${renderVerseItems(topic)}</ul>
  ${total === 0 ? '<p class="empty-msg">아직 등록된 말씀이 없습니다.</p>' : ''}
  <button class="btn-test" data-topic-id="${topic.id}" ${total === 0 ? 'disabled' : ''}>테스트</button>
</div>`;
}

function renderVerseItems(topic) {
  const filter = State.filters[topic.id];
  const verses = filter
    ? topic.verses.filter(v => State.statuses[v.id] !== 'complete')
    : topic.verses;
  if (filter && verses.length === 0)
    return '<li class="empty-filter-msg">완료된 말씀만 있습니다. 필터를 해제하세요.</li>';
  return verses.map(v => {
    const s = State.statuses[v.id] || 'unknown';
    return `
<li class="verse-row" id="verse-row-${v.id}">
  <div class="verse-content">
    <span class="verse-ref">${esc(v.ref)}</span>
    <span class="verse-text">${esc(v.text)}</span>
  </div>
  <div class="status-group" data-verse-id="${v.id}" data-topic-id="${topic.id}">
    <button class="status-btn${s==='complete'?' active':''}"   data-status="complete">완료</button>
    <button class="status-btn${s==='incomplete'?' active':''}" data-status="incomplete">불완전</button>
    <button class="status-btn${s==='unknown'?' active':''}"   data-status="unknown">아예 모름</button>
  </div>
</li>`;
  }).join('');
}

function updateStatus(verseId, newStatus, topicId) {
  State.statuses[verseId] = newStatus;
  saveStatuses();

  // update buttons in-place
  const row = document.getElementById('verse-row-' + verseId);
  if (row) {
    row.querySelectorAll('.status-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.status === newStatus));
  }

  // update progress display
  const topic = getTopicById(topicId);
  if (topic) {
    const { done, total, pct } = getTopicCompletion(topic);
    const badge = document.getElementById('completion-' + topicId);
    const bar   = document.getElementById('progress-' + topicId);
    if (badge) badge.textContent = `완료 ${done}/${total} (${pct}%)`;
    if (bar)   bar.style.width   = pct + '%';
  }

  // if filter active and verse is now complete, re-render list
  if (State.filters[topicId] && newStatus === 'complete') {
    rerenderVerseList(topicId);
  }
}

function rerenderVerseList(topicId) {
  const topic = getTopicById(topicId);
  const list  = document.getElementById('verse-list-' + topicId);
  if (topic && list) list.innerHTML = renderVerseItems(topic);
}

// ─── Test Mode ───────────────────────────────────────────────────────────────

function openTestModal(topicId) {
  const topic = getTopicById(topicId);
  document.getElementById('modal-topic-name').textContent = topic.title;
  document.getElementById('modal-test').dataset.topicId = topicId;
  document.getElementById('modal-test').hidden = false;
}

function closeTestModal() {
  document.getElementById('modal-test').hidden = true;
}

function startTest(topicId, mode) {
  closeTestModal();
  const topic = getTopicById(topicId);
  State.testState = { topicId, mode, verses: [...topic.verses], index: 0 };
  showView('view-test');
  renderTestCard();
}

function renderTestCard() {
  const ts    = State.testState;
  const verse = ts.verses[ts.index];
  const s     = State.statuses[verse.id] || 'unknown';
  const prog  = `${ts.index + 1} / ${ts.verses.length}`;
  const isLast = ts.index + 1 >= ts.verses.length;

  const prompt = ts.mode === 'recite' ? esc(verse.ref)  : esc(verse.text);
  const answer = ts.mode === 'recite' ? esc(verse.text) : esc(verse.ref);
  const revealBtn = ts.mode === 'recite' ? '말씀 보기' : '장절 보기';

  document.getElementById('view-test').innerHTML = `
<div class="test-progress">${prog}</div>
<div class="test-card">
  <div class="test-prompt">${prompt}</div>
  <div class="test-answer" id="test-answer" style="visibility:hidden">${answer}</div>
  <button class="btn-reveal btn-primary" id="btn-reveal">${revealBtn}</button>
  <div class="test-status-area" id="test-status-area" hidden>
    <p class="current-status-label">현재 상태:
      <span id="cur-status-span" class="${statusClass(s)}">${statusLabel(s)}</span>
    </p>
    <div class="status-group" data-verse-id="${verse.id}" data-topic-id="${ts.topicId}">
      <button class="status-btn${s==='complete'?' active':''}"   data-status="complete">완료</button>
      <button class="status-btn${s==='incomplete'?' active':''}" data-status="incomplete">불완전</button>
      <button class="status-btn${s==='unknown'?' active':''}"   data-status="unknown">아예 모름</button>
    </div>
    <button class="btn-next btn-primary" id="btn-next">${isLast ? '결과 보기' : '다음 →'}</button>
  </div>
</div>`;
}

function revealAnswer() {
  document.getElementById('test-answer').style.visibility = 'visible';
  document.getElementById('btn-reveal').hidden = true;
  document.getElementById('test-status-area').hidden = false;
}

function advanceTest() {
  State.testState.index++;
  if (State.testState.index >= State.testState.verses.length) {
    renderTestCompletion();
  } else {
    renderTestCard();
  }
}

function renderTestCompletion() {
  const ts    = State.testState;
  const topic = getTopicById(ts.topicId);
  const { done, total, pct } = getTopicCompletion(topic);
  const incomplete = topic.verses.filter(v => State.statuses[v.id] === 'incomplete').length;
  const unknown    = topic.verses.filter(v => State.statuses[v.id] === 'unknown').length;

  document.getElementById('view-test').innerHTML = `
<div class="test-completion">
  <h2>테스트 완료!</h2>
  <p class="topic-name">${esc(topic.title)}</p>
  <div class="completion-stats">
    <div class="stat st-complete">완료: ${done}개</div>
    <div class="stat st-incomplete">불완전: ${incomplete}개</div>
    <div class="stat st-unknown">아예 모름: ${unknown}개</div>
  </div>
  <p class="pct-label">총 ${total}개 중 완료 ${done}개 (${pct}%)</p>
  <button id="btn-back-home" class="btn-primary">홈으로 돌아가기</button>
</div>`;
}

// ─── Settings View ───────────────────────────────────────────────────────────

function renderSettingsView() {
  const topicSections = State.topics.map(t => `
<div class="settings-topic" id="settings-topic-${t.id}">
  <div class="settings-topic-header">
    <span class="settings-topic-title">${esc(t.title)}</span>
    <button class="btn-danger btn-delete-topic" data-topic-id="${t.id}">주제 삭제</button>
  </div>
  <ul class="settings-verse-list" id="sv-${t.id}">${renderSettingsVerseItems(t)}</ul>
  <div class="add-verse-area" id="ava-${t.id}">
    <button class="btn-secondary btn-add-verse" data-topic-id="${t.id}">+ 구절 추가</button>
  </div>
</div>`).join('');

  document.getElementById('view-settings').innerHTML = `
<section class="settings-section">
  <h3>암송 상태 초기화</h3>
  <button id="btn-reset-all" class="btn-danger">모든 암송 상태 초기화 (아예 모름)</button>
</section>
<section class="settings-section">
  <h3>새 주제 추가</h3>
  <div class="add-topic-form">
    <input type="text" id="new-topic-title" class="text-input" placeholder="주제 이름">
    <button id="btn-add-topic" class="btn-primary">추가</button>
  </div>
</section>
<section class="settings-section">
  <h3>주제별 관리</h3>
  ${topicSections}
</section>`;

  showView('view-settings');
}

function renderSettingsVerseItems(topic) {
  if (!topic.verses.length)
    return '<li class="empty-msg">등록된 구절이 없습니다.</li>';
  return topic.verses.map(v => `
<li class="settings-verse-row" id="svr-${v.id}">
  <div class="settings-verse-content">
    <span class="verse-ref">${esc(v.ref)}</span>&nbsp;
    <span class="verse-text">${esc(v.text)}</span>
  </div>
  <div class="settings-verse-actions">
    <button class="btn-secondary btn-edit-verse"   data-topic-id="${topic.id}" data-verse-id="${v.id}">편집</button>
    <button class="btn-danger   btn-delete-verse"  data-topic-id="${topic.id}" data-verse-id="${v.id}">삭제</button>
  </div>
</li>`).join('');
}

// ─── Settings CRUD ───────────────────────────────────────────────────────────

function showAddVerseForm(topicId) {
  document.getElementById('ava-' + topicId).innerHTML = `
<div class="add-verse-form">
  <input  type="text" class="text-input" id="nav-ref-${topicId}"  placeholder="장절 (예: 요 3:16)">
  <textarea class="text-input" id="nav-text-${topicId}" rows="3" placeholder="말씀 내용"></textarea>
  <div class="form-actions">
    <button class="btn-primary"   onclick="submitAddVerse('${topicId}')">추가</button>
    <button class="btn-secondary" onclick="cancelAddVerse('${topicId}')">취소</button>
  </div>
</div>`;
}

function cancelAddVerse(topicId) {
  document.getElementById('ava-' + topicId).innerHTML =
    `<button class="btn-secondary btn-add-verse" data-topic-id="${topicId}">+ 구절 추가</button>`;
}

function submitAddVerse(topicId) {
  const ref  = document.getElementById('nav-ref-'  + topicId).value.trim();
  const text = document.getElementById('nav-text-' + topicId).value.trim();
  if (!ref || !text) { alert('장절과 말씀 내용을 모두 입력해주세요.'); return; }
  const newVerse = { id: genId('v'), ref, text };
  getTopicById(topicId).verses.push(newVerse);
  State.statuses[newVerse.id] = 'unknown';
  saveTopics(); saveStatuses();
  renderSettingsView();
}

function showEditVerseForm(topicId, verseId) {
  const topic = getTopicById(topicId);
  const verse = topic.verses.find(v => v.id === verseId);
  document.getElementById('svr-' + verseId).innerHTML = `
<div class="add-verse-form">
  <input  type="text" class="text-input" id="ev-ref-${verseId}"  value="${esc(verse.ref)}">
  <textarea class="text-input" id="ev-text-${verseId}" rows="3">${esc(verse.text)}</textarea>
  <div class="form-actions">
    <button class="btn-primary"   onclick="saveVerseEdit('${topicId}','${verseId}')">저장</button>
    <button class="btn-secondary" onclick="renderSettingsView()">취소</button>
  </div>
</div>`;
}

function saveVerseEdit(topicId, verseId) {
  const ref  = document.getElementById('ev-ref-'  + verseId).value.trim();
  const text = document.getElementById('ev-text-' + verseId).value.trim();
  if (!ref || !text) { alert('장절과 말씀 내용을 모두 입력해주세요.'); return; }
  const topic = getTopicById(topicId);
  const verse = topic.verses.find(v => v.id === verseId);
  verse.ref = ref; verse.text = text;
  saveTopics();
  renderSettingsView();
}

function deleteVerse(topicId, verseId) {
  if (!confirm('이 구절을 삭제하시겠습니까?')) return;
  const topic = getTopicById(topicId);
  topic.verses = topic.verses.filter(v => v.id !== verseId);
  delete State.statuses[verseId];
  saveTopics(); saveStatuses();
  renderSettingsView();
}

function addTopic(title) {
  if (!title.trim()) { alert('주제 이름을 입력해주세요.'); return; }
  State.topics.push({ id: genId('t'), title: title.trim(), verses: [] });
  saveTopics();
  renderSettingsView();
}

function deleteTopic(topicId) {
  if (!confirm('이 주제와 모든 구절을 삭제하시겠습니까?')) return;
  getTopicById(topicId).verses.forEach(v => delete State.statuses[v.id]);
  State.topics = State.topics.filter(t => t.id !== topicId);
  saveTopics(); saveStatuses();
  renderSettingsView();
}

function resetAllStatuses() {
  if (!confirm("모든 암송 상태를 '아예 모름'으로 초기화하시겠습니까?")) return;
  State.topics.forEach(t => t.verses.forEach(v => { State.statuses[v.id] = 'unknown'; }));
  saveStatuses();
  renderSettingsView();
}

// ─── Events ──────────────────────────────────────────────────────────────────

function bindEvents() {
  // Header
  document.getElementById('btn-settings').addEventListener('click', renderSettingsView);
  document.getElementById('btn-back').addEventListener('click', renderMainView);

  // Modal
  const modal = document.getElementById('modal-test');
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.id === 'btn-modal-cancel') { closeTestModal(); return; }
    if (e.target.classList.contains('btn-mode')) {
      startTest(modal.dataset.topicId, e.target.dataset.mode);
    }
  });

  // Main view (delegated)
  document.getElementById('view-main').addEventListener('click', e => {
    const sg = e.target.closest('.status-group');
    if (sg && e.target.classList.contains('status-btn')) {
      updateStatus(sg.dataset.verseId, e.target.dataset.status, sg.dataset.topicId);
      return;
    }
    if (e.target.classList.contains('btn-test')) {
      openTestModal(e.target.dataset.topicId);
    }
  });

  document.getElementById('view-main').addEventListener('change', e => {
    if (e.target.classList.contains('filter-checkbox')) {
      const id = e.target.dataset.topicId;
      State.filters[id] = e.target.checked;
      rerenderVerseList(id);
    }
  });

  // Test view (delegated)
  document.getElementById('view-test').addEventListener('click', e => {
    if (e.target.id === 'btn-reveal') { revealAnswer(); return; }
    if (e.target.id === 'btn-next')   { advanceTest();  return; }
    if (e.target.id === 'btn-back-home') { renderMainView(); return; }

    const sg = e.target.closest('.status-group');
    if (sg && e.target.classList.contains('status-btn')) {
      const ns = e.target.dataset.status;
      updateStatus(sg.dataset.verseId, ns, sg.dataset.topicId);
      // update label
      const span = document.getElementById('cur-status-span');
      if (span) { span.className = statusClass(ns); span.textContent = statusLabel(ns); }
      // highlight button
      sg.querySelectorAll('.status-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.status === ns));
    }
  });

  // Settings view (delegated)
  document.getElementById('view-settings').addEventListener('click', e => {
    if (e.target.id === 'btn-reset-all') { resetAllStatuses(); return; }
    if (e.target.id === 'btn-add-topic') {
      addTopic(document.getElementById('new-topic-title').value); return;
    }
    if (e.target.classList.contains('btn-add-verse'))
      { showAddVerseForm(e.target.dataset.topicId); return; }
    if (e.target.classList.contains('btn-edit-verse'))
      { showEditVerseForm(e.target.dataset.topicId, e.target.dataset.verseId); return; }
    if (e.target.classList.contains('btn-delete-verse'))
      { deleteVerse(e.target.dataset.topicId, e.target.dataset.verseId); return; }
    if (e.target.classList.contains('btn-delete-topic'))
      { deleteTopic(e.target.dataset.topicId); return; }
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

function initApp() {
  loadState();
  bindEvents();
  renderMainView();
}

document.addEventListener('DOMContentLoaded', initApp);
