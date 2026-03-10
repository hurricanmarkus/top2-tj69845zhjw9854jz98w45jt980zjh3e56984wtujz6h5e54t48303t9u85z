import csv
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from pyzbar.pyzbar import decode

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assets/tera-scanner/codes/manifest.json"
MANUAL_DIR = ROOT / "assets/tera-scanner/manual"
OUTPUT_DIR = ROOT / "assets/tera-scanner/settings-codes-export"
OUTPUT_META_CSV = OUTPUT_DIR / "codes_tabelle.csv"
OUTPUT_META_MD = OUTPUT_DIR / "codes_tabelle.md"
OUTPUT_ZIP = ROOT / "assets/tera-scanner/settings-codes-export.zip"

SOURCE_TO_MANUAL_PAGE = {
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
    19: 26,
}

PAGE_TITLES_DE = {
    1: "Factory Reset & Arbeitsmodus",
    2: "Arbeitsmodus & Kommunikation",
    3: "2.4G/Bluetooth Pairing",
    4: "Bluetooth SPP/BLE & Übertragungsgeschwindigkeit",
    5: "Bluetooth-Name / Scanmodus / Zentrierung",
    6: "Lautstärke / Vibration / Sleep / iOS",
    7: "Terminator & Tastatur-Sprache",
    8: "Sprache/Fall & Symbologien-Übersicht",
    9: "Inverted/UPC/EAN-8",
    10: "EAN-13 / ISBN / ISSN / Code 128",
    11: "GS1-128 / Code39 / Code32 / Code93",
    12: "Code11 / Codabar / DataBar",
    13: "2D-Symbologien + GS Replacement",
    14: "Prefix / Hide / ASCII Form",
    15: "Suffix / Hide Prefix/Suffix",
    16: "ASCII Transfer Meaning 0-3",
    17: "ASCII Form 1-7",
    18: "ASCII Form 8-13",
    19: "ASCII Form 14-20",
    20: "ASCII Form 21-27",
    21: "ASCII Form 28-31 + Sonderzeichen",
    22: "Zeichen-Tabelle Teil 1",
    23: "Zeichen-Tabelle Teil 2",
    24: "Zeichen-Tabelle Teil 3",
    25: "Zeichen-Tabelle Teil 4",
}

PAGE_CODE_LABELS = {
    1: ["Werkseinstellungen", "Batteriestand", "Firmware-Version", "Sofort-Upload-Modus"],
    2: [
        "Speichermodus",
        "Gespeicherte Daten hochladen",
        "Anzahl gespeicherter Codes",
        "Speicher leeren",
        "2.4G-Modus",
        "Bluetooth HID-Modus",
        "Bluetooth SPP-Modus",
        "Bluetooth BLE-Modus",
    ],
    3: ["2.4G-Modus", "Pairing mit Dongle erzwingen", "Bluetooth HID-Modus", "Pairing mit Bluetooth erzwingen"],
    4: [
        "8-Sekunden Pairing EIN",
        "8-Sekunden Pairing AUS",
        "Bluetooth SPP-Modus",
        "Bluetooth BLE-Modus",
        "HID-Übertragung Hoch",
        "HID-Übertragung Mittel",
        "HID-Übertragung Niedrig",
        "HID-Übertragung Sehr niedrig",
    ],
    5: [
        "Bluetooth-Namenmodus aktivieren",
        "Bluetooth-Namenbeispiel",
        "Scanmodus Tastendruck",
        "Scanmodus Dauerbetrieb",
        "Zentrierung AUS",
        "Nur zentrierter Code",
    ],
    6: [
        "Lautstärke Hoch",
        "Lautstärke Mittel",
        "Lautstärke Niedrig",
        "Ton AUS",
        "Vibration EIN",
        "Vibration AUS",
        "Sleep 5 Minuten",
        "Sleep 30 Minuten",
        "Kein Sleep",
        "Sleep sofort",
        "iOS Keyboard EIN",
        "iOS Keyboard AUS",
    ],
    7: [
        "Terminator CR",
        "Terminator LF",
        "Terminator CR+LF",
        "Kein Terminator",
        "Terminator TAB",
        "GBK Ausgabe",
        "Unicode Ausgabe",
        "Tastatursprache Englisch",
        "Tastatursprache Deutsch",
        "Tastatursprache Französisch",
        "Tastatursprache Spanisch",
    ],
    8: [
        "Tastatursprache Italienisch",
        "Tastatursprache Japanisch",
        "Tastatursprache Britisch Englisch",
        "Internationales Keyboard",
        "Groß/Klein unverändert",
        "Alles Großbuchstaben",
        "Alles Kleinbuchstaben",
        "Groß/Klein invertieren",
        "Alle Barcodes EIN",
        "Alle Barcodes AUS",
        "Alle 1D-Codes EIN",
        "Alle 1D-Codes AUS",
    ],
    9: [
        "Nur normale Codes",
        "Normale + invertierte Codes",
        "UPC-A EIN",
        "UPC-A AUS",
        "UPC-A Prüfziffer EIN",
        "UPC-A Prüfziffer AUS",
        "UPC-E EIN",
        "UPC-E AUS",
        "UPC-E Prüfziffer EIN",
        "UPC-E Prüfziffer AUS",
        "EAN-8 EIN",
        "EAN-8 AUS",
    ],
    13: [
        "QR-Code EIN",
        "QR-Code AUS",
        "Micro-QR EIN",
        "Micro-QR AUS",
        "DataMatrix EIN",
        "DataMatrix AUS",
        "PDF417 EIN",
        "PDF417 AUS",
        "MicroPDF417 EIN",
        "MicroPDF417 AUS",
        "GS-Ersatz EIN",
        "GS-Ersatz AUS",
    ],
}

CHAR_ASSIGNMENTS = {
    22: ["(", ")", "*", "+", ",", "-", "/", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ":", ";", "<", "=", ">", "?", "@", "A", "B"],
    23: ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "[", "\\", "]"],
    24: ["^", "_", "`", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u"],
    25: ["v", "w", "x", "y", "z", "{", "|", "}", "~", "DEL", "Ç", "ç"],
}

EXTRA_SYMBOL_BY_ID = {
    "p21_char01": "-",
    "p21_char02": " ",
    "p21_char03": "!",
    "p21_char04": '"',
    "p21_char05": "#",
    "p21_char06": "$",
    "p21_char07": "%",
    "p21_char08": "&",
    "p21_char09": "`",
}

EXCLUDED_SOURCE_PAGES = {0, 1, 19, 20, 21}
QR_DETECTOR = cv2.QRCodeDetector()


def contiguous_segments(idxs: np.ndarray):
    if idxs.size == 0:
        return []
    segments = []
    start = idxs[0]
    prev = idxs[0]
    for val in idxs[1:]:
        if val == prev + 1:
            prev = val
        else:
            segments.append((start, prev))
            start = val
            prev = val
    segments.append((start, prev))
    return segments


def best_segment(sums: np.ndarray, threshold: int):
    idxs = np.where(sums >= threshold)[0]
    segments = contiguous_segments(idxs)
    if not segments:
        return 0, len(sums) - 1

    best = None
    best_score = -1
    for a, b in segments:
        segment_sum = float(sums[a : b + 1].sum())
        length = b - a + 1
        score = segment_sum * length
        if score > best_score:
            best_score = score
            best = (a, b)
    return best


def decode_rects(base_rgb: Image.Image):
    rects = []
    decoded = decode(base_rgb)
    if decoded:
        for item in decoded:
            rects.append(
                (
                    int(item.rect.left),
                    int(item.rect.top),
                    int(item.rect.left + item.rect.width),
                    int(item.rect.top + item.rect.height),
                    str(item.type or ""),
                )
            )
        return rects

    arr_bgr = cv2.cvtColor(np.array(base_rgb), cv2.COLOR_RGB2BGR)
    _data, points, _straight = QR_DETECTOR.detectAndDecode(arr_bgr)
    if points is not None and len(points):
        pts = points.reshape(-1, 2)
        left = int(np.floor(pts[:, 0].min()))
        top = int(np.floor(pts[:, 1].min()))
        right = int(np.ceil(pts[:, 0].max()))
        bottom = int(np.ceil(pts[:, 1].max()))
        rects.append((left, top, right, bottom, "QRCODE"))

    return rects


def pick_best_rect(rects, target_center, expect_barcode: bool):
    if not rects:
        return None

    tx, ty = target_center
    best_rect = None
    best_score = None

    for left, top, right, bottom, code_type in rects:
        width = max(1, right - left)
        height = max(1, bottom - top)
        if width < 24 or height < 24:
            continue

        cx = left + width / 2
        cy = top + height / 2
        dist = abs(cx - tx) + abs(cy - ty)

        aspect = width / height
        is_qr_like = code_type.upper() == "QRCODE" or aspect < 1.8

        penalty = 0
        if expect_barcode and is_qr_like:
            penalty += 260
        if (not expect_barcode) and (not is_qr_like):
            penalty += 180

        # Groessere Flaechen sind meist stabiler decodierbar.
        area_bonus = (width * height) / 180.0
        score = dist + penalty - area_bonus

        if best_score is None or score < best_score:
            best_score = score
            best_rect = (left, top, right, bottom)

    return best_rect


def crop_from_rect(image: Image.Image, rect, expect_barcode: bool):
    left, top, right, bottom = rect
    if expect_barcode:
        pad_x = 10
        pad_y = 8
    else:
        pad_x = 10
        pad_y = 10

    x0 = max(0, left - pad_x)
    y0 = max(0, top - pad_y)
    x1 = min(image.width, right + pad_x)
    y1 = min(image.height, bottom + pad_y)

    return image.crop((x0, y0, x1, y1))


def extract_tight_code_crop(page_img: Image.Image, x: int, y: int, w: int, h: int) -> Image.Image:
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(page_img.width, x + w)
    y1 = min(page_img.height, y + h)

    base_rgb = page_img.crop((x0, y0, x1, y1)).convert("RGB")
    is_barcode_like = w >= h * 1.8
    target_center = (base_rgb.width / 2.0, base_rgb.height / 2.0)

    rects = decode_rects(base_rgb)
    decoder_box = pick_best_rect(rects, target_center, is_barcode_like)
    if decoder_box is not None:
        return crop_from_rect(base_rgb, decoder_box, is_barcode_like)

    # Fallback fuer ungenaue Manifest-Koordinaten: in der Naehe suchen.
    search_pad = 300 if is_barcode_like else 220
    sx0 = max(0, x0 - search_pad)
    sy0 = max(0, y0 - search_pad)
    sx1 = min(page_img.width, x1 + search_pad)
    sy1 = min(page_img.height, y1 + search_pad)
    around_rgb = page_img.crop((sx0, sy0, sx1, sy1)).convert("RGB")

    around_center = (
        (x0 + x1) / 2.0 - sx0,
        (y0 + y1) / 2.0 - sy0,
    )
    around_rects = decode_rects(around_rgb)
    around_box = pick_best_rect(around_rects, around_center, is_barcode_like)
    if around_box is not None:
        return crop_from_rect(around_rgb, around_box, is_barcode_like)

    base = base_rgb.convert("L")
    arr = np.array(base)
    bw = arr < 185

    row_sums = bw.sum(axis=1)
    row_threshold = max(3, int(bw.shape[1] * 0.08))
    r0, r1 = best_segment(row_sums, row_threshold)

    if is_barcode_like:
        pad = 8
        fy0 = max(0, r0 - pad)
        fy1 = min(base_rgb.height, r1 + 1 + pad)
        return base_rgb.crop((0, fy0, base_rgb.width, fy1))

    sub_bw = bw[r0 : r1 + 1, :]
    col_sums = sub_bw.sum(axis=0)
    col_threshold = max(2, int(sub_bw.shape[0] * 0.04))
    c0, c1 = best_segment(col_sums, col_threshold)

    pad = 8
    fx0 = max(0, c0 - pad)
    fy0 = max(0, r0 - pad)
    fx1 = min(base_rgb.width, c1 + 1 + pad)
    fy1 = min(base_rgb.height, r1 + 1 + pad)

    return base_rgb.crop((fx0, fy0, fx1, fy1))


def build_title(entry, manual_page: int, manual_pos: int) -> str:
    code_id = entry["id"]
    if code_id in EXTRA_SYMBOL_BY_ID:
        symbol = EXTRA_SYMBOL_BY_ID[code_id]
        if symbol == " ":
            return "Zeichen Leerzeichen"
        return f"Zeichen {symbol}"

    if manual_page in CHAR_ASSIGNMENTS:
        chars = CHAR_ASSIGNMENTS[manual_page]
        idx = manual_pos - 1
        if 0 <= idx < len(chars):
            symbol = chars[idx]
            if symbol == " ":
                return "Zeichen Leerzeichen"
            return f"Zeichen {symbol}"

    labels = PAGE_CODE_LABELS.get(manual_page, [])
    idx = manual_pos - 1
    if 0 <= idx < len(labels):
        return labels[idx]

    chapter = PAGE_TITLES_DE.get(manual_page, "Scanner-Einstellungen")
    return f"Kapitel {manual_page:02d} - {chapter} - Eintrag {manual_pos:02d}"


def build_description(title: str) -> str:
    upper = title.upper()
    if " EIN" in upper or upper.endswith("EIN") or "AKTIV" in upper:
        return f"Aktiviert die Einstellung \"{title}\" am Scanner."
    if " AUS" in upper or upper.endswith("AUS") or "DEAKTIV" in upper:
        return f"Deaktiviert die Einstellung \"{title}\" am Scanner."
    if "PAIRING" in upper:
        return f"Startet bzw. setzt die Pairing-Funktion für \"{title}\"."
    if "SPRACHE" in upper or "KEYBOARD" in upper:
        return f"Stellt die Tastatur-/Spracheinstellung auf \"{title}\"."
    if "LAUTSTÄRKE" in upper or "TON" in upper or "VIBRATION" in upper:
        return f"Konfiguriert das Feedback des Scanners auf \"{title}\"."
    if "SLEEP" in upper:
        return f"Setzt das Ruheverhalten des Scanners auf \"{title}\"."
    if "PREFIX" in upper or "SUFFIX" in upper:
        return f"Konfiguriert Präfix/Suffix mit der Option \"{title}\"."
    if "ZEICHEN" in upper:
        return f"Gibt das Zeichen für die Scanner-Programmierung aus: \"{title}\"."
    return f"Setzt den Scanner auf die Option \"{title}\"."


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8-sig"))

    filtered = []
    for item in manifest:
        source_page = int(item["page"])
        if source_page in EXCLUDED_SOURCE_PAGES:
            continue
        if source_page not in SOURCE_TO_MANUAL_PAGE:
            continue

        manual_page = SOURCE_TO_MANUAL_PAGE[source_page]
        if manual_page >= 26:
            continue

        filtered.append(
            {
                "id": item["id"],
                "source_page": source_page,
                "manual_page": manual_page,
                "index": int(item["index"]),
                "x": int(item["x"]),
                "y": int(item["y"]),
                "w": int(item["w"]),
                "h": int(item["h"]),
            }
        )

    filtered.sort(key=lambda e: (e["manual_page"], e["index"]))

    manual_counts = {}
    for item in filtered:
        key = item["manual_page"]
        manual_counts[key] = manual_counts.get(key, 0) + 1
        item["manual_pos"] = manual_counts[key]

    rows = []
    page_cache = {}

    for item in filtered:
        source_page = item["source_page"]
        if source_page not in page_cache:
            page_path = MANUAL_DIR / f"TR-UM006-EN Ver.01.1.01-bilder-{source_page}.jpg"
            page_cache[source_page] = Image.open(page_path).convert("RGB")

        page_img = page_cache[source_page]
        cropped = extract_tight_code_crop(page_img, item["x"], item["y"], item["w"], item["h"])

        file_name = f"{item['id']}.png"
        target = OUTPUT_DIR / file_name
        cropped.save(target, format="PNG", optimize=True)

        title = build_title(item, item["manual_page"], item["manual_pos"])
        description = build_description(title)

        rows.append(
            {
                "DATEINAME": file_name,
                "TITEL": title,
                "INFOTEXT": description,
            }
        )

    with OUTPUT_META_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["DATEINAME", "TITEL", "INFOTEXT"], delimiter=";")
        writer.writeheader()
        writer.writerows(rows)

    lines = ["| DATEINAME | TITEL | INFOTEXT |", "|---|---|---|"]
    for row in rows:
        fn = row["DATEINAME"].replace("|", "\\|")
        ti = row["TITEL"].replace("|", "\\|")
        info = row["INFOTEXT"].replace("|", "\\|")
        lines.append(f"| {fn} | {ti} | {info} |")
    OUTPUT_META_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    import zipfile

    with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for image_path in sorted(OUTPUT_DIR.glob("*.png")):
            zf.write(image_path, arcname=image_path.name)
        zf.write(OUTPUT_META_CSV, arcname=OUTPUT_META_CSV.name)
        zf.write(OUTPUT_META_MD, arcname=OUTPUT_META_MD.name)

    print(f"Export abgeschlossen: {len(rows)} Codes")
    print(f"Ordner: {OUTPUT_DIR}")
    print(f"ZIP: {OUTPUT_ZIP}")


if __name__ == "__main__":
    main()
