/**
 * Minimal Vanilla JS Drag and Drop / Resize functionality for widgets.
 * Snaps to a 20px grid.
 */

function makeDraggableAndResizable(el, dragHandle, onUpdate) {
    let isDragging = false;
    let isResizing = false;
    let startX, startY, startW, startH, startLeft, startTop;
    const SNAP = 20;

    // Create resize handle
    const resizer = document.createElement('div');
    resizer.className = 'widget-resizer';
    resizer.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15l-6 6M21 8l-13 13M21 1l-20 20"/></svg>';
    el.appendChild(resizer);

    // Styling for container
    el.style.position = 'absolute';

    dragHandle.style.cursor = 'grab';

    dragHandle.addEventListener('mousedown', (e) => {
        // Ignore dragging if clicking on interactive elements
        const ignoreTags = ['button', 'a', 'input', 'select', 'textarea'];
        const targetTag = e.target.tagName.toLowerCase();
        
        // Check if target or any parent is interactive, or if it's the resizer
        if (ignoreTags.includes(targetTag) || e.target.closest('button, a') || e.target.closest('.widget-resizer')) {
            return;
        }
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(el.style.left || 0, 10);
        startTop = parseInt(el.style.top || 0, 10);
        el.style.zIndex = 100;
        dragHandle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none'; // prevent text selection
    });

    resizer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = parseInt(el.style.width || el.offsetWidth, 10);
        startH = parseInt(el.style.height || el.offsetHeight, 10);
        el.style.zIndex = 100;
        document.body.style.userSelect = 'none';
    });

    const onMouseMove = (e) => {
        if (isDragging) {
            let dx = e.clientX - startX;
            let dy = e.clientY - startY;
            
            // Allow smooth dragging, snap on release
            el.style.left = Math.max(0, startLeft + dx) + 'px';
            el.style.top = Math.max(0, startTop + dy) + 'px';
        } else if (isResizing) {
            let dx = e.clientX - startX;
            let dy = e.clientY - startY;
            
            el.style.width = Math.max(200, startW + dx) + 'px';
            el.style.height = Math.max(120, startH + dy) + 'px';
            
            // Resize charts
            window.dispatchEvent(new Event('resize'));
        }
    };

    const onMouseUp = (e) => {
        if (isDragging || isResizing) {
            // Snap to grid
            let left = parseInt(el.style.left || 0, 10);
            let top = parseInt(el.style.top || 0, 10);
            let w = parseInt(el.style.width || el.offsetWidth, 10);
            let h = parseInt(el.style.height || el.offsetHeight, 10);

            left = Math.round(left / SNAP) * SNAP;
            top = Math.round(top / SNAP) * SNAP;
            w = Math.round(w / SNAP) * SNAP;
            h = Math.round(h / SNAP) * SNAP;

            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.style.width = w + 'px';
            el.style.height = h + 'px';
            
            el.style.zIndex = '';
            dragHandle.style.cursor = 'grab';
            document.body.style.userSelect = '';

            if (onUpdate) {
                onUpdate({ x: left, y: top, w: w, h: h });
            }

            if (isResizing) {
                window.dispatchEvent(new Event('resize'));
            }

            isDragging = false;
            isResizing = false;
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}
