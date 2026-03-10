import { escapeHtml } from './haupteingang.js';

const APP_ROOT_ID = 'teraScannerAppRoot';

const SOURCE_TO_MANUAL_PAGE = {
    2: 1,
    3: 2,
    4: 3,
    22: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    23: 10,
    24: 11,
    10: 12,
    11: 13,
    12: 14,
    13: 15,
    14: 16,
    25: 17,
    15: 18,
    16: 19,
    29: 20,
    28: 21,
    27: 22,
    26: 23,
    17: 24,
    18: 25,
    19: 26
};

const PAGE_TITLES_DE = {
    1: 'Factory Reset & Arbeitsmodus',
    2: 'Arbeitsmodus & Kommunikation',
    3: '2.4G/Bluetooth Pairing',
    4: 'Bluetooth SPP/BLE & Übertragungsgeschwindigkeit',
    5: 'Bluetooth-Name / Scanmodus / Zentrierung',
    6: 'Lautstärke / Vibration / Sleep / iOS',
    7: 'Terminator & Tastatur-Sprache',
    8: 'Sprache/Fall & Symbologien-Übersicht',
    9: 'Inverted/UPC/EAN-8',
    10: 'EAN-13 / ISBN / ISSN / Code 128',
    11: 'GS1-128 / Code39 / Code32 / Code93',
    12: 'Code11 / Codabar / DataBar',
    13: '2D-Symbologien + GS Replacement',
    14: 'Prefix / Hide / ASCII Form',
    15: 'Suffix / Hide Prefix/Suffix',
    16: 'ASCII Transfer Meaning 0-3',
    17: 'ASCII Form 1-7',
    18: 'ASCII Form 8-13',
    19: 'ASCII Form 14-20',
    20: 'ASCII Form 21-27',
    21: 'ASCII Form 28-31 + Sonderzeichen',
    22: 'Zeichen-Tabelle Teil 1',
    23: 'Zeichen-Tabelle Teil 2',
    24: 'Zeichen-Tabelle Teil 3',
    25: 'Zeichen-Tabelle Teil 4',
    26: 'Service & Support'
};

const QUICK_GROUPS = [
    {
        title: 'Verbindung & Pairing',
        actions: [
            { label: '2.4G Modus', manualPage: 2, order: 5 },
            { label: 'Bluetooth HID Modus', manualPage: 2, order: 6 },
            { label: 'Bluetooth SPP Modus', manualPage: 2, order: 7 },
            { label: 'Bluetooth BLE Modus', manualPage: 2, order: 8 },
            { label: 'Pairing mit Dongle', manualPage: 3, order: 2 },
            { label: 'Pairing mit Bluetooth', manualPage: 3, order: 4 }
        ]
    },
    {
        title: 'Feedback (Ton/Vibration)',
        actions: [
            { label: 'Lautstärke Hoch', manualPage: 6, order: 1 },
            { label: 'Lautstärke Mittel', manualPage: 6, order: 2 },
            { label: 'Lautstärke Niedrig', manualPage: 6, order: 3 },
            { label: 'Ton AUS', manualPage: 6, order: 4 },
            { label: 'Vibration EIN', manualPage: 6, order: 5 },
            { label: 'Vibration AUS', manualPage: 6, order: 6 }
        ]
    },
    {
        title: 'Scan-Verhalten',
        actions: [
            { label: 'Werkseinstellungen', manualPage: 1, order: 1 },
            { label: 'Batteriestand', manualPage: 1, order: 2 },
            { label: 'Scanmodus Tastendruck', manualPage: 5, order: 3 },
            { label: 'Scanmodus Kontinuierlich', manualPage: 5, order: 4 },
            { label: 'Sleep 5 Minuten', manualPage: 6, order: 7 },
            { label: 'Sleep sofort', manualPage: 6, order: 10 }
        ]
    },
    {
        title: 'Symbologie',
        actions: [
            { label: 'Alle Barcodes EIN', manualPage: 8, order: 9 },
            { label: 'Alle Barcodes AUS', manualPage: 8, order: 10 },
            { label: 'QR-Code EIN', manualPage: 13, order: 1 },
            { label: 'QR-Code AUS', manualPage: 13, order: 2 },
            { label: 'Add Prefix', manualPage: 14, order: 1 },
            { label: 'Add Suffix', manualPage: 15, order: 1 }
        ]
    }
];

const PAGE_CODE_LABELS = {
    1: ['Werkseinstellungen', 'Batteriestand', 'Firmware-Version', 'Sofort-Upload-Modus'],
    2: ['Speichermodus', 'Gespeicherte Daten hochladen', 'Anzahl gespeicherter Codes', 'Speicher leeren', '2.4G-Modus', 'Bluetooth HID-Modus', 'Bluetooth SPP-Modus', 'Bluetooth BLE-Modus'],
    3: ['2.4G-Modus', 'Pairing mit Dongle erzwingen', 'Bluetooth HID-Modus', 'Pairing mit Bluetooth erzwingen'],
    4: ['8-Sekunden Pairing EIN', '8-Sekunden Pairing AUS', 'Bluetooth SPP-Modus', 'Bluetooth BLE-Modus', 'HID-Übertragung Hoch', 'HID-Übertragung Mittel', 'HID-Übertragung Niedrig', 'HID-Übertragung Sehr niedrig'],
    5: ['Bluetooth-Namenmodus aktivieren', 'Bluetooth-Namenbeispiel', 'Scanmodus Tastendruck', 'Scanmodus Dauerbetrieb', 'Zentrierung AUS', 'Nur zentrierter Code'],
    6: ['Lautstärke Hoch', 'Lautstärke Mittel', 'Lautstärke Niedrig', 'Ton AUS', 'Vibration EIN', 'Vibration AUS', 'Sleep 5 Minuten', 'Sleep 30 Minuten', 'Kein Sleep', 'Sleep sofort', 'iOS Keyboard EIN', 'iOS Keyboard AUS'],
    7: ['Terminator CR', 'Terminator LF', 'Terminator CR+LF', 'Kein Terminator', 'Terminator TAB', 'GBK Ausgabe', 'Unicode Ausgabe', 'Tastatursprache Englisch', 'Tastatursprache Deutsch', 'Tastatursprache Französisch', 'Tastatursprache Spanisch'],
    8: ['Tastatursprache Italienisch', 'Tastatursprache Japanisch', 'Tastatursprache Britisch Englisch', 'Internationales Keyboard', 'Groß/Klein unverändert', 'Alles Großbuchstaben', 'Alles Kleinbuchstaben', 'Groß/Klein invertieren', 'Alle Barcodes EIN', 'Alle Barcodes AUS', 'Alle 1D-Codes EIN', 'Alle 1D-Codes AUS'],
    9: ['Nur normale Codes', 'Normale + invertierte Codes', 'UPC-A EIN', 'UPC-A AUS', 'UPC-A Prüfziffer EIN', 'UPC-A Prüfziffer AUS', 'UPC-E EIN', 'UPC-E AUS', 'UPC-E Prüfziffer EIN', 'UPC-E Prüfziffer AUS', 'EAN-8 EIN', 'EAN-8 AUS'],
    13: ['QR-Code EIN', 'QR-Code AUS', 'Micro-QR EIN', 'Micro-QR AUS', 'DataMatrix EIN', 'DataMatrix AUS', 'PDF417 EIN', 'PDF417 AUS', 'MicroPDF417 EIN', 'MicroPDF417 AUS', 'GS-Ersatz EIN', 'GS-Ersatz AUS']
};

const EXTRA_CODES = [
    { id: 'p21_char01', sourcePage: 28, manualPage: 21, index: 901, file: 'assets/tera-scanner/codes/p21_char01.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char02', sourcePage: 28, manualPage: 21, index: 902, file: 'assets/tera-scanner/codes/p21_char02.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char03', sourcePage: 28, manualPage: 21, index: 903, file: 'assets/tera-scanner/codes/p21_char03.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char04', sourcePage: 28, manualPage: 21, index: 904, file: 'assets/tera-scanner/codes/p21_char04.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char05', sourcePage: 28, manualPage: 21, index: 905, file: 'assets/tera-scanner/codes/p21_char05.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char06', sourcePage: 28, manualPage: 21, index: 906, file: 'assets/tera-scanner/codes/p21_char06.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char07', sourcePage: 28, manualPage: 21, index: 907, file: 'assets/tera-scanner/codes/p21_char07.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char08', sourcePage: 28, manualPage: 21, index: 908, file: 'assets/tera-scanner/codes/p21_char08.png', x: 0, y: 0, w: 140, h: 140 },
    { id: 'p21_char09', sourcePage: 28, manualPage: 21, index: 909, file: 'assets/tera-scanner/codes/p21_char09.png', x: 0, y: 0, w: 140, h: 140 }
];

const FAVORITES_STORAGE_KEY = 'tera_scanner_favorites_v1';

let cachedCodes = [];
let codesById = new Map();
let charToCode = new Map();
let codeIdToChar = new Map();

let activeSequence = [];
let activeIndex = 0;
let activeTitle = '';
let activeMode = 'manual';
let autoIntervalSeconds = 2;
let autoTimer = null;
let countdownTimer = null;
let countdownSeconds = null;
let autoReplayReady = false;
let menuStep = 'category';
let selectedCategoryId = '';
let favorites = [];

function getRoot() {
    return document.getElementById(APP_ROOT_ID);
}

function stopAutoTimer() {
    if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
    }
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }
    countdownSeconds = null;
}

function getCodeType(code) {
    return code.w >= code.h * 1.8 ? 'BAR' : 'QR';
}

function getManualPageCodes(manualPage) {
    return cachedCodes
        .filter((c) => c.manualPage === manualPage)
        .sort((a, b) => a.index - b.index);
}

function getCodeByManualOrder(manualPage, order) {
    const list = getManualPageCodes(manualPage);
    return list[order - 1] || null;
}

function buildCharacterMap() {
    charToCode = new Map();
    codeIdToChar = new Map();

    const assignChars = (manualPage, chars) => {
        const list = getManualPageCodes(manualPage);
        let i = 0;
        chars.forEach((ch) => {
            if (!ch) return;
            const code = list[i];
            i += 1;
            if (!code) return;
            charToCode.set(ch, code);
            codeIdToChar.set(code.id, ch);
        });
    };

    assignChars(22, ['(', ')', '*', '+', ',', '-', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?', '@', 'A', 'B']);
    assignChars(23, ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']']);
    assignChars(24, ['^', '_', '`', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u']);
    assignChars(25, ['v', 'w', 'x', 'y', 'z', '{', '|', '}', '~', 'DEL', 'Ç', 'ç']);

    const extraSymbolById = {
        '-': 'p21_char01',
        ' ': 'p21_char02',
        '!': 'p21_char03',
        '"': 'p21_char04',
        '#': 'p21_char05',
        '$': 'p21_char06',
        '%': 'p21_char07',
        '&': 'p21_char08',
        '`': 'p21_char09'
    };

    Object.entries(extraSymbolById).forEach(([char, codeId]) => {
        const code = codesById.get(codeId);
        if (!code) return;
        charToCode.set(char, code);
        codeIdToChar.set(code.id, char);
    });
}

function getManualPosition(code) {
    const list = getManualPageCodes(code.manualPage);
    return list.findIndex((c) => c.id === code.id) + 1;
}

function getCodeFunctionalName(code) {
    const char = codeIdToChar.get(code.id);
    if (char) {
        return char === ' ' ? 'Zeichen Leerzeichen' : `Zeichen ${char}`;
    }

    const labels = PAGE_CODE_LABELS[code.manualPage] || [];
    const pos = getManualPosition(code);
    if (pos > 0 && pos <= labels.length) {
        return labels[pos - 1];
    }

    const chapterTitle = PAGE_TITLES_DE[code.manualPage] || `Kapitel ${String(code.manualPage).padStart(2, '0')}`;
    return `${chapterTitle} · Eintrag ${String(pos > 0 ? pos : code.index).padStart(2, '0')}`;
}

function getCodeCategoryLabel(code) {
    const title = PAGE_TITLES_DE[code.manualPage] || `Kapitel ${code.manualPage}`;
    return `Kapitel ${String(code.manualPage).padStart(2, '0')} > ${title}`;
}

function getCodeLabel(code) {
    return `${getCodeCategoryLabel(code)} > ${getCodeFunctionalName(code)}`;
}

function areCodeIdSequencesEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function getActiveSequenceCodeIds() {
    return activeSequence
        .map((entry) => (entry.code || entry)?.id)
        .filter(Boolean);
}

function isCodeIdsFavorited(codeIds) {
    return favorites.some((fav) => areCodeIdSequencesEqual(fav.codeIds, codeIds));
}

function loadFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
        const parsed = JSON.parse(raw || '[]');
        favorites = Array.isArray(parsed)
            ? parsed.filter((item) => item && Array.isArray(item.codeIds) && item.codeIds.length > 0)
            : [];
    } catch {
        favorites = [];
    }
}

function persistFavorites() {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
        // no-op (z. B. private mode)
    }
}

function addFavoriteFromActiveSequence() {
    if (!activeSequence.length) return;

    const codeIds = getActiveSequenceCodeIds();
    if (!codeIds.length || isCodeIdsFavorited(codeIds)) return;

    const suggested = activeTitle || (codeIds.length > 1 ? 'Neue Sequenz' : 'Neuer Favorit');
    const title = window.prompt('Favorit-Titel eingeben:', suggested);
    if (!title || !title.trim()) return;

    favorites.unshift({
        id: `fav_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: title.trim(),
        codeIds,
        createdAt: Date.now()
    });
    persistFavorites();
}

function removeFavoriteById(favoriteId) {
    favorites = favorites.filter((item) => item.id !== favoriteId);
    persistFavorites();
}

function openFavoriteById(favoriteId) {
    const favorite = favorites.find((item) => item.id === favoriteId);
    if (!favorite) return;

    const seq = favorite.codeIds
        .map((codeId, index) => {
            const code = codesById.get(codeId);
            if (!code) return null;
            return {
                code,
                repeatScan: index > 0 && favorite.codeIds[index - 1] === codeId
            };
        })
        .filter(Boolean);

    if (!seq.length) return;
    if (seq.length === 1) {
        showSingleCode(seq[0].code, favorite.title);
        return;
    }
    showSequence(seq, favorite.title, 'manual', autoIntervalSeconds);
}

function startAutoPlaybackPass() {
    const root = getRoot();
    if (!root || activeSequence.length <= 1) return;

    activeIndex = 0;
    renderViewer(root);

    let nextIndex = 1;
    autoTimer = setInterval(() => {
        const activeRoot = getRoot();
        if (!activeRoot) {
            stopAutoTimer();
            return;
        }

        if (nextIndex >= activeSequence.length) {
            stopAutoTimer();
            activeMode = 'manual';
            autoReplayReady = true;
            renderViewer(activeRoot);
            return;
        }

        activeIndex = nextIndex;
        nextIndex += 1;
        renderViewer(activeRoot);
    }, autoIntervalSeconds * 1000);
}

function startAutoSequencePlayback() {
    if (activeSequence.length <= 1) return;

    stopAutoTimer();
    activeMode = 'auto';
    autoReplayReady = false;
    countdownSeconds = 3;

    const root = getRoot();
    if (root) renderViewer(root);

    const tick = () => {
        const activeRoot = getRoot();
        if (!activeRoot) {
            stopAutoTimer();
            return;
        }

        if (countdownSeconds === null) return;

        if (countdownSeconds <= 0) {
            countdownTimer = setTimeout(() => {
                countdownSeconds = null;
                startAutoPlaybackPass();
            }, 1000);
            renderViewer(activeRoot);
            return;
        }

        countdownTimer = setTimeout(() => {
            countdownSeconds = Math.max(0, countdownSeconds - 1);
            tick();
        }, 1000);
        renderViewer(activeRoot);
    };

    tick();
}

function getMenuCategories() {
    const categories = [];

    categories.push({
        id: 'favorites',
        title: 'Favoriten',
        subtitle: favorites.length ? `${favorites.length} gespeichert` : 'Noch keine Favoriten',
        type: 'favorites',
        items: favorites
    });

    QUICK_GROUPS.forEach((group, index) => {
        const items = group.actions
            .map((action) => {
                const code = getCodeByManualOrder(action.manualPage, action.order);
                if (!code) return null;
                return { code, label: action.label };
            })
            .filter(Boolean);

        if (items.length) {
            categories.push({
                id: `quick-${index}`,
                title: group.title,
                subtitle: 'Gebündelte Funktionen',
                type: 'codes',
                items
            });
        }
    });

    const pages = Array.from(new Set(cachedCodes.map((c) => c.manualPage))).sort((a, b) => a - b);
    pages.forEach((manualPage) => {
        const items = getManualPageCodes(manualPage).map((code) => ({
            code,
            label: getCodeFunctionalName(code)
        }));

        if (items.length) {
            categories.push({
                id: `chapter-${manualPage}`,
                title: `Kapitel ${String(manualPage).padStart(2, '0')}`,
                subtitle: PAGE_TITLES_DE[manualPage] || 'Scanner-Funktionen',
                type: 'codes',
                items
            });
        }
    });

    categories.push({
        id: 'chars',
        title: 'Zeichen & Wort-Sequenz',
        subtitle: 'Einzelzeichen und Wörter scannen',
        type: 'chars',
        items: []
    });

    return categories;
}

function renderBaseLayout(root) {
    root.innerHTML = `
        <section class="h-[calc(100dvh-255px)] min-h-[500px] max-h-[700px] flex flex-col gap-2 overflow-hidden">
            <div class="card bg-white rounded-xl border border-gray-200 p-2.5 shadow-sm basis-[34%] min-h-[165px]">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="text-sm font-black text-gray-800">Aktiver Code</h3>
                </div>
                <div id="teraViewerEmpty" class="text-xs text-gray-500 rounded-lg bg-gray-50 p-2 border border-gray-200">Unten zuerst Kategorie wählen, dann Funktion antippen.</div>
                <div id="teraViewerActive" class="hidden space-y-2 min-w-0 h-full">
                    <div class="min-w-0">
                        <p id="teraViewerTitle" class="font-bold text-gray-800 text-xs break-words"></p>
                        <p id="teraViewerSubline" class="text-[11px] text-gray-600 break-words"></p>
                        <p id="teraViewerCounter" class="text-[11px] text-gray-500"></p>
                        <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-1 mb-1">
                            <button id="teraPrevBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold">◀ Vor</button>
                            <button id="teraNextBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold">Weiter ▶</button>
                            <button id="teraBackToOverviewBtn" class="py-1.5 px-2 rounded-md bg-slate-700 text-white text-xs font-semibold">Zurück</button>
                            <button id="teraToggleAutoBtn" class="py-1.5 px-2 rounded-md bg-orange-100 border border-orange-200 text-xs font-semibold text-orange-700">Auto</button>
                            <button id="teraSaveFavoriteBtn" class="py-1.5 px-2 rounded-md bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-800">★ Favorit</button>
                        </div>
                        <p id="teraViewerRepeatHint" class="text-[11px] font-semibold"></p>
                    </div>
                    <div class="rounded-xl border border-gray-200 p-2 bg-white overflow-hidden">
                        <div id="teraViewerCountdown" class="hidden h-[12vh] flex items-center justify-center text-3xl font-black text-orange-600"></div>
                        <img id="teraViewerImage" src="" alt="Scanner-Code" class="w-full max-h-[12vh] object-contain mx-auto" />
                    </div>
                </div>
            </div>

            <div class="card bg-white rounded-xl border border-gray-200 p-2 shadow-sm basis-[66%] min-h-[280px] overflow-hidden">
                <div class="flex items-center gap-2 mb-2">
                    <h3 class="text-base font-black text-gray-800">Menüleiste</h3>
                    <button id="teraMenuHeaderBackBtn" class="hidden justify-self-center py-1 px-2 rounded-md bg-gray-100 border border-gray-300 text-xs font-semibold">&lt; Kategorien</button>
                </div>
                <div id="teraMenuContent" class="h-full overflow-x-auto overflow-y-hidden"></div>
            </div>
        </section>
    `;
}

function renderMenu(root) {
    const host = root.querySelector('#teraMenuContent');
    const menuBackBtn = root.querySelector('#teraMenuHeaderBackBtn');
    if (!host) return;

    if (menuBackBtn) {
        menuBackBtn.classList.toggle('hidden', menuStep === 'category');
    }

    const categories = getMenuCategories();

    if (menuStep === 'category') {
        host.innerHTML = `
            <div class="grid grid-flow-col auto-cols-[170px] grid-rows-4 gap-2 overflow-x-auto pb-1">
                ${categories.map((category) => `
                    <button data-ts-category-id="${escapeHtml(category.id)}" class="text-left rounded-lg border border-gray-200 p-1.5 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition min-h-[48px]">
                        <p class="text-xs font-black text-gray-800 uppercase tracking-wide">${escapeHtml(category.title)}</p>
                        <p class="text-[11px] text-gray-600 mt-1">${escapeHtml(category.subtitle)}</p>
                    </button>
                `).join('')}
            </div>
        `;
        return;
    }

    const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
    if (!selectedCategory) {
        menuStep = 'category';
        selectedCategoryId = '';
        renderMenu(root);
        return;
    }

    if (selectedCategory.type === 'favorites') {
        host.innerHTML = selectedCategory.items.length
            ? `
                <div class="grid grid-flow-col auto-cols-[190px] grid-rows-4 gap-1.5 overflow-x-auto pb-1">
                    ${selectedCategory.items.map((fav) => `
                        <div class="rounded-md border border-amber-200 bg-amber-50 p-1 min-w-0">
                            <button data-ts-favorite-id="${escapeHtml(fav.id)}" class="w-full text-left">
                                <p class="text-xs font-bold text-amber-900 break-words">★ ${escapeHtml(fav.title || 'Favorit')}</p>
                                <p class="text-[11px] text-amber-700">${fav.codeIds.length > 1 ? `Sequenz (${fav.codeIds.length} Codes)` : 'Einzelcode'}</p>
                            </button>
                            <button data-ts-delete-favorite-id="${escapeHtml(fav.id)}" class="mt-1 w-full py-1 rounded border border-red-300 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100">Löschen</button>
                        </div>
                    `).join('')}
                </div>
            `
            : '<div class="text-xs text-gray-500 rounded-lg bg-gray-50 p-2 border border-gray-200">Noch keine Favoriten gespeichert. Öffne oben einen Code/Sequenz und tippe auf ★ Favorit.</div>';
        return;
    }

    if (selectedCategory.type === 'chars') {
        host.innerHTML = `
            <p class="text-xs font-black text-gray-700 mb-2">${escapeHtml(selectedCategory.title)}</p>
            <p class="text-xs text-gray-500 mb-2">Wort eingeben und Sequenz starten. Doppelte Zeichen werden auffällig markiert.</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-1 mb-1.5">
                <input id="teraWordInput" type="text" placeholder="z. B. HALLO123" class="sm:col-span-2 p-2 border border-gray-300 rounded-lg text-sm" />
                <select id="teraModeSelect" class="p-2 border border-gray-300 rounded-lg text-sm">
                    <option value="manual">Manuell</option>
                    <option value="auto">Automatisch</option>
                </select>
                <select id="teraIntervalSelect" class="p-2 border border-gray-300 rounded-lg text-sm">
                    <option value="1">1 Sekunde</option>
                    <option value="2" selected>2 Sekunden</option>
                    <option value="3">3 Sekunden</option>
                    <option value="4">4 Sekunden</option>
                    <option value="5">5 Sekunden</option>
                </select>
            </div>
            <div class="flex flex-wrap gap-1.5 mb-2">
                <button id="teraStartWordBtn" class="py-1.5 px-2 rounded-md bg-orange-500 text-white text-xs font-semibold">Wort-Sequenz starten</button>
                <button id="teraShowSingleCharBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-300 text-xs font-semibold">Erstes Zeichen einzeln</button>
            </div>
            <div class="overflow-x-auto overflow-y-hidden pb-1">
                <div id="teraCharGrid" class="grid grid-flow-col auto-cols-[34px] grid-rows-2 gap-1"></div>
            </div>
            <p id="teraCharHint" class="text-[11px] text-gray-500 mt-1"></p>
        `;
        renderCharGrid(root);
        return;
    }

    host.innerHTML = `
        <p class="text-xs font-black text-gray-700 text-right mb-2">${escapeHtml(selectedCategory.title)}</p>
        <div class="grid grid-flow-col auto-cols-[190px] grid-rows-4 gap-1.5 overflow-x-auto pb-1">
            ${selectedCategory.items.map((item) => `
                <button data-ts-code-id="${escapeHtml(item.code.id)}" class="text-left p-2 rounded-md border border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50 transition min-w-0">
                    <p class="text-xs font-bold text-gray-800 break-words">${escapeHtml(item.label)}</p>
                    <p class="text-[11px] text-gray-500">${getCodeType(item.code)} · Quelle ${String(item.code.sourcePage).padStart(2, '0')}</p>
                </button>
            `).join('')}
        </div>
    `;
}

function renderQuickGroups(root) {
    const groupsHost = root.querySelector('#teraQuickGroups');
    if (!groupsHost) return;

    groupsHost.innerHTML = QUICK_GROUPS.map((group) => {
        const buttons = group.actions.map((action) => {
            const code = getCodeByManualOrder(action.manualPage, action.order);
            if (!code) return '';
            return `
                <button data-ts-code-id="${escapeHtml(code.id)}" class="text-left px-2 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition min-w-0">
                    <p class="text-xs font-semibold text-gray-800 break-words">${escapeHtml(action.label)}</p>
                    <p class="text-[11px] text-gray-500">Kapitel ${String(action.manualPage).padStart(2, '0')}</p>
                </button>
            `;
        }).join('');

        return `
            <div class="rounded-lg border border-gray-200 p-2 bg-white">
                <h4 class="text-xs font-black text-gray-700 uppercase tracking-wide mb-1">${escapeHtml(group.title)}</h4>
                <div class="grid grid-cols-2 gap-1">${buttons}</div>
            </div>
        `;
    }).join('');
}

function renderCharGrid(root) {
    const grid = root.querySelector('#teraCharGrid');
    const hint = root.querySelector('#teraCharHint');
    if (!grid || !hint) return;

    const chars = Array.from(charToCode.keys()).sort((a, b) => a.localeCompare(b));
    grid.innerHTML = chars.map((ch) => {
        const label = ch === ' ' ? '␠' : ch;
        return `<button data-ts-char="${escapeHtml(ch)}" class="py-1 px-2 rounded border border-gray-300 bg-gray-50 text-xs font-semibold hover:bg-orange-50 hover:border-orange-300">${escapeHtml(label)}</button>`;
    }).join('');

    hint.textContent = `Verfügbare Zeichen-Codes: ${chars.length}. Nicht verfügbare Zeichen werden bei der Wort-Sequenz übersprungen.`;
}

function renderGlobalList(root) {
    const searchInput = root.querySelector('#teraSearchInput');
    const container = root.querySelector('#teraGlobalList');
    if (!container) return;

    const search = (searchInput?.value || '').trim().toLowerCase();
    const pages = Array.from(new Set(cachedCodes.map((c) => c.manualPage))).sort((a, b) => a - b);

    container.innerHTML = pages.map((manualPage) => {
        const chapterCodes = getManualPageCodes(manualPage).filter((code) => {
            const hay = `${getCodeLabel(code)} ${getCodeType(code)} ${code.id}`.toLowerCase();
            return !search || hay.includes(search);
        });

        if (!chapterCodes.length) return '';

        const title = PAGE_TITLES_DE[manualPage] || `Kapitel ${manualPage}`;
        return `
            <div class="rounded-lg border border-gray-200 overflow-hidden">
                <div class="px-2 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-700">Kapitel ${String(manualPage).padStart(2, '0')} > ${escapeHtml(title)} (${chapterCodes.length})</div>
                <div class="p-1.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    ${chapterCodes.map((code) => `
                        <button data-ts-code-id="${escapeHtml(code.id)}" class="text-left p-2 rounded-md border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition min-w-0">
                            <p class="text-xs font-bold text-gray-800 break-words">${escapeHtml(getCodeFunctionalName(code))}</p>
                            <p class="text-[11px] text-gray-500">${getCodeType(code)} · Quelle ${String(code.sourcePage).padStart(2, '0')}</p>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function renderViewer(root) {
    const empty = root.querySelector('#teraViewerEmpty');
    const active = root.querySelector('#teraViewerActive');
    const title = root.querySelector('#teraViewerTitle');
    const subline = root.querySelector('#teraViewerSubline');
    const counter = root.querySelector('#teraViewerCounter');
    const repeatHint = root.querySelector('#teraViewerRepeatHint');
    const countdown = root.querySelector('#teraViewerCountdown');
    const image = root.querySelector('#teraViewerImage');
    const prevBtn = root.querySelector('#teraPrevBtn');
    const nextBtn = root.querySelector('#teraNextBtn');
    const autoBtn = root.querySelector('#teraToggleAutoBtn');
    const saveFavoriteBtn = root.querySelector('#teraSaveFavoriteBtn');

    if (!empty || !active || !title || !subline || !counter || !repeatHint || !countdown || !image || !prevBtn || !nextBtn || !autoBtn || !saveFavoriteBtn) return;

    if (!activeSequence.length) {
        empty.classList.remove('hidden');
        active.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    active.classList.remove('hidden');

    const entry = activeSequence[activeIndex];
    const code = entry.code || entry;
    image.src = code.file;
    image.alt = `Scanner-Code ${code.id}`;

    if (countdownSeconds !== null) {
        image.classList.add('hidden');
        countdown.classList.remove('hidden');
        countdown.textContent = `${countdownSeconds} s`;
    } else {
        image.classList.remove('hidden');
        countdown.classList.add('hidden');
        countdown.textContent = '';
    }

    title.textContent = getCodeFunctionalName(code);
    subline.textContent = activeTitle ? `${activeTitle} · ${getCodeCategoryLabel(code)}` : getCodeCategoryLabel(code);
    counter.textContent = `Schritt ${activeIndex + 1}/${activeSequence.length} · ${getCodeType(code)} · Modus: ${activeMode === 'auto' ? 'Automatisch' : 'Manuell'}`;
    if (entry.char) {
        const printableChar = entry.char === ' ' ? 'Leerzeichen' : entry.char;
        if (entry.repeatScan) {
            repeatHint.className = 'text-[12px] font-black text-red-900 bg-red-100 border-2 border-red-400 rounded-md px-2 py-1 animate-pulse';
            repeatHint.textContent = `⚠ NOCHMALS SCANNEN: '${printableChar}' ist doppelt!`;
        } else {
            repeatHint.className = 'text-[11px] font-semibold text-orange-700';
            repeatHint.textContent = `Zeichen: '${printableChar}'.`;
        }
    } else {
        repeatHint.className = 'text-[11px] font-semibold text-transparent';
        repeatHint.textContent = '';
    }

    const multiple = activeSequence.length > 1;
    prevBtn.disabled = !multiple;
    nextBtn.disabled = !multiple;
    autoBtn.disabled = !multiple;
    prevBtn.classList.toggle('opacity-50', !multiple);
    nextBtn.classList.toggle('opacity-50', !multiple);
    autoBtn.classList.toggle('opacity-50', !multiple);
    autoBtn.classList.toggle('border-gray-300', !multiple);
    autoBtn.classList.toggle('text-gray-400', !multiple);

    const autoActive = Boolean(autoTimer || countdownTimer);
    autoBtn.textContent = autoActive
        ? 'Auto stoppen'
        : multiple
            ? (autoReplayReady ? 'Nochmal abspielen' : `Automatisch (${autoIntervalSeconds}s)`)
            : 'Automatisch (nur Sequenz)';

    const activeCodeIds = getActiveSequenceCodeIds();
    const alreadyFavorited = isCodeIdsFavorited(activeCodeIds);
    saveFavoriteBtn.classList.toggle('hidden', alreadyFavorited);
    if (!alreadyFavorited) {
        saveFavoriteBtn.textContent = activeSequence.length > 1 ? '★ Sequenz-Favorit' : '★ Code-Favorit';
    }
}

function showSequence(sequence, title, mode, intervalSeconds) {
    stopAutoTimer();
    activeSequence = sequence;
    activeIndex = 0;
    activeTitle = title || '';
    activeMode = mode === 'auto' && sequence.length > 1 ? 'auto' : 'manual';
    autoIntervalSeconds = intervalSeconds;
    autoReplayReady = false;

    const root = getRoot();
    if (!root) return;

    renderViewer(root);

    if (mode === 'auto' && sequence.length > 1) {
        startAutoSequencePlayback();
    }
}

function showSingleCode(code, title = '') {
    showSequence([{ code, repeatScan: false }], title || getCodeLabel(code), 'manual', 2);
}

function handleRootClick(event) {
    const root = getRoot();
    if (!root) return;

    const categoryBtn = event.target.closest('[data-ts-category-id]');
    if (categoryBtn) {
        selectedCategoryId = categoryBtn.dataset.tsCategoryId || '';
        menuStep = 'function';
        renderMenu(root);
        return;
    }

    if (event.target.closest('#teraMenuHeaderBackBtn')) {
        menuStep = 'category';
        selectedCategoryId = '';
        renderMenu(root);
        return;
    }

    const deleteFavoriteBtn = event.target.closest('[data-ts-delete-favorite-id]');
    if (deleteFavoriteBtn) {
        const favoriteId = deleteFavoriteBtn.dataset.tsDeleteFavoriteId;
        if (favoriteId) {
            removeFavoriteById(favoriteId);
            renderMenu(root);
            renderViewer(root);
        }
        return;
    }

    const favoriteBtn = event.target.closest('[data-ts-favorite-id]');
    if (favoriteBtn) {
        const favoriteId = favoriteBtn.dataset.tsFavoriteId;
        if (favoriteId) openFavoriteById(favoriteId);
        return;
    }

    const codeBtn = event.target.closest('[data-ts-code-id]');
    if (codeBtn) {
        const code = codesById.get(codeBtn.dataset.tsCodeId);
        if (code) showSingleCode(code);
        return;
    }

    const charBtn = event.target.closest('[data-ts-char]');
    if (charBtn) {
        const ch = charBtn.dataset.tsChar;
        const code = charToCode.get(ch);
        if (code) showSingleCode(code, `Zeichen: ${ch === ' ' ? 'Leerzeichen' : ch}`);
        return;
    }

    const prevBtn = event.target.closest('#teraPrevBtn');
    if (prevBtn && activeSequence.length > 1) {
        stopAutoTimer();
        activeMode = 'manual';
        autoReplayReady = true;
        activeIndex = (activeIndex - 1 + activeSequence.length) % activeSequence.length;
        renderViewer(root);
        return;
    }

    const nextBtn = event.target.closest('#teraNextBtn');
    if (nextBtn && activeSequence.length > 1) {
        stopAutoTimer();
        activeMode = 'manual';
        autoReplayReady = true;
        activeIndex = (activeIndex + 1) % activeSequence.length;
        renderViewer(root);
        return;
    }

    const toggleAutoBtn = event.target.closest('#teraToggleAutoBtn');
    if (toggleAutoBtn) {
        if (autoTimer || countdownTimer) {
            stopAutoTimer();
            activeMode = 'manual';
            autoReplayReady = true;
            renderViewer(root);
            return;
        }

        if (activeSequence.length > 1) {
            startAutoSequencePlayback();
        }
        return;
    }

    if (event.target.closest('#teraSaveFavoriteBtn')) {
        addFavoriteFromActiveSequence();
        renderMenu(root);
        return;
    }

    if (event.target.closest('#teraBackToOverviewBtn')) {
        stopAutoTimer();
        activeSequence = [];
        activeIndex = 0;
        activeTitle = '';
        autoReplayReady = false;
        menuStep = 'category';
        selectedCategoryId = '';
        renderMenu(root);
        renderViewer(root);
        return;
    }

    if (event.target.closest('#teraStartWordBtn') || event.target.closest('#teraShowSingleCharBtn')) {
        const input = root.querySelector('#teraWordInput');
        const modeSelect = root.querySelector('#teraModeSelect');
        const intervalSelect = root.querySelector('#teraIntervalSelect');
        const hint = root.querySelector('#teraCharHint');
        if (!input || !modeSelect || !intervalSelect) return;

        const raw = String(input.value || '');
        if (!raw.trim()) return;

        const chars = Array.from(raw);
        const missing = [];
        let repeats = 0;
        const sequence = chars
            .map((ch, idx) => {
                const code = charToCode.get(ch);
                if (!code) missing.push(ch);
                const repeatScan = idx > 0 && chars[idx - 1] === ch;
                if (repeatScan) repeats += 1;
                return code ? { code, char: ch, repeatScan } : null;
            })
            .filter(Boolean);

        if (hint) {
            const repeatText = repeats > 0 ? ` Wiederholungen erkannt: ${repeats}x (erneut scannen nötig).` : '';
            if (missing.length) {
                hint.textContent = `Achtung: ${missing.length} Zeichen ohne Mapping wurden übersprungen (${missing.join(' ')}).${repeatText}`;
            } else {
                hint.textContent = `Verfügbare Zeichen-Codes: ${charToCode.size}. Nicht verfügbare Zeichen werden bei der Wort-Sequenz übersprungen.${repeatText}`;
            }
        }

        if (!sequence.length) {
            return;
        }

        const clickedSingle = event.target.closest('#teraShowSingleCharBtn');
        const mode = clickedSingle ? 'manual' : modeSelect.value;
        const interval = Math.min(5, Math.max(1, Number(intervalSelect.value) || 2));

        if (clickedSingle) {
            const first = sequence[0];
            const printableChar = first.char === ' ' ? 'Leerzeichen' : first.char;
            showSingleCode(first.code, `Zeichen: ${printableChar}`);
            return;
        }

        showSequence(sequence, `Wort-Sequenz: ${raw}`, mode, interval);
    }
}

function handleRootInput(event) {
    if (event.target.id === 'teraSearchInput') {
        const root = getRoot();
        if (root) renderGlobalList(root);
    }
}

function normalizeCodes(rawCodes) {
    const allowedSourcePages = new Set(Object.keys(SOURCE_TO_MANUAL_PAGE).map((k) => Number(k)));

    return rawCodes
        .filter((item) => allowedSourcePages.has(Number(item.page)))
        .map((item) => ({
            id: item.id,
            sourcePage: Number(item.page),
            manualPage: SOURCE_TO_MANUAL_PAGE[Number(item.page)] || Number(item.page),
            index: Number(item.index),
            file: item.file,
            x: Number(item.x),
            y: Number(item.y),
            w: Number(item.w),
            h: Number(item.h)
        }))
        .sort((a, b) => (a.manualPage - b.manualPage) || (a.index - b.index));
}

async function ensureCodesLoaded() {
    if (cachedCodes.length) return;

    const response = await fetch('assets/tera-scanner/codes/manifest.json', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Manifest konnte nicht geladen werden (${response.status}).`);
    }

    const raw = await response.json();
    cachedCodes = normalizeCodes(Array.isArray(raw) ? raw : []).concat(EXTRA_CODES);
    cachedCodes.sort((a, b) => (a.manualPage - b.manualPage) || (a.index - b.index));
    codesById = new Map(cachedCodes.map((code) => [code.id, code]));
    buildCharacterMap();
}

function bindRootEvents(root) {
    if (root.dataset.tsBound === '1') return;
    root.addEventListener('click', handleRootClick);
    root.addEventListener('input', handleRootInput);
    root.dataset.tsBound = '1';
}

export async function initializeTeraScannerView() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = '<div class="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Lade Codes…</div>';

    try {
        await ensureCodesLoaded();
        loadFavorites();
        renderBaseLayout(root);
        menuStep = 'category';
        selectedCategoryId = '';
        renderMenu(root);
        renderViewer(root);
        bindRootEvents(root);
    } catch (error) {
        console.error('Tera-Scanner konnte nicht initialisiert werden:', error);
        root.innerHTML = `<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Fehler beim Laden der Tera-Scanner-Codes: ${escapeHtml(error?.message || 'Unbekannter Fehler')}</div>`;
    }
}

export function stopTeraScannerListeners() {
    stopAutoTimer();
    activeSequence = [];
    activeIndex = 0;
    activeTitle = '';
    autoReplayReady = false;
}
