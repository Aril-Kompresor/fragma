/**
 * Value Card widget renderer with variant support.
 * Variants: 'alarm' (danger-themed), 'entity' (accent-themed), default (config.color).
 */

const VALUE_CARD_VARIANTS = {
    alarm: {
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e74c6f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
        accentColor: '#e74c6f',
        bgGradient: 'linear-gradient(145deg, rgba(231,76,111,0.08), transparent)',
        borderAccent: 'rgba(231,76,111,0.3)'
    },
    entity: {
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ecdc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
        accentColor: '#4ecdc4',
        bgGradient: 'linear-gradient(145deg, rgba(78,205,196,0.08), transparent)',
        borderAccent: 'rgba(78,205,196,0.3)'
    }
};

/** Format a numeric value for display. */
function formatCardValue(val) {
    if (typeof val === 'number') {
        return Number.isInteger(val) ? String(val) : val.toFixed(2);
    }
    return String(val);
}

/** Render a Value Card widget into the specified container element. */
function renderValueCard(container, dataPoints, config, widgetId, onRemove) {
    container.innerHTML = '';

    const variant = VALUE_CARD_VARIANTS[config.variant] || null;
    const accentColor = variant ? variant.accentColor : (config.color || 'var(--accent)');

    const card = document.createElement('div');
    card.className = 'value-card';
    card.dataset.widgetId = widgetId;

    if (variant) {
        card.style.background = variant.bgGradient;
        card.style.borderColor = variant.borderAccent;
    }

    const header = document.createElement('div');
    header.className = 'value-card__header';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:10px;';

    if (variant && variant.icon) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'value-card__icon';
        iconWrap.innerHTML = variant.icon;
        headerLeft.appendChild(iconWrap);
    }

    const labelGroup = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'value-card__label';
    label.textContent = config.label || config.field || 'Metric';

    const sublabel = document.createElement('div');
    sublabel.className = 'value-card__sublabel';
    sublabel.textContent = variant ? (config.variant === 'alarm' ? 'Active Alerts' : 'Connected') : '';
    sublabel.style.cssText = 'font-size:0.65rem;color:var(--text-muted);margin-top:2px;';

    labelGroup.appendChild(label);
    if (variant) labelGroup.appendChild(sublabel);
    headerLeft.appendChild(labelGroup);
    header.appendChild(headerLeft);

    if (typeof onRemove === 'function') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'widget-remove-btn';
        removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        removeBtn.title = 'Remove Widget';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onRemove(widgetId);
        });
        header.appendChild(removeBtn);
    }

    const body = document.createElement('div');
    body.className = 'value-card__body';

    let latestVal = '--';
    let latestTime = null;

    if (Array.isArray(dataPoints) && dataPoints.length > 0) {
        for (const pt of dataPoints) {
            if (pt.payload && pt.payload[config.field] !== undefined && pt.payload[config.field] !== null) {
                latestVal = pt.payload[config.field];
                latestTime = pt.recorded_at;
                break;
            }
        }
    }

    const valEl = document.createElement('span');
    valEl.className = 'value-card__value';
    valEl.textContent = formatCardValue(latestVal);
    valEl.style.color = accentColor;

    body.appendChild(valEl);

    if (config.unit) {
        const unitEl = document.createElement('span');
        unitEl.className = 'value-card__unit';
        unitEl.textContent = config.unit;
        body.appendChild(unitEl);
    }

    const footer = document.createElement('div');
    footer.className = 'value-card__footer';
    footer.textContent = latestTime ? `Updated ${formatRelativeTime(latestTime)}` : 'No data recorded yet';

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    container.appendChild(card);

    container.widgetUpdate = function(newData) {
        if (!newData || newData.length === 0) return;

        const currentVal = newData[0].payload[config.field];
        if (currentVal !== undefined && currentVal !== null) {
            valEl.textContent = formatCardValue(currentVal);
            footer.textContent = `Updated ${formatRelativeTime(newData[0].recorded_at)}`;
        }
    };
}
