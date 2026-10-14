(() => {
  let root = document.querySelector('body.portal-mode #app-view');
  const body = document.body;
  const state = { csrf: '', user: null, types: [], applications: [], search: '' };
  const labels = {
    submitted: 'Diajukan', checking: 'Menunggu pemeriksaan', waiting_documents: 'Menunggu dokumen',
    waiting_office: 'Menunggu validasi di kantor', verifying: 'Dalam verifikasi', revision: 'Perlu revisi',
    approved: 'Disetujui', ready_to_issue: 'Siap diterbitkan', issued: 'Diterbitkan', rejected: 'Ditolak',
    cancelled: 'Dibatalkan', archived: 'Diarsipkan', draft: 'Draf'
  };
  const icons = ['▧', '⌂', '▤', '◉', '♧', '⌘'];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateText = (value) => {
    if (!value) return '—';
    const text = String(value);
    const normalized = text.length === 10 ? `${text}T00:00:00+07:00` : `${text.replace(' ', 'T')}+07:00`;
    return new Date(normalized).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  async function request(url, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan tidak dapat diproses.');
    return result;
  }

  function toast(message, isError = false) {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `toast${isError ? ' error' : ''}`;
    item.textContent = message;
    region.append(item);
    setTimeout(() => item.remove(), 4200);
  }

  function statusPill(status) {
    return `<span class="status-pill ${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;
  }

  function heading(title, description, action = '') {
    return `<div class="page-heading"><div><div class="eyebrow">Pemerintah Desa Sukakerta</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><div class="heading-actions">${action}</div></div>`;
  }

  function setActiveNavigation(path) {
    document.querySelectorAll('.side-nav a[data-link]').forEach((link) => {
      link.classList.toggle('active', path === link.getAttribute('href') || (path.startsWith('/pengajuan/') && link.getAttribute('href') === '/pengajuan'));
    });
    const crumbs = document.getElementById('breadcrumbs');
    if (crumbs) crumbs.innerHTML = `Pemerintahan <span>/</span> ${escapeHtml(path.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') || 'Ringkasan')}`;
  }

  function landingPage() {
    return `<section class="hero"><div class="hero-copy"><div class="eyebrow">LAYANAN DIGITAL DESA SUKAKERTA</div><h1>Urus administrasi desa, <em>lebih mudah.</em></h1><p>Ajukan surat dari rumah, pantau setiap tahap pemeriksaan, dan terima kabar langsung dari petugas Desa Sukakerta.</p><div class="hero-actions"><a class="button button-dark" href="/register" data-link>Mulai pengajuan <span aria-hidden="true">↗</span></a><a class="button button-outline" href="/login" data-link>Masuk ke akun</a></div><div class="hero-note">Layanan untuk warga Desa Sukakerta · Cilamaya Wetan</div></div><aside class="service-panel"><div class="service-head"><div><div class="eyebrow">PORTAL PELAYANAN</div><h2>Surat yang dapat diajukan</h2></div><span class="service-count">12 layanan</span></div><ul class="service-list">${['Keterangan domisili','Keterangan usaha','Keterangan tidak mampu','Keterangan kelahiran','Keterangan kematian','Surat pengantar'].map((name, i) => `<li><span class="service-icon">${icons[i]}</span><span><strong>${name}</strong><small>Ajukan dan pantau secara daring</small></span></li>`).join('')}</ul></aside></section><section class="section-band"><div class="section-inner"><div><div class="eyebrow">ALUR SEDERHANA</div><h2>Setiap pengajuan diperiksa petugas sebelum diterbitkan.</h2><p>Registrasi online bukan pengganti verifikasi identitas secara langsung.</p></div><div class="steps"><span class="step-chip"><b>01</b>Ajukan</span><span class="step-chip"><b>02</b>Verifikasi</span><span class="step-chip"><b>03</b>Terima surat</span></div></div></section>`;
  }

  function authPage(register = false) {
    if (!register) return `<section class="auth-wrap"><div class="auth-aside"><div class="eyebrow">AKSES LAYANAN WARGA</div><h2>Selamat datang di layanan Desa Sukakerta.</h2><p>Masuk untuk mengelola pengajuan, melihat catatan pemeriksaan, dan mengakses surat yang telah diterbitkan.</p></div><form class="auth-form" id="login-form"><div class="eyebrow">PORTAL PENDUDUK</div><h1>Masuk ke akun</h1><p>Gunakan email dan kata sandi yang terdaftar.</p><div class="field-grid"><div class="field wide"><label for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="username" required></div><div class="field wide"><label for="login-password">Kata sandi</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div></div><div class="form-error hidden" id="form-error"></div><button class="button button-dark auth-submit" type="submit">Masuk <span>→</span></button><p class="auth-switch">Belum memiliki akun? <a href="/register" data-link>Registrasi penduduk</a></p></form></section>`;
    const fields = [
      ['nik','NIK','text','16 digit'],['full_name','Nama lengkap','text'],['family_card_number','Nomor KK','text','16 digit'],
      ['email','Email','email'],['birth_place','Tempat lahir','text'],['birth_date','Tanggal lahir','date'],
      ['gender','Jenis kelamin','select',['Laki-laki','Perempuan']],['marital_status','Status perkawinan','select',['Belum kawin','Kawin','Cerai hidup','Cerai mati']],
      ['religion','Agama','select',['Islam','Kristen','Katolik','Hindu','Buddha','Konghucu']],['occupation','Pekerjaan','text'],
      ['citizenship','Kewarganegaraan','text'],['whatsapp','Nomor WhatsApp','tel'],['rt','RT','text'],['rw','RW','text'],['hamlet','Dusun','text'],
      ['address','Alamat lengkap','textarea'],['password','Kata sandi','password'],['password_confirmation','Ulangi kata sandi','password']
    ];
    const renderField = ([key, label, type, extra]) => {
      let control = type === 'select' ? `<select name="${key}" required><option value="">Pilih…</option>${extra.map((value) => `<option value="${value === 'Laki-laki' ? 'L' : value === 'Perempuan' ? 'P' : value}">${value}</option>`).join('')}</select>` : type === 'textarea' ? `<textarea name="${key}" required></textarea>` : `<input name="${key}" type="${type}" ${key === 'nik' || key === 'family_card_number' ? 'inputmode="numeric" maxlength="16" pattern="[0-9]{16}"' : ''} ${key === 'password' || key === 'password_confirmation' ? 'minlength="10"' : ''} ${key === 'citizenship' ? 'value="WNI"' : ''} required>`;
      return `<div class="field${type === 'textarea' ? ' wide' : ''}"><label>${label}</label>${control}${extra && typeof extra === 'string' ? `<span class="field-hint">${extra}</span>` : ''}</div>`;
    };
    return `<section class="auth-wrap"><div class="auth-aside"><div class="eyebrow">REGISTRASI PENDUDUK</div><h2>Mulai dari akun. Verifikasi dilakukan bersama petugas.</h2><p>Data pendaftaran belum dianggap sebagai data kependudukan yang terverifikasi. Siapkan dokumen asli saat petugas meminta kedatangan Anda.</p></div><form class="auth-form" id="register-form"><div class="eyebrow">AKUN BARU</div><h1>Daftar sebagai penduduk</h1><p>Data identitas digunakan untuk memproses layanan administrasi desa.</p><div class="field-grid">${fields.map(renderField).join('')}</div><div class="form-error hidden" id="form-error"></div><button class="button button-dark auth-submit" type="submit">Kirim registrasi <span>→</span></button><p class="auth-switch">Sudah memiliki akun? <a href="/login" data-link>Masuk</a></p></form></section>`;
  }

  function statCard(title, value, icon, foot = 'Seluruh periode') {
    return `<article class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-symbol">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }

  function dashboardView(result) {
    const counts = result.counts;
    const resident = state.user.role_key === 'resident';
    const cards = resident
      ? [['Semua pengajuan', Object.values(counts).reduce((a, b) => a + b, 0), '▤'], ['Menunggu pemeriksaan', counts.submitted + counts.checking, '◷'], ['Perlu dilengkapi', counts.revision + counts.waiting_documents, '↺'], ['Surat diterbitkan', counts.issued, '▧']]
      : [['Penduduk terdaftar', counts.residents || 0, '♙', 'Akun warga'], ['Akun menunggu aktivasi', counts.pending_accounts || 0, '◷'], ['Pengajuan baru', counts.submitted, '＋'], ['Menunggu pemeriksaan', counts.checking, '⌕'], ['Dokumen belum lengkap', counts.waiting_documents, '▤'], ['Validasi kantor desa', counts.waiting_office + counts.verifying, '⌖'], ['Perlu revisi', counts.revision, '↺'], ['Disetujui', counts.approved, '✓'], ['Siap diterbitkan', counts.ready_to_issue, '▧'], ['Telah diterbitkan', counts.issued, '▧'], ['Ditolak', counts.rejected, '×']];
    const tableRows = result.applications.map((item) => `<tr><td><strong>${escapeHtml(item.application_no)}</strong><br><span class="field-hint">${escapeHtml(item.register_number || 'Register belum tersedia')}</span></td><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.type_name)}</td><td>${statusPill(item.status)}</td><td>${dateText(item.submitted_at)}</td><td><a class="button button-outline button-small" href="/pengajuan/${item.id}" data-link>Detail</a></td></tr>`).join('');
    const events = result.notifications.map((notice) => `<div class="activity-row"><span class="activity-mark">◉</span><div><strong>${escapeHtml(notice.title)}</strong><p>${escapeHtml(notice.message)}</p><time>${dateText(notice.created_at)}</time></div></div>`).join('');
    return `${heading(resident ? 'Ringkasan layanan' : 'Ringkasan pemerintahan', resident ? 'Pantau perjalanan setiap pengajuan Anda.' : 'Pusat pemantauan layanan surat Desa Sukakerta.', '<a class="button button-green" href="/pengajuan/buat" data-link>+ Pengajuan baru</a>')}<section class="stats-grid">${cards.map((card) => statCard(...card)).join('')}</section><div class="dashboard-grid"><section class="surface"><div class="surface-head"><div><h2>Pengajuan terbaru</h2><p>Perubahan terakhir dari layanan surat</p></div><a href="/pengajuan" data-link class="field-hint">Lihat semua →</a></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Nomor / register</th><th>Pemohon</th><th>Jenis surat</th><th>Status</th><th>Tanggal</th><th></th></tr></thead><tbody>${tableRows || '<tr><td colspan="6"><div class="empty-state"><b>Belum ada pengajuan</b>Pengajuan baru akan muncul di sini.</div></td></tr>'}</tbody></table></div></section><section class="surface"><div class="surface-head"><div><h2>Perlu perhatian</h2><p>Notifikasi yang belum dibaca</p></div><a href="/notifikasi" data-link class="field-hint">Semua →</a></div><div class="surface-body"><div class="activity-list">${events || '<div class="empty-state"><b>Tidak ada notifikasi baru</b>Semua informasi terbaru akan tampil di sini.</div>'}</div></div></section></div>`;
  }

  function applicationTable(items, resident = false) {
    return `<section class="surface"><div class="toolbar"><input id="table-search" type="search" placeholder="Cari nomor atau nama…"><select id="status-filter"><option value="">Semua status</option>${Object.entries(labels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select><span class="field-hint">${items.length} pengajuan</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Nomor pengajuan</th>${resident ? '' : '<th>Pemohon</th>'}<th>Jenis surat</th><th>Nomor register</th><th>Status</th><th>Diajukan</th><th></th></tr></thead><tbody id="application-rows">${items.map((item) => `<tr data-status="${escapeHtml(item.status)}" data-search="${escapeHtml(`${item.application_no} ${item.full_name} ${item.type_name}`.toLowerCase())}"><td><strong>${escapeHtml(item.application_no)}</strong></td>${resident ? '' : `<td>${escapeHtml(item.full_name)}</td>`}<td>${escapeHtml(item.type_name)}</td><td>${escapeHtml(item.register_number || '—')}</td><td>${statusPill(item.status)}</td><td>${dateText(item.submitted_at)}</td><td><a class="button button-outline button-small" href="/pengajuan/${item.id}" data-link>Buka</a></td></tr>`).join('') || `<tr><td colspan="${resident ? 6 : 7}"><div class="empty-state"><b>Belum ada pengajuan</b>Daftar akan terisi saat pengajuan dibuat.</div></td></tr>`}</tbody></table></div><div class="pagination"><span>Menampilkan hingga 100 pengajuan terbaru</span><span>Data diperbarui dari server</span></div></section>`;
  }

  async function applicationsPage() {
    const response = await request('/api/applications');
    state.applications = response.items;
    const resident = state.user.role_key === 'resident';
    root.innerHTML = `${heading('Pengajuan surat', resident ? 'Daftar permohonan layanan surat Anda.' : 'Tinjau dan proses permohonan layanan surat.', resident ? '<a class="button button-green" href="/pengajuan/buat" data-link>+ Pengajuan baru</a>' : '')}${applicationTable(response.items, resident)}`;
    const search = root.querySelector('#table-search');
    const filter = root.querySelector('#status-filter');
    search.value = state.search;
    const update = () => {
      state.search = search.value;
      root.querySelectorAll('#application-rows tr[data-status]').forEach((row) => { row.hidden = !(row.dataset.search.includes(search.value.toLowerCase()) && (!filter.value || row.dataset.status === filter.value)); });
    };
    search.addEventListener('input', update);
    filter.addEventListener('change', update);
  }

  async function lettersPage() {
    const result = await request('/api/letters');
    root.innerHTML = `${heading('Arsip surat', state.user.role_key === 'resident' ? 'Surat yang sudah tercatat sebagai terbit.' : 'Dokumen yang telah diterbitkan oleh petugas.')}<section class="surface"><div class="table-scroll"><table class="data-table"><thead><tr><th>Nomor surat</th><th>Jenis surat</th><th>Pemohon</th><th>Nomor register</th><th>Status</th><th>Tanggal terbit</th><th></th></tr></thead><tbody>${result.items.map((item) => `<tr><td><strong>${escapeHtml(item.letter_number || '—')}</strong></td><td>${escapeHtml(item.type_name)}</td><td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.register_number)}</td><td>${statusPill(item.status)}</td><td>${dateText(item.issued_at)}</td><td><a class="button button-outline button-small" href="/pengajuan/${item.application_id}" data-link>Detail</a></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty-state"><b>Belum ada surat terbit</b>Surat akan muncul setelah disetujui dan diterbitkan petugas.</div></td></tr>'}</tbody></table></div></section>`;
  }

  async function createApplicationPage() {
    const result = await request('/api/letter-types');
    state.types = result.items;
    root.innerHTML = `${heading('Pengajuan surat baru', 'Pilih layanan, lalu lengkapi data yang diminta.') }<section class="surface"><div class="surface-body"><form id="application-form"><div class="field-grid"><div class="field wide"><label for="letter-type">Jenis surat</label><select id="letter-type" name="letter_type_id" required><option value="">Pilih jenis surat…</option>${result.items.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}</select><span class="field-hint">Data identitas profil Anda akan ditinjau petugas sebelum surat dibuat.</span></div><div id="dynamic-fields" class="field-grid wide"></div></div><div class="notice warn" style="margin-top:18px">Nomor register dibuat sekali saat pengajuan dikirim dan tetap sama sepanjang proses revisi. Pengajuan daring tidak menggantikan verifikasi identitas di kantor desa.</div><div class="form-error hidden" id="form-error"></div><div class="form-actions"><a href="/pengajuan" data-link class="button button-outline">Batal</a><button class="button button-green" type="submit">Kirim pengajuan →</button></div></form></div></section>`;
    const select = root.querySelector('#letter-type');
    const fieldsHost = root.querySelector('#dynamic-fields');
    select.addEventListener('change', () => {
      const type = result.items.find((item) => String(item.id) === select.value);
      const fields = type?.form_schema?.fields || [];
      fieldsHost.innerHTML = fields.map((field) => {
        const control = field.type === 'textarea' ? `<textarea name="${escapeHtml(field.key)}" ${field.required ? 'required' : ''}></textarea>` : field.type === 'select' ? `<select name="${escapeHtml(field.key)}" ${field.required ? 'required' : ''}><option value="">Pilih…</option>${(field.options || []).map((option) => `<option>${escapeHtml(option)}</option>`).join('')}</select>` : `<input type="${['date','number'].includes(field.type) ? field.type : 'text'}" name="${escapeHtml(field.key)}" ${field.required ? 'required' : ''}>`;
        return `<div class="field wide"><label>${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>${control}</div>`;
      }).join('');
    });
    root.querySelector('#application-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        const fields = Object.fromEntries(new FormData(form).entries());
        const response = await request('/api/applications', { method: 'POST', body: { letter_type_id: Number(fields.letter_type_id), fields: Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'letter_type_id')) } });
        toast(`Pengajuan diterima · register ${response.register_number}`);
        navigate(`/pengajuan/${response.application_no}`);
      } catch (error) { showFormError(form, error.message); submit.disabled = false; }
    });
  }

  function showFormError(form, message) {
    const error = form.querySelector('#form-error');
    if (!error) return toast(message, true);
    error.textContent = message;
    error.classList.remove('hidden');
  }

  async function applicationDetail(id) {
    const item = (await request(`/api/applications/${encodeURIComponent(id)}`)).item;
    const resident = state.user.role_key === 'resident';
    const availableActions = {
      submitted: [['periksa','Mulai pemeriksaan','button-outline'],['tunggu_dokumen','Minta dokumen','button-outline'],['jadwalkan_validasi','Minta hadir ke kantor','button-outline'],['minta_revisi','Minta revisi','button-outline'],['tolak','Tolak','button-danger']],
      checking: [['tunggu_dokumen','Minta dokumen','button-outline'],['jadwalkan_validasi','Minta hadir ke kantor','button-outline'],['validasi','Mulai verifikasi','button-outline'],['minta_revisi','Minta revisi','button-outline'],['setujui','Setujui','button-green'],['tolak','Tolak','button-danger']],
      waiting_office: [['validasi','Mulai verifikasi','button-outline']],
      verifying: [['minta_revisi','Minta revisi','button-outline'],['setujui','Setujui','button-green'],['tolak','Tolak','button-danger']],
      approved: [['siap_terbit','Siap diterbitkan','button-outline'],['minta_revisi','Minta revisi','button-outline']],
      ready_to_issue: [['terbitkan','Terbitkan surat','button-green']],
      issued: [['arsipkan','Arsipkan','button-outline']]
    };
    const actions = resident ? '' : `<div class="form-actions">${(availableActions[item.status] || []).map(([key, label, style]) => `<button class="button ${style} button-small" data-action="${key}">${label}</button>`).join('')}</div>`;
    const fields = Object.entries(item.data || {}).map(([key, value]) => `<div class="detail-item"><span>${escapeHtml(key.replaceAll('_',' '))}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    const history = item.history.map((event) => `<div class="timeline-item"><span class="timeline-point"></span><div class="timeline-copy"><strong>${escapeHtml(labels[event.new_status] || event.new_status)}</strong><p>${escapeHtml(event.note || 'Status diperbarui')}</p><time>${dateText(event.created_at)} · ${escapeHtml(event.actor_name || 'Sistem')}</time></div></div>`).join('');
    const personal = `<div class="detail-list"><div class="detail-item"><span>Nama pemohon</span><strong>${escapeHtml(item.full_name)}</strong></div><div class="detail-item"><span>NIK</span><strong>${escapeHtml(item.nik)}</strong></div><div class="detail-item"><span>Nomor KK</span><strong>${escapeHtml(item.family_card_number)}</strong></div><div class="detail-item"><span>Tempat, tanggal lahir</span><strong>${escapeHtml(item.birth_place)}, ${dateText(item.birth_date)}</strong></div><div class="detail-item"><span>Alamat</span><strong>${escapeHtml(item.address)}, RT ${escapeHtml(item.rt)}/RW ${escapeHtml(item.rw)}, ${escapeHtml(item.hamlet)}</strong></div><div class="detail-item"><span>Keperluan dan isian</span><strong>${fields || 'Tidak ada isian tambahan'}</strong></div></div>`;
    const revisionForm = resident && item.status === 'revision' ? `<form id="revision-form" class="surface-body"><h3>Perbaiki data pengajuan</h3><div class="field-grid">${(item.form_schema?.fields || []).map((field) => {
      const value = escapeHtml(item.data?.[field.key] || '');
      const control = field.type === 'textarea' ? `<textarea name="${escapeHtml(field.key)}" ${field.required ? 'required' : ''}>${value}</textarea>` : field.type === 'select' ? `<select name="${escapeHtml(field.key)}" ${field.required ? 'required' : ''}><option value="">Pilih…</option>${(field.options || []).map((option) => `<option ${option === item.data?.[field.key] ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>` : `<input type="${['date','number'].includes(field.type) ? field.type : 'text'}" name="${escapeHtml(field.key)}" value="${value}" ${field.required ? 'required' : ''}>`;
      return `<div class="field wide"><label>${escapeHtml(field.label)}</label>${control}</div>`;
    }).join('')}</div><button class="button button-green" type="submit">Kirim perbaikan</button></form>` : '';
    root.innerHTML = `${heading('Detail pengajuan', `${item.application_no} · ${item.type_name}`, `<a class="button button-outline button-small" href="/pengajuan" data-link>← Kembali</a>`)}<div class="detail-grid"><div class="surface"><div class="surface-head"><div><h2>${escapeHtml(item.type_name)}</h2><p>Diajukan ${dateText(item.submitted_at)}</p></div>${statusPill(item.status)}</div><div class="surface-body"><div class="detail-list"><div class="detail-item"><span>Nomor pengajuan</span><strong>${escapeHtml(item.application_no)}</strong></div><div class="detail-item"><span>Nomor register</span><strong>${escapeHtml(item.register_number)}</strong></div><div class="detail-item"><span>Nomor surat</span><strong>${escapeHtml(item.letter_number || 'Belum dialokasikan')}</strong></div></div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><h3>Data pemohon dan formulir</h3>${personal}<div class="notice warn" style="margin-top:17px">Data penduduk dan pernyataan pemohon harus dicocokkan petugas dengan dokumen asli sebelum penerbitan.</div>${revisionForm}${actions}<div class="form-actions"><button class="button button-outline button-small" id="print-draft">Cetak pratinjau DRAFT</button></div></div></div><section class="surface"><div class="surface-head"><div><h2>Riwayat proses</h2><p>Pembaruan status tercatat</p></div></div><div class="surface-body"><div class="timeline">${history}</div></div></section></div>`;
    root.querySelector('#print-draft')?.addEventListener('click', () => { window.print(); });
    root.querySelector('#revision-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const result = await request(`/api/applications/${item.id}`, { method: 'PUT', body: { fields: Object.fromEntries(new FormData(event.currentTarget).entries()) } });
        toast(`Perbaikan terkirim sebagai versi ${result.version}; nomor register tetap.`);
        await applicationDetail(item.id);
      } catch (error) { toast(error.message, true); }
    });
    root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.action;
      let note = '';
      if (['minta_revisi','tolak','jadwalkan_validasi'].includes(action)) {
        note = window.prompt(action === 'jadwalkan_validasi' ? 'Instruksi kedatangan dan waktu yang disarankan:' : 'Catatan untuk pemohon:') || '';
        if (!note.trim()) return;
      } else if (['setujui','terbitkan','arsipkan'].includes(action) && !window.confirm('Konfirmasi tindakan ini? Tindakan akan tercatat pada audit.')) return;
      try { await request(`/api/applications/${item.id}/transition`, { method: 'POST', body: { action, note } }); toast('Status pengajuan diperbarui.'); await renderRoute(); }
      catch (error) { toast(error.message, true); }
    }));
  }

  async function notificationsPage() {
    const result = await request('/api/notifications');
    root.innerHTML = `${heading('Pesan & notifikasi', 'Informasi status dan pesan dari layanan desa.')}<section class="surface"><div class="activity-list surface-body">${result.items.map((item) => `<article class="activity-row"><span class="activity-mark">◉</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><time>${dateText(item.created_at)} ${item.read_at ? '· Dibaca' : '· Belum dibaca'}</time>${item.application_id ? `<p><a class="field-hint" href="/pengajuan/${item.application_id}" data-link>Lihat pengajuan →</a></p>` : ''}</div>${item.read_at ? '' : `<button class="button button-outline button-small" data-read="${item.id}">Tandai dibaca</button>`}</article>`).join('') || '<div class="empty-state"><b>Belum ada notifikasi</b>Pembaruan layanan akan terlihat di halaman ini.</div>'}</div></section>`;
    root.querySelectorAll('[data-read]').forEach((button) => button.addEventListener('click', async () => { try { await request(`/api/notifications/${button.dataset.read}/read`, { method: 'POST', body: {} }); button.closest('.activity-row').remove(); } catch (error) { toast(error.message, true); } }));
  }

  async function residentsPage() {
    const items = (await request('/api/pending-residents')).items;
    root.innerHTML = `${heading('Validasi akun penduduk', 'Aktivasi akun tidak menggantikan verifikasi identitas secara langsung.')}<section class="surface"><div class="surface-head"><div><h2>Menunggu aktivasi</h2><p>${items.length} akun menunggu pemeriksaan awal</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Nama</th><th>NIK</th><th>Email</th><th>Registrasi</th><th>Tindakan</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${escapeHtml(item.full_name)}</strong></td><td>${escapeHtml(item.nik)}</td><td>${escapeHtml(item.email)}</td><td>${dateText(item.created_at)}</td><td><button class="button button-green button-small" data-activate="${item.id}">Aktifkan akun</button></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state"><b>Tidak ada akun tertunda</b>Akun baru akan tampil di sini.</div></td></tr>'}</tbody></table></div></section>`;
    root.querySelectorAll('[data-activate]').forEach((button) => button.addEventListener('click', async () => { if (!window.confirm('Aktifkan akun ini? Identitas tetap menunggu validasi di kantor.')) return; try { await request(`/api/users/${button.dataset.activate}/activate`, { method: 'POST', body: {} }); toast('Akun penduduk diaktifkan.'); await residentsPage(); } catch (error) { toast(error.message, true); } }));
  }

  function templateList(templates = []) {
    const rows = state.types.map((type) => {
      const templatesForType = templates.filter((template) => Number(template.letter_type_id) === Number(type.id));
      if (!templatesForType.length) return `<tr><td><strong>${escapeHtml(type.name)}</strong><br><span class="field-hint">${escapeHtml(type.type_key)}</span></td><td>${escapeHtml(type.description || 'Belum ada template')}</td><td><span class="status-pill waiting">Belum disusun</span></td><td><a class="button button-outline button-small" href="/template-surat/editor/baru?type=${type.id}" data-link>Buat template</a></td></tr>`;
      return templatesForType.map((template) => `<tr><td><strong>${escapeHtml(template.name)}</strong><br><span class="field-hint">${escapeHtml(type.name)} · v${template.current_version}</span></td><td>${escapeHtml(type.description || '—')}</td><td><span class="status-pill approved">${escapeHtml(template.status)}</span></td><td><a class="button button-outline button-small" href="/template-surat/editor/${template.id}" data-link>Buka editor</a></td></tr>`).join('');
    }).join('');
    root.innerHTML = `${heading('Template surat', 'Pustaka jenis surat dan editor tata letak dokumen.', '<a class="button button-green" href="/template-surat/editor/baru" data-link>+ Template baru</a>')}<section class="surface"><div class="surface-head"><div><h2>Jenis surat tersedia</h2><p>Template dikelola sesuai format administrasi yang berlaku.</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Jenis surat</th><th>Keterangan</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  async function templateEditor(id) {
    const existing = /^\d+$/.test(id) ? (await request(`/api/templates/${id}`)).item : null;
    const typeId = existing?.letter_type_id || new URLSearchParams(location.search).get('type') || state.types[0]?.id;
    const type = state.types.find((item) => String(item.id) === String(typeId));
    if (!type) throw new Error('Pilih jenis surat untuk membuat template.');
    state.templateId = existing?.id || null;
    state.templateTypeId = Number(type.id);
    root.innerHTML = `${heading(type ? `Editor · ${type.name}` : 'Editor template surat', 'Susun tata letak pada kertas A4. Seret elemen ke bidang dokumen.', '<button class="button button-green" id="save-template">Simpan draf</button>')}<div class="editor-layout"><aside class="editor-tools"><h3>Elemen dokumen</h3><div class="tool-palette">${[['heading','T','Kop surat'],['text','¶','Teks'],['variable','{ }','Variabel'],['line','―','Garis'],['sign','✍','Tanda tangan']].map(([kind, icon, label]) => `<button class="palette-item" draggable="true" data-element="${kind}"><span>${icon}</span>${label}</button>`).join('')}</div><div class="editor-meta">Variabel tersedia</div><div style="display:grid;gap:6px">${['{{nama_lengkap}}','{{nik}}','{{alamat}}','{{keperluan}}','{{nomor_register}}','{{tanggal_surat}}'].map((variable) => `<button class="button button-outline button-small variable-insert" data-variable="${variable}">${variable}</button>`).join('')}</div></aside><section><div class="editor-toolbar"><button id="add-page">+ Halaman</button><button id="undo-editor" title="Urungkan">↶</button><button id="redo-editor" title="Ulangi">↷</button><select id="orientation"><option value="portrait">A4 portrait</option><option value="landscape">A4 landscape</option></select><button id="preview-template">Pratinjau / cetak</button><span class="editor-meta" id="save-state">Draf lokal</span></div><div class="editor-stage" id="editor-stage"><div class="paper" data-page="1"><div class="paper-inner" data-drop-page="1"><div class="paper-element element-heading" draggable="true" data-kind="heading" style="left:0;top:0">PEMERINTAH DESA SUKAKERTA<br><small>KECAMATAN CILAMAYA WETAN · KABUPATEN KARAWANG</small></div><div class="paper-element element-text" draggable="true" data-kind="text" style="left:5px;top:100px">SURAT KETERANGAN<br>Nomor: {{nomor_surat}}</div><div class="paper-element element-text" draggable="true" data-kind="text" style="left:5px;top:180px">Yang bertanda tangan di bawah ini menerangkan bahwa:<br><br>Nama: {{nama_lengkap}}<br>NIK: {{nik}}<br>Alamat: {{alamat}}</div><div class="paper-element element-text" draggable="true" data-kind="text" style="left:5px;top:300px">Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</div><div class="paper-element element-sign" draggable="true" data-kind="sign" style="left:340px;top:560px">Sukakerta, {{tanggal_surat}}<br>Kepala Desa<br><br><br>(Nama pejabat)</div></div></div></div><div class="editor-pages"><button aria-label="Halaman sebelumnya">‹</button><span>Halaman 1 dari 1</span><button aria-label="Halaman berikutnya">›</button></div></section><aside class="editor-inspector"><h3>Properti dokumen</h3><div class="field"><label>Margin (mm)</label><input type="number" value="22" min="5" max="45"></div><div class="field"><label>Ukuran teks (pt)</label><input id="font-size" type="number" value="12" min="8" max="40"></div><div class="field"><label>Posisi X (px)</label><input id="pos-x" type="number" value="0"></div><div class="field"><label>Posisi Y (px)</label><input id="pos-y" type="number" value="0"></div></aside></div>`;
    const nameInput = document.createElement('input');
    nameInput.id = 'template-name';
    nameInput.className = 'template-name-input';
    nameInput.setAttribute('aria-label', 'Nama template');
    nameInput.value = existing?.name || `Template ${type.name}`;
    root.querySelector('.editor-toolbar').prepend(nameInput);
    if (existing) {
      const stage = root.querySelector('#editor-stage');
      const settings = existing.page_settings || {};
      const pageCount = Math.max(Number(settings.page_count) || 1, ...existing.elements.map((element) => Number(element.page_number) || 1));
      root.querySelector('#orientation').value = settings.orientation || 'portrait';
      stage.replaceChildren();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const paper = document.createElement('div');
        paper.className = `paper${settings.orientation === 'landscape' ? ' landscape' : ''}`;
        paper.dataset.page = pageNumber;
        const inner = document.createElement('div');
        inner.className = 'paper-inner';
        inner.dataset.dropPage = pageNumber;
        existing.elements.filter((element) => Number(element.page_number) === pageNumber).forEach((saved) => {
          const element = document.createElement('div');
          element.className = `paper-element element-${saved.element_type}`;
          element.dataset.kind = saved.element_type;
          element.draggable = true;
          element.textContent = saved.content || '';
          element.style.left = `${Number(saved.position_json?.x) || 0}px`;
          element.style.top = `${Number(saved.position_json?.y) || 0}px`;
          element.style.fontSize = `${Number(saved.style_json?.font_size) || 12}pt`;
          inner.append(element);
        });
        paper.append(inner);
        stage.append(paper);
      }
    }
    initializeEditor();
  }

  function initializeEditor() {
    const stage = root.querySelector('#editor-stage');
    let selected = null;
    let dragged = null;
    let draggedKind = '';
    let currentPage = 1;
    const history = [stage.innerHTML];
    let historyIndex = 0;
    const capture = () => {
      const snapshot = stage.innerHTML;
      if (history[historyIndex] !== snapshot) history.splice(++historyIndex, history.length, snapshot);
      root.querySelector('#save-state').textContent = 'Perubahan belum disimpan';
    };
    const selectElement = (element) => {
      stage.querySelectorAll('.selected').forEach((item) => item.classList.remove('selected'));
      selected = element;
      selected.classList.add('selected');
      currentPage = Number(selected.closest('.paper')?.dataset.page || 1);
      root.querySelector('#pos-x').value = parseInt(selected.style.left || '0', 10);
      root.querySelector('#pos-y').value = parseInt(selected.style.top || '0', 10);
      updatePageCounter();
    };
    const updatePageCounter = () => {
      const label = root.querySelector('.editor-pages span');
      if (label) label.textContent = `Halaman ${currentPage} dari ${stage.querySelectorAll('.paper').length}`;
    };
    stage.addEventListener('click', (event) => {
      const element = event.target.closest('.paper-element');
      if (element) { event.stopPropagation(); selectElement(element); }
    });
    stage.addEventListener('dragstart', (event) => {
      const element = event.target.closest('.paper-element');
      if (element) { dragged = element; draggedKind = 'move'; event.dataTransfer.setData('text/plain', 'move'); }
    });
    root.querySelectorAll('.palette-item').forEach((element) => element.addEventListener('dragstart', (event) => {
      dragged = null; draggedKind = element.dataset.element; event.dataTransfer.setData('text/plain', draggedKind);
    }));
    stage.addEventListener('dragover', (event) => { if (event.target.closest('.paper-inner')) event.preventDefault(); });
    stage.addEventListener('drop', (event) => {
      const page = event.target.closest('.paper-inner');
      if (!page) return;
      event.preventDefault();
      const rect = page.getBoundingClientRect();
      const scaleX = rect.width / page.offsetWidth || 1;
      const scaleY = rect.height / page.offsetHeight || 1;
      let element = dragged;
      if (!element) {
        const content = draggedKind === 'variable' ? '{{nama_lengkap}}' : draggedKind === 'heading' ? 'KOP SURAT DESA SUKAKERTA' : draggedKind === 'line' ? '' : draggedKind === 'sign' ? 'Kepala Desa' : 'Teks baru';
        element = document.createElement('div');
        element.className = `paper-element element-${draggedKind}`;
        element.dataset.kind = draggedKind;
        element.draggable = true;
        element.textContent = content;
      }
      page.append(element);
      element.style.left = `${Math.max(0, (event.clientX - rect.left) / scaleX)}px`;
      element.style.top = `${Math.max(0, (event.clientY - rect.top) / scaleY)}px`;
      selectElement(element);
      dragged = null; draggedKind = ''; capture();
    });
    root.querySelector('#add-page').addEventListener('click', () => {
      const number = stage.querySelectorAll('.paper').length + 1;
      const paper = document.createElement('div'); paper.className = `paper${root.querySelector('#orientation').value === 'landscape' ? ' landscape' : ''}`; paper.dataset.page = number;
      const inner = document.createElement('div'); inner.className = 'paper-inner'; inner.dataset.dropPage = number; paper.append(inner); stage.append(paper); capture();
      currentPage = number; updatePageCounter(); paper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.querySelectorAll('.editor-pages button').forEach((button, index) => button.addEventListener('click', () => {
      const count = stage.querySelectorAll('.paper').length;
      currentPage = Math.max(1, Math.min(count, currentPage + (index === 0 ? -1 : 1)));
      stage.querySelector(`.paper[data-page="${currentPage}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      updatePageCounter();
    }));
    root.querySelector('#orientation').addEventListener('change', (event) => { stage.querySelectorAll('.paper').forEach((paper) => paper.classList.toggle('landscape', event.target.value === 'landscape')); capture(); });
    root.querySelector('#pos-x').addEventListener('change', (event) => { if (selected) { selected.style.left = `${event.target.value}px`; capture(); } });
    root.querySelector('#pos-y').addEventListener('change', (event) => { if (selected) { selected.style.top = `${event.target.value}px`; capture(); } });
    root.querySelector('#font-size').addEventListener('change', (event) => { if (selected) { selected.style.fontSize = `${event.target.value}pt`; capture(); } });
    root.querySelectorAll('.variable-insert').forEach((button) => button.addEventListener('click', () => {
      if (!selected) { toast('Pilih elemen teks terlebih dahulu.', true); return; }
      selected.textContent += ` ${button.dataset.variable}`; capture();
    }));
    root.addEventListener('keydown', (event) => {
      if (stage.isConnected && event.key === 'Delete' && selected && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { selected.remove(); selected = null; capture(); }
    });
    const restore = (index) => { if (index < 0 || index >= history.length) return; historyIndex = index; stage.innerHTML = history[index]; currentPage = Math.min(currentPage, stage.querySelectorAll('.paper').length); selected = null; updatePageCounter(); };
    root.querySelector('#undo-editor').addEventListener('click', () => restore(historyIndex - 1));
    root.querySelector('#redo-editor').addEventListener('click', () => restore(historyIndex + 1));
    root.querySelector('#preview-template').addEventListener('click', () => window.print());
    root.querySelector('#save-template').addEventListener('click', async (event) => {
      const button = event.currentTarget; button.disabled = true;
      const elements = [...stage.querySelectorAll('.paper-element')].map((element) => ({
        type: element.dataset.kind || 'text', content: element.innerText, page: Number(element.closest('.paper')?.dataset.page || 1),
        x: parseInt(element.style.left || '0', 10), y: parseInt(element.style.top || '0', 10), font_size: parseInt(element.style.fontSize || '12', 10)
      }));
      try {
        const payload = { letter_type_id: state.templateTypeId, name: root.querySelector('#template-name').value.trim(), page_settings: { orientation: root.querySelector('#orientation').value, page_count: stage.querySelectorAll('.paper').length, margin: 22 }, elements };
        const result = await request(state.templateId ? `/api/templates/${state.templateId}` : '/api/templates', { method: state.templateId ? 'PUT' : 'POST', body: payload });
        state.templateId = result.template_id || state.templateId;
        root.querySelector('#save-state').textContent = `Tersimpan · versi ${result.version}`;
        toast('Versi template tersimpan di server.');
        if (!location.pathname.endsWith(`/${state.templateId}`)) navigate(`/template-surat/editor/${state.templateId}`);
      } catch (error) { toast(error.message, true); }
      finally { button.disabled = false; }
    });
  }

  async function renderRoute() {
    const path = location.pathname;
    document.body.classList.toggle('portal-mode', ['/', '/login', '/register'].includes(path));
    document.body.classList.toggle('panel-mode', !['/', '/login', '/register'].includes(path));
    root = document.querySelector(document.body.classList.contains('portal-mode') ? '.portal-shell #app-view' : '.panel-shell #app-view');
    if (document.querySelector('.side-nav')) setActiveNavigation(path);
    root.innerHTML = '<div class="loading">Memuat layanan</div>';
    try {
      if (path === '/') { root.innerHTML = landingPage(); return; }
      if (path === '/login') { root.innerHTML = authPage(false); bindLogin(); return; }
      if (path === '/register') { root.innerHTML = authPage(true); bindRegister(); return; }
      if (!state.user) { navigate('/login', true); return; }
      if (path === '/dashboard') {
        const data = await request('/api/dashboard'); root.innerHTML = dashboardView(data);
        if (state.user.role_key !== 'resident') {
          const chart = document.createElement('section'); chart.className = 'surface dashboard-chart';
          chart.innerHTML = '<div class="surface-head"><div><h2>Pergerakan pengajuan</h2><p>Perbandingan volume berdasarkan tahap layanan</p></div></div><div class="surface-body"><div class="chart-wrap"><canvas id="activity-chart" aria-label="Grafik jumlah pengajuan pada tiap tahap"></canvas></div><div class="chart-legend"><span><i class="legend-dot"></i>Jumlah pengajuan</span></div></div>';
          root.append(chart); drawChart(data.counts);
        }
        return;
      }
      if (path === '/pengajuan') return await applicationsPage();
      if (path === '/pengajuan/buat') return await createApplicationPage();
      if (/^\/pengajuan\/(\d+|SKT-[A-Z0-9-]+)$/.test(path)) {
        const id = path.split('/').at(-1);
        if (!/^\d+$/.test(id)) { const list = await request('/api/applications'); const found = list.items.find((item) => item.application_no === id); if (!found) throw new Error('Pengajuan tidak ditemukan.'); return await applicationDetail(found.id); }
        return await applicationDetail(id);
      }
      if (path === '/surat') return await lettersPage();
      if (path === '/template-surat') { const data = await request('/api/letter-types'); const templates = await request('/api/templates'); state.types = data.items; return templateList(templates.items); }
      if (/^\/template-surat\/editor\//.test(path)) { const data = await request('/api/letter-types'); state.types = data.items; return await templateEditor(path.split('/').at(-1)); }
      if (path === '/penduduk') return await residentsPage();
      if (path === '/notifikasi') return await notificationsPage();
      if (path === '/pengaturan') { root.innerHTML = `${heading('Pengaturan', 'Informasi layanan dan keamanan sesi.')}<section class="surface"><div class="surface-body"><div class="notice">Penomoran dan identitas desa disimpan pada konfigurasi server. Akun awal serta koneksi basis data dikonfigurasi oleh administrator sistem.</div><div class="form-actions"><button class="button button-outline" id="logout">Keluar dari akun</button></div></div></section>`; root.querySelector('#logout').addEventListener('click', logout); return; }
      root.innerHTML = `<div class="empty-state"><b>Halaman tidak ditemukan</b>Alamat layanan ini tidak tersedia.</div>`;
    } catch (error) {
      root.innerHTML = `${heading('Layanan belum tersedia', 'Periksa koneksi aplikasi atau hak akses akun Anda.')}<section class="surface"><div class="surface-body"><div class="form-error">${escapeHtml(error.message)}</div><button class="button button-outline" data-retry>Coba lagi</button></div></section>`;
      root.querySelector('[data-retry]').addEventListener('click', renderRoute);
    }
  }

  function drawChart(counts) {
    const canvas = root.querySelector('#activity-chart');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect(); canvas.width = bounds.width * ratio; canvas.height = bounds.height * ratio; context.scale(ratio, ratio);
    const width = bounds.width, height = bounds.height, values = ['submitted','checking','waiting_office','approved','issued'].map((key) => counts[key] || 0);
    const max = Math.max(...values, 4); context.strokeStyle = '#e8eeea'; context.lineWidth = 1; context.font = '10px sans-serif'; context.fillStyle = '#84918c';
    for (let i=0;i<4;i++) { const y = 14 + i * ((height - 40) / 3); context.beginPath(); context.moveTo(31,y); context.lineTo(width-5,y); context.stroke(); context.fillText(String(Math.round(max * (3-i)/3)), 4, y+3); }
    const points = values.map((value,index) => ({ x: 40 + index*((width-54)/4), y: height-23 - (value/max)*(height-56) }));
    context.beginPath(); points.forEach((point,index) => index ? context.lineTo(point.x,point.y) : context.moveTo(point.x,point.y)); context.strokeStyle = '#3e8c66'; context.lineWidth = 2.5; context.stroke();
    points.forEach((point,index) => { context.beginPath(); context.arc(point.x,point.y,3.5,0,Math.PI*2); context.fillStyle = '#3e8c66'; context.fill(); context.fillStyle = '#75857d'; context.fillText(['Baru','Periksa','Validasi','Disetujui','Terbit'][index],point.x-13,height-5); });
  }

  async function bindLogin() {
    root.querySelector('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget;
      try { await request('/api/login', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) }); await loadSession(); navigate('/dashboard'); }
      catch (error) { showFormError(form, error.message); }
    });
  }

  function bindRegister() {
    root.querySelector('#register-form').addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget;
      try { const result = await request('/api/register', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) }); form.innerHTML = `<div class="form-success">${escapeHtml(result.message)}</div><a class="button button-dark" href="/login" data-link>Ke halaman masuk →</a>`; }
      catch (error) { showFormError(form, error.message); }
    });
  }

  async function loadSession() {
    const result = await request('/api/session'); state.csrf = result.csrf; state.user = result.user;
    const name = document.getElementById('user-name'); if (name && state.user) { name.textContent = state.user.full_name; document.getElementById('user-role').textContent = state.user.role_name; document.getElementById('user-avatar').textContent = state.user.full_name.split(' ').slice(0,2).map((part) => part[0]).join('').toUpperCase(); }
    document.querySelectorAll('.side-nav a').forEach((link) => {
      if (state.user?.role_key === 'resident' && ['/surat','/template-surat','/penduduk','/pengaturan'].includes(link.getAttribute('href'))) link.hidden = true;
    });
    if (state.user) await refreshNotificationIndicator();
  }

  async function refreshNotificationIndicator() {
    if (!state.user) return;
    try {
      const result = await request('/api/notifications');
      const unread = result.items.some((item) => !item.read_at);
      document.getElementById('notification-dot')?.classList.toggle('visible', unread);
    } catch {}
  }

  function navigate(path, replace = false) {
    if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
    renderRoute();
  }

  async function logout() {
    try { const result = await request('/api/logout', { method: 'POST', body: {} }); state.csrf = result.csrf; state.user = null; navigate('/'); }
    catch (error) { toast(error.message, true); }
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-link]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.getAttribute('href') === '/login' && state.user) return navigate('/dashboard');
    navigate(link.getAttribute('href'));
    document.getElementById('sidebar')?.classList.remove('open');
  });
  window.addEventListener('popstate', renderRoute);
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('global-search')?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.currentTarget.value.trim()) { state.search = event.currentTarget.value.trim(); navigate('/pengajuan'); } });
  document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('global-search')?.focus(); } });
  window.setInterval(refreshNotificationIndicator, 30000);

  loadSession().then(() => {
    if (state.user && ['/', '/login', '/register'].includes(location.pathname)) navigate('/dashboard', true);
    else renderRoute();
  }).catch(() => {
    if (['/', '/login', '/register'].includes(location.pathname)) renderRoute();
    else root.innerHTML = '<div class="empty-state"><b>Server belum tersambung</b>Konfigurasikan database MySQL dan muat ulang halaman.</div>';
  });
})();