/**
 * Client-side authentication helper, nested project UUID route parser, and staged navigation controller.
 */
window.FragmaAuth = (function () {
    let cachedUser = null;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /** Parse project UUID, section, and optional resource ID from the current URL pathname. */
    function parseProjectRoute(pathname = window.location.pathname) {
        const match = String(pathname || '').match(/^\/project\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([^/?#]+))?(?:\/([^/?#]+))?/i);
        if (!match) {
            return null;
        }
        return {
            uuid: match[1].toLowerCase(),
            section: (match[2] || 'dashboard').toLowerCase(),
            resourceId: match[3] || ''
        };
    }

    /** Build a canonical nested project URL such as /project/<uuid>/view. */
    function buildProjectUrl(uuid, section = 'dashboard', subPath = '') {
        const cleanUuid = encodeURIComponent(String(uuid || '').toLowerCase());
        const cleanSection = String(section || 'dashboard').replace(/^\/+|\/+$/g, '');
        const extra = subPath !== '' && subPath !== null && subPath !== undefined ? `/${String(subPath).replace(/^\/+/, '')}` : '';
        return `/project/${cleanUuid}/${cleanSection}${extra}`;
    }

    /** Fetch the current authenticated user from the session API or return null without 401 noise. */
    async function fetchCurrentUser() {
        try {
            const res = await fetch('/api/auth.php?action=me&optional=1', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) {
                cachedUser = null;
                return null;
            }
            const json = await res.json();
            if (json && json.success && json.data) {
                cachedUser = json.data;
                return cachedUser;
            }
            cachedUser = null;
        } catch (err) {
            cachedUser = null;
        }
        return null;
    }

    /** Check whether the current page is the top-level project selection screen. */
    function isProjectsSelectionPage() {
        if (document.body && document.body.dataset.page === 'projects') {
            return true;
        }
        return /^\/projects(?:\/index\.html|\/)?$/i.test(window.location.pathname);
    }

    /** Read active project context from URL UUID route or localStorage. */
    function getActiveProject() {
        const route = parseProjectRoute();
        if (route && route.uuid) {
            const storedUuid = (localStorage.getItem('fragma_active_project_uuid') || '').toLowerCase();
            const storedId = parseInt(localStorage.getItem('fragma_active_project_id') || '0', 10) || 0;
            const storedName = localStorage.getItem('fragma_active_project_name') || '';
            if (storedUuid !== route.uuid) {
                localStorage.setItem('fragma_active_project_uuid', route.uuid);
                localStorage.removeItem('fragma_active_project_id');
                localStorage.removeItem('fragma_active_project_name');
                return { id: 0, uuid: route.uuid, name: 'Memuat Project...' };
            }
            return { id: storedId, uuid: route.uuid, name: storedName || 'Project' };
        }

        const storedUuid = (localStorage.getItem('fragma_active_project_uuid') || '').toLowerCase();
        if (UUID_REGEX.test(storedUuid)) {
            const storedId = parseInt(localStorage.getItem('fragma_active_project_id') || '0', 10) || 0;
            const storedName = localStorage.getItem('fragma_active_project_name') || 'Project';
            return { id: storedId, uuid: storedUuid, name: storedName };
        }
        return null;
    }

    /** Persist active project details in localStorage and refresh navigation chrome. */
    function setActiveProject(projectOrUuid, name, id) {
        let uuid = '';
        let resolvedName = name || '';
        let resolvedId = parseInt(id || '0', 10) || 0;

        if (projectOrUuid && typeof projectOrUuid === 'object') {
            uuid = String(projectOrUuid.uuid || '').toLowerCase();
            resolvedName = projectOrUuid.name || resolvedName;
            resolvedId = parseInt(projectOrUuid.id || '0', 10) || resolvedId;
        } else {
            uuid = String(projectOrUuid || '').toLowerCase();
        }

        if (!UUID_REGEX.test(uuid)) {
            clearActiveProject();
            return;
        }

        localStorage.setItem('fragma_active_project_uuid', uuid);
        if (resolvedId > 0) {
            localStorage.setItem('fragma_active_project_id', String(resolvedId));
        }
        if (resolvedName) {
            localStorage.setItem('fragma_active_project_name', String(resolvedName));
        }
        updateProjectSidebarUI(cachedUser);
    }

    /** Clear active project selection from localStorage and refresh navigation chrome. */
    function clearActiveProject() {
        localStorage.removeItem('fragma_active_project_uuid');
        localStorage.removeItem('fragma_active_project_id');
        localStorage.removeItem('fragma_active_project_name');
        updateProjectSidebarUI(cachedUser);
    }

    /** Validate the project UUID in URL (or redirect legacy URLs) and return the active project. */
    async function requireActiveProject() {
        const user = cachedUser || await fetchCurrentUser();
        if (!user) {
            return null;
        }

        const route = parseProjectRoute();
        if (!route) {
            const storedUuid = (localStorage.getItem('fragma_active_project_uuid') || '').toLowerCase();
            const adminOnly = Boolean(document.body && document.body.dataset.authAdminOnly === 'true');
            if (adminOnly && !isSuperRole(user.role)) {
                const targetUrl = UUID_REGEX.test(storedUuid)
                    ? `${buildProjectUrl(storedUuid, 'dashboard')}?notice=admin_only`
                    : '/projects?notice=admin_only';
                window.location.replace(targetUrl);
                return null;
            }
            if (UUID_REGEX.test(storedUuid)) {
                const section = (document.body && document.body.dataset.section) ? document.body.dataset.section : 'dashboard';
                const params = new URLSearchParams(window.location.search);
                const entityId = params.get('id');
                const subPath = (section === 'entity' && entityId) ? entityId : '';
                window.location.replace(buildProjectUrl(storedUuid, section, subPath));
                return null;
            }
            clearActiveProject();
            window.location.replace('/projects?need_project=1');
            return null;
        }

        try {
            const project = await apiFetch(`/projects.php?uuid=${encodeURIComponent(route.uuid)}`);
            if (project && project.uuid) {
                const adminOnly = Boolean(document.body && document.body.dataset.authAdminOnly === 'true');
                if (adminOnly && !isSuperRole(user.role)) {
                    window.location.replace(`${buildProjectUrl(project.uuid, 'dashboard')}?notice=admin_only`);
                    return null;
                }
                setActiveProject(project);
                return project;
            }
        } catch (err) {
            clearActiveProject();
            window.location.replace('/projects?need_project=1');
            return null;
        }

        clearActiveProject();
        window.location.replace('/projects?need_project=1');
        return null;
    }

    /** Log in with username/email and password. */
    async function loginUser(username, password) {
        clearActiveProject();
        return apiFetch('/auth.php?action=login', {
            method: 'POST',
            body: { username, password }
        });
    }

    /** Register a new user account and start a session. */
    async function registerUser(username, email, password) {
        clearActiveProject();
        return apiFetch('/auth.php?action=register', {
            method: 'POST',
            body: { username, email, password }
        });
    }

    /** Destroy the active session and redirect to the login page. */
    async function logoutUser() {
        try {
            await fetch('/api/auth.php?action=logout', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            });
        } catch (err) {
            cachedUser = null;
        }
        cachedUser = null;
        clearActiveProject();
        window.location.href = '/login';
    }

    /** Check if user has superadmin/admin elevated privileges. */
    function isSuperRole(role) {
        return role === 'superadmin' || role === 'admin';
    }

    /** Get human readable role display name. */
    function getRoleLabel(role) {
        return isSuperRole(role) ? 'Superadmin' : 'Pengguna';
    }

    /** Get CSS class suffix for role badge. */
    function getRoleBadgeClass(role) {
        return isSuperRole(role) ? 'role-badge--superadmin' : 'role-badge--user';
    }

    /** Build a safe DOM element displaying the user's name, role badge, and logout button. */
    function buildSidebarUserCard(user) {
        const wrapper = document.createElement('div');
        wrapper.className = 'sidebar__user';

        const info = document.createElement('div');
        info.className = 'sidebar__user-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'sidebar__user-name';
        nameEl.textContent = user.username;

        const roleEl = document.createElement('span');
        roleEl.className = `role-badge ${getRoleBadgeClass(user.role)}`;
        roleEl.textContent = getRoleLabel(user.role);

        info.appendChild(nameEl);
        info.appendChild(roleEl);

        const logoutBtn = document.createElement('button');
        logoutBtn.type = 'button';
        logoutBtn.className = 'btn btn--ghost btn--sm sidebar__logout';
        logoutBtn.textContent = 'Keluar';
        logoutBtn.addEventListener('click', logoutUser);

        wrapper.appendChild(info);
        wrapper.appendChild(logoutBtn);
        return wrapper;
    }

    /** Render or refresh the mobile header compact action buttons. */
    function renderMobileHeaderAuth(user, activeProject, onProjectsPage) {
        const mobileHeader = document.querySelector('.mobile-header');
        if (!mobileHeader) {
            return;
        }

        const existing = mobileHeader.querySelector('.mobile-header__auth');
        if (existing) {
            existing.remove();
        }

        const box = document.createElement('div');
        box.className = 'mobile-header__auth';

        if (!onProjectsPage && activeProject) {
            const switchBtn = document.createElement('button');
            switchBtn.type = 'button';
            switchBtn.className = 'btn btn--ghost btn--sm';
            switchBtn.textContent = 'Ganti Project';
            switchBtn.addEventListener('click', () => {
                clearActiveProject();
                window.location.href = '/projects';
            });
            box.appendChild(switchBtn);
        } else if (user) {
            const roleEl = document.createElement('span');
            roleEl.className = `role-badge ${getRoleBadgeClass(user.role)}`;
            roleEl.textContent = user.username;
            box.appendChild(roleEl);
        }

        if (user) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn--ghost btn--sm';
            btn.textContent = 'Keluar';
            btn.addEventListener('click', logoutUser);
            box.appendChild(btn);
        }

        mobileHeader.appendChild(box);
    }

    /** Update sidebar links, active project box, and nested breadcrumbs for staged navigation. */
    function updateProjectSidebarUI(user) {
        const onProjectsPage = isProjectsSelectionPage();
        const active = onProjectsPage ? null : getActiveProject();
        const isSuper = user ? isSuperRole(user.role) : document.body.classList.contains('is-superadmin');

        if (active && !onProjectsPage) {
            document.body.classList.add('has-active-project');
        } else {
            document.body.classList.remove('has-active-project');
        }

        const navProjects = document.getElementById('navProjects');
        if (navProjects) {
            navProjects.style.display = (active && !onProjectsPage) ? 'none' : '';
            navProjects.setAttribute('href', '/projects');
        }

        const sectionLinks = {
            navEntity: 'dashboard',
            navView: 'view',
            navFlow: 'flow',
            navNotifications: 'notifications',
            navStorage: 'storage'
        };

        Object.entries(sectionLinks).forEach(([elId, sectionName]) => {
            const el = document.getElementById(elId);
            if (!el) return;
            if (!active || onProjectsPage) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
                el.setAttribute('href', buildProjectUrl(active.uuid, sectionName));
            }
        });

        const navSimulation = document.getElementById('navSimulation');
        if (navSimulation) {
            if (!active || onProjectsPage || !isSuper) {
                navSimulation.style.display = 'none';
            } else {
                navSimulation.style.display = '';
                navSimulation.setAttribute('href', buildProjectUrl(active.uuid, 'simulation'));
            }
        }

        const sidebar = document.querySelector('.sidebar');
        const nav = sidebar ? sidebar.querySelector('.sidebar__nav') : null;
        if (sidebar && nav) {
            let box = sidebar.querySelector('.sidebar__project-box');
            if (onProjectsPage || !active) {
                if (box) {
                    box.remove();
                }
            } else {
                if (box && box.tagName !== 'BUTTON') {
                    box.remove();
                    box = null;
                }
                if (!box) {
                    box = document.createElement('button');
                    box.type = 'button';
                    box.className = 'sidebar__project-box';
                    box.addEventListener('click', () => {
                        clearActiveProject();
                        window.location.href = '/projects';
                    });
                    sidebar.insertBefore(box, nav);
                }

                box.setAttribute('title', `Ganti project (${active.name})`);
                box.setAttribute('aria-label', `Ganti project: ${active.name}`);
                box.replaceChildren();

                const iconWrap = document.createElement('span');
                iconWrap.className = 'sidebar__project-icon';
                iconWrap.setAttribute('aria-hidden', 'true');
                iconWrap.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';

                const nameEl = document.createElement('span');
                nameEl.className = 'sidebar__project-name';
                nameEl.textContent = active.name;

                const chevWrap = document.createElement('span');
                chevWrap.className = 'sidebar__project-chevron';
                chevWrap.setAttribute('aria-hidden', 'true');
                chevWrap.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 15 12 20 17 15"></polyline><polyline points="7 9 12 4 17 9"></polyline></svg>';

                box.appendChild(iconWrap);
                box.appendChild(nameEl);
                box.appendChild(chevWrap);
            }
        }

        const rootCrumb = document.getElementById('breadcrumbProjectsRoot');
        if (rootCrumb) {
            rootCrumb.setAttribute('href', '/projects');
            rootCrumb.onclick = () => {
                clearActiveProject();
            };
        }

        const breadcrumbProj = document.getElementById('breadcrumbProjectName');
        if (breadcrumbProj && active && !onProjectsPage) {
            breadcrumbProj.textContent = active.name;
            if (breadcrumbProj.tagName === 'A') {
                breadcrumbProj.setAttribute('href', buildProjectUrl(active.uuid, 'dashboard'));
            }
        }

        const deviceCrumb = document.getElementById('breadcrumbDevicesLink');
        if (deviceCrumb && active && !onProjectsPage) {
            deviceCrumb.setAttribute('href', buildProjectUrl(active.uuid, 'dashboard'));
        }

        if (user) {
            renderMobileHeaderAuth(user, active, onProjectsPage);
        }
    }

    /** Show a dismissible notice banner when redirected from a superadmin-only page. */
    function renderQueryNotices() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('notice') !== 'admin_only') {
            return;
        }

        const container = document.querySelector('.tb-container') || document.querySelector('.container');
        if (!container || container.querySelector('.notice-banner')) {
            return;
        }

        const banner = document.createElement('div');
        banner.className = 'notice-banner';
        banner.setAttribute('role', 'status');

        const msg = document.createElement('span');
        msg.textContent = 'Halaman Simulasi hanya tersedia untuk akun Superadmin.';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'notice-banner__close';
        closeBtn.textContent = 'Tutup';
        closeBtn.addEventListener('click', () => banner.remove());

        banner.appendChild(msg);
        banner.appendChild(closeBtn);
        container.insertBefore(banner, container.firstChild);
    }

    /** Inject the authenticated user card into the sidebar and mobile header. */
    function renderUserChrome(user) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && !sidebar.querySelector('.sidebar__user')) {
            sidebar.appendChild(buildSidebarUserCard(user));
        }

        const isSuper = isSuperRole(user.role);
        if (isSuper) {
            document.body.classList.add('is-superadmin');
        } else {
            document.body.classList.remove('is-superadmin');
        }

        updateProjectSidebarUI(user);
        renderQueryNotices();
    }

    /** Protect a dashboard page: redirect unauthenticated visitors to login and render user chrome. */
    async function initProtectedPage(options = {}) {
        const user = await fetchCurrentUser();
        if (!user) {
            const target = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.replace(`/login?redirect=${target}`);
            return null;
        }

        window.FRAGMA_CURRENT_USER = user;
        renderUserChrome(user);

        if (options.adminOnly && !isSuperRole(user.role)) {
            const active = getActiveProject();
            const fallbackUrl = active
                ? `${buildProjectUrl(active.uuid, 'dashboard')}?notice=admin_only`
                : '/projects?notice=admin_only';
            window.location.replace(fallbackUrl);
            return null;
        }

        return user;
    }

    /** Update public navbar links based on current authentication state. */
    async function initPublicNavAuth() {
        const navLinks = document.querySelector('.navbar__links');
        const heroStartBtn = document.getElementById('heroStartBtn');
        if (!navLinks) {
            return null;
        }

        const user = await fetchCurrentUser();
        navLinks.innerHTML = '';

        if (user) {
            const badge = document.createElement('span');
            badge.className = `role-badge ${getRoleBadgeClass(user.role)} nav-auth-item`;
            badge.textContent = `${user.username} (${getRoleLabel(user.role)})`;

            const projectsLink = document.createElement('a');
            projectsLink.href = '/projects';
            projectsLink.className = 'btn btn--primary btn--sm nav-auth-item';
            projectsLink.textContent = 'Pilih Project';

            const logoutBtn = document.createElement('button');
            logoutBtn.type = 'button';
            logoutBtn.className = 'btn btn--ghost btn--sm nav-auth-item';
            logoutBtn.textContent = 'Keluar';
            logoutBtn.addEventListener('click', logoutUser);

            navLinks.appendChild(badge);
            navLinks.appendChild(projectsLink);
            navLinks.appendChild(logoutBtn);

            if (heroStartBtn) {
                heroStartBtn.href = '/projects';
                heroStartBtn.textContent = 'Buka Projects';
            }
        } else {
            const loginLink = document.createElement('a');
            loginLink.href = '/login';
            loginLink.className = 'navbar__link nav-auth-item';
            loginLink.textContent = 'Masuk';

            const registerLink = document.createElement('a');
            registerLink.href = '/register';
            registerLink.className = 'btn btn--primary btn--sm nav-auth-item';
            registerLink.textContent = 'Daftar';

            navLinks.appendChild(loginLink);
            navLinks.appendChild(registerLink);

            if (heroStartBtn) {
                heroStartBtn.href = '/login';
                heroStartBtn.textContent = 'Mulai Sekarang';
            }
        }

        return user;
    }

    /** Get a safe relative redirect path from the current query string. */
    function getSafeRedirectUrl(fallback = '/projects') {
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
            return redirect;
        }
        return fallback;
    }

    return {
        parseProjectRoute,
        buildProjectUrl,
        fetchCurrentUser,
        loginUser,
        registerUser,
        logoutUser,
        initProtectedPage,
        initPublicNavAuth,
        getSafeRedirectUrl,
        getActiveProject,
        setActiveProject,
        clearActiveProject,
        requireActiveProject,
        updateProjectSidebarUI
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    if (body && body.dataset.authRequired === 'true') {
        if (body.dataset.page === 'projects') {
            localStorage.removeItem('fragma_active_project_uuid');
            localStorage.removeItem('fragma_active_project_id');
            localStorage.removeItem('fragma_active_project_name');
        }
        window.FragmaAuth.updateProjectSidebarUI(null);
        const adminOnly = body.dataset.authAdminOnly === 'true';
        window.FragmaAuth.initProtectedPage({ adminOnly });
    } else if (body && body.dataset.authPublicNav === 'true') {
        window.FragmaAuth.initPublicNavAuth();
    }
});
