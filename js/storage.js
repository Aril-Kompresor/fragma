/**
 * Frontend controller for the project Automation Storage tab (records written by Otomasi Save nodes).
 */

let storageProject = null;
let storageItems = [];
let activeModeFilter = 'all_modes';
let storagePollingTimer = null;
let currentModalJson = '';

/** Initialize the Storage page after verifying active project context. */
document.addEventListener('DOMContentLoaded', async () => {
    storageProject = await window.FragmaAuth.requireActiveProject();
    if (!storageProject) return;

    const flowLink = document.getElementById('goToFlowFromStorage');
    if (flowLink) {
        flowLink.setAttribute('href', window.FragmaAuth.buildProjectUrl(storageProject.uuid, 'flow'));
    }

    bindStorageEvents();
    await loadStorageRecords();
    startStoragePolling();
});

/** Bind mode tabs, flow/device filters, search, export, modal, and delete actions. */
function bindStorageEvents() {
    document.querySelectorAll('.tb-tab[data-mode]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tb-tab[data-mode]').forEach(t => {
                t.classList.remove('tb-tab--active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('tb-tab--active');
            tab.setAttribute('aria-selected', 'true');
            activeModeFilter = tab.dataset.mode || 'all_modes';
            loadStorageRecords();
        });
    });

    document.getElementById('storageFlowFilter')?.addEventListener('change', loadStorageRecords);
    document.getElementById('storageDeviceFilter')?.addEventListener('change', loadStorageRecords);
    document.getElementById('storageSearchInput')?.addEventListener('input', loadStorageRecords);
    document.getElementById('btnRefreshStorage')?.addEventListener('click', loadStorageRecords);

    document.getElementById('storagePollingToggle')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            startStoragePolling();
        } else {
            stopStoragePolling();
        }
    });

    document.getElementById('btnExportStorageJson')?.addEventListener('click', exportStorageAsJson);
    document.getElementById('btnClearAllStorage')?.addEventListener('click', clearAllStorage);

    document.getElementById('btnCloseStorageModal')?.addEventListener('click', closeStorageModal);
    document.getElementById('btnDismissStorageModal')?.addEventListener('click', closeStorageModal);
    document.getElementById('btnCopyStorageModalJson')?.addEventListener('click', async () => {
        if (!currentModalJson) return;
        try {
            await navigator.clipboard.writeText(currentModalJson);
            if (typeof showToast === 'function') showToast('JSON disalin ke clipboard', 'success');
        } catch (err) {
            if (typeof showToast === 'function') showToast('Gagal menyalin JSON', 'error');
        }
    });
}

/** Fetch storage records matching active filters and update UI. */
async function loadStorageRecords() {
    if (!storageProject) return;

    const params = new URLSearchParams();
    params.set('project_uuid', storageProject.uuid);
    if (activeModeFilter !== 'all_modes') {
        params.set('mode', activeModeFilter);
    }

    const flowVal = document.getElementById('storageFlowFilter')?.value || '';
    if (flowVal) params.set('flow_id', flowVal);

    const devVal = document.getElementById('storageDeviceFilter')?.value || '';
    if (devVal) params.set('entity_id', devVal);

    const searchVal = (document.getElementById('storageSearchInput')?.value || '').trim();
    if (searchVal) params.set('q', searchVal);

    try {
        const res = await apiFetch(`/storage.php?${params.toString()}`);
        storageItems = Array.isArray(res.items) ? res.items : [];
        const filters = res.filters || {};
        populateStorageSelect('storageFlowFilter', filters.flows || [], 'Semua workflow');
        populateStorageSelect('storageDeviceFilter', filters.devices || [], 'Semua perangkat');
        updateStorageCounters(res.stats || {}, storageItems);
        renderStorageTable();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(err.message || 'Gagal memuat data storage', 'error');
        }
    }
}

/** Populate a filter dropdown while keeping existing selection. */
function populateStorageSelect(selectId, items, defaultLabel) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const prev = sel.value;
    sel.replaceChildren();

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = defaultLabel;
    sel.appendChild(defaultOpt);

    items.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = String(entry.id);
        opt.textContent = entry.name;
        sel.appendChild(opt);
    });

    if (prev && items.some(i => String(i.id) === String(prev))) {
        sel.value = prev;
    }
}

/** Update storage tab counters using total stats and visible mode breakdowns. */
function updateStorageCounters(stats, visibleItems) {
    const allEl = document.getElementById('countAllStorage');
    const modeAllEl = document.getElementById('countModeAllStorage');
    const modeExEl = document.getElementById('countModeExcludeStorage');

    if (allEl) allEl.textContent = String(stats.total || 0);
    if (activeModeFilter === 'all_modes') {
        const allCount = visibleItems.filter(i => i.mode !== 'exclude').length;
        const exCount = visibleItems.filter(i => i.mode === 'exclude').length;
        if (modeAllEl) modeAllEl.textContent = String(allCount);
        if (modeExEl) modeExEl.textContent = String(exCount);
    }
}

/** Build data chips previewing stored fields inside the table row. */
function buildStorageDataChips(dataObj) {
    const wrap = document.createElement('div');
    wrap.className = 'tb-chips-wrap';

    const entries = Object.entries(dataObj && typeof dataObj === 'object' ? dataObj : {});
    if (entries.length === 0) {
        const empty = document.createElement('span');
        empty.style.color = 'var(--text-muted)';
        empty.style.fontSize = '0.78rem';
        empty.textContent = '{}';
        wrap.appendChild(empty);
        return wrap;
    }

    entries.slice(0, 5).forEach(([k, v]) => {
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

    if (entries.length > 5) {
        const more = document.createElement('span');
        more.className = 'tb-telemetry-chip';
        more.textContent = `+${entries.length - 5}`;
        wrap.appendChild(more);
    }

    return wrap;
}

/** Render the storage records table safely via DOM APIs. */
function renderStorageTable() {
    const tbody = document.getElementById('storageTableBody');
    const emptyEl = document.getElementById('storageEmpty');
    const tableEl = document.getElementById('storageTable');
    if (!tbody || !emptyEl || !tableEl) return;

    tbody.replaceChildren();

    if (storageItems.length === 0) {
        tableEl.style.display = 'none';
        emptyEl.style.display = 'block';
        return;
    }

    tableEl.style.display = '';
    emptyEl.style.display = 'none';

    storageItems.forEach(item => {
        const tr = document.createElement('tr');

        const tdTime = document.createElement('td');
        tdTime.dataset.label = 'Waktu Disimpan';
        tdTime.style.fontFamily = 'var(--font-mono)';
        tdTime.style.fontSize = '0.78rem';
        tdTime.style.color = 'var(--text-secondary)';
        tdTime.textContent = item.saved_at;

        const tdSource = document.createElement('td');
        tdSource.dataset.label = 'Sumber';
        const flowText = document.createElement('div');
        flowText.style.fontWeight = '600';
        flowText.textContent = item.flow_name;
        const devLink = document.createElement('a');
        devLink.href = window.FragmaAuth.buildProjectUrl(storageProject.uuid, 'entity', item.entity_id);
        devLink.style.fontSize = '0.78rem';
        devLink.style.color = 'var(--accent)';
        devLink.textContent = item.entity_name;
        tdSource.appendChild(flowText);
        tdSource.appendChild(devLink);

        const tdMode = document.createElement('td');
        tdMode.dataset.label = 'Mode Save';
        const modeBadge = document.createElement('span');
        modeBadge.className = item.mode === 'exclude'
            ? 'tb-state-badge tb-state-badge--warning'
            : 'tb-state-badge tb-state-badge--active';
        modeBadge.textContent = item.mode === 'exclude' ? 'Filter Exclude' : 'Simpan Semua';
        tdMode.appendChild(modeBadge);

        const tdData = document.createElement('td');
        tdData.dataset.label = 'Data Tersimpan';
        tdData.appendChild(buildStorageDataChips(item.data));

        const tdActions = document.createElement('td');
        tdActions.dataset.label = 'Aksi';
        tdActions.style.textAlign = 'right';
        const actWrap = document.createElement('div');
        actWrap.className = 'tb-row-actions';

        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'tb-action-icon-btn';
        viewBtn.title = 'Lihat JSON lengkap';
        viewBtn.setAttribute('aria-label', 'Lihat JSON lengkap');
        viewBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
        viewBtn.addEventListener('click', () => openStorageModal(item));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tb-action-icon-btn';
        delBtn.title = 'Hapus record';
        delBtn.setAttribute('aria-label', 'Hapus record');
        delBtn.style.color = 'var(--danger)';
        delBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        delBtn.addEventListener('click', () => deleteStorageRecord(item.id));

        actWrap.appendChild(viewBtn);
        actWrap.appendChild(delBtn);
        tdActions.appendChild(actWrap);

        tr.appendChild(tdTime);
        tr.appendChild(tdSource);
        tr.appendChild(tdMode);
        tr.appendChild(tdData);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

/** Open the JSON detail modal for a single storage record. */
function openStorageModal(item) {
    const modal = document.getElementById('storageJsonModal');
    const title = document.getElementById('storageJsonModalTitle');
    const code = document.getElementById('storageJsonModalCode');
    if (!modal || !code) return;

    currentModalJson = JSON.stringify(item.data, null, 2);
    if (title) {
        title.textContent = `${item.flow_name} (${item.entity_name})`;
    }
    code.textContent = currentModalJson;
    modal.style.display = 'flex';
}

/** Close the JSON detail modal. */
function closeStorageModal() {
    const modal = document.getElementById('storageJsonModal');
    if (modal) modal.style.display = 'none';
}

/** Export currently visible storage records as a downloadable JSON file. */
function exportStorageAsJson() {
    if (storageItems.length === 0) {
        if (typeof showToast === 'function') showToast('Tidak ada data untuk diekspor', 'error');
        return;
    }
    const blob = new Blob([JSON.stringify(storageItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fragma-storage-${storageProject.uuid.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Delete a single storage entry by ID. */
async function deleteStorageRecord(id) {
    try {
        await apiFetch(`/storage.php?project_uuid=${encodeURIComponent(storageProject.uuid)}&id=${id}`, {
            method: 'DELETE'
        });
        await loadStorageRecords();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Gagal menghapus record', 'error');
    }
}

/** Clear all storage entries in the active project after confirmation. */
async function clearAllStorage() {
    if (storageItems.length === 0) return;
    if (!window.confirm('Hapus semua data storage di project ini?')) return;
    try {
        await apiFetch(`/storage.php?project_uuid=${encodeURIComponent(storageProject.uuid)}&all=1`, {
            method: 'DELETE'
        });
        await loadStorageRecords();
        if (typeof showToast === 'function') showToast('Storage project berhasil dibersihkan', 'success');
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Gagal membersihkan storage', 'error');
    }
}

/** Start automatic 10-second polling for live storage entries. */
function startStoragePolling() {
    stopStoragePolling();
    storagePollingTimer = setInterval(loadStorageRecords, 10000);
}

/** Stop automatic polling timer. */
function stopStoragePolling() {
    if (storagePollingTimer) {
        clearInterval(storagePollingTimer);
        storagePollingTimer = null;
    }
}
