/**
 * Frontend controller for the project Automation Notifications tab.
 */

let notifProject = null;
let notifItems = [];
let activeLevelFilter = 'all';
let notifPollingTimer = null;

/** Initialize the Notifications page after verifying active project context. */
document.addEventListener('DOMContentLoaded', async () => {
    notifProject = await window.FragmaAuth.requireActiveProject();
    if (!notifProject) return;

    const flowLink = document.getElementById('goToFlowFromNotif');
    if (flowLink) {
        flowLink.setAttribute('href', window.FragmaAuth.buildProjectUrl(notifProject.uuid, 'flow'));
    }

    bindNotificationEvents();
    await loadNotifications();
    startNotifPolling();
});

/** Bind tab filters, device select, search input, mark-read, and clear handlers. */
function bindNotificationEvents() {
    document.querySelectorAll('.tb-tab[data-filter]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tb-tab[data-filter]').forEach(t => {
                t.classList.remove('tb-tab--active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('tb-tab--active');
            tab.setAttribute('aria-selected', 'true');
            activeLevelFilter = tab.dataset.filter || 'all';
            loadNotifications();
        });
    });

    document.getElementById('notifDeviceFilter')?.addEventListener('change', loadNotifications);
    document.getElementById('notifSearchInput')?.addEventListener('input', loadNotifications);
    document.getElementById('btnRefreshNotif')?.addEventListener('click', loadNotifications);

    document.getElementById('notifPollingToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            startNotifPolling();
        } else {
            stopNotifPolling();
        }
    });

    document.getElementById('btnMarkAllRead')?.addEventListener('click', markAllNotificationsRead);
    document.getElementById('btnClearAllNotif')?.addEventListener('click', clearAllNotifications);
}

/** Fetch notifications matching active filters and update table and counters. */
async function loadNotifications() {
    if (!notifProject) return;

    const params = new URLSearchParams();
    params.set('project_uuid', notifProject.uuid);
    if (activeLevelFilter === 'unread') {
        params.set('unread', '1');
    } else if (activeLevelFilter !== 'all') {
        params.set('level', activeLevelFilter);
    }

    const devVal = document.getElementById('notifDeviceFilter')?.value || '';
    if (devVal) params.set('entity_id', devVal);

    const searchVal = (document.getElementById('notifSearchInput')?.value || '').trim();
    if (searchVal) params.set('q', searchVal);

    try {
        const res = await apiFetch(`/notifications.php?${params.toString()}`);
        notifItems = Array.isArray(res.items) ? res.items : [];
        populateNotifDeviceOptions(Array.isArray(res.devices) ? res.devices : []);
        updateNotifCounters(res.stats || {});
        renderNotificationsTable();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(err.message || 'Gagal memuat notifikasi', 'error');
        }
    }
}

/** Populate the device dropdown while preserving current user selection. */
function populateNotifDeviceOptions(devices) {
    const sel = document.getElementById('notifDeviceFilter');
    if (!sel) return;
    const prev = sel.value;
    sel.replaceChildren();

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Semua perangkat';
    sel.appendChild(defaultOpt);

    devices.forEach(dev => {
        const opt = document.createElement('option');
        opt.value = String(dev.id);
        opt.textContent = dev.name;
        sel.appendChild(opt);
    });

    if (prev && devices.some(d => String(d.id) === String(prev))) {
        sel.value = prev;
    }
}

/** Update notification tab count badges safely. */
function updateNotifCounters(stats) {
    const map = {
        countAllNotif: stats.total || 0,
        countUnreadNotif: stats.unread || 0,
        countCriticalNotif: stats.critical || 0,
        countWarningNotif: stats.warning || 0,
        countInfoNotif: stats.info || 0
    };
    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    });
}

/** Build a severity badge element matching notification level. */
function buildLevelBadge(level, isRead) {
    const wrap = document.createElement('div');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';

    if (!isRead) {
        const dot = document.createElement('span');
        dot.className = 'notif-unread-dot';
        dot.title = 'Belum dibaca';
        wrap.appendChild(dot);
    }

    const normalized = String(level || 'Warning').toLowerCase();
    const badge = document.createElement('span');
    let cls = 'tb-state-badge--warning';
    if (normalized === 'critical') cls = 'tb-state-badge--inactive';
    else if (normalized === 'info') cls = 'tb-state-badge--info';

    badge.className = `tb-state-badge ${cls}`;
    badge.textContent = level || 'Warning';
    wrap.appendChild(badge);
    return wrap;
}

/** Render payload JSON fields as safe telemetry chips. */
function buildPayloadChips(payloadObj) {
    const wrap = document.createElement('div');
    wrap.className = 'tb-chips-wrap';

    const entries = Object.entries(payloadObj && typeof payloadObj === 'object' ? payloadObj : {});
    if (entries.length === 0) {
        const empty = document.createElement('span');
        empty.style.color = 'var(--text-muted)';
        empty.style.fontSize = '0.78rem';
        empty.textContent = 'Kosong';
        wrap.appendChild(empty);
        return wrap;
    }

    entries.slice(0, 4).forEach(([k, v]) => {
        const chip = document.createElement('span');
        chip.className = 'tb-telemetry-chip';

        const keySpan = document.createElement('span');
        keySpan.className = 'tb-telemetry-chip__key';
        keySpan.textContent = k;

        const valSpan = document.createElement('span');
        valSpan.className = 'tb-telemetry-chip__val';
        valSpan.textContent = typeof v === 'object' ? JSON.stringify(v) : String(v);

        chip.appendChild(keySpan);
        chip.appendChild(document.createTextNode(':'));
        chip.appendChild(valSpan);
        wrap.appendChild(chip);
    });

    if (entries.length > 4) {
        const more = document.createElement('span');
        more.className = 'tb-telemetry-chip';
        more.textContent = `+${entries.length - 4}`;
        wrap.appendChild(more);
    }

    return wrap;
}

/** Render the notifications table rows safely using DOM APIs. */
function renderNotificationsTable() {
    const tbody = document.getElementById('notificationsTableBody');
    const emptyEl = document.getElementById('notificationsEmpty');
    const tableEl = document.getElementById('notificationsTable');
    if (!tbody || !emptyEl || !tableEl) return;

    tbody.replaceChildren();

    if (notifItems.length === 0) {
        tableEl.style.display = 'none';
        emptyEl.style.display = 'block';
        return;
    }

    tableEl.style.display = '';
    emptyEl.style.display = 'none';

    notifItems.forEach(item => {
        const tr = document.createElement('tr');
        if (!item.is_read) {
            tr.className = 'notif-row--unread';
        }

        const tdTime = document.createElement('td');
        tdTime.dataset.label = 'Waktu';
        tdTime.style.fontFamily = 'var(--font-mono)';
        tdTime.style.fontSize = '0.78rem';
        tdTime.style.color = 'var(--text-secondary)';
        tdTime.textContent = item.created_at;

        const tdLevel = document.createElement('td');
        tdLevel.dataset.label = 'Level';
        tdLevel.appendChild(buildLevelBadge(item.level, item.is_read));

        const tdMsg = document.createElement('td');
        tdMsg.dataset.label = 'Pesan Peringatan';
        tdMsg.style.fontWeight = item.is_read ? '400' : '600';
        tdMsg.textContent = item.message || '(Tanpa pesan)';

        const tdSource = document.createElement('td');
        tdSource.dataset.label = 'Sumber';
        const flowText = document.createElement('div');
        flowText.style.fontWeight = '600';
        flowText.textContent = item.flow_name;
        const devLink = document.createElement('a');
        devLink.href = window.FragmaAuth.buildProjectUrl(notifProject.uuid, 'entity', item.entity_id);
        devLink.style.fontSize = '0.78rem';
        devLink.style.color = 'var(--accent)';
        devLink.textContent = item.entity_name;
        tdSource.appendChild(flowText);
        tdSource.appendChild(devLink);

        const tdPayload = document.createElement('td');
        tdPayload.dataset.label = 'Payload Data';
        tdPayload.appendChild(buildPayloadChips(item.payload));

        const tdActions = document.createElement('td');
        tdActions.dataset.label = 'Aksi';
        tdActions.style.textAlign = 'right';
        const actWrap = document.createElement('div');
        actWrap.className = 'tb-row-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'tb-action-icon-btn';
        toggleBtn.title = item.is_read ? 'Tandai belum dibaca' : 'Tandai dibaca';
        toggleBtn.setAttribute('aria-label', toggleBtn.title);
        toggleBtn.innerHTML = item.is_read
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        toggleBtn.addEventListener('click', () => toggleNotificationRead(item));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tb-action-icon-btn';
        delBtn.title = 'Hapus notifikasi';
        delBtn.setAttribute('aria-label', 'Hapus notifikasi');
        delBtn.style.color = 'var(--danger)';
        delBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        delBtn.addEventListener('click', () => deleteNotification(item.id));

        actWrap.appendChild(toggleBtn);
        actWrap.appendChild(delBtn);
        tdActions.appendChild(actWrap);

        tr.appendChild(tdTime);
        tr.appendChild(tdLevel);
        tr.appendChild(tdMsg);
        tr.appendChild(tdSource);
        tr.appendChild(tdPayload);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

/** Toggle read/unread status of a single notification. */
async function toggleNotificationRead(item) {
    try {
        await apiFetch(`/notifications.php?project_uuid=${encodeURIComponent(notifProject.uuid)}&id=${item.id}`, {
            method: 'PUT',
            body: { is_read: !item.is_read }
        });
        await loadNotifications();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Gagal memperbarui status', 'error');
    }
}

/** Mark every unread notification in the active project as read. */
async function markAllNotificationsRead() {
    try {
        await apiFetch(`/notifications.php?project_uuid=${encodeURIComponent(notifProject.uuid)}`, {
            method: 'PUT',
            body: { action: 'mark_all_read' }
        });
        await loadNotifications();
        if (typeof showToast === 'function') showToast('Semua notifikasi ditandai sudah dibaca', 'success');
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Gagal menandai semua dibaca', 'error');
    }
}

/** Delete a single notification item from the project. */
async function deleteNotification(id) {
    try {
        await apiFetch(`/notifications.php?project_uuid=${encodeURIComponent(notifProject.uuid)}&id=${id}`, {
            method: 'DELETE'
        });
        await loadNotifications();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Gagal menghapus notifikasi', 'error');
    }
}

/** Clear all notifications inside the active project after confirmation. */
async function clearAllNotifications() {
    if (notifItems.length === 0) return;
    if (!window.confirm('Hapus semua notifikasi di project ini?')) return;
    try {
        await apiFetch(`/notifications.php?project_uuid=${encodeURIComponent(notifProject.uuid)}&all=1`, {
            method: 'DELETE'
        });
        await loadNotifications();
        if (typeof showToast === 'function') showToast('Semua notifikasi dibersihkan', 'success');
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Gagal membersihkan notifikasi', 'error');
    }
}

/** Start automatic 10-second polling for live notifications. */
function startNotifPolling() {
    stopNotifPolling();
    notifPollingTimer = setInterval(loadNotifications, 10000);
}

/** Stop automatic polling timer. */
function stopNotifPolling() {
    if (notifPollingTimer) {
        clearInterval(notifPollingTimer);
        notifPollingTimer = null;
    }
}
