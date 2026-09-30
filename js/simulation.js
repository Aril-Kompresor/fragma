/**
 * Simulation Engine Controller
 */

let simulationTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    
    if (btnStart) btnStart.onclick = startSimulation;
    if (btnStop) btnStop.onclick = stopSimulation;
});

function appendLog(message, isError = false) {
    const logBox = document.getElementById('simLog');
    if (!logBox) return;
    
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    
    if (isError) {
        div.style.color = 'var(--danger)';
    } else if (message.includes('[SYSTEM]')) {
        div.style.color = 'var(--accent)';
    }
    
    div.textContent = `[${time}] ${message}`;
    logBox.appendChild(div);
    
    // Auto scroll to bottom
    logBox.scrollTop = logBox.scrollHeight;
}

async function runSimulationTick() {
    try {
        const res = await fetch('/api/simulate.php', { method: 'POST' });
        const data = await res.json();
        
        if (data.success && data.data) {
            if (data.data.length === 0) {
                appendLog('No active entities found to simulate.');
            } else {
                data.data.forEach(sim => {
                    const payloadStr = JSON.stringify(sim.payload);
                    appendLog(`Pushed to Entity ID ${sim.entity_id}: ${payloadStr}`);
                });
            }
        } else {
            appendLog(`Error: ${data.error || 'Unknown error'}`, true);
        }
    } catch (e) {
        appendLog(`Fetch error: ${e.message}`, true);
    }
}

function startSimulation() {
    const intervalSecs = parseInt(document.getElementById('simInterval').value, 10) || 3;
    const intervalMs = Math.max(1000, intervalSecs * 1000);
    
    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('btnStop').style.display = 'flex';
    document.getElementById('simInterval').disabled = true;
    
    appendLog(`[SYSTEM] Starting simulation engine every ${intervalSecs} seconds...`);
    
    // Run once immediately
    runSimulationTick();
    
    simulationTimer = setInterval(runSimulationTick, intervalMs);
}

function stopSimulation() {
    if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
    }
    
    document.getElementById('btnStart').style.display = 'flex';
    document.getElementById('btnStop').style.display = 'none';
    document.getElementById('simInterval').disabled = false;
    
    appendLog('[SYSTEM] Engine stopped.');
}
