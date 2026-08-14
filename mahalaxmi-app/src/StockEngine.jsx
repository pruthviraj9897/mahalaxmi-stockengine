import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Package, Truck, RotateCcw, Users, Boxes, LayoutGrid, Plus, Trash2, AlertCircle, CheckCircle2, FileText, Archive, Printer, Download, Upload, History, Pencil, X, Ban, Settings, LogOut, Menu, Wallet, Receipt } from "lucide-react";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "mlx-stockengine-v1";

// Wraps any button handler with a native confirmation prompt. Used on every
// clickable button across the app (per product decision — even low-stakes
// actions like "Add line" or "Cancel" ask first) so nothing fires from a
// stray or accidental tap. Returns a new handler that only calls `action`
// if the user confirms; any arguments React passes (e.g. the click event)
// are forwarded through untouched.
function confirmClick(action, message = "Are you sure?") {
  return (...args) => {
    if (window.confirm(message)) {
      action(...args);
    }
  };
}

// Renders its children into a dedicated DOM node appended directly to
// <body>, completely outside the app's own tree (app-shell > main-content >
// ...). This matters for printing: our print CSS hides the whole app-shell
// via `display: none`, and a `display: none` ancestor hides its entire
// subtree no matter what CSS is applied to a descendant — there is no way
// to "un-hide" a child of a display:none parent. Nesting the print content
// anywhere inside app-shell therefore guarantees it prints blank. Portaling
// it out to a body-level sibling sidesteps that entirely.
function PrintPortal({ children, domRef, extraClass }) {
  const nodeRef = useRef(null);
  if (!nodeRef.current) {
    nodeRef.current = document.createElement("div");
    nodeRef.current.className = "print-portal" + (extraClass ? " " + extraClass : "");
  }
  useEffect(() => {
    const node = nodeRef.current;
    document.body.appendChild(node);
    if (domRef) domRef.current = node;
    return () => {
      document.body.removeChild(node);
      if (domRef) domRef.current = null;
    };
  }, []);
  return createPortal(children, nodeRef.current);
}

// ---- PDF EXPORT (replaces native window.print() "Save as PDF") ----------
// Android's native print-to-PDF pipeline proved unreliable across several
// rounds of fixes (timing, user-activation, composited-layer CSS) — the
// on-screen preview always looked right, but the file Android actually
// wrote was sometimes blank/wrong-sized regardless. Rather than keep
// chasing platform quirks we can't fully control, we render the target
// content to a canvas ourselves (html2canvas) and assemble the PDF file
// directly (jsPDF), then trigger a normal download. This produces an
// identical file on every device/browser, independent of the OS's print
// pipeline entirely.

let _pdfLibsPromise = null;
function loadScript(src, getGlobal) {
  return new Promise((resolve, reject) => {
    const existing = getGlobal();
    if (existing) { resolve(existing); return; }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      const g = getGlobal();
      if (g) resolve(g);
      else reject(new Error("Loaded but global missing: " + src));
    };
    script.onerror = () => reject(new Error("Failed to load " + src));
    document.body.appendChild(script);
  });
}
function loadPdfLibs() {
  if (_pdfLibsPromise) return _pdfLibsPromise;
  _pdfLibsPromise = Promise.all([
    loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js", () => window.html2canvas),
    loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js", () => window.jspdf && window.jspdf.jsPDF),
  ]).then(([html2canvas, jsPDF]) => ({ html2canvas, jsPDF }));
  return _pdfLibsPromise;
}

// Lazily loads JSZip, used to bundle multiple generated invoice PDFs into a
// single downloadable .zip for the bulk invoice flow.
let _jsZipPromise = null;
function loadJSZip() {
  if (_jsZipPromise) return _jsZipPromise;
  _jsZipPromise = loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", () => window.JSZip);
  return _jsZipPromise;
}

// Renders `portalClass` (a .print-portal--* node already in the DOM, see
// PrintPortal above) to a PDF and downloads it as `filename`. The node
// normally sits off-screen with display:none (it's only ever meant to be
// revealed by @media print); we temporarily make it paintable at a fixed
// A4-width layout, capture it, then put it back exactly as it was.
async function exportPortalToPdf(portalClass, filename) {
  const node = document.querySelector("." + portalClass);
  if (!node) throw new Error("Print portal not found: " + portalClass);
  const pdf = await renderNodeToPdf(node);
  pdf.save(filename.toLowerCase().endsWith(".pdf") ? filename : filename + ".pdf");
}

// Same rendering as exportPortalToPdf, but returns the PDF as a Blob instead
// of triggering a download — used when bundling several invoices into a zip
// (see BulkInvoiceBuilder) rather than saving them one at a time.
async function pdfBlobFromNode(node) {
  const pdf = await renderNodeToPdf(node);
  return pdf.output("blob");
}

// Core of the html2canvas → jsPDF pipeline, shared by exportPortalToPdf
// (single download) and pdfBlobFromNode (zip bundling). Renders `node` —
// normally an off-screen print-portal node — to a paginated A4 jsPDF object.
async function renderNodeToPdf(node) {
  // Expand any scrollable table containers so the full table gets captured,
  // not just the scrolled viewport — same as the old print CSS did.
  const wraps = node.querySelectorAll(".table-wrap");
  const prevWrapStyles = Array.from(wraps).map((el) => ({
    el, maxHeight: el.style.maxHeight, overflow: el.style.overflow,
    overflowX: el.style.overflowX, overflowY: el.style.overflowY,
  }));
  wraps.forEach((el) => {
    el.style.maxHeight = "none";
    el.style.overflow = "visible";
    el.style.overflowX = "visible";
    el.style.overflowY = "visible";
  });

  const prevStyle = {
    display: node.style.display, position: node.style.position,
    left: node.style.left, top: node.style.top,
    width: node.style.width, zIndex: node.style.zIndex,
    background: node.style.background, padding: node.style.padding,
  };
  node.style.display = "block";
  node.style.position = "fixed";
  node.style.left = "-10000px";
  node.style.top = "0";
  node.style.width = "210mm"; // A4 width, so layout matches the printed page
  node.style.zIndex = "-1";
  node.style.background = "#ffffff";
  node.style.padding = "10mm";

  // Let layout/paint settle before capturing.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const { html2canvas, jsPDF } = await loadPdfLibs();
    const canvas = await html2canvas(node, {
      // Fixed at 3x (rather than capped at 2x by devicePixelRatio) so text
      // and table rules stay crisp when zoomed, regardless of the exporting
      // device's screen density.
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pageWmm = 210, pageHmm = 297, marginMm = 10;
    const usableWmm = pageWmm - marginMm * 2;
    const usableHmm = pageHmm - marginMm * 2;
    const pxPerMm = canvas.width / usableWmm;
    const pageHeightPx = Math.floor(usableHmm * pxPerMm);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    let renderedPx = 0;
    let firstPage = true;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;
      pageCanvas.getContext("2d").drawImage(
        canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx
      );
      const imgData = pageCanvas.toDataURL("image/png");
      if (!firstPage) pdf.addPage();
      pdf.addImage(imgData, "PNG", marginMm, marginMm, usableWmm, sliceHeightPx / pxPerMm);
      renderedPx += sliceHeightPx;
      firstPage = false;
    }

    return pdf;
  } finally {
    Object.assign(node.style, prevStyle);
    prevWrapStyles.forEach(({ el, maxHeight, overflow, overflowX, overflowY }) => {
      el.style.maxHeight = maxHeight;
      el.style.overflow = overflow;
      el.style.overflowX = overflowX;
      el.style.overflowY = overflowY;
    });
  }
}

// Filenames can't contain \ / : * ? " < > | — shared by all PDF exports.
function sanitizeForFilename(s) {
  return String(s || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

// Dates are always stored as YYYY-MM-DD internally (required by <input type="date">).
// This only changes how they're shown on screen, e.g. in tables.
function fmtDateDisplay(iso) {
  if (!iso || typeof iso !== "string") return iso || "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Formats a full ISO timestamp (createdAt/updatedAt) as DD/MM/YYYY, HH:MM —
// used for "last changed" columns. Falls back to "—" if missing/invalid.
function fmtDateTime(iso) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  const d = String(dt.getDate()).padStart(2, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const y = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y}, ${hh}:${mm}`;
}

// Small pill-style toggle used for "sort by" controls.
function SortToggle({ value, onChange, options, style }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, ...style }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={confirmClick(() => onChange(opt.value), "Are you sure?")}
          style={{
            ...styles.ghostBtn,
            ...(value === opt.value ? { background: COLORS.amber, color: "#fff", borderColor: COLORS.amber } : {}),
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Small "Filter by Party" dropdown reused across Delivery Entry, Return
// Entry, Invoice Archive, and the Dashboard.
function PartyFilter({ parties, value, onChange }) {
  return (
    <label className="party-filter-wrap" style={{ ...styles.field, minWidth: 200 }}>
      <span style={styles.fieldLabel}>Filter by Party</span>
      <select style={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All Parties</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </select>
    </label>
  );
}

const DEFAULT_COMPANY = {
  name: "MAHALAXMI CORPORATION",
  tagline: "CENTERING & SHUTTERING DEPO., TIMBER MART, ALL TYPE OF MATERIAL WILL BE AVAILABLE FOR (RENT & SALE)",
  address: "Plot No. 46, Yogi Estate-3, Yogi Estate, Nr. Karmatur Chokadi, Garden City Road, GIDC, Ankleshwar-393 002.",
  email: "admin@mahalaxmicorporation.in",
  gstin: "",
};

const DEFAULT_EXPENSE_CATEGORIES = [
  "Land Rent",
  "Labour Payment",
  "Transport",
  "Fuel",
  "Maintenance & Repairs",
  "Office & Admin",
  "Utilities",
  "Miscellaneous",
];

const emptyData = () => ({
  parties: [],
  items: [],
  deliveryChallans: [],
  returnChallans: [],
  invoices: [],
  payments: [],
  expenses: [],
  expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
  recycleBin: [],
  seq: { party: 1, item: 1, delivery: 1, return: 1, invoice: 1 },
  company: { ...DEFAULT_COMPANY },
});

const BIN_RETENTION_DAYS = 7;
const BIN_RETENTION_MS = BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Maps a recycle-bin entry's "type" to the data array it was removed from.
const BIN_TYPE_META = {
  party: { key: "parties", label: "Party" },
  item: { key: "items", label: "Item" },
  delivery: { key: "deliveryChallans", label: "Delivery Challan" },
  return: { key: "returnChallans", label: "Return Challan" },
  invoice: { key: "invoices", label: "Invoice" },
  payment: { key: "payments", label: "Payment" },
  expense: { key: "expenses", label: "Expense" },
};

// Drops any bin entries older than the retention window. Pure function —
// caller decides whether to persist the result.
function purgeExpiredBinEntries(recycleBin) {
  const now = Date.now();
  return (recycleBin || []).filter(
    (b) => now - new Date(b.deletedAt).getTime() < BIN_RETENTION_MS
  );
}

// Moves a record out of its live array and into the recycle bin instead of
// deleting it outright. `summary` is a short human-readable description
// captured at delete time, so the bin listing still reads clearly even if
// the record references other data that changes later.
function moveToBin(data, persist, type, record, summary) {
  const meta = BIN_TYPE_META[type];
  if (!meta || !record) return;
  const entry = {
    binId: crypto.randomUUID(),
    type,
    summary,
    deletedAt: new Date().toISOString(),
    record,
  };
  persist({
    ...data,
    [meta.key]: (data[meta.key] || []).filter((x) => x.id !== record.id),
    recycleBin: [...(data.recycleBin || []), entry],
  });
}

// Puts a bin entry's record back into its original array.
function restoreFromBin(data, persist, binId) {
  const entry = (data.recycleBin || []).find((b) => b.binId === binId);
  if (!entry) return;
  const meta = BIN_TYPE_META[entry.type];
  if (!meta) return;
  persist({
    ...data,
    [meta.key]: [...(data[meta.key] || []), entry.record],
    recycleBin: data.recycleBin.filter((b) => b.binId !== binId),
  });
}

// Permanently removes a bin entry (used by "delete forever" and by the
// automatic 7-day purge).
function purgeFromBin(data, persist, binId) {
  persist({ ...data, recycleBin: (data.recycleBin || []).filter((b) => b.binId !== binId) });
}

const SEED_DATA = {
  "parties": [
    {
      "id": "seed-party-P01",
      "code": "P01",
      "name": "Robinbhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P02",
      "code": "P02",
      "name": "parthbhai Gajera",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P03",
      "code": "P03",
      "name": "ashishbhai vekariya",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P04",
      "code": "P04",
      "name": "Jitendrabhai ",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P05",
      "code": "P05",
      "name": "Himanshubhai desai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P06",
      "code": "P06",
      "name": "Manojbhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P07",
      "code": "P07",
      "name": "Amitbhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P08",
      "code": "P08",
      "name": "Niravbhai Tanti",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P09",
      "code": "P09",
      "name": "Pravinbhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P10",
      "code": "P10",
      "name": "Nitinbhai pansheriya",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P11",
      "code": "P11",
      "name": "Pratikbhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P12",
      "code": "P12",
      "name": "Rameshbhai sharma",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P13",
      "code": "P13",
      "name": "Rasheshwar Plate depot",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P14",
      "code": "P14",
      "name": "Shree Krishna construction",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P15",
      "code": "P15",
      "name": "Maheshbhai Solanki",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P16",
      "code": "P16",
      "name": "Piyushbhai(vandana chem)",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P17",
      "code": "P17",
      "name": "Bholubhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P18",
      "code": "P18",
      "name": "Ranjitbhai Chavda",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    },
    {
      "id": "seed-party-P19",
      "code": "P19",
      "name": "Ashokbhai",
      "address": "",
      "siteName": "",
      "phone": "",
      "reference": ""
    }
  ],
  "items": [
    {
      "id": "seed-item-I01",
      "code": "I01",
      "name": "3 X 2 ",
      "dailyRate": 1.3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I02",
      "code": "I02",
      "name": "3 X 21\"",
      "dailyRate": 1.3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I03",
      "code": "I03",
      "name": "3 X 18\"",
      "dailyRate": 1.3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I04",
      "code": "I04",
      "name": "3 X 15\"",
      "dailyRate": 1.3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I05",
      "code": "I05",
      "name": "3 X 12\"",
      "dailyRate": 1.3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I06",
      "code": "I06",
      "name": "3 X 9\"",
      "dailyRate": 1.3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I07",
      "code": "I07",
      "name": "3 X 9\" પતરા",
      "dailyRate": 1.3,
      "serviceCharge": 1,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I08",
      "code": "I08",
      "name": "3 X 6\" પતરા",
      "dailyRate": 1.3,
      "serviceCharge": 1,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I09",
      "code": "I09",
      "name": "કપ્લર",
      "dailyRate": 0,
      "serviceCharge": 0,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I10",
      "code": "I10",
      "name": "chavi 8ft",
      "dailyRate": 0.8,
      "serviceCharge": 1,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I11",
      "code": "I11",
      "name": "bottom 8ft",
      "dailyRate": 0.8,
      "serviceCharge": 1,
      "totalDepotStock": 5000
    },
    {
      "id": "seed-item-I12",
      "code": "I12",
      "name": "ખપેડા",
      "dailyRate": 5,
      "serviceCharge": 5,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I13",
      "code": "I13",
      "name": "લાકડાનો ટેકો 11.5'",
      "dailyRate": 2,
      "serviceCharge": 2,
      "totalDepotStock": 1000
    },
    {
      "id": "seed-item-I14",
      "code": "I14",
      "name": "લાકડાનો ટેકો 9.5'",
      "dailyRate": 2,
      "serviceCharge": 2,
      "totalDepotStock": 1000
    },
    {
      "id": "seed-item-I15",
      "code": "I15",
      "name": "સિકંજો",
      "dailyRate": 1,
      "serviceCharge": 1,
      "totalDepotStock": 1000
    },
    {
      "id": "seed-item-I16",
      "code": "I16",
      "name": "18''Ply 8ft",
      "dailyRate": 2,
      "serviceCharge": 2,
      "totalDepotStock": 400
    },
    {
      "id": "seed-item-I17",
      "code": "I17",
      "name": "18''Ply 9ft",
      "dailyRate": 2,
      "serviceCharge": 2,
      "totalDepotStock": 400
    },
    {
      "id": "seed-item-I18",
      "code": "I18",
      "name": "18''Ply 6.5ft",
      "dailyRate": 2,
      "serviceCharge": 2,
      "totalDepotStock": 400
    },
    {
      "id": "seed-item-I19",
      "code": "I19",
      "name": "15''Ply 6ft",
      "dailyRate": 2,
      "serviceCharge": 2,
      "totalDepotStock": 400
    },
    {
      "id": "seed-item-I20",
      "code": "I20",
      "name": "9''Ply 8ft",
      "dailyRate": 1,
      "serviceCharge": 2,
      "totalDepotStock": 400
    },
    {
      "id": "seed-item-I21",
      "code": "I21",
      "name": "jack 2*2",
      "dailyRate": 3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I22",
      "code": "I22",
      "name": "jack 2*3",
      "dailyRate": 3,
      "serviceCharge": 4,
      "totalDepotStock": 500
    },
    {
      "id": "seed-item-I23",
      "code": "I23",
      "name": "Bottm 6ft",
      "dailyRate": 0.8,
      "serviceCharge": 2,
      "totalDepotStock": 500
    }
  ],
  "deliveryChallans": [
    {
      "id": "seed-dc-P04 - Jitendrabhai -1",
      "challanNo": 1,
      "date": "2026-04-02",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I01",
          "qty": 92,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -2",
      "challanNo": 2,
      "date": "2026-04-06",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I03",
          "qty": 13,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -3",
      "challanNo": 3,
      "date": "2026-02-13",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 200,
      "deposit": 2000,
      "lines": [
        {
          "itemId": "seed-item-I06",
          "qty": 10,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -4",
      "challanNo": 4,
      "date": "2026-06-18",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I06",
          "qty": 8,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -5",
      "challanNo": 5,
      "date": "2026-05-18",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I12",
          "qty": 5,
          "rate": 5
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -6",
      "challanNo": 6,
      "date": "2024-08-21",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I16",
          "qty": 1,
          "rate": 2
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -7",
      "challanNo": 7,
      "date": "2024-02-12",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I23",
          "qty": 2,
          "rate": 0.8
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -8",
      "challanNo": 8,
      "date": "2026-05-23",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I10",
          "qty": 42,
          "rate": 0.8
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -9",
      "challanNo": 9,
      "date": "2026-05-23",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I13",
          "qty": 59,
          "rate": 2
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -10",
      "challanNo": 10,
      "date": "2026-06-14",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I14",
          "qty": 20,
          "rate": 2
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -11",
      "challanNo": 11,
      "date": "2025-10-19",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I22",
          "qty": 2,
          "rate": 3
        }
      ]
    },
    {
      "id": "seed-dc-P04 - Jitendrabhai -12",
      "challanNo": 12,
      "date": "2026-04-06",
      "partyId": "seed-party-P04",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I05",
          "qty": 10,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P10 - Nitinbhai pansheriya-62",
      "challanNo": 62,
      "date": "2026-06-27",
      "partyId": "seed-party-P10",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I01",
          "qty": 120,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P10 - Nitinbhai pansheriya-63",
      "challanNo": 63,
      "date": "2026-06-28",
      "partyId": "seed-party-P10",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I13",
          "qty": 15,
          "rate": 2
        }
      ]
    },
    {
      "id": "seed-dc-P12 - Rameshbhai sharma-59",
      "challanNo": 59,
      "date": "2026-04-28",
      "partyId": "seed-party-P12",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I12",
          "qty": 4,
          "rate": 5
        }
      ]
    },
    {
      "id": "seed-dc-P14 - Shree Krishna construction-46",
      "challanNo": 46,
      "date": "2026-02-15",
      "partyId": "seed-party-P14",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I04",
          "qty": 50,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P06 - Manojbhai-60",
      "challanNo": 60,
      "date": "2026-06-22",
      "partyId": "seed-party-P06",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I01",
          "qty": 52,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P06 - Manojbhai-10",
      "challanNo": 10,
      "date": "2025-12-05",
      "partyId": "seed-party-P06",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I04",
          "qty": 8,
          "rate": 1.3
        }
      ]
    },
    {
      "id": "seed-dc-P01 - Robinbhai-123",
      "challanNo": 123,
      "date": "2026-06-01",
      "partyId": "seed-party-P01",
      "siteAddress": "",
      "driverName": "",
      "vehicleNumber": "",
      "transportCharge": 0,
      "deposit": 0,
      "lines": [
        {
          "itemId": "seed-item-I01",
          "qty": 110,
          "rate": 1.3
        }
      ]
    }
  ],
  "returnChallans": [
    {
      "id": "seed-rc-P04 - Jitendrabhai -1",
      "returnChallanNo": 1,
      "date": "2026-06-21",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I10",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -8",
          "qty": 12,
          "brokenQty": 5,
          "brokenRate": 400
        }
      ]
    },
    {
      "id": "seed-rc-P06 - Manojbhai-59",
      "returnChallanNo": 59,
      "date": "2026-06-30",
      "partyId": "seed-party-P06",
      "lines": [
        {
          "itemId": "seed-item-I01",
          "againstChallanId": "seed-dc-P06 - Manojbhai-60",
          "qty": 50,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P06 - Manojbhai-15",
      "returnChallanNo": 15,
      "date": "2026-01-06",
      "partyId": "seed-party-P06",
      "lines": [
        {
          "itemId": "seed-item-I04",
          "againstChallanId": "seed-dc-P06 - Manojbhai-10",
          "qty": 6,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P12 - Rameshbhai sharma-3",
      "returnChallanNo": 3,
      "date": "2026-07-08",
      "partyId": "seed-party-P12",
      "lines": [
        {
          "itemId": "seed-item-I12",
          "againstChallanId": "seed-dc-P12 - Rameshbhai sharma-59",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -5",
      "returnChallanNo": 5,
      "date": "2026-06-08",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 5,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -6",
      "returnChallanNo": 6,
      "date": "2026-06-10",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 10,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -7",
      "returnChallanNo": 7,
      "date": "2026-06-12",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 12,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -8",
      "returnChallanNo": 8,
      "date": "2026-06-15",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 15,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -9",
      "returnChallanNo": 9,
      "date": "2026-06-15",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I06",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -3",
          "qty": 7,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -10",
      "returnChallanNo": 10,
      "date": "2026-06-15",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I05",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -12",
          "qty": 9,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -11",
      "returnChallanNo": 11,
      "date": "2026-06-15",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I23",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -7",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -12",
      "returnChallanNo": 12,
      "date": "2026-06-16",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -13",
      "returnChallanNo": 13,
      "date": "2026-06-17",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -14",
      "returnChallanNo": 14,
      "date": "2026-06-18",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -16",
      "returnChallanNo": 16,
      "date": "2026-06-20",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -17",
      "returnChallanNo": 17,
      "date": "2026-06-21",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -18",
      "returnChallanNo": 18,
      "date": "2026-06-22",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -19",
      "returnChallanNo": 19,
      "date": "2026-06-23",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -20",
      "returnChallanNo": 20,
      "date": "2026-06-24",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -21",
      "returnChallanNo": 21,
      "date": "2026-06-25",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -22",
      "returnChallanNo": 22,
      "date": "2026-06-26",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    },
    {
      "id": "seed-rc-P04 - Jitendrabhai -23",
      "returnChallanNo": 23,
      "date": "2026-06-27",
      "partyId": "seed-party-P04",
      "lines": [
        {
          "itemId": "seed-item-I13",
          "againstChallanId": "seed-dc-P04 - Jitendrabhai -9",
          "qty": 1,
          "brokenQty": 0,
          "brokenRate": 0
        }
      ]
    }
  ]
};

function buildSeedData() {
  return {
    ...emptyData(),
    parties: SEED_DATA.parties,
    items: SEED_DATA.items,
    deliveryChallans: SEED_DATA.deliveryChallans,
    returnChallans: SEED_DATA.returnChallans,
    seq: { party: 20, item: 24, delivery: 124, return: 60, invoice: 1 },
  };
}

function uid(prefix, n) {
  return `${prefix}${String(n).padStart(2, "0")}`;
}

function parseFeet(itemName) {
  const m = /(\d+)\s*ft\b/i.exec(itemName || "");
  return m ? parseInt(m[1], 10) : null;
}

export default function StockEngine({ session, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [tab, setTab] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false); // legacy drawer (desktop-only fallback)
  const [moreOpen, setMoreOpen] = useState(false); // mobile bottom-sheet for secondary sections

  // Injects the app's global stylesheet (incl. @media print rules) into
  // <head>. This MUST live in <head>, not nested inside .app-shell — print
  // CSS sets `.app-shell { display: none !important; }`, and a <style> tag
  // nested under a hidden ancestor is unreliable across mobile print engines
  // (this was the cause of blank/black "Save as PDF" output on mobile).
  useEffect(() => {
    let tag = document.getElementById("mlx-global-styles");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "mlx-global-styles";
      document.head.appendChild(tag);
    }
    tag.textContent = globalCss;
  }, []);

  // Sets the browser tab icon to an amber "M" badge matching the sidebar
  // brand mark, since this app may not always control its own index.html.
  useEffect(() => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="12" fill="${COLORS.amber}" />
        <text x="32" y="45" text-anchor="middle" font-family="Georgia, 'Iowan Old Style', serif" font-size="38" font-weight="700" fill="#ffffff">M</text>
      </svg>
    `.trim();
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = href;
  }, []);

  // Prevent the Enter key from triggering any Save/Add/Submit action.
  // Blocks Enter on inputs (stops form-submit behaviour) AND on buttons
  // (stops keyboard-click on a focused button). Users must click buttons
  // explicitly with the mouse or tap.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
    };
    document.addEventListener("keydown", handleKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("app_state")
          .select("data")
          .eq("id", "default")
          .single();
        if (error) throw error;
        const loaded =
          row && row.data && Object.keys(row.data).length ? row.data : buildSeedData();
        if (!loaded.company) loaded.company = { ...DEFAULT_COMPANY };
        if (!loaded.payments) loaded.payments = [];
        if (!loaded.expenses) loaded.expenses = [];
        if (!loaded.expenseCategories || !loaded.expenseCategories.length) loaded.expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES];
        if (!loaded.recycleBin) loaded.recycleBin = [];
        if (!loaded.drafts) loaded.drafts = {};
        const prunedBin = purgeExpiredBinEntries(loaded.recycleBin);
        const binWasPruned = prunedBin.length !== loaded.recycleBin.length;
        loaded.recycleBin = prunedBin;
        setData(loaded);
        if (binWasPruned) {
          // Fire-and-forget: quietly write the pruned bin back so expired
          // entries don't keep coming back on every load.
          supabase
            .from("app_state")
            .update({ data: loaded, updated_at: new Date().toISOString() })
            .eq("id", "default")
            .then(() => {});
        }
      } catch {
        // Supabase fetch failed (e.g. offline). Fall back to the last
        // locally-cached snapshot rather than dropping straight to seed
        // data, so a network hiccup on load can't look like data loss.
        let cached = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) cached = JSON.parse(raw);
        } catch {
          cached = null;
        }
        setData(cached || buildSeedData());
      }
      setLoading(false);
    })();
  }, []);

  // Holds the most recent unsaved snapshot whenever a save has failed after
  // all retries, so the "Retry" button can re-send exactly that payload.
  const pendingSaveRef = useRef(null);

  // Best-effort local backup, written on every change regardless of whether
  // the Supabase write succeeds. This is what makes data recoverable if the
  // network is down for good: even then, nothing is lost from the browser.
  const writeLocalBackup = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable/full — local backup is best-effort only.
    }
  }, []);

  // Sends `next` to Supabase, retrying a couple of times on failure (network
  // blips are often momentary) before giving up and surfacing a visible,
  // retryable error instead of silently reverting to "idle".
  const attemptSave = useCallback(async (next, attempt = 1) => {
    try {
      const { error } = await supabase
        .from("app_state")
        .update({ data: next, updated_at: new Date().toISOString() })
        .eq("id", "default");
      if (error) throw error;
      pendingSaveRef.current = null;
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        return attemptSave(next, attempt + 1);
      }
      pendingSaveRef.current = next;
      setSaveState("error");
    }
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    writeLocalBackup(next); // safety net: local copy exists even if the network write below fails
    setSaveState("saving");
    attemptSave(next);
  }, [attemptSave, writeLocalBackup]);

  // Flips the sidebar indicator to "Saving…" the instant you type, before
  // the debounced draft write actually fires — so typing always shows
  // immediate feedback rather than a delay while you're mid-word.
  const markTyping = useCallback(() => setSaveState("saving"), []);

  const retrySave = useCallback(() => {
    if (!pendingSaveRef.current) return;
    setSaveState("saving");
    attemptSave(pendingSaveRef.current);
  }, [attemptSave]);

  if (loading || !data) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingCard}>Loading depot data…</div>
      </div>
    );
  }

  const nav = [
    { id: "dashboard", label: "Stock Dashboard", icon: LayoutGrid },
    { id: "parties", label: "Party Master", icon: Users },
    { id: "items", label: "Item Master", icon: Boxes },
    { id: "delivery", label: "Delivery Entry", icon: Truck },
    { id: "return", label: "Return Entry", icon: RotateCcw },
    { id: "invoice", label: "Create Invoice", icon: FileText },
    { id: "bulkInvoice", label: "Bulk Invoice", icon: Users },
    { id: "archive", label: "Invoice Archive", icon: Archive },
    { id: "ledger", label: "Party Ledger", icon: History },
    { id: "balances", label: "Party Balances", icon: Receipt },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "recyclebin", label: "Recycle Bin", icon: Trash2 },
    { id: "backup", label: "Backup & Restore", icon: Download },
    { id: "settings", label: "Company Settings", icon: Settings },
  ];

  return (
    <div className="app-shell" style={styles.app}>
      {/* Mobile-only top bar with hamburger — hidden on desktop via CSS */}
      <div className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={confirmClick(() => setMoreOpen(true), "Are you sure?")}
          aria-label="Open menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={styles.brandMark}>M</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: 0.2, color: COLORS.sidebarInk }}>
            Mahalaxmi
          </div>
        </div>
      </div>

      {/* Backdrop, only shown on mobile when the drawer is open */}
      {navOpen && <div className="mobile-backdrop" onClick={confirmClick(() => setNavOpen(false), "Are you sure?")} />}

      <aside className={`sidebar${navOpen ? " sidebar-open" : ""}`} style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>M</div>
          <div>
            <div style={styles.brandName}>Mahalaxmi</div>
            <div style={styles.brandSub}>Stock Engine</div>
          </div>
          <button
            className="mobile-close-btn"
            onClick={confirmClick(() => setNavOpen(false), "Are you sure?")}
            aria-label="Close menu"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <nav style={styles.nav}>
          {nav.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={confirmClick(() => {
                  setTab(n.id);
                  setNavOpen(false); // close drawer after picking a page on mobile
                }, "Are you sure?")}
                style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}
              >
                <Icon size={16} strokeWidth={2} />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {session?.user?.email && (
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8, wordBreak: "break-all" }}>
              {session.user.email}
            </div>
          )}
          <button
            onClick={confirmClick(onLogout, "Log out of your account?")}
            style={{ ...styles.navBtn, width: "100%", justifyContent: "flex-start" }}
          >
            <LogOut size={16} strokeWidth={2} />
            Log out
          </button>
        </div>
      </aside>

      <main className="main-content" style={styles.main}>
        {/* Frozen header — stays pinned to the top of the scroll area on every
            tab, so the Saving…/Saved indicator is always visible right where
            you're typing instead of scrolling out of view at the bottom of
            the sidebar. */}
        <div style={styles.mainTopBar}>
          <SaveStatus saveState={saveState} retrySave={retrySave} />
        </div>
        <div className="main-content-inner" style={styles.mainInner}>
          {tab === "dashboard" && <Dashboard data={data} />}
          {tab === "parties" && <PartyMaster data={data} persist={persist} markTyping={markTyping} />}
          {tab === "items" && <ItemMaster data={data} persist={persist} markTyping={markTyping} />}
          {tab === "backup" && <BackupRestore data={data} persist={persist} />}
          {tab === "settings" && <CompanySettings data={data} persist={persist} markTyping={markTyping} />}
          {tab === "delivery" && <DeliveryEntry data={data} persist={persist} markTyping={markTyping} />}
          {tab === "return" && <ReturnEntry data={data} persist={persist} markTyping={markTyping} />}
          {tab === "invoice" && <InvoiceBuilder data={data} persist={persist} markTyping={markTyping} />}
          {tab === "bulkInvoice" && <BulkInvoiceBuilder data={data} persist={persist} markTyping={markTyping} />}
          {tab === "archive" && <InvoiceArchive data={data} persist={persist} />}
          {tab === "ledger" && <PartyLedger data={data} persist={persist} markTyping={markTyping} />}
          {tab === "balances" && <PartyBalances data={data} />}
          {tab === "expenses" && <Expenses data={data} persist={persist} markTyping={markTyping} />}
          {tab === "recyclebin" && <RecycleBin data={data} persist={persist} />}
        </div>
      </main>

      {/* ---- Mobile bottom tab bar (hidden on desktop via CSS) ---- */}
      <nav className="bottom-nav">
        {[
          { id: "delivery", label: "Delivery", icon: Truck },
          { id: "return", label: "Return", icon: RotateCcw },
          { id: "invoice", label: "Invoice", icon: FileText },
          { id: "bulkInvoice", label: "Bulk Inv.", icon: Users },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={confirmClick(() => { setTab(t.id); setMoreOpen(false); }, "Are you sure?")}
            >
              <Icon size={19} strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
        <button
          className={moreOpen ? "active" : ""}
          onClick={confirmClick(() => setMoreOpen((v) => !v), "Are you sure?")}
        >
          <Menu size={19} strokeWidth={2} />
          More
        </button>
      </nav>

      {/* ---- "More" sheet: every remaining section ---- */}
      {moreOpen && (
        <>
          <div className="more-sheet-backdrop" onClick={confirmClick(() => setMoreOpen(false), "Are you sure?")} />
          <div className="more-sheet">
            <div className="grabber" />
            {nav
              .filter((n) => !["delivery", "return", "invoice", "bulkInvoice"].includes(n.id))
              .map((n) => {
                const Icon = n.icon;
                return (
                  <button
                    key={n.id}
                    className={tab === n.id ? "active" : ""}
                    onClick={confirmClick(() => { setTab(n.id); setMoreOpen(false); }, "Are you sure?")}
                  >
                    <Icon size={17} strokeWidth={2} />
                    {n.label}
                  </button>
                );
              })}
            <button onClick={confirmClick(onLogout, "Log out of your account?")}>
              <LogOut size={17} strokeWidth={2} />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Save status pill — shared by the frozen top bar (every tab). Pulled out
// so the "Saving… / Saved to cloud / Not saved" look is identical wherever
// it's shown.
function SaveStatus({ saveState, retrySave }) {
  return (
    <div style={styles.saveIndicator}>
      {saveState === "saving" && <span style={styles.saveDim}>Saving…</span>}
      {saveState === "saved" && (
        <span style={styles.saveOk}><CheckCircle2 size={13} /> Saved to cloud</span>
      )}
      {saveState === "error" && (
        <span style={{ color: "#e0745a", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={13} /> Not saved
          <button
            onClick={confirmClick(retrySave, "Retry saving now?")}
            style={{
              background: "transparent", border: "1px solid #e0745a", borderRadius: 4,
              color: "#e0745a", fontSize: 10.5, padding: "1px 6px", cursor: "pointer",
              fontFamily: "'Public Sans', system-ui, sans-serif",
            }}
          >
            Retry
          </button>
        </span>
      )}
      {saveState === "idle" && <span style={{ ...styles.saveDim, opacity: 0.5 }}>All changes saved</span>}
    </div>
  );
}

/* ---------------- computed stock helpers ---------------- */

function deliveredQty(data, partyId, itemId) {
  let total = 0;
  for (const c of data.deliveryChallans) {
    if (c.partyId !== partyId) continue;
    for (const l of c.lines) if (l.itemId === itemId) total += Number(l.qty) || 0;
  }
  return total;
}
function returnedQty(data, partyId, itemId) {
  let total = 0;
  for (const c of data.returnChallans) {
    if (c.partyId !== partyId) continue;
    for (const l of c.lines) if (l.itemId === itemId) total += Number(l.qty) || 0;
  }
  return total;
}
// Items still physically with a party — delivered but not yet returned.
// Shared by the Party Ledger tab and the invoice "Account Summary" section
// so both always agree on what's outstanding.
function partyRentedItems(data, partyId) {
  const itemIds = new Set();
  for (const c of data.deliveryChallans) {
    if (c.partyId !== partyId) continue;
    for (const l of c.lines) itemIds.add(l.itemId);
  }
  return [...itemIds]
    .map((itemId) => {
      const delivered = deliveredQty(data, partyId, itemId);
      const returned = returnedQty(data, partyId, itemId);
      return { itemId, delivered, returned, current: delivered - returned };
    })
    .filter((r) => r.current > 0)
    .sort((a, b) => b.current - a.current);
}

// Running invoiced / paid / balance-due totals for a party, as of whatever
// invoices currently exist in `data`. Shared by the Party Ledger tab and the
// invoice "Account Summary" section so the numbers never drift apart.
// Balance due starts from the party's Opening Balance (set once in Party
// Master, e.g. what they owed before this system was in use) and runs
// forward from there — openingBalance + invoiced − paid.
function partyLedgerTotals(data, partyId) {
  const party = data.parties.find((p) => p.id === partyId);
  const openingBalance = round2(Number(party?.openingBalance) || 0);
  const partyInvoices = data.invoices.filter((i) => i.partyId === partyId);
  const partyPayments = (data.payments || []).filter((p) => p.partyId === partyId);
  const invoiced = round2(partyInvoices.reduce((s, i) => s + i.netTotal, 0));
  const paid = round2(partyPayments.reduce((s, p) => s + p.amount, 0));
  return {
    openingBalance,
    invoiced,
    brokenCharges: round2(partyInvoices.reduce((s, i) => s + (i.brokenTotal || 0), 0)),
    invoiceCount: partyInvoices.length,
    paid,
    balanceDue: round2(openingBalance + invoiced - paid),
  };
}

function challanDeliveredQty(data, challanId, itemId) {
  const c = data.deliveryChallans.find((x) => x.id === challanId);
  if (!c) return 0;
  return c.lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + (Number(l.qty) || 0), 0);
}
function challanReturnedQty(data, challanId, itemId, excludeReturnId) {
  let total = 0;
  for (const c of data.returnChallans) {
    if (excludeReturnId && c.id === excludeReturnId) continue;
    for (const l of c.lines) {
      if (l.againstChallanId === challanId && l.itemId === itemId) total += Number(l.qty) || 0;
    }
  }
  return total;
}
function pendingChallans(data, partyId, itemId, excludeReturnId) {
  const list = [];
  for (const c of data.deliveryChallans) {
    if (c.partyId !== partyId) continue;
    const delivered = challanDeliveredQty(data, c.id, itemId);
    if (delivered <= 0) continue;
    const pending = delivered - challanReturnedQty(data, c.id, itemId, excludeReturnId);
    if (pending > 0) list.push({ challanId: c.id, challanNo: c.challanNo, date: c.date, pending });
  }
  return list;
}
function partyItemPairs(data) {
  const key = (p, i) => `${p}||${i}`;
  const seen = new Map();
  for (const c of data.deliveryChallans) {
    for (const l of c.lines) {
      const k = key(c.partyId, l.itemId);
      if (!seen.has(k)) seen.set(k, { partyId: c.partyId, itemId: l.itemId });
    }
  }
  return [...seen.values()];
}
function itemName(data, id) {
  return data.items.find((i) => i.id === id)?.name || "—";
}
function itemCode(data, id) {
  return data.items.find((i) => i.id === id)?.code || "—";
}
function daysBetween(start, end) {
  // Inclusive day count (e.g. 01-06 to 25-06 = 25 days) — the return/end date itself
  // is counted as a rental day. Uses local copies so the caller's original Date
  // objects (e.g. a shared billEnd reused elsewhere in the invoice engine) are
  // never mutated as a side effect of this calculation.
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / 86400000) + 1;
}
function fmtDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Core invoice engine — mirrors the original workbook's three-block "Calculation Detail"
// formula engine exactly (verified cell-by-cell against Calculation Detail / Calculation
// Engine / Retail Invoice):
//   Block 1 "Returned"    — one line per return event whose return date falls inside this
//                            invoice's billing window; billed delivery-date → return-date
//                            (both clipped to the window). Service charge applies ONLY here.
//   Block 2 "Outstanding" — one line per delivery line for whatever quantity is still not
//                            returned as of Billing End Date (net of every return on record
//                            up to that date, not just this window); billed delivery-date →
//                            Billing End Date. No service charge.
//   Block 3 "Broken"      — one one-time charge line per return line that recorded a broken
//                            quantity, equal to Broken Qty × Broken Rate, included when its
//                            return date falls inside the billing window.
// Transport Charge & Deposit are charged once, keyed to the delivery challan's own date
// falling inside this billing window — not to which challans happen to have billed lines.
function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeInvoiceLines(data, partyId, billStartStr, billEndStr) {
  const billStart = new Date(billStartStr);
  const billEnd = new Date(billEndStr);
  const lines = [];

  // ---- Block 1 (Returned) + Block 3 (Broken charge) — driven by Return Entry rows ----
  for (const rc of data.returnChallans) {
    if (rc.partyId !== partyId) continue;
    const returnDate = new Date(rc.date);
    const returnInWindow = returnDate >= billStart && returnDate <= billEnd;

    for (const rl of rc.lines) {
      const dc = data.deliveryChallans.find((x) => x.id === rl.againstChallanId);
      if (!dc) continue;
      const deliveryDate = new Date(dc.date);
      const item = data.items.find((i) => i.id === rl.itemId);
      if (!item) continue;
      const feet = parseFeet(item.name);

      if (returnInWindow && deliveryDate <= billEnd && rl.qty > 0) {
        const segStart = deliveryDate > billStart ? deliveryDate : billStart;
        const segEnd = returnDate < billEnd ? returnDate : billEnd;
        const days = daysBetween(segStart, segEnd);
        if (days > 0) {
          const amount = feet ? rl.qty * feet * item.dailyRate * days : rl.qty * item.dailyRate * days;
          const serviceCharge = feet ? rl.qty * feet * item.serviceCharge : rl.qty * item.serviceCharge;
          lines.push({
            kind: "returned",
            challanId: dc.id,
            challanNo: dc.challanNo,
            itemId: item.id,
            itemName: item.name,
            feet,
            qty: rl.qty,
            rate: item.dailyRate,
            start: fmtDate(segStart),
            end: fmtDate(segEnd),
            days,
            amount: round2(amount),
            returned: true,
          });
          if (serviceCharge > 0) {
            lines.push({
              kind: "service",
              challanId: dc.id,
              challanNo: dc.challanNo,
              itemId: item.id,
              itemName: `Service Charge - ${item.name}`,
              feet,
              qty: rl.qty,
              rate: item.serviceCharge,
              start: "",
              end: "",
              days: "",
              amount: round2(serviceCharge),
              returned: false,
              service: true,
            });
          }
        }
      }

      if (returnInWindow && Number(rl.brokenQty) > 0 && Number(rl.brokenRate) > 0) {
        lines.push({
          kind: "broken",
          challanId: dc.id,
          challanNo: dc.challanNo,
          itemId: item.id,
          itemName: `Broken Charge - ${item.name}`,
          feet: null,
          qty: Number(rl.brokenQty),
          rate: Number(rl.brokenRate),
          start: fmtDate(returnDate),
          end: fmtDate(returnDate),
          days: 1,
          amount: round2(Number(rl.brokenQty) * Number(rl.brokenRate)),
          returned: false,
          broken: true,
        });
      }
    }
  }

  // ---- Block 2 (Outstanding) — driven by Delivery Entry rows ----
  for (const c of data.deliveryChallans) {
    if (c.partyId !== partyId) continue;
    const deliveryDate = new Date(c.date);
    if (deliveryDate > billEnd) continue;

    for (const l of c.lines) {
      const item = data.items.find((i) => i.id === l.itemId);
      if (!item) continue;
      const feet = parseFeet(item.name);

      let returnedToDate = 0;
      for (const rc of data.returnChallans) {
        if (rc.partyId !== partyId) continue;
        if (new Date(rc.date) > billEnd) continue;
        for (const rl of rc.lines) {
          if (rl.againstChallanId === c.id && rl.itemId === l.itemId) returnedToDate += Number(rl.qty) || 0;
        }
      }
      const outstandingQty = Math.max(0, (Number(l.qty) || 0) - returnedToDate);
      if (outstandingQty <= 0) continue;

      const segStart = deliveryDate > billStart ? deliveryDate : billStart;
      const days = daysBetween(segStart, billEnd);
      if (days <= 0) continue;
      const amount = feet ? outstandingQty * feet * item.dailyRate * days : outstandingQty * item.dailyRate * days;
      lines.push({
        kind: "outstanding",
        challanId: c.id,
        challanNo: c.challanNo,
        itemId: item.id,
        itemName: item.name,
        feet,
        qty: outstandingQty,
        rate: item.dailyRate,
        start: fmtDate(segStart),
        end: fmtDate(billEnd),
        days,
        amount: round2(amount),
        returned: false,
      });
    }
  }

  // Line order matches the original workbook: grouped by item (in Item Master
  // order), then by date within an item. Broken-charge and Service-charge
  // lines always sort last (in that group, by item order), since they don't
  // have their own date the way rent/outstanding lines do.
  const itemIndex = new Map(data.items.map((it, idx) => [it.id, idx]));
  lines.sort((a, b) => {
    const aLast = a.kind === "broken" || a.kind === "service";
    const bLast = b.kind === "broken" || b.kind === "service";
    if (aLast !== bLast) return aLast ? 1 : -1;
    const ai = itemIndex.get(a.itemId) ?? 999999;
    const bi = itemIndex.get(b.itemId) ?? 999999;
    if (ai !== bi) return ai - bi;
    if (!aLast) return new Date(a.start) - new Date(b.start);
    return 0;
  });

  // Transport & deposit: once per delivery challan, keyed to its own date falling in this window
  let transportTotal = 0;
  let depositTotal = 0;
  for (const c of data.deliveryChallans) {
    if (c.partyId !== partyId) continue;
    const d = new Date(c.date);
    if (d >= billStart && d <= billEnd) {
      transportTotal += Number(c.transportCharge) || 0;
      depositTotal += Number(c.deposit) || 0;
    }
  }

  const itemRentTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const serviceTotal = round2(lines.filter((l) => l.kind === "service").reduce((s, l) => s + l.amount, 0));
  const brokenTotal = round2(lines.filter((l) => l.kind === "broken").reduce((s, l) => s + l.amount, 0));
  const additionalCharges = round2(transportTotal);
  const netTotal = round2(itemRentTotal + additionalCharges - depositTotal);

  return { lines, itemRentTotal, serviceTotal, brokenTotal, transportTotal, depositTotal, additionalCharges, netTotal };
}

// GST is calculated on the taxable value (item rent + service + transport charges) —
// the refundable security deposit is NOT part of the taxable value and is deducted
// after tax, same as before. Rate is fixed at 18% (9% CGST + 9% SGST for same-state
// parties, or 18% IGST for out-of-state parties), driven by the party's own GST
// settings in Party Master.
const GST_RATE = 18;
function computeGst(party, taxableValue) {
  const tv = round2(taxableValue);
  if (!party || !party.requiresGst || tv <= 0) {
    return { applicable: false, rate: 0, gstType: null, taxableValue: tv, cgst: 0, sgst: 0, igst: 0, totalGst: 0, grandTotal: tv };
  }
  const gstType = party.gstType === "IGST" ? "IGST" : "CGST_SGST";
  const totalGst = round2(tv * (GST_RATE / 100));
  if (gstType === "IGST") {
    return { applicable: true, rate: GST_RATE, gstType, taxableValue: tv, cgst: 0, sgst: 0, igst: totalGst, totalGst, grandTotal: round2(tv + totalGst) };
  }
  const cgst = round2(totalGst / 2);
  const sgst = round2(totalGst - cgst);
  return { applicable: true, rate: GST_RATE, gstType, taxableValue: tv, cgst, sgst, igst: 0, totalGst, grandTotal: round2(tv + totalGst) };
}

function partyName(data, id) {
  return data.parties.find((p) => p.id === id)?.name || "—";
}
function partyCode(data, id) {
  return data.parties.find((p) => p.id === id)?.code || "—";
}

/* ---------------- Dashboard ---------------- */

const DASHBOARD_REPORT_LABELS = {
  "dashboard-rented": "Rented Stock",
  "dashboard-depot": "Depot Stock",
  "dashboard-pending": "Pending Challan Stock",
};

function Dashboard({ data }) {
  const [filterPartyId, setFilterPartyId] = useState("");
  // Which report (if any) is currently being turned into a PDF — used to
  // disable/relabel the triggering button so a second tap can't overlap it.
  const [exportingKey, setExportingKey] = useState(null);

  // Renders the matching print-portal to a PDF and downloads it directly.
  // See exportPortalToPdf's comment near the top of the file for why we
  // generate the PDF ourselves instead of using window.print().
  const triggerPrint = async (key, portalClass) => {
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const scope = filterPartyId ? partyName(data, filterPartyId) : "All Parties";
      const today = fmtDateDisplay(new Date().toISOString().slice(0, 10));
      const filename = `${sanitizeForFilename(DASHBOARD_REPORT_LABELS[key] || key)} - ${sanitizeForFilename(scope)} - ${sanitizeForFilename(today)}`;
      await exportPortalToPdf(portalClass, filename);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setExportingKey(null);
    }
  };

  // Unfiltered — used for depot math, which must always reflect every party.
  const allRented = useMemo(() => {
    return partyItemPairs(data).map((pair) => {
      const del = deliveredQty(data, pair.partyId, pair.itemId);
      const ret = returnedQty(data, pair.partyId, pair.itemId);
      return { ...pair, delivered: del, returned: ret, current: del - ret };
    });
  }, [data]);

  // Filtered — what's actually shown in the "Party-wise Rented Stock" table.
  const rented = useMemo(() => {
    return (filterPartyId ? allRented.filter((r) => r.partyId === filterPartyId) : allRented)
      .slice()
      .sort((a, b) => b.current - a.current);
  }, [allRented, filterPartyId]);

  const depotAvailable = useMemo(() => {
    return data.items.map((it) => {
      const rentedOut = allRented.filter((r) => r.itemId === it.id).reduce((s, r) => s + r.current, 0);
      return { ...it, rentedOut, available: (Number(it.totalDepotStock) || 0) - rentedOut };
    });
  }, [data, allRented]);

  const pendingChallanRows = useMemo(() => {
    const rows = [];
    for (const c of data.deliveryChallans) {
      if (filterPartyId && c.partyId !== filterPartyId) continue;
      const itemIds = [...new Set(c.lines.map((l) => l.itemId))];
      for (const itemId of itemIds) {
        const delivered = challanDeliveredQty(data, c.id, itemId);
        const returned = challanReturnedQty(data, c.id, itemId);
        const pending = delivered - returned;
        if (pending > 0) {
          rows.push({ challanNo: c.challanNo, date: c.date, partyId: c.partyId, itemId, pending });
        }
      }
    }
    return rows;
  }, [data, filterPartyId]);

  return (
    <div>
      <PageHeader title="Stock Dashboard" subtitle="Live position across every party and item — recalculated from every delivery and return entered." />

      <div style={styles.statRow}>
        <StatCard label="Parties" value={data.parties.length} />
        <StatCard label="Items" value={data.items.length} />
        <StatCard label="Open delivery challans" value={data.deliveryChallans.length} />
        <StatCard label="Return challans logged" value={data.returnChallans.length} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <PartyFilter parties={data.parties} value={filterPartyId} onChange={setFilterPartyId} />
      </div>

      <div className="grid2" style={styles.grid2}>
        {(() => {
          const rentedContent = (
            <>
              <div style={styles.invoiceLetterhead}>
                <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
                <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
                <div style={styles.invoiceAddress}>{(data.company || DEFAULT_COMPANY).address}</div>
                <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>
                  PARTY-WISE RENTED STOCK{filterPartyId ? ` — ${partyName(data, filterPartyId)}` : " — ALL PARTIES"}
                </div>
              </div>
              <Panel title="Party-wise Rented Stock" hint={filterPartyId ? "Delivered − Returned, filtered to the selected party" : "Delivered − Returned, per party & item"}>
                {rented.length === 0 ? (
                  <Empty text={filterPartyId ? "No delivery entries for this party." : "No delivery entries yet."} />
                ) : (
                  <Table
                    cols={["Party", "Item", "Delivered", "Returned", "Currently Rented"]}
                    rows={rented.map((r) => [
                      `${partyCode(data, r.partyId)} — ${partyName(data, r.partyId)}`,
                      `${itemCode(data, r.itemId)} — ${itemName(data, r.itemId)}`,
                      r.delivered,
                      r.returned,
                      <strong style={{ color: r.current > 0 ? "var(--amber)" : "var(--muted)" }}>{r.current}</strong>,
                    ])}
                  />
                )}
              </Panel>
            </>
          );
          return (
            <div>
              <div className="no-print" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
                <button style={styles.ghostBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("dashboard-rented", "print-portal--dashboard-rented"), "Generate and download the PDF?")}>
                  <Printer size={13} /> {exportingKey === "dashboard-rented" ? "Generating…" : "Download PDF"}
                </button>
              </div>
              {rentedContent}
              <PrintPortal extraClass="print-portal--dashboard-rented">{rentedContent}</PrintPortal>
            </div>
          );
        })()}

        {(() => {
          const depotContent = (
            <>
              <div style={styles.invoiceLetterhead}>
                <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
                <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
                <div style={styles.invoiceAddress}>{(data.company || DEFAULT_COMPANY).address}</div>
                <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>DEPOT STOCK AVAILABLE</div>
              </div>
              <Panel title="Depot Stock Available" hint="Total owned − currently rented to all parties">
                {depotAvailable.length === 0 ? (
                  <Empty text="Add items in Item Master first." />
                ) : (
                  <Table
                    cols={["Item", "Total Depot Stock", "Rented Out", "Available"]}
                    rows={depotAvailable.map((it) => [
                      `${it.code} — ${it.name}`,
                      it.totalDepotStock,
                      it.rentedOut,
                      <strong style={{ color: it.available < 0 ? "var(--danger)" : "var(--ink)" }}>{it.available}</strong>,
                    ])}
                  />
                )}
              </Panel>
            </>
          );
          return (
            <div>
              <div className="no-print" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
                <button style={styles.ghostBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("dashboard-depot", "print-portal--dashboard-depot"), "Generate and download the PDF?")}>
                  <Printer size={13} /> {exportingKey === "dashboard-depot" ? "Generating…" : "Download PDF"}
                </button>
              </div>
              {depotContent}
              <PrintPortal extraClass="print-portal--dashboard-depot">{depotContent}</PrintPortal>
            </div>
          );
        })()}
      </div>

      {(() => {
        const pendingContent = (
          <>
            <div style={styles.invoiceLetterhead}>
              <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
              <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
              <div style={styles.invoiceAddress}>{(data.company || DEFAULT_COMPANY).address}</div>
              <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>
                PENDING CHALLAN STOCK{filterPartyId ? ` — ${partyName(data, filterPartyId)}` : " — ALL PARTIES"}
              </div>
            </div>
            <Panel title="Pending Challan Stock" hint={filterPartyId ? "Per delivery challan, quantity not yet returned — filtered to the selected party" : "Per delivery challan, quantity not yet returned"}>
              {pendingChallanRows.length === 0 ? (
                <Empty text={filterPartyId ? "Nothing outstanding for this party." : "Nothing outstanding — every challan fully returned."} />
              ) : (
                <Table
                  cols={["Challan No.", "Date", "Party", "Item", "Pending Qty"]}
                  rows={pendingChallanRows.map((r) => [
                    r.challanNo,
                    fmtDateDisplay(r.date),
                    partyName(data, r.partyId),
                    itemName(data, r.itemId),
                    <strong>{r.pending}</strong>,
                  ])}
                />
              )}
            </Panel>
          </>
        );
        return (
          <div>
            <div className="no-print" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
              <button style={styles.ghostBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("dashboard-pending", "print-portal--dashboard-pending"), "Generate and download the PDF?")}>
                <Printer size={13} /> {exportingKey === "dashboard-pending" ? "Generating…" : "Download PDF"}
              </button>
            </div>
            {pendingContent}
            <PrintPortal extraClass="print-portal--dashboard-pending">{pendingContent}</PrintPortal>
          </div>
        );
      })()}
    </div>
  );
}

/* ----------------------------------------------------------------
   DRAFT AUTOSAVE
   A form that isn't submitted yet (you're still typing) is NOT a
   real record — saving it straight into data.parties/items/etc. on
   every keystroke would risk writing half-finished entries into
   your real business data. Instead, in-progress typing is saved
   into a separate `data.drafts[key]` bucket in the same cloud
   record, debounced ~700ms after you stop typing. It shows the same
   "Saving…" / "Saved to cloud" indicator, but only becomes a real
   Party/Item/etc. record when you click Add/Save as before.
   ---------------------------------------------------------------- */
function useDraftForm(key, blank, data, persist, markTyping) {
  const initial = (data.drafts && data.drafts[key]) || blank;
  const [form, setFormRaw] = useState(initial);
  const debounceRef = useRef(null);

  const setForm = useCallback(
    (next) => {
      setFormRaw(next);
      markTyping(); // "Saving…" the instant you type, not just once the debounce below fires
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        persist({ ...data, drafts: { ...(data.drafts || {}), [key]: next } });
      }, 700);
    },
    [data, persist, key, markTyping]
  );

  // `data.drafts` with this form's entry removed — merge this into any
  // payload you're about to persist() so the draft is cleared in the SAME
  // write as the real save, instead of a second write racing right after
  // it (which could clobber the record you just added, since that second
  // write's own `data` closure predates the save).
  const clearedDrafts = useCallback(() => {
    const next = { ...(data.drafts || {}) };
    delete next[key];
    return next;
  }, [data.drafts, key]);

  // Resets the on-screen form only — no persist call of its own. Use this
  // right after you've already persist()ed a real save (with clearedDrafts()
  // merged into that same payload), so the visible form goes blank without
  // firing a second, stale write.
  const resetFormLocal = useCallback(
    (overrideBlank) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setFormRaw(overrideBlank !== undefined ? overrideBlank : blank);
    },
    [blank]
  );

  // Standalone reset for when nothing else is being saved in the same
  // action (e.g. a Cancel button): resets the form AND immediately
  // persists the drafts-cleared state.
  const resetForm = useCallback(
    (overrideBlank) => {
      resetFormLocal(overrideBlank);
      persist({ ...data, drafts: clearedDrafts() });
    },
    [data, persist, clearedDrafts, resetFormLocal]
  );

  return [form, setForm, resetForm, resetFormLocal, clearedDrafts];
}

/* ---------------- Party Master ---------------- */

function PartyMaster({ data, persist, markTyping }) {
  const blank = { name: "", address: "", siteName: "", phone: "", references: [""], gstin: "", requiresGst: false, gstType: "CGST_SGST" };
  const [form, setForm, resetForm, resetFormLocal, clearedDrafts] = useDraftForm("partyForm", blank, data, persist, markTyping);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const add = () => {
    if (!form.name.trim()) return;
    // Opening Balance is edited from the Party Ledger tab, not here — so it's
    // deliberately left out of this payload to avoid overwriting it on every save.
    const payload = { ...form };
    let next;
    if (editingId) {
      next = { ...data, parties: data.parties.map((p) => (p.id === editingId ? { ...p, ...payload } : p)) };
      setEditingId(null);
    } else {
      const code = uid("P", data.seq.party);
      next = {
        ...data,
        parties: [...data.parties, { id: crypto.randomUUID(), code, ...payload }],
        seq: { ...data.seq, party: data.seq.party + 1 },
      };
    }
    // Draft-clear rides along in this same write, not a separate one.
    persist({ ...next, drafts: clearedDrafts() });
    resetFormLocal();
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      address: p.address || "",
      siteName: p.siteName || "",
      phone: p.phone || "",
      references: p.references?.length ? p.references : (p.reference ? [p.reference] : [""]),
      gstin: p.gstin || "",
      requiresGst: !!p.requiresGst,
      gstType: p.gstType || "CGST_SGST",
    });
  };
  const cancelEdit = () => { setEditingId(null); resetForm(); };

  const remove = (id) => {
    const party = data.parties.find((p) => p.id === id);
    if (!party) return;
    if (editingId === id) cancelEdit();
    moveToBin(data, persist, "party", party, `${party.code} — ${party.name}`);
    setConfirmDeleteId(null);
  };

  return (
    <div>
      <PageHeader title="Party Master" subtitle="Codes are permanent. Rename freely — every past entry follows the new name automatically." />
      <Panel title={editingId ? "Edit Party (code stays fixed)" : "Add Party"}>
        <div className="form-row" style={styles.formRow}>
          <Field label="Party Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Site Name" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </div>
        <div className="form-row" style={styles.formRow}>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} wide />
          <div style={{ ...styles.field, minWidth: 220 }}>
            <span style={styles.fieldLabel}>References</span>
            {(form.references || [""]).map((ref, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  value={ref}
                  placeholder={`Reference ${idx + 1}`}
                  onChange={(e) => {
                    const refs = [...(form.references || [""])];
                    refs[idx] = e.target.value;
                    setForm({ ...form, references: refs });
                  }}
                />
                {(form.references || [""]).length > 1 && (
                  <button
                    style={{ ...styles.iconBtn, color: COLORS.danger }}
                    onClick={confirmClick(() => {
                      const refs = (form.references || [""]).filter((_, i) => i !== idx);
                      setForm({ ...form, references: refs });
                    }, "Are you sure?")}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <button
              style={{ ...styles.ghostBtn, marginTop: 2, fontSize: 11.5 }}
              onClick={confirmClick(() => setForm({ ...form, references: [...(form.references || [""]), ""] }), "Are you sure?")}
            >
              <Plus size={12} /> Add Reference
            </button>
          </div>
        </div>
        <div className="form-row" style={styles.formRow}>
          <label style={{ ...styles.field, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 160 }}>
            <input
              type="checkbox"
              checked={form.requiresGst}
              onChange={(e) => setForm({ ...form, requiresGst: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            <span style={styles.fieldLabel}>Requires GST Bill</span>
          </label>
          {form.requiresGst && (
            <>
              <SelectField
                label="Tax Type"
                value={form.gstType}
                onChange={(v) => setForm({ ...form, gstType: v })}
                options={[
                  { value: "CGST_SGST", label: "CGST + SGST (same state)" },
                  { value: "IGST", label: "IGST (other state)" },
                ]}
              />
              <Field label="Party GSTIN" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v })} placeholder="e.g. 24ABCDE1234F1Z5" />
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.primaryBtn} onClick={confirmClick(add, "Add this record?")}>
            {editingId ? <><CheckCircle2 size={15} /> Save Changes</> : <><Plus size={15} /> Add Party</>}
          </button>
          {editingId && <button style={styles.ghostBtn} onClick={confirmClick(cancelEdit, "Cancel editing and discard changes?")}>Cancel</button>}
        </div>
      </Panel>

      <Panel title={`All Parties (${data.parties.length})`}>
        {data.parties.length === 0 ? (
          <Empty text="No parties yet — add one above." />
        ) : (
          <Table
            cols={["Code", "Name", "Site", "Phone", "References", "GST", ""]}
            rows={data.parties.map((p) => [
              <span style={styles.codeTag}>{p.code}</span>,
              p.name,
              p.siteName || "—",
              p.phone || "—",
              (() => {
                const refs = p.references?.filter(Boolean) || (p.reference ? [p.reference] : []);
                return refs.length ? refs.join(", ") : "—";
              })(),
              p.requiresGst
                ? <span style={styles.tinyTag}>{p.gstType === "IGST" ? "IGST 18%" : "CGST+SGST 18%"}</span>
                : <span style={{ color: COLORS.muted, fontSize: 12 }}>—</span>,
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.ghostBtn} onClick={confirmClick(() => startEdit(p), "Edit this record?")}>Edit</button>
                <ConfirmDelete
                  id={p.id}
                  confirmId={confirmDeleteId}
                  setConfirmId={setConfirmDeleteId}
                  onConfirm={remove}
                  label="Move to bin?"
                  title="Delete party"
                />
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Item Master ---------------- */

function ItemMaster({ data, persist, markTyping }) {
  const blank = { name: "", dailyRate: "", serviceCharge: "", totalDepotStock: "" };
  const [form, setForm, resetForm, resetFormLocal, clearedDrafts] = useDraftForm("itemForm", blank, data, persist, markTyping);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const add = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      dailyRate: Number(form.dailyRate) || 0,
      serviceCharge: Number(form.serviceCharge) || 0,
      totalDepotStock: Number(form.totalDepotStock) || 0,
    };
    let next;
    if (editingId) {
      next = { ...data, items: data.items.map((i) => (i.id === editingId ? { ...i, ...payload } : i)) };
      setEditingId(null);
    } else {
      const code = uid("I", data.seq.item);
      next = {
        ...data,
        items: [...data.items, { id: crypto.randomUUID(), code, ...payload }],
        seq: { ...data.seq, item: data.seq.item + 1 },
      };
    }
    persist({ ...next, drafts: clearedDrafts() });
    resetFormLocal();
  };

  const startEdit = (it) => {
    setEditingId(it.id);
    setForm({ name: it.name, dailyRate: it.dailyRate, serviceCharge: it.serviceCharge, totalDepotStock: it.totalDepotStock });
  };
  const cancelEdit = () => { setEditingId(null); resetForm(); };

  const remove = (id) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) return;
    if (editingId === id) cancelEdit();
    moveToBin(data, persist, "item", item, `${item.code} — ${item.name}`);
    setConfirmDeleteId(null);
  };

  return (
    <div>
      <PageHeader title="Item Master" subtitle={'Add "ft" to the item name (e.g. "chavi 8ft") to mark it as a running-feet item.'} />
      <Panel title={editingId ? "Edit Item (code stays fixed)" : "Add Item"}>
        <div className="form-row" style={styles.formRow}>
          <Field label="Item Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. chavi 8ft" />
          <Field label="Daily Rate" value={form.dailyRate} onChange={(v) => setForm({ ...form, dailyRate: v })} type="number" />
          <Field label="Service Charge / unit" value={form.serviceCharge} onChange={(v) => setForm({ ...form, serviceCharge: v })} type="number" />
          <Field label="Total Depot Stock" value={form.totalDepotStock} onChange={(v) => setForm({ ...form, totalDepotStock: v })} type="number" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.primaryBtn} onClick={confirmClick(add, "Add this record?")}>
            {editingId ? <><CheckCircle2 size={15} /> Save Changes</> : <><Plus size={15} /> Add Item</>}
          </button>
          {editingId && <button style={styles.ghostBtn} onClick={confirmClick(cancelEdit, "Cancel editing and discard changes?")}>Cancel</button>}
        </div>
      </Panel>

      <Panel title={`All Items (${data.items.length})`}>
        {data.items.length === 0 ? (
          <Empty text="No items yet — add one above." />
        ) : (
          <Table
            cols={["Code", "Name", "Unit", "Daily Rate", "Service Charge", "Depot Stock", ""]}
            rows={data.items.map((it) => {
              const feet = parseFeet(it.name);
              return [
                <span style={styles.codeTag}>{it.code}</span>,
                it.name,
                feet ? `Running Ft./Day (${feet}ft)` : "Nos.",
                it.dailyRate,
                it.serviceCharge,
                it.totalDepotStock,
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.ghostBtn} onClick={confirmClick(() => startEdit(it), "Edit this record?")}>Edit</button>
                  <ConfirmDelete
                    id={it.id}
                    confirmId={confirmDeleteId}
                    setConfirmId={setConfirmDeleteId}
                    onConfirm={remove}
                    label="Move to bin?"
                    title="Delete item"
                  />
                </div>,
              ];
            })}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Delivery Entry ---------------- */

function DeliveryEntry({ data, persist, markTyping }) {
  const emptyHeader = {
    date: new Date().toISOString().slice(0, 10),
    partyId: "",
    siteAddress: "",
    driverName: "",
    vehicleNumber: "",
    transportCharge: "",
    deposit: "",
  };
  const emptyLines = [{ itemId: "", qty: "", rate: "" }];
  const blankForm = { header: emptyHeader, lines: emptyLines, challanNoInput: String(data.seq.delivery) };
  const [form, setForm, resetForm, resetFormLocal, clearedDrafts] = useDraftForm("deliveryForm", blankForm, data, persist, markTyping);
  const { header, lines, challanNoInput } = form;
  const setHeader = (h) => setForm({ ...form, header: h });
  const setLines = (l) => setForm({ ...form, lines: l });
  const setChallanNoInput = (v) => setForm({ ...form, challanNoInput: v });

  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState("date"); // "date" | "updated"
  const [filterPartyId, setFilterPartyId] = useState("");

  const setLine = (idx, patch) => {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    if (patch.itemId) {
      const it = data.items.find((i) => i.id === patch.itemId);
      if (it) next[idx].rate = it.dailyRate;
    }
    setLines(next);
  };
  const addLine = () => setLines([...lines, { itemId: "", qty: "", rate: "" }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));

  const canSave = header.partyId && lines.some((l) => l.itemId && Number(l.qty) > 0);

  const startEdit = (c) => {
    setEditingId(c.id);
    setForm({
      ...form,
      challanNoInput: String(c.challanNo),
      header: {
        date: c.date,
        partyId: c.partyId,
        siteAddress: c.siteAddress || "",
        driverName: c.driverName || "",
        vehicleNumber: c.vehicleNumber || "",
        transportCharge: c.transportCharge || "",
        deposit: c.deposit || "",
      },
      lines: c.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, rate: l.rate })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm({ header: emptyHeader, lines: emptyLines, challanNoInput: String(data.seq.delivery) });
  };

  const removeChallan = (id) => {
    const c = data.deliveryChallans.find((x) => x.id === id);
    if (!c) return;
    if (editingId === c.id) cancelEdit();
    moveToBin(data, persist, "delivery", c, `${c.challanNo} — ${partyName(data, c.partyId)}`);
    setConfirmDeleteId(null);
  };

  const sortedChallans = useMemo(() => {
    const list = filterPartyId ? data.deliveryChallans.filter((c) => c.partyId === filterPartyId) : [...data.deliveryChallans];
    if (sortBy === "updated") {
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    } else {
      list.sort((a, b) => new Date(b.date) - new Date(a.date) || b.challanNo - a.challanNo);
    }
    return list;
  }, [data.deliveryChallans, sortBy, filterPartyId]);

  const save = () => {
    if (!canSave) return;
    const cleanLines = lines
      .filter((l) => l.itemId && Number(l.qty) > 0)
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty), rate: Number(l.rate) || 0 }));

    let next;
    const now = new Date().toISOString();
    const challanNo = Number(challanNoInput) || data.seq.delivery;
    if (editingId) {
      next = {
        ...data,
        deliveryChallans: data.deliveryChallans.map((c) =>
          c.id === editingId
            ? { ...c, ...header, challanNo, transportCharge: Number(header.transportCharge) || 0, deposit: Number(header.deposit) || 0, lines: cleanLines, updatedAt: now }
            : c
        ),
        // Keep the auto-suggested next number ahead of whatever was typed,
        // so future new challans don't collide with a manually raised number.
        seq: { ...data.seq, delivery: Math.max(data.seq.delivery, challanNo + 1) },
      };
    } else {
      next = {
        ...data,
        deliveryChallans: [
          ...data.deliveryChallans,
          {
            id: crypto.randomUUID(),
            challanNo,
            ...header,
            transportCharge: Number(header.transportCharge) || 0,
            deposit: Number(header.deposit) || 0,
            lines: cleanLines,
            createdAt: now,
            updatedAt: now,
          },
        ],
        seq: { ...data.seq, delivery: Math.max(data.seq.delivery, challanNo) + 1 },
      };
    }
    persist({ ...next, drafts: clearedDrafts() });
    setEditingId(null);
    resetFormLocal({ header: emptyHeader, lines: emptyLines, challanNoInput: String(next.seq.delivery) });
  };

  const duplicateChallanNo = data.deliveryChallans.some(
    (c) => c.challanNo === Number(challanNoInput) && c.id !== editingId
  );

  return (
    <div>
      <PageHeader title="Delivery Entry" subtitle="One challan, one or more items. Transport charge & deposit apply once per challan." />

      <Panel title={editingId ? `Editing Delivery Challan No. ${data.deliveryChallans.find((c) => c.id === editingId)?.challanNo ?? ""}` : "New Delivery Challan"}>
        {data.parties.length === 0 && <Notice text="Add at least one party in Party Master first." />}
        {duplicateChallanNo && <Notice text={`Challan No. ${challanNoInput} is already used by another delivery challan.`} />}
        <div className="form-row" style={styles.formRow}>
          <Field label="Challan No." type="number" value={challanNoInput} onChange={setChallanNoInput} />
          <Field label="Date" type="date" value={header.date} onChange={(v) => setHeader({ ...header, date: v })} />
          <SelectField
            label="Party"
            value={header.partyId}
            onChange={(v) => setHeader({ ...header, partyId: v })}
            options={data.parties.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
          <Field label="Site Address" value={header.siteAddress} onChange={(v) => setHeader({ ...header, siteAddress: v })} wide />
        </div>
        <div className="form-row" style={styles.formRow}>
          <Field label="Driver Name" value={header.driverName} onChange={(v) => setHeader({ ...header, driverName: v })} />
          <Field label="Vehicle Number" value={header.vehicleNumber} onChange={(v) => setHeader({ ...header, vehicleNumber: v })} />
          <Field label="Transport Charge" type="number" value={header.transportCharge} onChange={(v) => setHeader({ ...header, transportCharge: v })} />
          <Field label="Deposit" type="number" value={header.deposit} onChange={(v) => setHeader({ ...header, deposit: v })} />
        </div>

        <div className="line-header-row" style={styles.lineHeaderRow}>
          <span style={{ flex: 3 }}>Item</span>
          <span style={{ flex: 1 }}>Qty</span>
          <span style={{ flex: 1 }}>Rate</span>
          <span style={{ width: 32 }} />
        </div>
        {lines.map((l, idx) => (
          <div key={idx} className="line-row" style={styles.lineRow}>
            <select style={{ ...styles.select, flex: 3 }} value={l.itemId} onChange={(e) => setLine(idx, { itemId: e.target.value })}>
              <option value="">Select item…</option>
              {data.items.map((it) => (
                <option key={it.id} value={it.id}>{it.code} — {it.name}</option>
              ))}
            </select>
            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} />
            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Rate" value={l.rate} onChange={(e) => setLine(idx, { rate: e.target.value })} />
            <button style={styles.iconBtn} onClick={confirmClick(() => removeLine(idx), "Remove this line?")} disabled={lines.length === 1}><Trash2 size={14} /></button>
          </div>
        ))}
        <button style={styles.ghostBtn} onClick={confirmClick(addLine, "Add a new line?")}><Plus size={14} /> Add line</button>

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.5 }} disabled={!canSave} onClick={confirmClick(save, "Save this entry?")}>
            <CheckCircle2 size={15} /> {editingId ? "Update Challan" : "Save Challan"}
          </button>
          {editingId && (
            <button style={styles.ghostBtn} onClick={confirmClick(cancelEdit, "Cancel editing and discard changes?")}><X size={13} /> Cancel Edit</button>
          )}
        </div>
      </Panel>

      <Panel title={`Delivery Challans (${sortedChallans.length}${filterPartyId ? ` of ${data.deliveryChallans.length}` : ""})`}>
        {data.deliveryChallans.length === 0 ? (
          <Empty text="No deliveries recorded yet." />
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <SortToggle
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "date", label: "Sort: Challan Date" },
                  { value: "updated", label: "Sort: Last Changed" },
                ]}
                style={{ marginBottom: 12 }}
              />
              <PartyFilter parties={data.parties} value={filterPartyId} onChange={setFilterPartyId} />
            </div>
            {sortedChallans.length === 0 ? (
              <Empty text="No delivery challans for this party." />
            ) : (
            <Table
              cols={["Challan No.", "Date", "Party", "Items", "Last Changed", ""]}
              rows={sortedChallans.map((c) => [
                c.challanNo,
                fmtDateDisplay(c.date),
                partyName(data, c.partyId),
                c.lines.map((l) => `${itemName(data, l.itemId)} × ${l.qty}`).join(", "),
                fmtDateTime(c.updatedAt || c.createdAt),
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.iconBtn} onClick={confirmClick(() => startEdit(c), "Edit this record?")} title="Edit challan"><Pencil size={14} /></button>
                  <ConfirmDelete
                    id={c.id}
                    confirmId={confirmDeleteId}
                    setConfirmId={setConfirmDeleteId}
                    onConfirm={removeChallan}
                    label="Move to bin?"
                    title="Delete challan"
                  />
                </div>,
              ])}
            />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Return Entry ---------------- */

function ReturnEntry({ data, persist, markTyping }) {
  const emptyHeader = { date: new Date().toISOString().slice(0, 10), partyId: "" };
  const emptyLines = [{ itemId: "", againstChallanId: "", qty: "", brokenQty: "", brokenRate: "" }];
  const blankForm = { header: emptyHeader, lines: emptyLines, returnNoInput: String(data.seq.return) };
  const [form, setForm, resetForm, resetFormLocal, clearedDrafts] = useDraftForm("returnForm", blankForm, data, persist, markTyping);
  const { header, lines, returnNoInput } = form;
  const setHeader = (h) => setForm({ ...form, header: h });
  const setLines = (l) => setForm({ ...form, lines: l });
  const setReturnNoInput = (v) => setForm({ ...form, returnNoInput: v });

  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState("date"); // "date" | "updated"
  const [filterPartyId, setFilterPartyId] = useState("");

  const setLine = (idx, patch) => {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    if (patch.itemId) next[idx].againstChallanId = ""; // reset dependent dropdown
    setLines(next);
  };
  const addLine = () => setLines([...lines, { itemId: "", againstChallanId: "", qty: "", brokenQty: "", brokenRate: "" }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));

  const canSave = header.partyId && lines.some((l) => l.itemId && l.againstChallanId && Number(l.qty) > 0);

  const startEdit = (c) => {
    setEditingId(c.id);
    setForm({
      ...form,
      returnNoInput: String(c.returnChallanNo),
      header: { date: c.date, partyId: c.partyId },
      lines: c.lines.map((l) => ({ itemId: l.itemId, againstChallanId: l.againstChallanId, qty: l.qty, brokenQty: l.brokenQty, brokenRate: l.brokenRate })),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm({ header: emptyHeader, lines: emptyLines, returnNoInput: String(data.seq.return) });
  };

  const removeChallan = (id) => {
    const c = data.returnChallans.find((x) => x.id === id);
    if (!c) return;
    if (editingId === c.id) cancelEdit();
    moveToBin(data, persist, "return", c, `${c.returnChallanNo} — ${partyName(data, c.partyId)}`);
    setConfirmDeleteId(null);
  };

  const save = () => {
    if (!canSave) return;
    const cleanLines = lines
      .filter((l) => l.itemId && l.againstChallanId && Number(l.qty) > 0)
      .map((l) => ({
        itemId: l.itemId,
        againstChallanId: l.againstChallanId,
        qty: Number(l.qty),
        brokenQty: Number(l.brokenQty) || 0,
        brokenRate: Number(l.brokenRate) || 0,
      }));

    let next;
    const now = new Date().toISOString();
    const returnChallanNo = Number(returnNoInput) || data.seq.return;
    if (editingId) {
      next = {
        ...data,
        returnChallans: data.returnChallans.map((c) =>
          c.id === editingId ? { ...c, date: header.date, partyId: header.partyId, lines: cleanLines, returnChallanNo, updatedAt: now } : c
        ),
        seq: { ...data.seq, return: Math.max(data.seq.return, returnChallanNo + 1) },
      };
    } else {
      next = {
        ...data,
        returnChallans: [
          ...data.returnChallans,
          {
            id: crypto.randomUUID(),
            returnChallanNo,
            date: header.date,
            partyId: header.partyId,
            lines: cleanLines,
            createdAt: now,
            updatedAt: now,
          },
        ],
        seq: { ...data.seq, return: Math.max(data.seq.return, returnChallanNo) + 1 },
      };
    }
    persist({ ...next, drafts: clearedDrafts() });
    setEditingId(null);
    resetFormLocal({ header: emptyHeader, lines: emptyLines, returnNoInput: String(next.seq.return) });
  };

  const sortedChallans = useMemo(() => {
    const list = filterPartyId ? data.returnChallans.filter((c) => c.partyId === filterPartyId) : [...data.returnChallans];
    if (sortBy === "updated") {
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    } else {
      list.sort((a, b) => new Date(b.date) - new Date(a.date) || b.returnChallanNo - a.returnChallanNo);
    }
    return list;
  }, [data.returnChallans, sortBy, filterPartyId]);

  // items this party has ever received (for the item dropdown)
  const partyItems = useMemo(() => {
    if (!header.partyId) return [];
    const ids = new Set();
    for (const c of data.deliveryChallans) {
      if (c.partyId !== header.partyId) continue;
      for (const l of c.lines) ids.add(l.itemId);
    }
    return data.items.filter((i) => ids.has(i.id));
  }, [data, header.partyId]);

  const duplicateReturnNo = data.returnChallans.some(
    (c) => c.returnChallanNo === Number(returnNoInput) && c.id !== editingId
  );

  return (
    <div>
      <PageHeader title="Return Entry" subtitle="Pick the item first — the challan dropdown only shows delivery challans still pending for that party & item." />

      <Panel title={editingId ? `Editing Return Challan No. ${data.returnChallans.find((c) => c.id === editingId)?.returnChallanNo ?? ""}` : "New Return Challan"}>
        {duplicateReturnNo && <Notice text={`Return No. ${returnNoInput} is already used by another return challan.`} />}
        <div className="form-row" style={styles.formRow}>
          <Field label="Return No." type="number" value={returnNoInput} onChange={setReturnNoInput} />
          <Field label="Return Date" type="date" value={header.date} onChange={(v) => setHeader({ ...header, date: v })} />
          <SelectField
            label="Party"
            value={header.partyId}
            onChange={(v) => setHeader({ ...header, partyId: v })}
            options={data.parties.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
        </div>

        {header.partyId && partyItems.length === 0 && <Notice text="This party has no outstanding deliveries." />}

        {header.partyId && partyItems.length > 0 && (
          <>
            <div className="line-header-row" style={styles.lineHeaderRow}>
              <span style={{ flex: 2 }}>Item</span>
              <span style={{ flex: 2 }}>Against Challan (pending qty)</span>
              <span style={{ flex: 1 }}>Return Qty</span>
              <span style={{ flex: 1 }}>Broken Qty</span>
              <span style={{ flex: 1 }}>Broken Rate</span>
              <span style={{ width: 32 }} />
            </div>
            {lines.map((l, idx) => {
              const options = l.itemId ? pendingChallans(data, header.partyId, l.itemId, editingId) : [];
              return (
                <div key={idx} className="line-row" style={styles.lineRow}>
                  <select style={{ ...styles.select, flex: 2 }} value={l.itemId} onChange={(e) => setLine(idx, { itemId: e.target.value })}>
                    <option value="">Select item…</option>
                    {partyItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.code} — {it.name}</option>
                    ))}
                  </select>
                  <select
                    style={{ ...styles.select, flex: 2 }}
                    value={l.againstChallanId}
                    onChange={(e) => setLine(idx, { againstChallanId: e.target.value })}
                    disabled={!l.itemId}
                  >
                    <option value="">{l.itemId ? (options.length ? "Select challan…" : "No pending challans") : "Pick item first"}</option>
                    {options.map((o) => (
                      <option key={o.challanId} value={o.challanId}>#{o.challanNo} ({fmtDateDisplay(o.date)}) — pending {o.pending}</option>
                    ))}
                  </select>
                  <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} />
                  <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Broken Qty" value={l.brokenQty} onChange={(e) => setLine(idx, { brokenQty: e.target.value })} />
                  <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Broken Rate" value={l.brokenRate} onChange={(e) => setLine(idx, { brokenRate: e.target.value })} />
                  <button style={styles.iconBtn} onClick={confirmClick(() => removeLine(idx), "Remove this line?")} disabled={lines.length === 1}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <button style={styles.ghostBtn} onClick={confirmClick(addLine, "Add a new line?")}><Plus size={14} /> Add line</button>

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.5 }} disabled={!canSave} onClick={confirmClick(save, "Save this entry?")}>
                <CheckCircle2 size={15} /> {editingId ? "Update Return" : "Save Return"}
              </button>
              {editingId && (
                <button style={styles.ghostBtn} onClick={confirmClick(cancelEdit, "Cancel editing and discard changes?")}><X size={13} /> Cancel Edit</button>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel title={`Return Challans (${sortedChallans.length}${filterPartyId ? ` of ${data.returnChallans.length}` : ""})`}>
        {data.returnChallans.length === 0 ? (
          <Empty text="No returns recorded yet." />
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <SortToggle
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "date", label: "Sort: Return Date" },
                  { value: "updated", label: "Sort: Last Changed" },
                ]}
                style={{ marginBottom: 12 }}
              />
              <PartyFilter parties={data.parties} value={filterPartyId} onChange={setFilterPartyId} />
            </div>
            {sortedChallans.length === 0 ? (
              <Empty text="No return challans for this party." />
            ) : (
            <Table
              cols={["Return No.", "Date", "Party", "Items", "Last Changed", ""]}
              rows={sortedChallans.map((c) => [
                c.returnChallanNo,
                fmtDateDisplay(c.date),
                partyName(data, c.partyId),
                c.lines.map((l) => `${itemName(data, l.itemId)} × ${l.qty}`).join(", "),
                fmtDateTime(c.updatedAt || c.createdAt),
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.iconBtn} onClick={confirmClick(() => startEdit(c), "Edit this record?")} title="Edit return"><Pencil size={14} /></button>
                  <ConfirmDelete
                    id={c.id}
                    confirmId={confirmDeleteId}
                    setConfirmId={setConfirmDeleteId}
                    onConfirm={removeChallan}
                    label="Move to bin?"
                    title="Delete return"
                  />
                </div>,
              ])}
            />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Invoice Builder ---------------- */

// An empty manual line (for "Add row" in editable invoice preview)
const emptyInvoiceLine = () => ({
  itemName: "",
  qty: "",
  rate: "",
  feet: "",
  start: "",
  end: "",
  days: "",
  amount: "",
  returned: false,
  broken: false,
  service: false,
  _manual: true,
});

function InvoiceBuilder({ data, persist, markTyping }) {
  const blankHeader = {
    partyId: "",
    billStart: "",
    billEnd: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    invoiceNoInput: String(data.seq.invoice),
  };
  const [invHeader, setInvHeader, resetInvHeader, resetInvHeaderLocal, clearedInvDrafts] = useDraftForm("invoiceHeader", blankHeader, data, persist, markTyping);
  const { partyId, billStart, billEnd, invoiceDate, invoiceNoInput } = invHeader;
  const setPartyId = (v) => setInvHeader({ ...invHeader, partyId: v });
  const setBillStart = (v) => setInvHeader({ ...invHeader, billStart: v });
  const setBillEnd = (v) => setInvHeader({ ...invHeader, billEnd: v });
  const setInvoiceDate = (v) => setInvHeader({ ...invHeader, invoiceDate: v });
  const setInvoiceNoInput = (v) => setInvHeader({ ...invHeader, invoiceNoInput: v });

  // Editable lines state — seeded from computed result, then user can tweak
  const [editableLines, setEditableLines] = useState(null); // null = use computed
  const [editMode, setEditMode] = useState(false);

  // Extra adjustments: transport override and deposit override
  const [transportOverride, setTransportOverride] = useState("");
  const [depositOverride, setDepositOverride] = useState("");

  const party = data.parties.find((p) => p.id === partyId) || null;

  const result = useMemo(() => {
    if (!partyId || !billStart || !billEnd) return null;
    return computeInvoiceLines(data, partyId, billStart, billEnd);
  }, [data, partyId, billStart, billEnd]);

  // Seed editableLines whenever result changes (new party/dates), but only if not in edit mode
  useEffect(() => {
    if (result && !editMode) {
      setEditableLines(result.lines.map((l) => ({ ...l, qty: String(l.qty), rate: String(l.rate), days: String(l.days), amount: String(l.amount), feet: l.feet ? String(l.feet) : "" })));
      setTransportOverride("");
      setDepositOverride("");
    }
    if (!result) {
      setEditableLines(null);
      setEditMode(false);
    }
  }, [result]);

  // Recomputed totals from editable lines
  const editedTotals = useMemo(() => {
    if (!editableLines || !result) return null;
    const itemRentTotal = round2(editableLines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    const transportTotal = transportOverride !== "" ? (Number(transportOverride) || 0) : result.transportTotal;
    const depositTotal = depositOverride !== "" ? (Number(depositOverride) || 0) : result.depositTotal;
    const additionalCharges = transportTotal;
    const taxable = round2(itemRentTotal + additionalCharges);
    const netTotal = round2(taxable - depositTotal);
    return { itemRentTotal, transportTotal, depositTotal, additionalCharges, netTotal, taxable };
  }, [editableLines, result, transportOverride, depositOverride]);

  const gst = useMemo(() => {
    if (!result) return null;
    const base = editMode && editedTotals ? editedTotals.taxable : (result.itemRentTotal + result.additionalCharges);
    return computeGst(party, base);
  }, [result, party, editMode, editedTotals]);

  const finalTotal = useMemo(() => {
    if (!result || !gst) return null;
    const dep = editMode && editedTotals ? editedTotals.depositTotal : result.depositTotal;
    return round2(gst.grandTotal - dep);
  }, [result, gst, editMode, editedTotals]);

  const duplicateInvoiceNo = data.invoices.some((inv) => inv.invoiceNo === Number(invoiceNoInput));

  const activeLinesForSave = editMode && editableLines
    ? editableLines.filter((l) => l.itemName && (Number(l.amount) !== 0 || Number(l.qty) > 0))
    : (result ? result.lines : []);

  const save = () => {
    if (!result || activeLinesForSave.length === 0) return;
    const invoiceNo = Number(invoiceNoInput) || data.seq.invoice;
    const now = new Date().toISOString();

    // Build the saved result — use edited values if in edit mode
    let savedResult;
    if (editMode && editedTotals) {
      const cleanLines = activeLinesForSave.map((l) => ({
        ...l,
        qty: Number(l.qty) || 0,
        rate: Number(l.rate) || 0,
        days: Number(l.days) || 0,
        amount: Number(l.amount) || 0,
        feet: l.feet ? Number(l.feet) : undefined,
      }));
      savedResult = {
        ...result,
        lines: cleanLines,
        itemRentTotal: editedTotals.itemRentTotal,
        transportTotal: editedTotals.transportTotal,
        depositTotal: editedTotals.depositTotal,
        additionalCharges: editedTotals.additionalCharges,
        netTotal: editedTotals.netTotal,
      };
    } else {
      savedResult = result;
    }

    const next = {
      ...data,
      invoices: [
        ...data.invoices,
        { id: crypto.randomUUID(), invoiceNo, partyId, billStart, billEnd, invoiceDate, ...savedResult, gst, finalTotal, createdAt: now, updatedAt: now },
      ],
      seq: { ...data.seq, invoice: Math.max(data.seq.invoice, invoiceNo) + 1 },
    };
    persist({ ...next, drafts: clearedInvDrafts() });
    resetInvHeaderLocal({ ...blankHeader, invoiceNoInput: String(next.seq.invoice) });
    setEditMode(false);
    setEditableLines(null);
    setTransportOverride("");
    setDepositOverride("");
  };

  const enterEditMode = () => {
    if (result && !editMode) {
      setEditableLines(result.lines.map((l) => ({ ...l, qty: String(l.qty), rate: String(l.rate), days: String(l.days), amount: String(l.amount.toFixed(2)), feet: l.feet ? String(l.feet) : "" })));
    }
    setEditMode(true);
  };

  const exitEditMode = () => {
    setEditMode(false);
    if (result) {
      setEditableLines(result.lines.map((l) => ({ ...l, qty: String(l.qty), rate: String(l.rate), days: String(l.days), amount: String(l.amount.toFixed(2)), feet: l.feet ? String(l.feet) : "" })));
    }
    setTransportOverride("");
    setDepositOverride("");
  };

  const setEditLine = (idx, patch) => {
    setEditableLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      // Auto-recalculate amount if qty/rate/days change and amount not being directly edited
      if (!("amount" in patch) && ("qty" in patch || "rate" in patch || "days" in patch)) {
        const qty = Number(updated.qty) || 0;
        const rate = Number(updated.rate) || 0;
        const days = Number(updated.days) || 0;
        const feet = Number(updated.feet) || 0;
        updated.amount = String(round2(qty * rate * days * (feet || 1)));
      }
      return updated;
    }));
  };

  const addEditLine = () => setEditableLines((prev) => [...prev, emptyInvoiceLine()]);
  const removeEditLine = (idx) => setEditableLines((prev) => prev.filter((_, i) => i !== idx));

  const displayLines = editMode ? editableLines : (result ? result.lines : []);
  const displayTransport = editMode && transportOverride !== "" ? Number(transportOverride) : (result ? result.transportTotal : 0);
  const displayDeposit = editMode && depositOverride !== "" ? Number(depositOverride) : (result ? result.depositTotal : 0);
  const displayItemRent = editMode && editedTotals ? editedTotals.itemRentTotal : (result ? result.itemRentTotal : 0);
  const displayNetTotal = editMode && editedTotals ? editedTotals.netTotal : (result ? result.netTotal : 0);

  return (
    <div>
      <PageHeader title="Create Invoice" subtitle="Bills every delivered item for the window below — returned quantities to their return date, the rest through Billing End Date." />

      <Panel title="Billing Window">
        {duplicateInvoiceNo && <Notice text={`Invoice No. ${invoiceNoInput} is already used by another invoice.`} />}
        <div className="form-row" style={styles.formRow}>
          <Field label="Invoice No." type="number" value={invoiceNoInput} onChange={setInvoiceNoInput} />
          <SelectField label="Party" value={partyId} onChange={setPartyId} options={data.parties.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
          <Field label="Billing Start Date" type="date" value={billStart} onChange={setBillStart} />
          <Field label="Billing End Date" type="date" value={billEnd} onChange={setBillEnd} />
          <Field label="Invoice Date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
        </div>
        {party && (
          party.requiresGst
            ? <div style={styles.okNotice}><CheckCircle2 size={14} /> GST invoice — {party.gstType === "IGST" ? `IGST @ ${GST_RATE}%` : `CGST + SGST @ ${GST_RATE}%`}{party.gstin ? ` · Party GSTIN: ${party.gstin}` : ""}</div>
            : <div style={{ ...styles.hint, marginTop: 6 }}>This party doesn't require a GST bill — set it on their Party Master profile if that changes.</div>
        )}
      </Panel>

      {result && (
        result.lines.length === 0 && !editMode ? (
          <Panel title="Preview"><Empty text="No billable lines for this party in this window — check the dates or that deliveries exist." /></Panel>
        ) : (
          <>
            <Panel
              title={editMode ? `Editing Invoice — ${(editableLines || []).length} line${(editableLines || []).length !== 1 ? "s" : ""}` : `Preview — ${result.lines.length} line${result.lines.length > 1 ? "s" : ""}`}
              hint={!editMode && result.lines.length > 15 ? "Over 15 lines — will print as a continuation invoice" : editMode ? "You are in manual edit mode — changes override the auto-calculated values" : undefined}
            >
              {/* Edit mode toggle bar */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                {!editMode ? (
                  <button style={styles.ghostBtn} onClick={confirmClick(enterEditMode, "Enter edit mode?")}><Pencil size={13} /> Manually Edit Lines</button>
                ) : (
                  <>
                    <span style={{ ...styles.tinyTag, background: "#fff3cd", color: "#856404", padding: "3px 8px", fontSize: 11.5 }}>✏️ Edit Mode</span>
                    <button style={styles.ghostBtn} onClick={confirmClick(exitEditMode, "Exit edit mode? Unsaved changes may be lost.")}><X size={13} /> Reset to Auto-Calculated</button>
                  </>
                )}
              </div>

              {/* Line table — read-only or editable */}
              {!editMode ? (
                <Table
                  serial={false}
                  cols={["Sr.", "Item", "Qty", "Rate/Ft/Day", "S.Date", "E.Date", "Days", "Amount"]}
                  rows={result.lines.map((l, i) => [
                    i + 1,
                    <span>{l.itemName} {l.returned && <em style={styles.tinyTag}>returned</em>} {l.broken && <em style={styles.tinyTag}>broken</em>} {l.service && <em style={styles.tinyTag}>service</em>}</span>,
                    l.qty,
                    l.feet ? `${l.rate} × ${l.feet}ft` : l.rate,
                    fmtDateDisplay(l.start),
                    fmtDateDisplay(l.end),
                    l.days,
                    l.amount.toFixed(2),
                  ])}
                />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  {/* Editable header */}
                  <div className="line-header-row" style={{ ...styles.lineHeaderRow, gap: 6 }}>
                    <span style={{ width: 24, flexShrink: 0 }}>#</span>
                    <span style={{ flex: 3, minWidth: 110 }}>Item Name</span>
                    <span style={{ flex: 1, minWidth: 55 }}>Qty</span>
                    <span style={{ flex: 1, minWidth: 55 }}>Rate</span>
                    <span style={{ flex: 1, minWidth: 55 }}>Feet</span>
                    <span style={{ flex: 1, minWidth: 70 }}>Start</span>
                    <span style={{ flex: 1, minWidth: 70 }}>End</span>
                    <span style={{ flex: 1, minWidth: 50 }}>Days</span>
                    <span style={{ flex: 1, minWidth: 75 }}>Amount (₹)</span>
                    <span style={{ width: 32, flexShrink: 0 }} />
                  </div>
                  {(editableLines || []).map((l, idx) => (
                    <div key={idx} className="line-row" style={{ ...styles.lineRow, gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <span style={{ width: 24, flexShrink: 0, fontSize: 12, color: COLORS.muted }}>{idx + 1}</span>
                      <input
                        style={{ ...styles.input, flex: 3, minWidth: 110 }}
                        placeholder="Item description"
                        value={l.itemName}
                        onChange={(e) => setEditLine(idx, { itemName: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 55 }}
                        type="number"
                        placeholder="Qty"
                        value={l.qty}
                        onChange={(e) => setEditLine(idx, { qty: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 55 }}
                        type="number"
                        placeholder="Rate"
                        value={l.rate}
                        onChange={(e) => setEditLine(idx, { rate: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 55 }}
                        type="number"
                        placeholder="Ft (opt)"
                        value={l.feet}
                        onChange={(e) => setEditLine(idx, { feet: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 70 }}
                        type="date"
                        value={l.start}
                        onChange={(e) => setEditLine(idx, { start: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 70 }}
                        type="date"
                        value={l.end}
                        onChange={(e) => setEditLine(idx, { end: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 50 }}
                        type="number"
                        placeholder="Days"
                        value={l.days}
                        onChange={(e) => setEditLine(idx, { days: e.target.value })}
                      />
                      <input
                        style={{ ...styles.input, flex: 1, minWidth: 75, fontWeight: 600 }}
                        type="number"
                        placeholder="Amount"
                        value={l.amount}
                        onChange={(e) => setEditLine(idx, { amount: e.target.value })}
                      />
                      <button style={{ ...styles.iconBtn, flexShrink: 0 }} onClick={confirmClick(() => removeEditLine(idx), "Remove this line?")} title="Remove line"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button style={styles.ghostBtn} onClick={confirmClick(addEditLine, "Add a new line?")}><Plus size={13} /> Add Row</button>

                  {/* Transport & Deposit overrides */}
                  <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <Field
                      label={`Transport Charge (auto: ₹${result.transportTotal.toFixed(2)})`}
                      type="number"
                      value={transportOverride}
                      onChange={setTransportOverride}
                      placeholder={String(result.transportTotal)}
                    />
                    <Field
                      label={`Deposit Deduction (auto: ₹${result.depositTotal.toFixed(2)})`}
                      type="number"
                      value={depositOverride}
                      onChange={setDepositOverride}
                      placeholder={String(result.depositTotal)}
                    />
                  </div>
                </div>
              )}

              {/* Totals box */}
              <div style={styles.totalsBox}>
                <TotalRow label="Item Rent Amount" value={displayItemRent} />
                {!editMode && result.brokenTotal > 0 && <TotalRow label="  — of which Broken Charges" value={result.brokenTotal} />}
                {!editMode && result.serviceTotal > 0 && <TotalRow label="  — of which Service Charges" value={result.serviceTotal} />}
                <TotalRow label="Transport Charge" value={displayTransport} />
                {gst && gst.applicable ? (
                  <>
                    <TotalRow label="Taxable Value" value={editMode ? (editedTotals?.taxable ?? 0) : gst.taxableValue} bold />
                    {gst.gstType === "IGST" ? (
                      <TotalRow label={`IGST @ ${gst.rate}%`} value={gst.igst} />
                    ) : (
                      <>
                        <TotalRow label={`CGST @ ${gst.rate / 2}%`} value={gst.cgst} />
                        <TotalRow label={`SGST @ ${gst.rate / 2}%`} value={gst.sgst} />
                      </>
                    )}
                    <TotalRow label="Deposit (deducted)" value={-displayDeposit} />
                    <TotalRow label="Grand Total (incl. GST)" value={finalTotal} big />
                  </>
                ) : (
                  <>
                    <TotalRow label="Deposit (deducted)" value={-displayDeposit} />
                    <TotalRow label="Net Total" value={displayNetTotal} big />
                  </>
                )}
              </div>
              <button style={{ ...styles.primaryBtn, marginTop: 14 }} onClick={confirmClick(save, "Save this entry?")}>
                <CheckCircle2 size={15} /> Finalize & Save Invoice #{invoiceNoInput || data.seq.invoice}
              </button>
            </Panel>
          </>
        )
      )}
    </div>
  );
}

/* ---------------- Bulk Invoice ---------------- */
// One billing window + invoice date, applied to every party at once (all
// parties start selected; any can be unticked to skip them). Generates one
// invoice per selected party with sequential invoice numbers, saves them all
// in a single persist(), then renders + captures each as a PDF off-screen
// and bundles the set into one .zip download.

function BulkInvoiceBuilder({ data, persist, markTyping }) {
  const blankWindow = { billStart: "", billEnd: "", invoiceDate: new Date().toISOString().slice(0, 10) };
  const [bulkWindow, setBulkWindow] = useDraftForm("bulkInvoiceWindow", blankWindow, data, persist, markTyping);
  const { billStart, billEnd, invoiceDate } = bulkWindow;
  const setBillStart = (v) => setBulkWindow({ ...bulkWindow, billStart: v });
  const setBillEnd = (v) => setBulkWindow({ ...bulkWindow, billEnd: v });
  const setInvoiceDate = (v) => setBulkWindow({ ...bulkWindow, invoiceDate: v });
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // "select" — choose the billing window and which parties to include.
  // "review" — inspect (and, if needed, edit) every selected party's
  // invoice before anything is saved or downloaded, same idea as Create
  // Invoice's edit mode but one card per party.
  const [step, setStep] = useState("select");
  // Manual per-party edits made during review, keyed by party id:
  // { lines, transportOverride, depositOverride }. A party with no entry
  // here just uses its auto-computed result untouched.
  const [partyEdits, setPartyEdits] = useState({});
  const [expandedPartyId, setExpandedPartyId] = useState(null);
  // Document currently rendered off-screen for PDF capture: either the
  // invoice itself ({ kind: "invoice", invoice }) or its companion pending
  // items/balance statement ({ kind: "summary", invoice, accountSummary }).
  // Each party produces both, captured one at a time into the same portal
  // node — see confirmAndDownload.
  const [capture, setCapture] = useState(null);
  const captureRef = useRef(null);

  const hasWindow = Boolean(billStart && billEnd);

  // Compute a preview for every party (billable or not) once a window is set.
  const previews = useMemo(() => {
    if (!hasWindow) return [];
    return data.parties.map((p) => ({
      party: p,
      result: computeInvoiceLines(data, p.id, billStart, billEnd),
    }));
  }, [data, billStart, billEnd, hasWindow]);

  const billable = previews.filter((pv) => pv.result.lines.length > 0);
  const selected = billable.filter((pv) => !excludedIds.has(pv.party.id));
  const skippedNoLines = previews.filter((pv) => pv.result.lines.length === 0);

  // Changing the billing window invalidates any in-progress review/edits —
  // drop back to selection and start review fresh next time.
  useEffect(() => {
    setStep("select");
    setPartyEdits({});
    setExpandedPartyId(null);
  }, [billStart, billEnd]);

  const toggleParty = (id) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setExcludedIds(new Set());
  const selectNone = () => setExcludedIds(new Set(billable.map((pv) => pv.party.id)));

  const seededEdit = (result) => ({
    lines: result.lines.map((l) => ({ ...l, qty: String(l.qty), rate: String(l.rate), days: String(l.days), amount: String(l.amount), feet: l.feet ? String(l.feet) : "" })),
    transportOverride: "",
    depositOverride: "",
  });

  // Move from selection into review — seed an editable line-copy for every
  // currently selected party so review totals exactly match the
  // auto-computed preview until the user actually changes something.
  const goToReview = () => {
    if (selected.length === 0) return;
    setPartyEdits((prev) => {
      const next = { ...prev };
      selected.forEach(({ party, result }) => {
        if (!next[party.id]) next[party.id] = seededEdit(result);
      });
      return next;
    });
    setStep("review");
  };

  const backToSelect = () => {
    setStep("select");
    setExpandedPartyId(null);
  };

  const editLineFor = (partyId, idx, patch) => {
    setPartyEdits((prev) => {
      const cur = prev[partyId];
      if (!cur) return prev;
      const lines = cur.lines.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, ...patch };
        if (!("amount" in patch) && ("qty" in patch || "rate" in patch || "days" in patch || "feet" in patch)) {
          const qty = Number(updated.qty) || 0;
          const rate = Number(updated.rate) || 0;
          const days = Number(updated.days) || 0;
          const feet = Number(updated.feet) || 0;
          updated.amount = String(round2(qty * rate * days * (feet || 1)));
        }
        return updated;
      });
      return { ...prev, [partyId]: { ...cur, lines } };
    });
  };
  const addLineFor = (partyId) => {
    setPartyEdits((prev) => {
      const cur = prev[partyId];
      if (!cur) return prev;
      return { ...prev, [partyId]: { ...cur, lines: [...cur.lines, emptyInvoiceLine()] } };
    });
  };
  const removeLineFor = (partyId, idx) => {
    setPartyEdits((prev) => {
      const cur = prev[partyId];
      if (!cur) return prev;
      return { ...prev, [partyId]: { ...cur, lines: cur.lines.filter((_, i) => i !== idx) } };
    });
  };
  const setOverrideFor = (partyId, key, value) => {
    setPartyEdits((prev) => {
      const cur = prev[partyId];
      if (!cur) return prev;
      return { ...prev, [partyId]: { ...cur, [key]: value } };
    });
  };
  const resetPartyEdit = (partyId, result) => {
    setPartyEdits((prev) => ({ ...prev, [partyId]: seededEdit(result) }));
  };

  // Resolves the final billable figures for one party during review —
  // either straight from the auto-computed result, or recomputed from that
  // party's edited lines/overrides. Shared by the review-screen totals and
  // confirmAndDownload so what the user sees is exactly what gets saved.
  const resolvePartyInvoiceData = (party, result) => {
    const edit = partyEdits[party.id];
    if (!edit) {
      const gst = computeGst(party, result.itemRentTotal + result.additionalCharges);
      const finalTotal = round2(gst.grandTotal - result.depositTotal);
      return { lines: result.lines, itemRentTotal: result.itemRentTotal, transportTotal: result.transportTotal, depositTotal: result.depositTotal, additionalCharges: result.additionalCharges, netTotal: result.netTotal, gst, finalTotal };
    }
    const itemRentTotal = round2(edit.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    const transportTotal = edit.transportOverride !== "" ? (Number(edit.transportOverride) || 0) : result.transportTotal;
    const depositTotal = edit.depositOverride !== "" ? (Number(edit.depositOverride) || 0) : result.depositTotal;
    const additionalCharges = transportTotal;
    const taxable = round2(itemRentTotal + additionalCharges);
    const netTotal = round2(taxable - depositTotal);
    const cleanLines = edit.lines
      .filter((l) => l.itemName && (Number(l.amount) !== 0 || Number(l.qty) > 0))
      .map((l) => ({
        ...l,
        qty: Number(l.qty) || 0,
        rate: Number(l.rate) || 0,
        days: Number(l.days) || 0,
        amount: Number(l.amount) || 0,
        feet: l.feet ? Number(l.feet) : undefined,
      }));
    const gst = computeGst(party, taxable);
    const finalTotal = round2(gst.grandTotal - depositTotal);
    return { lines: cleanLines, itemRentTotal, transportTotal, depositTotal, additionalCharges, netTotal, gst, finalTotal };
  };

  const confirmAndDownload = async () => {
    if (generating || selected.length === 0) return;
    setGenerating(true);
    setProgress({ done: 0, total: selected.length });
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const now = new Date().toISOString();
      let nextInvoiceNo = data.seq.invoice;

      // Build every invoice record up front so numbering is sequential and
      // predictable, independent of how long each PDF capture takes. Uses
      // whatever the user confirmed in review — edited or auto-computed.
      // Each party's "prior balance" is read from `data` as it stands right
      // now (before this run adds anything), so the PDF shows exactly what
      // was owed walking in, plus this invoice, plus the items still with
      // them — one clear number, not three things the party has to add up.
      const built = selected.map(({ party, result }) => {
        const resolved = resolvePartyInvoiceData(party, result);
        const invoice = {
          id: crypto.randomUUID(),
          invoiceNo: nextInvoiceNo,
          partyId: party.id,
          billStart, billEnd, invoiceDate,
          ...resolved,
          createdAt: now, updatedAt: now,
        };
        nextInvoiceNo += 1;
        const priorBalance = partyLedgerTotals(data, party.id).balanceDue;
        const accountSummary = {
          pendingItems: partyRentedItems(data, party.id),
          priorBalance,
          thisInvoiceAmount: resolved.finalTotal,
          totalPayable: round2(priorBalance + resolved.finalTotal),
        };
        return { invoice, accountSummary };
      });

      // Render each party's two documents into the hidden capture portal one
      // at a time, wait for paint, capture each to its own PDF blob, and add
      // both to the zip — the invoice and its pending items/balance
      // statement are separate PDFs, not sections of one PDF.
      for (let i = 0; i < built.length; i++) {
        const { invoice, accountSummary } = built[i];
        const partyLabel = sanitizeForFilename(partyName(data, invoice.partyId));
        const periodLabel = `${sanitizeForFilename(fmtDateDisplay(invoice.billStart))} to ${sanitizeForFilename(fmtDateDisplay(invoice.billEnd))}`;

        setCapture({ kind: "invoice", invoice });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const invoiceBlob = await pdfBlobFromNode(captureRef.current);
        zip.file(`${invoice.invoiceNo} - ${partyLabel} - ${periodLabel}.pdf`, invoiceBlob);

        setCapture({ kind: "summary", invoice, accountSummary });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const summaryBlob = await pdfBlobFromNode(captureRef.current);
        zip.file(`${invoice.invoiceNo} - ${partyLabel} - Pending Items & Balance.pdf`, summaryBlob);

        setProgress({ done: i + 1, total: built.length });
      }

      // Save all invoices in one go.
      const newInvoices = built.map((b) => b.invoice);
      persist({
        ...data,
        invoices: [...data.invoices, ...newInvoices],
        seq: { ...data.seq, invoice: nextInvoiceNo },
      });

      // Download the bundle.
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      const dateLabel = `${sanitizeForFilename(fmtDateDisplay(billStart))} to ${sanitizeForFilename(fmtDateDisplay(billEnd))}`;
      a.href = url;
      a.download = `Invoices - ${dateLabel}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setBillStart("");
      setBillEnd("");
      setExcludedIds(new Set());
      setPartyEdits({});
      setStep("select");
      setExpandedPartyId(null);
    } catch (err) {
      console.error("Bulk invoice generation failed:", err);
      alert("Couldn't generate the invoices. Please try again.");
    } finally {
      setGenerating(false);
      setCapture(null);
    }
  };

  return (
    <div>
      <PageHeader title="Bulk Invoice" subtitle="One billing window for every party — untick anyone you want to skip, review (and edit if needed) each invoice, then generate and download all invoices as a single zip. Each party gets two PDFs: the invoice, and a companion statement listing items still with that party plus their running balance, pulled from the Party Ledger." />

      <Panel title="Billing Window">
        <div className="form-row" style={styles.formRow}>
          <Field label="Billing Start Date" type="date" value={billStart} onChange={setBillStart} />
          <Field label="Billing End Date" type="date" value={billEnd} onChange={setBillEnd} />
          <Field label="Invoice Date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
        </div>
        {data.parties.length === 0 && <Notice text="Add at least one party in Party Master first." />}
      </Panel>

      {hasWindow && (
        billable.length === 0 ? (
          <Panel title="Preview"><Empty text="No party has any billable lines in this window — check the dates." /></Panel>
        ) : step === "select" ? (
          <Panel
            title={`Parties to Invoice (${selected.length} of ${billable.length} selected)`}
            hint="All billable parties are selected by default — untick any you want to leave out of this run."
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button style={styles.ghostBtn} onClick={confirmClick(selectAll, "Select all?")}>Select All</button>
              <button style={styles.ghostBtn} onClick={confirmClick(selectNone, "Clear the selection?")}>Select None</button>
            </div>
            <div className="table-wrap">
              <Table
                cols={["", "Party", "Lines", "Item Rent", "Net / Grand Total"]}
                rows={billable.map(({ party, result }) => {
                  const gst = computeGst(party, result.itemRentTotal + result.additionalCharges);
                  const finalTotal = round2(gst.grandTotal - result.depositTotal);
                  const checked = !excludedIds.has(party.id);
                  return [
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParty(party.id)}
                      style={{ width: 16, height: 16 }}
                    />,
                    `${party.code} — ${party.name}`,
                    result.lines.length,
                    result.itemRentTotal.toFixed(2),
                    finalTotal.toFixed(2),
                  ];
                })}
              />
            </div>
            {skippedNoLines.length > 0 && (
              <div style={{ ...styles.hint, marginTop: 10 }}>
                {skippedNoLines.length} part{skippedNoLines.length === 1 ? "y has" : "ies have"} no billable activity in this window and {skippedNoLines.length === 1 ? "is" : "are"} left out automatically: {skippedNoLines.map((pv) => pv.party.name).join(", ")}.
              </div>
            )}
            <button
              style={{ ...styles.primaryBtn, marginTop: 14 }}
              disabled={selected.length === 0}
              onClick={confirmClick(goToReview, "Continue to review?")}
            >
              <FileText size={15} /> Review {selected.length} Invoice{selected.length === 1 ? "" : "s"} Before Download
            </button>
          </Panel>
        ) : (
          <Panel
            title={`Review ${selected.length} Invoice${selected.length === 1 ? "" : "s"}`}
            hint="Expand a party to edit its lines, transport, or deposit — same as Create Invoice's edit mode. Nothing is saved or downloaded until you confirm below."
          >
            <button style={{ ...styles.ghostBtn, marginBottom: 12 }} onClick={confirmClick(backToSelect, "Go back? Your review progress will be lost.")}>
              <X size={13} /> Back to Party Selection
            </button>

            {selected.map(({ party, result }) => {
              const edit = partyEdits[party.id];
              const resolved = resolvePartyInvoiceData(party, result);
              const isExpanded = expandedPartyId === party.id;
              const isEdited = !!edit && (
                edit.transportOverride !== "" || edit.depositOverride !== "" ||
                JSON.stringify(edit.lines.map((l) => [l.itemName, l.qty, l.rate, l.days, l.amount, l.feet])) !==
                JSON.stringify(result.lines.map((l) => [l.itemName, String(l.qty), String(l.rate), String(l.days), String(l.amount), l.feet ? String(l.feet) : ""]))
              );

              return (
                <div key={party.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", background: COLORS.bg, cursor: "pointer", flexWrap: "wrap", gap: 8,
                    }}
                    onClick={confirmClick(() => setExpandedPartyId(isExpanded ? null : party.id), "Toggle this party's details?")}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "'Public Sans', system-ui, sans-serif", color: COLORS.ink }}>
                      {isExpanded ? "▾" : "▸"} {party.code} — {party.name}{" "}
                      {isEdited && <span style={{ ...styles.tinyTag, background: "#fff3cd", color: "#856404" }}>edited</span>}
                    </span>
                    <span style={{ fontSize: 12.5, fontFamily: "'Public Sans', system-ui, sans-serif", color: COLORS.muted }}>
                      {resolved.lines.length} line{resolved.lines.length === 1 ? "" : "s"} · Item Rent ₹{resolved.itemRentTotal.toFixed(2)} · <strong style={{ color: COLORS.ink }}>Total ₹{resolved.finalTotal.toFixed(2)}</strong>
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: 14 }} onClick={confirmClick((e) => e.stopPropagation(), "Are you sure?")}>
                      <div style={{ overflowX: "auto" }}>
                        <div className="line-header-row" style={{ ...styles.lineHeaderRow, gap: 6 }}>
                          <span style={{ width: 24, flexShrink: 0 }}>#</span>
                          <span style={{ flex: 3, minWidth: 110 }}>Item Name</span>
                          <span style={{ flex: 1, minWidth: 55 }}>Qty</span>
                          <span style={{ flex: 1, minWidth: 55 }}>Rate</span>
                          <span style={{ flex: 1, minWidth: 55 }}>Feet</span>
                          <span style={{ flex: 1, minWidth: 70 }}>Start</span>
                          <span style={{ flex: 1, minWidth: 70 }}>End</span>
                          <span style={{ flex: 1, minWidth: 50 }}>Days</span>
                          <span style={{ flex: 1, minWidth: 75 }}>Amount (₹)</span>
                          <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                        {(edit?.lines || []).map((l, idx) => (
                          <div key={idx} className="line-row" style={{ ...styles.lineRow, gap: 6, alignItems: "center", marginBottom: 6 }}>
                            <span style={{ width: 24, flexShrink: 0, fontSize: 12, color: COLORS.muted }}>{idx + 1}</span>
                            <input style={{ ...styles.input, flex: 3, minWidth: 110 }} placeholder="Item description" value={l.itemName} onChange={(e) => editLineFor(party.id, idx, { itemName: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 55 }} type="number" placeholder="Qty" value={l.qty} onChange={(e) => editLineFor(party.id, idx, { qty: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 55 }} type="number" placeholder="Rate" value={l.rate} onChange={(e) => editLineFor(party.id, idx, { rate: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 55 }} type="number" placeholder="Ft (opt)" value={l.feet} onChange={(e) => editLineFor(party.id, idx, { feet: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 70 }} type="date" value={l.start} onChange={(e) => editLineFor(party.id, idx, { start: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 70 }} type="date" value={l.end} onChange={(e) => editLineFor(party.id, idx, { end: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 50 }} type="number" placeholder="Days" value={l.days} onChange={(e) => editLineFor(party.id, idx, { days: e.target.value })} />
                            <input style={{ ...styles.input, flex: 1, minWidth: 75, fontWeight: 600 }} type="number" placeholder="Amount" value={l.amount} onChange={(e) => editLineFor(party.id, idx, { amount: e.target.value })} />
                            <button style={{ ...styles.iconBtn, flexShrink: 0 }} onClick={confirmClick(() => removeLineFor(party.id, idx), "Remove this line?")} title="Remove line"><Trash2 size={13} /></button>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={styles.ghostBtn} onClick={confirmClick(() => addLineFor(party.id), "Add a new line?")}><Plus size={13} /> Add Row</button>
                          <button style={styles.ghostBtn} onClick={confirmClick(() => resetPartyEdit(party.id, result), "Discard changes for this party?")}><X size={13} /> Reset to Auto-Calculated</button>
                        </div>

                        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <Field
                            label={`Transport Charge (auto: ₹${result.transportTotal.toFixed(2)})`}
                            type="number"
                            value={edit?.transportOverride ?? ""}
                            onChange={(v) => setOverrideFor(party.id, "transportOverride", v)}
                            placeholder={String(result.transportTotal)}
                          />
                          <Field
                            label={`Deposit Deduction (auto: ₹${result.depositTotal.toFixed(2)})`}
                            type="number"
                            value={edit?.depositOverride ?? ""}
                            onChange={(v) => setOverrideFor(party.id, "depositOverride", v)}
                            placeholder={String(result.depositTotal)}
                          />
                        </div>
                      </div>

                      <div style={styles.totalsBox}>
                        <TotalRow label="Item Rent Amount" value={resolved.itemRentTotal} />
                        <TotalRow label="Transport Charge" value={resolved.transportTotal} />
                        {resolved.gst.applicable ? (
                          <>
                            <TotalRow label="Taxable Value" value={resolved.gst.taxableValue} bold />
                            {resolved.gst.gstType === "IGST" ? (
                              <TotalRow label={`IGST @ ${resolved.gst.rate}%`} value={resolved.gst.igst} />
                            ) : (
                              <>
                                <TotalRow label={`CGST @ ${resolved.gst.rate / 2}%`} value={resolved.gst.cgst} />
                                <TotalRow label={`SGST @ ${resolved.gst.rate / 2}%`} value={resolved.gst.sgst} />
                              </>
                            )}
                            <TotalRow label="Deposit (deducted)" value={-resolved.depositTotal} />
                            <TotalRow label="Grand Total (incl. GST)" value={resolved.finalTotal} big />
                          </>
                        ) : (
                          <>
                            <TotalRow label="Deposit (deducted)" value={-resolved.depositTotal} />
                            <TotalRow label="Net Total" value={resolved.netTotal} big />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ ...styles.totalsBox, marginTop: 4 }}>
              <TotalRow
                label="Grand Total — All Selected Parties"
                value={selected.reduce((s, { party, result }) => s + resolvePartyInvoiceData(party, result).finalTotal, 0)}
                big
              />
            </div>

            <button
              style={{ ...styles.primaryBtn, marginTop: 14 }}
              disabled={generating || selected.length === 0}
              onClick={confirmClick(confirmAndDownload, "Confirm and download the invoices?")}
            >
              <Archive size={15} />
              {generating
                ? `Generating ${progress.done}/${progress.total} part${progress.total === 1 ? "y" : "ies"}…`
                : `Confirm & Download ${selected.length} Part${selected.length === 1 ? "y" : "ies"} (${selected.length * 2} PDFs, .zip)`}
            </button>
          </Panel>
        )
      )}

      {/* Hidden off-screen node used purely for PDF capture during bulk
          generation — never shown on screen, only painted for html2canvas
          to read. */}
      <PrintPortal extraClass="print-portal--bulk-invoice" domRef={captureRef}>
        {capture && (
          capture.kind === "invoice"
            ? <InvoiceSheet data={data} invoice={capture.invoice} />
            : <AccountSummarySheet data={data} invoice={capture.invoice} accountSummary={capture.accountSummary} />
        )}
      </PrintPortal>
    </div>
  );
}

/* ---------------- Invoice Archive ---------------- */

function InvoiceArchive({ data, persist }) {
  const [selectedId, setSelectedId] = useState(null);
  const [confirmVoidId, setConfirmVoidId] = useState(null);
  const [sortBy, setSortBy] = useState("date"); // "date" | "updated"
  const [filterPartyId, setFilterPartyId] = useState("");
  // Months the user has manually collapsed — everything starts expanded.
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());
  const selected = data.invoices.find((i) => i.id === selectedId);

  const voidInvoice = (id) => {
    const inv = data.invoices.find((x) => x.id === id);
    if (!inv) return;
    moveToBin(data, persist, "invoice", inv, `#${inv.invoiceNo} — ${partyName(data, inv.partyId)}`);
    if (selectedId === id) setSelectedId(null);
    setConfirmVoidId(null);
  };

  const sortedInvoices = useMemo(() => {
    const list = filterPartyId ? data.invoices.filter((inv) => inv.partyId === filterPartyId) : [...data.invoices];
    if (sortBy === "updated") {
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    } else {
      list.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate) || b.invoiceNo - a.invoiceNo);
    }
    return list;
  }, [data.invoices, sortBy, filterPartyId]);

  // Segregate the (already sorted) list into month buckets keyed off each
  // invoice's Invoice Date, most recent month first, so a growing archive
  // reads as "August 2026", "July 2026", ... rather than one long table.
  const monthGroups = useMemo(() => {
    const map = new Map();
    for (const inv of sortedInvoices) {
      const d = new Date(inv.invoiceDate);
      const key = isNaN(d.getTime()) ? "unknown" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(inv);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === "unknown" ? 1 : b[0] === "unknown" ? -1 : b[0].localeCompare(a[0])))
      .map(([key, invoices]) => {
        let label = "Undated";
        if (key !== "unknown") {
          const [y, m] = key.split("-");
          label = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
        }
        return { key, label, invoices };
      });
  }, [sortedInvoices]);

  const toggleMonth = (key) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const invoiceRow = (inv) => [
    inv.invoiceNo,
    fmtDateDisplay(inv.invoiceDate),
    partyName(data, inv.partyId),
    Number(inv.itemRentTotal || 0).toFixed(2),
    Number(inv.additionalCharges || 0).toFixed(2),
    inv.gst?.applicable
      ? <span style={styles.tinyTag}>{inv.gst.gstType === "IGST" ? "IGST" : "CGST+SGST"}</span>
      : <span style={{ color: COLORS.muted, fontSize: 12 }}>—</span>,
    <strong>{Number((inv.gst?.applicable ? (inv.finalTotal ?? inv.netTotal) : inv.netTotal) || 0).toFixed(2)}</strong>,
    confirmVoidId === inv.id ? (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif" }}>Void this invoice?</span>
        <button style={{ ...styles.iconBtn, color: "#b3261e", borderColor: "#b3261e" }} onClick={confirmClick(() => voidInvoice(inv.id), "Void this invoice? This cannot be undone.")} title="Confirm void"><CheckCircle2 size={14} /></button>
        <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmVoidId(null), "Are you sure?")} title="Cancel"><X size={14} /></button>
      </div>
    ) : (
      <div style={{ display: "flex", gap: 6 }}>
        <button style={styles.ghostBtn} onClick={confirmClick(() => setSelectedId(inv.id), "Are you sure?")}><Printer size={13} /> View</button>
        <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmVoidId(inv.id), "Are you sure?")} title="Void invoice"><Ban size={14} /></button>
      </div>
    ),
  ];

  return (
    <div>
      <PageHeader title="Invoice Archive" subtitle="Every finalized invoice, saved permanently as a snapshot — grouped month by month." />
      <Panel title={`Invoices (${sortedInvoices.length}${filterPartyId ? ` of ${data.invoices.length}` : ""})`}>
        {data.invoices.length === 0 ? (
          <Empty text="No invoices finalized yet — create one in Create Invoice." />
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <SortToggle
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "date", label: "Sort: Invoice Date" },
                  { value: "updated", label: "Sort: Last Changed" },
                ]}
                style={{ marginBottom: 12 }}
              />
              <PartyFilter parties={data.parties} value={filterPartyId} onChange={setFilterPartyId} />
            </div>
            {sortedInvoices.length === 0 ? (
              <Empty text="No invoices for this party." />
            ) : (
              monthGroups.map((group) => {
                const collapsed = collapsedMonths.has(group.key);
                const groupTotal = group.invoices.reduce(
                  (s, inv) => s + Number((inv.gst?.applicable ? (inv.finalTotal ?? inv.netTotal) : inv.netTotal) || 0),
                  0
                );
                return (
                  <div key={group.key} style={{ marginBottom: 16 }}>
                    <button
                      onClick={confirmClick(() => toggleMonth(group.key), "Toggle this month's details?")}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                        background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                        padding: "9px 14px", marginBottom: collapsed ? 0 : 8, cursor: "pointer",
                        fontFamily: "'Public Sans', system-ui, sans-serif",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.ink }}>
                        {collapsed ? "▸" : "▾"} {group.label}{" "}
                        <span style={{ fontWeight: 400, color: COLORS.muted, fontSize: 12 }}>
                          ({group.invoices.length} invoice{group.invoices.length === 1 ? "" : "s"})
                        </span>
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 12.5, color: COLORS.muted }}>Total: ₹{groupTotal.toFixed(2)}</span>
                    </button>
                    {!collapsed && (
                      <Table
                        cols={["Invoice No.", "Date", "Party", "Item Rent", "Additional Charges", "GST", "Total", ""]}
                        rows={group.invoices.map(invoiceRow)}
                      />
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </Panel>
      {selected && <InvoicePrintView data={data} invoice={selected} />}
    </div>
  );
}

// Letterhead block — company name/tagline/address, "TAX INVOICE" marker when
// applicable. Shared by InvoiceSheet and AccountSummarySheet so the two
// documents read as a matching pair.
function InvoiceLetterhead({ data, invoice }) {
  const company = data.company || DEFAULT_COMPANY;
  return (
    <div style={styles.invoiceLetterhead}>
      <div style={styles.invoiceCompany}>{company.name}</div>
      <div style={styles.invoiceTagline}>{company.tagline}</div>
      <div style={styles.invoiceAddress}>{company.address} · {company.email}{company.gstin ? ` · GSTIN: ${company.gstin}` : ""}</div>
      {invoice.gst?.applicable && <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>TAX INVOICE</div>}
    </div>
  );
}

// Party details (left) + invoice no./date/billing period (right) header row.
// Shared by InvoiceSheet and AccountSummarySheet — see InvoiceLetterhead.
function InvoicePartyHeader({ data, invoice }) {
  const party = data.parties.find((p) => p.id === invoice.partyId);
  const refs = party?.references?.filter(Boolean) || (party?.reference ? [party.reference] : []);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, gap: 12, flexWrap: "wrap", paddingBottom: 14, borderBottom: `1px solid ${COLORS.border}` }}>
      {/* LEFT — party details */}
      <div style={{ fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.7 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}><span style={{ fontSize: 12.5, fontWeight: 400 }}>Party Name: </span>{partyName(data, invoice.partyId)}</div>
        {party?.address && <div><strong>Address:</strong> {party.address}</div>}
        {party?.phone && <div><strong>Phone:</strong> {party.phone}</div>}
        {refs.length > 0 && <div><strong>Ref:</strong> {refs.join(", ")}</div>}
        {invoice.gst?.applicable && (
          <>
            <div><strong>Party GSTIN:</strong> {party?.gstin || "—"}</div>
            <div><strong>Tax Type:</strong> {invoice.gst.gstType === "IGST" ? "IGST" : "CGST + SGST"}</div>
          </>
        )}
      </div>
      {/* RIGHT — invoice no & date */}
      <div style={{ fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.7, textAlign: "right" }}>
        <div><strong>Invoice No.:</strong> {invoice.invoiceNo}</div>
        <div><strong>Invoice Date:</strong> {fmtDateDisplay(invoice.invoiceDate)}</div>
        <div><strong>Billing Period:</strong> {fmtDateDisplay(invoice.billStart)} → {fmtDateDisplay(invoice.billEnd)}</div>
      </div>
    </div>
  );
}

// The actual invoice paper — letterhead, party/invoice header block, line
// table, totals. Pulled out as its own component so it can be rendered both
// on-screen (InvoicePrintView) and off-screen for single or bulk PDF capture
// (BulkInvoiceBuilder), without duplicating the markup.
function InvoiceSheet({ data, invoice }) {
  return (
    <div className="invoice-sheet" style={styles.invoiceSheet}>
          <InvoiceLetterhead data={data} invoice={invoice} />
          <InvoicePartyHeader data={data} invoice={invoice} />
          <div style={{ marginTop: 6 }}>
            <Table
              serial={false}
              cols={["Sr.", "Item", "Qty", "Rate/Ft/Day", "S.Date", "E.Date", "Days", "Amount"]}
              rows={invoice.lines.map((l, i) => [
                i + 1,
                l.itemName,
                l.qty,
                l.feet ? `${l.rate} × ${l.feet}ft` : l.rate,
                fmtDateDisplay(l.start),
                fmtDateDisplay(l.end),
                l.days,
                Number(l.amount || 0).toFixed(2),
              ])}
            />
          </div>
          <div style={styles.totalsBox}>
            <TotalRow label="Item Rent Amount" value={invoice.itemRentTotal} />
            {invoice.serviceTotal > 0 && <TotalRow label="  — of which Service Charges" value={invoice.serviceTotal} />}
            <TotalRow label="Transport Charges" value={invoice.transportTotal} />
            {invoice.gst?.applicable ? (
              <>
                <TotalRow label="Taxable Value" value={invoice.gst.taxableValue} bold />
                {invoice.gst.gstType === "IGST" ? (
                  <TotalRow label={`IGST @ ${invoice.gst.rate}%`} value={invoice.gst.igst} />
                ) : (
                  <>
                    <TotalRow label={`CGST @ ${invoice.gst.rate / 2}%`} value={invoice.gst.cgst} />
                    <TotalRow label={`SGST @ ${invoice.gst.rate / 2}%`} value={invoice.gst.sgst} />
                  </>
                )}
                <TotalRow label="Deposit (deducted)" value={-invoice.depositTotal} />
                <TotalRow label="Grand Total (incl. GST)" value={invoice.finalTotal ?? invoice.netTotal} big />
              </>
            ) : (
              <>
                <TotalRow label="Deposit (deducted)" value={-invoice.depositTotal} />
                <TotalRow label="Net Total" value={invoice.netTotal} big />
              </>
            )}
          </div>
    </div>
  );
}

// Companion "Pending Items & Balance" statement — a standalone document
// (own letterhead + party/invoice header, same as InvoiceSheet) rather than
// a section tacked onto the invoice. Rendered as its own PDF, one per party,
// alongside (not inside) that party's invoice PDF — see BulkInvoiceBuilder.
// Shows items the party is still holding (not yet returned), plus the
// running balance including this invoice.
function AccountSummarySheet({ data, invoice, accountSummary }) {
  return (
    <div className="invoice-sheet" style={styles.invoiceSheet}>
      <InvoiceLetterhead data={data} invoice={invoice} />
      <InvoicePartyHeader data={data} invoice={invoice} />
      <div style={{ fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
        Pending Items &amp; Balance
      </div>
      {accountSummary.pendingItems.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.muted, marginBottom: 4 }}>
            Items Currently With Party (Not Yet Returned)
          </div>
          <Table
            cols={["Item", "Qty Held"]}
            rows={accountSummary.pendingItems.map((r) => [itemName(data, r.itemId), r.current])}
          />
        </div>
      ) : (
        <div style={{ fontFamily: "'Public Sans', system-ui, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
          No items currently pending return with this party.
        </div>
      )}
      <div style={styles.totalsBox}>
        <TotalRow label="Balance Due Before This Invoice" value={accountSummary.priorBalance} />
        <TotalRow label="This Invoice Amount" value={accountSummary.thisInvoiceAmount} />
        <TotalRow label="Total Payable Now" value={accountSummary.totalPayable} big />
      </div>
    </div>
  );
}

function InvoicePrintView({ data, invoice }) {
  const [exporting, setExporting] = useState(false);
  // Which document is currently painted into the off-screen capture portal —
  // same two-pass pattern as BulkInvoiceBuilder ("invoice" then "summary")
  // so a single invoice download bundles its companion Pending Items &
  // Balance statement too, exactly like the bulk flow does per party.
  const [capture, setCapture] = useState(null);
  const captureRef = useRef(null);

  // Companion "Pending Items & Balance" data for this invoice's party.
  // Balance is computed excluding this invoice itself, so the statement
  // reads "what was owed before this invoice, this invoice, total now" —
  // same shape as the bulk-invoice companion statement.
  const accountSummary = useMemo(() => {
    const party = data.parties.find((p) => p.id === invoice.partyId);
    const openingBalance = round2(Number(party?.openingBalance) || 0);
    const partyInvoices = data.invoices.filter((i) => i.partyId === invoice.partyId && i.id !== invoice.id);
    const partyPayments = (data.payments || []).filter((p) => p.partyId === invoice.partyId);
    const invoiced = round2(partyInvoices.reduce((s, i) => s + i.netTotal, 0));
    const paid = round2(partyPayments.reduce((s, p) => s + p.amount, 0));
    const priorBalance = round2(openingBalance + invoiced - paid);
    const thisInvoiceAmount = invoice.finalTotal ?? invoice.netTotal;
    return {
      pendingItems: partyRentedItems(data, invoice.partyId),
      priorBalance,
      thisInvoiceAmount,
      totalPayable: round2(priorBalance + thisInvoiceAmount),
    };
  }, [data, invoice]);

  // Generates the invoice PDF and its Pending Items & Balance companion,
  // then bundles both into one .zip download — mirrors Bulk Invoice's
  // per-party output (invoice PDF + statement PDF) for a single invoice.
  const handlePrint = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const party = data.parties.find((p) => p.id === invoice.partyId);
      const partyLabel = sanitizeForFilename(party ? party.name : "Invoice");
      const dateLabel = invoice.billStart && invoice.billEnd
        ? `${sanitizeForFilename(fmtDateDisplay(invoice.billStart))} - ${sanitizeForFilename(fmtDateDisplay(invoice.billEnd))}`
        : "";
      const baseLabel = dateLabel ? `${partyLabel} - ${dateLabel}` : partyLabel;

      const JSZip = await loadJSZip();
      const zip = new JSZip();

      setCapture({ kind: "invoice" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const invoiceBlob = await pdfBlobFromNode(captureRef.current);
      zip.file(`${baseLabel}.pdf`, invoiceBlob);

      setCapture({ kind: "summary" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const summaryBlob = await pdfBlobFromNode(captureRef.current);
      zip.file(`${baseLabel} - Pending Items & Balance.pdf`, summaryBlob);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseLabel}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setExporting(false);
      setCapture(null);
    }
  };

  return (
    <Panel title={`Invoice #${invoice.invoiceNo}`}>
      <div className="no-print" style={{ marginBottom: 14 }}>
        <button style={styles.primaryBtn} disabled={exporting} onClick={confirmClick(handlePrint, "Generate and download this PDF?")}>
          <Printer size={15} /> {exporting ? "Generating…" : "Download PDF (Invoice + Pending Items & Balance)"}
        </button>
      </div>
      <InvoiceSheet data={data} invoice={invoice} />
      {/* Off-screen node used purely for PDF capture — never shown, only
          painted for html2canvas to read. See handlePrint above. */}
      <PrintPortal extraClass="print-portal--invoice" domRef={captureRef}>
        {capture && (
          capture.kind === "invoice"
            ? <InvoiceSheet data={data} invoice={invoice} />
            : <AccountSummarySheet data={data} invoice={invoice} accountSummary={accountSummary} />
        )}
      </PrintPortal>
    </Panel>
  );
}

/* ---------------- Party Ledger ---------------- */

const emptyPaymentForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  mode: "Cash",
  note: "",
});

function PartyLedger({ data, persist, markTyping }) {
  const [partyId, setPartyId] = useState("");
  const [paymentForm, setPaymentForm, resetPaymentForm, resetPaymentFormLocal, clearedPaymentDrafts] = useDraftForm("paymentForm", emptyPaymentForm(), data, persist, markTyping);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null);
  const party = data.parties.find((p) => p.id === partyId);

  // reset the payment form whenever the selected party changes
  useEffect(() => {
    resetPaymentFormLocal(emptyPaymentForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  // Opening Balance is edited right here, not in Party Master — kept in its
  // own input, synced whenever the selected party (or their stored value)
  // changes, so switching parties doesn't carry over a half-typed number.
  const [openingBalanceInput, setOpeningBalanceInput] = useState("");
  useEffect(() => {
    setOpeningBalanceInput(party ? String(party.openingBalance ?? "") : "");
  }, [partyId, party?.openingBalance]);

  const openingBalanceDirty = party && Number(openingBalanceInput || 0) !== round2(Number(party.openingBalance) || 0);

  const saveOpeningBalance = () => {
    if (!partyId) return;
    const value = Number(openingBalanceInput) || 0;
    persist({
      ...data,
      parties: data.parties.map((p) => (p.id === partyId ? { ...p, openingBalance: value } : p)),
    });
  };

  // Which report (if any) is currently being turned into a PDF — used to
  // disable/relabel the triggering button so a second tap can't overlap it.
  const [exportingKey, setExportingKey] = useState(null);

  // Renders the matching print-portal to a PDF and downloads it directly.
  // See exportPortalToPdf's comment near the top of the file for why we
  // generate the PDF ourselves instead of using window.print().
  const triggerPrint = async (key, portalClass) => {
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const label = key === "ledger-timeline" ? "Timeline" : "Currently Rented";
      const filename = `${sanitizeForFilename(party ? `${party.code} - ${party.name}` : "Party")} - ${label}`;
      await exportPortalToPdf(portalClass, filename);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setExportingKey(null);
    }
  };

  const canSavePayment = partyId && Number(paymentForm.amount) > 0;

  const addPayment = () => {
    if (!canSavePayment) return;
    const next = {
      ...data,
      payments: [
        ...(data.payments || []),
        {
          id: crypto.randomUUID(),
          partyId,
          date: paymentForm.date,
          amount: Number(paymentForm.amount),
          mode: paymentForm.mode,
          note: paymentForm.note || "",
        },
      ],
    };
    persist({ ...next, drafts: clearedPaymentDrafts() });
    resetPaymentFormLocal(emptyPaymentForm());
  };

  const deletePayment = (id) => {
    const payment = (data.payments || []).find((p) => p.id === id);
    if (!payment) return;
    moveToBin(data, persist, "payment", payment, `₹${payment.amount} — ${partyName(data, payment.partyId)} (${payment.mode})`);
    setConfirmDeletePaymentId(null);
  };

  const rentedItems = useMemo(() => {
    if (!partyId) return [];
    // partyRentedItems already filters to current > 0; the ledger tab wants
    // every item ever delivered (including fully-returned ones), so it
    // recomputes the same delivered/returned pair without that filter.
    const itemIds = new Set();
    for (const c of data.deliveryChallans) {
      if (c.partyId !== partyId) continue;
      for (const l of c.lines) itemIds.add(l.itemId);
    }
    return [...itemIds]
      .map((itemId) => {
        const delivered = deliveredQty(data, partyId, itemId);
        const returned = returnedQty(data, partyId, itemId);
        return { itemId, delivered, returned, current: delivered - returned };
      })
      .sort((a, b) => b.current - a.current);
  }, [data, partyId]);

  const timeline = useMemo(() => {
    if (!partyId) return [];
    const events = [];
    for (const c of data.deliveryChallans) {
      if (c.partyId !== partyId) continue;
      events.push({
        type: "delivery",
        date: c.date,
        label: `Delivery #${c.challanNo}`,
        detail: c.lines.map((l) => `${itemName(data, l.itemId)} × ${l.qty}`).join(", "),
        amount: null,
      });
    }
    for (const c of data.returnChallans) {
      if (c.partyId !== partyId) continue;
      events.push({
        type: "return",
        date: c.date,
        label: `Return #${c.returnChallanNo}`,
        detail: c.lines
          .map((l) => `${itemName(data, l.itemId)} × ${l.qty}${Number(l.brokenQty) > 0 ? ` (broken ${l.brokenQty})` : ""}`)
          .join(", "),
        amount: null,
      });
    }
    for (const inv of data.invoices) {
      if (inv.partyId !== partyId) continue;
      events.push({
        type: "invoice",
        date: inv.invoiceDate,
        label: `Invoice #${inv.invoiceNo}`,
        detail: `Billing period ${fmtDateDisplay(inv.billStart)} → ${fmtDateDisplay(inv.billEnd)}`,
        amount: inv.netTotal,
      });
    }
    for (const p of data.payments || []) {
      if (p.partyId !== partyId) continue;
      events.push({
        type: "payment",
        date: p.date,
        label: `Payment (${p.mode})`,
        // amount kept positive here — the "payment" type tag already distinguishes
        // it from invoice charges, matching how invoice amounts are shown
        detail: p.note || "—",
        amount: p.amount,
      });
    }
    const openingBalance = round2(Number(party?.openingBalance) || 0);
    if (openingBalance !== 0) {
      events.push({
        type: "opening",
        date: "1900-01-01", // sorts to the very bottom regardless of other dates
        label: "Opening Balance",
        detail: "Carried over from before this system was in use",
        amount: openingBalance,
      });
    }
    return events.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data, partyId, party]);

  const totals = useMemo(() => {
    if (!partyId) return null;
    return partyLedgerTotals(data, partyId);
  }, [data, partyId]);

  const typeTagStyle = (type) => {
    if (type === "invoice") return { ...styles.tinyTag, background: "#eaf5ea", color: "#2e7d32" };
    if (type === "return") return { ...styles.tinyTag, background: "#fbeceb", color: COLORS.danger };
    if (type === "payment") return { ...styles.tinyTag, background: "#e6f0fb", color: "#1d5fa8" };
    if (type === "opening") return { ...styles.tinyTag, background: "#fff3cd", color: "#856404" };
    return styles.tinyTag;
  };

  return (
    <div>
      <PageHeader title="Party Ledger" subtitle="Full history for one party — deliveries, returns, and invoices, in a single timeline." />

      <Panel title="Select Party">
        <div className="form-row" style={styles.formRow}>
          <SelectField
            label="Party"
            value={partyId}
            onChange={setPartyId}
            options={data.parties.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
        </div>
      </Panel>

      {!party && <Empty text="Pick a party above to see their full history." />}

      {party && (
        <>
          <Panel title="Opening Balance" hint="What this party already owed before starting on this system — carried forward into Balance Due below.">
            <div className="form-row" style={styles.formRow}>
              <Field
                label="Opening Balance (₹)"
                type="number"
                value={openingBalanceInput}
                placeholder="0"
                onChange={setOpeningBalanceInput}
              />
              <button
                style={{ ...styles.primaryBtn, alignSelf: "flex-end" }}
                onClick={confirmClick(saveOpeningBalance, "Save the opening balance?")}
                disabled={!openingBalanceDirty}
              >
                <CheckCircle2 size={15} /> Save
              </button>
            </div>
          </Panel>

          <div style={styles.statRow}>
            <StatCard label="Items currently rented" value={rentedItems.filter((r) => r.current > 0).length} />
            <StatCard label="Opening balance (₹)" value={totals.openingBalance.toFixed(2)} />
            <StatCard label="Invoices raised" value={totals.invoiceCount} />
            <StatCard label="Total invoiced (₹)" value={totals.invoiced.toFixed(2)} />
            <StatCard label="Paid (₹)" value={totals.paid.toFixed(2)} />
            <StatCard label="Balance due (₹)" value={totals.balanceDue.toFixed(2)} />
          </div>

          <Panel title="Record a Payment" hint="Simple record-keeping — no receipts or gateway integration">
            <div className="form-row" style={styles.formRow}>
              <Field label="Date" type="date" value={paymentForm.date} onChange={(v) => setPaymentForm({ ...paymentForm, date: v })} />
              <Field label="Amount (₹)" type="number" value={paymentForm.amount} placeholder="0" onChange={(v) => setPaymentForm({ ...paymentForm, amount: v })} />
              <SelectField
                label="Mode"
                value={paymentForm.mode}
                onChange={(v) => setPaymentForm({ ...paymentForm, mode: v })}
                options={["Cash", "Bank Transfer", "UPI", "Cheque"].map((m) => ({ value: m, label: m }))}
              />
              <Field label="Note" value={paymentForm.note} placeholder="e.g. cheque no." onChange={(v) => setPaymentForm({ ...paymentForm, note: v })} wide />
            </div>
            <button style={{ ...styles.primaryBtn, opacity: canSavePayment ? 1 : 0.5 }} disabled={!canSavePayment} onClick={confirmClick(addPayment, "Add this payment?")}>
              <CheckCircle2 size={15} /> Save Payment
            </button>

            {(data.payments || []).filter((p) => p.partyId === partyId).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Table
                  cols={["Date", "Amount (₹)", "Mode", "Note", ""]}
                  rows={[...(data.payments || [])]
                    .filter((p) => p.partyId === partyId)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((p) => [
                      fmtDateDisplay(p.date),
                      p.amount.toFixed(2),
                      p.mode,
                      p.note || "—",
                      <ConfirmDelete
                        id={p.id}
                        confirmId={confirmDeletePaymentId}
                        setConfirmId={setConfirmDeletePaymentId}
                        onConfirm={deletePayment}
                        label="Move to bin?"
                        title="Delete payment"
                      />,
                    ])}
                />
              </div>
            )}
          </Panel>

          {(() => {
            const rentedContent = (
              <>
                <div style={styles.invoiceLetterhead}>
                  <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
                  <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
                  <div style={styles.invoiceAddress}>
                    {(data.company || DEFAULT_COMPANY).address} · {(data.company || DEFAULT_COMPANY).email}
                  </div>
                  <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>CURRENTLY RENTED — {party.code} — {party.name}</div>
                </div>
                <Panel title="Currently Rented" hint="Delivered − returned, per item">
                  {rentedItems.length === 0 ? (
                    <Empty text="No deliveries recorded for this party." />
                  ) : (
                    <Table
                      cols={["Item", "Delivered", "Returned", "Currently Rented"]}
                      rows={rentedItems.map((r) => [
                        `${itemCode(data, r.itemId)} — ${itemName(data, r.itemId)}`,
                        r.delivered,
                        r.returned,
                        <strong style={{ color: r.current > 0 ? "var(--amber)" : "var(--muted)" }}>{r.current}</strong>,
                      ])}
                    />
                  )}
                </Panel>
              </>
            );
            return (
              <div>
                <div style={{ marginBottom: 10 }}>
                  <button style={styles.primaryBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("ledger-rented", "print-portal--ledger-rented"), "Generate and download the PDF?")}>
                    <Printer size={15} /> {exportingKey === "ledger-rented" ? "Generating…" : "Download PDF"}
                  </button>
                </div>
                {rentedContent}
                <PrintPortal extraClass="print-portal--ledger-rented">{rentedContent}</PrintPortal>
              </div>
            );
          })()}

          {(() => {
            const timelineContent = (
              <>
                <div style={styles.invoiceLetterhead}>
                  <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
                  <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
                  <div style={styles.invoiceAddress}>
                    {(data.company || DEFAULT_COMPANY).address} · {(data.company || DEFAULT_COMPANY).email}
                  </div>
                  <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>TIMELINE — {party.code} — {party.name}</div>
                </div>
                <Panel title={`Timeline (${timeline.length} events)`} hint="Most recent first">
                  {timeline.length === 0 ? (
                    <Empty text="No activity recorded for this party yet." />
                  ) : (
                    <Table
                      cols={["Date", "Type", "Reference", "Details", "Amount"]}
                      rows={timeline.map((e) => [
                        e.type === "opening" ? "—" : fmtDateDisplay(e.date),
                        <em style={typeTagStyle(e.type)}>{e.type}</em>,
                        e.label,
                        e.detail,
                        e.amount != null ? `₹ ${e.amount.toFixed(2)}` : "—",
                      ])}
                    />
                  )}
                </Panel>
              </>
            );
            return (
              <div>
                <div style={{ marginBottom: 10 }}>
                  <button style={styles.primaryBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("ledger-timeline", "print-portal--ledger-timeline"), "Generate and download the PDF?")}>
                    <Printer size={15} /> {exportingKey === "ledger-timeline" ? "Generating…" : "Download PDF"}
                  </button>
                </div>
                {timelineContent}
                <PrintPortal extraClass="print-portal--ledger-timeline">{timelineContent}</PrintPortal>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function TotalRow({ label, value, bold, big }) {
  return (
    <div style={{ ...styles.totalRow, ...(big ? styles.totalRowBig : {}) }}>
      <span style={{ fontWeight: bold || big ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold || big ? 700 : 400 }}>₹ {Number(value).toFixed(2)}</span>
    </div>
  );
}

/* ---------------- Party Balances ---------------- */

// A single at-a-glance view of every party's running balance, plus every
// payment ever recorded — both totalled. Reuses partyLedgerTotals() so the
// numbers here always match what each party's own Ledger tab shows.
function PartyBalances({ data }) {
  const [exportingKey, setExportingKey] = useState(null);

  const triggerPrint = async (key, portalClass) => {
    if (exportingKey) return;
    setExportingKey(key);
    try {
      const today = fmtDateDisplay(new Date().toISOString().slice(0, 10));
      const label = key === "balances" ? "Party Balances" : "Payments Received";
      await exportPortalToPdf(portalClass, `${sanitizeForFilename(label)} - ${sanitizeForFilename(today)}`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setExportingKey(null);
    }
  };

  const balances = useMemo(() => {
    return data.parties
      .map((p) => ({ party: p, ...partyLedgerTotals(data, p.id) }))
      .sort((a, b) => b.balanceDue - a.balanceDue);
  }, [data]);

  const balanceTotals = useMemo(() => {
    return balances.reduce(
      (acc, r) => ({
        openingBalance: round2(acc.openingBalance + r.openingBalance),
        invoiced: round2(acc.invoiced + r.invoiced),
        paid: round2(acc.paid + r.paid),
        balanceDue: round2(acc.balanceDue + r.balanceDue),
      }),
      { openingBalance: 0, invoiced: 0, paid: 0, balanceDue: 0 }
    );
  }, [balances]);

  const payments = useMemo(() => {
    return [...(data.payments || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data.payments]);

  const paymentsTotal = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));

  return (
    <div>
      <PageHeader title="Party Balances" subtitle="Every party's running balance, and every payment received, in one place." />

      <div style={styles.statRow}>
        <StatCard label="Parties" value={data.parties.length} />
        <StatCard label="Total invoiced (₹)" value={balanceTotals.invoiced.toFixed(2)} />
        <StatCard label="Total received (₹)" value={balanceTotals.paid.toFixed(2)} />
        <StatCard label="Total balance due (₹)" value={balanceTotals.balanceDue.toFixed(2)} />
      </div>

      {(() => {
        const balancesContent = (
          <>
            <div style={styles.invoiceLetterhead}>
              <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
              <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
              <div style={styles.invoiceAddress}>{(data.company || DEFAULT_COMPANY).address}</div>
              <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>PARTY BALANCES</div>
            </div>
            <Panel title="Party Balances" hint="Opening Balance + Invoiced − Paid, per party">
              {balances.length === 0 ? (
                <Empty text="No parties yet — add one in Party Master." />
              ) : (
                <Table
                  cols={["Party", "Opening Bal. (₹)", "Invoiced (₹)", "Paid (₹)", "Balance Due (₹)"]}
                  rows={[
                    ...balances.map((r) => [
                      `${r.party.code} — ${r.party.name}`,
                      r.openingBalance.toFixed(2),
                      r.invoiced.toFixed(2),
                      r.paid.toFixed(2),
                      <strong style={{ color: r.balanceDue > 0 ? COLORS.danger : COLORS.muted }}>{r.balanceDue.toFixed(2)}</strong>,
                    ]),
                    [
                      <strong>Total</strong>,
                      <strong>{balanceTotals.openingBalance.toFixed(2)}</strong>,
                      <strong>{balanceTotals.invoiced.toFixed(2)}</strong>,
                      <strong>{balanceTotals.paid.toFixed(2)}</strong>,
                      <strong>{balanceTotals.balanceDue.toFixed(2)}</strong>,
                    ],
                  ]}
                />
              )}
            </Panel>
          </>
        );
        return (
          <div>
            <div className="no-print" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
              <button style={styles.ghostBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("balances", "print-portal--party-balances"), "Generate and download the PDF?")}>
                <Printer size={13} /> {exportingKey === "balances" ? "Generating…" : "Download PDF"}
              </button>
            </div>
            {balancesContent}
            <PrintPortal extraClass="print-portal--party-balances">{balancesContent}</PrintPortal>
          </div>
        );
      })()}

      {(() => {
        const paymentsContent = (
          <>
            <div style={styles.invoiceLetterhead}>
              <div style={styles.invoiceCompany}>{(data.company || DEFAULT_COMPANY).name}</div>
              <div style={styles.invoiceTagline}>{(data.company || DEFAULT_COMPANY).tagline}</div>
              <div style={styles.invoiceAddress}>{(data.company || DEFAULT_COMPANY).address}</div>
              <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>PAYMENTS RECEIVED</div>
            </div>
            <Panel title={`Payments Received (${payments.length})`} hint="Every payment logged in Party Ledger, newest first">
              {payments.length === 0 ? (
                <Empty text="No payments recorded yet — log one from a party's Party Ledger tab." />
              ) : (
                <Table
                  cols={["Date", "Party", "Mode", "Note", "Amount (₹)"]}
                  rows={[
                    ...payments.map((p) => [
                      fmtDateDisplay(p.date),
                      partyName(data, p.partyId),
                      p.mode,
                      p.note || "—",
                      (Number(p.amount) || 0).toFixed(2),
                    ]),
                    [<strong>Total</strong>, "", "", "", <strong>{paymentsTotal.toFixed(2)}</strong>],
                  ]}
                />
              )}
            </Panel>
          </>
        );
        return (
          <div>
            <div className="no-print" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
              <button style={styles.ghostBtn} disabled={!!exportingKey} onClick={confirmClick(() => triggerPrint("payments", "print-portal--party-payments"), "Generate and download the PDF?")}>
                <Printer size={13} /> {exportingKey === "payments" ? "Generating…" : "Download PDF"}
              </button>
            </div>
            {paymentsContent}
            <PrintPortal extraClass="print-portal--party-payments">{paymentsContent}</PrintPortal>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------------- Expenses & Balance Sheet ---------------- */

const emptyExpenseForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  category: "",
  amount: "",
  note: "",
});

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

function Expenses({ data, persist, markTyping }) {
  const [form, setForm, resetForm, resetFormLocal, clearedDrafts] = useDraftForm("expenseForm", emptyExpenseForm(), data, persist, markTyping);
  const [customCategory, setCustomCategory] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const initialPeriod = defaultPeriod();
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const categories = data.expenseCategories && data.expenseCategories.length ? data.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;

  const canSaveExpense = form.category && Number(form.amount) > 0;

  const addExpense = () => {
    if (!canSaveExpense) return;
    const next = {
      ...data,
      expenses: [
        ...(data.expenses || []),
        {
          id: crypto.randomUUID(),
          date: form.date,
          category: form.category,
          amount: Number(form.amount),
          note: form.note || "",
        },
      ],
    };
    persist({ ...next, drafts: clearedDrafts() });
    resetFormLocal(emptyExpenseForm());
  };

  const deleteExpense = (id) => {
    const expense = (data.expenses || []).find((e) => e.id === id);
    if (!expense) return;
    moveToBin(data, persist, "expense", expense, `${expense.category} — ₹${expense.amount}`);
    setConfirmDeleteId(null);
  };

  const addCustomCategory = () => {
    const name = customCategory.trim();
    if (!name) return;
    const existing = data.expenseCategories && data.expenseCategories.length ? data.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
    if (existing.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setForm({ ...form, category: existing.find((c) => c.toLowerCase() === name.toLowerCase()) });
      setCustomCategory("");
      setAddingCustom(false);
      return;
    }
    const nextCategories = [...existing, name];
    const updatedForm = { ...form, category: name };
    // Single write: category list change + draft update together, so the
    // draft's own (stale-by-then) debounced save can't race and undo the
    // new category a moment later.
    persist({ ...data, expenseCategories: nextCategories, drafts: { ...(data.drafts || {}), expenseForm: updatedForm } });
    resetFormLocal(updatedForm);
    setCustomCategory("");
    setAddingCustom(false);
  };

  // all expenses in the selected period, most recent first
  const periodExpenses = useMemo(() => {
    if (!periodStart || !periodEnd) return [];
    return (data.expenses || [])
      .filter((e) => e.date >= periodStart && e.date <= periodEnd)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data, periodStart, periodEnd]);

  // all payments received from parties in the selected period, most recent first
  const periodPayments = useMemo(() => {
    if (!periodStart || !periodEnd) return [];
    return (data.payments || [])
      .filter((p) => p.date >= periodStart && p.date <= periodEnd)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data, periodStart, periodEnd]);

  const categoryBreakdown = useMemo(() => {
    const byCategory = {};
    for (const e of periodExpenses) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    }
    return Object.entries(byCategory)
      .map(([category, total]) => ({ category, total: round2(total) }))
      .sort((a, b) => b.total - a.total);
  }, [periodExpenses]);

  const totals = useMemo(() => {
    const totalSpent = round2(periodExpenses.reduce((s, e) => s + e.amount, 0));
    const totalReceived = round2(periodPayments.reduce((s, p) => s + p.amount, 0));
    return { totalSpent, totalReceived, net: round2(totalReceived - totalSpent) };
  }, [periodExpenses, periodPayments]);

  const partyLabel = (partyId) => {
    const p = data.parties.find((x) => x.id === partyId);
    return p ? `${p.code} — ${p.name}` : "—";
  };

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Log spending and see a period balance sheet — total spend vs. payments received from parties." />

      <Panel title="Log an Expense">
        <div className="form-row" style={styles.formRow}>
          <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          <SelectField
            label="Category"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
          <Field label="Amount (₹)" type="number" value={form.amount} placeholder="0" onChange={(v) => setForm({ ...form, amount: v })} />
          <Field label="Note" value={form.note} placeholder="e.g. site name, purpose" onChange={(v) => setForm({ ...form, note: v })} wide />
        </div>

        {!addingCustom ? (
          <button style={styles.iconBtn} onClick={confirmClick(() => setAddingCustom(true), "Are you sure?")}>
            <Plus size={14} /> Add custom category
          </button>
        ) : (
          <div className="form-row" style={styles.formRow}>
            <Field label="New category" value={customCategory} placeholder="e.g. Equipment Purchase" onChange={setCustomCategory} wide />
            <button style={styles.primaryBtn} onClick={confirmClick(addCustomCategory, "Add this category?")}>
              <CheckCircle2 size={15} /> Add
            </button>
            <button style={styles.iconBtn} onClick={confirmClick(() => { setAddingCustom(false); setCustomCategory(""); }, "Are you sure?")}>
              <X size={14} />
            </button>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button style={{ ...styles.primaryBtn, opacity: canSaveExpense ? 1 : 0.5 }} disabled={!canSaveExpense} onClick={confirmClick(addExpense, "Add this expense?")}>
            <CheckCircle2 size={15} /> Save Expense
          </button>
        </div>
      </Panel>

      <Panel title="Balance Sheet" hint="Pick a period to see spend vs. payments received">
        <div className="form-row" style={styles.formRow}>
          <Field label="From" type="date" value={periodStart} onChange={setPeriodStart} />
          <Field label="To" type="date" value={periodEnd} onChange={setPeriodEnd} />
        </div>

        <div style={styles.statRow}>
          <StatCard label="Total Spent (₹)" value={totals.totalSpent.toFixed(2)} />
          <StatCard label="Received from Parties (₹)" value={totals.totalReceived.toFixed(2)} />
          <StatCard label="Net (₹)" value={totals.net.toFixed(2)} />
        </div>

        <div style={{ marginTop: 16 }}>
          <h2 style={styles.h2}>Spend by Category</h2>
          {categoryBreakdown.length === 0 ? (
            <Empty text="No expenses recorded in this period." />
          ) : (
            <Table
              cols={["Category", "Total (₹)"]}
              rows={categoryBreakdown.map((c) => [c.category, c.total.toFixed(2)])}
            />
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <h2 style={styles.h2}>Payments Received from Parties</h2>
          {periodPayments.length === 0 ? (
            <Empty text="No payments received in this period." />
          ) : (
            <Table
              cols={["Date", "Party", "Amount (₹)", "Mode", "Note"]}
              rows={periodPayments.map((p) => [
                fmtDateDisplay(p.date),
                partyLabel(p.partyId),
                p.amount.toFixed(2),
                p.mode,
                p.note || "—",
              ])}
            />
          )}
        </div>
      </Panel>

      <Panel title="All Expenses in Period">
        {periodExpenses.length === 0 ? (
          <Empty text="No expenses recorded in this period." />
        ) : (
          <Table
            cols={["Date", "Category", "Amount (₹)", "Note", ""]}
            rows={periodExpenses.map((e) => [
              fmtDateDisplay(e.date),
              e.category,
              e.amount.toFixed(2),
              e.note || "—",
              <ConfirmDelete
                id={e.id}
                confirmId={confirmDeleteId}
                setConfirmId={setConfirmDeleteId}
                onConfirm={deleteExpense}
                label="Move to bin?"
                title="Delete expense"
              />,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Recycle Bin ---------------- */

function RecycleBin({ data, persist }) {
  const [confirmPurgeId, setConfirmPurgeId] = useState(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState(null);

  const entries = [...(data.recycleBin || [])].sort(
    (a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)
  );

  const daysLeft = (deletedAt) => {
    const elapsedMs = Date.now() - new Date(deletedAt).getTime();
    const remainingMs = BIN_RETENTION_MS - elapsedMs;
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  };

  const restore = (binId) => {
    restoreFromBin(data, persist, binId);
    setConfirmRestoreId(null);
  };
  const purge = (binId) => {
    purgeFromBin(data, persist, binId);
    setConfirmPurgeId(null);
  };

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        subtitle={`Deleted parties, items, challans, invoices, payments, and expenses land here first. They're kept for ${BIN_RETENTION_DAYS} days, then removed automatically.`}
      />
      <Panel title={`In Bin (${entries.length})`}>
        {entries.length === 0 ? (
          <Empty text="Nothing in the recycle bin right now." />
        ) : (
          <Table
            cols={["Type", "Details", "Deleted On", "Days Left", ""]}
            rows={entries.map((e) => [
              <span style={styles.tinyTag}>{BIN_TYPE_META[e.type]?.label || e.type}</span>,
              e.summary || "—",
              fmtDateDisplay(e.deletedAt.slice(0, 10)),
              <span style={{ color: daysLeft(e.deletedAt) <= 1 ? COLORS.danger : "inherit" }}>
                {daysLeft(e.deletedAt)} {daysLeft(e.deletedAt) === 1 ? "day" : "days"}
              </span>,
              confirmRestoreId === e.binId ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif" }}>Restore this item?</span>
                  <button style={{ ...styles.iconBtn, color: "#2e7d32", borderColor: "#2e7d32" }} onClick={confirmClick(() => restore(e.binId), "Restore this item from the recycle bin?")} title="Confirm restore"><CheckCircle2 size={14} /></button>
                  <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmRestoreId(null), "Are you sure?")} title="Cancel"><X size={14} /></button>
                </div>
              ) : confirmPurgeId === e.binId ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif" }}>Delete forever?</span>
                  <button style={{ ...styles.iconBtn, color: "#b3261e", borderColor: "#b3261e" }} onClick={confirmClick(() => purge(e.binId), "Permanently delete this item? This cannot be undone.")} title="Confirm"><CheckCircle2 size={14} /></button>
                  <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmPurgeId(null), "Are you sure?")} title="Cancel"><X size={14} /></button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.ghostBtn} onClick={confirmClick(() => setConfirmRestoreId(e.binId), "Are you sure?")}>Restore</button>
                  <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmPurgeId(e.binId), "Are you sure?")} title="Delete forever"><Trash2 size={14} /></button>
                </div>
              ),
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Backup & Restore ---------------- */

function BackupRestore({ data, persist }) {
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mahalaxmi-stockengine-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportOk(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.parties || !parsed.items || !parsed.deliveryChallans) {
          throw new Error("This file doesn't look like a Stock Engine backup.");
        }
        persist({ ...emptyData(), ...parsed });
        setImportOk(true);
      } catch (err) {
        setImportError(err.message || "Couldn't read that file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const reloadSeed = () => {
    persist(buildSeedData());
    setConfirmSeed(false);
    setImportOk(true);
  };

  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="Your data lives in this browser's storage — export a copy regularly so nothing is ever at risk." />

      <Panel title="Export Backup">
        <p style={styles.plainText}>
          Downloads everything — parties, items, delivery & return challans, and saved invoices — as one JSON file.
        </p>
        <button style={styles.primaryBtn} onClick={confirmClick(exportData, "Export all data as a backup file?")}><Download size={15} /> Download Backup</button>
      </Panel>

      <Panel title="Restore from Backup">
        <p style={styles.plainText}>
          Importing <strong>replaces all current data</strong> with the contents of the file. Export a fresh backup first if you want to keep what's here now.
        </p>
        {importError && <Notice text={importError} />}
        {importOk && <div style={styles.okNotice}><CheckCircle2 size={14} /> Restored successfully.</div>}
        <label style={styles.ghostBtn}>
          <Upload size={14} /> Choose backup file…
          <input type="file" accept="application/json" onChange={importFile} style={{ display: "none" }} />
        </label>
      </Panel>

      <Panel title="Reload Historical Data from Excel" hint="Parties, items, deliveries & returns from your original workbook">
        <p style={styles.plainText}>
          Reloads the 19 parties, 23 items, and every delivery & return challan carried over from your Excel file
          (2 rows with missing dates/items and 1 row with a corrupted 1900 return date were skipped as unusable).
          This <strong>replaces all current data</strong> — export a backup first if you've entered anything new since.
        </p>
        {confirmSeed ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: COLORS.danger, fontFamily: "'Public Sans', system-ui, sans-serif" }}>Replace all current data with the Excel import?</span>
            <button style={{ ...styles.primaryBtn, background: COLORS.danger }} onClick={confirmClick(reloadSeed, "Replace all current data with the Excel import? This cannot be undone.")}><CheckCircle2 size={14} /> Yes, reload it</button>
            <button style={styles.ghostBtn} onClick={confirmClick(() => setConfirmSeed(false), "Are you sure?")}><X size={13} /> Cancel</button>
          </div>
        ) : (
          <button style={styles.ghostBtn} onClick={confirmClick(() => setConfirmSeed(true), "Are you sure?")}><Upload size={14} /> Reload from Excel</button>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Company Settings ---------------- */

function CompanySettings({ data, persist, markTyping }) {
  const current = { ...DEFAULT_COMPANY, ...(data.company || {}) };
  const [form, setForm, resetForm, resetFormLocal, clearedDrafts] = useDraftForm("companySettingsForm", current, data, persist, markTyping);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(current);

  const save = () => {
    // Single write: the letterhead change + the draft-clear together, so
    // the debounced draft save can't fire afterward and undo it.
    persist({ ...data, company: { ...form }, drafts: clearedDrafts() });
    resetFormLocal(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const resetDefaults = () => setForm({ ...DEFAULT_COMPANY });

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="This is the letterhead printed on every invoice — name, tagline, address and contact." />
      <Panel title="Letterhead">
        <div className="form-row" style={styles.formRow}>
          <Field label="Company Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} wide />
        </div>
        <div className="form-row" style={styles.formRow}>
          <Field label="Tagline" value={form.tagline} onChange={(v) => setForm({ ...form, tagline: v })} wide />
        </div>
        <div className="form-row" style={styles.formRow}>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} wide />
        </div>
        <div className="form-row" style={styles.formRow}>
          <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Company GSTIN" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v })} placeholder="e.g. 24AAAAA0000A1Z5" />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <button style={{ ...styles.primaryBtn, opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={confirmClick(save, "Save this entry?")}>
            <CheckCircle2 size={15} /> Save Letterhead
          </button>
          <button style={styles.ghostBtn} onClick={confirmClick(resetDefaults, "Reset all settings to default?")}>Reset to default</button>
          {saved && <span style={styles.okNotice}><CheckCircle2 size={14} /> Saved</span>}
        </div>
      </Panel>

      <Panel title="Preview" hint="How it appears on a printed invoice">
        <div style={styles.invoiceCompany}>{form.name}</div>
        <div style={styles.invoiceTagline}>{form.tagline}</div>
        <div style={styles.invoiceAddress}>{form.address} · {form.email}{form.gstin ? ` · GSTIN: ${form.gstin}` : ""}</div>
      </Panel>
    </div>
  );
}

/* ---------------- shared UI atoms ---------------- */

function PageHeader({ title, subtitle }) {
  return (
    <div className="ui-pagehead" style={styles.pageHeader}>
      <h1 style={styles.h1}>{title}</h1>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
function Panel({ title, hint, children }) {
  return (
    <div className="ui-panel" style={styles.panel}>
      <div style={styles.panelHeader}>
        <h2 style={styles.h2}>{title}</h2>
        {hint && <span style={styles.hint}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
// A two-step delete button: first click asks for confirmation inline
// (no browser confirm() popups), second click actually deletes. Used
// everywhere a destructive action needs "are you sure?" before it happens.
function ConfirmDelete({ id, confirmId, setConfirmId, onConfirm, label = "Delete this?", icon: Icon = Trash2, title = "Delete" }) {
  if (confirmId === id) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif" }}>{label}</span>
        <button style={{ ...styles.iconBtn, color: "#b3261e", borderColor: "#b3261e" }} onClick={confirmClick(() => onConfirm(id), "Are you sure?")} title="Confirm"><CheckCircle2 size={14} /></button>
        <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmId(null), "Are you sure?")} title="Cancel"><X size={14} /></button>
      </div>
    );
  }
  return (
    <button style={styles.iconBtn} onClick={confirmClick(() => setConfirmId(id), "Are you sure?")} title={title}><Icon size={14} /></button>
  );
}
function useCountUp(value) {
  // Animates numeric stat values from 0 -> value on mount/change.
  // Non-numeric values (pre-formatted strings) pass straight through.
  const raw = typeof value === "number" && isFinite(value) ? value : null;
  const [shown, setShown] = useState(raw ?? 0);
  useEffect(() => {
    if (raw === null) return;
    if (typeof window !== "undefined" && window.matchMedia
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(raw);
      return;
    }
    let frame;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 550);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(raw * eased * 100) / 100);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [raw]);
  return raw === null ? value : shown;
}
function StatCard({ label, value }) {
  const shown = useCountUp(value);
  return (
    <div className="ui-stat" style={styles.statCard}>
      <div style={styles.statValue}>{shown}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}
function Table({ cols, rows, serial = true }) {
  const allCols = serial ? ["#", ...cols] : cols;
  const allRows = serial ? rows.map((r, i) => [i + 1, ...r]) : rows;
  return (
    <div className="table-wrap" style={styles.tableWrap}>
      <table className="ui-table" style={styles.table}>
        <thead>
          <tr>{allCols.map((c, i) => <th key={i} style={styles.th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {allRows.map((r, i) => (
            <tr key={i} className="ui-row" style={{ ...styles.tr, animationDelay: `${Math.min(i, 12) * 22}ms` }}>
              {r.map((cell, j) => <td key={j} style={styles.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Empty({ text }) {
  return <div style={styles.empty}>{text}</div>;
}
function Notice({ text }) {
  return (
    <div style={styles.notice}>
      <AlertCircle size={14} />
      {text}
    </div>
  );
}
function Field({ label, value, onChange, type = "text", wide, placeholder }) {
  return (
    <label style={{ ...styles.field, flex: wide ? 2 : 1 }}>
      <span style={styles.fieldLabel}>{label}</span>
      <input style={styles.input} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function SelectField({ label, value, onChange, options }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <select style={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ---------------- styles ---------------- */

const COLORS = {
  bg: "#f9f8f6",        // paper
  panel: "#ffffff",
  ink: "#1c1917",
  muted: "#78716c",
  border: "#e7e5e4",
  amber: "#92400e",     // accent
  amberDeep: "#7c3208",
  danger: "#b3261e",
  sidebar: "#1c1917",
  sidebarInk: "#f2f0eb",
  surface: "#f2f0eb",
};

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap');
  :root { --amber: ${COLORS.amber}; --ink: ${COLORS.ink}; --muted: ${COLORS.muted}; --danger: ${COLORS.danger}; }
  * { box-sizing: border-box; }
  input, select { font-family: inherit; }
  input:focus, select:focus, button:focus-visible { outline: 2px solid ${COLORS.amber}; outline-offset: 1px; }
  ::placeholder { color: #b6a98f; }

  .print-portal { display: none; }

  @media print {
    @page { size: A4; margin: 10mm; }
    html, body { width: 100%; height: auto; background: #fff !important; }
    .app-shell { display: none !important; }
    /* Only the portal that was explicitly activated gets shown — all others
       stay hidden. Using a class (not inline style) beats the !important on
       the base rule and works correctly on mobile Safari / Chrome. */
    .print-portal { display: none !important; }
    body[data-print="invoice"]            .print-portal--invoice            { display: block !important; padding: 10mm; box-sizing: border-box; }
    body[data-print="dashboard-rented"]   .print-portal--dashboard-rented  { display: block !important; padding: 10mm; box-sizing: border-box; }
    body[data-print="dashboard-depot"]    .print-portal--dashboard-depot   { display: block !important; padding: 10mm; box-sizing: border-box; }
    body[data-print="dashboard-pending"]  .print-portal--dashboard-pending { display: block !important; padding: 10mm; box-sizing: border-box; }
    body[data-print="ledger-rented"]      .print-portal--ledger-rented     { display: block !important; padding: 10mm; box-sizing: border-box; }
    body[data-print="ledger-timeline"]    .print-portal--ledger-timeline   { display: block !important; padding: 10mm; box-sizing: border-box; }
    .print-page-break { page-break-after: always; }
    .table-wrap { max-height: none !important; overflow: visible !important; }
    .table-wrap table { width: 100%; }
    .table-wrap thead { display: table-header-group !important; }
    .table-wrap tr { page-break-inside: avoid; break-inside: avoid; }
    .invoice-sheet {
      width: 100% !important;
      max-width: none !important;
      box-sizing: border-box !important;
      border: none !important;
      border-radius: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    /* .sidebar and .mobile-backdrop use position:fixed + transition, which
       promotes them to their own GPU-composited layer on mobile. Android's
       "Save as PDF" print compositor can paint a composited fixed layer
       independently of the DOM tree — meaning ".app-shell { display: none }"
       above does NOT reliably suppress them, even though it should hide any
       normal (non-composited) descendant. This is very likely the actual
       source of the black/dark page: .sidebar's background is #241c14
       (near-black). Force these off explicitly and take them out of fixed
       positioning entirely during print, as defense in depth. */
    .sidebar, .mobile-backdrop, .mobile-topbar, .mobile-menu-btn, .mobile-close-btn {
      display: none !important;
      position: static !important;
    }
  }

  @media print and (orientation: landscape) {
    @page { size: A4 landscape; margin: 0; }
  }

  @media print and (orientation: portrait) {
    @page { size: A4 portrait; margin: 0; }
  }

  /* ---- Two-column grid (desktop default) ---- */
  /* ---------- Motion features (presentation only) ----------
     Everything here is additive CSS + class hooks: no data, totals or
     print output changes. All motion is disabled under
     prefers-reduced-motion and inside @media print. */
  @keyframes ui-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes ui-row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes ui-sheen { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
  @keyframes ui-fade { from { opacity: 0; } to { opacity: 1; } }

  .ui-panel, .ui-stat, .ui-pagehead { animation: ui-rise 0.42s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .ui-panel { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
  .ui-panel:hover { border-color: var(--amber); box-shadow: 0 10px 28px rgba(36,28,20,0.10); }

  .ui-stat { position: relative; overflow: hidden; transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s ease; }
  .ui-stat:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(36,28,20,0.14); }
  .ui-stat::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0;
    background: linear-gradient(110deg, transparent 30%, rgba(181,101,29,0.14) 50%, transparent 70%);
    background-size: 200% 100%; transition: opacity 0.2s ease;
  }
  .ui-stat:hover::after { opacity: 1; animation: ui-sheen 1.1s linear infinite; }

  .ui-row { animation: ui-row-in 0.3s ease both; }
  .ui-table tbody tr td { transition: background 0.15s ease; }
  .ui-table tbody tr:hover td { background: rgba(181,101,29,0.08); }
  .ui-table tbody tr:hover td:first-child { box-shadow: inset 3px 0 0 var(--amber); }

  .main-content button, .sidebar button {
    transition: transform 0.15s ease, filter 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .main-content button:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .main-content button:active { transform: translateY(0) scale(0.98); }
  .sidebar button:hover { background: rgba(255,255,255,0.06); transform: translateX(2px); }

  .main-content input, .main-content select, .main-content textarea {
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }
  .main-content input:focus, .main-content select:focus, .main-content textarea:focus {
    border-color: var(--amber) !important;
    box-shadow: 0 0 0 3px rgba(181,101,29,0.15);
  }

  /* Drawer springs open instead of sliding linearly */
  .sidebar { transition: left 0.32s cubic-bezier(0.22, 1, 0.36, 1) !important; }
  .mobile-backdrop { animation: ui-fade 0.2s ease both; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }

  @media print {
    .ui-panel, .ui-stat, .ui-row, .ui-pagehead { animation: none !important; opacity: 1 !important; transform: none !important; }
    .ui-stat::after { display: none !important; }
  }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }

  /* ---- Mobile layout (phones/small tablets) ---- */
  .mobile-topbar { display: none; }
  .mobile-backdrop { display: none; }
  .mobile-close-btn { display: none; }
  .mobile-menu-btn { display: none; }

  @media (max-width: 768px) {
    .app-shell { flex-direction: column; min-height: 100vh; }

    .mobile-topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: ${COLORS.sidebar};
      position: sticky;
      top: 0;
      z-index: 30;
    }
    .mobile-menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: ${COLORS.sidebarInk};
      padding: 4px;
      cursor: pointer;
    }
    .mobile-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: ${COLORS.sidebarInk};
      margin-left: auto;
      padding: 4px;
      cursor: pointer;
    }

    .sidebar {
      position: fixed !important;
      top: 0;
      left: -260px;
      height: 100vh;
      width: 240px !important;
      z-index: 40;
      transition: left 0.22s ease;
      box-shadow: 2px 0 12px rgba(0,0,0,0.25);
    }
    .sidebar-open { left: 0 !important; }

    .mobile-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 35;
    }

    .main-content {
      width: 100% !important;
    }
    .main-content-inner {
      padding: 14px !important;
    }

    /* Fix 1: app root — allow CSS to control min-height on mobile */
    .app-shell { min-height: 100svh; }

    /* Fix 2: grid2 — stack to single column on mobile */
    .grid2 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }

    /* Fix 3: line-header-row — hide column labels on mobile (fields get minWidth so they self-label) */
    .line-header-row { display: none !important; }

    /* Fix 4/5: line row inputs/selects — give each a comfortable min-width so they
       wrap to a new line in pairs rather than squishing to ~45px */
    .main-content select,
    .main-content input[type="number"],
    .main-content input[type="text"],
    .main-content input[type="date"] {
      min-width: 100px;
    }

    /* Fix 6: party filter wrapper — full width on mobile so it doesn't overflow */
    .party-filter-wrap {
      width: 100%;
      min-width: unset !important;
    }
    .party-filter-wrap select { width: 100%; }
  }
  /* ================= MOBILE UI — "Warm Shop Ledger" ================= */
  .bottom-nav { display: none; }
  .more-sheet, .more-sheet-backdrop { display: none; }
  .mobile-only { display: none !important; }

  @media (max-width: 768px) {
    html, body { -webkit-text-size-adjust: 100%; }
    .app-shell { background: ${COLORS.bg}; }
    .mobile-only { display: block !important; }

    /* --- Top bar: paper, not dark --- */
    .mobile-topbar {
      background: ${COLORS.bg} !important;
      border-bottom: 1px solid rgba(28,25,23,0.06);
      padding: 10px 16px !important;
      backdrop-filter: saturate(180%) blur(8px);
    }
    .mobile-topbar > div { color: ${COLORS.ink} !important; }
    .mobile-menu-btn { color: ${COLORS.ink} !important; }

    /* --- Content spacing so the bottom bar never covers anything --- */
    .main-content-inner { padding: 16px 16px 132px !important; }
    .main-content { background: ${COLORS.bg} !important; }
    .mainTopBar, .main-content > div:first-child { padding: 8px 16px !important; }

    /* --- Panels become soft ledger cards --- */
    .ui-panel {
      border-radius: 12px !important;
      border: none !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05);
      padding: 16px !important;
      margin-bottom: 12px !important;
    }
    .ui-panel:hover { box-shadow: 0 0 0 1px rgba(0,0,0,0.05); }

    /* --- Stat cards: 2-up grid, surface tone --- */
    .ui-stat {
      background: ${COLORS.surface} !important;
      border: none !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05);
      border-radius: 12px !important;
      padding: 14px !important;
    }
    .ui-stat:hover { transform: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.05); }

    /* --- Tap-friendly controls --- */
    .main-content input,
    .main-content select,
    .main-content textarea {
      font-size: 16px !important;      /* stops iOS zoom-on-focus */
      padding: 11px 12px !important;
      border-radius: 8px !important;
      background: ${COLORS.surface} !important;
      border: 1px solid rgba(0,0,0,0.06) !important;
      width: 100%;
    }
    .main-content button { min-height: 42px; border-radius: 8px !important; }
    .main-content button:hover { transform: none; }

    /* --- Forms stack cleanly --- */
    .main-content label { width: 100%; }
    .line-row, .form-row { flex-direction: column; align-items: stretch !important; }

    /* --- Tables scroll horizontally with momentum --- */
    .table-wrap {
      -webkit-overflow-scrolling: touch;
      margin: 0 -16px;
      padding: 0 16px;
      max-height: none !important;
    }
    .ui-table th, .ui-table td { white-space: nowrap; }
    .ui-table tbody tr:hover td { background: transparent; }

    /* --- Bottom tab bar --- */
    .bottom-nav {
      display: flex;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: calc(62px + env(safe-area-inset-bottom));
      padding-bottom: env(safe-area-inset-bottom);
      background: #ffffff;
      border-top: 1px solid rgba(28,25,23,0.06);
      align-items: center;
      justify-content: space-around;
      z-index: 45;
    }
    .bottom-nav button {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      background: transparent; border: none; cursor: pointer;
      color: ${COLORS.ink}; opacity: 0.42;
      font-family: 'Public Sans', system-ui, sans-serif;
      font-size: 10px; font-weight: 500; padding: 6px 10px;
      min-width: 56px;
    }
    .bottom-nav button.active { opacity: 1; color: ${COLORS.amber}; }

    /* --- "More" sheet --- */
    .more-sheet-backdrop {
      display: block; position: fixed; inset: 0;
      background: rgba(28,25,23,0.35); z-index: 46;
    }
    .more-sheet {
      display: block;
      position: fixed; left: 0; right: 0; bottom: 0;
      z-index: 47;
      background: ${COLORS.bg};
      border-radius: 16px 16px 0 0;
      padding: 8px 0 calc(16px + env(safe-area-inset-bottom));
      max-height: 78vh; overflow-y: auto;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.18);
      animation: sheet-up 0.28s cubic-bezier(0.22,1,0.36,1) both;
    }
    .more-sheet .grabber {
      width: 38px; height: 4px; border-radius: 999px;
      background: rgba(28,25,23,0.18); margin: 6px auto 10px;
    }
    .more-sheet button {
      display: flex; align-items: center; gap: 12px;
      width: 100%; background: transparent; border: none;
      padding: 14px 20px; font-size: 15px; text-align: left;
      color: ${COLORS.ink}; font-family: 'Public Sans', system-ui, sans-serif;
      border-bottom: 1px solid rgba(28,25,23,0.05); cursor: pointer;
    }
    .more-sheet button.active { color: ${COLORS.amber}; font-weight: 600; }

    /* Old drawer is retired on mobile — the tab bar + sheet replace it */
    .sidebar { display: none !important; }
    .mobile-backdrop { display: none !important; }
  }

  @keyframes sheet-up { from { transform: translateY(100%); } to { transform: none; } }

  @media print {
    .bottom-nav, .more-sheet, .more-sheet-backdrop { display: none !important; }
  }

`;

const styles = {
  app: {
    display: "flex",
    height: "100vh",
    fontFamily: "'Public Sans', system-ui, -apple-system, sans-serif",
    background: COLORS.bg,
    color: COLORS.ink,
  },
  loadingWrap: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, background: COLORS.bg },
  loadingCard: { fontFamily: "'Public Sans', system-ui, sans-serif", color: COLORS.muted },
  sidebar: {
    width: 220,
    background: COLORS.sidebar,
    color: COLORS.sidebarInk,
    padding: "20px 14px",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflowY: "auto",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 22px" },
  brandMark: {
    width: 32, height: 32, borderRadius: 6, background: COLORS.amber, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16,
    fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  brandName: { fontSize: 14.5, fontWeight: 700, letterSpacing: 0.2 },
  brandSub: { fontSize: 11, color: "#a89a83", letterSpacing: 0.5, textTransform: "uppercase" },
  nav: { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  navBtn: {
    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
    padding: "9px 10px", borderRadius: 6, border: "none", background: "transparent",
    color: "#cfc3ac", fontSize: 13.5, cursor: "pointer", fontFamily: "'Public Sans', system-ui, sans-serif",
    transition: "background 0.15s",
  },
  navBtnActive: { background: "rgba(181,101,29,0.25)", color: "#fff" },
  saveIndicator: { height: 20, fontSize: 11.5, fontFamily: "'Public Sans', system-ui, sans-serif" },
  saveDim: { color: COLORS.muted },
  saveOk: { color: "#3a7d3a", display: "flex", alignItems: "center", gap: 4 },
  main: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minHeight: 0 },
  mainTopBar: {
    position: "sticky", top: 0, zIndex: 20, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "flex-end",
    padding: "10px 34px", background: COLORS.panel, borderBottom: `1px solid ${COLORS.border}`,
  },
  mainInner: { padding: "28px 34px 60px" },
  pageHeader: { marginBottom: 22, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 14 },
  h1: { fontSize: 22, margin: 0, fontWeight: 700 },
  subtitle: { fontSize: 13, color: COLORS.muted, margin: "6px 0 0", fontFamily: "'Public Sans', system-ui, sans-serif" },
  h2: { fontSize: 14.5, margin: 0, fontWeight: 700 },
  hint: { fontSize: 11.5, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif" },
  panel: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10,
    padding: 18, marginBottom: 18,
  },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 4 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 },
  statCard: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" },
  statValue: { fontSize: 24, fontWeight: 700, color: COLORS.amber },
  statLabel: { fontSize: 11.5, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif", marginTop: 2 },
  grid2: {}, // layout handled by .grid2 CSS class (see globalCss)
  formRow: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, minWidth: 120 },
  fieldLabel: { fontSize: 11, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif" },
  input: {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${COLORS.border}`,
    fontSize: 13.5, background: "#fffdf9", color: COLORS.ink, fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  select: {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${COLORS.border}`,
    fontSize: 13.5, background: "#fffdf9", color: COLORS.ink, fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  primaryBtn: {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px",
    background: COLORS.amber, color: "#fff", border: "none", borderRadius: 7,
    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  ghostBtn: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
    background: "transparent", color: COLORS.amberDeep, border: `1px dashed ${COLORS.amber}`,
    borderRadius: 6, fontSize: 12.5, cursor: "pointer", fontFamily: "'Public Sans', system-ui, sans-serif", marginTop: 4,
  },
  iconBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 6,
    color: COLORS.muted, cursor: "pointer",
  },
  lineHeaderRow: { display: "flex", gap: 8, fontSize: 11, color: COLORS.muted, fontFamily: "'Public Sans', system-ui, sans-serif", padding: "0 2px 4px", marginTop: 6 },
  lineRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" },
  tableWrap: { overflowX: "auto", overflowY: "auto", maxHeight: 460, borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontFamily: "'Public Sans', system-ui, sans-serif" },
  th: {
    textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4,
    color: COLORS.muted, padding: "6px 10px", borderBottom: `1px solid ${COLORS.border}`,
    position: "sticky", top: 0, background: COLORS.panel, zIndex: 1,
    boxShadow: `0 1px 0 ${COLORS.border}`,
  },
  tr: {},
  td: { padding: "9px 10px", fontSize: 13, borderBottom: `1px solid #f0e9dc` },
  codeTag: {
    fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 11.5, background: "#f2e9d8",
    color: COLORS.amberDeep, padding: "2px 6px", borderRadius: 4,
  },
  empty: { color: COLORS.muted, fontSize: 13, fontFamily: "'Public Sans', system-ui, sans-serif", padding: "10px 0" },
  plainText: { fontSize: 13, color: COLORS.ink, fontFamily: "'Public Sans', system-ui, sans-serif", marginBottom: 12, lineHeight: 1.5 },
  okNotice: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#2e7d32",
    background: "#eaf5ea", border: "1px solid #cbe6cc", borderRadius: 6, padding: "8px 10px",
    marginBottom: 10, fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  notice: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.danger,
    background: "#fbeceb", border: "1px solid #f0cfcc", borderRadius: 6, padding: "8px 10px",
    marginBottom: 10, fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  tinyTag: {
    fontSize: 10, fontStyle: "normal", color: COLORS.amberDeep, background: "#f2e9d8",
    padding: "1px 5px", borderRadius: 4, marginLeft: 6,
  },
  totalsBox: {
    marginTop: 14, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10,
    maxWidth: 360, marginLeft: "auto",
  },
  totalRow: {
    display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 2px",
    fontFamily: "'Public Sans', system-ui, sans-serif",
  },
  totalRowBig: {
    fontSize: 16, borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 8, color: COLORS.amberDeep,
  },
  invoiceSheet: {
    border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 18, marginBottom: 16, background: "#fffdf9",
  },
  invoiceLetterhead: { textAlign: "center", marginBottom: 22, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 14 },
  invoiceCompany: { fontSize: 17, fontWeight: 700, letterSpacing: 0.3 },
  invoiceTagline: { fontSize: 10.5, color: COLORS.muted, marginTop: 3, fontFamily: "'Public Sans', system-ui, sans-serif" },
  invoiceAddress: { fontSize: 10.5, color: COLORS.muted, marginTop: 3, fontFamily: "'Public Sans', system-ui, sans-serif" },
  invoiceMetaRow: {
    display: "flex", gap: 20, fontSize: 12.5, marginBottom: 6, fontFamily: "'Public Sans', system-ui, sans-serif", flexWrap: "wrap",
  },
};
