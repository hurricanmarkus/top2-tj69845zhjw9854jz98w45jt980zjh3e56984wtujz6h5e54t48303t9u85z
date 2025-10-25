// ---------- IMPORTS ----------
import { notrufSettings, notrufSettingsDocRef, alertUser, setButtonLoading } from './haupteingang.js';
import { setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ---------- KONSTANTEN ----------
export const IFTTT_EVENT = 'NFC_Stick_Switchbot_Bauteil_2_Wohnungsanlage_oeffnen';
export const IFTTT_KEY = 'pECKM4iJ9sI_3ZF4DdYTzsH60p3cCg0yLbnPGzUFbFO';
export const IFTTT_URL = `https://maker.ifttt.com/trigger/${IFTTT_EVENT}/with/key/${IFTTT_KEY}`;

// ---------- LOKALE VARS ----------
let activeFlicEditorKlickTyp = null;
let tempSelectedApiTokenId = null;
let tempSelectedSoundId = null;

// ---------- HILFSFUNKTIONS-HELPER ----------
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
              display.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
            }
          } else {
            tempSelectedSoundId = null;
            display.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
          }
        }
        if (modal) modal.style.display = 'none';
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

function updateFlicEditorDetails(selectedModeId) {
  const detailsDisplay = document.getElementById('flic-editor-details');
  if (!detailsDisplay) return;
  const modes = notrufSettings.modes || [];
  const selectedMode = modes.find(m => m.id === selectedModeId);
  if (selectedMode) {
    const config = selectedMode.config || {};
    const recipients = (config.userKeys || []).map(u => u.name).join(', ') || 'Niemand';
    detailsDisplay.innerHTML = `
      <strong class="block">Empfänger:</strong>
      <span class="block pl-2 mb-1">${recipients}</span>
      <strong class="block">Nachricht:</strong>
      <span class="block pl-2 mb-1">"${config.message || 'Keine'}"</span>
      <strong class="block">Prio:\u00A0${config.priority ?? '0'}, Retry:\u00A0${config.retry ?? '0'}s</strong>`;
  } else {
    detailsDisplay.innerHTML = 'Kein Modus zugewiesen.';
  }
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
  if (modes.length === 0) {
    listContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Modi vorhanden.</p>';
    return;
  }
  listContainer.innerHTML = modes.map(mode => `
    <div class="flex justify-between items-center p-2 bg-gray-50 rounded-md border">
      <div>
        <p class="font-semibold">${mode.title}</p>
        <p class="text-xs text-gray-500">${mode.description || ''}</p>
      </div>
      <div class="flex gap-1">
        <button data-mode-id="${mode.id}" class="edit-mode-btn p-2 text-blue-500 hover:bg-blue-100 rounded-full" title="Bearbeiten">✎</button>
        <button data-mode-id="${mode.id}" class="delete-mode-btn p-2 text-red-500 hover:bg-red-100 rounded-full" title="Löschen">🗑</button>
      </div>
    </div>
  `).join('');
}

function openModeConfigForm(modeId = null) {
  const formContainer = document.getElementById('modeConfigFormContainer');
  if (!formContainer) {
    console.error('openModeConfigForm: #modeConfigFormContainer nicht gefunden!');
    return;
  }

  const editingModeIdInput = document.getElementById('editingModeId');
  const titleInput = document.getElementById('notrufModeTitle');
  const descInput = document.getElementById('notrufModeDescInput');
  const pushoverTitleInput = document.getElementById('notrufTitle');
  const messageInput = document.getElementById('notrufMessage');
  const apiTokenDisplay = document.getElementById('notrufApiTokenDisplay');
  const userKeyDisplay = document.getElementById('notrufUserKeyDisplay');
  const soundDisplay = document.getElementById('notrufSoundDisplay');
  const priorityButtons = document.querySelectorAll('#priority-buttons-container .priority-btn');
  const retryCheckbox = document.getElementById('retryDeaktiviert');
  const retrySecondsInput = document.getElementById('retrySecondsInput');

  // Sicherheitschecks
  if (!titleInput || !pushoverTitleInput || !messageInput) {
    console.error('openModeConfigForm: notwendige Form-Elemente fehlen!');
    return;
  }

  // Reset / Defaultzustand
  if (editingModeIdInput) editingModeIdInput.value = '';
  titleInput.value = '';
  if (descInput) descInput.value = '';
  pushoverTitleInput.value = '';
  messageInput.value = '';
  tempSelectedApiTokenId = null;
  tempSelectedSoundId = null;
  if (apiTokenDisplay) apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
  if (userKeyDisplay) userKeyDisplay.innerHTML = '';
  if (soundDisplay) soundDisplay.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';

  // Reset Priorities (remove active)
  if (priorityButtons && priorityButtons.length) {
    priorityButtons.forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
    // markiere default 0 wenn vorhanden
    const btn0 = document.querySelector('.priority-btn[data-priority="0"]');
    if (btn0) btn0.classList.add('bg-indigo-600', 'text-white');
  }

  // Reset retry
  if (retryCheckbox) retryCheckbox.checked = false;
  if (retrySecondsInput) { retrySecondsInput.value = 30; retrySecondsInput.disabled = false; }

  // Wenn modeId gegeben -> Modus editieren, dann mit existierenden Werten füllen
  if (modeId) {
    const modeToEdit = (notrufSettings.modes || []).find(m => String(m.id) === String(modeId));
    if (!modeToEdit) {
      console.warn('openModeConfigForm: Modus mit ID nicht gefunden:', modeId);
      // trotzdem Formular öffnen (leere Maske) damit Nutzer einen neuen Modus anlegen kann
      formContainer.classList.remove('hidden');
      return;
    }

    // set editing id
    if (editingModeIdInput) editingModeIdInput.value = String(modeToEdit.id);

    // titel & beschreibung
    titleInput.value = modeToEdit.title || '';
    if (descInput) descInput.value = modeToEdit.description || '';

    // config (sicher extrahieren)
    const config = modeToEdit.config || {};

    pushoverTitleInput.value = config.title || '';
    messageInput.value = config.message || '';

    // Priorität setzen
    const prio = (typeof config.priority !== 'undefined' && config.priority !== null) ? Number(config.priority) : 0;
    if (priorityButtons && priorityButtons.length) {
      priorityButtons.forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
      });
      const prioBtn = document.querySelector(`.priority-btn[data-priority="${prio}"]`) || document.querySelector('.priority-btn[data-priority="0"]');
      if (prioBtn) prioBtn.classList.add('bg-indigo-600', 'text-white');
    }

    // Retry: wenn 0 => deaktiviert
    const savedRetry = (typeof config.retry !== 'undefined') ? config.retry : 30;
    if (savedRetry === 0) {
      if (retryCheckbox) retryCheckbox.checked = true;
      if (retrySecondsInput) { retrySecondsInput.value = 30; retrySecondsInput.disabled = true; }
    } else {
      if (retryCheckbox) retryCheckbox.checked = false;
      if (retrySecondsInput) { retrySecondsInput.value = Math.max(30, Number(savedRetry) || 30); retrySecondsInput.disabled = false; }
    }

    // API Token: set tempSelectedApiTokenId and update display
    if (typeof config.selectedApiTokenId !== 'undefined' && config.selectedApiTokenId !== null) {
      tempSelectedApiTokenId = config.selectedApiTokenId;
      const token = (notrufSettings.apiTokens || []).find(t => String(t.id) === String(tempSelectedApiTokenId));
      if (apiTokenDisplay) {
        if (token) apiTokenDisplay.innerHTML = `<span class="api-token-badge" data-token-id="${token.id}">${token.name}</span>`;
        else apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Token nicht gefunden</span>';
      }
    } else {
      tempSelectedApiTokenId = null;
      if (apiTokenDisplay) apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
    }

    // Sound: set tempSelectedSoundId and update display
    if (typeof config.selectedSoundId !== 'undefined' && config.selectedSoundId !== null) {
      tempSelectedSoundId = config.selectedSoundId;
      const sound = (notrufSettings.sounds || []).find(s => String(s.id) === String(tempSelectedSoundId));
      if (soundDisplay) {
        if (sound) {
          const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
          soundDisplay.innerHTML = `<span class="sound-badge" data-sound-id="${sound.id}">${displayName}</span>`;
        } else {
          soundDisplay.innerHTML = '<span class="text-gray-400 italic">Sound nicht gefunden</span>';
        }
      }
    } else {
      tempSelectedSoundId = null;
      if (soundDisplay) soundDisplay.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
    }

    // User keys / Empfänger: config.userKeys kann Array von {id,...} oder Array von IDs sein
    if (Array.isArray(config.userKeys) && userKeyDisplay) {
      userKeyDisplay.innerHTML = '';
      config.userKeys.forEach(uk => {
        let id = null, name = null;
        if (typeof uk === 'object') { id = uk.id; name = uk.name || null; }
        else { id = uk; }
        const contact = (notrufSettings.contacts || []).find(c => String(c.id) === String(id));
        const label = contact ? contact.name : (name ? String(name) : `#${id}`);
        if (id != null) {
          userKeyDisplay.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-id="${id}">${label}</span>`;
        }
      });
    }

    // Formular anzeigen
    formContainer.classList.remove('hidden');
    return;
  }

  // Kein modeId: Neuer Modus anlegen -> Formular leer anzeigen (Defaultwerte oben gesetzt)
  formContainer.classList.remove('hidden');
}

// Ersetze oder füge diese Funktion in notfall.js ein (komplett 1:1).
async function saveNotrufMode() {
  // DOM-Elemente / Felder
  const formContainer = document.getElementById('modeConfigFormContainer');
  const editingModeIdInput = document.getElementById('editingModeId');
  const titleInput = document.getElementById('notrufModeTitle');
  const descInput = document.getElementById('notrufModeDescInput');
  const pushoverTitleInput = document.getElementById('notrufTitle');
  const messageInput = document.getElementById('notrufMessage');
  const retryCheckbox = document.getElementById('retryDeaktiviert');
  const retrySecondsInput = document.getElementById('retrySecondsInput');

  if (!formContainer || !titleInput || !pushoverTitleInput || !messageInput) {
    console.error('saveNotrufMode: notwendige Form-Elemente fehlen!');
    alertUser('Interner Fehler: Formular nicht vollständig. Öffne die Entwicklerkonsole.', 'error');
    return;
  }

  // Werte aus Formular lesen
  const editingModeId = editingModeIdInput ? (editingModeIdInput.value || '').trim() : '';
  const title = titleInput.value.trim();
  const description = descInput ? descInput.value.trim() : '';
  const pushoverTitle = pushoverTitleInput.value.trim();
  const message = messageInput.value.trim();

  // Priorität: die aktive priority-btn (bg-indigo-600) oder data-priority auf Default 0
  let priority = 0;
  const activePrioBtn = document.querySelector('.priority-btn.bg-indigo-600') || document.querySelector('.priority-btn[data-priority="0"]');
  if (activePrioBtn && activePrioBtn.dataset && typeof activePrioBtn.dataset.priority !== 'undefined') {
    priority = parseInt(activePrioBtn.dataset.priority) || 0;
  }

  // Retry: 0 wenn deaktiviert, sonst numeric value (min 30)
  let retry = 30;
  if (retryCheckbox && retryCheckbox.checked) {
    retry = 0;
  } else if (retrySecondsInput) {
    const r = parseInt(retrySecondsInput.value, 10);
    retry = Number.isNaN(r) ? 30 : Math.max(30, r);
  }

  // Ausgewähltes API-Token / Sound: wir verwenden die temporären Variablen, die vom Editor gesetzt werden
  // (tempSelectedApiTokenId / tempSelectedSoundId werden in deinem Skript gepflegt)
  const selectedApiTokenId = typeof tempSelectedApiTokenId !== 'undefined' ? tempSelectedApiTokenId : null;
  const selectedSoundId = typeof tempSelectedSoundId !== 'undefined' ? tempSelectedSoundId : null;

  // Empfänger / userKeys: aus den Badges im Formular (#notrufUserKeyDisplay)
  const userKeys = [];
  document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(b => {
    const id = b.dataset && b.dataset.contactId ? parseInt(b.dataset.contactId, 10) : NaN;
    if (!Number.isNaN(id)) {
      userKeys.push({ id: id, name: b.textContent.trim() });
    }
  });

  // Validation
  if (!title) {
    alertUser('Bitte einen Titel für den Modus eingeben.', 'error');
    return;
  }

  // Prepare config object
  const configObj = {
    title: pushoverTitle || '',
    message: message || '',
    priority: priority,
    retry: retry, // 0 = deaktiviert
    selectedApiTokenId: selectedApiTokenId ?? null,
    selectedSoundId: selectedSoundId ?? null,
    userKeys: userKeys
  };

  // Sicherstellen, dass notrufSettings.modes existiert
  if (!Array.isArray(notrufSettings.modes)) notrufSettings.modes = [];

  // Add or update mode
  let savedModeId = null;
  if (editingModeId) {
    // Update vorhandenen Modus, wenn vorhanden
    const idx = notrufSettings.modes.findIndex(m => String(m.id) === String(editingModeId));
    if (idx !== -1) {
      // Merge bestehende Daten, aber überschreibe Felder mit Formularwerten
      const existing = notrufSettings.modes[idx] || {};
      notrufSettings.modes[idx] = {
        ...existing,
        title: title,
        description: description,
        config: configObj
      };
      savedModeId = notrufSettings.modes[idx].id;
    } else {
      // Falls ID nicht gefunden (selten), lege neuen Modus an
      const newId = Date.now();
      notrufSettings.modes.push({ id: newId, title: title, description: description, config: configObj });
      savedModeId = newId;
    }
  } else {
    // Neuer Modus
    const newId = Date.now();
    notrufSettings.modes.push({ id: newId, title: title, description: description, config: configObj });
    savedModeId = newId;
  }

  // Firestore-Guard & Save
  if (!canSaveToNotrufSettings()) {
    return;
  }

  try {
    await setDoc(notrufSettingsDocRef, notrufSettings);
    // Nach erfolgreichem Speichern: UI-Aktualisierungen
    alertUser('Modus erfolgreich gespeichert.', 'success');

    // Formular schließen / zurücksetzen
    if (formContainer) formContainer.classList.add('hidden');
    if (editingModeIdInput) editingModeIdInput.value = '';

    // Update UI-Listen / Selector / Displays
    if (typeof renderModeEditorList === 'function') renderModeEditorList();
    if (typeof populateFlicAssignmentSelectors === 'function') populateFlicAssignmentSelectors();
    if (typeof updateFlicColumnDisplays === 'function') updateFlicColumnDisplays();

    // Optional: wenn der Editor noch offen, setze ihn auf den frisch gespeicherten Eintrag
    // (z.B. damit der Benutzer direkt sieht, dass der Modus existiert)
    const editorSelector = document.getElementById('flic-editor-selector');
    if (editorSelector && savedModeId) {
      // Stelle sicher, dass der Option existiert (populateFlicAssignmentSelectors hat die Options aktualisiert)
      try {
        editorSelector.value = String(savedModeId);
      } catch (e) { /* ignore */ }
    }

    // Reset temporäre Auswahl-IDs, damit beim nächsten Öffnen klar ist, was neu gewählt wird
    tempSelectedApiTokenId = null;
    tempSelectedSoundId = null;
  } catch (err) {
    console.error('Fehler beim Speichern des Modus:', err);
    alertUser('Fehler beim Speichern des Modus. Siehe Konsole.', 'error');

    // Rollback: entferne neu hinzugefügten Modus falls er gerade erstellt wurde
    if (!editingModeId) {
      notrufSettings.modes = (notrufSettings.modes || []).filter(m => m.id !== savedModeId);
    }
  }
}

// ---------- RENDER / MODAL-BUCH Funktionen ----------
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

// ---------- INITIALIZER ----------
export function initializeNotrufSettingsView() {
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
            renderContactBook();
            const modal = document.getElementById('contactBookModal');
            if (modal) modal.style.display = 'flex';
            return;
          }
          if (e.target.closest('#notrufOpenApiTokenBook')) {
            renderApiTokenBook();
            const modal = document.getElementById('apiTokenBookModal');
            if (modal) modal.style.display = 'flex';
            return;
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
  openModeConfigForm,
  saveNotrufMode
};