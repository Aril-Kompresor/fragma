/**
 * GitBook-style interactive documentation controller for Fragma IoT.
 * Handles code copying, live search filtering, TOC scrollspy, and interactive API testing.
 */

document.addEventListener('DOMContentLoaded', () => {
    initDocs();
});

/**
 * Initialize all documentation components and event listeners.
 */
function initDocs() {
    setupCodeCopyButtons();
    setupSearchFilter();
    setupScrollSpy();
    setupMobileDrawer();
    setupApiPlayground();
}

/**
 * Enable one-click clipboard copying on all code blocks.
 */
function setupCodeCopyButtons() {
    const copyButtons = document.querySelectorAll('.docs-code__copy');
    copyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const container = btn.closest('.docs-code');
            const pre = container.querySelector('pre');
            if (!pre) return;

            navigator.clipboard.writeText(pre.innerText).then(() => {
                const origText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.color = 'var(--accent)';
                btn.style.borderColor = 'var(--accent)';
                setTimeout(() => {
                    btn.textContent = origText;
                    btn.style.color = '';
                    btn.style.borderColor = '';
                }, 1800);
            });
        });
    });
}

/**
 * Enable live instant search filtering across docs navigation links and sections.
 */
function setupSearchFilter() {
    const searchInput = document.getElementById('docsSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        const navLinks = document.querySelectorAll('.docs-nav__link');

        navLinks.forEach(link => {
            const text = link.textContent.toLowerCase();
            const parentLi = link.parentElement;
            if (text.includes(query) || query === '') {
                parentLi.style.display = '';
            } else {
                parentLi.style.display = 'none';
            }
        });

        const groups = document.querySelectorAll('.docs-nav__group');
        groups.forEach(group => {
            const visibleLinks = group.querySelectorAll('li:not([style*="display: none"])');
            if (visibleLinks.length === 0 && query !== '') {
                group.style.display = 'none';
            } else {
                group.style.display = '';
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

/**
 * Track user scroll position and highlight active headings in TOC and sidebar.
 */
function setupScrollSpy() {
    const sections = document.querySelectorAll('.docs-section');
    const tocLinks = document.querySelectorAll('.docs-toc__link');
    const navLinks = document.querySelectorAll('.docs-nav__link');

    const onScroll = () => {
        let currentId = '';
        const scrollPos = window.scrollY + 100;

        sections.forEach(sec => {
            const top = sec.offsetTop;
            const height = sec.offsetHeight;
            if (scrollPos >= top && scrollPos < top + height) {
                currentId = sec.getAttribute('id');
            }
        });

        if (currentId) {
            tocLinks.forEach(link => {
                link.classList.remove('docs-toc__link--active');
                if (link.getAttribute('href') === `#${currentId}`) {
                    link.classList.add('docs-toc__link--active');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('docs-nav__link--active');
                if (link.getAttribute('href') === `#${currentId}`) {
                    link.classList.add('docs-nav__link--active');
                }
            });
        }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
}

/**
 * Handle mobile drawer menu opening, closing, and backdrop dismissal.
 */
function setupMobileDrawer() {
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('docsNav');

    if (!btn || !nav) return;

    btn.addEventListener('click', () => {
        nav.classList.toggle('docs-nav--open');
    });

    document.addEventListener('click', (e) => {
        if (!nav.contains(e.target) && !btn.contains(e.target) && nav.classList.contains('docs-nav--open')) {
            nav.classList.remove('docs-nav--open');
        }
    });
}

/**
 * Bind interactive API playground sandbox buttons for direct endpoint testing.
 */
function setupApiPlayground() {
    const testButtons = document.querySelectorAll('.btn-test-api');
    testButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const endpoint = btn.getAttribute('data-endpoint');
            const targetOutputId = btn.getAttribute('data-output');
            const outputEl = document.getElementById(targetOutputId);
            if (!endpoint || !outputEl) return;

            btn.disabled = true;
            btn.textContent = 'Testing...';
            outputEl.textContent = 'Executing fetch request...';

            const startTime = performance.now();
            try {
                const res = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });
                const latency = Math.round(performance.now() - startTime);
                const json = await res.json();
                outputEl.textContent = `HTTP ${res.status} OK (${latency} ms)\n\n` + JSON.stringify(json, null, 2);
            } catch (err) {
                const latency = Math.round(performance.now() - startTime);
                outputEl.textContent = `Error (${latency} ms): ${err.message}`;
            } finally {
                btn.disabled = false;
                btn.textContent = 'Execute Test';
            }
        });
    });
}
