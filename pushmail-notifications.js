// ========================================
// PUSHMAIL-CENTER BENACHRICHTIGUNGSSYSTEM
// ========================================

import { db, appId, currentUser, GUEST_MODE, alertUser, PUSHOVER_API_TOKEN } from './haupteingang.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, 
    query, where, serverTimestamp, writeBatch, orderBy, limit, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// HILFSFUNKTIONEN
// ========================================

/**
 * Ersetzt Platzhalter in einem Text durch die entsprechenden Werte aus den Daten
 * @param {string} text - Der Text mit Platzhaltern wie {key}
 * @param {Object} data - Ein Objekt mit den Ersetzungswerten
 * @returns {string} Der Text mit ersetzten Platzhaltern
 */
function replacePlaceholders(text, data) {
    if (!text || !data) return text || '';
    let result = text;
    Object.keys(data).forEach(key => {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), data[key] || '');
    });
    return result;
}

/**
 * Berechnet den geplanten Zeitpunkt für eine Benachrichtigung
 * @param {string} timeString - Uhrzeit im Format "HH:MM"
 * @param {number|null} daysBeforeX - Tage vor dem Zieldatum (null wenn nicht relevant)
 * @param {Date|string|null} targetDate - Das Zieldatum
 * @param {boolean} sendImmediately - Wenn true, wird sofort gesendet
 * @returns {Date} Der berechnete Zeitpunkt
 */
function calculateScheduledTime(timeString, daysBeforeX, targetDate, sendImmediately = false) {
    if (sendImmediately) {
        return new Date();
    }
    
    const [hours, minutes] = (timeString || '08:00').split(':').map(Number);
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
// BENACHRICHTIGUNGSDEFINITIONEN
// ========================================

export const NOTIFICATION_DEFINITIONS = {
    TERMINPLANER: {
        title: "Termin finden",
        color: "cyan",
        borderClass: "border-cyan-500",
        textClass: "text-cyan-600",
        requiredPermission: null,
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
        requiredPermission: "ZAHLUNGSVERWALTUNG",
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
        requiredPermission: "TICKET_SUPPORT",
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
        requiredPermission: "WERTGUTHABEN",
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
        requiredPermission: "LIZENZEN",
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
        requiredPermission: "VERTRAGSVERWALTUNG",
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
        requiredPermission: "HAUSHALTSZAHLUNGEN",
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
    },

    SENDUNGSVERWALTUNG: {
        title: "Sendungsverwaltung",
        color: "blue",
        borderClass: "border-blue-600",
        textClass: "text-blue-700",
        requiredPermission: "SENDUNGSVERWALTUNG",
        notifications: {
            x_tage_vor_ablauf_sendung: {
                label: "X Tage vor Ablauf Sendung",
                description: "Erinnerung vor Ablauf der Sendungsfrist",
                defaultTitle: "Sendung läuft bald ab",
                defaultMessage: "Die Sendung {sendungName} läuft in {daysLeft} Tagen ab",
                defaultTime: "10:00",
                defaultRepeatDays: 3,
                defaultDaysBeforeX: 7,
                placeholders: ["sendungName", "daysLeft", "ablaufDatum", "anbieter", "sendungsnummer"]
            },
            sendung_zugestellt: {
                label: "Sendung zugestellt",
                description: "Benachrichtigung wenn Sendung als zugestellt markiert wurde",
                defaultTitle: "Sendung zugestellt",
                defaultMessage: "Die Sendung {sendungName} wurde zugestellt",
                defaultTime: "08:00",
                defaultRepeatDays: 0,
                defaultDaysBeforeX: null,
                placeholders: ["sendungName", "anbieter", "sendungsnummer", "zustellDatum"]
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
                overlayEnabled: true,
                pushOverEnabled: true,
                sendImmediately: notif.defaultDaysBeforeX === null
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
                overlayEnabled: notifRaw.overlayEnabled !== false,
                pushOverEnabled: notifRaw.pushOverEnabled !== false,
                sendImmediately: notifRaw.sendImmediately === true
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

        // daysLeft berechnen (falls targetDate vorhanden)
        if (relatedData.targetDate && !relatedData.daysLeft) {
            const target = new Date(relatedData.targetDate);
            const now = new Date();
            const diffTime = target - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            relatedData.daysLeft = diffDays > 0 ? diffDays : 0;
        }

        // Platzhalter ersetzen (Title/Message) vor Vergleich
        const title = replacePlaceholders(notifSettings.customTitle, relatedData);
        const message = replacePlaceholders(notifSettings.customMessage, relatedData);

        // Zeitpunkt berechnen
        const scheduledFor = calculateScheduledTime(
            notifSettings.time,
            notifSettings.daysBeforeX,
            relatedData.targetDate,
            notifSettings.sendImmediately
        );

        // Bei sendImmediately: Auch die "normale" Zeit berechnen für spätere Wiederholungen
        let regularScheduledTime = null;
        if (notifSettings.sendImmediately) {
            regularScheduledTime = calculateScheduledTime(
                notifSettings.time,
                notifSettings.daysBeforeX,
                relatedData.targetDate,
                false  // Normale Berechnung ohne sofort
            );
        }

        // VALIDIERUNG: Benachrichtigung liegt in der Vergangenheit?
        // Bei sendImmediately überspringen wir die Validierung
        const now = new Date();
        if (!notifSettings.sendImmediately && scheduledFor < now) {
            console.log('Pushmail: Benachrichtigung liegt in Vergangenheit - übersprungen:', programId, notificationType, scheduledFor);
            return;
        }

        const alreadyAcknowledgedSameContent = ackSnapshot.docs.some(docSnap => {
            const data = docSnap.data() || {};
            return data.title === title && data.message === message;
        });

        if (alreadyAcknowledgedSameContent) {
            console.log('Pushmail: Bereits quittiert, gleicher Inhalt – keine neue Benachrichtigung:', programId, notificationType, relatedDataId);
            return;
        }

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
            regularScheduledTime: regularScheduledTime,  // Für Wiederholungen nach sofortigem Senden
            repeatDays: notifSettings.repeatDays,
            acknowledged: false,
            acknowledgedAt: null,
            relatedDataId: relatedData.id || null,
            relatedDataPath: relatedData.path || null,
            overlayEnabled: notifSettings.overlayEnabled !== false,
            pushOverEnabled: notifSettings.pushOverEnabled !== false,
            sendImmediately: notifSettings.sendImmediately === true
        });

        console.log('Pushmail: Benachrichtigung erstellt:', programId, notificationType, 'Pushover:', notifSettings.pushOverEnabled !== false);
    } catch (error) {
        console.error('Fehler beim Erstellen der Benachrichtigung:', error);
    }
}

// ========================================
// LADEN DER BENACHRICHTIGUNGEN
// ========================================

let pendingNotificationsUnsubscribe = null;

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

// ========================================
// ECHTZEIT-LISTENER
// ========================================

export function startPendingNotificationsListener() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    // Alten Listener stoppen falls vorhanden
    if (pendingNotificationsUnsubscribe) {
        pendingNotificationsUnsubscribe();
        pendingNotificationsUnsubscribe = null;
    }

    const colRef = collection(db, 'artifacts', appId, 'users', userId, 'pushmail_notifications');
    
    // Echtzeit-Listener für pending notifications
    pendingNotificationsUnsubscribe = onSnapshot(colRef, 
        (snapshot) => {
            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({ id: doc.id, ...doc.data() });
            });
            
            // UI aktualisieren
            updatePendingNotificationsUI(notifications);
            
            console.log('Pushmail: Benachrichtigungen aktualisiert (Echtzeit):', notifications.length);
        },
        (error) => {
            console.error('Fehler beim Lauschen auf Benachrichtigungen:', error);
        }
    );
}

export function stopPendingNotificationsListener() {
    if (pendingNotificationsUnsubscribe) {
        pendingNotificationsUnsubscribe();
        pendingNotificationsUnsubscribe = null;
    }
}

function updatePendingNotificationsUI(notifications) {
    // Counter aktualisieren
    const count = document.getElementById('pendingNotificationsCount');
    if (count) count.textContent = notifications.length;

    // PUSHMAIL-Center Liste aktualisieren
    const list = document.getElementById('pushmailPendingNotificationsList');
    if (list) {
        renderNotificationsList(notifications, list, 'center');
    }

    // Modal aktualisieren falls geöffnet
    const modal = document.getElementById('pendingNotificationsModal');
    if (modal && !modal.classList.contains('hidden')) {
        const modalList = document.getElementById('pendingNotificationsList');
        if (modalList && notifications.length > 0) {
            renderNotificationsList(notifications, modalList, 'modal');
        } else if (modalList && notifications.length === 0) {
            // Modal schließen wenn keine Benachrichtigungen mehr
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
}

function renderNotificationsList(notifications, listElement, context) {
    if (!listElement) return;

    if (notifications.length === 0) {
        listElement.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Keine ausstehenden Benachrichtigungen</p>';
        return;
    }

    const isModal = context === 'modal';

    // Header mit Auswahl-Controls
    const headerHtml = `
        <div class="flex items-center justify-between mb-3 p-${isModal ? '3' : '2'} bg-${isModal ? 'gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200' : 'gray-100 rounded'}">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="${isModal ? 'selectAllModalNotifications' : 'selectAllNotifications'}" class="h-${isModal ? '5' : '4'} w-${isModal ? '5' : '4'}">
                <span class="text-sm font-${isModal ? 'bold' : 'semibold'}${isModal ? ' text-gray-700' : ''}">Alle auswählen</span>
            </label>
            <button id="${isModal ? 'acknowledgeAllModalBtn' : 'acknowledgeSelectedBtn'}" class="px-${isModal ? '5' : '4'} py-2 bg-${isModal ? 'red' : 'green'}-600 text-white text-sm font-bold rounded${isModal ? '-lg' : ''} hover:bg-${isModal ? 'red' : 'green'}-700 disabled:bg-gray-400 disabled:cursor-not-allowed${isModal ? ' shadow-md' : ''}" disabled>
                ${isModal ? '🗑️ ' : ''}${isModal ? 'Alle quittieren' : 'Ausgewählte quittieren'} (<span id="${isModal ? 'selectedModalCount' : 'selectedCount'}">0</span>)
            </button>
        </div>
    `;

    const notificationsHtml = notifications.map(notif => {
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

        if (isModal) {
            const scheduledDate = notif.nextSendAt?.toDate ? notif.nextSendAt.toDate() : null;
            const scheduledInfo = scheduledDate ? `📅 Geplant: ${scheduledDate.toLocaleString('de-DE')}` : '';

            return `
                <div class="notification-modal-card p-3 mb-2 border-l-4 ${program.borderClass} bg-${program.color}-50 rounded-lg hover:shadow-lg transition-shadow" data-notification-id="${notif.id}">
                    <div class="flex items-start gap-3">
                        <input type="checkbox" class="modal-notification-checkbox h-5 w-5 mt-1" data-notification-id="${notif.id}">
                        <div class="flex-grow">
                            <div class="flex items-start justify-between gap-2 mb-1">
                                <div class="font-bold text-gray-900 text-base">${notif.title}</div>
                                <span class="text-xs px-2 py-1 bg-white rounded-full font-semibold ${program.textClass} border ${program.borderClass} whitespace-nowrap">
                                    ${program.icon || '📌'} ${program.title}
                                </span>
                            </div>
                            <div class="text-sm text-gray-700 mt-2 leading-relaxed">${notif.message}</div>
                            <div class="text-xs text-gray-500 mt-2 flex flex-wrap gap-3">
                                <span>🕐 Erstellt: ${formattedDate}</span>
                                ${scheduledInfo ? `<span class="font-semibold text-orange-600">${scheduledInfo}</span>` : ''}
                                ${notif.repeatDays > 0 ? `<span>🔁 Wiederholt alle ${notif.repeatDays} Tage</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="notification-card p-3 mb-2 border-l-4 ${program.borderClass} bg-${program.color}-50 rounded hover:shadow-md transition-shadow" data-notification-id="${notif.id}">
                    <div class="flex items-start gap-3">
                        <input type="checkbox" class="notification-checkbox h-5 w-5 mt-1" data-notification-id="${notif.id}">
                        <div class="flex-grow">
                            <div class="font-bold text-gray-800">${notif.title}</div>
                            <div class="text-sm text-gray-600 mt-1">${notif.message}</div>
                            <div class="text-xs text-gray-400 mt-1">
                                ${program.title} | ${formattedDate}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');

    listElement.innerHTML = headerHtml + notificationsHtml;

    // Event-Listener neu binden
    if (isModal) {
        setupModalCheckboxListeners();
    } else {
        setupCenterCheckboxListeners();
    }
}

function setupCenterCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.notification-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllNotifications');
    const acknowledgeBtn = document.getElementById('acknowledgeSelectedBtn');
    const selectedCountSpan = document.getElementById('selectedCount');

    let selectAllClickCount = 0;
    let selectAllTimer = null;

    const updateButtonState = () => {
        const selected = Array.from(checkboxes).filter(cb => cb.checked);
        if (selectedCountSpan) selectedCountSpan.textContent = selected.length;
        if (acknowledgeBtn) acknowledgeBtn.disabled = selected.length === 0;
    };

    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            updateButtonState();
            // Alle auswählen Checkbox aktualisieren
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
        });
    });

    // Alle auswählen/abwählen mit Timer
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // ALLE AUSWÄHLEN - Mit Sicherheits-Timer
                selectAllClickCount++;
                
                if (selectAllClickCount === 1) {
                    // Erster Klick: Timer starten
                    e.target.checked = false;
                    e.target.nextElementSibling.innerHTML = '<span class="text-orange-600 font-semibold">⏱️ Nochmal klicken in <span id="centerTimerCountdown">3</span>s</span>';
                    
                    let countdown = 3;
                    selectAllTimer = setInterval(() => {
                        countdown--;
                        const countdownSpan = document.getElementById('centerTimerCountdown');
                        if (countdownSpan) countdownSpan.textContent = countdown;
                        
                        if (countdown <= 0) {
                            clearInterval(selectAllTimer);
                            selectAllClickCount = 0;
                            e.target.nextElementSibling.innerHTML = '<span class="text-sm font-semibold">Alle auswählen</span>';
                        }
                    }, 1000);
                } else if (selectAllClickCount === 2) {
                    // Zweiter Klick: Alle auswählen
                    clearInterval(selectAllTimer);
                    selectAllClickCount = 0;
                    e.target.nextElementSibling.innerHTML = '<span class="text-red-600 font-semibold">Alle abwählen</span>';
                    checkboxes.forEach(cb => cb.checked = true);
                    updateButtonState();
                }
            } else {
                // ALLE ABWÄHLEN - Sofort ohne Timer
                e.target.nextElementSibling.innerHTML = '<span class="text-sm font-semibold">Alle auswählen</span>';
                checkboxes.forEach(cb => cb.checked = false);
                updateButtonState();
                selectAllClickCount = 0;
                if (selectAllTimer) clearInterval(selectAllTimer);
            }
        });
    }

    // Quittieren-Button
    if (acknowledgeBtn) {
        acknowledgeBtn.addEventListener('click', async () => {
            const selected = Array.from(checkboxes).filter(cb => cb.checked);
            if (selected.length === 0) return;

            const confirm = window.confirm(`${selected.length} Benachrichtigung(en) quittieren?`);
            if (!confirm) return;

            setProcessingOverlay(true, `Quittiere ${selected.length} Benachrichtigung(en)...`);
            const notificationIds = selected.map(cb => cb.dataset.notificationId);
            const success = await acknowledgeMultipleNotifications(currentUser.mode, notificationIds);
            
            if (success) {
                alertUser(`${selected.length} Benachrichtigung(en) quittiert.`, 'success');
            }
            
            setProcessingOverlay(false);
        });
    }
}

export async function renderPendingNotifications() {
    // Legacy-Funktion für Abwärtskompatibilität - nutzt jetzt den Listener
    // Einmalige Aktualisierung beim ersten Aufruf
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    const notifications = await loadPendingNotifications(userId);
    updatePendingNotificationsUI(notifications);
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

    // Header mit Alle-auswählen + Alle-quittieren Button
    const headerHtml = `
        <div class="flex items-center justify-between mb-3 p-3 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="selectAllModalNotifications" class="h-5 w-5">
                <span class="text-sm font-bold text-gray-700">Alle auswählen</span>
            </label>
            <button id="acknowledgeAllModalBtn" class="px-5 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md" disabled>
                🗑️ Alle quittieren (<span id="selectedModalCount">0</span>)
            </button>
        </div>
    `;

    const notificationsHtml = notifications.map(notif => {
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

        // Wichtigste Infos hervorheben
        const scheduledDate = notif.nextSendAt?.toDate ? notif.nextSendAt.toDate() : null;
        const scheduledInfo = scheduledDate ? `📅 Geplant: ${scheduledDate.toLocaleString('de-DE')}` : '';

        return `
            <div class="notification-modal-card p-3 mb-2 border-l-4 ${program.borderClass} bg-${program.color}-50 rounded-lg hover:shadow-lg transition-shadow" data-notification-id="${notif.id}">
                <div class="flex items-start gap-3">
                    <input type="checkbox" class="modal-notification-checkbox h-5 w-5 mt-1" data-notification-id="${notif.id}">
                    <div class="flex-grow">
                        <div class="flex items-start justify-between gap-2 mb-1">
                            <div class="font-bold text-gray-900 text-base">${notif.title}</div>
                            <span class="text-xs px-2 py-1 bg-white rounded-full font-semibold ${program.textClass} border ${program.borderClass} whitespace-nowrap">
                                ${program.icon || '📌'} ${program.title}
                            </span>
                        </div>
                        <div class="text-sm text-gray-700 mt-2 leading-relaxed">${notif.message}</div>
                        <div class="text-xs text-gray-500 mt-2 flex flex-wrap gap-3">
                            <span>🕐 Erstellt: ${formattedDate}</span>
                            ${scheduledInfo ? `<span class="font-semibold text-orange-600">${scheduledInfo}</span>` : ''}
                            ${notif.repeatDays > 0 ? `<span>🔁 Wiederholt alle ${notif.repeatDays} Tage</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = headerHtml + notificationsHtml;

    // Event-Listener für Alle-auswählen mit Timer
    setupModalCheckboxListeners();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function setupModalCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.modal-notification-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllModalNotifications');
    const acknowledgeBtn = document.getElementById('acknowledgeAllModalBtn');
    const selectedCountSpan = document.getElementById('selectedModalCount');

    let selectAllClickCount = 0;
    let selectAllTimer = null;

    // Update Button-Status
    const updateButtonState = () => {
        const selected = Array.from(checkboxes).filter(cb => cb.checked);
        if (selectedCountSpan) selectedCountSpan.textContent = selected.length;
        if (acknowledgeBtn) acknowledgeBtn.disabled = selected.length === 0;
    };

    // Einzelne Checkboxen
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            updateButtonState();
            // Alle auswählen Checkbox aktualisieren
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
        });
    });

    // Alle auswählen/abwählen mit 3-Sekunden-Timer
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // ALLE AUSWÄHLEN - Mit Sicherheits-Timer
                selectAllClickCount++;
                
                if (selectAllClickCount === 1) {
                    // Erster Klick: Timer starten
                    e.target.checked = false;
                    e.target.nextElementSibling.innerHTML = '<span class="text-orange-600 font-bold">⏱️ Nochmal klicken in <span id="modalTimerCountdown">3</span>s</span>';
                    
                    let countdown = 3;
                    selectAllTimer = setInterval(() => {
                        countdown--;
                        const countdownSpan = document.getElementById('modalTimerCountdown');
                        if (countdownSpan) countdownSpan.textContent = countdown;
                        
                        if (countdown <= 0) {
                            clearInterval(selectAllTimer);
                            selectAllClickCount = 0;
                            e.target.nextElementSibling.innerHTML = '<span class="text-sm font-bold text-gray-700">Alle auswählen</span>';
                        }
                    }, 1000);
                } else if (selectAllClickCount === 2) {
                    // Zweiter Klick: Alle auswählen
                    clearInterval(selectAllTimer);
                    selectAllClickCount = 0;
                    e.target.nextElementSibling.innerHTML = '<span class="text-red-600 font-bold">Alle abwählen</span>';
                    checkboxes.forEach(cb => cb.checked = true);
                    updateButtonState();
                }
            } else {
                // ALLE ABWÄHLEN - Sofort ohne Timer
                e.target.nextElementSibling.innerHTML = '<span class="text-sm font-bold text-gray-700">Alle auswählen</span>';
                checkboxes.forEach(cb => cb.checked = false);
                updateButtonState();
                selectAllClickCount = 0;
                if (selectAllTimer) clearInterval(selectAllTimer);
            }
        });
    }

    // Alle-quittieren-Button
    if (acknowledgeBtn) {
        acknowledgeBtn.addEventListener('click', async () => {
            const selected = Array.from(checkboxes).filter(cb => cb.checked);
            if (selected.length === 0) return;

            const confirm = window.confirm(`${selected.length} Benachrichtigung(en) quittieren?`);
            if (!confirm) return;

            setProcessingOverlay(true, `Quittiere ${selected.length} Benachrichtigung(en)...`);
            
            const notificationIds = selected.map(cb => cb.dataset.notificationId);
            const success = await acknowledgeMultipleNotifications(currentUser.mode, notificationIds);
            
            if (success) {
                alertUser(`${selected.length} Benachrichtigung(en) quittiert.`, 'success');
                
                // Prüfen ob noch Benachrichtigungen übrig sind
                const remaining = await loadPendingNotifications(currentUser.mode);
                if (remaining.length === 0) {
                    const modal = document.getElementById('pendingNotificationsModal');
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                } else {
                    // Modal neu laden mit verbleibenden Benachrichtigungen
                    await checkAndShowPendingNotificationsModal();
                }
            }
            
            setProcessingOverlay(false);
        });
    }
}

export function initializePendingNotificationsModal() {
    const modal = document.getElementById('pendingNotificationsModal');
    const closeBtn = document.getElementById('closePendingNotificationsModal');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
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
        // User-Key aus Pushmail-Center laden (API-Token ist fest codiert)
        const cfgRef = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_programs', userId);
        const cfgSnap = await getDoc(cfgRef);

        if (!cfgSnap.exists()) {
            console.warn('Pushmail: Kein User-Key für Benutzer:', userId);
            return false;
        }

        const data = cfgSnap.data();
        const userKey = data.userKey;
        const apiToken = PUSHOVER_API_TOKEN;

        if (!userKey) {
            console.warn('Pushmail: User-Key fehlt');
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
