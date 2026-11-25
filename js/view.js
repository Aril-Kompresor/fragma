let allEntities = [];
let allWidgets = [];
let entityDataCache = {};
let viewPollingIntervalId = null;
let isViewPollingEnabled = true;
let selectedVariant = null;
let pendingDeleteWidgetId = null;
let currentViewProjectId = 0;
let currentViewProjectUuid = '';
let currentViewProjectName = '';

document.addEventListener('DOMContentLoaded', () => {
    initViewPage();
});

/** Initialize Visualisasi dashboard, controls, modals, and live polling. */
async function initViewPage() {
    if (window.FragmaAuth && typeof window.FragmaAuth.requireActiveProject === 'function') {
        const project = await window.FragmaAuth.requireActiveProject();
        if (!project) return;
        currentViewProjectId = project.id;
        currentViewProjectUuid = project.uuid;
        currentViewProjectName = project.name || 'Project';
        const titleEl = document.getElementById('viewPageTitle');
        const subEl = document.getElementById('viewPageSubtitle');
        const crumbEl = document.getElementById('breadcrumbProjectName');
        if (titleEl) titleEl.textContent = `Visualisasi - ${currentViewProjectName}`;
        if (subEl) subEl.textContent = `Pantau grafik dan pembacaan sensor secara langsung khusus untuk project ${currentViewProjectName}.`;
        if (crumbEl) crumbEl.textContent = currentViewProjectName;
    }

    setupViewControls();
    setupAddVisualForm();
    setupDeleteWidgetModal();
    await loadGlobalView();
    startViewPolling();

    window.addEventListener('beforeunload', () => {
        stopViewPolling();
    });
}

/** Start periodic polling for widget data updates. */
function startViewPolling() {
    stopViewPolling();
    if (!isViewPollingEnabled) return;
    viewPollingIntervalId = setInterval(refreshGlobalView, 10000);
}

/** Stop periodic widget polling. */
function stopViewPolling() {
    if (viewPollingIntervalId) {
        clearInterval(viewPollingIntervalId);
        viewPollingIntervalId = null;
    }
}

/** Bind header refresh and live polling controls. */
function setupViewControls() {
    const toggle = document.getElementById('viewPollingToggle');
    const refreshBtn = document.getElementById('refreshViewBtn');

    if (toggle) {
        toggle.addEventListener('change', () => {
            isViewPollingEnabled = toggle.checked;
            if (isViewPollingEnabled) {
                startViewPolling();
            } else {
                stopViewPolling();
            }
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            await refreshGlobalView();
            refreshBtn.disabled = false;
        });
    }
}

/** Load project entities, widgets, and initial telemetry for the canvas. */
async function loadGlobalView() {
    if (!currentViewProjectUuid) return;
    try {
        const entitiesReq = apiFetch(`/entities.php?project_uuid=${encodeURIComponent(currentViewProjectUuid)}`);
        const widgetsReq = apiFetch(`/widgets.php?project_uuid=${encodeURIComponent(currentViewProjectUuid)}`);

        const [entities, widgets] = await Promise.all([entitiesReq, widgetsReq]);

        allEntities = Array.isArray(entities) ? entities : [];
        allWidgets = Array.isArray(widgets) ? widgets : [];

        populateEntitySelect();
        await fetchAllNeededData();
        renderGlobalWidgets();
    } catch (err) {
        const container = document.getElementById('globalWidgetsGrid');
        if (container) {
            container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-state__title">Gagal Memuat Visualisasi</div><div class="empty-state__text">${escapeHtml(err.message || 'Terjadi kesalahan jaringan.')}</div></div>`;
        }
    }
}

/** Refresh widgets and telemetry without resetting canvas positions. */
async function refreshGlobalView() {
    if (!currentViewProjectUuid) return;
    try {
        const widgets = await apiFetch(`/widgets.php?project_uuid=${encodeURIComponent(currentViewProjectUuid)}`);
        allWidgets = Array.isArray(widgets) ? widgets : [];

        await fetchAllNeededData();
        renderGlobalWidgets();
    } catch (err) {
        return;
    }
}

/** Fetch recent telemetry payloads for every entity referenced by a widget. */
async function fetchAllNeededData() {
    const neededEntityIds = [...new Set(allWidgets.map(w => w.entity_id))];

    const fetchPromises = neededEntityIds.map(async (eid) => {
        try {
            const data = await apiFetch(`/data.php?entity_id=${eid}&limit=50`);
            entityDataCache[eid] = Array.isArray(data) ? data : [];
        } catch (e) {
            entityDataCache[eid] = [];
        }
    });

    await Promise.all(fetchPromises);
}

/** Render widgets or an actionable empty state on the dashboard canvas. */
function renderGlobalWidgets() {
    const container = document.getElementById('globalWidgetsGrid');
    const loading = document.getElementById('globalWidgetsLoading');

    if (loading) loading.style.display = 'none';
    if (!container) return;

    if (allWidgets.length === 0) {
        const noDevices = allEntities.length === 0;
        const hint = noDevices
            ? `Project "${escapeHtml(currentViewProjectName)}" belum memiliki perangkat. Tambahkan perangkat terlebih dahulu di menu Perangkat.`
            : `Tambahkan grafik, kartu metrik, atau gauge untuk memantau sensor di project "${escapeHtml(currentViewProjectName)}".`;
        const createUrl = window.FragmaAuth.buildProjectUrl(currentViewProjectUuid, 'create');
        const actionHtml = noDevices
            ? `<a href="${createUrl}" class="btn btn--primary btn--sm">+ Tambah Perangkat</a>`
            : `<button type="button" class="btn btn--primary btn--sm" id="emptyAddWidgetBtn">+ Tambah Widget</button>`;

        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; margin: 24px;">
                <div style="margin-bottom: 12px; color: var(--text-muted);">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                </div>
                <div class="empty-state__title">Belum Ada Widget di Project Ini</div>
                <div class="empty-state__text">${hint}</div>
                ${actionHtml}
            </div>
        `;
        const emptyBtn = document.getElementById('emptyAddWidgetBtn');
        const fabBtn = document.getElementById('fabAddWidget');
        if (emptyBtn && fabBtn) {
            emptyBtn.addEventListener('click', () => fabBtn.click());
        }
        return;
    }

    const existingEmpty = container.querySelector('.empty-state');
    if (existingEmpty) {
        existingEmpty.remove();
    }

    const currentWidgetIds = new Set(allWidgets.map(w => w.id));
    Array.from(container.children).forEach(child => {
        if (child.id && child.id.startsWith('global-widget-')) {
            const id = parseInt(child.id.replace('global-widget-', ''), 10);
            if (!currentWidgetIds.has(id)) {
                if (typeof destroyChartInstance === 'function') destroyChartInstance(id);
                if (typeof destroyGaugeInstance === 'function') destroyGaugeInstance(id);
                child.remove();
            }
        }
    });

    allWidgets.forEach(widget => {
        const wrapperId = `global-widget-${widget.id}`;
        let widgetWrapper = document.getElementById(wrapperId);

        const dataPoints = entityDataCache[widget.entity_id] || [];

        if (widgetWrapper) {
            if (typeof widgetWrapper.widgetUpdate === 'function') {
                widgetWrapper.widgetUpdate(dataPoints);
            }
        } else {
            widgetWrapper = document.createElement('div');
            widgetWrapper.id = wrapperId;
            widgetWrapper.className = 'draggable-widget';

            if (!widget.config.layout || typeof widget.config.layout.x !== 'number') {
                widget.config.layout = calculateNextWidgetPosition(widget.type, widget.id);
            }
            const layout = widget.config.layout;

            widgetWrapper.style.left = layout.x + 'px';
            widgetWrapper.style.top = layout.y + 'px';
            widgetWrapper.style.width = layout.w + 'px';
            widgetWrapper.style.height = layout.h + 'px';

            const configCopy = { ...widget.config };
            if (widget.entity_name) {
                configCopy.label = `${widget.entity_name}: ${configCopy.label}`;
            }

            if (widget.type === 'line-chart') {
                renderLineChart(widgetWrapper, dataPoints, configCopy, widget.id, removeGlobalWidget);
            } else if (widget.type === 'value-card') {
                renderValueCard(widgetWrapper, dataPoints, configCopy, widget.id, removeGlobalWidget);
            } else if (widget.type === 'gauge') {
                renderGauge(widgetWrapper, dataPoints, configCopy, widget.id, removeGlobalWidget);
            }

            container.appendChild(widgetWrapper);

            makeDraggableAndResizable(widgetWrapper, widgetWrapper, async (newLayout) => {
                widget.config.layout = newLayout;
                try {
                    await apiFetch(`/widgets.php?id=${widget.id}`, {
                        method: 'PUT',
                        body: { config: widget.config }
                    });
                } catch (e) {
                    return;
                }
            });
        }
    });
}

/** Set up the 3-step widget picker modal and form bindings. */
function setupAddVisualForm() {
    const form = document.getElementById('addVisualForm');
    const entitySelect = document.getElementById('visualEntitySelect');
    const modal = document.getElementById('addWidgetModal');
    const btnOpen = document.getElementById('fabAddWidget');
    const step1 = document.getElementById('pickerStep1');
    const step2 = document.getElementById('pickerStep2');
    const step3 = document.getElementById('pickerStep3');

    const widgetBundles = {
        charts: {
            title: 'Grafik & Meter',
            widgets: [
                {
                    type: 'line-chart',
                    name: 'Time Series Chart',
                    tag: 'grafik area',
                    variant: 'area',
                    preview: '<svg width="120" height="60" viewBox="0 0 120 60" fill="none"><polyline points="5,50 20,30 40,40 60,15 80,25 100,5 115,20" stroke="#4ecdc4" stroke-width="2" fill="none"/><polyline points="5,55 20,42 40,48 60,30 80,38 100,22 115,35" stroke="#e74c6f" stroke-width="1.5" fill="none" opacity="0.5"/></svg>'
                },
                {
                    type: 'line-chart',
                    name: 'Line Chart',
                    tag: 'garis',
                    variant: 'line',
                    preview: '<svg width="120" height="60" viewBox="0 0 120 60" fill="none"><polyline points="5,45 30,20 60,35 90,10 115,30" stroke="#2ecc71" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>'
                },
                {
                    type: 'gauge',
                    name: 'Gauge Meter',
                    tag: 'meter',
                    preview: '<svg width="120" height="60" viewBox="0 0 120 60"><path d="M 25 50 A 35 35 0 0 1 95 50" stroke="rgba(30,30,46,0.8)" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M 25 50 A 35 35 0 0 1 65 18" stroke="#4ecdc4" stroke-width="10" stroke-linecap="round" fill="none"/></svg>'
                }
            ]
        },
        counters: {
            title: 'Kartu Metrik',
            widgets: [
                {
                    type: 'value-card',
                    name: 'Kartu Alarm',
                    tag: 'nilai',
                    variant: 'alarm',
                    preview: '<div style="text-align:center;display:flex;align-items:center;gap:10px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e74c6f" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><div><div style="font-size:2rem;font-weight:700;color:#e74c6f;line-height:1">3</div><div style="font-size:0.6rem;color:var(--text-muted)">Aktif</div></div></div>'
                },
                {
                    type: 'value-card',
                    name: 'Kartu Nilai',
                    tag: 'nilai',
                    variant: 'entity',
                    preview: '<div style="text-align:center;display:flex;align-items:center;gap:10px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg><div><div style="font-size:2rem;font-weight:700;color:#4ecdc4;line-height:1">296</div><div style="font-size:0.6rem;color:var(--text-muted)">Sensor</div></div></div>'
                }
            ]
        }
    };

    function showStep(num) {
        step1.style.display = num === 1 ? 'flex' : 'none';
        step2.style.display = num === 2 ? 'flex' : 'none';
        step3.style.display = num === 3 ? 'flex' : 'none';
    }

    function closeModal() {
        modal.style.display = 'none';
        const errBox = document.getElementById('addVisualError');
        if (errBox) {
            errBox.textContent = '';
            errBox.classList.add('form-summary--hidden');
        }
        showStep(1);
    }

    function openBundle(bundleKey) {
        const bundle = widgetBundles[bundleKey];
        if (!bundle) return;

        document.getElementById('pickerStep2Title').textContent = bundle.title;
        const grid = document.getElementById('subWidgetGrid');
        grid.innerHTML = '';

        bundle.widgets.forEach(w => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'subwidget-card';
            card.style.textAlign = 'left';

            const preview = document.createElement('div');
            preview.className = 'subwidget-card__preview';
            preview.innerHTML = w.preview;

            const info = document.createElement('div');
            info.className = 'subwidget-card__info';
            info.innerHTML = `<span class="subwidget-card__name">${w.name}</span><span class="subwidget-card__tag">${w.tag}</span>`;

            card.appendChild(preview);
            card.appendChild(info);

            card.addEventListener('click', () => {
                document.getElementById('visualTypeSelect').value = w.type;
                document.getElementById('pickerStep3Title').textContent = w.name;
                document.getElementById('visualLabelInput').placeholder = `contoh: ${w.name}`;
                selectedVariant = w.variant || null;

                const gaugeGroup = document.getElementById('gaugeConfigGroup');
                if (gaugeGroup) gaugeGroup.style.display = w.type === 'gauge' ? 'block' : 'none';

                const errBox = document.getElementById('addVisualError');
                if (errBox) {
                    errBox.textContent = '';
                    errBox.classList.add('form-summary--hidden');
                }

                showStep(3);
            });

            grid.appendChild(card);
        });

        showStep(2);
    }

    if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
            showStep(1);
        });
    }

    document.querySelectorAll('#closeModalBtn, #closeModalBtn2, #closeModalBtn3, #cancelModalBtn').forEach(btn => {
        if (btn) btn.addEventListener('click', closeModal);
    });

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display !== 'none') {
                closeModal();
            }
        });
    }

    document.querySelectorAll('.bundle-card').forEach(card => {
        card.addEventListener('click', () => openBundle(card.dataset.bundle));
    });

    const backBtn = document.getElementById('pickerBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => showStep(1));

    const backBtn2 = document.getElementById('pickerBackBtn2');
    if (backBtn2) backBtn2.addEventListener('click', () => showStep(2));

    if (entitySelect) {
        entitySelect.addEventListener('change', (e) => {
            populateFieldSelect(parseInt(e.target.value, 10));
        });
    }

    const colorSwatches = document.querySelectorAll('.color-swatch');
    const colorInput = document.getElementById('visualColorInput');
    if (colorSwatches.length && colorInput) {
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                colorSwatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                colorInput.value = swatch.dataset.color;
            });
        });
    }

    if (form) {
        form.onsubmit = handleAddVisualSubmit;
    }
}

/** Populate device dropdown options inside the Add Widget form. */
function populateEntitySelect() {
    const select = document.getElementById('visualEntitySelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Pilih Perangkat --</option>';
    allEntities.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        select.appendChild(opt);
    });
}

/** Populate field options for the chosen device. */
function populateFieldSelect(entityId) {
    const select = document.getElementById('visualFieldSelect');
    if (!select) return;

    select.innerHTML = '';
    const entity = allEntities.find(e => e.id === entityId);

    if (!entity || !Array.isArray(entity.fields) || entity.fields.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'value';
        opt.textContent = 'value (Default)';
        select.appendChild(opt);
        return;
    }

    entity.fields.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = `${f.name}${f.unit ? ` (${f.unit})` : ''}`;
        select.appendChild(opt);
    });
}

/** Calculate the next non-overlapping position on the canvas for a widget. */
function calculateNextWidgetPosition(type, excludeWidgetId = null) {
    const isLineChart = type === 'line-chart';
    const newW = isLineChart ? 460 : 280;
    const newH = isLineChart ? 300 : 180;
    const SNAP = 20;
    const GAP = 20;
    const startX = 40;
    const startY = 20;

    const container = document.getElementById('globalWidgetsGrid');
    const containerWidth = container && container.clientWidth > 500 ? container.clientWidth - 40 : 1200;

    const existingBoxes = allWidgets
        .filter(w => !excludeWidgetId || w.id !== excludeWidgetId)
        .map(w => {
            const l = (w.config && w.config.layout) ? w.config.layout : null;
            const defW = w.type === 'line-chart' ? 460 : 280;
            const defH = w.type === 'line-chart' ? 300 : 180;
            return {
                x: l && typeof l.x === 'number' ? l.x : 0,
                y: l && typeof l.y === 'number' ? l.y : 0,
                w: l && typeof l.w === 'number' ? l.w : defW,
                h: l && typeof l.h === 'number' ? l.h : defH
            };
        });

    for (let y = startY; y <= 5000; y += SNAP) {
        for (let x = startX; x + newW <= containerWidth; x += SNAP) {
            let collision = false;
            for (const b of existingBoxes) {
                if (!(x + newW + GAP <= b.x || x >= b.x + b.w + GAP || y + newH + GAP <= b.y || y >= b.y + b.h + GAP)) {
                    collision = true;
                    break;
                }
            }
            if (!collision) {
                return { x, y, w: newW, h: newH };
            }
        }
    }

    let maxBottom = startY;
    existingBoxes.forEach(b => {
        if (b.y + b.h > maxBottom) {
            maxBottom = b.y + b.h;
        }
    });
    const fallbackY = Math.ceil((maxBottom + GAP) / SNAP) * SNAP;
    return { x: startX, y: fallbackY, w: newW, h: newH };
}

/** Submit new widget configuration and reload canvas state without full page reload. */
async function handleAddVisualSubmit(e) {
    e.preventDefault();
    const entityId = document.getElementById('visualEntitySelect').value;
    const type = document.getElementById('visualTypeSelect').value;
    const field = document.getElementById('visualFieldSelect').value;
    const label = document.getElementById('visualLabelInput').value.trim();
    const color = document.getElementById('visualColorInput').value;
    const submitBtn = document.getElementById('submitAddVisualBtn');
    const errBox = document.getElementById('addVisualError');

    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }

    if (!entityId) {
        if (errBox) {
            errBox.textContent = 'Harap pilih perangkat terlebih dahulu.';
            errBox.classList.remove('form-summary--hidden');
        }
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Menambahkan...';
        }

        const newLayout = calculateNextWidgetPosition(type);
        const widgetConfig = {
            field,
            label: label || field,
            color: color || '#4ecdc4',
            layout: newLayout
        };
        if (selectedVariant) widgetConfig.variant = selectedVariant;

        if (type === 'gauge') {
            const minInput = document.getElementById('visualMinInput');
            const maxInput = document.getElementById('visualMaxInput');
            if (minInput && minInput.value !== '') widgetConfig.min = minInput.value;
            if (maxInput && maxInput.value !== '') widgetConfig.max = maxInput.value;
        }

        await apiFetch(`/widgets.php?entity_id=${entityId}`, {
            method: 'POST',
            body: {
                type,
                config: widgetConfig
            }
        });

        document.getElementById('visualLabelInput').value = '';

        const modal = document.getElementById('addWidgetModal');
        if (modal) modal.style.display = 'none';

        await loadGlobalView();
    } catch (err) {
        if (errBox) {
            errBox.textContent = `Gagal menambahkan widget: ${err.message}`;
            errBox.classList.remove('form-summary--hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Tambahkan ke Dashboard';
        }
    }
}

/** Open confirmation modal to remove a widget from the canvas. */
function removeGlobalWidget(widgetId) {
    pendingDeleteWidgetId = widgetId;
    const modal = document.getElementById('deleteWidgetModal');
    const errBox = document.getElementById('deleteWidgetError');
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-backdrop--open');
    }
}

/** Set up event handlers for delete widget confirmation modal. */
function setupDeleteWidgetModal() {
    const modal = document.getElementById('deleteWidgetModal');
    const btnClose = document.getElementById('btnCloseDeleteWidgetModal');
    const btnCancel = document.getElementById('btnCancelDeleteWidgetModal');
    const btnConfirm = document.getElementById('btnConfirmDeleteWidget');

    function closeDeleteModal() {
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('modal-backdrop--open');
        }
        pendingDeleteWidgetId = null;
    }

    if (btnClose) btnClose.addEventListener('click', closeDeleteModal);
    if (btnCancel) btnCancel.addEventListener('click', closeDeleteModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDeleteModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
            closeDeleteModal();
        }
    });

    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            if (!pendingDeleteWidgetId) return;

            const errBox = document.getElementById('deleteWidgetError');
            if (errBox) {
                errBox.textContent = '';
                errBox.classList.add('form-summary--hidden');
            }

            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Menghapus...';

            try {
                await apiFetch(`/widgets.php?id=${pendingDeleteWidgetId}`, {
                    method: 'DELETE'
                });
                closeDeleteModal();
                await loadGlobalView();
            } catch (err) {
                if (errBox) {
                    errBox.textContent = `Gagal menghapus widget: ${err.message || 'Terjadi kesalahan'}`;
                    errBox.classList.remove('form-summary--hidden');
                }
            } finally {
                btnConfirm.disabled = false;
                btnConfirm.textContent = 'Hapus Widget';
            }
        });
    }
}
