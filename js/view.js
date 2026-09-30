/**
 * Global View page controller.
 * Fetches widgets across all entities and renders them in a unified dashboard.
 */

let allEntities = [];
let allWidgets = [];
let entityDataCache = {};
let viewPollingIntervalId = null;
let selectedVariant = null;

/**
 * Initialize view page upon DOM ready.
 */
document.addEventListener('DOMContentLoaded', () => {
    initViewPage();
});

/**
 * Mount handlers and initiate global view loading and polling.
 */
function initViewPage() {
    setupAddVisualForm();
    loadGlobalView();

    if (viewPollingIntervalId) {
        clearInterval(viewPollingIntervalId);
    }
    viewPollingIntervalId = setInterval(refreshGlobalView, 10000);

    window.addEventListener('beforeunload', () => {
        if (viewPollingIntervalId) {
            clearInterval(viewPollingIntervalId);
        }
    });
}

/**
 * Load all entities and widgets then render the canvas.
 */
async function loadGlobalView() {
    try {
        const entitiesReq = apiFetch('/entities.php');
        const widgetsReq = apiFetch('/widgets.php');
        
        const [entities, widgets] = await Promise.all([entitiesReq, widgetsReq]);
        
        allEntities = Array.isArray(entities) ? entities : [];
        allWidgets = Array.isArray(widgets) ? widgets : [];
        
        populateEntitySelect();
        await fetchAllNeededData();
        renderGlobalWidgets();
    } catch (err) {
    }
}

/**
 * Periodically refresh widgets and data points.
 */
async function refreshGlobalView() {
    try {
        const widgets = await apiFetch('/widgets.php');
        allWidgets = Array.isArray(widgets) ? widgets : [];
        
        await fetchAllNeededData();
        renderGlobalWidgets();
    } catch (err) {
    }
}

/**
 * Fetch telemetry data points for all entities that have active widgets.
 */
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

/**
 * Render all widgets on the drag-and-drop global canvas.
 */
function renderGlobalWidgets() {
    const container = document.getElementById('globalWidgetsGrid');
    const loading = document.getElementById('globalWidgetsLoading');
    
    if (loading) loading.style.display = 'none';
    if (!container) return;

    if (allWidgets.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state__icon">📈</div>
                <div class="empty-state__title">No Visuals Yet</div>
                <div class="empty-state__text">Add visuals from your entities to build a unified global dashboard.</div>
            </div>
        `;
        return;
    }

    if (!container.classList.contains('grid-canvas')) {
        container.innerHTML = '';
        container.className = 'grid-canvas';
        container.style.position = 'relative';
        container.style.width = '100%';
        container.style.minHeight = '600px';
    }
    
    const currentWidgetIds = new Set(allWidgets.map(w => w.id));
    Array.from(container.children).forEach(child => {
        if (child.id && child.id.startsWith('global-widget-')) {
            const id = parseInt(child.id.replace('global-widget-', ''), 10);
            if (!currentWidgetIds.has(id)) {
                if (typeof destroyChartInstance === 'function') destroyChartInstance(id);
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
            
            const layout = widget.config.layout || {
                x: 0,
                y: 0,
                w: widget.type === 'line-chart' ? 450 : 280,
                h: widget.type === 'line-chart' ? 300 : 180
            };

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
                }
            });
        }
    });
}

/**
 * Configure wizard modal controls and multi-step widget configuration form.
 */
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
            title: 'Charts',
            widgets: [
                {
                    type: 'line-chart',
                    name: 'Time Series Chart',
                    tag: 'series',
                    preview: '<svg width="120" height="60" viewBox="0 0 120 60" fill="none"><polyline points="5,50 20,30 40,40 60,15 80,25 100,5 115,20" stroke="#4ecdc4" stroke-width="2" fill="none"/><polyline points="5,55 20,42 40,48 60,30 80,38 100,22 115,35" stroke="#e74c6f" stroke-width="1.5" fill="none" opacity="0.5"/></svg>'
                },
                {
                    type: 'line-chart',
                    name: 'Line Chart',
                    tag: 'series',
                    preview: '<svg width="120" height="60" viewBox="0 0 120 60" fill="none"><polyline points="5,45 30,20 60,35 90,10 115,30" stroke="#2ecc71" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>'
                },
                {
                    type: 'line-chart',
                    name: 'Bar Chart',
                    tag: 'latest',
                    disabled: true,
                    preview: '<svg width="120" height="60" viewBox="0 0 120 60" fill="none"><rect x="10" y="20" width="16" height="38" rx="2" fill="#4ecdc4" opacity="0.7"/><rect x="32" y="10" width="16" height="48" rx="2" fill="#4ecdc4" opacity="0.85"/><rect x="54" y="30" width="16" height="28" rx="2" fill="#4ecdc4" opacity="0.6"/><rect x="76" y="5" width="16" height="53" rx="2" fill="#4ecdc4"/><rect x="98" y="25" width="16" height="33" rx="2" fill="#4ecdc4" opacity="0.75"/></svg>'
                }
            ]
        },
        counters: {
            title: 'Count Widgets',
            widgets: [
                {
                    type: 'value-card',
                    name: 'Alarm Count',
                    tag: 'latest',
                    variant: 'alarm',
                    preview: '<div style="text-align:center;display:flex;align-items:center;gap:10px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e74c6f" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><div><div style="font-size:2rem;font-weight:700;color:#e74c6f;line-height:1">3</div><div style="font-size:0.6rem;color:var(--text-muted)">Active</div></div></div>'
                },
                {
                    type: 'value-card',
                    name: 'Entity Count',
                    tag: 'latest',
                    variant: 'entity',
                    preview: '<div style="text-align:center;display:flex;align-items:center;gap:10px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg><div><div style="font-size:2rem;font-weight:700;color:#4ecdc4;line-height:1">296</div><div style="font-size:0.6rem;color:var(--text-muted)">Devices</div></div></div>'
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
        showStep(1);
    }

    function openBundle(bundleKey) {
        const bundle = widgetBundles[bundleKey];
        if (!bundle) return;

        document.getElementById('pickerStep2Title').textContent = bundle.title;
        const grid = document.getElementById('subWidgetGrid');
        grid.innerHTML = '';

        bundle.widgets.forEach(w => {
            const card = document.createElement('div');
            card.className = 'subwidget-card' + (w.disabled ? ' disabled' : '');

            const preview = document.createElement('div');
            preview.className = 'subwidget-card__preview';
            preview.innerHTML = w.preview;

            const info = document.createElement('div');
            info.className = 'subwidget-card__info';
            info.innerHTML = `<span class="subwidget-card__name">${w.name}</span><span class="subwidget-card__tag">${w.tag}</span>`;

            card.appendChild(preview);
            card.appendChild(info);

            if (!w.disabled) {
                card.addEventListener('click', () => {
                    document.getElementById('visualTypeSelect').value = w.type;
                    document.getElementById('pickerStep3Title').textContent = w.name;
                    document.getElementById('visualLabelInput').placeholder = `e.g. ${w.name}`;
                    selectedVariant = w.variant || null;
                    showStep(3);
                });
            }

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

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

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

/**
 * Populate entity options in the visual configuration dropdown.
 */
function populateEntitySelect() {
    const select = document.getElementById('visualEntitySelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Entity --</option>';
    allEntities.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        select.appendChild(opt);
    });
}

/**
 * Populate field options for the selected entity.
 */
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

/**
 * Handle submission of new visual widget configuration.
 */
async function handleAddVisualSubmit(e) {
    e.preventDefault();
    const entityId = document.getElementById('visualEntitySelect').value;
    const type = document.getElementById('visualTypeSelect').value;
    const field = document.getElementById('visualFieldSelect').value;
    const label = document.getElementById('visualLabelInput').value.trim();
    const color = document.getElementById('visualColorInput').value;
    const submitBtn = document.getElementById('submitAddVisualBtn');

    if (!entityId) {
        alert('Please select an entity first.');
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Adding...';
        }

        const widgetConfig = {
            field,
            label: label || field,
            color: color || '#4ecdc4'
        };
        if (selectedVariant) widgetConfig.variant = selectedVariant;

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
        alert(`Failed to add visual: ${err.message}`);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Visual';
        }
    }
}

/**
 * Remove an existing widget from the global view canvas.
 */
async function removeGlobalWidget(widgetId) {
    if (!confirm('Remove this visual from the dashboard?')) return;

    try {
        await apiFetch(`/widgets.php?id=${widgetId}`, {
            method: 'DELETE'
        });
        await refreshGlobalView();
    } catch (err) {
        alert(`Failed to remove visual: ${err.message}`);
    }
}
