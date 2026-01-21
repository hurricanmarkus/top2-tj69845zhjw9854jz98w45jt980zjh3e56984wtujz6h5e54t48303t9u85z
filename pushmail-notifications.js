// ========================================
// PUSHMAIL-CENTER BENACHRICHTIGUNGSSYSTEM
// ========================================

import { db, appId, currentUser, GUEST_MODE, alertUser } from './haupteingang.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, 
    query, where, serverTimestamp, writeBatch, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// BENACHRICHTIGUNGSDEFINITIONEN
// ========================================

export const NOTIFICATION_DEFINITIONS = {
    TERMINPLANER: {
        title: "Termin finden",
        color: "cyan",
        borderClass: "border-cyan-500",
        textClass: "text-cyan-600",
        notifications: {
            umfrage_zugewiesen: {
                label: "Umfrage zugewiesen",
                description: "Benachrichtigung wenn eine Umfrage zugewiesen wurde",
                defaultTitle: "Neue Umfrage zugewiesen",
                defaultMessage: "Du wurdest zu einer Umfrage eingeladen: {umfrageName}",
                defaultTime: "08:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["umfrageName", "ersteller"]
            },
            x_tage_vor_ablauf: {
                label: "X Tage vor Ablauf",
                description: "Erinnerung vor Umfrage-Ablauf",
                defaultTitle: "Umfrage läuft bald ab",
                defaultMessage: "Die Umfrage {umfrageName} läuft in {daysLeft} Tagen ab",
                defaultTime: "09:00",
                defaultRepeatDays: 1,
                defaultDaysBeforeX: 3,
                placeholders: ["umfrageName", "daysLeft", "ablaufDatum"]
            },
            termin_feststeht: {
                label: "Termin feststeht",
                description: "Benachrichtigung wenn ein Termin festgelegt wurde",
                defaultTitle: "Termin wurde festgelegt",
                defaultMessage: "Für {umfrageName} wurde ein Termin festgelegt: {termin}",
                defaultTime: "10:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["umfrageName", "termin"]
            },
            termin_geaendert: {
                label: "Terminänderung",
                description: "Benachrichtigung bei Terminänderung",
                defaultTitle: "Termin wurde geändert",
                defaultMessage: "Der Termin für {umfrageName} wurde geändert: {neuerTermin}",
                defaultTime: "10:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["umfrageName", "neuerTermin", "alterTermin"]
            }
        }
    },

    ZAHLUNGSVERWALTUNG: {
        title: "Zahlungsverwaltung",
        color: "emerald",
        borderClass: "border-emerald-600",
        textClass: "text-emerald-700",
        notifications: {
            teilungsanfrage_eingehend: {
                label: "Eingehende Teilungsanfrage",
                description: "Benachrichtigung bei neuer Teilungsanfrage",
                defaultTitle: "Neue Teilungsanfrage",
                defaultMessage: "{absender} möchte {betrag}€ mit dir teilen: {grund}",
                defaultTime: "08:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["absender", "betrag", "grund"]
            },
            teilungsanfrage_antwort: {
                label: "Antwort auf Teilungsanfrage",
                description: "Benachrichtigung bei Antwort auf eigene Anfrage",
                defaultTitle: "Antwort auf Teilungsanfrage",
                defaultMessage: "{empfaenger} hat deine Teilungsanfrage {status}: {betrag}€",
                defaultTime: "08:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["empfaenger", "status", "betrag", "grund"]
            }
        }
    },

    TICKET_SUPPORT: {
        title: "Ticket Support",
        color: "purple",
        borderClass: "border-purple-600",
        textClass: "text-purple-700",
        notifications: {
            ticket_zugewiesen: {
                label: "Neues Ticket zugewiesen",
                description: "Benachrichtigung bei Ticket-Zuweisung",
                defaultTitle: "Neues Ticket zugewiesen",
                defaultMessage: "Dir wurde ein Ticket zugewiesen: {ticketTitel}",
                defaultTime: "08:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["ticketTitel", "ersteller", "prioritaet"]
            },
            x_tage_vor_faelligkeit: {
                label: "X Tage vor Fälligkeit",
                description: "Erinnerung vor Fälligkeitsdatum",
                defaultTitle: "Ticket wird bald fällig",
                defaultMessage: "Das Ticket {ticketTitel} wird in {daysLeft} Tagen fällig",
                defaultTime: "09:00",
                defaultRepeatDays: 1,
                defaultDaysBeforeX: 2,
                placeholders: ["ticketTitel", "daysLeft", "faelligkeitsDatum"]
            }
        }
    },

    WERTGUTHABEN: {
        title: "Wertguthaben",
        color: "emerald",
        borderClass: "border-emerald-600",
        textClass: "text-emerald-700",
        notifications: {
            x_tage_vor_einloesefrist: {
                label: "X Tage vor Einlösefrist",
                description: "Erinnerung vor Ablauf der Einlösefrist",
                defaultTitle: "Gutschein läuft bald ab",
                defaultMessage: "Der Gutschein {gutscheinName} läuft in {daysLeft} Tagen ab",
                defaultTime: "10:00",
                defaultRepeatDays: 3,
                defaultDaysBeforeX: 7,
                placeholders: ["gutscheinName", "daysLeft", "ablaufDatum", "wert"]
            },
            x_tage_vor_ablauf_code: {
                label: "X Tage vor Ablaufdatum Code",
                description: "Erinnerung vor Code-Ablauf",
                defaultTitle: "Code läuft bald ab",
                defaultMessage: "Der Code für {gutscheinName} läuft in {daysLeft} Tagen ab",
                defaultTime: "10:00",
                defaultRepeatDays: 7,
                defaultDaysBeforeX: 14,
                placeholders: ["gutscheinName", "daysLeft", "ablaufDatum"]
            },
            x_tage_vor_warnung: {
                label: "X Tage vor Warnung",
                description: "Basierend auf Warnung vor Ablauf Feld",
                defaultTitle: "Gutschein-Warnung",
                defaultMessage: "Warnung für {gutscheinName}: {daysLeft} Tage bis Ablauf",
                defaultTime: "10:00",
                defaultRepeatDays: 7,
                defaultDaysBeforeX: 30,
                placeholders: ["gutscheinName", "daysLeft"]
            },
            x_tage_vor_gueltig_ab: {
                label: "X Tage vor Gültig ab (Aktionscode)",
                description: "Erinnerung vor Aktivierung (nur Aktionscode)",
                defaultTitle: "Aktionscode wird bald gültig",
                defaultMessage: "Der Aktionscode {gutscheinName} wird in {daysLeft} Tagen gültig",
                defaultTime: "08:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: 1,
                placeholders: ["gutscheinName", "daysLeft", "gueltigAb"],
                condition: "type === 'Aktionscode'"
            },
            x_tage_vor_gueltig_bis: {
                label: "X Tage vor Gültig bis (Aktionscode)",
                description: "Erinnerung vor Ablauf (nur Aktionscode)",
                defaultTitle: "Aktionscode läuft bald ab",
                defaultMessage: "Der Aktionscode {gutscheinName} läuft in {daysLeft} Tagen ab",
                defaultTime: "10:00",
                defaultRepeatDays: 3,
                defaultDaysBeforeX: 7,
                placeholders: ["gutscheinName", "daysLeft", "gueltigBis"],
                condition: "type === 'Aktionscode'"
            }
        }
    },

    LIZENZEN: {
        title: "Lizenzen",
        color: "yellow",
        borderClass: "border-yellow-600",
        textClass: "text-yellow-700",
        notifications: {
            x_tage_vor_ablauf: {
                label: "X Tage vor Ablauftag",
                description: "Erinnerung vor Lizenzablauf",
                defaultTitle: "Lizenz läuft bald ab",
                defaultMessage: "Die Lizenz {lizenzName} läuft in {daysLeft} Tagen ab",
                defaultTime: "10:00",
                defaultRepeatDays: 7,
                defaultDaysBeforeX: 14,
                placeholders: ["lizenzName", "daysLeft", "ablaufDatum", "anbieter"]
            }
        }
    },

    VERTRAGSVERWALTUNG: {
        title: "Vertragsverwaltung",
        color: "indigo",
        borderClass: "border-indigo-600",
        textClass: "text-indigo-700",
        notifications: {
            x_tage_vor_vertragsbeginn: {
                label: "X Tage vor Vertragsbeginn",
                description: "Erinnerung vor Vertragsstart",
                defaultTitle: "Vertrag beginnt bald",
                defaultMessage: "Der Vertrag {vertragsName} beginnt in {daysLeft} Tagen",
                defaultTime: "09:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: 7,
                placeholders: ["vertragsName", "daysLeft", "beginn", "anbieter"]
            },
            x_tage_vor_vertragsende: {
                label: "X Tage vor Vertragsende",
                description: "Erinnerung vor Vertragsende",
                defaultTitle: "Vertrag endet bald",
                defaultMessage: "Der Vertrag {vertragsName} endet in {daysLeft} Tagen",
                defaultTime: "10:00",
                defaultRepeatDays: 7,
                defaultDaysBeforeX: 30,
                placeholders: ["vertragsName", "daysLeft", "ende"]
            },
            x_tage_vor_kuendigung: {
                label: "X Tage vor Kündigungsdatum",
                description: "Erinnerung unter Berücksichtigung der Kündigungsfrist",
                defaultTitle: "Kündigungsfrist läuft bald ab",
                defaultMessage: "Kündigungsfrist für {vertragsName} endet in {daysLeft} Tagen (Kündigungsdatum: {kuendigungsDatum})",
                defaultTime: "10:00",
                defaultRepeatDays: 7,
                defaultDaysBeforeX: 14,
                placeholders: ["vertragsName", "daysLeft", "kuendigungsDatum", "kuendigungsFrist"]
            },
            x_tage_vor_erinnerung: {
                label: "X Tage vor Erinnerung & Notizen",
                description: "Basierend auf benutzerdefinierter Erinnerung",
                defaultTitle: "Vertrags-Erinnerung",
                defaultMessage: "Erinnerung für {vertragsName}: {erinnerungsText}",
                defaultTime: "10:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: 0,
                placeholders: ["vertragsName", "erinnerungsText", "daysLeft"]
            }
        }
    },

    HAUSHALTSZAHLUNGEN: {
        title: "Haushaltszahlungen",
        color: "cyan",
        borderClass: "border-cyan-600",
        textClass: "text-cyan-700",
        notifications: {
            status_nicht_okay: {
                label: "Status nicht okay",
                description: "Benachrichtigung wenn Status-Prüfung fehlschlägt",
                defaultTitle: "Haushaltszahlungen: Problem erkannt",
                defaultMessage: "Es gibt ein Problem bei den Haushaltszahlungen: {problem}",
                defaultTime: "08:00",
                defaultRepeatDays: 1,
                defaultDaysBeforeX: null,
                placeholders: ["problem", "details"]
            },
            x_tage_vor_gueltig_ab: {
                label: "X Tage vor Gültig AB",
                description: "Erinnerung vor Startdatum",
                defaultTitle: "Haushaltszahlung beginnt bald",
                defaultMessage: "Die Zahlung {zahlungName} beginnt in {daysLeft} Tagen",
                defaultTime: "09:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: 3,
                placeholders: ["zahlungName", "daysLeft", "gueltigAb"]
            },
            x_tage_vor_gueltig_bis: {
                label: "X Tage vor Gültig BIS",
                description: "Erinnerung vor Enddatum",
                defaultTitle: "Haushaltszahlung endet bald",
                defaultMessage: "Die Zahlung {zahlungName} endet in {daysLeft} Tagen",
                defaultTime: "10:00",
                defaultRepeatDays: 3,
                defaultDaysBeforeX: 7,
                placeholders: ["zahlungName", "daysLeft", "gueltigBis"]
            },
            x_tage_vor_erinnerung: {
                label: "X Tage vor Erinnerung",
                description: "Basierend auf Erinnerungsfeld",
                defaultTitle: "Haushaltszahlungs-Erinnerung",
                defaultMessage: "Erinnerung für {zahlungName}: {erinnerungsText}",
                defaultTime: "10:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: 5,
                placeholders: ["zahlungName", "erinnerungsText", "daysLeft"]
            }
        }
    }
};

// ========================================
// STANDARD-EINSTELLUNGEN
// ========================================

export function getDefaultPushmailNotificationSettings() {
    const settings = {
        globalEnabled: true,
        programs: {}
    };

    Object.keys(NOTIFICATION_DEFINITIONS).forEach(programId => {
        const program = NOTIFICATION_DEFINITIONS[programId];
        settings.programs[programId] = {
            enabled: true,
            notifications: {}
        };

        Object.keys(program.notifications).forEach(notifId => {
            const notif = program.notifications[notifId];
            settings.programs[programId].notifications[notifId] = {
                state: "active",
                time: notif.defaultTime,
                repeatDays: notif.defaultRepeatDays,
                daysBeforeX: notif.defaultDaysBeforeX,
                customTitle: notif.defaultTitle,
                customMessage: notif.defaultMessage,
                pushOverEnabled: true
            };
        });
    });

    return settings;
}

// ========================================
// EINSTELLUNGEN LADEN/SPEICHERN
// ========================================

export async function loadPushmailNotificationSettings(userId) {
    if (!userId || userId === GUEST_MODE) return getDefaultPushmailNotificationSettings();
    
    try {
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'settings', 'pushmail_settings');
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return getDefaultPushmailNotificationSettings();
        }

        return normalizePushmailSettings(docSnap.data());
    } catch (error) {
        console.error('Fehler beim Laden der Pushmail-Einstellungen:', error);
        return getDefaultPushmailNotificationSettings();
    }
}

export async function savePushmailNotificationSettings(userId, settings) {
    if (!userId || userId === GUEST_MODE) {
        alertUser('Bitte anmelden, um Einstellungen zu speichern.', 'error');
        return false;
    }

    try {
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'settings', 'pushmail_settings');
        await setDoc(docRef, {
            ...settings,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('Fehler beim Speichern der Pushmail-Einstellungen:', error);
        alertUser('Fehler beim Speichern der Einstellungen.', 'error');
        return false;
    }
}

function normalizePushmailSettings(raw) {
    const defaults = getDefaultPushmailNotificationSettings();
    
    if (!raw || typeof raw !== 'object') return defaults;

    const normalized = {
        globalEnabled: raw.globalEnabled !== false,
        programs: {}
    };

    Object.keys(NOTIFICATION_DEFINITIONS).forEach(programId => {
        const programDefaults = defaults.programs[programId];
        const programRaw = raw.programs?.[programId] || {};

        normalized.programs[programId] = {
            enabled: programRaw.enabled !== false,
            notifications: {}
        };

        Object.keys(programDefaults.notifications).forEach(notifId => {
            const notifDefaults = programDefaults.notifications[notifId];
            const notifRaw = programRaw.notifications?.[notifId] || {};

            normalized.programs[programId].notifications[notifId] = {
                state: ['active', 'paused', 'disabled'].includes(notifRaw.state) ? notifRaw.state : notifDefaults.state,
                time: notifRaw.time || notifDefaults.time,
                repeatDays: Number.isFinite(notifRaw.repeatDays) ? notifRaw.repeatDays : notifDefaults.repeatDays,
                daysBeforeX: notifRaw.daysBeforeX !== undefined ? notifRaw.daysBeforeX : notifDefaults.daysBeforeX,
                customTitle: notifRaw.customTitle || notifDefaults.customTitle,
                customMessage: notifRaw.customMessage || notifDefaults.customMessage,
                pushOverEnabled: notifRaw.pushOverEnabled !== false
            };
        });
    });

    return normalized;
}

// ========================================
// BENACHRICHTIGUNGEN ERSTELLEN
// ========================================

export async function createPendingNotification(userId, programId, notificationType, relatedData) {
    if (!userId || userId === GUEST_MODE) return;

    try {
        const settings = await loadPushmailNotificationSettings(userId);
        
        // Prüfen ob global aktiviert
        if (!settings.globalEnabled) {
            console.log('Pushmail: Global deaktiviert');
            return;
        }

        // Prüfen ob Programm aktiviert
        if (!settings.programs[programId]?.enabled) {
            console.log('Pushmail: Programm deaktiviert:', programId);
            return;
        }

        const notifSettings = settings.programs[programId]?.notifications[notificationType];
        
        if (!notifSettings || notifSettings.state === 'disabled') {
            console.log('Pushmail: Benachrichtigung deaktiviert:', programId, notificationType);
            return;
        }

        const relatedDataId = relatedData.id || null;

        // Duplikatsprüfung pending
        const colRef = collection(db, 'artifacts', appId, 'users', userId, 'pushmail_notifications');
        const existingQuery = query(
            colRef,
            where('programId', '==', programId),
            where('notificationType', '==', notificationType),
            where('relatedDataId', '==', relatedDataId),
            where('acknowledged', '==', false)
        );
        const existingSnapshot = await getDocs(existingQuery);
        if (!existingSnapshot.empty) {
            console.log('Pushmail: Benachrichtigung existiert bereits (pending):', programId, notificationType, relatedDataId);
            return;
        }

        // Duplikatsprüfung archiviert: Nur erneut erstellen, wenn sich Title/Message geändert haben
        const ackColRef = collection(db, 'artifacts', appId, 'users', userId, 'pushmail_acknowledged_notifications');
        const ackQuery = query(
            ackColRef,
            where('programId', '==', programId),
            where('notificationType', '==', notificationType),
            where('relatedDataId', '==', relatedDataId),
            where('acknowledged', '==', true),
            limit(5)
        );
        const ackSnapshot = await getDocs(ackQuery);

        // Platzhalter ersetzen (Title/Message) vor Vergleich
        const title = replacePlaceholders(notifSettings.customTitle, relatedData);
        const message = replacePlaceholders(notifSettings.customMessage, relatedData);

        const alreadyAcknowledgedSameContent = ackSnapshot.docs.some(docSnap => {
            const data = docSnap.data() || {};
            return data.title === title && data.message === message;
        });

        if (alreadyAcknowledgedSameContent) {
            console.log('Pushmail: Bereits quittiert, gleicher Inhalt – keine neue Benachrichtigung:', programId, notificationType, relatedDataId);
            return;
        }

        // Platzhalter ersetzen (bereits oben berechnet)

        // Zeitpunkt berechnen
        const scheduledFor = calculateScheduledTime(
            notifSettings.time,
            notifSettings.daysBeforeX,
            relatedData.targetDate
        );

        // Benachrichtigung speichern
        await addDoc(colRef, {
            programId,
            notificationType,
            title,
            message,
            createdAt: serverTimestamp(),
            scheduledFor,
            lastSentAt: null,
            nextSendAt: scheduledFor,
            repeatDays: notifSettings.repeatDays,
            acknowledged: false,
            acknowledgedAt: null,
            relatedDataId: relatedData.id || null,
            relatedDataPath: relatedData.path || null,
            pushOverEnabled: notifSettings.pushOverEnabled !== false
        });

        console.log('Pushmail: Benachrichtigung erstellt:', programId, notificationType, 'Pushover:', notifSettings.pushOverEnabled !== false);
    } catch (error) {
        console.error('Fehler beim Erstellen der Benachrichtigung:', error);
    }
}

function replacePlaceholders(text, data) {
    if (!text || !data) return text;
    
    let result = String(text);
    Object.keys(data).forEach(key => {
        const value = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    });
    return result;
}

function calculateScheduledTime(timeString, daysBeforeX, targetDate) {
    const [hours, minutes] = timeString.split(':').map(Number);
    let scheduled;

    if (targetDate) {
        scheduled = new Date(targetDate);
        if (daysBeforeX !== null && daysBeforeX !== undefined) {
            scheduled.setDate(scheduled.getDate() - daysBeforeX);
        }
    } else {
        scheduled = new Date();
    }

    scheduled.setHours(hours, minutes, 0, 0);
    return scheduled;
}

// ========================================
// AUSSTEHENDE BENACHRICHTIGUNGEN
// ========================================

export async function loadPendingNotifications(userId) {
    if (!userId || userId === GUEST_MODE) return [];

    try {
        const colRef = collection(db, 'artifacts', appId, 'users', userId, 'pushmail_notifications');
        const q = query(colRef, where('acknowledged', '==', false), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Fehler beim Laden der ausstehenden Benachrichtigungen:', error);
        return [];
    }
}

export async function renderPendingNotifications() {
    const userId = currentUser.mode;
    const notifications = await loadPendingNotifications(userId);

    const list = document.getElementById('pushmailPendingNotificationsList');
    const count = document.getElementById('pendingNotificationsCount');

    if (count) count.textContent = notifications.length;

    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Keine ausstehenden Benachrichtigungen</p>';
        return;
    }

    list.innerHTML = notifications.map(notif => {
        const program = NOTIFICATION_DEFINITIONS[notif.programId];
        if (!program) return '';

        const createdDate = notif.createdAt?.toDate ? notif.createdAt.toDate() : new Date();
        const formattedDate = createdDate.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="p-3 border-l-4 ${program.borderClass} bg-${program.color}-50 rounded animate-pulse">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-grow">
                        <div class="font-bold text-gray-800">${notif.title}</div>
                        <div class="text-sm text-gray-600 mt-1">${notif.message}</div>
                        <div class="text-xs text-gray-400 mt-1">
                            ${program.title} | ${formattedDate}
                        </div>
                    </div>
                    <button class="acknowledge-notification-btn px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 flex-shrink-0" 
                            data-notification-id="${notif.id}">
                        Quittieren
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Event-Listener für Quittieren-Buttons
    document.querySelectorAll('.acknowledge-notification-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const notifId = e.target.dataset.notificationId;
            setProcessingOverlay(true, 'Quittiere Benachrichtigung...');
            await acknowledgeNotification(userId, notifId);
            await renderPendingNotifications();
            alertUser('Benachrichtigung quittiert.', 'success');
            setProcessingOverlay(false);
        });
    });
}

// ========================================
// QUITTIEREN
// ========================================

export async function acknowledgeNotification(userId, notificationId) {
    if (!userId || userId === GUEST_MODE) return false;

    try {
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'pushmail_notifications', notificationId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.warn('Benachrichtigung nicht gefunden:', notificationId);
            return false;
        }

        // In Archiv verschieben
        const archiveRef = doc(db, 'artifacts', appId, 'users', userId, 'pushmail_acknowledged_notifications', notificationId);
        await setDoc(archiveRef, {
            ...docSnap.data(),
            acknowledged: true,
            acknowledgedAt: serverTimestamp()
        });

        // Aus pending löschen
        await deleteDoc(docRef);

        console.log('Pushmail: Benachrichtigung quittiert:', notificationId);
        return true;
    } catch (error) {
        console.error('Fehler beim Quittieren der Benachrichtigung:', error);
        return false;
    }
}

export async function acknowledgeMultipleNotifications(userId, notificationIds) {
    if (!userId || userId === GUEST_MODE || !notificationIds || notificationIds.length === 0) return false;

    try {
        const batch = writeBatch(db);

        for (const notifId of notificationIds) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'pushmail_notifications', notifId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const archiveRef = doc(db, 'artifacts', appId, 'users', userId, 'pushmail_acknowledged_notifications', notifId);
                batch.set(archiveRef, {
                    ...docSnap.data(),
                    acknowledged: true,
                    acknowledgedAt: serverTimestamp()
                });
                batch.delete(docRef);
            }
        }

        await batch.commit();
        console.log('Pushmail: Mehrere Benachrichtigungen quittiert:', notificationIds.length);
        return true;
    } catch (error) {
        console.error('Fehler beim Quittieren mehrerer Benachrichtigungen:', error);
        return false;
    }
}

// ========================================
// STARTSEITEN-MODAL
// ========================================

export async function checkAndShowPendingNotificationsModal() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    const notifications = await loadPendingNotifications(userId);

    if (notifications.length > 0) {
        showPendingNotificationsModal(notifications);
    }
}

function showPendingNotificationsModal(notifications) {
    const modal = document.getElementById('pendingNotificationsModal');
    const list = document.getElementById('pendingNotificationsList');

    if (!modal || !list) return;

    list.innerHTML = notifications.map(notif => {
        const program = NOTIFICATION_DEFINITIONS[notif.programId];
        if (!program) return '';

        const createdDate = notif.createdAt?.toDate ? notif.createdAt.toDate() : new Date();
        const formattedDate = createdDate.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="p-3 border-l-4 ${program.borderClass} bg-${program.color}-50 rounded">
                <label class="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" class="acknowledge-checkbox h-5 w-5 mt-1 flex-shrink-0" data-notification-id="${notif.id}">
                    <div class="flex-grow">
                        <div class="font-bold text-gray-800">${notif.title}</div>
                        <div class="text-sm text-gray-600 mt-1">${notif.message}</div>
                        <div class="text-xs text-gray-400 mt-1">
                            Programm: ${program.title} | Erstellt: ${formattedDate}
                        </div>
                    </div>
                </label>
            </div>
        `;
    }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function initializePendingNotificationsModal() {
    const modal = document.getElementById('pendingNotificationsModal');
    const closeBtn = document.getElementById('closePendingNotificationsModal');
    const acknowledgeSelectedBtn = document.getElementById('acknowledgeSelectedBtn');
    const markAllBtn = document.getElementById('markAllNotificationsBtn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });
    }

    if (acknowledgeSelectedBtn) {
        acknowledgeSelectedBtn.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('.acknowledge-checkbox:checked');
            const notificationIds = Array.from(checkboxes).map(cb => cb.dataset.notificationId);

            if (notificationIds.length === 0) {
                alertUser('Bitte wählen Sie mindestens eine Benachrichtigung aus.', 'error');
                return;
            }

            const success = await acknowledgeMultipleNotifications(currentUser.mode, notificationIds);
            if (success) {
                alertUser(`${notificationIds.length} Benachrichtigung(en) quittiert.`, 'success');
                await checkAndShowPendingNotificationsModal();
                
                // Modal schließen wenn keine Benachrichtigungen mehr
                const remaining = await loadPendingNotifications(currentUser.mode);
                if (remaining.length === 0) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
            }
        });
    }

    // Alle markieren mit 3s Cooldown
    if (markAllBtn) {
        let markCooldown = false;
        markAllBtn.addEventListener('click', () => {
            if (markCooldown) return;
            const checkboxes = document.querySelectorAll('.acknowledge-checkbox');
            checkboxes.forEach(cb => cb.checked = true);
            markCooldown = true;
            markAllBtn.disabled = true;
            markAllBtn.classList.add('opacity-60', 'cursor-not-allowed');
            setTimeout(() => {
                markCooldown = false;
                markAllBtn.disabled = false;
                markAllBtn.classList.remove('opacity-60', 'cursor-not-allowed');
            }, 3000);
        });
    }
}

// ========================================
// PROCESSING OVERLAY
// ========================================
function ensureProcessingOverlay() {
    let overlay = document.getElementById('pushmailProcessingOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'pushmailProcessingOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.display = 'none';
    overlay.style.zIndex = '9999';
    overlay.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <div style="min-width:240px;padding:16px;border-radius:12px;background:#111827;color:white;box-shadow:0 10px 40px rgba(0,0,0,0.35);text-align:center;">
                <div id="pushmailProcessingText" style="margin-bottom:12px;font-weight:700;">Verarbeite...</div>
                <div style="width:100%;height:6px;border-radius:999px;background:rgba(255,255,255,0.15);overflow:hidden;">
                    <div class="animate-pulse" style="width:50%;height:100%;background:#10b981;border-radius:999px;"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function setProcessingOverlay(visible, text = 'Verarbeite...') {
    const overlay = ensureProcessingOverlay();
    const label = overlay.querySelector('#pushmailProcessingText');
    if (label) label.textContent = text;
    overlay.style.display = visible ? 'block' : 'none';
}

// ========================================
// SCHEDULER (Background-Job)
// ========================================

export async function checkAndSendScheduledNotifications() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    try {
        const now = new Date();
        const colRef = collection(db, 'artifacts', appId, 'users', userId, 'pushmail_notifications');
        const q = query(colRef, 
            where('acknowledged', '==', false)
        );

        const snapshot = await getDocs(q);

        for (const docSnap of snapshot.docs) {
            const notif = docSnap.data();
            const nextSend = notif.nextSendAt?.toDate ? notif.nextSendAt.toDate() : null;

            if (!nextSend || nextSend > now) continue;

            // Pushover-Nachricht nur senden wenn pushOverEnabled = true
            let sent = true;
            if (notif.pushOverEnabled !== false) {
                sent = await sendPushoverNotification(userId, notif.title, notif.message);
                console.log('Pushmail: Pushover-Versand für', notif.title, ':', sent ? 'Erfolg' : 'Fehlgeschlagen');
            } else {
                console.log('Pushmail: Pushover deaktiviert für', notif.title, '- Nur Overlay-Anzeige');
            }

            if (sent) {
                // Nächsten Sendezeitpunkt berechnen
                if (notif.repeatDays > 0) {
                    const nextSendDate = new Date(nextSend);
                    nextSendDate.setDate(nextSendDate.getDate() + notif.repeatDays);

                    await updateDoc(docSnap.ref, {
                        lastSentAt: serverTimestamp(),
                        nextSendAt: nextSendDate
                    });
                } else {
                    // Einmalige Benachrichtigung
                    await updateDoc(docSnap.ref, {
                        lastSentAt: serverTimestamp(),
                        nextSendAt: null
                    });
                }
            }
        }
    } catch (error) {
        console.error('Fehler beim Prüfen/Senden von Benachrichtigungen:', error);
    }
}

async function sendPushoverNotification(userId, title, message) {
    try {
        // User-Key und API-Token aus Pushmail-Center laden
        const cfgRef = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_programs', userId);
        const cfgSnap = await getDoc(cfgRef);

        if (!cfgSnap.exists()) {
            console.warn('Pushmail: Kein User-Key für Benutzer:', userId);
            return false;
        }

        const data = cfgSnap.data();
        const userKey = data.userKey;
        const apiToken = data.apiToken;

        if (!userKey || !apiToken) {
            console.warn('Pushmail: User-Key oder API-Token fehlt');
            return false;
        }

        // Pushover API aufrufen
        const response = await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                token: apiToken,
                user: userKey,
                title: title,
                message: message
            })
        });

        if (!response.ok) {
            console.error('Pushmail: Pushover-Fehler:', await response.text());
            return false;
        }

        console.log('Pushmail: Nachricht erfolgreich gesendet');
        return true;
    } catch (error) {
        console.error('Pushmail: Fehler beim Senden der Pushover-Nachricht:', error);
        return false;
    }
}

// ========================================
// SCHEDULER STARTEN
// ========================================

let schedulerInterval = null;

export function startPushmailScheduler() {
    if (schedulerInterval) {
        console.log('Pushmail: Scheduler läuft bereits');
        return;
    }

    console.log('Pushmail: Scheduler gestartet');
    
    // Sofort einmal prüfen
    checkAndSendScheduledNotifications();

    // Dann alle 5 Minuten
    schedulerInterval = setInterval(() => {
        checkAndSendScheduledNotifications();
    }, 5 * 60 * 1000);
}

export function stopPushmailScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('Pushmail: Scheduler gestoppt');
    }
}

// ========================================
// HILFSFUNKTIONEN
// ========================================

export function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
