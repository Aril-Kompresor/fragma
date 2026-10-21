/**
 * Cloud Gateway & Telemetry Bridge module.
 * Integrates live Open-Meteo REST API and mock Edge Gateway with Fetch, JSON, and async/await.
 */

let activeSource = 'open-meteo';
let activeScenario = 'normal';
let lastResponseData = null;
let rawInspectorExpanded = false;

document.addEventListener('DOMContentLoaded', () => {
    initBridge();
});

/**
 * Initialize bridge listeners, system clock, and trigger initial telemetry fetch.
 */
function initBridge() {
    bindSourceControls();
    bindScenarioControls();
    bindActionButtons();
    bindModalControls();
    startSystemClock();
    executeFetch();
}

/**
 * Switch the active data source, sync the toggle buttons and hint text.
 */
function setSource(source) {
    activeSource = source;
    const isLive = source === 'open-meteo';

    const btnOpenMeteo = document.getElementById('sourceOpenMeteo');
    const btnMock = document.getElementById('sourceMockGateway');
    if (btnOpenMeteo) btnOpenMeteo.classList.toggle('bridge-source-btn--active', isLive);
    if (btnMock) btnMock.classList.toggle('bridge-source-btn--active', !isLive);

    const hint = document.getElementById('sourceHint');
    if (hint) {
        hint.textContent = isLive
            ? 'Data cuaca terbaru dari Open-Meteo untuk Jakarta.'
            : 'Data sensor contoh dari server Fragma. Tidak perlu perangkat asli.';
    }
}

/**
 * Bind data source switch buttons (Open-Meteo vs sample gateway).
 */
function bindSourceControls() {
    const btnOpenMeteo = document.getElementById('sourceOpenMeteo');
    const btnMock = document.getElementById('sourceMockGateway');

    if (btnOpenMeteo && btnMock) {
        btnOpenMeteo.addEventListener('click', () => {
            if (activeSource === 'open-meteo') return;
            setSource('open-meteo');
            activeScenario = 'normal';
            updateScenarioButtonsUi();
            executeFetch();
        });

        btnMock.addEventListener('click', () => {
            if (activeSource === 'mock-gateway') return;
            setSource('mock-gateway');
            activeScenario = 'normal';
            updateScenarioButtonsUi();
            executeFetch();
        });
    }
}

/**
 * Bind quick scenario test buttons for evaluators.
 */
function bindScenarioControls() {
    const buttons = [
        { id: 'testSuccessBtn', scenario: 'normal' },
        { id: 'testEmptyBtn', scenario: 'empty' },
        { id: 'testErrorBtn', scenario: 'error' },
        { id: 'testDelayBtn', scenario: 'delay' },
        { id: 'testOfflineBtn', scenario: 'offline' }
    ];

    buttons.forEach(item => {
        const btn = document.getElementById(item.id);
        if (btn) {
            btn.addEventListener('click', () => {
                activeScenario = item.scenario;
                if (item.scenario === 'empty' || item.scenario === 'error') {
                    if (activeSource !== 'mock-gateway') {
                        setSource('mock-gateway');
                    }
                }
                updateScenarioButtonsUi();
                executeFetch();
            });
        }
    });
}

/**
 * Update UI state of scenario tester buttons to reflect active selection.
 */
function updateScenarioButtonsUi() {
    const map = {
        'normal': 'testSuccessBtn',
        'empty': 'testEmptyBtn',
        'error': 'testErrorBtn',
        'delay': 'testDelayBtn',
        'offline': 'testOfflineBtn'
    };

    ['testSuccessBtn', 'testEmptyBtn', 'testErrorBtn', 'testDelayBtn', 'testOfflineBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('tester-btn--active');
    });

    const activeId = map[activeScenario];
    if (activeId) {
        const activeEl = document.getElementById(activeId);
        if (activeEl) activeEl.classList.add('tester-btn--active');
    }
}

/**
 * Bind synchronization, payload copy, and inspector accordion buttons.
 */
function bindActionButtons() {
    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.addEventListener('click', () => {
            executeFetch();
        });
    }

    const rawSummary = document.getElementById('rawSummaryBtn');
    if (rawSummary) {
        rawSummary.addEventListener('click', (e) => {
            if (e.target.closest('#btnCopyJson')) return;
            toggleRawInspector();
        });
    }

    const btnCopy = document.getElementById('btnCopyJson');
    if (btnCopy) {
        btnCopy.addEventListener('click', (e) => {
            e.stopPropagation();
            copyJsonPayload();
        });
    }

    const emptyReset = document.getElementById('emptyResetBtn');
    if (emptyReset) {
        emptyReset.addEventListener('click', () => {
            activeScenario = 'normal';
            updateScenarioButtonsUi();
            executeFetch();
        });
    }

    const emptySwitch = document.getElementById('emptySwitchOpenMeteo');
    if (emptySwitch) {
        emptySwitch.addEventListener('click', () => {
            setSource('open-meteo');
            activeScenario = 'normal';
            updateScenarioButtonsUi();
            executeFetch();
        });
    }

    const errorRetry = document.getElementById('errorRetryBtn');
    if (errorRetry) {
        errorRetry.addEventListener('click', () => {
            executeFetch();
        });
    }

    const errorReset = document.getElementById('errorResetNormalBtn');
    if (errorReset) {
        errorReset.addEventListener('click', () => {
            setSource('mock-gateway');
            activeScenario = 'normal';
            updateScenarioButtonsUi();
            executeFetch();
        });
    }

    const errorFallback = document.getElementById('errorFallbackOpenMeteo');
    if (errorFallback) {
        errorFallback.addEventListener('click', () => {
            setSource('open-meteo');
            activeScenario = 'normal';
            updateScenarioButtonsUi();
            executeFetch();
        });
    }
}

/**
 * Bind modal dialog opening, closing, and keyboard trap escape handlers.
 */
function bindModalControls() {
    const btnOpen = document.getElementById('btnDocModal');
    const modal = document.getElementById('docModal');
    const btnCloseHeader = document.getElementById('closeDocModalBtn');
    const btnCloseFooter = document.getElementById('closeDocModalFooterBtn');

    if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex';
        });
    }

    const hideModal = () => {
        if (modal) modal.style.display = 'none';
    };

    if (btnCloseHeader) btnCloseHeader.addEventListener('click', hideModal);
    if (btnCloseFooter) btnCloseFooter.addEventListener('click', hideModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            hideModal();
        }
    });
}

/**
 * Update system clock element every 1000ms.
 */
function startSystemClock() {
    const clockEl = document.getElementById('systemClock');
    const update = () => {
        if (!clockEl) return;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour12: false });
        clockEl.textContent = `${timeStr} WIB`;
    };
    update();
    setInterval(update, 1000);
}

/**
 * Build target URL based on active source and scenario selection.
 */
function buildTargetUrl() {
    if (activeScenario === 'offline') {
        return 'https://unreachable-invalid-domain-fragma-iot.test/api/telemetry';
    }

    if (activeSource === 'open-meteo') {
        const base = 'https://api.open-meteo.com/v1/forecast';
        const params = new URLSearchParams({
            latitude: '-6.2088',
            longitude: '106.8456',
            current: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code',
            timezone: 'Asia/Jakarta'
        });
        return `${base}?${params.toString()}`;
    }

    const mockBase = '/api/gateway.php';
    const params = new URLSearchParams();
    if (activeScenario !== 'normal') {
        params.append('scenario', activeScenario);
    }
    const query = params.toString();
    return query ? `${mockBase}?${query}` : mockBase;
}

/**
 * Fetch telemetry data using Fetch API, JSON parsing, and async/await.
 */
async function executeFetch() {
    const targetUrl = buildTargetUrl();
    const endpointLink = document.getElementById('activeEndpointLink');
    if (endpointLink) {
        endpointLink.textContent = targetUrl;
        endpointLink.href = targetUrl;
    }

    renderLoadingState();

    const startTime = performance.now();

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const latencyMs = Math.round(performance.now() - startTime);

        let json;
        try {
            json = await response.json();
        } catch (parseErr) {
            throw new Error(`Respons server bukan JSON yang valid (HTTP ${response.status})`);
        }

        lastResponseData = json;
        updateRawPayloadViewer(json);

        if (!response.ok || json.success === false) {
            const errObj = new Error(json.message || `Permintaan gagal dengan status HTTP ${response.status}`);
            errObj.status = response.status;
            errObj.payload = json;
            throw errObj;
        }

        if (json.status === 'empty' || (Array.isArray(json.nodes) && json.nodes.length === 0)) {
            renderEmptyState(json, latencyMs, response.status);
            return;
        }

        renderSuccessState(json, latencyMs, response.status);

    } catch (err) {
        const latencyMs = Math.round(performance.now() - startTime);
        lastResponseData = err.payload || { error: err.message, status: err.status || 0 };
        updateRawPayloadViewer(lastResponseData);
        renderErrorState(err, latencyMs);
    }
}

/**
 * Display loading state skeleton and disable synchronization controls.
 */
function renderLoadingState() {
    document.getElementById('viewLoading').style.display = 'block';
    document.getElementById('viewSuccess').style.display = 'none';
    document.getElementById('viewEmpty').style.display = 'none';
    document.getElementById('viewError').style.display = 'none';

    const chip = document.getElementById('httpStatusChip');
    if (chip) {
        chip.className = 'status-chip status-chip--loading';
        chip.textContent = 'Memuat...';
    }

    const latencyEl = document.getElementById('latencyVal');
    if (latencyEl) latencyEl.textContent = 'Menghitung...';

    const diagEl = document.getElementById('errorDiagnosticBlock');
    if (diagEl) diagEl.style.display = 'none';

    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.disabled = true;
        btnSync.style.opacity = '0.7';
        btnSync.textContent = 'Memuat...';
    }
}

/**
 * Render success state UI with telemetry cards and metrics.
 */
function renderSuccessState(data, latencyMs, httpStatus) {
    document.getElementById('viewLoading').style.display = 'none';
    document.getElementById('viewSuccess').style.display = 'block';
    document.getElementById('viewEmpty').style.display = 'none';
    document.getElementById('viewError').style.display = 'none';

    finalizeStatusMetrics(httpStatus, `${httpStatus} OK`, latencyMs, 'status-chip--200');

    if (activeSource === 'open-meteo') {
        renderOpenMeteoCards(data);
    } else {
        renderMockGatewayCards(data);
    }
}

/**
 * Build one telemetry card element using text nodes only.
 */
function buildTelemetryCard(label, value, unit, note) {
    const card = document.createElement('div');
    card.className = 'telemetry-card';

    const header = document.createElement('div');
    header.className = 'telemetry-card__header';
    const labelEl = document.createElement('span');
    labelEl.className = 'telemetry-card__label';
    labelEl.textContent = label;
    header.appendChild(labelEl);

    const main = document.createElement('div');
    main.className = 'telemetry-card__main';
    const valEl = document.createElement('span');
    valEl.className = 'telemetry-card__val';
    valEl.textContent = value;
    main.appendChild(valEl);
    if (unit) {
        const unitEl = document.createElement('span');
        unitEl.className = 'telemetry-card__unit';
        unitEl.textContent = unit;
        main.appendChild(unitEl);
    }

    card.appendChild(header);
    card.appendChild(main);

    if (note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'telemetry-card__note';
        noteEl.textContent = note;
        card.appendChild(noteEl);
    }

    return card;
}

/**
 * Render the four weather cards for the Open-Meteo source.
 */
function renderOpenMeteoCards(data) {
    const cur = data.current || {};
    const temp = cur.temperature_2m !== undefined ? cur.temperature_2m : '-';
    const humidity = cur.relative_humidity_2m !== undefined ? cur.relative_humidity_2m : '-';
    const wind = cur.wind_speed_10m !== undefined ? cur.wind_speed_10m : '-';
    const weatherCode = cur.weather_code !== undefined ? cur.weather_code : 1;

    const grid = document.getElementById('telemetryGrid');
    if (!grid) return;

    grid.replaceChildren(
        buildTelemetryCard('Suhu', temp, '°C', 'Udara luar di Jakarta'),
        buildTelemetryCard('Kelembaban', humidity, '%', ''),
        buildTelemetryCard('Angin', wind, 'km/jam', ''),
        buildTelemetryCard('Kondisi', getWmoWeatherDescription(weatherCode), '', '')
    );
}

/**
 * Render one card per sensor returned by the sample gateway.
 */
function renderMockGatewayCards(data) {
    const grid = document.getElementById('telemetryGrid');
    if (!grid) return;

    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const cards = nodes.map(node => buildTelemetryCard(
        String(node.name),
        String(node.value),
        String(node.unit || ''),
        String(node.status || '')
    ));
    grid.replaceChildren(...cards);
}

/**
 * Render empty state UI when no telemetry data nodes are returned.
 */
function renderEmptyState(data, latencyMs, httpStatus) {
    document.getElementById('viewLoading').style.display = 'none';
    document.getElementById('viewSuccess').style.display = 'none';
    document.getElementById('viewEmpty').style.display = 'block';
    document.getElementById('viewError').style.display = 'none';

    finalizeStatusMetrics(httpStatus, `${httpStatus} OK`, latencyMs, 'status-chip--200');

    const msgEl = document.getElementById('emptyMsgText');
    if (msgEl) {
        msgEl.textContent = 'Sumber terhubung, tetapi belum ada data yang bisa ditampilkan.';
    }
}

/**
 * Render error state UI when network or server request fails.
 */
function renderErrorState(err, latencyMs) {
    document.getElementById('viewLoading').style.display = 'none';
    document.getElementById('viewSuccess').style.display = 'none';
    document.getElementById('viewEmpty').style.display = 'none';
    document.getElementById('viewError').style.display = 'block';

    const statusCode = err.status || 0;
    const statusText = err.status ? `${err.status} Error` : 'Tidak ada koneksi';
    finalizeStatusMetrics(statusCode, statusText, latencyMs, 'status-chip--500');

    const titleEl = document.getElementById('errorTitle');
    if (titleEl) {
        titleEl.textContent = err.status ? 'Server gagal memberi data' : 'Tidak bisa terhubung';
    }

    const descEl = document.getElementById('errorDescription');
    if (descEl) {
        descEl.textContent = err.status
            ? 'Server menjawab dengan galat. Coba lagi, atau pindah ke sumber data lain.'
            : 'Periksa koneksi internet Anda, lalu coba lagi.';
    }

    const diagEl = document.getElementById('errorDiagnosticBlock');
    if (diagEl) {
        const payloadText = err.payload ? JSON.stringify(err.payload, null, 2) : `Error: ${err.message}`;
        diagEl.textContent = `ENDPOINT: ${buildTargetUrl()}\nTIMESTAMP: ${new Date().toISOString()}\n\n${payloadText}`;
        diagEl.style.display = 'block';
    }
}

/**
 * Finalize status chips, timer readings, and re-enable synchronization button.
 */
function finalizeStatusMetrics(statusCode, label, latencyMs, chipClass) {
    const chip = document.getElementById('httpStatusChip');
    if (chip) {
        chip.className = `status-chip ${chipClass}`;
        chip.textContent = label;
    }

    const latencyEl = document.getElementById('latencyVal');
    if (latencyEl) {
        latencyEl.textContent = `${latencyMs} ms`;
    }

    const syncEl = document.getElementById('lastSyncTime');
    if (syncEl) {
        const now = new Date();
        syncEl.textContent = `${now.toLocaleTimeString('id-ID', { hour12: false })} WIB`;
    }

    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.disabled = false;
        btnSync.style.opacity = '1';
        btnSync.textContent = 'Perbarui Data';
    }
}

/**
 * Update raw JSON payload viewer code block and size counter.
 */
function updateRawPayloadViewer(json) {
    const codeEl = document.getElementById('rawJsonContent');
    const sizeEl = document.getElementById('rawByteSize');
    if (!codeEl) return;

    const formatted = JSON.stringify(json, null, 2);
    codeEl.textContent = formatted;

    if (sizeEl) {
        const bytes = new Blob([formatted]).size;
        sizeEl.textContent = `(${bytes} bytes)`;
    }
}

/**
 * Toggle visibility of raw JSON payload accordion inspector.
 */
function toggleRawInspector() {
    rawInspectorExpanded = !rawInspectorExpanded;
    const body = document.getElementById('rawInspectorBody');
    const chevron = document.getElementById('rawChevron');

    if (body) {
        body.style.display = rawInspectorExpanded ? 'block' : 'none';
    }
    if (chevron) {
        chevron.innerHTML = rawInspectorExpanded ? '&#9652;' : '&#9662;';
    }
}

/**
 * Copy JSON payload text to clipboard and provide temporary feedback.
 */
function copyJsonPayload() {
    if (!lastResponseData) return;
    const text = JSON.stringify(lastResponseData, null, 2);
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btnCopyJson');
        if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Tersalin!';
            setTimeout(() => {
                btn.textContent = original;
            }, 1800);
        }
    });
}

/**
 * Map numerical WMO weather codes to human-readable Indonesian descriptions.
 */
function getWmoWeatherDescription(code) {
    const table = {
        0: 'Langit Cerah',
        1: 'Sebagian Besar Cerah',
        2: 'Berawan Sebagian',
        3: 'Mendung Tebal',
        45: 'Kabut Berembun',
        48: 'Kabut Tebal Mengendap',
        51: 'Gerimis Ringan',
        53: 'Gerimis Sedang',
        55: 'Gerimis Lebat',
        61: 'Hujan Ringan',
        63: 'Hujan Sedang',
        65: 'Hujan Deras',
        71: 'Salju Ringan',
        80: 'Hujan Rintik Lokal',
        81: 'Hujan Lokal Sedang',
        82: 'Hujan Lokal Lebat',
        95: 'Badai Petir Ringan'
    };
    return table[code] || 'Kondisi Normal';
}
