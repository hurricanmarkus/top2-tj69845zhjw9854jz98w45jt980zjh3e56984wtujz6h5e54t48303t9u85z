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

const CODES_TABLE_FILE = 'assets/tera-scanner/codes/codes_tabelle.csv';

const PAGE_TITLES_DE = {
    1: 'Werkseinstellungen & Arbeitsmodus',
    2: 'Arbeitsmodus & Kommunikation',
    3: '2.4G/Bluetooth Pairing',
    4: 'Pairing-Optionen & Übertragung',
    5: 'Bluetooth-Name & Scanmodus',
    6: 'Feedback, Sleep & iOS',
    7: 'Terminator & Tastatur-Sprache',
    8: 'Sprachlayout & Grundverhalten',
    9: 'Inverted/UPC/EAN-8',
    10: 'EAN-13 / ISBN / ISSN / Code 128',
    11: 'GS1-128 / Code39 / Code32 / Code93',
    12: 'Code11 / Codabar / DataBar',
    13: 'QR/DataMatrix/PDF417',
    14: 'Prefix / Hide / ASCII Form',
    15: 'Suffix / Hide Prefix/Suffix',
    16: 'ASCII Transfer Meaning 0-3',
    17: 'ASCII Form 1-7',
    18: 'ASCII Form 8-13',
    19: 'ASCII Form 14-20',
    20: 'ASCII Form 21-27',
    21: 'ASCII Form 28-31 + Sonderzeichen',
    22: 'Zeichen A-B + Zahlen/Symbole',
    23: 'Zeichen C-Z + [\\]',
    24: 'Zeichen ^ bis u',
    25: 'Zeichen v bis ç',
    26: 'Weitere Scannerfunktionen'
};

const QUICK_GROUPS = [
    {
        title: 'Systemstart',
        subtitle: 'Grundfunktionen für den Start',
        actions: [
            { manualPage: 1, order: 1 },
            { manualPage: 1, order: 2 },
            { manualPage: 2, order: 1 },
            { manualPage: 2, order: 4 },
            { manualPage: 2, order: 5 },
            { manualPage: 2, order: 8 }
        ]
    },
    {
        title: 'Verbindung & Pairing',
        subtitle: '2.4G, Bluetooth und Pairing',
        actions: [
            { manualPage: 3, order: 1 },
            { manualPage: 3, order: 2 },
            { manualPage: 3, order: 3 },
            { manualPage: 3, order: 4 },
            { manualPage: 4, order: 1 },
            { manualPage: 4, order: 2 }
        ]
    },
    {
        title: 'Feedback (Ton/Vibration)',
        subtitle: 'Signal- und Ruheverhalten',
        actions: [
            { manualPage: 6, order: 1 },
            { manualPage: 6, order: 2 },
            { manualPage: 6, order: 3 },
            { manualPage: 6, order: 4 },
            { manualPage: 6, order: 5 },
            { manualPage: 6, order: 6 },
            { manualPage: 6, order: 7 },
            { manualPage: 6, order: 10 }
        ]
    },
    {
        title: 'Tastatur & Sprache',
        subtitle: 'Terminator, Layout und Schriftbild',
        actions: [
            { manualPage: 7, order: 1 },
            { manualPage: 7, order: 2 },
            { manualPage: 7, order: 3 },
            { manualPage: 7, order: 8 },
            { manualPage: 7, order: 9 },
            { manualPage: 8, order: 5 },
            { manualPage: 8, order: 6 },
            { manualPage: 8, order: 7 }
        ]
    },
    {
        title: 'Symbologie',
        subtitle: 'Häufige Code-Typen ein/aus',
        actions: [
            { manualPage: 8, order: 9 },
            { manualPage: 8, order: 10 },
            { manualPage: 8, order: 11 },
            { manualPage: 8, order: 12 },
            { manualPage: 13, order: 1 },
            { manualPage: 13, order: 2 },
            { manualPage: 13, order: 5 },
            { manualPage: 13, order: 6 }
        ]
    }
];

const PRIMARY_PAGE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 13];
const ADVANCED_PAGE_ORDER = [10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21];

const FAVORITES_STORAGE_KEY = 'tera_scanner_favorites_v1';

let cachedCodes = [];
let codesById = new Map();
let charToCode = new Map();
let codeIdToChar = new Map();
let codeMetaById = new Map();
let skippedTableRows = [];
let missingImageRows = [];

let activeSequence = [];
let activeIndex = 0;
let activeTitle = '';
let activeMode = 'manual';
let isViewerZoomed = false;
let autoIntervalSeconds = 2;
let autoTimer = null;
let countdownTimer = null;
let countdownSeconds = null;
let autoReplayReady = false;
let menuStep = 'category';
let selectedCategoryId = '';
let favorites = [];
let activeCharKeyboardMode = 'upper';

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

function parseSemicolonCsvLine(line) {
    const result = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ';' && !inQuotes) {
            result.push(cell);
            cell = '';
            continue;
        }

        cell += ch;
    }

    result.push(cell);
    return result;
}

function parseCodeTableCsv(csvText) {
    const lines = String(csvText || '')
        .replace(/^\uFEFF/, '')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length <= 1) return [];

    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = parseSemicolonCsvLine(lines[i]);
        if (cols.length < 3) continue;
        rows.push({
            fileName: cols[0].trim(),
            title: cols[1].trim(),
            info: cols[2].trim()
        });
    }

    return rows;
}

function parseCodeFileName(fileName) {
    const match = /^p(\d{2})_c(\d{3})\.png$/i.exec(fileName || '');
    if (!match) return null;

    return {
        sourcePage: Number(match[1]),
        index: Number(match[2])
    };
}

function inferCodeDimensions(title) {
    const upper = String(title || '').toUpperCase();
    const barcodeLike = /EAN|UPC|CODE\s?128|CODE11|CODE39|CODE32|CODE93|CODABAR|GS1|DATABAR|PDF417|MICROPDF417/.test(upper);
    return barcodeLike ? { w: 260, h: 92 } : { w: 140, h: 140 };
}

async function doesCodeImageExist(fileName) {
    const url = `assets/tera-scanner/codes/${fileName}`;

    try {
        const headResponse = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        if (headResponse.ok) return true;
    } catch {
        // Manche Dev-Server unterstützen HEAD nicht.
    }

    try {
        const getResponse = await fetch(url, { cache: 'no-store' });
        return getResponse.ok;
    } catch {
        return false;
    }
}

async function filterRowsWithExistingImages(rows) {
    const checks = await Promise.all(rows.map(async (row) => {
        const exists = await doesCodeImageExist(row.fileName);
        return { row, exists };
    }));

    missingImageRows = checks
        .filter((entry) => !entry.exists)
        .map((entry) => entry.row.fileName);

    return checks
        .filter((entry) => entry.exists)
        .map((entry) => entry.row);
}

async function loadUnassignedRowsFromLegacyManifest(knownFileNames) {
    try {
        const response = await fetch('assets/tera-scanner/codes/manifest.json', { cache: 'no-store' });
        if (!response.ok) return [];

        const raw = await response.json();
        if (!Array.isArray(raw)) return [];

        const allowedSourcePages = new Set(Object.keys(SOURCE_TO_MANUAL_PAGE).map((k) => Number(k)));
        return raw
            .map((item) => {
                const sourcePage = Number(item.page);
                if (!allowedSourcePages.has(sourcePage)) return null;

                const id = String(item.id || '').trim();
                if (!id) return null;

                const fileName = `${id}.png`;
                if (knownFileNames.has(fileName)) return null;

                return {
                    fileName,
                    title: `Unzugeordnet · ${id}`,
                    info: 'Kein Eintrag in der Tabelle vorhanden. Bitte Titel/Infotext ergänzen.'
                };
            })
            .filter(Boolean);
    } catch {
        return [];
    }
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

function getCharacterFromTitle(title) {
    const match = /^Zeichen\s+(.+)$/i.exec(String(title || '').trim());
    if (!match) return '';
    const token = match[1].trim();
    return token === 'Leerzeichen' ? ' ' : token;
}

function buildCharacterMap() {
    charToCode = new Map();
    codeIdToChar = new Map();
    cachedCodes.forEach((code) => {
        const title = codeMetaById.get(code.id)?.title || '';
        const char = getCharacterFromTitle(title);
        if (!char) return;
        charToCode.set(char, code);
        codeIdToChar.set(code.id, char);
    });
}

function getManualPosition(code) {
    const list = getManualPageCodes(code.manualPage);
    return list.findIndex((c) => c.id === code.id) + 1;
}

function getCodeFunctionalName(code) {
    const tableTitle = codeMetaById.get(code.id)?.title;
    if (tableTitle) return tableTitle;

    const char = codeIdToChar.get(code.id);
    if (char) return char === ' ' ? 'Zeichen Leerzeichen' : `Zeichen ${char}`;

    const pos = getManualPosition(code);
    const chapterTitle = PAGE_TITLES_DE[code.manualPage] || `Kapitel ${String(code.manualPage).padStart(2, '0')}`;
    return `${chapterTitle} · Eintrag ${String(pos > 0 ? pos : code.index).padStart(2, '0')}`;
}

function getCodeInfoText(code) {
    return codeMetaById.get(code.id)?.info || '';
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
                return { code, label: action.label || getCodeFunctionalName(code) };
            })
            .filter(Boolean);

        if (items.length) {
            categories.push({
                id: `quick-${index}`,
                title: group.title,
                subtitle: group.subtitle || 'Gebündelte Funktionen',
                type: 'codes',
                items
            });
        }
    });

    const pagesWithCodes = new Set(cachedCodes.map((c) => c.manualPage));
    const pushChapterCategory = (manualPage) => {
        if (!pagesWithCodes.has(manualPage)) return;

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
    };

    PRIMARY_PAGE_ORDER.forEach(pushChapterCategory);

    categories.push({
        id: 'chars',
        title: 'Zeichen & Wort-Sequenz',
        subtitle: 'Einzelzeichen und Wörter scannen',
        type: 'chars',
        items: []
    });

    ADVANCED_PAGE_ORDER.forEach(pushChapterCategory);

    Array.from(pagesWithCodes)
        .sort((a, b) => a - b)
        .filter((manualPage) => !PRIMARY_PAGE_ORDER.includes(manualPage) && !ADVANCED_PAGE_ORDER.includes(manualPage) && ![22, 23, 24, 25].includes(manualPage))
        .forEach(pushChapterCategory);

    return categories;
}

function renderBaseLayout(root) {
    root.innerHTML = `
        <section class="h-auto sm:h-[calc(100dvh-235px)] min-h-0 sm:min-h-[540px] sm:max-h-[760px] flex flex-col gap-2 overflow-visible sm:overflow-hidden">
            <div class="card bg-white rounded-xl border border-gray-200 p-2.5 shadow-sm basis-auto sm:basis-[47%] min-h-[250px]">
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="text-sm font-black text-gray-800">Aktiver Code</h3>
                </div>
                <div id="teraViewerEmpty" class="text-xs text-gray-500 rounded-lg bg-gray-50 p-2 border border-gray-200">Unten zuerst Kategorie wählen, dann Funktion antippen.</div>
                <div id="teraViewerActive" class="hidden min-w-0 h-full flex flex-col gap-1.5">
                    <div class="min-w-0 shrink-0 pb-1">
                        <p id="teraViewerTitle" class="font-bold text-gray-800 text-xs break-words"></p>
                        <p id="teraViewerSubline" class="text-[11px] text-gray-600 break-words"></p>
                        <p id="teraViewerCounter" class="text-[11px] text-gray-500"></p>
                        <div class="grid grid-cols-2 sm:grid-cols-5 gap-1 mt-1 mb-1">
                            <button id="teraPrevBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold">◀ Vor</button>
                            <button id="teraNextBtn" class="py-1.5 px-2 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold">Weiter ▶</button>
                            <button id="teraBackToOverviewBtn" class="py-1.5 px-2 rounded-md bg-slate-700 text-white text-xs font-semibold">Zurück</button>
                            <button id="teraToggleAutoBtn" class="py-1.5 px-2 rounded-md bg-orange-100 border border-orange-200 text-xs font-semibold text-orange-700">Auto</button>
                            <button id="teraSaveFavoriteBtn" class="py-1.5 px-2 rounded-md bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-800">★ Favorit</button>
                        </div>
                        <p id="teraViewerRepeatHint" class="text-[11px] font-semibold min-h-[30px] leading-tight pt-0.5"></p>
                    </div>
                    <div id="teraViewerMediaWrap" class="rounded-xl border border-gray-200 p-2 bg-white overflow-hidden flex-1 min-h-[130px] sm:min-h-[120px] flex items-center justify-center transition-all duration-150 cursor-zoom-in">
                        <div id="teraViewerCountdown" class="hidden h-full w-full flex items-center justify-center text-3xl font-black text-orange-600"></div>
                        <img id="teraViewerImage" src="" alt="Scanner-Code" class="max-h-full max-w-full w-auto h-auto object-contain mx-auto" />
                    </div>
                </div>
            </div>

            <div class="card bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm basis-auto sm:basis-[53%] min-h-[210px] sm:min-h-[220px] mt-1 overflow-hidden flex flex-col">
                <div class="flex items-center gap-2 mb-1">
                    <h3 class="text-sm font-black text-gray-800">Menüleiste</h3>
                    <button id="teraMenuHeaderBackBtn" class="hidden justify-self-center py-0.5 px-2 rounded-md bg-gray-100 border border-gray-300 text-[11px] font-semibold">&lt; Kategorien</button>
                </div>
                <div id="teraMenuContent" class="flex-1 min-h-0 overflow-x-scroll overflow-y-hidden pb-0.5" style="scrollbar-gutter: stable both-edges;"></div>
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
            <div class="w-max pr-2" style="min-width: calc(100% + 18px);">
                <div class="grid grid-flow-col auto-cols-[138px] grid-rows-4 gap-1 w-max min-w-full">
                    ${categories.map((category) => `
                        <button data-ts-category-id="${escapeHtml(category.id)}" class="text-left rounded-lg border border-gray-200 p-1 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition min-h-[32px]">
                            <p class="text-[10px] font-black text-gray-800 uppercase tracking-wide leading-tight">${escapeHtml(category.title)}</p>
                            <p class="text-[9px] text-gray-600 mt-0.5 leading-tight">${escapeHtml(category.subtitle)}</p>
                        </button>
                    `).join('')}
                </div>
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
                <div class="w-max pr-2" style="min-width: calc(100% + 18px);">
                    <div class="grid grid-flow-col auto-cols-[164px] grid-rows-4 gap-1 w-max min-w-full">
                        ${selectedCategory.items.map((fav) => `
                            <div class="rounded-md border border-amber-200 bg-amber-50 p-0.5 min-w-0">
                                <button data-ts-favorite-id="${escapeHtml(fav.id)}" class="w-full text-left">
                                    <p class="text-[11px] font-bold text-amber-900 break-words">★ ${escapeHtml(fav.title || 'Favorit')}</p>
                                    <p class="text-[10px] text-amber-700">${fav.codeIds.length > 1 ? `Sequenz (${fav.codeIds.length} Codes)` : 'Einzelcode'}</p>
                                </button>
                                <button data-ts-delete-favorite-id="${escapeHtml(fav.id)}" class="mt-0.5 w-full py-0.5 rounded border border-red-300 text-[10px] font-semibold text-red-700 bg-red-50 hover:bg-red-100">Löschen</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
            : '<div class="w-max pr-2" style="min-width: calc(100% + 18px);"><div class="text-xs text-gray-500 rounded-lg bg-gray-50 p-2 border border-gray-200">Noch keine Favoriten gespeichert. Öffne oben einen Code/Sequenz und tippe auf ★ Favorit.</div></div>';
        return;
    }

    if (selectedCategory.type === 'chars') {
        host.innerHTML = `
            <div class="w-full">
                <p class="text-[11px] font-black text-gray-700 mb-1">${escapeHtml(selectedCategory.title)}</p>
                <p class="text-[10px] text-gray-500 mb-1">Wort eingeben und Sequenz starten.</p>
                <div class="grid grid-cols-[minmax(0,1fr)_92px_92px] gap-1 mb-1">
                    <input id="teraWordInput" type="text" placeholder="z. B. HALLO123" class="p-1.5 border border-gray-300 rounded-lg text-xs" />
                    <select id="teraModeSelect" class="p-1.5 border border-gray-300 rounded-lg text-xs">
                        <option value="manual">Manuell</option>
                        <option value="auto">Automatisch</option>
                    </select>
                    <select id="teraIntervalSelect" class="p-1.5 border border-gray-300 rounded-lg text-xs">
                        <option value="1">1 Sekunde</option>
                        <option value="2" selected>2 Sekunden</option>
                        <option value="3">3 Sekunden</option>
                        <option value="4">4 Sekunden</option>
                        <option value="5">5 Sekunden</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-1 mb-1">
                    <button id="teraStartWordBtn" class="py-1 px-1.5 rounded-md bg-orange-500 text-white text-[11px] font-semibold">Sequenz starten</button>
                    <button id="teraShowSingleCharBtn" class="py-1 px-1.5 rounded-md bg-gray-100 border border-gray-300 text-[11px] font-semibold">Erstes Zeichen</button>
                </div>
                <div class="flex items-start gap-1 min-w-0">
                    <div class="flex flex-col gap-1 shrink-0 w-[84px]">
                        <button data-ts-char-mode="upper" class="w-full py-1 px-1.5 rounded-lg border text-[10px] font-bold text-left transition">Groß</button>
                        <button data-ts-char-mode="lower" class="w-full py-1 px-1.5 rounded-lg border text-[10px] font-bold text-left transition">Klein</button>
                        <button data-ts-char-mode="symbols" class="w-full py-1 px-1.5 rounded-lg border text-[10px] font-bold text-left transition">Zeichen</button>
                    </div>
                    <div id="teraCharGrid" class="space-y-1 flex-1 min-w-0"></div>
                </div>
                <p id="teraCharHint" class="text-[10px] text-gray-500 mt-0.5"></p>
            </div>
        `;
        renderCharGrid(root);
        return;
    }

    host.innerHTML = `
        <div class="w-max pr-2" style="min-width: calc(100% + 18px);">
            <p class="text-xs font-black text-gray-700 text-right mb-2">${escapeHtml(selectedCategory.title)}</p>
            <div class="grid grid-flow-col auto-cols-[166px] grid-rows-4 gap-1 w-max min-w-full">
                ${selectedCategory.items.map((item) => `
                    <button data-ts-code-id="${escapeHtml(item.code.id)}" class="text-left p-1 rounded-md border border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50 transition min-w-0 min-h-[34px]">
                        <p class="text-[10px] font-bold text-gray-800 break-words leading-tight">${escapeHtml(item.label)}</p>
                        <p class="text-[9px] text-gray-500 leading-tight">${escapeHtml(getCodeInfoText(item.code) || `${getCodeType(item.code)} · Quelle ${String(item.code.sourcePage).padStart(2, '0')}`)}</p>
                    </button>
                `).join('')}
            </div>
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
            const label = action.label || getCodeFunctionalName(code);
            return `
                <button data-ts-code-id="${escapeHtml(code.id)}" class="text-left px-2 py-1 rounded-md border border-gray-200 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 transition min-w-0">
                    <p class="text-xs font-semibold text-gray-800 break-words">${escapeHtml(label)}</p>
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

    const validModes = new Set(['upper', 'lower', 'symbols']);
    if (!validModes.has(activeCharKeyboardMode)) {
        activeCharKeyboardMode = 'upper';
    }

    const chars = Array.from(charToCode.keys()).sort((a, b) => a.localeCompare(b));
    const modeLabels = {
        upper: 'Großbuchstaben',
        lower: 'Kleinbuchstaben',
        symbols: 'Zeichen'
    };

    const modeFilter = {
        upper: (ch) => /^[A-Z]$/.test(ch),
        lower: (ch) => /^[a-z]$/.test(ch),
        symbols: (ch) => !/^[A-Za-z]$/.test(ch)
    };

    const scopedChars = chars.filter(modeFilter[activeCharKeyboardMode]);
    const preferredRowsByMode = {
        upper: [
            ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Y', 'X', 'C', 'V', 'B', 'N', 'M']
        ],
        lower: [
            ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['y', 'x', 'c', 'v', 'b', 'n', 'm']
        ],
        symbols: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['!', '"', '#', '$', '%', '&', '/', '(', ')', '='],
            ['-', '_', '+', '*', ',', '.', ';', ':', '<', '>'],
            ['?', '@', '[', '\\', ']', '^', '`', '{', '|'],
            ['}', '~', 'DEL', 'Ç', 'ç', ' ']
        ]
    };

    const preferredRows = preferredRowsByMode[activeCharKeyboardMode] || [];

    const used = new Set();
    const rows = preferredRows
        .map((row) => row.filter((ch) => {
            if (!scopedChars.includes(ch) || used.has(ch)) return false;
            used.add(ch);
            return true;
        }))
        .filter((row) => row.length > 0);

    const leftovers = scopedChars.filter((ch) => !used.has(ch));
    if (leftovers.length) {
        if (!rows.length) rows.push([]);
        rows[rows.length - 1] = rows[rows.length - 1].concat(leftovers);
    }

    const rowIndentClassesByMode = {
        upper: ['', 'pl-3', 'pl-6'],
        lower: ['', 'pl-3', 'pl-6'],
        symbols: ['', 'pl-1', 'pl-2', 'pl-1', 'pl-4']
    };
    const rowIndentClasses = rowIndentClassesByMode[activeCharKeyboardMode] || [];

    grid.innerHTML = rows.map((row, rowIndex) => `
        <div class="flex items-center gap-0.5 ${rowIndentClasses[rowIndex] || ''}">
            ${row.map((ch) => {
                const label = ch === ' ' ? 'Leertaste' : ch;
                const sizeClass = ch === ' ' ? 'min-w-[46px]' : (ch.length > 1 ? 'min-w-[22px]' : 'min-w-[18px]');
                return `<button data-ts-char="${escapeHtml(ch)}" class="h-6 ${sizeClass} px-1 rounded border border-gray-300 bg-gray-50 text-[10px] font-semibold hover:bg-orange-50 hover:border-orange-300">${escapeHtml(label)}</button>`;
            }).join('')}
        </div>
    `).join('');

    const charModeButtons = root.querySelectorAll('[data-ts-char-mode]');
    const activeBtnClass = 'w-full py-1.5 px-2 rounded-lg border text-[11px] font-bold text-left transition bg-orange-500 border-orange-600 text-white shadow-sm';
    const inactiveBtnClass = 'w-full py-1.5 px-2 rounded-lg border text-[11px] font-bold text-left transition bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
    charModeButtons.forEach((btn) => {
        const mode = btn.dataset.tsCharMode || '';
        const active = mode === activeCharKeyboardMode;
        btn.className = active ? activeBtnClass : inactiveBtnClass;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    hint.textContent = `Verfügbare Zeichen-Codes: ${chars.length}. Aktive Tastatur: ${modeLabels[activeCharKeyboardMode]}. Nicht verfügbare Zeichen werden bei der Wort-Sequenz übersprungen.`;
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
    const mediaWrap = root.querySelector('#teraViewerMediaWrap');
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

    if (!empty || !active || !mediaWrap || !title || !subline || !counter || !repeatHint || !countdown || !image || !prevBtn || !nextBtn || !autoBtn || !saveFavoriteBtn) return;

    mediaWrap.className = isViewerZoomed
        ? 'fixed inset-2 z-[80] rounded-xl border-2 border-orange-300 p-3 bg-white shadow-2xl flex items-center justify-center transition-all duration-150 cursor-zoom-out'
        : 'rounded-xl border border-gray-200 p-2 bg-white overflow-hidden flex-1 min-h-[130px] sm:min-h-[120px] flex items-center justify-center transition-all duration-150 cursor-zoom-in';
    image.className = isViewerZoomed
        ? 'max-h-[calc(100dvh-40px)] max-w-[calc(100vw-24px)] w-auto h-auto object-contain mx-auto'
        : 'max-h-full max-w-full w-auto h-auto object-contain mx-auto';
    countdown.className = isViewerZoomed
        ? 'hidden h-full w-full flex items-center justify-center text-5xl font-black text-orange-600'
        : 'hidden h-full w-full flex items-center justify-center text-3xl font-black text-orange-600';

    if (!activeSequence.length) {
        isViewerZoomed = false;
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
    const codeInfoText = getCodeInfoText(code);
    subline.textContent = activeTitle
        ? `${activeTitle}${codeInfoText ? ` · ${codeInfoText}` : ''}`
        : (codeInfoText || getCodeCategoryLabel(code));
    counter.textContent = `Schritt ${activeIndex + 1}/${activeSequence.length} · ${getCodeType(code)} · Modus: ${activeMode === 'auto' ? 'Automatisch' : 'Manuell'}`;
    if (entry.char) {
        const printableChar = entry.char === ' ' ? 'Leerzeichen' : entry.char;
        if (entry.repeatScan) {
            repeatHint.className = 'min-h-[30px] text-[12px] font-black text-red-900 bg-red-100 border-2 border-red-400 rounded-md px-2 py-1 leading-tight animate-pulse';
            repeatHint.textContent = `⚠ NOCHMALS SCANNEN: '${printableChar}' ist doppelt!`;
        } else {
            repeatHint.className = 'min-h-[30px] text-[11px] font-semibold text-orange-700 leading-tight pt-1';
            repeatHint.textContent = `Zeichen: '${printableChar}'.`;
        }
    } else {
        repeatHint.className = 'min-h-[30px] text-[11px] font-semibold text-transparent';
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
    isViewerZoomed = false;
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

    const viewerMediaTap = event.target.closest('#teraViewerMediaWrap, #teraViewerImage, #teraViewerCountdown');
    if (viewerMediaTap && activeSequence.length) {
        isViewerZoomed = !isViewerZoomed;
        renderViewer(root);
        return;
    }

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
            const confirmed = window.confirm('Favorit wirklich löschen?');
            if (confirmed) {
                removeFavoriteById(favoriteId);
                renderMenu(root);
                renderViewer(root);
            }
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

    const charModeBtn = event.target.closest('[data-ts-char-mode]');
    if (charModeBtn) {
        const mode = charModeBtn.dataset.tsCharMode;
        if (mode === 'upper' || mode === 'lower' || mode === 'symbols') {
            activeCharKeyboardMode = mode;
            renderCharGrid(root);
        }
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
        isViewerZoomed = false;
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

function normalizeCodesFromTableRows(rows) {
    const allowedSourcePages = new Set(Object.keys(SOURCE_TO_MANUAL_PAGE).map((k) => Number(k)));
    const normalized = [];
    skippedTableRows = [];
    codeMetaById = new Map();

    rows.forEach((row) => {
        const parsed = parseCodeFileName(row.fileName);
        if (!parsed || !allowedSourcePages.has(parsed.sourcePage)) {
            skippedTableRows.push(row.fileName || '(ohne Dateiname)');
            return;
        }

        const id = row.fileName.replace(/\.png$/i, '');
        const dims = inferCodeDimensions(row.title);
        const code = {
            id,
            sourcePage: parsed.sourcePage,
            manualPage: SOURCE_TO_MANUAL_PAGE[parsed.sourcePage] || parsed.sourcePage,
            index: parsed.index,
            file: `assets/tera-scanner/codes/${row.fileName}`,
            x: 0,
            y: 0,
            w: dims.w,
            h: dims.h
        };

        normalized.push(code);
        codeMetaById.set(id, {
            fileName: row.fileName,
            title: row.title,
            info: row.info
        });
    });

    return normalized.sort((a, b) => (a.manualPage - b.manualPage) || (a.index - b.index));
}

async function ensureCodesLoaded() {
    if (cachedCodes.length) return;

    const response = await fetch(CODES_TABLE_FILE, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Code-Tabelle konnte nicht geladen werden (${response.status}).`);
    }

    const rawCsv = await response.text();
    const rows = parseCodeTableCsv(rawCsv);
    if (!rows.length) {
        throw new Error('Code-Tabelle ist leer oder ungültig formatiert.');
    }

    const knownFileNames = new Set(rows.map((row) => row.fileName));
    const unassignedRows = await loadUnassignedRowsFromLegacyManifest(knownFileNames);
    if (unassignedRows.length) {
        rows.push(...unassignedRows);
    }

    const rowsWithImages = await filterRowsWithExistingImages(rows);
    cachedCodes = normalizeCodesFromTableRows(rowsWithImages);

    if (missingImageRows.length) {
        console.warn('Tera-Scanner: Tabellenzeilen ohne passende PNG wurden übersprungen:', missingImageRows);
    }
    if (skippedTableRows.length) {
        console.warn('Tera-Scanner: Einige Tabellenzeilen wurden übersprungen (ungültiger Dateiname oder Quelle):', skippedTableRows);
    }
    if (!cachedCodes.length) {
        throw new Error('Es konnten keine gültigen Codes aus Tabelle/Bildern geladen werden.');
    }

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
    isViewerZoomed = false;
    activeSequence = [];
    activeIndex = 0;
    activeTitle = '';
    autoReplayReady = false;
}
