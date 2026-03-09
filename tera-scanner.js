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

const QUICK_ACTIONS = [
    { label: 'Werkseinstellungen', manualPage: 1, order: 1 },
    { label: 'Batteriestand', manualPage: 1, order: 2 },
    { label: '2.4G Modus', manualPage: 2, order: 5 },
    { label: 'Bluetooth HID Modus', manualPage: 2, order: 6 },
    { label: 'Bluetooth SPP Modus', manualPage: 2, order: 7 },
    { label: 'Bluetooth BLE Modus', manualPage: 2, order: 8 },
    { label: 'Pairing mit Dongle', manualPage: 3, order: 2 },
    { label: 'Pairing mit Bluetooth', manualPage: 3, order: 4 },
    { label: 'Tastatursprache: Deutsch', manualPage: 7, order: 9 },
    { label: 'Terminator: CR', manualPage: 7, order: 1 },
    { label: 'Terminator: LF', manualPage: 7, order: 2 },
    { label: 'Terminator: CR+LF', manualPage: 7, order: 3 },
    { label: 'Scanmodus: Tastendruck', manualPage: 5, order: 3 },
    { label: 'Scanmodus: Kontinuierlich', manualPage: 5, order: 4 },
    { label: 'Lautstärke: Hoch', manualPage: 6, order: 1 },
    { label: 'Vibration: EIN', manualPage: 6, order: 5 },
    { label: 'Sleep: 5 Minuten', manualPage: 6, order: 7 },
    { label: 'Alle Barcodes EIN', manualPage: 8, order: 9 },
    { label: 'Alle Barcodes AUS', manualPage: 8, order: 10 },
    { label: 'QR-Code EIN', manualPage: 13, order: 1 },
    { label: 'QR-Code AUS', manualPage: 13, order: 2 },
    { label: 'Add Prefix', manualPage: 14, order: 1 },
    { label: 'Add Suffix', manualPage: 15, order: 1 }
];

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

function getCodeLabel(code) {
    const char = codeIdToChar.get(code.id);
    if (char) {
        if (char === ' ') return 'Zeichen: Leerzeichen';
        return `Zeichen: ${char}`;
    }
    return `Code ${String(code.index).padStart(3, '0')}`;
}

function renderBaseLayout(root) {
    root.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section class="xl:col-span-2 card bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div class="flex items-center justify-between gap-2 mb-3">
                    <h3 class="text-lg font-black text-gray-800">Schnellzugriff</h3>
                    <span class="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-full">Direkt-Scanner</span>
                </div>
                <div id="teraQuickGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"></div>
            </section>

            <section class="card bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 class="text-lg font-black text-gray-800 mb-2">Code-Viewer</h3>
                <div id="teraViewerEmpty" class="text-sm text-gray-500 rounded-lg bg-gray-50 p-3 border border-gray-200">Wähle links eine Funktion oder starte unten eine Zeichen-Sequenz.</div>
                <div id="teraViewerActive" class="hidden space-y-3">
                    <div>
                        <p id="teraViewerTitle" class="font-bold text-gray-800 text-sm"></p>
                        <p id="teraViewerCounter" class="text-xs text-gray-500"></p>
                    </div>
                    <div class="rounded-xl border border-gray-200 p-3 bg-white">
                        <img id="teraViewerImage" src="" alt="Scanner-Code" class="w-full max-h-[420px] object-contain mx-auto" />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button id="teraPrevBtn" class="py-2 px-3 rounded-lg bg-gray-100 border border-gray-200 text-sm font-semibold">← Vorheriger</button>
                        <button id="teraNextBtn" class="py-2 px-3 rounded-lg bg-gray-100 border border-gray-200 text-sm font-semibold">Nächster →</button>
                        <button id="teraToggleAutoBtn" class="py-2 px-3 rounded-lg bg-orange-100 border border-orange-200 text-sm font-semibold text-orange-700">Auto starten</button>
                        <button id="teraBackToOverviewBtn" class="py-2 px-3 rounded-lg bg-slate-700 text-white text-sm font-semibold">Zur Übersicht</button>
                    </div>
                </div>
            </section>
        </div>

        <section class="card bg-white rounded-xl border border-gray-200 p-4 shadow-sm mt-4">
            <h3 class="text-lg font-black text-gray-800 mb-2">Zeichen & Wort-Sequenz</h3>
            <p class="text-sm text-gray-500 mb-3">Gib ein Wort ein oder tippe einzelne Zeichen an. Anzeige-Modus: manuell oder automatisch (1-5 Sekunden).</p>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                <input id="teraWordInput" type="text" placeholder="z. B. ABC123" class="md:col-span-2 p-2 border border-gray-300 rounded-lg" />
                <select id="teraModeSelect" class="p-2 border border-gray-300 rounded-lg">
                    <option value="manual">Manuell (Pfeile)</option>
                    <option value="auto">Automatisch</option>
                </select>
                <select id="teraIntervalSelect" class="p-2 border border-gray-300 rounded-lg">
                    <option value="1">1 Sekunde</option>
                    <option value="2" selected>2 Sekunden</option>
                    <option value="3">3 Sekunden</option>
                    <option value="4">4 Sekunden</option>
                    <option value="5">5 Sekunden</option>
                </select>
            </div>
            <div class="flex flex-wrap gap-2 mb-3">
                <button id="teraStartWordBtn" class="py-2 px-3 rounded-lg bg-orange-500 text-white text-sm font-semibold">Wort als Sequenz anzeigen</button>
                <button id="teraShowSingleCharBtn" class="py-2 px-3 rounded-lg bg-gray-100 border border-gray-300 text-sm font-semibold">Erstes Zeichen einzeln anzeigen</button>
            </div>
            <div id="teraCharGrid" class="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-14 gap-1"></div>
            <p id="teraCharHint" class="text-xs text-gray-500 mt-2"></p>
        </section>

        <section class="card bg-white rounded-xl border border-gray-200 p-4 shadow-sm mt-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 class="text-lg font-black text-gray-800">Alle Funktionen</h3>
                <input id="teraSearchInput" type="text" placeholder="Suche nach Kapitel/Code/Zeichen" class="w-full sm:w-72 p-2 border border-gray-300 rounded-lg" />
            </div>
            <div id="teraChapterList" class="space-y-2"></div>
        </section>
    `;
}

function renderQuickActions(root) {
    const grid = root.querySelector('#teraQuickGrid');
    if (!grid) return;

    const btns = QUICK_ACTIONS.map((action) => {
        const code = getCodeByManualOrder(action.manualPage, action.order);
        if (!code) return '';
        return `
            <button data-ts-code-id="${escapeHtml(code.id)}" class="text-left p-2 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition">
                <p class="text-sm font-bold text-gray-800">${escapeHtml(action.label)}</p>
                <p class="text-xs text-gray-500">Kapitel ${String(action.manualPage).padStart(2, '0')} · ${getCodeType(code)}</p>
            </button>
        `;
    }).filter(Boolean);

    grid.innerHTML = btns.join('');
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

function renderChapterList(root) {
    const searchInput = root.querySelector('#teraSearchInput');
    const container = root.querySelector('#teraChapterList');
    if (!container) return;

    const search = (searchInput?.value || '').trim().toLowerCase();
    const pages = Array.from(new Set(cachedCodes.map((c) => c.manualPage))).sort((a, b) => a - b);

    container.innerHTML = pages.map((manualPage) => {
        const title = PAGE_TITLES_DE[manualPage] || `Kapitel ${manualPage}`;
        const codes = getManualPageCodes(manualPage).filter((code) => {
            const label = getCodeLabel(code).toLowerCase();
            const chapter = title.toLowerCase();
            return !search || label.includes(search) || chapter.includes(search) || String(manualPage).includes(search);
        });

        if (!codes.length) return '';

        return `
            <details class="rounded-lg border border-gray-200" open>
                <summary class="cursor-pointer select-none px-3 py-2 bg-gray-50 font-semibold text-gray-800">Kapitel ${String(manualPage).padStart(2, '0')} · ${escapeHtml(title)} (${codes.length})</summary>
                <div class="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    ${codes.map((code) => `
                        <button data-ts-code-id="${escapeHtml(code.id)}" class="text-left p-2 rounded border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition">
                            <p class="text-sm font-bold text-gray-800">${escapeHtml(getCodeLabel(code))}</p>
                            <p class="text-xs text-gray-500">${getCodeType(code)} · Quelle ${String(code.sourcePage).padStart(2, '0')} · #${String(code.index).padStart(3, '0')}</p>
                        </button>
                    `).join('')}
                </div>
            </details>
        `;
    }).join('');
}

function renderViewer(root) {
    const empty = root.querySelector('#teraViewerEmpty');
    const active = root.querySelector('#teraViewerActive');
    const title = root.querySelector('#teraViewerTitle');
    const counter = root.querySelector('#teraViewerCounter');
    const image = root.querySelector('#teraViewerImage');
    const prevBtn = root.querySelector('#teraPrevBtn');
    const nextBtn = root.querySelector('#teraNextBtn');
    const autoBtn = root.querySelector('#teraToggleAutoBtn');

    if (!empty || !active || !title || !counter || !image || !prevBtn || !nextBtn || !autoBtn) return;

    if (!activeSequence.length) {
        empty.classList.remove('hidden');
        active.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    active.classList.remove('hidden');

    const code = activeSequence[activeIndex];
    image.src = code.file;
    image.alt = `Scanner-Code ${code.id}`;

    title.textContent = activeTitle || getCodeLabel(code);
    counter.textContent = `Code ${activeIndex + 1}/${activeSequence.length} · Kapitel ${String(code.manualPage).padStart(2, '0')} · ${getCodeType(code)} · Modus: ${activeMode === 'auto' ? 'Automatisch' : 'Manuell'}`;

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
    activeTitle = title;
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
    showSequence([code], title || getCodeLabel(code), 'manual', 2);
}

function handleRootClick(event) {
    const root = getRoot();
    if (!root) return;

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
        const sequence = chars
            .map((ch) => {
                const code = charToCode.get(ch);
                if (!code) missing.push(ch);
                return code;
            })
            .filter(Boolean);

        if (hint) {
            if (missing.length) {
                hint.textContent = `Achtung: ${missing.length} Zeichen ohne Mapping wurden übersprungen (${missing.join(' ')}).`;
            } else {
                hint.textContent = `Verfügbare Zeichen-Codes: ${charToCode.size}. Nicht verfügbare Zeichen werden bei der Wort-Sequenz übersprungen.`;
            }
        }

        if (!sequence.length) {
            return;
        }

        const clickedSingle = event.target.closest('#teraShowSingleCharBtn');
        const mode = clickedSingle ? 'manual' : modeSelect.value;
        const interval = Math.min(5, Math.max(1, Number(intervalSelect.value) || 2));

        if (clickedSingle) {
            showSingleCode(sequence[0], `Zeichen: ${chars[0]}`);
            return;
        }

        showSequence(sequence, `Wort-Sequenz: ${raw}`, mode, interval);
    }
}

function handleRootInput(event) {
    if (event.target.id === 'teraSearchInput') {
        const root = getRoot();
        if (root) renderChapterList(root);
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
        renderQuickActions(root);
        renderCharGrid(root);
        renderChapterList(root);
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
