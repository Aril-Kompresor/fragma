/**
 * Gauge widget renderer using Chart.js Doughnut for current value visualization.
 */

const activeGaugeInstances = new Map();

function destroyGaugeInstance(widgetId) {
    if (activeGaugeInstances.has(widgetId)) {
        const chart = activeGaugeInstances.get(widgetId);
        chart.destroy();
        activeGaugeInstances.delete(widgetId);
    }
}

function renderGauge(container, dataPoints, config, widgetId, onRemove) {
    destroyGaugeInstance(widgetId);
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'chart-card';
    card.dataset.widgetId = widgetId;
    
    // Header
    const header = document.createElement('div');
    header.className = 'chart-card__header';

    const title = document.createElement('span');
    title.className = 'chart-card__title';
    title.textContent = config.label || `${config.field} Gauge`;
    header.appendChild(title);

    if (typeof onRemove === 'function') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'widget-remove-btn';
        removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        removeBtn.title = 'Remove Widget';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            destroyGaugeInstance(widgetId);
            onRemove(widgetId);
        });
        header.appendChild(removeBtn);
    }
    card.appendChild(header);

    // Chart container
    const chartWrap = document.createElement('div');
    chartWrap.className = 'chart-container';
    chartWrap.style.position = 'relative';
    
    // Center text for gauge
    const centerText = document.createElement('div');
    centerText.style.position = 'absolute';
    centerText.style.bottom = '10%';
    centerText.style.left = '50%';
    centerText.style.transform = 'translateX(-50%)';
    centerText.style.textAlign = 'center';
    
    const valueEl = document.createElement('div');
    valueEl.style.fontSize = '2.5rem';
    valueEl.style.fontWeight = '700';
    valueEl.style.color = 'var(--text-primary)';
    valueEl.style.lineHeight = '1';
    
    const unitEl = document.createElement('div');
    unitEl.style.fontSize = '0.9rem';
    unitEl.style.color = 'var(--text-secondary)';
    
    centerText.appendChild(valueEl);
    centerText.appendChild(unitEl);
    
    const canvas = document.createElement('canvas');
    canvas.id = `gauge-canvas-${widgetId}`;
    
    chartWrap.appendChild(canvas);
    chartWrap.appendChild(centerText);
    card.appendChild(chartWrap);
    container.appendChild(card);

    // Parse Data
    let latestValue = 0;
    if (Array.isArray(dataPoints) && dataPoints.length > 0) {
        // dataPoints is newest first
        for (const pt of dataPoints) {
            if (pt.payload && pt.payload[config.field] !== undefined && pt.payload[config.field] !== null) {
                latestValue = Number(pt.payload[config.field]);
                break;
            }
        }
    }

    const min = parseFloat(config.min) || 0;
    const max = parseFloat(config.max) || 100;
    const clampedValue = Math.min(Math.max(latestValue, min), max);
    
    const strokeColor = config.color || '#4ecdc4';
    
    valueEl.textContent = latestValue;
    unitEl.textContent = config.unit || '';

    const chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Value', 'Remaining'],
            datasets: [{
                data: [clampedValue - min, max - clampedValue],
                backgroundColor: [strokeColor, 'rgba(30, 30, 46, 0.5)'],
                borderWidth: 0,
                cutout: '80%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,
            circumference: 180,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            animation: { duration: 400 }
        }
    });

    activeGaugeInstances.set(widgetId, chart);

    container.widgetUpdate = function(newData) {
        const currentChart = activeGaugeInstances.get(widgetId);
        if (!currentChart) return;
        
        let newLatest = 0;
        let found = false;
        if (Array.isArray(newData) && newData.length > 0) {
            for (const pt of newData) {
                if (pt.payload && pt.payload[config.field] !== undefined && pt.payload[config.field] !== null) {
                    newLatest = Number(pt.payload[config.field]);
                    found = true;
                    break;
                }
            }
        }
        
        if (found) {
            const cVal = Math.min(Math.max(newLatest, min), max);
            currentChart.data.datasets[0].data = [cVal - min, max - cVal];
            valueEl.textContent = newLatest;
            currentChart.update('none');
        }
    };
}
