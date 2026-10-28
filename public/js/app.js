/* Classroom Hub browser client. Access tokens stay in memory; refresh tokens stay in httpOnly cookies. */
(() => {
  const root = document.documentElement;
  const postList = document.getElementById('post-list');
  if (!postList) return;

  let accessToken = '';
  let currentUser = null;
  let currentType = 'note';
  let currentPage = 1;
  let savedOnly = false;
  let currentAdminView = 'users';
  let searchTimer;
  let activeObjectUrl = '';
  const pageSize = 10;
  const themes = ['light', 'dark'];

  function toast(text, isError = false) {
    const region = document.getElementById('toast-region');
    const element = document.createElement('div');
    element.className = 'toast';
    element.setAttribute('role', isError ? 'alert' : 'status');
    element.textContent = text;
    region.append(element);
    window.setTimeout(() => element.remove(), 4200);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  function setTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem('classroom-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111827' : '#f4f7fb');
  }
  setTheme(themes.includes(localStorage.getItem('classroom-theme')) ? localStorage.getItem('classroom-theme') : 'light');

  async function refresh() {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error('Sign in again to continue.');
    accessToken = result.data.accessToken;
    currentUser = result.data.user;
    return result.data;
  }

  async function api(path, options = {}, retry = true) {
    if (!accessToken && !path.startsWith('/api/auth/')) await refresh();
    const headers = new Headers(options.headers || {});
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
    if (response.status === 401 && retry) {
      try { await refresh(); return api(path, options, false); }
      catch (_error) {
        preserveDraft();
        location.replace('/login.html');
        throw new Error('Your session ended. Sign in to continue.');
      }
    }
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json().catch(() => null) : null;
    if (!response.ok) throw new Error(result?.error?.message || `Request failed (${response.status}).`);
    return result?.data ?? response;
  }

  function preserveDraft() {
    const form = document.getElementById('post-editor-form');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.pdf;
    sessionStorage.setItem('classroom-editor-draft', JSON.stringify(data));
  }

  function setMainVisible(visible) {
    document.querySelector('.welcome-row').hidden = !visible;
    document.querySelector('.main-tabs').hidden = !visible;
    document.querySelector('.filters').hidden = !visible;
    postList.hidden = !visible;
    document.querySelector('.pagination').hidden = !visible;
  }
  function showPanel(id) {
    setMainVisible(false);
    document.querySelectorAll('.panel').forEach((panel) => { panel.hidden = panel.id !== id; });
    if (id === 'account-panel') loadAccount().catch((error) => toast(error.message, true));
    if (id === 'admin-panel') loadAdmin(currentAdminView).catch((error) => toast(error.message, true));
  }
  function showMaterials() {
    document.querySelectorAll('.panel').forEach((panel) => { panel.hidden = true; });
    setMainVisible(true);
    loadPosts().catch((error) => toast(error.message, true));
  }
  function setType(type) {
    currentType = type === 'exercise' ? 'exercise' : 'note';
    currentPage = 1;
    document.querySelectorAll('.main-tab').forEach((tab) => {
      const selected = tab.dataset.type === currentType;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('[data-mobile-type]').forEach((tab) => tab.classList.toggle('active', tab.dataset.mobileType === currentType));
    document.getElementById('welcome-title').textContent = currentType === 'note' ? 'Notes' : 'Exercise';
    loadPosts().catch((error) => toast(error.message, true));
  }

  async function loadSubjects() {
    const items = await api('/api/subjects');
    const select = document.getElementById('subject-filter');
    select.innerHTML = '<option value="">All subjects</option>' + items.map((subject) => `<option value="${escapeHtml(subject.name)}">${escapeHtml(subject.name)}</option>`).join('');
  }

  function renderSkeletons() { postList.innerHTML = '<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>'; }
  async function loadPosts() {
    if (postList.hidden) return;
    renderSkeletons();
    const params = new URLSearchParams({ type: currentType, page: String(currentPage), limit: String(pageSize) });
    const q = document.getElementById('search-input').value.trim();
    const subject = document.getElementById('subject-filter').value;
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    if (q) params.set('q', q);
    if (subject) params.set('subject', subject);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (savedOnly) params.set('saved', 'true');
    const result = await api(`/api/posts?${params}`);
    document.getElementById('page-label').textContent = `Page ${result.page} · ${result.total} posts`;
    document.getElementById('previous-page').disabled = result.page <= 1;
    document.getElementById('next-page').disabled = result.page >= result.pages;
    document.getElementById('post-status').textContent = `${result.total} posts found`;
    if (!result.items.length) {
      postList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${currentType === 'note' ? '▤' : '✎'}</div><h2>No ${currentType === 'note' ? 'notes' : 'exercises'} found</h2><p class="muted">Try a different search or subject filter.</p></div>`;
      return;
    }
    postList.innerHTML = result.items.map((post) => {
      const date = new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const excerpt = post.contentHtml ? `<div class="post-preview">${post.contentHtml}</div>` : '<p>PDF resource</p>';
      return `<article class="post-card"><div class="card-topline"><span class="badge">${escapeHtml(post.subject)}</span><span class="muted">${date}</span></div><h2>${escapeHtml(post.title)}</h2>${excerpt}<div class="card-footer"><span>By ${escapeHtml(post.author?.name || 'School staff')}</span><span>${post.pdf?.available ? 'PDF available' : 'Written post'}</span></div><div class="card-actions"><button class="button primary small" type="button" data-action="open" data-id="${escapeHtml(post._id)}">Open</button><button class="button secondary small" type="button" data-action="bookmark" data-id="${escapeHtml(post._id)}">☆ Save</button>${post.pdf?.available ? `<button class="button secondary small" type="button" data-action="download" data-id="${escapeHtml(post._id)}">Download PDF</button>` : ''}${canManagePost(post) ? `<button class="button secondary small" type="button" data-action="edit" data-id="${escapeHtml(post._id)}">Edit</button><button class="button danger small" type="button" data-action="trash" data-id="${escapeHtml(post._id)}">Delete</button>` : ''}</div></article>`;
    }).join('');
  }

  function canManagePost(post) { return currentUser?.role === 'admin' || (currentUser?.role === 'teacher' && String(post.author?._id || post.author) === String(currentUser.id)); }

  async function openPost(id) {
    const post = await api(`/api/posts/${encodeURIComponent(id)}`);
    const content = document.getElementById('post-dialog-content');
    let preview = '';
    if (post.pdf?.available) {
      const blob = await api(`/api/posts/${encodeURIComponent(id)}/file`, { method: 'GET' }).then((response) => response.blob());
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = URL.createObjectURL(blob);
      preview = `<iframe class="viewer-frame" title="PDF preview" src="${activeObjectUrl}"></iframe><button class="button primary" type="button" data-action="download" data-id="${escapeHtml(id)}">Download PDF</button>`;
    }
    content.innerHTML = `<p class="eyebrow">${escapeHtml(post.subject)} · ${escapeHtml(post.type)}</p><h2>${escapeHtml(post.title)}</h2><p class="muted">By ${escapeHtml(post.author?.name || 'School staff')}</p>${post.contentHtml ? `<article class="viewer-content">${post.contentHtml}</article>` : ''}${preview}`;
    document.getElementById('post-dialog').showModal();
  }

  async function downloadPost(id) {
    const response = await api(`/api/posts/${encodeURIComponent(id)}/file?download=1`);
    if (!response.ok) throw new Error('Could not download this PDF.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'classroom-material.pdf';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function openEditor(post = null) {
    const dialog = document.getElementById('editor-dialog');
    const wrapper = document.getElementById('editor-content');
    wrapper.innerHTML = `<p class="eyebrow">${post ? 'EDIT MATERIAL' : 'NEW MATERIAL'}</p><h2>${post ? 'Update your post' : 'Create a post'}</h2><form id="post-editor-form" class="form-stack"><label class="field"><span>Title</span><input name="title" maxlength="180" required value="${escapeHtml(post?.title || '')}"></label><div class="form-grid"><label class="field"><span>Subject</span><select name="subject" required><option value="">Choose a subject</option></select></label><label class="field"><span>Type</span><select name="type"><option value="note" ${post?.type === 'note' ? 'selected' : ''}>Note</option><option value="exercise" ${post?.type === 'exercise' ? 'selected' : ''}>Exercise</option></select></label></div><div class="field"><span>Write content</span><div class="rich-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" class="button secondary small" data-command="bold" aria-label="Bold">B</button><button type="button" class="button secondary small" data-command="italic" aria-label="Italic"><em>I</em></button><button type="button" class="button secondary small" data-command="insertUnorderedList" aria-label="Bulleted list">• List</button><button type="button" class="button secondary small" data-command="formatBlock" data-value="blockquote" aria-label="Quote">Quote</button></div><div id="rich-editor" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Post content">${post?.contentHtml || ''}</div><input type="hidden" name="contentHtml" value=""></div><label class="field"><span>Or upload a PDF (up to 10 MB)</span><input name="pdf" type="file" accept="application/pdf,.pdf"></label><div class="button-row"><button class="button primary" type="submit">${post ? 'Save changes' : 'Publish post'}</button><button class="button secondary" type="button" data-action="history" data-id="${escapeHtml(post?._id || '')}" ${post ? '' : 'hidden'}>Version history</button></div><p class="muted">A post needs written content or a PDF. Basic rich text is cleaned on the server.</p></form>`;
    const form = wrapper.querySelector('form');
    const editor = form.querySelector('#rich-editor');
    const contentField = form.elements.contentHtml;
    contentField.value = editor.innerHTML;
    editor.addEventListener('input', () => { contentField.value = editor.innerHTML; });
    editor.addEventListener('paste', (event) => {
      event.preventDefault();
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    });
    wrapper.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => {
      editor.focus();
      document.execCommand(button.dataset.command, false, button.dataset.value || null);
      contentField.value = editor.innerHTML;
    }));
    api('/api/subjects').then((items) => {
      const select = form.elements.subject;
      select.innerHTML = '<option value="">Choose a subject</option>' + items.map((item) => `<option value="${escapeHtml(item.name)}" ${item.name === post?.subject ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    }).catch((error) => toast(error.message, true));
    const draft = !post ? sessionStorage.getItem('classroom-editor-draft') : null;
    if (draft) {
      try { const saved = JSON.parse(draft); for (const key of ['title', 'subject', 'type']) if (saved[key]) form.elements[key].value = saved[key]; if (saved.contentHtml) { editor.textContent = saved.contentHtml; contentField.value = editor.innerHTML; } } catch (_error) { sessionStorage.removeItem('classroom-editor-draft'); }
    }
    form.addEventListener('input', preserveDraft);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const file = values.get('pdf');
      if (file && file.size > 10 * 1024 * 1024) { toast('The PDF must be 10 MB or smaller.', true); return; }
      try {
        const response = await api(post ? `/api/posts/${encodeURIComponent(post._id)}` : '/api/posts', { method: post ? 'PATCH' : 'POST', body: values });
        void response;
        sessionStorage.removeItem('classroom-editor-draft');
        dialog.close();
        toast(post ? 'Post updated.' : 'Post published.');
        await loadPosts();
      } catch (error) { toast(error.message, true); }
    });
    dialog.showModal();
  }

  async function loadAccount() {
    const user = await api('/api/account/me');
    const form = document.getElementById('profile-form');
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.elements.bio.value = user.bio || '';
    const cancelDeletion = document.getElementById('cancel-delete');
    cancelDeletion.hidden = !user.deleteAfter;
    document.getElementById('delete-account').hidden = Boolean(user.deleteAfter);
    document.getElementById('deletion-status').textContent = user.deleteAfter ? `Deletion is scheduled for ${new Date(user.deleteAfter).toLocaleString()}. Sign in and cancel before then to keep your account.` : 'Download a copy of your profile and activity or schedule account deletion. Deletion takes effect after seven days.';
    if (!user.mustChangePassword) {
      const rows = await api('/api/account/sessions');
      document.getElementById('session-list').innerHTML = rows.length ? rows.map((session) => `<div class="session-row"><span>${escapeHtml(session.userAgent)}<br><small>${session.current ? 'This device' : escapeHtml(session.ip || 'Other device')} · ${new Date(session.createdAt).toLocaleString()}</small></span>${session.current ? '<span class="badge">Current</span>' : `<button class="button danger small" data-session="${escapeHtml(session._id)}" type="button">Log out</button>`}</div>`).join('') : '<p class="muted">No active sessions.</p>';
    } else document.getElementById('session-list').innerHTML = '<p class="muted">Change the temporary password to view sessions.</p>';
    document.getElementById('twofa-status').textContent = user.twoFactor?.enabled ? 'Two-step verification is active.' : 'Use an authenticator app to add another sign-in step.';
    document.getElementById('twofa-enable').textContent = user.twoFactor?.enabled ? 'Turn off two-step verification' : 'Set up authenticator';
    if (user.mustChangePassword) toast('Change your temporary password to continue.', true);
  }

  async function loadAdmin(view = currentAdminView) {
    currentAdminView = view;
    const container = document.getElementById('admin-content');
    document.querySelectorAll('[data-admin-view]').forEach((button) => button.classList.toggle('active', button.dataset.adminView === view));
    if (view === 'users') {
      const result = await api('/api/admin/users?limit=20');
      container.innerHTML = `<div class="admin-toolbar"><label class="field"><span>Search users</span><input id="admin-search" type="search" placeholder="Name or Gmail"></label><div class="button-row"><button class="button secondary" id="users-export" type="button">Export CSV</button><button class="button primary" id="add-user" type="button">＋ Add account</button></div></div>${usersTable(result.items)}`;
      container.querySelector('#admin-search').addEventListener('input', debounceAdminSearch);
      container.querySelector('#users-export').addEventListener('click', exportUsers);
      container.querySelector('#add-user').addEventListener('click', addUserForm);
      return;
    }
    if (view === 'audit') {
      const result = await api('/api/admin/audit?limit=50');
      container.innerHTML = `<h3>Recent admin actions</h3><div class="admin-table-wrap"><table class="data-table"><thead><tr><th>Action</th><th>Who</th><th>Target</th><th>Time</th><th>IP</th></tr></thead><tbody>${result.items.map((item) => `<tr><td data-label="Action">${escapeHtml(item.action)}</td><td data-label="Who">${escapeHtml(item.actorLabel)}</td><td data-label="Target">${escapeHtml(item.targetType)} ${escapeHtml(item.targetId)}</td><td data-label="Time">${new Date(item.createdAt).toLocaleString()}</td><td data-label="IP">${escapeHtml(item.ip)}</td></tr>`).join('')}</tbody></table></div>`;
      return;
    }
    if (view === 'subjects') { await renderSubjects(container); return; }
    if (view === 'trash') { await renderTrash(container); return; }
    if (view === 'dashboard') { await renderDashboard(container); return; }
    if (view === 'settings') { await renderSettings(container); }
  }

  function usersTable(users) {
    return `<div class="admin-table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Gmail / email</th><th>Role</th><th>Status</th><th>Email</th><th>Last login</th><th>Joined</th><th>Actions</th></tr></thead><tbody>${users.map((user) => `<tr><td data-label="Name">${escapeHtml(user.name)}</td><td data-label="Email">${escapeHtml(user.email)}</td><td data-label="Role"><span class="badge">${escapeHtml(user.role)}</span></td><td data-label="Status">${escapeHtml(user.status)}</td><td data-label="Email">${user.emailVerifiedAt ? 'Verified' : 'Needs verification'}</td><td data-label="Last login">${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—'}</td><td data-label="Joined">${new Date(user.createdAt).toLocaleDateString()}</td><td data-label="Actions"><div class="table-actions">${!user.emailVerifiedAt ? `<button class="button secondary small" data-user-action="verify" data-id="${escapeHtml(user._id)}" type="button">Verify email</button>` : ''}<button class="button secondary small" data-user-action="status" data-id="${escapeHtml(user._id)}" data-status="${user.status === 'active' ? 'suspended' : 'active'}" type="button">${user.status === 'active' ? 'Suspend' : 'Reactivate'}</button><button class="button secondary small" data-user-action="reset" data-id="${escapeHtml(user._id)}" type="button">Reset password</button><button class="button danger small" data-user-action="delete" data-id="${escapeHtml(user._id)}" type="button">Remove</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }

  let adminSearchTimer;
  function debounceAdminSearch(event) {
    window.clearTimeout(adminSearchTimer);
    adminSearchTimer = window.setTimeout(async () => {
      const result = await api(`/api/admin/users?limit=20&q=${encodeURIComponent(event.target.value)}`);
      document.getElementById('admin-content').querySelector('.admin-table-wrap').outerHTML = usersTable(result.items);
    }, 250);
  }

  async function addUserForm() {
    const dialog = document.getElementById('editor-dialog');
    const wrapper = document.getElementById('editor-content');
    wrapper.innerHTML = `<p class="eyebrow">ADMIN ACCOUNT</p><h2>Add account</h2><form id="add-user-form" class="form-stack"><label class="field"><span>Name</span><input name="name" maxlength="100" required></label><label class="field"><span>Gmail address</span><input name="email" type="email" required></label><label class="field"><span>Role</span><select name="role"><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Admin</option></select></label><label class="field"><span>Temporary password (optional)</span><input name="password" type="password" minlength="8" autocomplete="new-password"><small>Leave empty to generate one. The user must change it after sign-in.</small></label><button class="button primary" type="submit">Create account</button></form>`;
    wrapper.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const body = Object.fromEntries(values.entries());
      if (!body.password) delete body.password;
      try {
        const created = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
        dialog.close();
        const temporary = created.temporaryPassword;
        const passwordDialog = document.createElement('dialog');
        passwordDialog.className = 'modal';
        passwordDialog.innerHTML = `<form method="dialog" class="modal-close"><button class="icon-button" aria-label="Close">×</button></form><h2>Account created</h2><p>Share this temporary password securely. It is shown only now.</p><p><code>${escapeHtml(temporary)}</code></p><button class="button secondary" type="button">Copy</button>`;
        passwordDialog.querySelector('button[type="button"]').addEventListener('click', async () => { await navigator.clipboard.writeText(temporary); toast('Copied.'); });
        document.body.append(passwordDialog);
        passwordDialog.addEventListener('close', () => passwordDialog.remove());
        passwordDialog.showModal();
        await loadAdmin('users');
      } catch (error) { toast(error.message, true); }
    });
    dialog.showModal();
  }

  async function exportUsers() {
    const result = await api('/api/admin/users/export');
    const blob = await result.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'classroom-hub-users.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  async function renderSubjects(container) {
    const subjects = await api('/api/admin/subjects');
    container.innerHTML = `<div class="admin-toolbar"><div><h3>Subjects</h3><p class="muted">Posts must use an active subject.</p></div><form id="subject-form" class="button-row"><label class="field"><span>New subject</span><input name="name" maxlength="80" required></label><button class="button primary" type="submit">Add subject</button></form></div><div class="admin-content-grid">${subjects.map((subject) => `<article class="admin-item"><strong>${escapeHtml(subject.name)}</strong><p>${subject.active ? 'Active' : 'Inactive'}</p><button class="button secondary small" data-subject-id="${escapeHtml(subject._id)}" data-subject-name="${escapeHtml(subject.name)}" data-subject-active="${subject.active}" type="button">Edit</button></article>`).join('')}</div>`;
    container.querySelector('#subject-form').addEventListener('submit', async (event) => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name'); await api('/api/admin/subjects', { method: 'POST', body: JSON.stringify({ name }) }); await loadAdmin('subjects'); });
  }

  async function renderTrash(container) {
    const result = await api('/api/admin/trash');
    container.innerHTML = `<h3>Posts in Trash</h3>${result.length ? `<div class="admin-content-grid">${result.map((post) => `<article class="admin-item"><strong>${escapeHtml(post.title)}</strong><p>${escapeHtml(post.type)} · ${escapeHtml(post.subject)}</p><button class="button secondary small" data-restore-post="${escapeHtml(post._id)}" type="button">Restore</button><button class="button danger small" data-permanent-post="${escapeHtml(post._id)}" type="button">Delete permanently</button></article>`).join('')}</div>` : '<p class="muted">Trash is empty.</p>'}`;
  }

  async function renderDashboard(container) {
    const data = await api('/api/admin/dashboard');
    const max = Math.max(1, ...data.postsPerWeek.map((entry) => entry.count));
    const bars = data.postsPerWeek.map((entry) => `<div class="admin-item"><strong>${escapeHtml(entry._id)}</strong><div class="strength-track"><span class="chart-bar chart-level-${Math.min(10, Math.max(1, Math.ceil(entry.count / max * 10)))}"></span></div><small>${entry.count} posts</small></div>`).join('');
    container.innerHTML = `<h3>Recent activity</h3><div class="admin-content-grid"><section class="card"><h3>Users by role</h3>${data.usersByRole.map((entry) => `<p><span class="badge">${escapeHtml(entry.role)}</span> ${entry.count}</p>`).join('')}</section><section class="card"><h3>Posts per week</h3><div class="admin-content-grid">${bars || '<p class="muted">No recent posts.</p>'}</div></section><section class="card"><h3>Logins per day</h3>${data.loginsPerDay.map((entry) => `<p>${escapeHtml(entry._id)} · ${entry.count}</p>`).join('') || '<p class="muted">No recent logins.</p>'}</section><section class="card"><h3>Most downloaded</h3>${data.mostDownloaded.map((post) => `<p>${escapeHtml(post.title)} · ${post.downloadCount || 0}</p>`).join('') || '<p class="muted">No downloads yet.</p>'}</section></div>`;
  }

  async function renderSettings(container) {
    const settings = await api('/api/settings/public');
    container.innerHTML = `<h3>School settings</h3><section class="card"><label class="check-line"><input id="student-signup-toggle" type="checkbox" ${settings.studentSignupEnabled ? 'checked' : ''}><span>Allow Student self sign-up</span></label><button id="save-signup-setting" class="button primary" type="button">Save setting</button></section><form id="announcement-form" class="card form-stack"><h3>Announcement banner</h3><label class="field"><span>Message</span><input name="message" maxlength="240" value="${escapeHtml(settings.announcement?.message || '')}"></label><div class="form-grid"><label class="field"><span>Starts</span><input name="startsAt" type="datetime-local" required></label><label class="field"><span>Ends</span><input name="endsAt" type="datetime-local" required></label></div><button class="button primary" type="submit">Save announcement</button></form>`;
    container.querySelector('#save-signup-setting').addEventListener('click', async () => { const value = container.querySelector('#student-signup-toggle').checked; await api('/api/admin/settings/studentSignupEnabled', { method: 'PATCH', body: JSON.stringify({ value }) }); toast('Setting saved.'); });
    container.querySelector('#announcement-form').addEventListener('submit', async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const value = { message: values.get('message'), startsAt: new Date(values.get('startsAt')).toISOString(), endsAt: new Date(values.get('endsAt')).toISOString() }; await api('/api/admin/settings/announcement', { method: 'PATCH', body: JSON.stringify({ value }) }); toast('Announcement saved.'); });
  }

  async function showNotifications() {
    const items = await api('/api/posts/notifications');
    const dialog = document.getElementById('post-dialog');
    document.getElementById('post-dialog-content').innerHTML = `<p class="eyebrow">UPDATES</p><h2>New posts</h2>${items.length ? items.map((item) => `<p><button class="text-button" data-notification-post="${escapeHtml(item.post?._id || '')}" data-notification-id="${escapeHtml(item._id)}">${escapeHtml(item.post?.title || 'A new post')} · ${escapeHtml(item.subject)}</button> ${item.readAt ? '<span class="badge">Read</span>' : ''}</p>`).join('') : '<p class="muted">No new posts yet.</p>'}`;
    dialog.showModal();
  }

  async function loadAccountAndData() { await loadAccount(); }

  async function showVersionHistory(postId) {
    const [post, versions] = await Promise.all([
      api(`/api/posts/${encodeURIComponent(postId)}`),
      api(`/api/posts/${encodeURIComponent(postId)}/history`)
    ]);
    const content = document.getElementById('post-dialog-content');
    if (!versions.length) {
      content.innerHTML = '<h2>Version history</h2><p class="muted">There are no earlier versions yet.</p>';
      document.getElementById('post-dialog').showModal();
      return;
    }
    content.innerHTML = `<p class="eyebrow">VERSION HISTORY</p><h2>${escapeHtml(post.title)}</h2><label class="field"><span>Earlier version</span><select id="version-choice">${versions.map((version, index) => `<option value="${escapeHtml(version._id)}">${index + 1}. ${escapeHtml(version.title)} · ${new Date(version.editedAt).toLocaleString()}</option>`).join('')}</select></label><div class="version-comparison"><section class="card"><h3>Current</h3><pre id="version-current"></pre></section><section class="card"><h3>Selected version</h3><pre id="version-selected"></pre></section></div><button class="button primary" id="restore-selected-version" data-post-id="${escapeHtml(postId)}" type="button">Restore selected version</button>`;
    const plainText = (value) => {
      const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
      return parsed.body.textContent || '';
    };
    const currentText = `Title: ${post.title}\nSubject: ${post.subject}\nPDF: ${post.pdf?.available ? post.pdf.originalName : 'None'}\n\n${plainText(post.contentHtml)}`;
    content.querySelector('#version-current').textContent = currentText;
    const choice = content.querySelector('#version-choice');
    const selectedText = content.querySelector('#version-selected');
    const renderSelected = () => {
      const version = versions.find((item) => item._id === choice.value);
      selectedText.textContent = version ? `Title: ${version.title}\nSubject: ${version.subject}\nPDF: ${version.pdf?.available ? version.pdf.originalName : 'None'}\n\n${plainText(version.contentHtml)}` : '';
    };
    choice.addEventListener('change', renderSelected);
    renderSelected();
    document.getElementById('post-dialog').showModal();
  }

  document.querySelectorAll('.main-tab').forEach((button) => button.addEventListener('click', () => setType(button.dataset.type)));
  document.querySelectorAll('[data-mobile-type]').forEach((button) => button.addEventListener('click', () => setType(button.dataset.mobileType)));
  document.getElementById('search-input').addEventListener('input', () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { currentPage = 1; loadPosts().catch((error) => toast(error.message, true)); }, 250); });
  for (const id of ['subject-filter', 'date-from', 'date-to']) document.getElementById(id).addEventListener('change', () => { currentPage = 1; loadPosts().catch((error) => toast(error.message, true)); });
  document.getElementById('saved-toggle').addEventListener('click', (event) => { savedOnly = !savedOnly; event.currentTarget.setAttribute('aria-pressed', String(savedOnly)); event.currentTarget.textContent = savedOnly ? '★ Saved only' : '☆ Saved'; currentPage = 1; loadPosts().catch((error) => toast(error.message, true)); });
  document.getElementById('previous-page').addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); loadPosts().catch((error) => toast(error.message, true)); });
  document.getElementById('next-page').addEventListener('click', () => { currentPage += 1; loadPosts().catch((error) => toast(error.message, true)); });
  document.getElementById('create-post').addEventListener('click', () => openEditor());
  document.getElementById('account-open').addEventListener('click', () => showPanel('account-panel'));
  document.getElementById('admin-open').addEventListener('click', () => showPanel('admin-panel'));
  document.getElementById('mobile-account').addEventListener('click', () => showPanel('account-panel'));
  document.getElementById('mobile-admin').addEventListener('click', () => showPanel('admin-panel'));
  document.getElementById('help-open').addEventListener('click', () => showPanel('help-panel'));
  document.querySelectorAll('.close-panel').forEach((button) => button.addEventListener('click', showMaterials));
  document.querySelectorAll('[data-admin-view]').forEach((button) => button.addEventListener('click', () => loadAdmin(button.dataset.adminView).catch((error) => toast(error.message, true))));
  document.getElementById('theme-toggle').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  document.getElementById('notifications-open')?.addEventListener('click', () => showNotifications().catch((error) => toast(error.message, true)));
  document.getElementById('logout').addEventListener('click', logout);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_error) { /* Clear local state even when a session is already expired. */ }
    await clearLocalSession();
  }

  async function clearLocalSession() {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_APP_CACHE' });
    accessToken = '';
    currentUser = null;
    localStorage.clear();
    sessionStorage.clear();
    location.replace('/login.html');
  }

  document.getElementById('post-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    try {
      if (action === 'open') await openPost(id);
      if (action === 'download') await downloadPost(id);
      if (action === 'bookmark') { await api(`/api/posts/${encodeURIComponent(id)}/bookmark`, { method: 'PUT' }); toast('Saved to your list.'); }
      if (action === 'edit') openEditor(await api(`/api/posts/${encodeURIComponent(id)}`));
      if (action === 'trash' && window.confirm('Move this post to Trash?')) { await api(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast('Post moved to Trash.'); await loadPosts(); }
    } catch (error) { toast(error.message, true); }
  });

  document.getElementById('post-dialog-content').addEventListener('click', async (event) => {
    const restoreVersion = event.target.closest('#restore-selected-version');
    if (restoreVersion) {
      try {
        await api(`/api/posts/${encodeURIComponent(restoreVersion.dataset.postId)}/restore-version/${encodeURIComponent(document.getElementById('version-choice').value)}`, { method: 'POST' });
        document.getElementById('post-dialog').close();
        document.getElementById('editor-dialog').close();
        toast('Version restored.');
        await loadPosts();
      } catch (error) { toast(error.message, true); }
      return;
    }
    const notification = event.target.closest('[data-notification-id]');
    if (notification) {
      try { await api(`/api/posts/notifications/${encodeURIComponent(notification.dataset.notificationId)}/read`, { method: 'PATCH' }); document.getElementById('post-dialog').close(); await openPost(notification.dataset.notificationPost); }
      catch (error) { toast(error.message, true); }
    }
    const download = event.target.closest('[data-action="download"]');
    if (download) try { await downloadPost(download.dataset.id); } catch (error) { toast(error.message, true); }
  });
  document.getElementById('post-dialog').addEventListener('close', () => { if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = ''; });
  document.getElementById('editor-content').addEventListener('click', async (event) => {
    const history = event.target.closest('[data-action="history"]');
    if (!history) return;
    try { await showVersionHistory(history.dataset.id); }
    catch (error) { toast(error.message, true); }
  });

  document.getElementById('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const values = new FormData(form);
      const body = { name: values.get('name'), email: values.get('email'), bio: values.get('bio') };
      await api('/api/account/me', { method: 'PATCH', body: JSON.stringify(body) });
      const avatar = values.get('avatar');
      if (avatar?.size) { const data = new FormData(); data.append('avatar', avatar); await api('/api/account/avatar', { method: 'POST', body: data }); }
      toast(body.email === currentUser.email ? 'Account details saved.' : 'Check your new email for a confirmation link.');
    } catch (error) { toast(error.message, true); }
  });
  document.getElementById('password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await api('/api/account/password', { method: 'PATCH', body: JSON.stringify(values) }); event.currentTarget.reset(); await refresh(); toast('Password changed. Other sessions were signed out.'); showMaterials(); }
    catch (error) { toast(error.message, true); }
  });
  document.getElementById('session-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-session]');
    if (!button) return;
    try { await api(`/api/account/sessions/${encodeURIComponent(button.dataset.session)}`, { method: 'DELETE' }); await loadAccountAndData(); toast('Session signed out.'); }
    catch (error) { toast(error.message, true); }
  });
  document.getElementById('logout-all').addEventListener('click', async () => {
    if (!window.confirm('Sign out from every device?')) return;
    try {
      await api('/api/account/logout-all', { method: 'POST' });
      toast('All sessions have been signed out.');
      await clearLocalSession();
    } catch (error) { toast(error.message, true); }
  });
  document.getElementById('export-data').addEventListener('click', async () => {
    try { const data = await api('/api/account/export'); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'my-classroom-hub-data.json'; a.click(); URL.revokeObjectURL(url); }
    catch (error) { toast(error.message, true); }
  });
  document.getElementById('delete-account').addEventListener('click', async () => {
    if (!window.confirm('Schedule deletion of your account? You will have seven days before permanent deletion.')) return;
    const password = window.prompt('Enter your current password to confirm account deletion.');
    if (!password) return;
    try { await api('/api/account/delete', { method: 'POST', body: JSON.stringify({ password }) }); toast('Account deletion is scheduled.'); await logout(); }
    catch (error) { toast(error.message, true); }
  });
  document.getElementById('cancel-delete').addEventListener('click', async () => {
    const password = window.prompt('Enter your current password to cancel account deletion.');
    if (!password) return;
    try { await api('/api/account/delete/cancel', { method: 'POST', body: JSON.stringify({ password }) }); await loadAccount(); toast('Account deletion cancelled.'); }
    catch (error) { toast(error.message, true); }
  });
  document.getElementById('twofa-enable').addEventListener('click', async () => {
    try {
      const password = window.prompt('Enter your current password to manage two-step verification.');
      if (!password) return;
      const enabled = document.getElementById('twofa-status').textContent.includes('active');
      if (enabled) {
        await api('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password, enabled: false }) });
        toast('Two-step verification turned off.');
      } else {
        const setup = await api('/api/auth/2fa/setup', { method: 'POST', body: JSON.stringify({ password, enabled: true }) });
        const code = window.prompt(`Add this secret to your authenticator app:\n${setup.secret}\nThen enter the six-digit code to confirm.`);
        if (!code) return;
        await api('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
        toast('Two-step verification is enabled.');
      }
      await loadAccount();
    } catch (error) { toast(error.message, true); }
  });
  document.getElementById('admin-content').addEventListener('click', async (event) => {
    const userButton = event.target.closest('[data-user-action]');
    const restore = event.target.closest('[data-restore-post]');
    const permanent = event.target.closest('[data-permanent-post]');
    const subject = event.target.closest('[data-subject-id]');
    try {
      if (userButton) {
        const id = encodeURIComponent(userButton.dataset.id);
        if (userButton.dataset.userAction === 'verify') await api(`/api/admin/users/${id}/verify-email`, { method: 'POST' });
        if (userButton.dataset.userAction === 'status') await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: userButton.dataset.status }) });
        if (userButton.dataset.userAction === 'reset') { const result = await api(`/api/admin/users/${id}/reset-password`, { method: 'POST' }); window.alert(`Temporary password: ${result.temporaryPassword}\nShare it securely. The user must change it at sign-in.`); }
        if (userButton.dataset.userAction === 'delete' && window.confirm('Permanently remove this account and its posts?')) await api(`/api/admin/users/${id}`, { method: 'DELETE' });
        await loadAdmin('users');
      }
      if (restore) { await api(`/api/posts/${encodeURIComponent(restore.dataset.restorePost)}/restore`, { method: 'POST' }); await loadAdmin('trash'); }
      if (permanent && window.confirm('Permanently delete this post?')) { await api(`/api/posts/${encodeURIComponent(permanent.dataset.permanentPost)}/permanent`, { method: 'DELETE' }); await loadAdmin('trash'); }
      if (subject) {
        const name = window.prompt('Subject name', subject.dataset.subjectName);
        if (name) { await api(`/api/admin/subjects/${encodeURIComponent(subject.dataset.subjectId)}`, { method: 'PATCH', body: JSON.stringify({ name, active: subject.dataset.subjectActive !== 'true' }) }); await loadAdmin('subjects'); }
      }
    } catch (error) { toast(error.message, true); }
  });

  async function boot() {
    try {
      await refresh();
      if (currentUser.mustChangePassword) showPanel('account-panel');
      const allowedToPost = ['teacher', 'admin'].includes(currentUser.role);
      document.getElementById('create-post').hidden = !allowedToPost;
      document.getElementById('mobile-admin').hidden = currentUser.role !== 'admin';
      document.getElementById('admin-open').hidden = currentUser.role !== 'admin';
      document.getElementById('account-open').textContent = 'Account';
      if (currentUser.mustChangePassword) {
        document.getElementById('create-post').hidden = true;
        document.getElementById('mobile-admin').hidden = true;
        document.getElementById('admin-open').hidden = true;
        await loadAccount();
        toast('A password change is required before using the app.', true);
        return;
      }
      const publicSettings = await api('/api/settings/public');
      if (publicSettings.announcement) { const banner = document.getElementById('announcement'); banner.textContent = publicSettings.announcement.message; banner.hidden = false; }
      await loadSubjects();
      await loadPosts();
      if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/service-worker.js').catch(() => toast('The offline app shell could not be installed.', true));
    } catch (_error) { location.replace('/login.html'); }
  }
  boot();
})();
