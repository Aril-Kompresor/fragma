let simulationTimer = null;
let currentSimProjectId = 0;
let currentSimProjectUuid = '';
let currentSimProjectName = '';

document.addEventListener('DOMContentLoaded', async () => {
    if (window.FragmaAuth && typeof window.FragmaAuth.requireActiveProject === 'function') {
        const project = await window.FragmaAuth.requireActiveProject();
        if (!project) return;
        currentSimProjectId = project.id;
        currentSimProjectUuid = project.uuid;
        currentSimProjectName = project.name || 'Project';
        const subEl = document.getElementById('simProjectSubtitle');
        const crumbEl = document.getElementById('breadcrumbProjectName');
        if (subEl) subEl.textContent = `Kirim data simulasi sensor secara otomatis ke semua perangkat di project "${currentSimProjectName}".`;
        if (crumbEl) crumbEl.textContent = currentSimProjectName;
    }

    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');

    if (btnStart) btnStart.onclick = startSimulation;
    if (btnStop) btnStop.onclick = stopSimulation;
});

/** Append a timestamped status line to the simulation activity log. */
function appendLog(message, isError = false) {
    const logBox = document.getElementById('simLog');
    if (!logBox) return;

    const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const div = document.createElement('div');

    if (isError) {
        div.style.color = 'var(--danger)';
    } else if (message.includes('[SISTEM]')) {
        div.style.color = 'var(--accent)';
    }

    div.textContent = `[${time}] ${message}`;
    logBox.appendChild(div);

    logBox.scrollTop = logBox.scrollHeight;
}

/** Execute one simulation tick against all devices in the active project. */
async function runSimulationTick() {
    if (!currentSimProjectUuid) return;
    try {
        const res = await fetch(`/api/simulate.php?project_uuid=${encodeURIComponent(currentSimProjectUuid)}`, {
            method: 'POST',
            credentials: 'same-origin'
        });
        const data = await res.json();

        if (data.success && data.data) {
            if (data.data.length === 0) {
                appendLog(`Belum ada perangkat di project "${currentSimProjectName}" untuk disimulasikan.`);
            } else {
                data.data.forEach(sim => {
                    const payloadStr = JSON.stringify(sim.payload);
                    const devName = sim.entity_name ? `${sim.entity_name} (#${sim.entity_id})` : `Perangkat #${sim.entity_id}`;
                    appendLog(`Terkirim ke ${devName}: ${payloadStr}`);
                });
            }
        } else {
            appendLog(`Galat: ${data.error || 'Terjadi kesalahan'}`, true);
        }
    } catch (e) {
        appendLog(`Gagal terhubung: ${e.message}`, true);
    }
}

/** Start the periodic simulation timer. */
function startSimulation() {
    const intervalSecs = parseInt(document.getElementById('simInterval').value, 10) || 3;
    const intervalMs = Math.max(1000, intervalSecs * 1000);

    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('btnStop').style.display = 'flex';
    document.getElementById('simInterval').disabled = true;

    appendLog(`[SISTEM] Memulai simulasi setiap ${intervalSecs} detik...`);

    runSimulationTick();

    simulationTimer = setInterval(runSimulationTick, intervalMs);
}

/** Stop the periodic simulation timer. */
function stopSimulation() {
    if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
    }

    document.getElementById('btnStart').style.display = 'flex';
    document.getElementById('btnStop').style.display = 'none';
    document.getElementById('simInterval').disabled = false;

    appendLog('[SISTEM] Simulasi dihentikan.');
}
