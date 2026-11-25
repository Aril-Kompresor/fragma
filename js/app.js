let pollingIntervalId = null;
let rawEntities = [];
let currentTab = 'all';
let searchQuery = '';
let currentPage = 1;
let pageSize = 10;
let isPollingEnabled = true;
let activeProjectId = 0;
let activeProjectUuid = '';
let pendingDeleteEntity = null;

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

/** Initialize dashboard state, project context, controls, and polling. */
async function initDashboard() {
    if (window.FragmaAuth && typeof window.FragmaAuth.requireActiveProject === 'function') {
        const project = await window.FragmaAuth.requireActiveProject();
        if (!project) return;
        activeProjectId = project.id;
        activeProjectUuid = project.uuid;
        const breadcrumbName = document.getElementById('breadcrumbProjectName');
        if (breadcrumbName) {
            breadcrumbName.textContent = project.name;
        }
        const createUrl = window.FragmaAuth.buildProjectUrl(activeProjectUuid, 'create');
        document.querySelectorAll('a.tb-add-btn, a[href*="/create"]').forEach(btn => {
            btn.setAttribute('href', createUrl);
        });
    }

    setupDashboardControls();
    setupDeleteDeviceModal();
    loadEntities();
    startPolling();

    window.addEventListener('beforeunload', () => {
        stopPolling();
    });
}

/** Start 10-second polling for live device status updates. */
function startPolling() {
    stopPolling();
    if (!isPollingEnabled) return;
    pollingIntervalId = setInterval(loadEntities, 10000);
}

/** Stop active polling timer. */
function stopPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

/** Bind tab filters, search input, polling switch, refresh button, and pagination. */
function setupDashboardControls() {
    const tabAll = document.getElementById('tabAllEntities');
    const tabActive = document.getElementById('tabActiveEntities');
    const tabInactive = document.getElementById('tabInactiveEntities');
    const searchInput = document.getElementById('tbSearchInput');
    const refreshBtn = document.getElementById('tbRefreshBtn');
    const pollingToggle = document.getElementById('tbPollingToggle');
    const pageSizeSelect = document.getElementById('itemsPerPageSelect');
    const btnFirst = document.getElementById('btnPageFirst');
    const btnPrev = document.getElementById('btnPagePrev');
    const btnNext = document.getElementById('btnPageNext');
    const btnLast = document.getElementById('btnPageLast');

    const selectTab = (tabName, clickedBtn) => {
        currentTab = tabName;
        [tabAll, tabActive, tabInactive].forEach(btn => {
            if (btn) {
                btn.classList.remove('tb-tab--active');
                btn.setAttribute('aria-selected', 'false');
            }
        });
        if (clickedBtn) {
            clickedBtn.classList.add('tb-tab--active');
            clickedBtn.setAttribute('aria-selected', 'true');
        }
        currentPage = 1;
        applyFilterAndRender();
    };

    if (tabAll) tabAll.onclick = () => selectTab('all', tabAll);
    if (tabActive) tabActive.onclick = () => selectTab('active', tabActive);
    if (tabInactive) tabInactive.onclick = () => selectTab('inactive', tabInactive);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            currentPage = 1;
            applyFilterAndRender();
        });
    }

    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            await loadEntities();
            refreshBtn.disabled = false;
        };
    }

    if (pollingToggle) {
        pollingToggle.onchange = () => {
            isPollingEnabled = pollingToggle.checked;
            if (isPollingEnabled) {
                startPolling();
            } else {
                stopPolling();
            }
        };
    }

    if (pageSizeSelect) {
        pageSizeSelect.onchange = () => {
            pageSize = parseInt(pageSizeSelect.value, 10) || 10;
            currentPage = 1;
            applyFilterAndRender();
        };
    }

    if (btnFirst) btnFirst.onclick = () => { currentPage = 1; applyFilterAndRender(); };
    if (btnPrev) btnPrev.onclick = () => { if (currentPage > 1) { currentPage--; applyFilterAndRender(); } };
    if (btnNext) btnNext.onclick = () => { currentPage++; applyFilterAndRender(); };
    if (btnLast) btnLast.onclick = () => {
        const filtered = getFilteredEntities();
        const maxPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = maxPages;
        applyFilterAndRender();
    };
}

/** Check whether an entity received telemetry within the last 120 seconds. */
function isEntityRecentlyActive(item) {
    if (!item || !item.last_data_at) return false;
    const utcStr = typeof normalizeUtcTimestamp === 'function'
        ? normalizeUtcTimestamp(item.last_data_at)
        : item.last_data_at.replace(' ', 'T') + 'Z';
    return (new Date() - new Date(utcStr)) < 120000;
}

/** Load device entities belonging strictly to the active project. */
async function loadEntities() {
    const loading = document.getElementById('entitiesLoading');
    const active = window.FragmaAuth && typeof window.FragmaAuth.getActiveProject === 'function'
        ? window.FragmaAuth.getActiveProject()
        : null;
    const projectUuid = activeProjectUuid || (active ? active.uuid : '');
    if (!projectUuid) {
        return;
    }

    try {
        const entities = await apiFetch(`/entities.php?project_uuid=${encodeURIComponent(projectUuid)}`);
        if (loading) loading.style.display = 'none';

        rawEntities = Array.isArray(entities) ? entities : [];
        updateTabCounts();
        applyFilterAndRender();
    } catch (err) {
        if (loading) loading.style.display = 'none';
        const tbody = document.getElementById('entitiesTableBody');
        if (tbody && rawEntities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: var(--danger);">
                        Gagal memuat perangkat: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }
}

/** Update badge counts on Semua, Aktif, and Nonaktif tabs. */
function updateTabCounts() {
    const countAll = document.getElementById('countAllEntities');
    const countActive = document.getElementById('countActiveEntities');
    const countInactive = document.getElementById('countInactiveEntities');

    let activeCount = 0;
    let inactiveCount = 0;

    rawEntities.forEach(item => {
        if (isEntityRecentlyActive(item)) {
            activeCount++;
        } else {
            inactiveCount++;
        }
    });

    if (countAll) countAll.textContent = String(rawEntities.length);
    if (countActive) countActive.textContent = String(activeCount);
    if (countInactive) countInactive.textContent = String(inactiveCount);
}

/** Filter loaded entities by active tab and search query. */
function getFilteredEntities() {
    return rawEntities.filter(item => {
        const isRecent = isEntityRecentlyActive(item);

        if (currentTab === 'active' && !isRecent) return false;
        if (currentTab === 'inactive' && isRecent) return false;

        if (searchQuery) {
            const nameMatch = (item.name || '').toLowerCase().includes(searchQuery);
            const notesMatch = (item.notes || '').toLowerCase().includes(searchQuery);
            const fieldsMatch = Array.isArray(item.fields) && item.fields.some(f => (f.name || '').toLowerCase().includes(searchQuery));
            if (!nameMatch && !notesMatch && !fieldsMatch) return false;
        }

        return true;
    });
}

/** Paginate filtered entities and render the table. */
function applyFilterAndRender() {
    const filtered = getFilteredEntities();
    const totalCount = filtered.length;
    const maxPages = Math.max(1, Math.ceil(totalCount / pageSize));

    if (currentPage > maxPages) currentPage = maxPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalCount);
    const pageItems = filtered.slice(startIndex, endIndex);

    renderDevicesTable(pageItems, totalCount, startIndex, endIndex, maxPages);
}

/** Render paginated device rows with mobile card labels and working row actions. */
function renderDevicesTable(items, totalCount, startIndex, endIndex, maxPages) {
    const tableEl = document.getElementById('entitiesTable');
    const tbody = document.getElementById('entitiesTableBody');
    const emptyEl = document.getElementById('entitiesEmptyState');
    const paginationInfo = document.getElementById('tbPaginationInfo');
    const btnFirst = document.getElementById('btnPageFirst');
    const btnPrev = document.getElementById('btnPagePrev');
    const btnNext = document.getElementById('btnPageNext');
    const btnLast = document.getElementById('btnPageLast');

    if (!tbody) return;

    if (totalCount === 0) {
        tbody.replaceChildren();
        if (tableEl) tableEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        if (paginationInfo) paginationInfo.textContent = '0 - 0 dari 0';
        if (btnFirst) btnFirst.disabled = true;
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        if (btnLast) btnLast.disabled = true;
        return;
    }

    if (tableEl) tableEl.style.display = 'table';
    if (emptyEl) emptyEl.style.display = 'none';
    tbody.replaceChildren();

    if (paginationInfo) {
        paginationInfo.textContent = `${startIndex + 1} - ${endIndex} dari ${totalCount}`;
    }

    if (btnFirst) btnFirst.disabled = currentPage <= 1;
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= maxPages;
    if (btnLast) btnLast.disabled = currentPage >= maxPages;

    items.forEach(item => {
        const tr = document.createElement('tr');
        const isRecent = isEntityRecentlyActive(item);
        const detailUrl = activeProjectUuid
            ? window.FragmaAuth.buildProjectUrl(activeProjectUuid, 'entity', item.id)
            : `/projects`;

        const timeTd = document.createElement('td');
        timeTd.dataset.label = 'Dibuat';
        timeTd.style.fontFamily = 'var(--font-mono)';
        timeTd.style.fontSize = '0.8rem';
        timeTd.style.color = 'var(--text-secondary)';
        timeTd.textContent = formatDateTime(item.created_at);
        tr.appendChild(timeTd);

        const nameTd = document.createElement('td');
        nameTd.dataset.label = 'Perangkat';
        const nameWrap = document.createElement('div');
        const nameLink = document.createElement('a');
        nameLink.href = detailUrl;
        nameLink.className = 'tb-row-name-link';
        nameLink.textContent = item.name;
        nameWrap.appendChild(nameLink);
        if (item.notes) {
            const notesEl = document.createElement('div');
            notesEl.style.fontSize = '0.76rem';
            notesEl.style.color = 'var(--text-secondary)';
            notesEl.textContent = item.notes;
            nameWrap.appendChild(notesEl);
        }
        nameTd.appendChild(nameWrap);
        tr.appendChild(nameTd);

        const stateTd = document.createElement('td');
        stateTd.dataset.label = 'Status';
        const stateBadge = document.createElement('span');
        stateBadge.className = `tb-state-badge ${isRecent ? 'tb-state-badge--active' : 'tb-state-badge--inactive'}`;
        stateBadge.textContent = isRecent ? 'Aktif' : 'Nonaktif';
        stateTd.appendChild(stateBadge);
        tr.appendChild(stateTd);

        const countTd = document.createElement('td');
        countTd.dataset.label = 'Data Poin';
        countTd.style.fontFamily = 'var(--font-mono)';
        countTd.style.fontSize = '0.82rem';
        countTd.textContent = `${item.data_count || 0}`;
        tr.appendChild(countTd);

        const lastTd = document.createElement('td');
        lastTd.dataset.label = 'Terakhir Aktif';
        lastTd.style.fontSize = '0.8rem';
        lastTd.style.color = 'var(--text-secondary)';
        lastTd.textContent = item.last_data_at ? formatRelativeTime(item.last_data_at) : 'Belum ada';
        tr.appendChild(lastTd);

        const actionsTd = document.createElement('td');
        actionsTd.dataset.label = 'Aksi';
        actionsTd.style.textAlign = 'right';
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'tb-row-actions';

        const connectBtn = document.createElement('a');
        connectBtn.href = `${detailUrl}#koneksi`;
        connectBtn.className = 'tb-action-icon-btn';
        connectBtn.title = 'Lihat kredensial & cuplikan koneksi';
        connectBtn.setAttribute('aria-label', `Koneksi ${item.name}`);
        connectBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>`;
        actionsWrap.appendChild(connectBtn);

        const openBtn = document.createElement('a');
        openBtn.href = detailUrl;
        openBtn.className = 'tb-action-icon-btn';
        openBtn.title = 'Buka detail perangkat';
        openBtn.setAttribute('aria-label', `Detail ${item.name}`);
        openBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        actionsWrap.appendChild(openBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'tb-action-icon-btn';
        deleteBtn.title = 'Hapus perangkat';
        deleteBtn.setAttribute('aria-label', `Hapus ${item.name}`);
        deleteBtn.style.color = 'var(--danger)';
        deleteBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBtn.addEventListener('click', () => openDeleteDeviceModal(item));
        actionsWrap.appendChild(deleteBtn);

        actionsTd.appendChild(actionsWrap);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });
}

/** Open confirmation dialog to delete a device directly from the dashboard list. */
function openDeleteDeviceModal(entity) {
    pendingDeleteEntity = entity;
    const modal = document.getElementById('deleteDeviceModal');
    const textEl = document.getElementById('deleteDeviceConfirmText');
    const errBox = document.getElementById('deleteDeviceError');
    if (textEl) {
        textEl.textContent = `Hapus perangkat "${entity.name}"? Seluruh data telemetri dan widget perangkat ini akan dihapus permanen.`;
    }
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-backdrop--open');
    }
}

/** Bind close, cancel, Escape, and confirm delete handlers for the device delete modal. */
function setupDeleteDeviceModal() {
    const modal = document.getElementById('deleteDeviceModal');
    const closeBtn = document.getElementById('btnCloseDeleteDeviceModal');
    const cancelBtn = document.getElementById('btnCancelDeleteDeviceModal');
    const confirmBtn = document.getElementById('btnConfirmDeleteDevice');

    const closeModal = () => {
        if (modal) {
            modal.classList.remove('modal-backdrop--open');
            modal.style.display = 'none';
        }
        pendingDeleteEntity = null;
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
            closeModal();
        }
    });

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!pendingDeleteEntity) return;
            const errBox = document.getElementById('deleteDeviceError');
            if (errBox) {
                errBox.textContent = '';
                errBox.classList.add('form-summary--hidden');
            }
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Menghapus...';

            try {
                await apiFetch(`/entities.php?id=${pendingDeleteEntity.id}`, {
                    method: 'DELETE'
                });
                closeModal();
                await loadEntities();
            } catch (err) {
                if (errBox) {
                    errBox.textContent = `Gagal menghapus perangkat: ${err.message || 'Terjadi kesalahan'}`;
                    errBox.classList.remove('form-summary--hidden');
                }
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Hapus Perangkat';
            }
        });
    }
}
