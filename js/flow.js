/**
 * Fragma Free-Canvas 2D n8n Workflow Editor
 * Supports arbitrary 2D node positioning, drag-and-drop SVG port wiring, and on-demand node configuration.
 */

let flowsList = [];
let projectDevices = [];
let activeFlowId = null;
let graphState = { version: 2, nodes: [], edges: [] };
let selectedNodeId = null;
let nextNodeCounter = 100;
let saveDebounceTimer = null;
let currentFlowProjectId = 0;
let currentFlowProjectUuid = '';
let viewTransform = { x: 40, y: 40, scale: 1 };
let pendingConnectSource = null;
let dragSession = null;
let wireSession = null;
let panSession = null;

const NODE_WIDTH = 84;
const NODE_HEIGHT = 84;

const NODE_META = {
    input: {
        title: 'Input',
        desc: 'Menentukan perangkat mana di project ini yang memicu workflow dan filter awal data.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
    },
    require: {
        title: 'Syarat',
        desc: 'Hentikan alur jika field tertentu tidak memenuhi batas syarat.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>'
    },
    if: {
        title: 'IF',
        desc: 'Memecah alur menjadi jalur true dan false sesuai kondisi payload.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>'
    },
    set: {
        title: 'Set',
        desc: 'Menambahkan atau mengubah nilai field pada payload.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
    },
    math: {
        title: 'Hitung',
        desc: 'Menghitung nilai field baru memakai operasi matematika.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
    },
    alert: {
        title: 'Peringatan',
        desc: 'Memicu status alert beserta pesan khusus pada eksekusi workflow.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    },
    debug: {
        title: 'Debug',
        desc: 'Menangkap snapshot payload pada titik ini dan menyertakannya pada respons API.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'
    },
    save: {
        title: 'Save',
        desc: 'Menyimpan payload akhir ke database dengan opsi mengecualikan field sementara.',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initFlowPage();
});

/** Initialize Otomasi 2D studio, validate active project UUID, and load devices and workflows. */
async function initFlowPage() {
    if (window.FragmaAuth && typeof window.FragmaAuth.requireActiveProject === 'function') {
        const project = await window.FragmaAuth.requireActiveProject();
        if (!project) return;
        currentFlowProjectId = project.id;
        currentFlowProjectUuid = project.uuid;
        const crumbEl = document.getElementById('breadcrumbProjectName');
        if (crumbEl) crumbEl.textContent = project.name || 'Project';
    }

    setupStageInteractions();
    setupPalettePopover();
    setupDrawerControls();
    bindTopBarActions();
    await loadDeviceOptions();
    await loadFlowsFromServer();
}

/** Generate a unique ID for newly added nodes or edges. */
function nextId(prefix) {
    nextNodeCounter += 1;
    return `${prefix}_${Date.now()}_${nextNodeCounter}`;
}

/** Create a default Input node with scope and filter config. */
function createInputNode(entityId = null, x = 40, y = 160) {
    const eid = entityId ? Number(entityId) : null;
    return {
        id: 'n_input_1',
        type: 'input',
        x,
        y,
        scope: eid ? 'specific' : 'all',
        entity_id: eid,
        entity_ids: eid ? [eid] : [],
        filter_field: '',
        filter_operator: 'exists',
        filter_value: ''
    };
}

/** Create a new node positioned on the 2D canvas. */
function createNode(type, x = 220, y = 160) {
    const id = nextId(`n_${type}`);
    if (type === 'input') {
        return createInputNode(null, x, y);
    }
    if (type === 'require') {
        return { id, type, x, y, field: 'voltage', operator: '>=', value: '2.5' };
    }
    if (type === 'if') {
        return { id, type, x, y, field: 'temperature', operator: '>', value: '35' };
    }
    if (type === 'set') {
        return { id, type, x, y, field: 'status', value: 'NORMAL' };
    }
    if (type === 'math') {
        return { id, type, x, y, target: 'temp_f', source: 'temperature', operator: '*', operand: '1.8' };
    }
    if (type === 'alert') {
        return { id, type, x, y, level: 'Warning', message: 'Melewati ambang batas' };
    }
    if (type === 'debug') {
        return { id, type, x, y, label: 'Cek Payload', mode: 'all', field: '', include_in_response: true };
    }
    return { id, type: 'save', x, y, mode: 'all', exclude_fields: '' };
}

/** Return a clean starter 2D workflow matching n8n branching layout. */
function getDefaultGraph(entityId = null) {
    const nIn = createInputNode(entityId, 40, 190);
    const nIf = { id: nextId('n_if'), type: 'if', x: 250, y: 190, field: 'temperature', operator: '>', value: '35' };
    const nSet = { id: nextId('n_set'), type: 'set', x: 470, y: 35, field: 'status', value: 'OVERHEAT' };
    const nDbg = { id: nextId('n_debug'), type: 'debug', x: 470, y: 345, label: 'Cek Normal', mode: 'all', field: '', include_in_response: true };
    const nSave = { id: nextId('n_save'), type: 'save', x: 690, y: 190, mode: 'all', exclude_fields: '' };

    return {
        version: 2,
        nodes: [nIn, nIf, nSet, nDbg, nSave],
        edges: [
            { id: nextId('e'), from: nIn.id, fromPort: 'out', to: nIf.id },
            { id: nextId('e'), from: nIf.id, fromPort: 'true', to: nSet.id },
            { id: nextId('e'), from: nIf.id, fromPort: 'false', to: nDbg.id },
            { id: nextId('e'), from: nSet.id, fromPort: 'out', to: nSave.id },
            { id: nextId('e'), from: nDbg.id, fromPort: 'out', to: nSave.id }
        ]
    };
}

/** Convert legacy sequential block arrays into positioned 2D nodes and edges. */
function convertLegacyBlocksToGraph(rawBlocks, entityId) {
    if (rawBlocks && !Array.isArray(rawBlocks) && Array.isArray(rawBlocks.nodes)) {
        const nodes = rawBlocks.nodes.map((n, idx) => ({
            ...n,
            x: typeof n.x === 'number' ? n.x : 40 + idx * 195,
            y: typeof n.y === 'number' ? n.y : 190
        }));
        const edges = Array.isArray(rawBlocks.edges) ? rawBlocks.edges.map(e => ({ ...e })) : [];
        return { version: 2, nodes, edges };
    }

    const legacyList = Array.isArray(rawBlocks) ? rawBlocks : [];
    const nodes = [];
    const edges = [];

    let curX = 40;
    const mainY = 200;
    let prevNodeId = null;

    const firstIsInput = legacyList.length > 0 && legacyList[0] && legacyList[0].type === 'input';
    if (!firstIsInput) {
        const inputNode = createInputNode(entityId, curX, mainY);
        nodes.push(inputNode);
        prevNodeId = inputNode.id;
        curX += 220;
    }

    legacyList.forEach(block => {
        if (!block || !block.type) return;
        const { children, ...rest } = block;
        const nodeObj = { ...rest, id: block.id || nextId(`n_${block.type}`), x: curX, y: mainY };
        nodes.push(nodeObj);

        if (prevNodeId) {
            const prevNode = nodes.find(n => n.id === prevNodeId);
            edges.push({
                id: nextId('e'),
                from: prevNodeId,
                fromPort: prevNode && prevNode.type === 'if' ? 'false' : 'out',
                to: nodeObj.id
            });
        }

        if (block.type === 'if' && Array.isArray(children) && children.length > 0) {
            let childX = curX + 220;
            let branchPrevId = nodeObj.id;
            let branchPort = 'true';
            children.forEach(child => {
                const cNode = { ...child, id: child.id || nextId(`n_${child.type}`), x: childX, y: 35 };
                nodes.push(cNode);
                edges.push({ id: nextId('e'), from: branchPrevId, fromPort: branchPort, to: cNode.id });
                branchPrevId = cNode.id;
                branchPort = 'out';
                childX += 210;
            });
        }

        prevNodeId = nodeObj.id;
        curX += 220;
    });

    return { version: 2, nodes, edges };
}

/** Return the active flow object from flowsList. */
function getActiveFlow() {
    return flowsList.find(f => Number(f.id) === Number(activeFlowId)) || null;
}

/** Update the save badge in the top toolbar. */
function setSaveStatus(mode, label) {
    const el = document.getElementById('flowSaveStatus');
    if (!el) return;
    el.className = 'flow-save-status';
    if (mode === 'saving') {
        el.classList.add('flow-save-status--saving');
    } else if (mode === 'error') {
        el.classList.add('flow-save-status--error');
    }
    el.textContent = label;
}

/** Fetch all project entities for Input node device targeting. */
async function loadDeviceOptions() {
    if (!currentFlowProjectUuid) return;
    try {
        const entities = await apiFetch(`/entities.php?project_uuid=${encodeURIComponent(currentFlowProjectUuid)}`);
        projectDevices = Array.isArray(entities) ? entities : [];
    } catch (e) {
        projectDevices = [];
    }
}

/** Load flows from API or auto-create a starter 2D workflow. */
async function loadFlowsFromServer() {
    try {
        const flows = await apiFetch(`/flows.php?project_uuid=${encodeURIComponent(currentFlowProjectUuid)}`);
        if (Array.isArray(flows) && flows.length > 0) {
            flowsList = flows;
            selectFlow(flowsList[0].id);
            return;
        }
    } catch (e) {
        setSaveStatus('error', 'Luring');
    }

    try {
        const starter = getDefaultGraph(null);
        const created = await apiFetch('/flows.php', {
            method: 'POST',
            body: {
                project_uuid: currentFlowProjectUuid || null,
                name: 'Flow Utama',
                entity_id: null,
                enabled: true,
                blocks: starter,
                test_inputs: []
            }
        });
        if (created && created.id) {
            flowsList = [created];
            selectFlow(created.id);
            return;
        }
    } catch (e) {
        setSaveStatus('error', 'Gagal Muat');
    }

    graphState = getDefaultGraph(null);
    renderGraph();
    fitCanvasToNodes();
}

/** Switch the active workflow and render its 2D nodes and wires. */
function selectFlow(flowId) {
    const target = flowsList.find(f => Number(f.id) === Number(flowId));
    if (!target) return;

    activeFlowId = Number(target.id);
    graphState = convertLegacyBlocksToGraph(target.blocks, target.entity_id);
    selectedNodeId = null;
    closeDrawer();

    const nameInput = document.getElementById('flowNameInput');
    if (nameInput) {
        nameInput.value = target.name || 'Workflow';
    }

    const enabledToggle = document.getElementById('flowEnabledToggle');
    if (enabledToggle) {
        enabledToggle.checked = Boolean(target.enabled);
    }

    renderFlowTabs();
    renderGraph();
    fitCanvasToNodes();
}

/** Render horizontal flow tabs in the top bar. */
function renderFlowTabs() {
    const container = document.getElementById('flowTabsList');
    if (!container) return;

    container.replaceChildren();

    flowsList.forEach(flow => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flow-tab' + (Number(flow.id) === Number(activeFlowId) ? ' flow-tab--active' : '');
        btn.setAttribute('role', 'tab');

        const dot = document.createElement('span');
        dot.className = 'flow-tab__dot' + (flow.enabled ? ' flow-tab__dot--on' : '');
        dot.title = flow.enabled ? 'Aktif' : 'Nonaktif';

        const label = document.createElement('span');
        label.textContent = flow.name || `Flow #${flow.id}`;

        btn.appendChild(dot);
        btn.appendChild(label);
        btn.addEventListener('click', () => selectFlow(flow.id));
        container.appendChild(btn);
    });
}

/** Sync active flow entity_id column from the graph's Input node configuration. */
function syncActiveFlowTargetFromInput() {
    const active = getActiveFlow();
    if (!active) return;
    const inputNode = graphState.nodes.find(n => n.type === 'input');
    if (!inputNode) {
        active.entity_id = null;
        return;
    }
    if (inputNode.scope === 'specific' && inputNode.entity_id) {
        active.entity_id = Number(inputNode.entity_id);
    } else {
        active.entity_id = null;
    }
}

/** Persist current 2D graph state to backend API immediately or with debounce. */
async function persistFlowNow() {
    const active = getActiveFlow();
    if (!active) return;

    syncActiveFlowTargetFromInput();
    active.blocks = graphState;

    setSaveStatus('saving', 'Menyimpan...');
    try {
        await apiFetch(`/flows.php?id=${active.id}`, {
            method: 'PUT',
            body: {
                name: active.name,
                entity_id: active.entity_id,
                enabled: active.enabled,
                blocks: active.blocks,
                test_inputs: []
            }
        });
        setSaveStatus('saved', 'Tersimpan');
    } catch (err) {
        setSaveStatus('error', 'Gagal Menyimpan');
    }
}

/** Queue a debounced save after user drags a node or edits config. */
function saveState() {
    syncActiveFlowTargetFromInput();
    const active = getActiveFlow();
    if (active) {
        active.blocks = graphState;
    }
    setSaveStatus('saving', 'Menyimpan...');
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
    }
    saveDebounceTimer = setTimeout(() => {
        persistFlowNow();
    }, 350);
}

/** Bind top bar workflow actions (new flow, rename, active toggle, save, reset, delete). */
function bindTopBarActions() {
    const btnNew = document.getElementById('btnNewFlow');
    if (btnNew) {
        btnNew.addEventListener('click', async () => {
            try {
                setSaveStatus('saving', 'Membuat...');
                const nIn = createInputNode(null, 40, 160);
                const nDbg = createNode('debug', 240, 160);
                const nSav = createNode('save', 440, 160);
                const starter = {
                    version: 2,
                    nodes: [nIn, nDbg, nSav],
                    edges: [
                        { id: nextId('e'), from: nIn.id, fromPort: 'out', to: nDbg.id },
                        { id: nextId('e'), from: nDbg.id, fromPort: 'out', to: nSav.id }
                    ]
                };
                const created = await apiFetch('/flows.php', {
                    method: 'POST',
                    body: {
                        project_uuid: currentFlowProjectUuid || null,
                        name: `Flow ${flowsList.length + 1}`,
                        entity_id: null,
                        enabled: true,
                        blocks: starter,
                        test_inputs: []
                    }
                });
                if (created && created.id) {
                    flowsList.push(created);
                    selectFlow(created.id);
                    setSaveStatus('saved', 'Tersimpan');
                }
            } catch (e) {
                setSaveStatus('error', 'Gagal Membuat');
            }
        });
    }

    const nameInput = document.getElementById('flowNameInput');
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            const active = getActiveFlow();
            if (!active) return;
            active.name = nameInput.value.trim() || 'Workflow';
            renderFlowTabs();
            saveState();
        });
    }

    const enabledToggle = document.getElementById('flowEnabledToggle');
    if (enabledToggle) {
        enabledToggle.addEventListener('change', () => {
            const active = getActiveFlow();
            if (!active) return;
            active.enabled = enabledToggle.checked;
            renderFlowTabs();
            saveState();
        });
    }

    const btnSave = document.getElementById('btnSaveFlow');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            if (saveDebounceTimer) {
                clearTimeout(saveDebounceTimer);
                saveDebounceTimer = null;
            }
            persistFlowNow();
        });
    }

    const btnReset = document.getElementById('btnResetFlow');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            graphState = getDefaultGraph(null);
            selectedNodeId = null;
            closeDrawer();
            renderGraph();
            fitCanvasToNodes();
            saveState();
        });
    }

    const btnDelete = document.getElementById('btnDeleteFlow');
    const deleteModal = document.getElementById('deleteFlowModal');
    const btnCloseDelete = document.getElementById('btnCloseDeleteFlowModal');
    const btnCancelDelete = document.getElementById('btnCancelDeleteFlowModal');
    const btnConfirmDelete = document.getElementById('btnConfirmDeleteFlow');

    function closeDeleteFlowModal() {
        if (deleteModal) {
            deleteModal.style.display = 'none';
            deleteModal.classList.remove('modal-backdrop--open');
        }
    }

    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const active = getActiveFlow();
            if (!active) return;
            const textEl = document.getElementById('deleteFlowConfirmText');
            const errBox = document.getElementById('deleteFlowError');
            if (textEl) textEl.textContent = `Apakah Anda yakin ingin menghapus workflow "${active.name}"?`;
            if (errBox) {
                errBox.textContent = '';
                errBox.classList.add('form-summary--hidden');
            }
            if (deleteModal) {
                deleteModal.style.display = 'flex';
                deleteModal.classList.add('modal-backdrop--open');
            }
        });
    }

    if (btnCloseDelete) btnCloseDelete.addEventListener('click', closeDeleteFlowModal);
    if (btnCancelDelete) btnCancelDelete.addEventListener('click', closeDeleteFlowModal);
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) closeDeleteFlowModal();
        });
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', async () => {
            const active = getActiveFlow();
            if (!active) return;
            const errBox = document.getElementById('deleteFlowError');
            if (errBox) {
                errBox.textContent = '';
                errBox.classList.add('form-summary--hidden');
            }
            btnConfirmDelete.disabled = true;
            btnConfirmDelete.textContent = 'Menghapus...';
            try {
                await apiFetch(`/flows.php?id=${active.id}`, { method: 'DELETE' });
                closeDeleteFlowModal();
                flowsList = flowsList.filter(f => Number(f.id) !== Number(active.id));
                if (flowsList.length === 0) {
                    await loadFlowsFromServer();
                } else {
                    selectFlow(flowsList[0].id);
                }
            } catch (e) {
                if (errBox) {
                    errBox.textContent = `Gagal menghapus workflow: ${e.message || 'Terjadi kesalahan'}`;
                    errBox.classList.remove('form-summary--hidden');
                }
                setSaveStatus('error', 'Gagal Menghapus');
            } finally {
                btnConfirmDelete.disabled = false;
                btnConfirmDelete.textContent = 'Hapus Workflow';
            }
        });
    }

    document.getElementById('btnFitView')?.addEventListener('click', fitCanvasToNodes);
    document.getElementById('btnZoomIn')?.addEventListener('click', () => setCanvasScale(viewTransform.scale + 0.12));
    document.getElementById('btnZoomOut')?.addEventListener('click', () => setCanvasScale(viewTransform.scale - 0.12));
    document.getElementById('btnResetView')?.addEventListener('click', () => {
        viewTransform = { x: 40, y: 40, scale: 1 };
        applyWorldTransform();
    });
}

/** Populate the floating Tambah Node popover menu. */
function setupPalettePopover() {
    const btnOpen = document.getElementById('btnOpenPalette');
    const btnClose = document.getElementById('btnClosePalette');
    const popover = document.getElementById('n8nPalettePopover');
    const grid = document.getElementById('n8nPaletteGrid');

    if (grid) {
        const types = ['input', 'require', 'if', 'set', 'math', 'alert', 'debug', 'save'];
        types.forEach(type => {
            const meta = NODE_META[type];
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'n8n-palette-item';
            const iconSpan = document.createElement('span');
            iconSpan.style.display = 'inline-flex';
            iconSpan.style.color = 'var(--accent)';
            iconSpan.innerHTML = meta.icon;
            const labelSpan = document.createElement('span');
            labelSpan.textContent = meta.title;
            item.appendChild(iconSpan);
            item.appendChild(labelSpan);
            item.addEventListener('click', () => {
                addNodeToCanvas(type);
                closePalettePopover();
            });
            grid.appendChild(item);
        });
    }

    btnOpen?.addEventListener('click', () => {
        pendingConnectSource = null;
        if (popover) {
            popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
        }
    });

    btnClose?.addEventListener('click', closePalettePopover);
}

/** Hide the floating Tambah Node popover menu. */
function closePalettePopover() {
    const popover = document.getElementById('n8nPalettePopover');
    if (popover) popover.style.display = 'none';
    pendingConnectSource = null;
}

/** Add a node at a smart position (or chained to pendingConnectSource) and open its config. */
function addNodeToCanvas(type) {
    if (type === 'input' && graphState.nodes.some(n => n.type === 'input')) {
        const existingInput = graphState.nodes.find(n => n.type === 'input');
        selectedNodeId = existingInput.id;
        renderGraph();
        openNodeDrawer(existingInput.id);
        return;
    }

    let posX = 120;
    let posY = 160;

    if (pendingConnectSource) {
        const src = graphState.nodes.find(n => n.id === pendingConnectSource.nodeId);
        if (src) {
            posX = src.x + 200;
            posY = src.y;
            if (pendingConnectSource.port === 'true') posY = src.y - 80;
            if (pendingConnectSource.port === 'false') posY = src.y + 80;
        }
    } else if (graphState.nodes.length > 0) {
        let maxX = 40;
        let lastY = 160;
        graphState.nodes.forEach(n => {
            if (n.x >= maxX) {
                maxX = n.x;
                lastY = n.y;
            }
        });
        posX = maxX + 190;
        posY = lastY;
    }

    const newNode = createNode(type, posX, posY);
    graphState.nodes.push(newNode);

    if (pendingConnectSource) {
        graphState.edges.push({
            id: nextId('e'),
            from: pendingConnectSource.nodeId,
            fromPort: pendingConnectSource.port,
            to: newNode.id
        });
        pendingConnectSource = null;
    }

    selectedNodeId = newNode.id;
    renderGraph();
    openNodeDrawer(newNode.id);
    saveState();
}

/** Return short readable 1-line summary shown beneath each node tile. */
function getNodeSummaryText(node) {
    if (node.type === 'input') {
        if (node.scope === 'specific') {
            const dev = projectDevices.find(d => Number(d.id) === Number(node.entity_id));
            return dev ? dev.name : 'Pilih device';
        }
        if (node.scope === 'multiple') {
            const count = Array.isArray(node.entity_ids) ? node.entity_ids.length : 0;
            return `${count} device`;
        }
        return 'Semua device';
    }
    if (node.type === 'require') return `${node.field || '?'} ${node.operator || '>='} ${node.value ?? ''}`;
    if (node.type === 'if') return `${node.field || '?'} ${node.operator || '>'} ${node.value ?? ''}`;
    if (node.type === 'set') return `${node.field || '?'} = ${node.value ?? ''}`;
    if (node.type === 'math') return `${node.target || '?'} = ${node.source || '?'} ${node.operator || '+'} ${node.operand ?? 0}`;
    if (node.type === 'alert') return `${node.level || 'Warning'}: ${node.message || ''}`;
    if (node.type === 'debug') return node.mode === 'field' && node.field ? `Field: ${node.field}` : (node.label || 'Semua field');
    if (node.type === 'save') return node.mode === 'exclude' && node.exclude_fields ? `Kecuali ${node.exclude_fields}` : 'Simpan ke DB';
    return '';
}

/** Calculate exact canvas coordinates of a node's input or output port dot. */
function getPortCoordinates(node, side, portName = 'out') {
    if (side === 'in') {
        return { x: node.x, y: node.y + 42 };
    }
    if (node.type === 'if') {
        return {
            x: node.x + NODE_WIDTH,
            y: portName === 'true' ? node.y + 25 : node.y + 57
        };
    }
    return { x: node.x + NODE_WIDTH, y: node.y + 42 };
}

/** Build an SVG cubic Bezier path string between two points. */
function buildBezierPath(x1, y1, x2, y2) {
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.55);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Render all 2D nodes and SVG Bezier connection wires on the canvas. */
function renderGraph() {
    renderNodesLayer();
    renderEdgesLayer();
}

/** Render all node tiles cleanly positioned at their (x, y) coordinates. */
function renderNodesLayer() {
    const layer = document.getElementById('n8nNodesLayer');
    if (!layer) return;

    layer.replaceChildren();

    graphState.nodes.forEach(node => {
        const meta = NODE_META[node.type] || { title: node.type, icon: '' };
        const el = document.createElement('div');
        el.className = `n8n-card n8n-card--${node.type}${selectedNodeId === node.id ? ' n8n-card--selected' : ''}`;
        el.dataset.nodeId = node.id;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;

        const box = document.createElement('div');
        box.className = 'n8n-card__box';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'n8n-card__icon';
        iconDiv.innerHTML = meta.icon;
        box.appendChild(iconDiv);

        if (node.type !== 'input') {
            const inPort = document.createElement('div');
            inPort.className = 'n8n-port n8n-port--in';
            inPort.dataset.portSide = 'in';
            inPort.dataset.nodeId = node.id;
            inPort.title = 'Sambungkan masuk ke sini';
            box.appendChild(inPort);
        }

        if (node.type === 'if') {
            ['true', 'false'].forEach(branchPort => {
                const pEl = document.createElement('div');
                pEl.className = `n8n-port n8n-port--${branchPort}`;
                pEl.dataset.portSide = 'out';
                pEl.dataset.portName = branchPort;
                pEl.dataset.nodeId = node.id;
                pEl.title = `Tarik garis dari cabang ${branchPort}`;
                pEl.addEventListener('pointerdown', (e) => startWireDrag(e, node.id, branchPort));
                box.appendChild(pEl);

                const lbl = document.createElement('span');
                lbl.className = `n8n-port-label n8n-port-label--${branchPort}`;
                lbl.textContent = branchPort;
                box.appendChild(lbl);

                const hasOutgoing = graphState.edges.some(edge => edge.from === node.id && (edge.fromPort || 'out') === branchPort);
                if (!hasOutgoing) {
                    const plusBtn = document.createElement('button');
                    plusBtn.type = 'button';
                    plusBtn.className = `n8n-quick-plus n8n-quick-plus--${branchPort}`;
                    plusBtn.textContent = '+';
                    plusBtn.title = `Tambah node setelah ${branchPort}`;
                    plusBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
                    plusBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openPaletteForPort(node.id, branchPort);
                    });
                    box.appendChild(plusBtn);
                }
            });
        } else {
            const outPort = document.createElement('div');
            outPort.className = 'n8n-port n8n-port--out';
            outPort.dataset.portSide = 'out';
            outPort.dataset.portName = 'out';
            outPort.dataset.nodeId = node.id;
            outPort.title = 'Tarik untuk menghubungkan ke node lain';
            outPort.addEventListener('pointerdown', (e) => startWireDrag(e, node.id, 'out'));
            box.appendChild(outPort);

            const hasOutgoing = graphState.edges.some(edge => edge.from === node.id);
            if (!hasOutgoing) {
                const plusBtn = document.createElement('button');
                plusBtn.type = 'button';
                plusBtn.className = 'n8n-quick-plus';
                plusBtn.textContent = '+';
                plusBtn.title = 'Tambah node lanjutan';
                plusBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
                plusBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openPaletteForPort(node.id, 'out');
                });
                box.appendChild(plusBtn);
            }
        }

        const titleEl = document.createElement('div');
        titleEl.className = 'n8n-card__title';
        titleEl.textContent = meta.title;

        const subEl = document.createElement('div');
        subEl.className = 'n8n-card__sub';
        subEl.textContent = getNodeSummaryText(node);

        el.appendChild(box);
        el.appendChild(titleEl);
        el.appendChild(subEl);

        el.addEventListener('pointerdown', (e) => startNodeDrag(e, node, el));
        layer.appendChild(el);
    });
}

/** Open the node picker pre-bound to automatically connect after the given port. */
function openPaletteForPort(nodeId, port) {
    pendingConnectSource = { nodeId, port };
    const popover = document.getElementById('n8nPalettePopover');
    if (popover) popover.style.display = 'block';
}

/** Render SVG cubic Bezier wires connecting nodes cleanly. */
function renderEdgesLayer(previewWire = null) {
    const svg = document.getElementById('n8nEdgesSvg');
    if (!svg) return;

    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }

    const svgNs = 'http://www.w3.org/2000/svg';

    graphState.edges.forEach(edge => {
        const srcNode = graphState.nodes.find(n => n.id === edge.from);
        const dstNode = graphState.nodes.find(n => n.id === edge.to);
        if (!srcNode || !dstNode) return;

        const p1 = getPortCoordinates(srcNode, 'out', edge.fromPort || 'out');
        const p2 = getPortCoordinates(dstNode, 'in');

        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('class', 'n8n-edge-path');
        path.setAttribute('d', buildBezierPath(p1.x, p1.y, p2.x, p2.y));
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            removeEdgeById(edge.id);
        });
        svg.appendChild(path);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const delGroup = document.createElementNS(svgNs, 'g');
        delGroup.setAttribute('class', 'n8n-edge-delete');
        delGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

        const bg = document.createElementNS(svgNs, 'circle');
        bg.setAttribute('class', 'n8n-edge-delete-bg');
        bg.setAttribute('r', '8');

        const txt = document.createElementNS(svgNs, 'text');
        txt.setAttribute('class', 'n8n-edge-delete-txt');
        txt.textContent = '×';

        delGroup.appendChild(bg);
        delGroup.appendChild(txt);
        delGroup.addEventListener('click', (e) => {
            e.stopPropagation();
            removeEdgeById(edge.id);
        });
        svg.appendChild(delGroup);
    });

    if (previewWire) {
        const previewPath = document.createElementNS(svgNs, 'path');
        previewPath.setAttribute('class', 'n8n-edge-path n8n-edge-path--preview');
        previewPath.setAttribute('d', buildBezierPath(previewWire.x1, previewWire.y1, previewWire.x2, previewWire.y2));
        svg.appendChild(previewPath);
    }
}

/** Delete an edge by ID and save updated graph. */
function removeEdgeById(edgeId) {
    graphState.edges = graphState.edges.filter(e => e.id !== edgeId);
    renderGraph();
    saveState();
}

/** Convert screen pointer coordinates into world coordinates inside the transformed stage. */
function screenToWorld(clientX, clientY) {
    const stage = document.getElementById('n8nStage');
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
        x: (clientX - rect.left - viewTransform.x) / viewTransform.scale,
        y: (clientY - rect.top - viewTransform.y) / viewTransform.scale
    };
}

/** Apply CSS pan and zoom transform to the 2D workflow container. */
function applyWorldTransform() {
    const world = document.getElementById('n8nWorld');
    if (world) {
        world.style.transform = `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`;
    }
}

/** Clamp and update canvas zoom level around the stage center. */
function setCanvasScale(nextScale) {
    viewTransform.scale = Math.max(0.5, Math.min(1.6, Number(nextScale.toFixed(2))));
    applyWorldTransform();
}

/** Center and scale the canvas to fit existing nodes comfortably inside view. */
function fitCanvasToNodes() {
    const stage = document.getElementById('n8nStage');
    if (!stage || graphState.nodes.length === 0) {
        viewTransform = { x: 40, y: 40, scale: 1 };
        applyWorldTransform();
        return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    graphState.nodes.forEach(n => {
        if (n.x - 40 < minX) minX = n.x - 40;
        if (n.y - 20 < minY) minY = n.y - 20;
        if (n.x + NODE_WIDTH + 65 > maxX) maxX = n.x + NODE_WIDTH + 65;
        if (n.y + NODE_HEIGHT + 45 > maxY) maxY = n.y + NODE_HEIGHT + 45;
    });

    const stageW = stage.clientWidth || 800;
    const stageH = stage.clientHeight || 500;
    const contentW = Math.max(240, maxX - minX);
    const contentH = Math.max(180, maxY - minY);

    const scale = Math.max(0.5, Math.min(1.05, Math.min((stageW - 60) / contentW, (stageH - 80) / contentH)));
    viewTransform.scale = Number(scale.toFixed(2));
    viewTransform.x = Math.round(Math.max(20, (stageW - contentW * viewTransform.scale) / 2) - minX * viewTransform.scale);
    viewTransform.y = Math.round(Math.max(25, (stageH - contentH * viewTransform.scale) / 2 - minY * viewTransform.scale));
    applyWorldTransform();
}

/** Begin dragging a 2D node card across the canvas, or open config on short click. */
function startNodeDrag(e, node, cardEl) {
    if (e.button !== 0) return;
    if (e.target.closest('.n8n-port') || e.target.closest('.n8n-quick-plus')) return;
    e.stopPropagation();

    dragSession = {
        node,
        cardEl,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startNodeX: node.x,
        startNodeY: node.y,
        moved: false
    };
}

/** Begin dragging a new connection wire from a node's output port. */
function startWireDrag(e, sourceNodeId, portName) {
    e.stopPropagation();
    e.preventDefault();
    const srcNode = graphState.nodes.find(n => n.id === sourceNodeId);
    if (!srcNode) return;
    const startPt = getPortCoordinates(srcNode, 'out', portName);
    wireSession = {
        fromId: sourceNodeId,
        fromPort: portName,
        x1: startPt.x,
        y1: startPt.y
    };
}

/** Bind global pointer listeners for node dragging, wire creation, and canvas panning. */
function setupStageInteractions() {
    const stage = document.getElementById('n8nStage');
    if (!stage) return;

    stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.n8n-card') || e.target.closest('.n8n-fab-add') || e.target.closest('.n8n-palette-popover') || e.target.closest('.n8n-zoom-bar')) {
            return;
        }
        closePalettePopover();
        panSession = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startPanX: viewTransform.x,
            startPanY: viewTransform.y
        };
        stage.classList.add('n8n-stage--panning');
    });

    window.addEventListener('pointermove', (e) => {
        if (dragSession) {
            const dxScreen = e.clientX - dragSession.startClientX;
            const dyScreen = e.clientY - dragSession.startClientY;
            if (!dragSession.moved && (Math.abs(dxScreen) > 4 || Math.abs(dyScreen) > 4)) {
                dragSession.moved = true;
            }
            if (dragSession.moved) {
                const newX = Math.max(0, Math.round(dragSession.startNodeX + dxScreen / viewTransform.scale));
                const newY = Math.max(0, Math.round(dragSession.startNodeY + dyScreen / viewTransform.scale));
                dragSession.node.x = newX;
                dragSession.node.y = newY;
                dragSession.cardEl.style.left = `${newX}px`;
                dragSession.cardEl.style.top = `${newY}px`;
                renderEdgesLayer();
            }
            return;
        }

        if (wireSession) {
            const pt = screenToWorld(e.clientX, e.clientY);
            renderEdgesLayer({ x1: wireSession.x1, y1: wireSession.y1, x2: pt.x, y2: pt.y });
            return;
        }

        if (panSession) {
            viewTransform.x = panSession.startPanX + (e.clientX - panSession.startClientX);
            viewTransform.y = panSession.startPanY + (e.clientY - panSession.startClientY);
            applyWorldTransform();
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (dragSession) {
            const wasMoved = dragSession.moved;
            const targetNode = dragSession.node;
            dragSession = null;
            if (wasMoved) {
                saveState();
            } else {
                selectedNodeId = targetNode.id;
                renderNodesLayer();
                openNodeDrawer(targetNode.id);
            }
        }

        if (wireSession) {
            const hitPort = document.elementFromPoint(e.clientX, e.clientY)?.closest('.n8n-port--in');
            const hitCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.n8n-card');
            const targetNodeId = hitPort ? hitPort.dataset.nodeId : (hitCard ? hitCard.dataset.nodeId : null);

            if (targetNodeId && targetNodeId !== wireSession.fromId) {
                const targetNode = graphState.nodes.find(n => n.id === targetNodeId);
                if (targetNode && targetNode.type !== 'input') {
                    const alreadyExists = graphState.edges.some(edge => edge.from === wireSession.fromId && (edge.fromPort || 'out') === wireSession.fromPort && edge.to === targetNodeId);
                    if (!alreadyExists) {
                        graphState.edges.push({
                            id: nextId('e'),
                            from: wireSession.fromId,
                            fromPort: wireSession.fromPort,
                            to: targetNodeId
                        });
                        saveState();
                    }
                }
            }
            wireSession = null;
            renderGraph();
        }

        if (panSession) {
            panSession = null;
            stage.classList.remove('n8n-stage--panning');
        }
    });
}

/** Bind slide-over node configuration drawer open/close/delete controls. */
function setupDrawerControls() {
    document.getElementById('btnCloseDrawer')?.addEventListener('click', closeDrawer);
    document.getElementById('btnDrawerDone')?.addEventListener('click', closeDrawer);
    document.getElementById('nodeConfigBackdrop')?.addEventListener('click', closeDrawer);

    document.getElementById('btnDrawerDeleteNode')?.addEventListener('click', () => {
        if (!selectedNodeId) return;
        const target = graphState.nodes.find(n => n.id === selectedNodeId);
        if (!target || target.type === 'input') return;
        graphState.nodes = graphState.nodes.filter(n => n.id !== selectedNodeId);
        graphState.edges = graphState.edges.filter(e => e.from !== selectedNodeId && e.to !== selectedNodeId);
        selectedNodeId = null;
        closeDrawer();
        renderGraph();
        saveState();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePalettePopover();
            closeDrawer();
        }
    });
}

/** Open the slide-over config drawer populated for the specified node ID. */
function openNodeDrawer(nodeId) {
    const node = graphState.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const drawer = document.getElementById('nodeConfigDrawer');
    const backdrop = document.getElementById('nodeConfigBackdrop');
    const titleEl = document.getElementById('drawerNodeTitle');
    const descEl = document.getElementById('drawerNodeDesc');
    const bodyEl = document.getElementById('drawerNodeBody');
    const delBtn = document.getElementById('btnDrawerDeleteNode');

    const meta = NODE_META[node.type] || { title: node.type, desc: '' };
    if (titleEl) titleEl.textContent = `Konfigurasi: ${meta.title}`;
    if (descEl) descEl.textContent = meta.desc;
    if (delBtn) delBtn.style.display = node.type === 'input' ? 'none' : 'inline-flex';

    if (bodyEl) {
        bodyEl.replaceChildren();
        if (node.type === 'input') populateInputConfig(bodyEl, node);
        else if (node.type === 'require' || node.type === 'if') populateConditionConfig(bodyEl, node, node.type === 'if');
        else if (node.type === 'set') populateSetConfig(bodyEl, node);
        else if (node.type === 'math') populateMathConfig(bodyEl, node);
        else if (node.type === 'alert') populateAlertConfig(bodyEl, node);
        else if (node.type === 'debug') populateDebugConfig(bodyEl, node);
        else if (node.type === 'save') populateSaveConfig(bodyEl, node);
    }

    if (backdrop) backdrop.style.display = 'block';
    if (drawer) drawer.style.display = 'flex';
}

/** Close the slide-over node configuration drawer. */
function closeDrawer() {
    const drawer = document.getElementById('nodeConfigDrawer');
    const backdrop = document.getElementById('nodeConfigBackdrop');
    if (drawer) drawer.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

/** Populate Input node configuration (all devices vs specific device vs multiple checklist + filter). */
function populateInputConfig(container, node) {
    const scopeField = createFieldWrap('Cakupan Perangkat Pemicu', 'Pilih apakah workflow ini berjalan untuk semua device di project atau device tertentu.');
    const scopeSelect = document.createElement('select');
    scopeSelect.className = 'flow-input';
    [
        { value: 'all', label: 'Seluruh device di project ini' },
        { value: 'specific', label: 'Hanya 1 device spesifik' },
        { value: 'multiple', label: 'Beberapa device pilihan' }
    ].forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        o.selected = (node.scope || 'all') === opt.value;
        scopeSelect.appendChild(o);
    });
    scopeSelect.addEventListener('change', () => {
        node.scope = scopeSelect.value;
        if (node.scope === 'specific' && !node.entity_id && projectDevices.length > 0) {
            node.entity_id = Number(projectDevices[0].id);
        }
        saveState();
        renderNodesLayer();
        openNodeDrawer(node.id);
    });
    scopeField.appendChild(scopeSelect);
    container.appendChild(scopeField);

    if (node.scope === 'specific') {
        const devField = createFieldWrap('Pilih Device Spesifik');
        const devSelect = document.createElement('select');
        devSelect.className = 'flow-input';
        if (projectDevices.length === 0) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = 'Belum ada device di project ini';
            devSelect.appendChild(o);
        } else {
            projectDevices.forEach(dev => {
                const o = document.createElement('option');
                o.value = String(dev.id);
                o.textContent = `${dev.name} (#${dev.id})`;
                o.selected = Number(node.entity_id) === Number(dev.id);
                devSelect.appendChild(o);
            });
        }
        devSelect.addEventListener('change', () => {
            node.entity_id = devSelect.value ? Number(devSelect.value) : null;
            saveState();
            renderNodesLayer();
        });
        devField.appendChild(devSelect);
        container.appendChild(devField);
    }

    if (node.scope === 'multiple') {
        const multiField = createFieldWrap('Pilih Daftar Device', 'Centang device yang diizinkan memicu workflow.');
        const listBox = document.createElement('div');
        listBox.className = 'n8n-device-checklist';
        if (!Array.isArray(node.entity_ids)) node.entity_ids = [];
        if (projectDevices.length === 0) {
            const emptySpan = document.createElement('span');
            emptySpan.style.fontSize = '0.8rem';
            emptySpan.style.color = 'var(--text-muted)';
            emptySpan.textContent = 'Belum ada device.';
            listBox.appendChild(emptySpan);
        } else {
            projectDevices.forEach(dev => {
                const lbl = document.createElement('label');
                lbl.className = 'n8n-check-item';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                const devId = Number(dev.id);
                cb.checked = node.entity_ids.map(Number).includes(devId);
                cb.addEventListener('change', () => {
                    const currentIds = new Set(node.entity_ids.map(Number));
                    if (cb.checked) currentIds.add(devId);
                    else currentIds.delete(devId);
                    node.entity_ids = Array.from(currentIds);
                    saveState();
                    renderNodesLayer();
                });
                const txt = document.createElement('span');
                txt.textContent = `${dev.name} (#${dev.id})`;
                lbl.appendChild(cb);
                lbl.appendChild(txt);
                listBox.appendChild(lbl);
            });
        }
        multiField.appendChild(listBox);
        container.appendChild(multiField);
    }

    const filterWrap = createFieldWrap('Filter Field Awal (Opsional)', 'Kosongkan untuk menerima semua payload, atau isi nama field seperti temperature.');
    filterWrap.appendChild(createDrawerTextInput(node, 'filter_field', 'contoh: temperature', true));
    container.appendChild(filterWrap);

    if (node.filter_field && String(node.filter_field).trim() !== '') {
        const row = document.createElement('div');
        row.className = 'n8n-inline-row';

        const opWrap = createFieldWrap('Kondisi');
        opWrap.appendChild(createDrawerSelect(node, 'filter_operator', [
            { value: 'exists', label: 'Field ada' },
            { value: '>', label: '>' },
            { value: '<', label: '<' },
            { value: '>=', label: '>=' },
            { value: '<=', label: '<=' },
            { value: '==', label: '==' },
            { value: '!=', label: '!=' }
        ], true));
        row.appendChild(opWrap);

        if ((node.filter_operator || 'exists') !== 'exists') {
            const valWrap = createFieldWrap('Nilai');
            valWrap.appendChild(createDrawerTextInput(node, 'filter_value', '0'));
            row.appendChild(valWrap);
        }

        container.appendChild(row);
    }
}

/** Populate Require or IF node condition fields. */
function populateConditionConfig(container, node, isIfNode) {
    const fieldWrap = createFieldWrap('Nama Field');
    fieldWrap.appendChild(createDrawerTextInput(node, 'field', 'contoh: temperature'));
    container.appendChild(fieldWrap);

    const row = document.createElement('div');
    row.className = 'n8n-inline-row';
    const opWrap = createFieldWrap('Operator');
    opWrap.appendChild(createDrawerSelect(node, 'operator', ['>', '<', '>=', '<=', '==', '!=']));
    const valWrap = createFieldWrap('Nilai');
    valWrap.appendChild(createDrawerTextInput(node, 'value', isIfNode ? '35' : '2.5'));
    row.appendChild(opWrap);
    row.appendChild(valWrap);
    container.appendChild(row);
}

/** Populate Set node configuration fields. */
function populateSetConfig(container, node) {
    const fWrap = createFieldWrap('Field Target');
    fWrap.appendChild(createDrawerTextInput(node, 'field', 'status'));
    container.appendChild(fWrap);

    const vWrap = createFieldWrap('Nilai Baru');
    vWrap.appendChild(createDrawerTextInput(node, 'value', 'OVERHEAT'));
    container.appendChild(vWrap);
}

/** Populate Math node configuration fields. */
function populateMathConfig(container, node) {
    const tWrap = createFieldWrap('Field Hasil');
    tWrap.appendChild(createDrawerTextInput(node, 'target', 'temp_f'));
    container.appendChild(tWrap);

    const sWrap = createFieldWrap('Field Sumber');
    sWrap.appendChild(createDrawerTextInput(node, 'source', 'temperature'));
    container.appendChild(sWrap);

    const row = document.createElement('div');
    row.className = 'n8n-inline-row';
    const opWrap = createFieldWrap('Operasi');
    opWrap.appendChild(createDrawerSelect(node, 'operator', ['+', '-', '*', '/', '%']));
    const operandWrap = createFieldWrap('Angka');
    operandWrap.appendChild(createDrawerTextInput(node, 'operand', '1.8'));
    row.appendChild(opWrap);
    row.appendChild(operandWrap);
    container.appendChild(row);
}

/** Populate Alert node configuration fields. */
function populateAlertConfig(container, node) {
    const lWrap = createFieldWrap('Level Peringatan');
    lWrap.appendChild(createDrawerSelect(node, 'level', ['Info', 'Warning', 'Critical']));
    container.appendChild(lWrap);

    const mWrap = createFieldWrap('Pesan');
    mWrap.appendChild(createDrawerTextInput(node, 'message', 'Suhu melewati batas'));
    container.appendChild(mWrap);
}

/** Populate Debug node configuration fields. */
function populateDebugConfig(container, node) {
    const lWrap = createFieldWrap('Label Debug');
    lWrap.appendChild(createDrawerTextInput(node, 'label', 'Cek Payload'));
    container.appendChild(lWrap);

    const mWrap = createFieldWrap('Cakupan Data');
    mWrap.appendChild(createDrawerSelect(node, 'mode', [
        { value: 'all', label: 'Semua field payload' },
        { value: 'field', label: '1 field tertentu' }
    ], true));
    container.appendChild(mWrap);

    if (node.mode === 'field') {
        const fWrap = createFieldWrap('Nama Field');
        fWrap.appendChild(createDrawerTextInput(node, 'field', 'temperature'));
        container.appendChild(fWrap);
    }

    const rWrap = createFieldWrap('Keluaran Debug');
    const lbl = document.createElement('label');
    lbl.className = 'n8n-check-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = node.include_in_response !== false;
    cb.addEventListener('change', () => {
        node.include_in_response = cb.checked;
        saveState();
        renderNodesLayer();
    });
    const txt = document.createElement('span');
    txt.textContent = 'Sertakan snapshot debug di respons API';
    lbl.appendChild(cb);
    lbl.appendChild(txt);
    rWrap.appendChild(lbl);
    container.appendChild(rWrap);
}

/** Populate Save node configuration fields. */
function populateSaveConfig(container, node) {
    const mWrap = createFieldWrap('Mode Simpan ke Database');
    mWrap.appendChild(createDrawerSelect(node, 'mode', [
        { value: 'all', label: 'Simpan semua field payload' },
        { value: 'exclude', label: 'Kecualikan field sementara' }
    ], true));
    container.appendChild(mWrap);

    if (node.mode === 'exclude') {
        const exWrap = createFieldWrap('Field yang Dikecualikan', 'Pisahkan nama field dengan koma, misal: temp_tmp, debug_val');
        exWrap.appendChild(createDrawerTextInput(node, 'exclude_fields', 'temp_tmp'));
        container.appendChild(exWrap);
    }
}

/** Build a labeled field container for the Config drawer. */
function createFieldWrap(labelText, helpText = '') {
    const wrap = document.createElement('div');
    wrap.className = 'n8n-field';
    const lbl = document.createElement('label');
    lbl.className = 'n8n-field__label';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    if (helpText) {
        const help = document.createElement('div');
        help.className = 'n8n-field__help';
        help.textContent = helpText;
        wrap.appendChild(help);
    }
    return wrap;
}

/** Create a text input in the Config drawer synchronized to a node property. */
function createDrawerTextInput(node, prop, placeholder, refreshOnToggleEmpty = false) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'flow-input';
    input.placeholder = placeholder || '';
    input.value = node[prop] !== undefined && node[prop] !== null ? String(node[prop]) : '';
    input.addEventListener('input', () => {
        const hadValue = Boolean(String(node[prop] || '').trim());
        node[prop] = input.value;
        saveState();
        renderNodesLayer();
        if (refreshOnToggleEmpty && hadValue !== Boolean(input.value.trim())) {
            openNodeDrawer(node.id);
        }
    });
    return input;
}

/** Create a select control in the Config drawer synchronized to a node property. */
function createDrawerSelect(node, prop, options, rerenderDrawer = false) {
    const select = document.createElement('select');
    select.className = 'flow-input';
    options.forEach(item => {
        const opt = document.createElement('option');
        if (typeof item === 'object') {
            opt.value = item.value;
            opt.textContent = item.label;
            opt.selected = node[prop] === item.value;
        } else {
            opt.value = item;
            opt.textContent = item;
            opt.selected = node[prop] === item;
        }
        select.appendChild(opt);
    });
    select.addEventListener('change', () => {
        node[prop] = select.value;
        saveState();
        renderNodesLayer();
        if (rerenderDrawer) {
            openNodeDrawer(node.id);
        }
    });
    return select;
}
