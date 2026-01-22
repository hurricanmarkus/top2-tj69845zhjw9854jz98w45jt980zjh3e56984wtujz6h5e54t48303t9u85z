// ---------- IMPORTS ----------
import { notrufSettings, notrufSettingsDocRef, alertUser, setButtonLoading, db, appId, currentUser, auth, GUEST_MODE, USERS } from './haupteingang.js';
import { getUserSetting, saveUserSetting } from './log-InOut.js';
import { setDoc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ---------- KONSTANTEN ----------
export const IFTTT_EVENT = 'NFC_Stick_Switchbot_Bauteil_2_Wohnungsanlage_oeffnen';
export const IFTTT_KEY = 'pECKM4iJ9sI_3ZF4DdYTzsH60p3cCg0yLbnPGzUFbFO';
export const IFTTT_URL = `https://maker.ifttt.com/trigger/${IFTTT_EVENT}/with/key/${IFTTT_KEY}`;

// ---------- LOKALE VARS ----------
let activeFlicEditorKlickTyp = null;
let tempSelectedApiTokenId = null;
let tempSelectedSoundId = null;

let nachrichtencenterActiveScope = 'global';
let nachrichtencenterSelectedRefs = new Set();
let nachrichtencenterGlobalContacts = {};
let nachrichtencenterPrivateContacts = {};
let unsubscribeNachrichtencenterGlobal = null;
let unsubscribeNachrichtencenterPrivate = null;

function canUseNachrichtencenterContactBook() {
  if (!db) return false;
  if (!appId) return false;
  if (!currentUser || !currentUser.mode) return false;
  if (!auth || !auth.currentUser) return false;
  return true;
}

function getNachrichtencenterSelfContactId() {
  const userId = String(currentUser?.mode || '').trim();
  if (!userId || userId === GUEST_MODE) return null;
  return `self_${userId}`;
}

async function ensureNachrichtencenterSelfContact() {
  if (!canUseNachrichtencenterContactBook()) return;
  const userId = String(currentUser?.mode || '').trim();
  if (!userId || userId === GUEST_MODE) return;

  const col = getNachrichtencenterGlobalContactsRef();
  if (!col) return;

  const selfContactId = getNachrichtencenterSelfContactId();
  if (!selfContactId) return;

  let userKey = '';
  try {
    const cfgRef = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_programs', userId);
    const cfgSnap = await getDoc(cfgRef);
    if (cfgSnap.exists()) {
      const data = cfgSnap.data() || {};
      userKey = String(data.userKey || '').trim();
    }
  } catch (e) {
    console.warn('Nachrichtencenter: User-Key konnte nicht geladen werden:', e);
  }

  const currentUserObj = USERS && typeof USERS === 'object' ? USERS[currentUser.mode] : null;
  const name = String(currentUserObj?.realName || currentUser.displayName || userId).trim();
  const docRef = doc(col, selfContactId);

  let isNew = true;
  try {
    const existing = await getDoc(docRef);
    isNew = !existing.exists();
  } catch (e) {
    console.warn('Nachrichtencenter: Kontaktprüfung fehlgeschlagen:', e);
  }

  const payload = {
    type: 'User',
    name,
    key: userKey,
    isSelfContact: true,
    createdByAppUserId: userId,
    createdByName: name,
    createdByAuthUid: auth?.currentUser?.uid || null,
    updatedAt: serverTimestamp()
  };

  if (isNew) {
    payload.createdAt = serverTimestamp();
  }

  try {
    await setDoc(docRef, payload, { merge: true });
    console.log('Nachrichtencenter: Eigener Kontakt synchronisiert:', selfContactId);
  } catch (e) {
    console.warn('Nachrichtencenter: Eigener Kontakt konnte nicht gespeichert werden:', e);
  }
}

function canSaveToNotrufSettings() {
  if (typeof setDoc !== 'function') {
    alertUser('Interner Fehler: Firestore-Funktion setDoc nicht verfügbar.', 'error');
    return false;
  }
  if (!notrufSettingsDocRef) {
    alertUser('Datenbank noch nicht bereit. Bitte kurz warten und es dann erneut versuchen.', 'error');
    return false;
  }
  return true;
}

function getNachrichtencenterGlobalContactsRef() {
  if (!canUseNachrichtencenterContactBook()) return null;
  return collection(db, 'artifacts', appId, 'public', 'data', 'nachrichtencenter_global_contacts');
}

function getNachrichtencenterPrivateContactsRef() {
  if (!canUseNachrichtencenterContactBook()) return null;
  return collection(db, 'artifacts', appId, 'public', 'data', 'nachrichtencenter_private_contacts', currentUser.mode, 'contacts');
}

function getNachrichtencenterContactByRefValue(refValue) {
  const raw = String(refValue || '');
  if (!raw) return null;
  if (raw.startsWith('global:')) {
    const id = raw.slice('global:'.length);
    return nachrichtencenterGlobalContacts[id] || null;
  }
  if (raw.startsWith('private:')) {
    const id = raw.slice('private:'.length);
    return nachrichtencenterPrivateContacts[id] || null;
  }
  return null;
}

function getNachrichtencenterContactDocRefFromRefValue(refValue) {
  const raw = String(refValue || '');
  if (!raw) return null;
  if (raw.startsWith('global:')) {
    const id = raw.slice('global:'.length);
    const col = getNachrichtencenterGlobalContactsRef();
    if (!col || !id) return null;
    return doc(col, id);
  }
  if (raw.startsWith('private:')) {
    const id = raw.slice('private:'.length);
    const col = getNachrichtencenterPrivateContactsRef();
    if (!col || !id) return null;
    return doc(col, id);
  }
  return null;
}

async function syncNachrichtencenterRecipientDisplayFromRef() {
  const display = document.getElementById('nachrichtencenterRecipientDisplay');
  const refInput = document.getElementById('nachrichtencenterRecipientRef');
  const keyInput = document.getElementById('nachrichtencenterRecipientKey');
  if (!display || !refInput) return;

  const refs = parseNachrichtencenterRecipientRefs(refInput.value);
  if (refs.length === 0) {
    display.innerHTML = '<span class="text-gray-400 italic">Kein Empfänger ausgewählt</span>';
    if (keyInput) keyInput.value = '';
    return;
  }

  const badges = [];
  for (const refValue of refs) {
    let contact = getNachrichtencenterContactByRefValue(refValue);
    if (!contact) {
      try {
        const docRef = getNachrichtencenterContactDocRefFromRefValue(refValue);
        if (docRef) {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            contact = { id: snap.id, ...snap.data() };
          }
        }
      } catch (e) {
        console.warn('Nachrichtencenter: Empfänger konnte nicht geladen werden:', e);
      }
    }

    if (!contact) continue;
    const typeLabel = String(contact.type || 'User') === 'Gruppe' ? 'Gruppe' : 'User';
    badges.push(
      `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">` +
      `<span class="bg-white/70 text-blue-900 px-2 py-0.5 rounded-full text-[10px] font-semibold">${typeLabel}</span>` +
      `<span>${contact.name || '—'}</span>` +
      `</span>`
    );
  }

  if (badges.length === 0) {
    display.innerHTML = '<span class="text-gray-400 italic">Empfänger nicht gefunden</span>';
    if (keyInput) keyInput.value = '';
    return;
  }

  display.innerHTML = badges.join('');
  if (keyInput) keyInput.value = '';
}

function parseNachrichtencenterRecipientRefs(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(v => String(v || '').trim()).filter(Boolean);
  } catch (e) {
  }
  return [s];
}

function stringifyNachrichtencenterRecipientRefs(refs) {
  const arr = (refs || []).map(v => String(v || '').trim()).filter(Boolean);
  return JSON.stringify(Array.from(new Set(arr)));
}

function setNachrichtencenterContactsScope(scope) {
  nachrichtencenterActiveScope = scope === 'private' ? 'private' : 'global';
  const tabGlobal = document.getElementById('nachrichtencenterContactsTabGlobal');
  const tabPrivate = document.getElementById('nachrichtencenterContactsTabPrivate');
  const listGlobal = document.getElementById('nachrichtencenterContactsListGlobal');
  const listPrivate = document.getElementById('nachrichtencenterContactsListPrivate');

  if (tabGlobal && tabPrivate) {
    tabGlobal.classList.toggle('bg-white', nachrichtencenterActiveScope === 'global');
    tabGlobal.classList.toggle('shadow', nachrichtencenterActiveScope === 'global');
    tabGlobal.classList.toggle('text-indigo-600', nachrichtencenterActiveScope === 'global');
    tabPrivate.classList.toggle('bg-white', nachrichtencenterActiveScope === 'private');
    tabPrivate.classList.toggle('shadow', nachrichtencenterActiveScope === 'private');
    tabPrivate.classList.toggle('text-indigo-600', nachrichtencenterActiveScope === 'private');
  }
  if (listGlobal && listPrivate) {
    listGlobal.classList.toggle('hidden', nachrichtencenterActiveScope !== 'global');
    listPrivate.classList.toggle('hidden', nachrichtencenterActiveScope !== 'private');
  }
}

function renderNachrichtencenterContactLists() {
  const listGlobal = document.getElementById('nachrichtencenterContactsListGlobal');
  const listPrivate = document.getElementById('nachrichtencenterContactsListPrivate');
  if (!listGlobal || !listPrivate) return;

  const refInput = document.getElementById('nachrichtencenterRecipientRef');
  const selectedFromInput = refInput ? parseNachrichtencenterRecipientRefs(refInput.value) : [];
  const selectedRefs = new Set([ ...Array.from(nachrichtencenterSelectedRefs || []), ...selectedFromInput ]);

  const renderList = (scope, container, contactsMap) => {
    const contacts = Object.values(contactsMap || {}).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
    if (contacts.length === 0) {
      container.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Kontakte gefunden.</p>';
      return;
    }
    container.innerHTML = contacts.map(c => {
      const refValue = `${scope === 'private' ? 'private:' : 'global:'}${c.id}`;
      const isChecked = selectedRefs.has(refValue) ? 'checked' : '';
      const isSelfContact = Boolean(c.isSelfContact);
      const canEdit = !isSelfContact && String(c.createdByAppUserId || '') === String(currentUser?.mode || '');
      const keyPreview = c.key ? `${String(c.key).substring(0, 4)}...${String(c.key).substring(Math.max(0, String(c.key).length - 4))}` : '—';
      const typeLabel = String(c.type || 'User') === 'Gruppe' ? 'Gruppe' : 'User';
      return `
        <div class="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
          <label class="flex items-center gap-3 cursor-pointer flex-grow">
            <input type="checkbox" value="${refValue}" class="h-4 w-4 nachrichtencenter-contact-checkbox" ${isChecked}>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-gray-800">${c.name || '—'}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">${typeLabel}</span>
              </div>
              <p class="text-xs text-gray-500 font-mono">${keyPreview}</p>
            </div>
          </label>
          <div class="flex items-center gap-1 flex-shrink-0">
            ${canEdit ? `<button data-contact-ref="${refValue}" class="nachrichtencenter-edit-contact-btn p-2 text-blue-500 hover:bg-blue-100 rounded-full" title="Bearbeiten">✎</button>` : ''}
            ${canEdit ? `<button data-contact-ref="${refValue}" class="nachrichtencenter-delete-contact-btn p-2 text-red-500 hover:bg-red-100 rounded-full" title="Löschen">🗑</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  };

  renderList('global', listGlobal, nachrichtencenterGlobalContacts);
  renderList('private', listPrivate, nachrichtencenterPrivateContacts);
}

function startNachrichtencenterContactListeners() {
  if (!canUseNachrichtencenterContactBook()) return;

  const globalRef = getNachrichtencenterGlobalContactsRef();
  const privateRef = getNachrichtencenterPrivateContactsRef();
  if (!globalRef || !privateRef) return;

  if (unsubscribeNachrichtencenterGlobal) {
    unsubscribeNachrichtencenterGlobal();
    unsubscribeNachrichtencenterGlobal = null;
  }
  if (unsubscribeNachrichtencenterPrivate) {
    unsubscribeNachrichtencenterPrivate();
    unsubscribeNachrichtencenterPrivate = null;
  }

  unsubscribeNachrichtencenterGlobal = onSnapshot(globalRef, (snap) => {
    nachrichtencenterGlobalContacts = {};
    snap.forEach(d => { nachrichtencenterGlobalContacts[d.id] = { id: d.id, ...d.data() }; });
    renderNachrichtencenterContactLists();
    syncNachrichtencenterRecipientDisplayFromRef();
  }, (err) => {
    console.warn('Nachrichtencenter: Globales Adressbuch konnte nicht geladen werden:', err);
  });

  unsubscribeNachrichtencenterPrivate = onSnapshot(privateRef, (snap) => {
    nachrichtencenterPrivateContacts = {};
    snap.forEach(d => { nachrichtencenterPrivateContacts[d.id] = { id: d.id, ...d.data() }; });
    renderNachrichtencenterContactLists();
    syncNachrichtencenterRecipientDisplayFromRef();
  }, (err) => {
    console.warn('Nachrichtencenter: Privates Adressbuch konnte nicht geladen werden:', err);
  });
}

function resetNachrichtencenterContactForm() {
  const title = document.getElementById('nachrichtencenterContactsFormTitle');
  const editingId = document.getElementById('nachrichtencenterEditingContactId');
  const typeInput = document.getElementById('nachrichtencenterContactType');
  const nameInput = document.getElementById('nachrichtencenterContactName');
  const keyInput = document.getElementById('nachrichtencenterContactKey');
  if (title) title.textContent = 'Neuen Kontakt anlegen';
  if (editingId) editingId.value = '';
  if (typeInput) typeInput.value = 'User';
  if (nameInput) nameInput.value = '';
  if (keyInput) keyInput.value = '';
}

async function saveNachrichtencenterContactFromForm() {
  if (!canUseNachrichtencenterContactBook()) {
    alertUser('Datenbank/Benutzer noch nicht bereit. Bitte kurz warten.', 'error');
    return;
  }
  const typeInput = document.getElementById('nachrichtencenterContactType');
  const nameInput = document.getElementById('nachrichtencenterContactName');
  const keyInput = document.getElementById('nachrichtencenterContactKey');
  const editingIdInput = document.getElementById('nachrichtencenterEditingContactId');
  if (!typeInput || !nameInput || !keyInput || !editingIdInput) return;

  const type = String(typeInput.value || 'User') === 'Gruppe' ? 'Gruppe' : 'User';
  const name = String(nameInput.value || '').trim();
  const key = String(keyInput.value || '').trim();
  if (!name || !key) {
    alertUser('Bitte Anzeigename und Pushover-Key eingeben.', 'error');
    return;
  }

  const contactId = String(editingIdInput.value || '').trim();
  const isEdit = Boolean(contactId);

  const selfContactId = getNachrichtencenterSelfContactId();
  if (isEdit && selfContactId && contactId === selfContactId) {
    alertUser('Dieser Eintrag wird automatisch verwaltet und kann nicht bearbeitet werden.', 'error');
    return;
  }

  try {
    if (nachrichtencenterActiveScope === 'global') {
      const col = getNachrichtencenterGlobalContactsRef();
      if (!col) return;
      if (isEdit) {
        await updateDoc(doc(col, contactId), { type, name, key, updatedAt: serverTimestamp(), updatedByAppUserId: currentUser.mode });
        alertUser('Kontakt aktualisiert.', 'success');
      } else {
        await addDoc(col, { type, name, key, createdAt: serverTimestamp(), createdByAppUserId: currentUser.mode, createdByName: currentUser.displayName || currentUser.mode, createdByAuthUid: auth?.currentUser?.uid || null });
        alertUser('Kontakt gespeichert.', 'success');
      }
    } else {
      const col = getNachrichtencenterPrivateContactsRef();
      if (!col) return;
      if (isEdit) {
        await updateDoc(doc(col, contactId), { type, name, key, updatedAt: serverTimestamp(), updatedByAppUserId: currentUser.mode });
        alertUser('Kontakt aktualisiert.', 'success');
      } else {
        await addDoc(col, { type, name, key, createdAt: serverTimestamp(), createdByAppUserId: currentUser.mode, createdByName: currentUser.displayName || currentUser.mode, createdByAuthUid: auth?.currentUser?.uid || null });
        alertUser('Kontakt gespeichert.', 'success');
      }
    }
  } catch (e) {
    console.error('Nachrichtencenter: Fehler beim Speichern des Kontakts:', e);
    alertUser('Fehler beim Speichern des Kontakts.', 'error');
    return;
  }

  resetNachrichtencenterContactForm();
}

export function openNachrichtencenterContactBook() {
  ensureNachrichtencenterSelfContact().catch((e) => {
    console.warn('Nachrichtencenter: Eigener Kontakt konnte nicht synchronisiert werden:', e);
  });
  startNachrichtencenterContactListeners();
  renderNachrichtencenterContactLists();
  resetNachrichtencenterContactForm();
  setNachrichtencenterContactsScope(nachrichtencenterActiveScope);
  const modal = document.getElementById('nachrichtencenterContactBookModal');
  if (modal) modal.style.display = 'flex';
}

async function deleteNachrichtencenterContactByRef(refValue) {
  const contact = getNachrichtencenterContactByRefValue(refValue);
  if (!contact) return;
  if (contact.isSelfContact) {
    alertUser('Dieser Eintrag wird automatisch verwaltet und kann nicht gelöscht werden.', 'error');
    return;
  }
  if (String(contact.createdByAppUserId || '') !== String(currentUser?.mode || '')) {
    alertUser('Du darfst nur eigene Einträge löschen.', 'error');
    return;
  }
  const docRef = getNachrichtencenterContactDocRefFromRefValue(refValue);
  if (!docRef) return;
  try {
    await deleteDoc(docRef);
    alertUser('Kontakt gelöscht.', 'success');
  } catch (e) {
    console.error('Nachrichtencenter: Fehler beim Löschen:', e);
    alertUser('Fehler beim Löschen.', 'error');
  }
}

// ---------- IDMPOTENTE MODAL-LISTENER (ein Handler für alle relevanten Buttons) ----------
export function ensureModalListeners() {
  if (window.__notruf_modal_listeners_installed) return;
  window.__notruf_modal_listeners_installed = true;

  // Delegierter Click-Handler (capture phase = true um frühe Reaktion zu ermöglichen)
  document.addEventListener('click', async (e) => {
    try {
      // -------------------- CONTACT Modal --------------------
      if (e.target.closest('#contactBookCloseButton')) {
        const modal = document.getElementById('contactBookModal');
        if (modal) modal.style.display = 'none';
        return;
      }

      if (e.target.closest('#contactAddButton')) {
        const typeInput = document.getElementById('contactIsGroup');
        const nameInput = document.getElementById('contactName');
        const keyInput = document.getElementById('contactUserKey');
        if (!typeInput || !nameInput || !keyInput) { alertUser('Fehler: Formularfelder fehlen.', 'error'); return; }

        const type = typeInput.value;
        const name = nameInput.value.trim();
        const key = keyInput.value.trim();
        if (!name || !key) { alertUser('Bitte Name und Key eingeben.', 'error'); return; }

        if (!canSaveToNotrufSettings()) return;

        if (!notrufSettings.contacts) notrufSettings.contacts = [];
        const newContact = { id: Date.now(), type, name, key };
        notrufSettings.contacts.push(newContact);

        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          nameInput.value = ''; keyInput.value = ''; typeInput.value = 'User';
          alertUser('Kontakt erfolgreich gespeichert.', 'success');
          if (typeof renderContactBook === 'function') renderContactBook();
        } catch (err) {
          console.error('Fehler beim Speichern des Kontakts:', err);
          alertUser('Fehler beim Speichern des Kontakts. Siehe Konsole.', 'error');
          notrufSettings.contacts = (notrufSettings.contacts || []).filter(c => c.id !== newContact.id);
        }
        return;
      }

      if (e.target.closest('.delete-contact-btn')) {
        const deleteContactBtn = e.target.closest('.delete-contact-btn');
        const contactId = parseInt(deleteContactBtn.dataset.contactId);
        if (isNaN(contactId)) return;
        if (!confirm('Kontakt wirklich löschen?')) return;
        if (!canSaveToNotrufSettings()) return;
        notrufSettings.contacts = (notrufSettings.contacts || []).filter(c => c.id !== contactId);
        (notrufSettings.modes || []).forEach(m => {
          if (m.config && m.config.userKeys) m.config.userKeys = m.config.userKeys.filter(uk => uk.id !== contactId);
        });
        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          alertUser('Kontakt gelöscht', 'success');
          if (typeof renderContactBook === 'function') renderContactBook();
        } catch (err) {
          console.error('Fehler beim Löschen des Kontakts:', err);
          alertUser('Fehler beim Löschen des Kontakts.', 'error');
        }
        return;
      }

      if (e.target.closest('#contactBookApplyButton')) {
        const modal = document.getElementById('contactBookModal');
        const display = document.getElementById('notrufUserKeyDisplay');
        if (modal && display) {
          display.innerHTML = '';
          modal.querySelectorAll('.contact-checkbox:checked').forEach(cb => {
            const id = parseInt(cb.value); if (isNaN(id)) return;
            const c = (notrufSettings.contacts || []).find(x => x.id === id);
            if (c) display.innerHTML += `<span class="contact-badge" data-contact-id="${c.id}">${c.name}</span>`;
          });
        }
        if (modal) modal.style.display = 'none';
        return;
      }

      // -------------------- API TOKEN Modal --------------------
      if (e.target.closest('#apiTokenBookCloseButton')) {
        const modal = document.getElementById('apiTokenBookModal');
        if (modal) modal.style.display = 'none';
        return;
      }

      if (e.target.closest('#apiTokenAddButton')) {
        const nameInput = document.getElementById('apiTokenName');
        const keyInput = document.getElementById('apiTokenKey');
        if (!nameInput || !keyInput) { alertUser('Fehler: Formularfelder fehlen.', 'error'); return; }

        const name = nameInput.value.trim();
        const key = keyInput.value.trim();
        if (!name || !key) { alertUser('Bitte Bezeichnung und Key eingeben.', 'error'); return; }

        if (!canSaveToNotrufSettings()) return;

        if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
        const newToken = { id: Date.now(), name, key };
        notrufSettings.apiTokens.push(newToken);

        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          nameInput.value = ''; keyInput.value = '';
          alertUser('API-Token erfolgreich gespeichert.', 'success');
          if (typeof renderApiTokenBook === 'function') renderApiTokenBook();
        } catch (err) {
          console.error('Fehler beim Speichern des API-Tokens:', err);
          alertUser('Fehler beim Speichern des API-Tokens. Siehe Konsole.', 'error');
          notrufSettings.apiTokens = (notrufSettings.apiTokens || []).filter(t => t.id !== newToken.id);
        }
        return;
      }

      if (e.target.closest('.delete-api-token-btn')) {
        const deleteTokenBtn = e.target.closest('.delete-api-token-btn');
        const tokenId = parseInt(deleteTokenBtn.dataset.tokenId);
        if (isNaN(tokenId)) return;
        if (!confirm('Token wirklich löschen?')) return;
        if (!canSaveToNotrufSettings()) return;
        notrufSettings.apiTokens = (notrufSettings.apiTokens || []).filter(t => t.id !== tokenId);
        (notrufSettings.modes || []).forEach(m => { if (m.config && m.config.selectedApiTokenId === tokenId) m.config.selectedApiTokenId = null; });
        if (tempSelectedApiTokenId === tokenId) tempSelectedApiTokenId = null;
        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          alertUser('Token gelöscht', 'success');
          if (typeof renderApiTokenBook === 'function') renderApiTokenBook();
        } catch (err) {
          console.error('Fehler beim Löschen des Tokens:', err);
          alertUser('Fehler beim Löschen des Tokens.', 'error');
        }
        return;
      }

      if (e.target.closest('#apiTokenBookApplyButton')) {
        const modal = document.getElementById('apiTokenBookModal');
        const display = document.getElementById('notrufApiTokenDisplay');
        if (modal && display) {
          const selectedRadio = modal.querySelector('.api-token-radio:checked');
          if (selectedRadio) {
            const tokenId = parseInt(selectedRadio.value);
            const token = (notrufSettings.apiTokens || []).find(t => t.id === tokenId);
            if (token) {
              tempSelectedApiTokenId = tokenId;
              display.innerHTML = `<span class="api-token-badge" data-token-id="${token.id}">${token.name}</span>`;
            } else {
              tempSelectedApiTokenId = null;
              display.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
            }
          } else {
            tempSelectedApiTokenId = null;
            display.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
          }
        }
        if (modal) modal.style.display = 'none';
        return;
      }

      // -------------------- SOUND Modal --------------------
      if (e.target.closest('#soundBookCloseButton')) {
        const modal = document.getElementById('soundBookModal');
        if (modal) modal.style.display = 'none';
        return;
      }

      if (e.target.closest('#soundAddButton')) {
        const codeInput = document.getElementById('soundCode');
        const customNameInput = document.getElementById('soundCustomName');
        const useCustomCheckbox = document.getElementById('soundUseCustomName');
        if (!codeInput || !customNameInput || !useCustomCheckbox) { alertUser('Fehler: Formularfelder fehlen.', 'error'); return; }

        const code = codeInput.value.trim();
        const useCustom = useCustomCheckbox.checked;
        const customName = customNameInput.value.trim();

        if (!code || (useCustom && !customName)) { alertUser('Bitte Soundcode und ggf. eigenen Namen eingeben.', 'error'); return; }

        if (!canSaveToNotrufSettings()) return;

        if (!notrufSettings.sounds) notrufSettings.sounds = [];
        const newSound = { id: Date.now(), code, useCustomName: useCustom, customName: useCustom ? customName : null };
        notrufSettings.sounds.push(newSound);

        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          codeInput.value = ''; useCustomCheckbox.checked = false; customNameInput.value = ''; customNameInput.classList.add('hidden');
          alertUser('Sound erfolgreich gespeichert.', 'success');
          if (typeof renderSoundBook === 'function') renderSoundBook();
          renderNachrichtencenterSoundOptions();
        } catch (err) {
          console.error('Fehler beim Speichern des Sounds:', err);
          alertUser('Fehler beim Speichern des Sounds. Siehe Konsole.', 'error');
          notrufSettings.sounds = (notrufSettings.sounds || []).filter(s => s.id !== newSound.id);
        }
        return;
      }

      if (e.target.closest('.delete-sound-btn')) {
        const deleteSoundBtn = e.target.closest('.delete-sound-btn');
        const soundId = parseInt(deleteSoundBtn.dataset.soundId);
        if (isNaN(soundId)) return;
        if (!confirm('Sound wirklich löschen?')) return;
        if (!canSaveToNotrufSettings()) return;
        notrufSettings.sounds = (notrufSettings.sounds || []).filter(s => s.id !== soundId);
        (notrufSettings.modes || []).forEach(m => { if (m.config && m.config.selectedSoundId === soundId) m.config.selectedSoundId = null; });
        if (tempSelectedSoundId === soundId) tempSelectedSoundId = null;
        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          alertUser('Sound gelöscht', 'success');
          if (typeof renderSoundBook === 'function') renderSoundBook();
          renderNachrichtencenterSoundOptions();
        } catch (err) {
          console.error('Fehler beim Löschen des Sounds:', err);
          alertUser('Fehler beim Löschen des Sounds.', 'error');
        }
        return;
      }

      if (e.target.closest('#soundBookApplyButton')) {
        const modal = document.getElementById('soundBookModal');
        const display = document.getElementById('notrufSoundDisplay');
        if (modal && display) {
          const selectedRadio = modal.querySelector('.sound-radio:checked');
          if (selectedRadio && selectedRadio.value !== 'default') {
            const soundId = parseInt(selectedRadio.value);
            const sound = (notrufSettings.sounds || []).find(s => s.id === soundId);
            if (sound) {
              tempSelectedSoundId = soundId;
              const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
              display.innerHTML = `<span class="sound-badge" data-sound-id="${sound.id}">${displayName}</span>`;
            } else {
              tempSelectedSoundId = null;
              display.innerHTML = '<span class="text-gray-400 italic">Sound nicht gefunden</span>';
            }
          } else {
            tempSelectedSoundId = null;
            display.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
          }
        }
        if (modal) modal.style.display = 'none';
        return;
      }

      // -------------------- NACHRICHTENCENTER CONTACTBOOK MODAL --------------------
      if (e.target.closest('#nachrichtencenterOpenContactBook')) {
        openNachrichtencenterContactBook();
        return;
      }
      if (e.target.closest('#nachrichtencenterContactBookCloseButton')) {
        const modal = document.getElementById('nachrichtencenterContactBookModal');
        if (modal) modal.style.display = 'none';
        return;
      }
      if (e.target.closest('#nachrichtencenterContactsTabGlobal')) {
        setNachrichtencenterContactsScope('global');
        return;
      }
      if (e.target.closest('#nachrichtencenterContactsTabPrivate')) {
        setNachrichtencenterContactsScope('private');
        return;
      }
      if (e.target.closest('#nachrichtencenterContactSaveButton')) {
        await saveNachrichtencenterContactFromForm();
        return;
      }
      const editNcBtn = e.target.closest('.nachrichtencenter-edit-contact-btn');
      if (editNcBtn) {
        const refValue = String(editNcBtn.dataset.contactRef || '');
        const contact = getNachrichtencenterContactByRefValue(refValue);
        if (!contact) return;
        if (contact.isSelfContact) {
          alertUser('Dieser Eintrag wird automatisch verwaltet und kann nicht bearbeitet werden.', 'error');
          return;
        }
        if (String(contact.createdByAppUserId || '') !== String(currentUser?.mode || '')) {
          alertUser('Du darfst nur eigene Einträge bearbeiten.', 'error');
          return;
        }
        const title = document.getElementById('nachrichtencenterContactsFormTitle');
        const editingId = document.getElementById('nachrichtencenterEditingContactId');
        const typeInput = document.getElementById('nachrichtencenterContactType');
        const nameInput = document.getElementById('nachrichtencenterContactName');
        const keyInput = document.getElementById('nachrichtencenterContactKey');
        if (title) title.textContent = 'Kontakt bearbeiten';
        if (editingId) editingId.value = String(contact.id);
        if (typeInput) typeInput.value = String(contact.type || 'User') === 'Gruppe' ? 'Gruppe' : 'User';
        if (nameInput) nameInput.value = String(contact.name || '');
        if (keyInput) keyInput.value = String(contact.key || '');
        return;
      }
      const deleteNcBtn = e.target.closest('.nachrichtencenter-delete-contact-btn');
      if (deleteNcBtn) {
        const refValue = String(deleteNcBtn.dataset.contactRef || '');
        if (!refValue) return;
        const contact = getNachrichtencenterContactByRefValue(refValue);
        if (contact && contact.isSelfContact) {
          alertUser('Dieser Eintrag wird automatisch verwaltet und kann nicht gelöscht werden.', 'error');
          return;
        }
        if (!confirm('Kontakt wirklich löschen?')) return;
        await deleteNachrichtencenterContactByRef(refValue);
        return;
      }
      const checkboxNc = e.target.closest('.nachrichtencenter-contact-checkbox');
      if (checkboxNc) {
        const refValue = String(checkboxNc.value || '');
        if (!refValue) return;
        if (checkboxNc.checked) nachrichtencenterSelectedRefs.add(refValue);
        else nachrichtencenterSelectedRefs.delete(refValue);
        return;
      }
      if (e.target.closest('#nachrichtencenterContactBookApplyButton')) {
        const modal = document.getElementById('nachrichtencenterContactBookModal');
        const selectedNodes = modal ? modal.querySelectorAll('.nachrichtencenter-contact-checkbox:checked') : [];
        const selectedRefs = Array.from(selectedNodes || []).map(n => String(n.value || '')).filter(Boolean);
        
        // Kontextprüfung: NOTRUF vs Nachrichtencenter (prüft Sichtbarkeit, nicht nur Existenz)
        const notrufDisplay = document.getElementById('notrufUserKeyDisplay');
        const notrufCard = document.getElementById('card-notruf-modes');
        const isNotrufContext = notrufDisplay && notrufCard && !notrufCard.classList.contains('hidden');
        
        if (isNotrufContext) {
          // NOTRUF-Kontext: Übernehme Auswahl in notrufUserKeyDisplay
          notrufDisplay.innerHTML = '';
          for (const refValue of selectedRefs) {
            const contact = getNachrichtencenterContactByRefValue(refValue);
            if (contact) {
              notrufDisplay.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-ref="${refValue}">${contact.name || '—'}</span>`;
            }
          }
        } else {
          // Nachrichtencenter-Kontext: Übernehme Auswahl in nachrichtencenterRecipientRef
          const refInput = document.getElementById('nachrichtencenterRecipientRef');
          const keyInput = document.getElementById('nachrichtencenterRecipientKey');
          const payload = stringifyNachrichtencenterRecipientRefs(selectedRefs);
          if (refInput) refInput.value = payload;
          if (keyInput) keyInput.value = '';
          await syncNachrichtencenterRecipientDisplayFromRef();
        }
        
        if (modal) modal.style.display = 'none';
        nachrichtencenterSelectedRefs.clear();
        return;
      }

    } catch (outerErr) {
      console.error('Fehler im notruf Modal-Handler:', outerErr);
    }
  }, true);
}

// ---------- FLIC / UI Funktionen (gekürzt/konzentriert) ----------
// Diese Funktionen habe ich bereinigt, wie sie in deinem Post waren.
// Wenn du zusätzliche Logik hattest, kannst du die weiteren Details ergänzen.

function populateFlicAssignmentSelectors() {
  const selector = document.getElementById('flic-editor-selector');
  if (!selector) return;
  const modes = notrufSettings.modes || [];
  let optionsHTML = '<option value="">Kein Modus zugewiesen</option>';
  modes.forEach(mode => {
    optionsHTML += `<option value="${mode.id}">${mode.title}</option>`;
  });
  selector.innerHTML = optionsHTML;
}

function updateFlicColumnDisplays() {
  const modes = notrufSettings.modes || [];
  const assignments = notrufSettings.flicAssignments || { einfach: null, doppel: null, halten: null };

  ['einfach', 'doppel', 'halten'].forEach(klickTyp => {
    const nameDisplay = document.getElementById(`flicDisplayModeName-${klickTyp}`);
    const descDisplay = document.getElementById(`flicDisplayModeDesc-${klickTyp}`);
    if (!nameDisplay || !descDisplay) return;
    const assignedModeId = assignments[klickTyp];
    const assignedMode = modes.find(m => m.id === assignedModeId);
    if (assignedMode) {
      nameDisplay.textContent = assignedMode.title;
      nameDisplay.title = assignedMode.title;
      descDisplay.textContent = assignedMode.description || '(Keine Kurzbeschreibung)';
    } else {
      nameDisplay.textContent = 'Kein Modus';
      nameDisplay.title = 'Kein Modus';
      descDisplay.textContent = '';
    }
  });
}

// 1:1 ersetzen: updateFlicEditorDetails - zeigt jetzt Titel, Kurzbeschreibung, API-Token-Name, Pushover-Title, Sound + Empfänger, Nachricht, Prio, Retry
function updateFlicEditorDetails(selectedModeId) {
    const detailsDisplay = document.getElementById('flic-editor-details');
    if (!detailsDisplay) {
        console.error("updateFlicEditorDetails: Element #flic-editor-details nicht gefunden!");
        return;
    }

    const modes = notrufSettings.modes || [];
    const selectedMode = modes.find(m => m.id === selectedModeId);

    if (!selectedMode) {
        detailsDisplay.innerHTML = '<p class="text-sm text-gray-500">Kein Modus zugewiesen.</p>';
        return;
    }

    const config = selectedMode.config || {};

    // Title / Kurzbeschreibung
    const modeTitle = selectedMode.title || '–';
    const modeDesc = selectedMode.description || '';

    // Pushover title (Titel der Benachrichtigung)
    const pushoverTitle = config.title || '';

    // API Token (nur Name anzeigen, nicht der Key)
    let apiTokenName = 'Kein Token ausgewählt';
    if (typeof config.selectedApiTokenId !== 'undefined' && config.selectedApiTokenId !== null) {
        const tok = (notrufSettings.apiTokens || []).find(t => String(t.id) === String(config.selectedApiTokenId));
        if (tok) apiTokenName = tok.name || apiTokenName;
        else apiTokenName = 'Token nicht gefunden';
    }

    // Sound
    let soundLabel = 'Standard (pushover)';
    if (typeof config.selectedSoundId !== 'undefined' && config.selectedSoundId !== null) {
        const snd = (notrufSettings.sounds || []).find(s => String(s.id) === String(config.selectedSoundId));
        if (snd) {
          const displayName = snd.useCustomName && snd.customName ? snd.customName : snd.code;
          soundLabel = displayName;
        } else {
          soundLabel = 'Sound nicht gefunden';
        }
    }

    // Empfänger (neues Nachrichtencenter-Kontaktbuch Format)
    const recipients = (config.userKeys || []).map(u => {
        if (u && typeof u === 'object' && u.name) return u.name;
        return '—';
    }).filter(Boolean).join(', ') || 'Niemand';

    // Nachricht + Prio/Retry
    const message = config.message || '(Keine)';
    const priority = (typeof config.priority !== 'undefined') ? config.priority : '0';
    const retry = (typeof config.retry !== 'undefined') ? config.retry : '0';

    // Baue das HTML für die Detail-Box
    detailsDisplay.innerHTML = `
        <div class="space-y-2 text-sm text-gray-800">
            <div>
                <p class="text-xs text-gray-500">Modus</p>
                <p class="font-semibold">${modeTitle}</p>
            </div>
            ${modeDesc ? `<div><p class="text-xs text-gray-500">Kurzbeschreibung</p><p class="text-sm text-gray-600">${modeDesc}</p></div>` : ''}
            <div>
                <p class="text-xs text-gray-500">API-Token</p>
                <p class="text-sm text-blue-700 font-medium">${apiTokenName}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Titel der Benachrichtigung</p>
                <p class="text-sm text-gray-700">${pushoverTitle || '<span class="text-gray-400 italic">(kein Titel)</span>'}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Sound</p>
                <p class="text-sm text-gray-700">${soundLabel}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Empfänger</p>
                <p class="text-sm text-gray-700">${recipients}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Nachricht</p>
                <p class="text-sm text-gray-700">"${message}"</p>
            </div>
            <div class="flex gap-4">
                <div>
                    <p class="text-xs text-gray-500">Prio</p>
                    <p class="text-sm text-gray-700">${priority}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500">Retry (s)</p>
                    <p class="text-sm text-gray-700">${retry}</p>
                </div>
        </div>
    `;
}

 function updateFlicEditorBox(klickTyp) {
  const title = document.getElementById('flic-editor-title');
  const selector = document.getElementById('flic-editor-selector');
  const detailsDisplay = document.getElementById('flic-editor-details');
  if (!title || !selector || !detailsDisplay) return;
  const assignments = notrufSettings.flicAssignments || { einfach: null, doppel: null, halten: null };
  title.textContent = `Modus für KLICK: ${klickTyp.toUpperCase()} ändern`;
  selector.value = assignments[klickTyp] ? assignments[klickTyp] : '';
  updateFlicEditorDetails(selector.value ? parseInt(selector.value) : null);
 }

 function renderModeEditorList() {
  const listContainer = document.getElementById('existingModesList');
  if (!listContainer) return;

  const modes = notrufSettings.modes || [];

  listContainer.style.maxHeight = '60vh';
  listContainer.style.overflowY = 'auto';
  listContainer.style.paddingRight = '8px';

  const editingModeId = document.getElementById('editingModeId') ? document.getElementById('editingModeId').value : null;

  if (modes.length === 0) {
    listContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Modi vorhanden.</p>';
    return;
  }

  listContainer.innerHTML = modes.map(mode => {
    const isEditing = editingModeId && String(editingModeId) === String(mode.id);
    const desc = mode.description ? `<p class="text-xs text-gray-500 truncate">${mode.description}</p>` : '';
    const containerClasses = isEditing
      ? 'mode-list-item flex justify-between items-center p-2 gap-3 bg-yellow-100 border border-yellow-300 rounded-md mb-2 is-editing'
      : 'mode-list-item flex justify-between items-center p-2 gap-3 bg-gray-50 rounded-md border mb-2';

    return `
      <div class="${containerClasses}" data-mode-id="${mode.id}">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm truncate">${mode.title}</p>
          ${desc}
        </div>
        <div class="flex items-center gap-2 ml-3">
          <button data-mode-id="${mode.id}" class="edit-mode-btn p-2 text-blue-500 hover:bg-blue-100 rounded-full" title="Bearbeiten">✎</button>
          <button data-mode-id="${mode.id}" class="delete-mode-btn p-2 text-red-500 hover:bg-red-100 rounded-full" title="Löschen">🗑</button>
        </div>
      </div>
    `;
  }).join('');
 }

 async function openModeConfigForm(modeId = null) {
  console.log('openModeConfigForm startet', modeId);
  const formContainer = document.getElementById('modeConfigFormContainer');
  if (!formContainer) return;

  const editingModeIdInput = document.getElementById('editingModeId');
  const titleInput = document.getElementById('notrufModeTitle');
  const descInput = document.getElementById('notrufModeDescInput');
  const pushoverTitleInput = document.getElementById('notrufTitle');
  const messageInput = document.getElementById('notrufMessage');
  const apiTokenDisplay = document.getElementById('notrufApiTokenDisplay');
  const soundDisplay = document.getElementById('notrufSoundDisplay');
  const userKeyDisplay = document.getElementById('notrufUserKeyDisplay');
  const retryCheckbox = document.getElementById('retryDeaktiviert');
  const retrySecondsInput = document.getElementById('retrySecondsInput');
  const formTitle = document.getElementById('modeConfigFormTitle');
  const saveBtn = document.getElementById('notrufSaveModeButton');
  const priorityButtons = document.querySelectorAll('#priority-buttons-container .priority-btn');

  if (!titleInput || !pushoverTitleInput || !messageInput) {
    console.error('openModeConfigForm: Form-Felder fehlen');
    return;
  }

  let mode = null;
  if (modeId !== null && typeof modeId !== 'undefined' && String(modeId).trim() !== '') {
    mode = (notrufSettings.modes || []).find(m => String(m.id) === String(modeId)) || null;
  }

  const config = mode && mode.config ? mode.config : {};

  if (editingModeIdInput) editingModeIdInput.value = mode ? String(mode.id) : '';
  titleInput.value = mode ? String(mode.title || '') : '';
  if (descInput) descInput.value = mode ? String(mode.description || '') : '';
  pushoverTitleInput.value = String(config.title || '');
  messageInput.value = String(config.message || '');

  const prio = typeof config.priority !== 'undefined' ? parseInt(config.priority, 10) : 0;
  const resolvedPrio = Number.isNaN(prio) ? 0 : prio;
  priorityButtons.forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
  const matchBtn = Array.from(priorityButtons).find(b => String(b.dataset.priority) === String(resolvedPrio)) || Array.from(priorityButtons).find(b => String(b.dataset.priority) === '0');
  if (matchBtn) matchBtn.classList.add('bg-indigo-600', 'text-white');

  const retry = typeof config.retry !== 'undefined' ? parseInt(config.retry, 10) : 30;
  const resolvedRetry = Number.isNaN(retry) ? 30 : retry;
  if (retryCheckbox && retrySecondsInput) {
    const disabled = resolvedRetry === 0;
    retryCheckbox.checked = disabled;
    retrySecondsInput.disabled = disabled;
    retrySecondsInput.value = disabled ? 30 : Math.max(30, resolvedRetry);
  }

  tempSelectedApiTokenId = typeof config.selectedApiTokenId !== 'undefined' ? config.selectedApiTokenId : null;
  if (apiTokenDisplay) {
    if (tempSelectedApiTokenId !== null) {
      const tok = (notrufSettings.apiTokens || []).find(t => String(t.id) === String(tempSelectedApiTokenId));
      apiTokenDisplay.innerHTML = tok
        ? `<span class="api-token-badge" data-token-id="${tok.id}">${tok.name}</span>`
        : '<span class="text-gray-400 italic">Token nicht gefunden</span>';
    } else {
      apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
    }
  }

  tempSelectedSoundId = typeof config.selectedSoundId !== 'undefined' ? config.selectedSoundId : null;
  if (soundDisplay) {
    if (tempSelectedSoundId !== null) {
      const snd = (notrufSettings.sounds || []).find(s => String(s.id) === String(tempSelectedSoundId));
      if (snd) {
        const displayName = snd.useCustomName && snd.customName ? snd.customName : snd.code;
        soundDisplay.innerHTML = `<span class="sound-badge" data-sound-id="${snd.id}">${displayName}</span>`;
      } else {
        soundDisplay.innerHTML = '<span class="text-gray-400 italic">Sound nicht gefunden</span>';
      }
    } else {
      soundDisplay.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
    }
  }

  if (userKeyDisplay) {
    userKeyDisplay.innerHTML = '';
    const keys = Array.isArray(config.userKeys) ? config.userKeys : [];
    keys.forEach(u => {
      // Neues Nachrichtencenter-Kontaktbuch Format: data-contact-ref
      const refValue = u && typeof u === 'object' && u.ref ? u.ref : null;
      const label = u && typeof u === 'object' && u.name ? u.name : '—';
      if (refValue) {
        userKeyDisplay.innerHTML += `<span class="contact-badge" data-contact-ref="${refValue}">${label}</span>`;
      }
    });
  }

  if (formTitle) formTitle.textContent = mode ? 'Modus bearbeiten' : 'Modus Konfigurieren';
  if (saveBtn) saveBtn.textContent = mode ? 'Änderung übernehmen' : 'Modus Speichern';

  formContainer.classList.remove('hidden');
  renderModeEditorList();
 }

 async function saveNotrufMode() {
  console.log('saveNotrufMode startet');
  const formContainer = document.getElementById('modeConfigFormContainer');
  if (!formContainer) return;

  const editingModeIdInput = document.getElementById('editingModeId');
  const titleInput = document.getElementById('notrufModeTitle');
  const descInput = document.getElementById('notrufModeDescInput');
  const pushoverTitleInput = document.getElementById('notrufTitle');
  const messageInput = document.getElementById('notrufMessage');
  const retryCheckbox = document.getElementById('retryDeaktiviert');
  const retrySecondsInput = document.getElementById('retrySecondsInput');

  if (!titleInput || !pushoverTitleInput || !messageInput) return;

  const editingModeId = editingModeIdInput ? String(editingModeIdInput.value || '').trim() : '';
  const title = titleInput.value.trim();
  const description = descInput ? descInput.value.trim() : '';
  const pushoverTitle = pushoverTitleInput.value.trim();
  const message = messageInput.value.trim();

  let priority = 0;
  const activePrioBtn = document.querySelector('.priority-btn.bg-indigo-600') || document.querySelector('.priority-btn[data-priority="0"]');
  if (activePrioBtn && activePrioBtn.dataset && typeof activePrioBtn.dataset.priority !== 'undefined') {
    priority = parseInt(activePrioBtn.dataset.priority, 10) || 0;
  }

  let retry = 30;
  if (retryCheckbox && retryCheckbox.checked) {
    retry = 0;
  } else if (retrySecondsInput) {
    const r = parseInt(retrySecondsInput.value, 10);
    retry = Number.isNaN(r) ? 30 : Math.max(30, r);
  }

  const selectedApiTokenId = typeof tempSelectedApiTokenId !== 'undefined' ? tempSelectedApiTokenId : null;
  const selectedSoundId = typeof tempSelectedSoundId !== 'undefined' ? tempSelectedSoundId : null;

  const userKeys = [];
  document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(b => {
    // Neues Nachrichtencenter-Kontaktbuch System: data-contact-ref statt data-contact-id
    const refValue = b.dataset && b.dataset.contactRef ? String(b.dataset.contactRef) : '';
    if (refValue) {
      const contact = getNachrichtencenterContactByRefValue(refValue);
      if (contact && contact.key) {
        userKeys.push({ ref: refValue, name: contact.name, key: contact.key });
      }
    }
  });

  if (!title) {
    alertUser('Bitte einen Titel für den Modus eingeben.', 'error');
    return;
  }

  const configObj = {
    title: pushoverTitle || '',
    message: message || '',
    priority: priority,
    retry: retry,
    selectedApiTokenId: selectedApiTokenId ?? null,
    selectedSoundId: selectedSoundId ?? null,
    userKeys: userKeys
  };

  if (!Array.isArray(notrufSettings.modes)) notrufSettings.modes = [];

  let savedModeId = null;
  if (editingModeId) {
    const idx = notrufSettings.modes.findIndex(m => String(m.id) === String(editingModeId));
    if (idx !== -1) {
      const existing = notrufSettings.modes[idx] || {};
      notrufSettings.modes[idx] = { ...existing, title, description, config: configObj };
      savedModeId = notrufSettings.modes[idx].id;
    } else {
      const newId = Date.now();
      notrufSettings.modes.push({ id: newId, title, description, config: configObj });
      savedModeId = newId;
    }
  } else {
    const newId = Date.now();
    notrufSettings.modes.push({ id: newId, title, description, config: configObj });
    savedModeId = newId;
  }

  if (!canSaveToNotrufSettings()) return;

  try {
    await setDoc(notrufSettingsDocRef, notrufSettings);
    alertUser('Modus erfolgreich gespeichert.', 'success');

    formContainer.classList.add('hidden');
    if (editingModeIdInput) editingModeIdInput.value = '';

    renderModeEditorList();
    populateFlicAssignmentSelectors();
    updateFlicColumnDisplays();

    const editorSelector = document.getElementById('flic-editor-selector');
    if (editorSelector && savedModeId) {
      try { editorSelector.value = String(savedModeId); } catch (e) { /* ignore */ }
    }

    tempSelectedApiTokenId = null;
    tempSelectedSoundId = null;
  } catch (err) {
    console.error('Fehler beim Speichern des Modus:', err);
    alertUser('Fehler beim Speichern des Modus. Siehe Konsole.', 'error');

    if (!editingModeId) {
      notrufSettings.modes = (notrufSettings.modes || []).filter(m => m.id !== savedModeId);
    }
  }
 }

 function renderContactBook() {
  ensureModalListeners();
  const list = document.getElementById('contactBookList');
  if (!list) return;

  const contacts = notrufSettings.contacts || [];
  const currentFormUserKeys = [];
  document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(b => currentFormUserKeys.push(parseInt(b.dataset.contactId)));

  if (contacts.length === 0) {
    list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Kontakte gefunden.</p>';
    return;
  }

  list.innerHTML = contacts.map(contact => {
    const isChecked = currentFormUserKeys.includes(contact.id) ? 'checked' : '';
    return `
      <div class="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
        <label class="flex items-center gap-3 cursor-pointer flex-grow">
          <input type="checkbox" value="${contact.id}" class="h-4 w-4 contact-checkbox" ${isChecked}>
          <div>
            <span class="font-semibold text-gray-800">${contact.name}</span>
            <p class="text-xs text-gray-500">${contact.type}: <span class="font-mono">${contact.key}</span></p>
          </div>
        </label>
        <button data-contact-id="${contact.id}" class="delete-contact-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0">🗑</button>
      </div>
    `;
  }).join('');
 }

 function renderApiTokenBook() {
  ensureModalListeners();
  const list = document.getElementById('apiTokenBookList');
  if (!list) return;
  const tokens = notrufSettings.apiTokens || [];
  const currentlySelectedId = tempSelectedApiTokenId;
  if (tokens.length === 0) {
    list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Tokens gefunden.</p>';
    return;
  }
  list.innerHTML = tokens.map(token => {
    const isChecked = token.id === currentlySelectedId ? 'checked' : '';
    return `
      <div class="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
        <label class="flex items-center gap-3 cursor-pointer flex-grow">
          <input type="radio" name="apiTokenSelection" value="${token.id}" class="h-4 w-4 api-token-radio" ${isChecked}>
          <div>
            <span class="font-semibold text-gray-800">${token.name}</span>
            <p class="text-xs text-gray-500 font-mono">${token.key.substring(0,4)}...${token.key.substring(Math.max(0, token.key.length-4))}</p>
          </div>
        </label>
        <button data-token-id="${token.id}" class="delete-api-token-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0">🗑</button>
      </div>
    `;
  }).join('');
}

function renderSoundBook() {
  ensureModalListeners();
  const list = document.getElementById('soundBookList');
  if (!list) return;
  const sounds = notrufSettings.sounds || [];
  const currentlySelectedId = tempSelectedSoundId;
  const placeholder = document.getElementById('sound-list-placeholder');
  if (sounds.length === 0) {
    list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine benutzerdefinierten Sounds gefunden.</p>';
    if (placeholder) placeholder.classList.remove('hidden');
    return;
  }
  if (placeholder) placeholder.classList.add('hidden');
  let html = `
    <label class="flex items-center gap-2 p-2 border-b font-semibold cursor-pointer">
      <input type="radio" name="soundSelection" value="default" class="h-4 w-4 sound-radio" ${currentlySelectedId === null ? 'checked' : ''}>
      <span>Standard (pushover)</span>
    </label>
  `;
  sounds.forEach(sound => {
    const isChecked = sound.id === currentlySelectedId ? 'checked' : '';
    const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
    const displayCode = sound.useCustomName && sound.customName ? `(${sound.code})` : '';
    html += `
      <div class="custom-sound-item flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
        <label class="flex items-center gap-3 cursor-pointer flex-grow">
          <input type="radio" name="soundSelection" value="${sound.id}" class="h-4 w-4 sound-radio" ${isChecked}>
          <div>
            <span class="font-semibold text-gray-800">${displayName}</span>
            <p class="text-xs text-gray-500 font-mono">${displayCode}</p>
          </div>
        </label>
        <button data-sound-id="${sound.id}" class="delete-sound-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0">🗑</button>
      </div>
    `;
  });
  list.innerHTML = html;
  // ensure default radio state
  const defaultRadio = list.querySelector('input[name="soundSelection"][value="default"]');
  if (defaultRadio) defaultRadio.checked = (currentlySelectedId === null);
}

function renderNachrichtencenterSoundOptions() {
  const select = document.getElementById('nachrichtencenterSound');
  if (!select) return;

  const currentValue = select.value;
  const sounds = notrufSettings.sounds || [];
  const options = ['<option value="">Standard (pushover)</option>'];

  sounds.forEach(sound => {
    const label = sound.useCustomName && sound.customName ? `${sound.customName} (${sound.code})` : sound.code;
    options.push(`<option value="${sound.code}">${label}</option>`);
  });

  select.innerHTML = options.join('');
  if (currentValue) {
    select.value = currentValue;
  }
}

function updateNachrichtencenterEmergencyVisibility() {
  const priorityEl = document.getElementById('nachrichtencenterPriority');
  const emergencyBox = document.getElementById('nachrichtencenterEmergencyOptions');
  if (!priorityEl || !emergencyBox) return;
  const isEmergency = String(priorityEl.value || '0') === '2';
  emergencyBox.classList.toggle('hidden', !isEmergency);
}

function initializeNotrufSettingsView() {
  const notrufView = document.getElementById('notrufSettingsView');
  if (!notrufView) {
    console.error("initializeNotrufSettingsView: Element #notrufSettingsView nicht gefunden!");
    return;
  }

  activeFlicEditorKlickTyp = null;

  const editorContainer = document.getElementById('flic-details-editor-container');
  if (editorContainer) editorContainer.classList.add('hidden');

  populateFlicAssignmentSelectors();
  updateFlicColumnDisplays();

  notrufView.querySelectorAll('.flic-column-block').forEach(col => {
    col.classList.remove('bg-indigo-100', 'border-indigo-400');
    col.classList.add('bg-gray-50', 'border-gray-200');
  });

  const modeEditorArea = document.getElementById('modeEditorArea');
  const modeConfigFormContainer = document.getElementById('modeConfigFormContainer');
  if (modeEditorArea) modeEditorArea.classList.add('hidden');
  if (modeConfigFormContainer) modeConfigFormContainer.classList.add('hidden');

  const assignmentCard = notrufView.querySelector('#card-flic-notruf .card');
  if (assignmentCard) assignmentCard.classList.remove('hidden');

  // Tabs
  const tabsContainer = notrufView.querySelector('#notruf-settings-tabs');
  if (tabsContainer && !tabsContainer.dataset.tabListenerAttached) {
    tabsContainer.addEventListener('click', (e) => {
      const clickedTab = e.target.closest('.settings-tab-btn');
      if (!clickedTab) return;
      const targetCardId = clickedTab.dataset.targetCard;
      const prompt = document.getElementById('notruf-prompt');
      const isAlreadyActive = clickedTab.classList.contains('bg-white');

      tabsContainer.querySelectorAll('.settings-tab-btn').forEach(tab => {
        tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
        tab.classList.add('text-gray-600');
      });
      notrufView.querySelectorAll('.notruf-settings-card').forEach(card => card.classList.add('hidden'));

      if (isAlreadyActive) {
        if (prompt) prompt.style.display = 'block';
      } else {
        if (prompt) prompt.style.display = 'none';
        clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
        clickedTab.classList.remove('text-gray-600');
        const targetCard = document.getElementById(targetCardId);
        if (targetCard) {
          targetCard.classList.remove('hidden');
          if (targetCardId === 'card-flic-notruf') {
            if (modeEditorArea) modeEditorArea.classList.add('hidden');
            if (assignmentCard) assignmentCard.classList.remove('hidden');
          }
        }
      }
    });
    tabsContainer.dataset.tabListenerAttached = 'true';
  }

  // Flic card main click logic (only attach once)
  const flicCard = document.getElementById('card-flic-notruf');
  if (flicCard && !flicCard.dataset.flicListenerAttached) {
    const editorSelector = document.getElementById('flic-editor-selector');
    if (editorSelector && !editorSelector.dataset.changeListenerAttached) {
      editorSelector.addEventListener('change', (e) => {
        if (!activeFlicEditorKlickTyp) return;
        const newModeId = e.target.value ? parseInt(e.target.value) : null;
        updateFlicEditorDetails(newModeId);
      });
      editorSelector.dataset.changeListenerAttached = 'true';
    }

    flicCard.addEventListener('click', async (e) => {
      const editorContainerLocal = document.getElementById('flic-details-editor-container');
      const modeEditorAreaLocal = document.getElementById('modeEditorArea');
      const assignmentAreaContainer = flicCard.querySelector('.card');

      const clickedColumn = e.target.closest('.flic-column-block');
      if (clickedColumn && editorContainerLocal) {
        const klickTyp = clickedColumn.dataset.klickTyp;
        flicCard.querySelectorAll('.flic-column-block').forEach(col => {
          col.classList.remove('bg-indigo-100', 'border-indigo-400');
          col.classList.add('bg-gray-50', 'border-gray-200');
        });
        if (klickTyp === activeFlicEditorKlickTyp) {
          editorContainerLocal.classList.add('hidden');
          activeFlicEditorKlickTyp = null;
        } else {
          activeFlicEditorKlickTyp = klickTyp;
          updateFlicEditorBox(klickTyp);
          editorContainerLocal.classList.remove('hidden');
          clickedColumn.classList.add('bg-indigo-100', 'border-indigo-400');
          clickedColumn.classList.remove('bg-gray-50', 'border-gray-200');
        }
        return;
      }

      const saveBtn = e.target.closest('#saveFlicAssignmentsBtn');
      if (saveBtn && editorContainerLocal) {
        if (!canSaveToNotrufSettings()) return;
        setButtonLoading(saveBtn, true);
        if (!activeFlicEditorKlickTyp) { setButtonLoading(saveBtn, false); return; }
        const selector = document.getElementById('flic-editor-selector');
        const newModeId = selector ? (selector.value ? parseInt(selector.value) : null) : null;
        if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = {};
        notrufSettings.flicAssignments[activeFlicEditorKlickTyp] = newModeId;
        try {
          await setDoc(notrufSettingsDocRef, notrufSettings);
          alertUser('Flic-Zuweisungen gespeichert!', 'success');
          updateFlicColumnDisplays();
          editorContainerLocal.classList.add('hidden');
          activeFlicEditorKlickTyp = null;
          flicCard.querySelectorAll('.flic-column-block').forEach(col => {
            col.classList.remove('bg-indigo-100', 'border-indigo-400');
            col.classList.add('bg-gray-50', 'border-gray-200');
          });
        } catch (err) {
          console.error('Fehler beim Speichern der Flic-Zuweisungen:', err);
          alertUser('Fehler beim Speichern.', 'error');
        } finally {
          setButtonLoading(saveBtn, false);
        }
        return;
      }

      if (e.target.closest('#notrufOpenModeEditor')) {
        if (assignmentAreaContainer) assignmentAreaContainer.classList.add('hidden');
        if (editorContainerLocal) editorContainerLocal.classList.add('hidden');
        if (modeEditorAreaLocal) modeEditorAreaLocal.classList.remove('hidden');
        activeFlicEditorKlickTyp = null;
        renderModeEditorList();
        const modeConfigForm = document.getElementById('modeConfigFormContainer');
        if (modeConfigForm) modeConfigForm.classList.add('hidden');
        return;
      }

      if (modeEditorAreaLocal && modeEditorAreaLocal.contains(e.target)) {
        if (e.target.closest('#notrufCloseModeEditor')) {
          modeEditorAreaLocal.classList.add('hidden');
          if (assignmentAreaContainer) assignmentAreaContainer.classList.remove('hidden');
          const modeConfigForm = document.getElementById('modeConfigFormContainer');
          if (modeConfigForm) modeConfigForm.classList.add('hidden');
          return;
        }
        if (e.target.closest('#notrufAddNewModeButton')) { openModeConfigForm(); return; }
        const editBtn = e.target.closest('.edit-mode-btn');
        if (editBtn && editBtn.dataset.modeId) { openModeConfigForm(editBtn.dataset.modeId); return; }
        const deleteBtn = e.target.closest('.delete-mode-btn');
        if (deleteBtn && deleteBtn.dataset.modeId) {
          const modeIdToDelete = parseInt(deleteBtn.dataset.modeId);
          if (isNaN(modeIdToDelete)) return;
          const modeToDelete = (notrufSettings.modes || []).find(m => m.id === modeIdToDelete);
          if (!modeToDelete) return;
          const confirmation = prompt(`Um den Modus "${modeToDelete.title}" unwiderruflich zu löschen, geben Sie bitte "MODI LÖSCHEN" ein:`);
          if (confirmation === 'MODI LÖSCHEN' && canSaveToNotrufSettings()) {
            notrufSettings.modes = (notrufSettings.modes || []).filter(m => m.id !== modeIdToDelete);
            if (notrufSettings.flicAssignments) {
              for (const klick in notrufSettings.flicAssignments) {
                if (notrufSettings.flicAssignments[klick] === modeIdToDelete) {
                  notrufSettings.flicAssignments[klick] = null;
                }
              }
            }
            try {
              await setDoc(notrufSettingsDocRef, notrufSettings);
              alertUser('Modus gelöscht!', 'success');
              renderModeEditorList();
              populateFlicAssignmentSelectors();
              updateFlicColumnDisplays();
            } catch (err) {
              console.error('Fehler beim Löschen des Modus:', err);
              alertUser('Fehler beim Löschen.', 'error');
            }
          } else if (confirmation !== null) {
            alertUser('Löschvorgang abgebrochen.', 'info');
          }
          return;
        }

        const cancelEditBtn = e.target.closest('#notrufCancelEditModeButton');
        if (cancelEditBtn) {
          const modeConfigForm = document.getElementById('modeConfigFormContainer');
          if (modeConfigForm) modeConfigForm.classList.add('hidden');
          tempSelectedApiTokenId = null;
          tempSelectedSoundId = null;
          return;
        }

        // Interaktionen im Mode-Config Formular
        const configForm = document.getElementById('modeConfigFormContainer');
        if (configForm && configForm.contains(e.target)) {
          if (e.target.closest('#notrufOpenContactBook')) {
            openNachrichtencenterContactBook();
            return;
          }
          if (e.target.closest('#notrufOpenApiTokenBook')) {
            renderApiTokenBook();
            const modal = document.getElementById('apiTokenBookModal');
            if (modal) modal.style.display = 'flex';
          }
          if (e.target.closest('#notrufOpenSoundBook')) {
            renderSoundBook();
            const modal = document.getElementById('soundBookModal');
            if (modal) modal.style.display = 'flex';
            return;
          }
          const prioBtn = e.target.closest('.priority-btn');
          if (prioBtn) {
            configForm.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
            prioBtn.classList.add('bg-indigo-600', 'text-white');
            return;
          }
          if (e.target.closest('#notrufSaveModeButton')) {
            await saveNotrufMode();
            return;
          }
        }
      } // Ende modeEditorArea contains
    }); // Ende flicCard click listener

    flicCard.dataset.flicListenerAttached = 'true';
  } // Ende flicCard listener attach

  // Retry checkbox (nur einmal)
  const configArea = document.getElementById('notrufConfigArea');
  const retryCheckbox = document.getElementById('retryDeaktiviert');
  const retrySecondsInput = document.getElementById('retrySecondsInput');
  if (configArea && retryCheckbox && retrySecondsInput && !configArea.dataset.retryListenerAttached) {
    retryCheckbox.addEventListener('change', (e) => {
      const isDisabled = e.target.checked;
      retrySecondsInput.disabled = isDisabled;
      if (!isDisabled && parseInt(retrySecondsInput.value) < 30) retrySecondsInput.value = 30;
    });
    configArea.dataset.retryListenerAttached = 'true';
  }

  // Stelle sicher, dass die Modal-Listener gesetzt sind
  ensureModalListeners();

  try {
    console.log('Nachrichtencenter Init startet');
    const titleEl = document.getElementById('nachrichtencenterTitle');
    const messageEl = document.getElementById('nachrichtencenterMessage');
    if (titleEl) titleEl.value = '';
    if (messageEl) messageEl.value = '';
    const recipientRefEl = document.getElementById('nachrichtencenterRecipientRef');
    const recipientKeyEl = document.getElementById('nachrichtencenterRecipientKey');
    if (recipientRefEl) recipientRefEl.value = '';
    if (recipientKeyEl) recipientKeyEl.value = '';

    nachrichtencenterSelectedRefs = new Set();
    saveUserSetting('nachrichtencenter_title', '');
    saveUserSetting('nachrichtencenter_message', '');
    saveUserSetting('nachrichtencenter_recipient_refs', '');
    saveUserSetting('nachrichtencenter_recipient_ref', '');

    const priorityEl = document.getElementById('nachrichtencenterPriority');
    const retryEl = document.getElementById('nachrichtencenterRetry');
    const expireEl = document.getElementById('nachrichtencenterExpire');
    if (priorityEl) priorityEl.value = '0';
    if (retryEl) retryEl.value = 30;
    if (expireEl) expireEl.value = 10800;
    renderNachrichtencenterSoundOptions();
    const soundEl = document.getElementById('nachrichtencenterSound');
    if (soundEl) soundEl.value = '';

    const expertToggle = document.getElementById('nachrichtencenterExpertToggle');
    const expertPanel = document.getElementById('nachrichtencenterExpertPanel');
    const expertIcon = document.getElementById('nachrichtencenterExpertToggleIcon');
    const expertText = document.getElementById('nachrichtencenterExpertToggleText');
    if (expertPanel && expertIcon && expertText) {
      expertPanel.classList.add('hidden');
      expertIcon.textContent = '▸';
      expertText.textContent = 'Expertenmodus anzeigen';
    }
    if (expertToggle && !expertToggle.dataset.listenerAttached) {
      expertToggle.addEventListener('click', () => {
        const isHidden = expertPanel ? expertPanel.classList.contains('hidden') : true;
        if (expertPanel) expertPanel.classList.toggle('hidden', !isHidden);
        if (expertIcon) expertIcon.textContent = isHidden ? '▾' : '▸';
        if (expertText) expertText.textContent = isHidden ? 'Expertenmodus verbergen' : 'Expertenmodus anzeigen';
        console.log('Nachrichtencenter Expertenmodus:', isHidden ? 'geöffnet' : 'geschlossen');
        updateNachrichtencenterEmergencyVisibility();
      });
      expertToggle.dataset.listenerAttached = 'true';
    }
    if (priorityEl && !priorityEl.dataset.listenerAttached) {
      priorityEl.addEventListener('change', () => {
        updateNachrichtencenterEmergencyVisibility();
      });
      priorityEl.dataset.listenerAttached = 'true';
    }
    updateNachrichtencenterEmergencyVisibility();

    startNachrichtencenterContactListeners();
    syncNachrichtencenterRecipientDisplayFromRef();
  } catch (e) {
    console.warn('initializeNotrufSettingsView: Nachrichtencenter Felder konnten nicht geladen werden:', e);
  }
}

// ---------- EXPORT SHOWCASE (falls von anderen Modulen benötigt) ----------
export {
  renderContactBook,
  renderApiTokenBook,
  renderSoundBook,
  populateFlicAssignmentSelectors,
  updateFlicColumnDisplays,
  updateFlicEditorDetails,
  updateFlicEditorBox,
  renderModeEditorList,
  initializeNotrufSettingsView,
  openModeConfigForm,
  saveNotrufMode
};