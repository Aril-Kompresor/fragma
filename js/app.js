let pollingIntervalId = null;
let rawEntities = [];
let currentTab = 'all';
let searchQuery = '';
let currentPage = 1;
let pageSize = 10;
let isPollingEnabled = true;
let selectedEntityIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

function initDashboard() {
    setupThingsBoardControls();
    loadEntities();
    startPolling();

    window.addEventListener('beforeunload', () => {
        stopPolling();
    });
}

function startPolling() {
    stopPolling();
    if (!isPollingEnabled) return;
    pollingIntervalId = setInterval(loadEntities, 10000);
}

function stopPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
}

function setupThingsBoardControls() {
    const tabAll = document.getElementById('tabAllEntities');
    const tabActive = document.getElementById('tabActiveEntities');
    const tabInactive = document.getElementById('tabInactiveEntities');
    const searchInput = document.getElementById('tbSearchInput');
    const refreshBtn = document.getElementById('tbRefreshBtn');
    const pollingToggle = document.getElementById('tbPollingToggle');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
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

    if (selectAllCheckbox) {
        selectAllCheckbox.onchange = () => {
            const isChecked = selectAllCheckbox.checked;
            const rowCheckboxes = document.querySelectorAll('.tb-row-checkbox');
            rowCheckboxes.forEach(cb => {
                cb.checked = isChecked;
                const entityId = parseInt(cb.dataset.id, 10);
                if (isChecked) {
                    selectedEntityIds.add(entityId);
                } else {
                    selectedEntityIds.delete(entityId);
                }
                const tr = cb.closest('tr');
                if (tr) tr.classList.toggle('tb-row-selected', isChecked);
            });
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

async function loadEntities() {
    const loading = document.getElementById('entitiesLoading');

    try {
        const entities = await apiFetch('/entities.php');
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
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--danger);">
                        Failed to load devices: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }
}

function updateTabCounts() {
    const countAll = document.getElementById('countAllEntities');
    const countActive = document.getElementById('countActiveEntities');
    const countInactive = document.getElementById('countInactiveEntities');

    let activeCount = 0;
    let inactiveCount = 0;

    rawEntities.forEach(item => {
        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);
        if (isRecent) {
            activeCount++;
        } else {
            inactiveCount++;
        }
    });

    if (countAll) countAll.textContent = String(rawEntities.length);
    if (countActive) countActive.textContent = String(activeCount);
    if (countInactive) countInactive.textContent = String(inactiveCount);
}

function getFilteredEntities() {
    return rawEntities.filter(item => {
        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);

        if (currentTab === 'active' && !isRecent) return false;
        if (currentTab === 'inactive' && isRecent) return false;

        if (searchQuery) {
            const nameMatch = (item.name || '').toLowerCase().includes(searchQuery);
            const fieldsMatch = Array.isArray(item.fields) && item.fields.some(f => (f.name || '').toLowerCase().includes(searchQuery));
            if (!nameMatch && !fieldsMatch) return false;
        }

        return true;
    });
}

function applyFilterAndRender() {
    const filtered = getFilteredEntities();
    const totalCount = filtered.length;
    const maxPages = Math.max(1, Math.ceil(totalCount / pageSize));

    if (currentPage > maxPages) currentPage = maxPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalCount);
    const pageItems = filtered.slice(startIndex, endIndex);

    renderThingsBoardTable(pageItems, totalCount, startIndex, endIndex, maxPages);
}

function renderThingsBoardTable(items, totalCount, startIndex, endIndex, maxPages) {
    const tableEl = document.getElementById('entitiesTable');
    const tbody = document.getElementById('entitiesTableBody');
    const emptyEl = document.getElementById('entitiesEmptyState');
    const paginationInfo = document.getElementById('tbPaginationInfo');
    const btnFirst = document.getElementById('btnPageFirst');
    const btnPrev = document.getElementById('btnPagePrev');
    const btnNext = document.getElementById('btnPageNext');
    const btnLast = document.getElementById('btnPageLast');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    if (!tbody) return;

    if (totalCount === 0) {
        tbody.replaceChildren();
        if (tableEl) tableEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        if (paginationInfo) paginationInfo.textContent = '0 - 0 of 0';
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
        paginationInfo.textContent = `${startIndex + 1} - ${endIndex} of ${totalCount}`;
    }

    if (btnFirst) btnFirst.disabled = currentPage <= 1;
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= maxPages;
    if (btnLast) btnLast.disabled = currentPage >= maxPages;

    let allChecked = items.length > 0;

    items.forEach(item => {
        const tr = document.createElement('tr');
        const isSelected = selectedEntityIds.has(item.id);
        if (isSelected) tr.classList.add('tb-row-selected');

        const isRecent = item.last_data_at && (new Date() - new Date(item.last_data_at.replace(' ', 'T') + 'Z') < 120000);

        const checkTd = document.createElement('td');
        checkTd.className = 'tb-td-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tb-checkbox tb-row-checkbox';
        checkbox.dataset.id = String(item.id);
        checkbox.checked = isSelected;
        if (!isSelected) allChecked = false;
        checkbox.onchange = (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectedEntityIds.add(item.id);
                tr.classList.add('tb-row-selected');
            } else {
                selectedEntityIds.delete(item.id);
                tr.classList.remove('tb-row-selected');
            }
        };
        checkTd.appendChild(checkbox);
        tr.appendChild(checkTd);

        const timeTd = document.createElement('td');
        timeTd.style.fontFamily = 'var(--font-mono)';
        timeTd.style.fontSize = '0.8rem';
        timeTd.style.color = 'var(--text-secondary)';
        timeTd.textContent = formatDateTime(item.created_at);
        tr.appendChild(timeTd);

        const nameTd = document.createElement('td');
        const nameLink = document.createElement('a');
        nameLink.href = `/entity/index.html?id=${item.id}`;
        nameLink.className = 'tb-row-name-link';
        nameLink.textContent = item.name;
        nameTd.appendChild(nameLink);
        tr.appendChild(nameTd);

        const profileTd = document.createElement('td');
        const profileBadge = document.createElement('span');
        profileBadge.className = 'tb-profile-badge';
        profileBadge.textContent = 'default';
        profileTd.appendChild(profileBadge);
        tr.appendChild(profileTd);

        const stateTd = document.createElement('td');
        const stateBadge = document.createElement('span');
        stateBadge.className = `tb-state-badge ${isRecent ? 'tb-state-badge--active' : 'tb-state-badge--inactive'}`;
        stateBadge.textContent = isRecent ? 'Active' : 'Inactive';
        stateTd.appendChild(stateBadge);
        tr.appendChild(stateTd);

        const countTd = document.createElement('td');
        countTd.style.fontFamily = 'var(--font-mono)';
        countTd.style.fontSize = '0.82rem';
        countTd.textContent = `${item.data_count || 0}`;
        tr.appendChild(countTd);

        const lastTd = document.createElement('td');
        lastTd.style.fontSize = '0.8rem';
        lastTd.style.color = 'var(--text-secondary)';
        lastTd.textContent = item.last_data_at ? formatRelativeTime(item.last_data_at) : 'Never';
        tr.appendChild(lastTd);

        const actionsTd = document.createElement('td');
        actionsTd.style.textAlign = 'right';
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'tb-row-actions';

        const credBtn = document.createElement('a');
        credBtn.href = `/entity/index.html?id=${item.id}`;
        credBtn.className = 'tb-action-icon-btn';
        credBtn.title = 'Device credentials';
        credBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
        actionsWrap.appendChild(credBtn);

        const openBtn = document.createElement('a');
        openBtn.href = `/entity/index.html?id=${item.id}`;
        openBtn.className = 'tb-action-icon-btn';
        openBtn.title = 'View device details';
        openBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        actionsWrap.appendChild(openBtn);

        const deleteBtn = document.createElement('a');
        deleteBtn.href = `/entity/index.html?id=${item.id}`;
        deleteBtn.className = 'tb-action-icon-btn';
        deleteBtn.title = 'Manage or delete device';
        deleteBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        actionsWrap.appendChild(deleteBtn);
        actionsTd.appendChild(actionsWrap);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = allChecked;
    }
}

