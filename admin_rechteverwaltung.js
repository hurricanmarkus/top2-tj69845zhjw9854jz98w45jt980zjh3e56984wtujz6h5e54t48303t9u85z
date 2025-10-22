function setupPermissionDependencies(container) {
    const mainToggle = container.querySelector('[data-perm="canSeeMainFunctions"]');
    const subToggles = [
        container.querySelector('[data-perm="canUseMainPush"]'),
        container.querySelector('[data-perm="canUseMainEntrance"]'),
        container.querySelector('[data-perm="canUseMainChecklist"]')
    ];

    if (!mainToggle) return;

    const updateSubToggles = () => {
        const isEnabled = mainToggle.checked;
        subToggles.forEach(toggle => {
            if (toggle) {
                toggle.disabled = !isEnabled;
                if (!isEnabled) {
                    toggle.checked = false;
                }
            }
        });
    };

    mainToggle.addEventListener('change', updateSubToggles);
    updateSubToggles(); // Einmal beim Laden ausführen, um den initialen Status zu setzen
}

async function renderAdminRightsManagement() {
    let sysAdminListHTML = '<h4 class="text-lg font-semibold text-gray-700 mb-2">Übersicht Systemadministratoren</h4>';
    if (systemAdmins.length > 0) {
        sysAdminListHTML += '<div class="space-y-1">';
        systemAdmins.forEach(sysAdmin => {
            const isSelf = sysAdmin.id === currentUser.mode;
            const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';
            sysAdminListHTML += `<p class="p-2 bg-gray-100 rounded-md text-sm">${sysAdmin.name} ${currentUserLabel}</p>`;
        });
        sysAdminListHTML += '</div>';
    } else {
        sysAdminListHTML += '<p class="text-sm text-gray-500">Keine Systemadministratoren gefunden.</p>';
    }

    adminRightsArea.innerHTML = `
                <h3 class="text-xl font-bold text-gray-800 mb-4">Admin-Benutzer verwalten</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h4 class="font-semibold text-lg text-center mb-2 pb-2 border-b">Rolle</h4>
                        <div id="admin-role-users" class="space-y-2"></div>
                    </div>
                    <div>
                        <h4 class="font-semibold text-lg text-center mb-2 pb-2 border-b">Individuell</h4>
                        <div id="admin-individual-users" class="space-y-2"></div>
                    </div>
                </div>
                <div class="mt-6 border-t pt-4">
                    ${sysAdminListHTML}
                </div>
                <div id="admin-user-details-area" class="mt-6"></div>
            `;

    adminRightsArea.querySelectorAll('.edit-admin-user-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userid;
            renderAdminUserDetails(userId);
        });
    });

    // KORRIGIERTER FILTER: Findet alle Benutzer, die entweder die Rolle ADMIN oder SYSTEMADMIN haben.
    const adminUsers = Object.values(USERS).filter(user => user.role === 'ADMIN' || user.role === 'SYSTEMADMIN');

    const roleUsersContainer = adminRightsArea.querySelector('#admin-role-users');
    const individualUsersContainer = adminRightsArea.querySelector('#admin-individual-users');

    if (adminUsers.length === 0) {
        adminRightsArea.querySelector('#admin-role-users').innerHTML = '<p class="text-center text-sm text-gray-500">Keine Admins gefunden.</p>';
    }

    adminUsers.forEach(adminUser => {
        // Ein Systemadmin wird hier immer als "Rolle" behandelt.
        const permissionType = adminUser.role === 'SYSTEMADMIN' ? 'role' : (adminUser.permissionType || 'role');

        // Ein Systemadmin kann nicht bearbeitet werden (Selbstschutz).
        const canBeEdited = adminUser.role !== 'SYSTEMADMIN';

        const userCard = document.createElement('div');
        userCard.className = 'p-2 border rounded-lg bg-white shadow-sm flex justify-between items-center';

        let userInfoHTML;
        // Admins und Systemadmins werden jetzt beide in der "Rolle"-Spalte angezeigt.
        if (permissionType === 'role') {
            const roleName = ROLES[adminUser.role]?.name || 'Unbekannt';
            userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name}</p><p class="text-xs text-indigo-600 font-medium">${roleName}</p></div>`;
            roleUsersContainer.appendChild(userCard);
        } else { // Gilt nur noch für individuell konfigurierte Admins
            userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name}</p></div>`;
            individualUsersContainer.appendChild(userCard);
        }

        userCard.innerHTML = `
                    ${userInfoHTML}
                    ${canBeEdited ? `
                    <button class="edit-admin-user-btn p-1 text-gray-500 hover:text-indigo-600" data-userid="${adminUser.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
                    </button>` : ''}
                `;
    });
}