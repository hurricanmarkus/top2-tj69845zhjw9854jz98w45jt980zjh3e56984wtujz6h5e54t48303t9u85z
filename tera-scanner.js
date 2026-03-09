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
let menuStep = 'category';
let selectedCategoryId = '';

function getRoot() {
    return document.getElementById(APP_ROOT_ID);
}

function stopAutoTimer() {
    if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
    }
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

    return `Funktion ${String(pos > 0 ? pos : code.index).padStart(2, '0')}`;
}

function getCodeCategoryLabel(code) {
    const title = PAGE_TITLES_DE[code.manualPage] || `Kapitel ${code.manualPage}`;
    return `Kapitel ${String(code.manualPage).padStart(2, '0')} > ${title}`;
}

function getCodeLabel(code) {
    return `${getCodeCategoryLabel(code)} > ${getCodeFunctionalName(code)}`;
}

function getMenuCategories() {
    const categories = [];

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
        <section class="h-[calc(100dvh-220px)] min-h-[540px] max-h-[780px] flex flex-col gap-2 overflow-hidden">
            <div class="card bg-white rounded-xl border border-gray-200 p-3 shadow-sm basis-[42%] min-h-[210px]">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="text-base font-black text-gray-800">Aktiver Code</h3>
                    <span class="text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">oben: Code</span>
                </div>
                <div id="teraViewerEmpty" class="text-xs text-gray-500 rounded-lg bg-gray-50 p-2 border border-gray-200">Unten zuerst Kategorie wählen, dann Funktion antippen.</div>
                <div id="teraViewerActive" class="hidden space-y-2 min-w-0 h-full">
                    <div class="min-w-0">
                        <p id="teraViewerTitle" class="font-bold text-gray-800 text-xs break-words"></p>
                        <p id="teraViewerSubline" class="text-[11px] text-gray-600 break-words"></p>
                        <p id="teraViewerCounter" class="text-[11px] text-gray-500"></p>
                        <p id="teraViewerRepeatHint" class="text-[11px] font-semibold"></p>
                    </div>
                    <div class="rounded-xl border border-gray-200 p-2 bg-white overflow-hidden">
                        <img id="teraViewerImage" src="" alt="Scanner-Code" class="w-full max-h-[24vh] object-contain mx-auto" />
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <button id="teraPrevBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold">◀ Vor</button>
                        <button id="teraNextBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold">Weiter ▶</button>
                        <button id="teraToggleAutoBtn" class="py-1.5 px-2 rounded-md bg-orange-100 border border-orange-200 text-xs font-semibold text-orange-700">Auto</button>
                        <button id="teraBackToOverviewBtn" class="py-1.5 px-2 rounded-md bg-slate-700 text-white text-xs font-semibold">Zurück zur Auswahl</button>
                    </div>
                </div>
            </div>

            <div class="card bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex-1 min-h-0 overflow-hidden">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="text-base font-black text-gray-800">Menüleiste</h3>
                    <span class="text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">unten: Auswahl</span>
                </div>
                <div id="teraMenuContent" class="h-full overflow-auto"></div>
            </div>
        </section>
    `;
}

function renderMenu(root) {
    const host = root.querySelector('#teraMenuContent');
    if (!host) return;

    const categories = getMenuCategories();

    if (menuStep === 'category') {
        host.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${categories.map((category) => `
                    <button data-ts-category-id="${escapeHtml(category.id)}" class="text-left rounded-lg border border-gray-200 p-3 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition">
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

    if (selectedCategory.type === 'chars') {
        host.innerHTML = `
            <div class="flex items-center justify-between gap-2 mb-2">
                <button id="teraCategoryBackBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-300 text-xs font-semibold">◀ Kategorien</button>
                <p class="text-xs font-black text-gray-700">${escapeHtml(selectedCategory.title)}</p>
            </div>
            <p class="text-xs text-gray-500 mb-2">Wort eingeben und Sequenz starten. Doppelte Zeichen werden auffällig markiert.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 mb-2">
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
            <div id="teraCharGrid" class="grid grid-cols-8 sm:grid-cols-12 gap-1"></div>
            <p id="teraCharHint" class="text-[11px] text-gray-500 mt-2"></p>
        `;
        renderCharGrid(root);
        return;
    }

    host.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-2">
            <button id="teraCategoryBackBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-300 text-xs font-semibold">◀ Kategorien</button>
            <p class="text-xs font-black text-gray-700 text-right">${escapeHtml(selectedCategory.title)}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
    const image = root.querySelector('#teraViewerImage');
    const prevBtn = root.querySelector('#teraPrevBtn');
    const nextBtn = root.querySelector('#teraNextBtn');
    const autoBtn = root.querySelector('#teraToggleAutoBtn');

    if (!empty || !active || !title || !subline || !counter || !repeatHint || !image || !prevBtn || !nextBtn || !autoBtn) return;

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
    prevBtn.classList.toggle('opacity-50', !multiple);
    nextBtn.classList.toggle('opacity-50', !multiple);

    autoBtn.textContent = autoTimer ? 'Auto stoppen' : 'Auto starten';
}

function showSequence(sequence, title, mode, intervalSeconds) {
    stopAutoTimer();
    activeSequence = sequence;
    activeIndex = 0;
    activeTitle = title || '';
    activeMode = mode;
    autoIntervalSeconds = intervalSeconds;

    const root = getRoot();
    if (!root) return;

    renderViewer(root);

    if (mode === 'auto' && sequence.length > 1) {
        autoTimer = setInterval(() => {
            activeIndex = (activeIndex + 1) % activeSequence.length;
            const activeRoot = getRoot();
            if (!activeRoot) return;
            renderViewer(activeRoot);
        }, autoIntervalSeconds * 1000);
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

    if (event.target.closest('#teraCategoryBackBtn')) {
        menuStep = 'category';
        selectedCategoryId = '';
        renderMenu(root);
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
        activeIndex = (activeIndex - 1 + activeSequence.length) % activeSequence.length;
        renderViewer(root);
        return;
    }

    const nextBtn = event.target.closest('#teraNextBtn');
    if (nextBtn && activeSequence.length > 1) {
        activeIndex = (activeIndex + 1) % activeSequence.length;
        renderViewer(root);
        return;
    }

    const toggleAutoBtn = event.target.closest('#teraToggleAutoBtn');
    if (toggleAutoBtn) {
        if (autoTimer) {
            stopAutoTimer();
            activeMode = 'manual';
            renderViewer(root);
            return;
        }

        if (activeSequence.length > 1) {
            activeMode = 'auto';
            autoTimer = setInterval(() => {
                activeIndex = (activeIndex + 1) % activeSequence.length;
                const activeRoot = getRoot();
                if (!activeRoot) return;
                renderViewer(activeRoot);
            }, autoIntervalSeconds * 1000);
            renderViewer(root);
        }
        return;
    }

    if (event.target.closest('#teraBackToOverviewBtn')) {
        stopAutoTimer();
        activeSequence = [];
        activeIndex = 0;
        activeTitle = '';
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
}
