/** Check if a candidate rectangle collides with any sibling draggable widget. */
function checkWidgetCollision(rect, targetEl) {
    if (!targetEl || !targetEl.parentElement) {
        return false;
    }

    const siblings = Array.from(targetEl.parentElement.children).filter((child) => {
        return child !== targetEl && child.classList.contains('draggable-widget');
    });

    for (const sib of siblings) {
        const sx = parseInt(sib.style.left || sib.offsetLeft || 0, 10);
        const sy = parseInt(sib.style.top || sib.offsetTop || 0, 10);
        const sw = parseInt(sib.style.width || sib.offsetWidth || 0, 10);
        const sh = parseInt(sib.style.height || sib.offsetHeight || 0, 10);

        const overlapX = rect.x < sx + sw && rect.x + rect.w > sx;
        const overlapY = rect.y < sy + sh && rect.y + rect.h > sy;

        if (overlapX && overlapY) {
            return true;
        }
    }

    return false;
}

/** Attach drag-and-drop and resize behaviors to a widget with collision avoidance. */
function makeDraggableAndResizable(el, dragHandle, onUpdate) {
    let isDragging = false;
    let isResizing = false;
    let startX;
    let startY;
    let startW;
    let startH;
    let startLeft;
    let startTop;
    const SNAP = 20;

    const resizer = document.createElement('div');
    resizer.className = 'widget-resizer';
    resizer.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15l-6 6M21 8l-13 13M21 1l-20 20"/></svg>';
    el.appendChild(resizer);

    el.style.position = 'absolute';
    dragHandle.style.cursor = 'grab';

    dragHandle.addEventListener('mousedown', (e) => {
        const ignoreTags = ['button', 'a', 'input', 'select', 'textarea'];
        const targetTag = e.target.tagName.toLowerCase();

        if (ignoreTags.includes(targetTag) || e.target.closest('button, a') || e.target.closest('.widget-resizer')) {
            return;
        }

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(el.style.left || 0, 10);
        startTop = parseInt(el.style.top || 0, 10);
        startW = parseInt(el.style.width || el.offsetWidth, 10);
        startH = parseInt(el.style.height || el.offsetHeight, 10);
        el.style.zIndex = 100;
        dragHandle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
    });

    resizer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(el.style.left || 0, 10);
        startTop = parseInt(el.style.top || 0, 10);
        startW = parseInt(el.style.width || el.offsetWidth, 10);
        startH = parseInt(el.style.height || el.offsetHeight, 10);
        el.style.zIndex = 100;
        document.body.style.userSelect = 'none';
    });

    const onMouseMove = (e) => {
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const nextLeft = Math.max(0, startLeft + dx);
            const nextTop = Math.max(0, startTop + dy);

            el.style.left = nextLeft + 'px';
            el.style.top = nextTop + 'px';

            const snapLeft = Math.round(nextLeft / SNAP) * SNAP;
            const snapTop = Math.round(nextTop / SNAP) * SNAP;
            const isColliding = checkWidgetCollision({ x: snapLeft, y: snapTop, w: startW, h: startH }, el);

            if (isColliding) {
                el.classList.add('draggable-widget--colliding');
            } else {
                el.classList.remove('draggable-widget--colliding');
            }
        } else if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const nextW = Math.max(200, startW + dx);
            const nextH = Math.max(120, startH + dy);

            el.style.width = nextW + 'px';
            el.style.height = nextH + 'px';

            const snapW = Math.round(nextW / SNAP) * SNAP;
            const snapH = Math.round(nextH / SNAP) * SNAP;
            const isColliding = checkWidgetCollision({ x: startLeft, y: startTop, w: snapW, h: snapH }, el);

            if (isColliding) {
                el.classList.add('draggable-widget--colliding');
            } else {
                el.classList.remove('draggable-widget--colliding');
            }

            window.dispatchEvent(new Event('resize'));
        }
    };

    const onMouseUp = () => {
        if (isDragging || isResizing) {
            el.classList.remove('draggable-widget--colliding');

            let left = parseInt(el.style.left || 0, 10);
            let top = parseInt(el.style.top || 0, 10);
            let w = parseInt(el.style.width || el.offsetWidth, 10);
            let h = parseInt(el.style.height || el.offsetHeight, 10);

            left = Math.round(left / SNAP) * SNAP;
            top = Math.round(top / SNAP) * SNAP;
            w = Math.round(w / SNAP) * SNAP;
            h = Math.round(h / SNAP) * SNAP;

            const isColliding = checkWidgetCollision({ x: left, y: top, w, h }, el);

            if (isColliding) {
                left = startLeft;
                top = startTop;
                w = startW;
                h = startH;

                el.style.left = left + 'px';
                el.style.top = top + 'px';
                el.style.width = w + 'px';
                el.style.height = h + 'px';

                el.classList.add('widget-collision-rejected');
                setTimeout(() => {
                    el.classList.remove('widget-collision-rejected');
                }, 400);
            } else {
                el.style.left = left + 'px';
                el.style.top = top + 'px';
                el.style.width = w + 'px';
                el.style.height = h + 'px';

                if (onUpdate) {
                    onUpdate({ x: left, y: top, w, h });
                }
            }

            el.style.zIndex = '';
            dragHandle.style.cursor = 'grab';
            document.body.style.userSelect = '';

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
