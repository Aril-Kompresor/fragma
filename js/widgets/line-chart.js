/**
 * Line Chart widget renderer using Chart.js for time-series visualization.
 */

const activeChartInstances = new Map();

/**
 * Destroy any existing Chart.js instance associated with the specified widget ID.
 */
function destroyChartInstance(widgetId) {
    if (activeChartInstances.has(widgetId)) {
        const chart = activeChartInstances.get(widgetId);
        chart.destroy();
        activeChartInstances.delete(widgetId);
    }
}

/**
 * Render a Line Chart widget into the specified container element.
 */
function renderLineChart(container, dataPoints, config, widgetId, onRemove) {
    destroyChartInstance(widgetId);
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'chart-card';
    card.dataset.widgetId = widgetId;

    const header = document.createElement('div');
    header.className = 'chart-card__header';

    const title = document.createElement('span');
    title.className = 'chart-card__title';
    title.textContent = config.label || `${config.field} History`;

    header.appendChild(title);

    if (typeof onRemove === 'function') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'widget-remove-btn';
        removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        removeBtn.title = 'Remove Widget';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            destroyChartInstance(widgetId);
            onRemove(widgetId);
        });
        header.appendChild(removeBtn);
    }

    card.appendChild(header);

    const chartWrap = document.createElement('div');
    chartWrap.className = 'chart-container';

    const canvas = document.createElement('canvas');
    canvas.id = `chart-canvas-${widgetId}`;
    chartWrap.appendChild(canvas);
    card.appendChild(chartWrap);

    container.appendChild(card);

    const chronologicalData = Array.isArray(dataPoints) ? [...dataPoints].reverse() : [];
    const labels = [];
    const values = [];

    for (const pt of chronologicalData) {
        if (pt.payload && pt.payload[config.field] !== undefined && pt.payload[config.field] !== null) {
            const timeLabel = new Date(pt.recorded_at.replace(' ', 'T')).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            labels.push(timeLabel);
            values.push(pt.payload[config.field]);
        }
    }

    const strokeColor = config.color || '#4ecdc4';
    const fillColor = strokeColor.startsWith('#') ? strokeColor + '20' : 'rgba(78, 205, 196, 0.15)';

    const chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['No data'],
            datasets: [{
                label: (config.label || config.field) + (config.unit ? ` (${config.unit})` : ''),
                data: values.length > 0 ? values : [0],
                borderColor: strokeColor,
                backgroundColor: fillColor,
                borderWidth: 2,
                tension: 0.35,
                pointRadius: values.length > 30 ? 0 : 3,
                pointHoverRadius: 6,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 400
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#12121a',
                    titleColor: '#e0e0e8',
                    bodyColor: '#4ecdc4',
                    borderColor: '#1e1e2e',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(30, 30, 46, 0.5)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8888a0',
                        font: { family: "'Inter', sans-serif", size: 10 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(30, 30, 46, 0.8)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8888a0',
                        font: { family: "'Inter', sans-serif", size: 10 },
                    }
                }
            }
        }
    });

    activeChartInstances.set(widgetId, chart);
    
    // Support in-place updates without recreation
    container.widgetUpdate = function(newData) {
        const currentChart = activeChartInstances.get(widgetId);
        if (!currentChart) return;
        
        const chrono = Array.isArray(newData) ? [...newData].reverse() : [];
        const newLabels = [];
        const newValues = [];

        for (const pt of chrono) {
            if (pt.payload && pt.payload[config.field] !== undefined && pt.payload[config.field] !== null) {
                const timeLabel = new Date(pt.recorded_at.replace(' ', 'T')).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
                newLabels.push(timeLabel);
                newValues.push(pt.payload[config.field]);
            }
        }

        currentChart.data.labels = newLabels.length > 0 ? newLabels : ['No data'];
        currentChart.data.datasets[0].data = newValues.length > 0 ? newValues : [0];
        
        // Hide points if too many
        currentChart.data.datasets[0].pointRadius = newValues.length > 30 ? 0 : 3;
        
        // Update WITHOUT animation so it feels like a live dash
        currentChart.update('none');
    };
}
