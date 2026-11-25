/**
 * Fragma Projects Workspace Controller.
 * Handles listing, filtering, creating, editing, and deleting projects.
 */

let allProjects = [];
let currentAuthUser = null;
let pendingDeleteProject = null;

/** Fetch all projects accessible by current user from the API. */
async function fetchProjects() {
    try {
        const data = await apiFetch('/projects.php', { method: 'GET' });
        allProjects = Array.isArray(data) ? data : [];
        updateProjectsStats(allProjects);
        applyProjectFilters();
    } catch (err) {
        renderEmptyProjects('Terjadi kesalahan saat memuat data project: ' + (err.message || ''));
    }
}

/** Update the summary counters for projects and active devices. */
function updateProjectsStats(projects) {
    const totalEl = document.getElementById('statTotalProjects');
    const activeEl = document.getElementById('statActiveDevices');
    const subEl = document.getElementById('statTotalDevicesSub');
    const scopeEl = document.getElementById('statAccountScope');

    if (totalEl) {
        totalEl.textContent = String(projects.length);
    }

    const totalDevs = projects.reduce((acc, p) => acc + (parseInt(p.device_count, 10) || 0), 0);
    const activeDevs = projects.reduce((acc, p) => acc + (parseInt(p.active_device_count, 10) || 0), 0);

    if (activeEl) {
        activeEl.textContent = String(activeDevs);
    }
    if (subEl) {
        subEl.textContent = `dari ${totalDevs} total perangkat`;
    }

    if (scopeEl && currentAuthUser) {
        const isSuper = currentAuthUser.role === 'superadmin' || currentAuthUser.role === 'admin';
        scopeEl.textContent = isSuper ? 'Superadmin (Semua Project)' : 'Pribadi (Project Saya)';
    }
}

/** Filter and display projects based on search query and superadmin scope. */
function applyProjectFilters() {
    const searchInput = document.getElementById('projectSearchInput');
    const scopeSelect = document.getElementById('superadminScopeSelect');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const scope = scopeSelect ? scopeSelect.value : 'all';

    const filtered = allProjects.filter((p) => {
        const matchesQuery = !query || p.name.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query));
        if (!matchesQuery) {
            return false;
        }
        if (scope === 'mine' && currentAuthUser) {
            return p.user_id === currentAuthUser.id;
        }
        return true;
    });

    renderProjectsGrid(filtered);
}

/** Render project cards inside the projects container. */
function renderProjectsGrid(projects) {
    const container = document.getElementById('projectsContainer');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (projects.length === 0) {
        renderEmptyProjects('Belum ada project yang cocok atau belum dibuat.', true);
        return;
    }

    const isSuper = currentAuthUser && (currentAuthUser.role === 'superadmin' || currentAuthUser.role === 'admin');

    projects.forEach((project) => {
        const card = document.createElement('div');
        card.className = 'project-card';

        const header = document.createElement('div');
        header.className = 'project-card__header';

        const iconBox = document.createElement('div');
        iconBox.className = 'project-card__icon-box';
        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '20');
        iconSvg.setAttribute('height', '20');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('fill', 'none');
        iconSvg.setAttribute('stroke', 'currentColor');
        iconSvg.setAttribute('stroke-width', '2');
        iconSvg.setAttribute('stroke-linecap', 'round');
        iconSvg.setAttribute('stroke-linejoin', 'round');
        const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        iconPath.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
        iconSvg.appendChild(iconPath);
        iconBox.appendChild(iconSvg);

        const titleWrap = document.createElement('div');
        titleWrap.className = 'project-card__title-wrap';

        const title = document.createElement('h2');
        title.className = 'project-card__title';
        title.textContent = project.name;
        titleWrap.appendChild(title);

        header.appendChild(iconBox);
        header.appendChild(titleWrap);

        if (isSuper) {
            const ownerBadge = document.createElement('span');
            ownerBadge.className = 'project-card__owner';
            ownerBadge.textContent = project.owner_username ? `@${project.owner_username}` : 'Tanpa Pemilik';
            header.appendChild(ownerBadge);
        }

        const desc = document.createElement('p');
        desc.className = 'project-card__desc';
        desc.textContent = project.description || 'Belum ada deskripsi untuk project ini.';

        const meta = document.createElement('div');
        meta.className = 'project-card__meta';

        const devicesBadge = document.createElement('span');
        const devCount = parseInt(project.device_count, 10) || 0;
        devicesBadge.className = `project-card__devices-badge ${devCount > 0 ? 'project-card__devices-badge--active' : ''}`;
        devicesBadge.textContent = `${devCount} Perangkat`;

        const dateSpan = document.createElement('span');
        dateSpan.textContent = typeof formatDate === 'function' ? formatDate(project.created_at) : (project.created_at || '');

        meta.appendChild(devicesBadge);
        meta.appendChild(dateSpan);

        const actions = document.createElement('div');
        actions.className = 'project-card__actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn btn--primary btn--sm';
        openBtn.style.flex = '1';
        openBtn.textContent = 'Buka Project';
        openBtn.addEventListener('click', () => openProjectWorkspace(project));

        const canManage = isSuper || (currentAuthUser && project.user_id === currentAuthUser.id);

        actions.appendChild(openBtn);

        if (canManage) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn--ghost btn--sm';
            editBtn.textContent = 'Ubah';
            editBtn.addEventListener('click', () => openEditModal(project));

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn--ghost btn--sm btn--danger';
            delBtn.textContent = 'Hapus';
            delBtn.addEventListener('click', () => deleteProject(project));

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
        }

        card.appendChild(header);
        card.appendChild(desc);
        card.appendChild(meta);
        card.appendChild(actions);

        container.appendChild(card);
    });
}

/** Render empty state message inside the projects container. */
function renderEmptyProjects(message, showCreateBtn = false) {
    const container = document.getElementById('projectsContainer');
    if (!container) {
        return;
    }
    container.innerHTML = '';

    const emptyBox = document.createElement('div');
    emptyBox.className = 'card';
    emptyBox.style.gridColumn = '1 / -1';
    emptyBox.style.textAlign = 'center';
    emptyBox.style.padding = '56px 24px';
    emptyBox.style.display = 'flex';
    emptyBox.style.flexDirection = 'column';
    emptyBox.style.alignItems = 'center';
    emptyBox.style.justifyContent = 'center';
    emptyBox.style.gap = '12px';

    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '40');
    iconSvg.setAttribute('height', '40');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '1.5');
    iconSvg.setAttribute('stroke-linecap', 'round');
    iconSvg.setAttribute('stroke-linejoin', 'round');
    iconSvg.style.color = 'var(--text-muted)';

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
    iconSvg.appendChild(path1);

    const titleEl = document.createElement('h3');
    titleEl.className = 'h3';
    titleEl.textContent = 'Belum Ada Project';
    titleEl.style.margin = '0';

    const p = document.createElement('p');
    p.textContent = message || 'Mulai dengan membuat project baru untuk menghubungkan perangkat IoT Anda.';
    p.style.color = 'var(--text-secondary)';
    p.style.fontSize = '0.9rem';
    p.style.maxWidth = '460px';
    p.style.margin = '0';

    emptyBox.appendChild(iconSvg);
    emptyBox.appendChild(titleEl);
    emptyBox.appendChild(p);

    if (showCreateBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--primary btn--sm';
        btn.style.marginTop = '8px';
        btn.textContent = '+ Buat Project Baru';
        btn.addEventListener('click', openCreateModal);
        emptyBox.appendChild(btn);
    }

    container.appendChild(emptyBox);
}

/** Select active project and redirect user to nested UUID workspace dashboard. */
function openProjectWorkspace(project) {
    if (!project || !project.uuid) {
        return;
    }
    if (window.FragmaAuth && typeof window.FragmaAuth.setActiveProject === 'function') {
        window.FragmaAuth.setActiveProject(project);
        window.location.href = window.FragmaAuth.buildProjectUrl(project.uuid, 'dashboard');
        return;
    }
    localStorage.setItem('fragma_active_project_uuid', String(project.uuid).toLowerCase());
    localStorage.setItem('fragma_active_project_id', String(project.id));
    localStorage.setItem('fragma_active_project_name', project.name);
    window.location.href = `/project/${encodeURIComponent(project.uuid)}/dashboard`;
}

/** Open the modal for creating a new project. */
function openCreateModal() {
    const modal = document.getElementById('createProjectModal');
    const input = document.getElementById('projectNameInput');
    const desc = document.getElementById('projectDescInput');
    const errBox = document.getElementById('createProjectError');
    if (input) {
        input.value = '';
    }
    if (desc) {
        desc.value = '';
    }
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-backdrop--open');
    }
    if (input) {
        input.focus();
    }
}

/** Close the create project modal. */
function closeCreateModal() {
    const modal = document.getElementById('createProjectModal');
    const errBox = document.getElementById('createProjectError');
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.classList.remove('modal-backdrop--open');
        modal.style.display = 'none';
    }
}

/** Submit create project form to backend API. */
async function handleCreateProject(e) {
    e.preventDefault();
    const nameInput = document.getElementById('projectNameInput');
    const descInput = document.getElementById('projectDescInput');
    const submitBtn = document.getElementById('btnSubmitProject');
    const errBox = document.getElementById('createProjectError');

    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }

    const name = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';

    if (!name) {
        if (errBox) {
            errBox.textContent = 'Nama project wajib diisi.';
            errBox.classList.remove('form-summary--hidden');
        }
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menyimpan...';
    }

    try {
        const project = await apiFetch('/projects.php', {
            method: 'POST',
            body: { name, description }
        });

        if (project && project.id) {
            closeCreateModal();
            await fetchProjects();
        } else if (errBox) {
            errBox.textContent = 'Gagal membuat project.';
            errBox.classList.remove('form-summary--hidden');
        }
    } catch (err) {
        if (errBox) {
            errBox.textContent = err.message || 'Terjadi kesalahan jaringan.';
            errBox.classList.remove('form-summary--hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Buat Project';
        }
    }
}

/** Open edit modal with project details pre-populated. */
function openEditModal(project) {
    const modal = document.getElementById('editProjectModal');
    const idInput = document.getElementById('editProjectId');
    const nameInput = document.getElementById('editProjectNameInput');
    const descInput = document.getElementById('editProjectDescInput');
    const errBox = document.getElementById('editProjectError');

    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (idInput) {
        idInput.value = project.uuid || project.id;
    }
    if (nameInput) {
        nameInput.value = project.name;
    }
    if (descInput) {
        descInput.value = project.description || '';
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-backdrop--open');
    }
    if (nameInput) {
        nameInput.focus();
    }
}

/** Close edit project modal. */
function closeEditModal() {
    const modal = document.getElementById('editProjectModal');
    const errBox = document.getElementById('editProjectError');
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.classList.remove('modal-backdrop--open');
        modal.style.display = 'none';
    }
}

/** Submit edit project changes to backend API. */
async function handleEditProject(e) {
    e.preventDefault();
    const idInput = document.getElementById('editProjectId');
    const nameInput = document.getElementById('editProjectNameInput');
    const descInput = document.getElementById('editProjectDescInput');
    const submitBtn = document.getElementById('btnSubmitEditProject');
    const errBox = document.getElementById('editProjectError');

    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }

    const targetKey = idInput ? idInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';

    if (!targetKey || !name) {
        if (errBox) {
            errBox.textContent = 'Nama project wajib diisi.';
            errBox.classList.remove('form-summary--hidden');
        }
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Menyimpan...';
    }

    try {
        await apiFetch(`/projects.php?uuid=${encodeURIComponent(targetKey)}`, {
            method: 'PUT',
            body: { name, description }
        });

        closeEditModal();
        await fetchProjects();
    } catch (err) {
        if (errBox) {
            errBox.textContent = err.message || 'Terjadi kesalahan jaringan.';
            errBox.classList.remove('form-summary--hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Simpan Perubahan';
        }
    }
}

/** Open confirmation modal to delete a project. */
function deleteProject(project) {
    pendingDeleteProject = project;
    const modal = document.getElementById('deleteProjectModal');
    const textEl = document.getElementById('deleteProjectConfirmText');
    const errBox = document.getElementById('deleteProjectError');
    if (textEl) {
        textEl.textContent = `Hapus project "${project.name}"? Semua perangkat di dalam project ini akan terlepas dari project.`;
    }
    if (errBox) {
        errBox.textContent = '';
        errBox.classList.add('form-summary--hidden');
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-backdrop--open');
    }
}

/** Set up event handlers for delete project confirmation modal. */
function setupDeleteProjectModal() {
    const modal = document.getElementById('deleteProjectModal');
    const btnClose = document.getElementById('btnCloseDeleteProjectModal');
    const btnCancel = document.getElementById('btnCancelDeleteProjectModal');
    const btnConfirm = document.getElementById('btnConfirmDeleteProject');

    function closeDeleteModal() {
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('modal-backdrop--open');
        }
        pendingDeleteProject = null;
    }

    if (btnClose) btnClose.addEventListener('click', closeDeleteModal);
    if (btnCancel) btnCancel.addEventListener('click', closeDeleteModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDeleteModal();
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            if (!pendingDeleteProject) return;

            const errBox = document.getElementById('deleteProjectError');
            if (errBox) {
                errBox.textContent = '';
                errBox.classList.add('form-summary--hidden');
            }

            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Menghapus...';

            try {
                const delQuery = pendingDeleteProject.uuid
                    ? `uuid=${encodeURIComponent(pendingDeleteProject.uuid)}`
                    : `id=${pendingDeleteProject.id}`;
                await apiFetch(`/projects.php?${delQuery}`, {
                    method: 'DELETE'
                });

                const storedUuid = localStorage.getItem('fragma_active_project_uuid');
                if ((pendingDeleteProject.uuid && storedUuid === pendingDeleteProject.uuid) || localStorage.getItem('fragma_active_project_id') === String(pendingDeleteProject.id)) {
                    if (window.FragmaAuth && typeof window.FragmaAuth.clearActiveProject === 'function') {
                        window.FragmaAuth.clearActiveProject();
                    } else {
                        localStorage.removeItem('fragma_active_project_uuid');
                        localStorage.removeItem('fragma_active_project_id');
                        localStorage.removeItem('fragma_active_project_name');
                    }
                }

                closeDeleteModal();
                await fetchProjects();
            } catch (err) {
                if (errBox) {
                    errBox.textContent = `Gagal menghapus project: ${err.message || 'Terjadi kesalahan jaringan.'}`;
                    errBox.classList.remove('form-summary--hidden');
                }
            } finally {
                btnConfirm.disabled = false;
                btnConfirm.textContent = 'Hapus Project';
            }
        });
    }
}

/** Initialize project page listeners, authentication, and load data. */
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('need_project') === '1') {
        const banner = document.getElementById('needProjectBanner');
        if (banner) {
            banner.style.display = 'flex';
        }
    }

    currentAuthUser = await FragmaAuth.fetchCurrentUser();
    if (!currentAuthUser) {
        return;
    }

    const isSuper = currentAuthUser.role === 'superadmin' || currentAuthUser.role === 'admin';
    const superWrap = document.getElementById('superadminFilterWrap');
    if (superWrap && isSuper) {
        superWrap.style.display = 'flex';
    }

    const btnCreateModal = document.getElementById('btnCreateProjectModal');
    if (btnCreateModal) {
        btnCreateModal.addEventListener('click', openCreateModal);
    }

    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', closeCreateModal);
    }

    const btnCancelModal = document.getElementById('btnCancelModal');
    if (btnCancelModal) {
        btnCancelModal.addEventListener('click', closeCreateModal);
    }

    const createModal = document.getElementById('createProjectModal');
    if (createModal) {
        createModal.addEventListener('click', (e) => {
            if (e.target === createModal) {
                closeCreateModal();
            }
        });
    }

    const createForm = document.getElementById('createProjectForm');
    if (createForm) {
        createForm.addEventListener('submit', handleCreateProject);
    }

    const btnCloseEdit = document.getElementById('btnCloseEditModal');
    if (btnCloseEdit) {
        btnCloseEdit.addEventListener('click', closeEditModal);
    }

    const btnCancelEdit = document.getElementById('btnCancelEditModal');
    if (btnCancelEdit) {
        btnCancelEdit.addEventListener('click', closeEditModal);
    }

    const editModal = document.getElementById('editProjectModal');
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                closeEditModal();
            }
        });
    }

    const editForm = document.getElementById('editProjectForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditProject);
    }

    setupDeleteProjectModal();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCreateModal();
            closeEditModal();
            const delModal = document.getElementById('deleteProjectModal');
            if (delModal) {
                delModal.classList.remove('modal-backdrop--open');
                delModal.style.display = 'none';
            }
            pendingDeleteProject = null;
        }
    });

    const searchInput = document.getElementById('projectSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyProjectFilters);
    }

    const scopeSelect = document.getElementById('superadminScopeSelect');
    if (scopeSelect) {
        scopeSelect.addEventListener('change', applyProjectFilters);
    }

    await fetchProjects();
});
