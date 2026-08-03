import React, { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  Printer,
  Pencil,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  RotateCcw,
} from "lucide-react";

/* ---------------- Constants & Defaults ---------------- */

const GST_RATE = 18;
const BIN_RETENTION_DAYS = 30;

const DEFAULT_COMPANY = {
  name: "My Business Name",
  tagline: "Scaffolding & Rental Services",
  address: "123 Business Street, Industrial Area, City",
  email: "contact@company.com",
  gstin: "22AAAAA0000A1Z5",
};

const BIN_TYPE_META = {
  invoice: { label: "Invoice" },
  payment: { label: "Payment" },
  expense: { label: "Expense" },
};

/* ---------------- Helper Functions ---------------- */

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

const fmtDateDisplay = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
};

const fmtDateTime = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
};

const partyName = (data, partyId) => {
  const p = data.parties?.find((x) => x.id === partyId);
  return p ? `${p.code} — ${p.name}` : "Unknown Party";
};

const computeGst = (party, amount) => {
  if (!party?.gstin) return { applicable: false, totalGst: 0, grandTotal: amount };
  const taxableValue = round2(amount);
  const totalGst = round2((taxableValue * GST_RATE) / 100);
  const grandTotal = round2(taxableValue + totalGst);
  const isInterstate = party.stateCode && party.stateCode !== "22"; // Example home state code "22"

  return {
    applicable: true,
    taxableValue,
    gstType: isInterstate ? "IGST" : "CGST_SGST",
    igst: isInterstate ? totalGst : 0,
    cgst: isInterstate ? 0 : round2(totalGst / 2),
    sgst: isInterstate ? 0 : round2(totalGst / 2),
    totalGst,
    grandTotal,
  };
};

const moveToBin = (data, persist, type, item, summary) => {
  const binItem = {
    binId: crypto.randomUUID(),
    type,
    item,
    summary,
    deletedAt: new Date().toISOString(),
  };
  const updatedBin = [binItem, ...(data.recycleBin || [])];

  let updatedData = { ...data, recycleBin: updatedBin };
  if (type === "invoice") {
    updatedData.invoices = data.invoices.filter((i) => i.id !== item.id);
  } else if (type === "payment") {
    updatedData.payments = data.payments.filter((p) => p.id !== item.id);
  } else if (type === "expense") {
    updatedData.expenses = data.expenses.filter((e) => e.id !== item.id);
  }

  persist(updatedData);
};

const restoreFromBin = (data, persist, binId) => {
  const target = data.recycleBin?.find((b) => b.binId === binId);
  if (!target) return;

  const updatedBin = data.recycleBin.filter((b) => b.binId !== binId);
  let updatedData = { ...data, recycleBin: updatedBin };

  if (target.type === "invoice") {
    updatedData.invoices = [...data.invoices, target.item];
  } else if (target.type === "payment") {
    updatedData.payments = [...data.payments, target.item];
  } else if (target.type === "expense") {
    updatedData.expenses = [...data.expenses, target.item];
  }

  persist(updatedData);
};

const purgeFromBin = (data, persist, binId) => {
  const updatedBin = data.recycleBin.filter((b) => b.binId !== binId);
  persist({ ...data, recycleBin: updatedBin });
};

/* ---------------- Print Portal Component ---------------- */

function PrintPortal({ children }) {
  return <div className="print-portal">{children}</div>;
}

/* ---------------- Main Invoice Generator & Archive ---------------- */

export default function InvoiceModule({ data, persist, result, gst, save, finalTotal }) {
  return (
    <div>
      {result && (
        <>
          <Panel title="Invoice Breakdown">
            <div style={styles.totalsBox}>
              <Row label="Item Rent Total" val={result.itemRentTotal.toFixed(2)} />
              {result.serviceTotal > 0 && <Row label="Service Charge Total" val={result.serviceTotal.toFixed(2)} />}
              {result.brokenTotal > 0 && <Row label="Broken Charge Total" val={result.brokenTotal.toFixed(2)} />}
              {result.transportTotal > 0 && <Row label="Transport Charge" val={result.transportTotal.toFixed(2)} />}
              {gst && gst.applicable && (
                <>
                  <Row bold label="Taxable Amount" val={gst.taxableValue.toFixed(2)} />
                  {gst.gstType === "IGST" ? (
                    <Row label={`IGST (${GST_RATE}%)`} val={gst.igst.toFixed(2)} />
                  ) : (
                    <>
                      <Row label={`CGST (${GST_RATE / 2}%)`} val={gst.cgst.toFixed(2)} />
                      <Row label={`SGST (${GST_RATE / 2}%)`} val={gst.sgst.toFixed(2)} />
                    </>
                  )}
                  <Row bold label="Subtotal with GST" val={gst.grandTotal.toFixed(2)} />
                </>
              )}
              {result.depositTotal > 0 && <Row label="Deposit Credit (−)" val={`−${result.depositTotal.toFixed(2)}`} />}
              <Row grand label="Net Total Payable" val={finalTotal.toFixed(2)} />
            </div>

            <div style={{ marginTop: 16 }}>
              <button style={styles.primaryBtn} onClick={save}>
                <CheckCircle2 size={15} /> Save Invoice to Archive
              </button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ---------------- Invoice Archive ---------------- */

export function InvoiceArchive({ data, persist }) {
  const [activeInvoice, setActiveInvoice] = useState(null);
  const [filterPartyId, setFilterPartyId] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const print = (inv) => setActiveInvoice(inv);

  const removeInvoice = (id) => {
    const inv = data.invoices.find((x) => x.id === id);
    if (!inv) return;
    moveToBin(data, persist, "invoice", inv, `Invoice #${inv.invoiceNo} — ${partyName(data, inv.partyId)}`);
    setConfirmDeleteId(null);
  };

  const sortedInvoices = useMemo(() => {
    const list = filterPartyId ? data.invoices.filter((i) => i.partyId === filterPartyId) : [...data.invoices];
    if (sortBy === "updated") {
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    } else {
      list.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate) || b.invoiceNo - a.invoiceNo);
    }
    return list;
  }, [data.invoices, sortBy, filterPartyId]);

  return (
    <div>
      <PageHeader
        title="Invoice Archive"
        subtitle="Review past invoices, open printable views, edit existing details, or delete bills."
      />

      <Panel title={`Saved Invoices (${sortedInvoices.length}${filterPartyId ? ` of ${data.invoices.length}` : ""})`}>
        {data.invoices.length === 0 ? (
          <Empty text="No invoices saved yet." />
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
              <SortToggle
                label="Sort: "
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "date", label: "Invoice Date" },
                  { value: "updated", label: "Last Changed" },
                ]}
              />
              <PartyFilter value={filterPartyId} onChange={setFilterPartyId} parties={data.parties} />
            </div>
            {sortedInvoices.length === 0 ? (
              <Empty text="No invoices for this party." />
            ) : (
              <Table
                cols={["Inv No.", "Invoice Date", "Party", "Billing Window", "Net Amount", "Last Changed", "Actions"]}
                rows={sortedInvoices.map((inv) => [
                  inv.invoiceNo,
                  fmtDateDisplay(inv.invoiceDate),
                  partyName(data, inv.partyId),
                  `${fmtDateDisplay(inv.billStart)} → ${fmtDateDisplay(inv.billEnd)}`,
                  `₹${(inv.finalTotal ?? inv.netTotal ?? 0).toFixed(2)}`,
                  fmtDateTime(inv.updatedAt || inv.createdAt),
                  <div key={inv.id} style={{ display: "flex", gap: 6 }}>
                    <button style={styles.ghostBtn} onClick={() => print(inv)}>
                      <Printer size={13} /> View / Print
                    </button>
                    <ConfirmDelete
                      confirmId={confirmDeleteId}
                      id={inv.id}
                      label="Move to bin?"
                      onConfirm={removeInvoice}
                      setConfirmId={setConfirmDeleteId}
                      title="Delete invoice"
                    />
                  </div>,
                ])}
              />
            )}
          </>
        )}
      </Panel>

      {activeInvoice && (
        <InvoicePrintModal
          data={data}
          inv={activeInvoice}
          onClose={() => setActiveInvoice(null)}
          persist={persist}
        />
      )}
    </div>
  );
}

/* ---------------- Modal & Invoice View ---------------- */

function InvoicePrintModal({ inv, data, persist, onClose }) {
  const party = data.parties?.find((p) => p.id === inv.partyId) || {};
  const comp = data.company || DEFAULT_COMPANY;

  const [isEditing, setIsEditing] = useState(false);
  const [lines, setLines] = useState(inv.lines || []);
  const [transportTotal, setTransportTotal] = useState(inv.transportTotal || 0);
  const [depositTotal, setDepositTotal] = useState(inv.depositTotal || 0);

  const itemRentTotal = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const serviceTotal = round2(lines.filter((l) => l.kind === "service").reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const brokenTotal = round2(lines.filter((l) => l.kind === "broken").reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const additionalCharges = round2(Number(transportTotal) || 0);
  const calculatedGst = computeGst(party, itemRentTotal + additionalCharges);
  const currentFinalTotal = calculatedGst.applicable
    ? round2(calculatedGst.grandTotal - (Number(depositTotal) || 0))
    : round2(itemRentTotal + additionalCharges - (Number(depositTotal) || 0));

  const handleLineChange = (index, field, value) => {
    const updated = [...lines];
    const target = { ...updated[index], [field]: value };

    if (field === "qty" || field === "rate" || field === "days" || field === "feet") {
      const q = Number(field === "qty" ? value : target.qty) || 0;
      const r = Number(field === "rate" ? value : target.rate) || 0;
      const d = Number(field === "days" ? value : target.days) || 1;
      const f = Number(field === "feet" ? value : target.feet) || null;

      target.amount = f ? round2(q * f * r * d) : round2(q * r * d);
    }

    updated[index] = target;
    setLines(updated);
  };

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        kind: "custom",
        challanId: "",
        challanNo: "",
        itemId: "",
        itemName: "Custom Item",
        feet: null,
        qty: 1,
        rate: 0,
        start: inv.billStart || "",
        end: inv.billEnd || "",
        days: 1,
        amount: 0,
        returned: false,
      },
    ]);
  };

  const handleRemoveLine = (index) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleSaveChanges = () => {
    const updatedInvoice = {
      ...inv,
      lines,
      itemRentTotal,
      serviceTotal,
      brokenTotal,
      transportTotal: Number(transportTotal) || 0,
      additionalCharges,
      depositTotal: Number(depositTotal) || 0,
      netTotal: round2(itemRentTotal + additionalCharges - (Number(depositTotal) || 0)),
      gst: calculatedGst,
      finalTotal: currentFinalTotal,
      updatedAt: new Date().toISOString(),
    };

    const updatedInvoices = data.invoices.map((i) => (i.id === inv.id ? updatedInvoice : i));
    persist({ ...data, invoices: updatedInvoices });
    setIsEditing(false);
  };

  return (
    <div style={styles.modalBackdrop}>
      <div style={{ ...styles.modal, width: "90%", maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: COLORS.ink }}>Invoice #{inv.invoiceNo}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {isEditing ? (
              <>
                <button style={styles.primaryBtn} onClick={handleSaveChanges}><CheckCircle2 size={14} /> Save Changes</button>
                <button style={styles.ghostBtn} onClick={() => setIsEditing(false)}><X size={14} /> Cancel</button>
              </>
            ) : (
              <>
                <button style={styles.ghostBtn} onClick={() => setIsEditing(true)}><Pencil size={14} /> Edit Invoice</button>
                <button style={styles.primaryBtn} onClick={() => window.print()}><Printer size={14} /> Print Invoice</button>
                <button style={styles.ghostBtn} onClick={onClose}><X size={14} /> Close</button>
              </>
            )}
          </div>
        </div>

        <div style={styles.invoiceDocument}>
          <div style={{ textAlign: "center", borderBottom: "2px solid #333", paddingBottom: 12, marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 4px 0", fontSize: 20, color: "#111" }}>{comp.name}</h2>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{comp.tagline}</div>
            <div style={{ fontSize: 11, color: "#555" }}>{comp.address}</div>
            {comp.gstin && <div style={{ fontSize: 11, fontWeight: "bold", marginTop: 4 }}>GSTIN: {comp.gstin}</div>}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 12 }}>
            <div>
              <strong>Billed To:</strong>
              <div>{party.name}</div>
              <div>{party.siteName || party.address}</div>
              {party.gstin && <div>GSTIN: {party.gstin}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div><strong>Invoice No:</strong> #{inv.invoiceNo}</div>
              <div><strong>Date:</strong> {fmtDateDisplay(inv.invoiceDate)}</div>
              <div><strong>Period:</strong> {fmtDateDisplay(inv.billStart)} to {fmtDateDisplay(inv.billEnd)}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr style={{ background: "#f3f4f6", textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 6 }}>Sr</th>
                <th style={{ padding: 6 }}>Item Description</th>
                <th style={{ padding: 6 }}>Qty</th>
                <th style={{ padding: 6 }}>Rate</th>
                <th style={{ padding: 6 }}>Days</th>
                <th style={{ padding: 6, textAlign: "right" }}>Amount</th>
                {isEditing && <th style={{ padding: 6, width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 6 }}>{i + 1}</td>
                  <td style={{ padding: 6 }}>
                    {isEditing ? (
                      <input
                        style={styles.input}
                        value={l.itemName}
                        onChange={(e) => handleLineChange(i, "itemName", e.target.value)}
                      />
                    ) : (
                      <span>{l.itemName}</span>
                    )}
                  </td>
                  <td style={{ padding: 6 }}>
                    {isEditing ? (
                      <input
                        type="number"
                        style={{ ...styles.input, width: 60 }}
                        value={l.qty}
                        onChange={(e) => handleLineChange(i, "qty", e.target.value)}
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  <td style={{ padding: 6 }}>
                    {isEditing ? (
                      <input
                        type="number"
                        style={{ ...styles.input, width: 70 }}
                        value={l.rate}
                        onChange={(e) => handleLineChange(i, "rate", e.target.value)}
                      />
                    ) : (
                      l.rate
                    )}
                  </td>
                  <td style={{ padding: 6 }}>
                    {isEditing ? (
                      <input
                        type="number"
                        style={{ ...styles.input, width: 50 }}
                        value={l.days || 1}
                        onChange={(e) => handleLineChange(i, "days", e.target.value)}
                      />
                    ) : (
                      l.days || "—"
                    )}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {isEditing ? (
                      <input
                        type="number"
                        style={{ ...styles.input, width: 80, textAlign: "right" }}
                        value={l.amount}
                        onChange={(e) => handleLineChange(i, "amount", Number(e.target.value))}
                      />
                    ) : (
                      Number(l.amount).toFixed(2)
                    )}
                  </td>
                  {isEditing && (
                    <td style={{ padding: 6 }}>
                      <button style={styles.iconBtn} onClick={() => handleRemoveLine(i)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {isEditing && (
            <div style={{ marginBottom: 16 }}>
              <button style={styles.ghostBtn} onClick={handleAddLine}>
                <Plus size={14} /> Add Manual Line
              </button>
            </div>
          )}

          <div style={{ width: 280, marginLeft: "auto", fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>Item Subtotal:</span>
              <span>₹{itemRentTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>Transport Charges:</span>
              {isEditing ? (
                <input
                  type="number"
                  style={{ ...styles.input, width: 80, textAlign: "right" }}
                  value={transportTotal}
                  onChange={(e) => setTransportTotal(e.target.value)}
                />
              ) : (
                <span>₹{Number(transportTotal).toFixed(2)}</span>
              )}
            </div>
            {calculatedGst.applicable && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>GST Total ({GST_RATE}%):</span>
                <span>₹{calculatedGst.totalGst.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>Deposit Deduction:</span>
              {isEditing ? (
                <input
                  type="number"
                  style={{ ...styles.input, width: 80, textAlign: "right" }}
                  value={depositTotal}
                  onChange={(e) => setDepositTotal(e.target.value)}
                />
              ) : (
                <span>−₹{Number(depositTotal).toFixed(2)}</span>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "2px solid #333", fontWeight: "bold", fontSize: 14 }}>
              <span>Grand Total:</span>
              <span>₹{currentFinalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <PrintPortal>
          <div style={{ padding: 20, fontFamily: "sans-serif" }}>
            <div style={{ textAlign: "center", borderBottom: "2px solid #333", paddingBottom: 12, marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 4px 0", fontSize: 22, color: "#111" }}>{comp.name}</h2>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>{comp.tagline}</div>
              <div style={{ fontSize: 12, color: "#555" }}>{comp.address}</div>
              {comp.gstin && <div style={{ fontSize: 12, fontWeight: "bold", marginTop: 4 }}>GSTIN: {comp.gstin}</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 13 }}>
              <div>
                <strong>Billed To:</strong>
                <div>{party.name}</div>
                <div>{party.siteName || party.address}</div>
                {party.gstin && <div>GSTIN: {party.gstin}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div><strong>Invoice No:</strong> #{inv.invoiceNo}</div>
                <div><strong>Date:</strong> {fmtDateDisplay(inv.invoiceDate)}</div>
                <div><strong>Period:</strong> {fmtDateDisplay(inv.billStart)} to {fmtDateDisplay(inv.billEnd)}</div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: "#f3f4f6", textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Sr</th>
                  <th style={{ padding: 8 }}>Item Description</th>
                  <th style={{ padding: 8 }}>Qty</th>
                  <th style={{ padding: 8 }}>Rate</th>
                  <th style={{ padding: 8 }}>Days</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{i + 1}</td>
                    <td style={{ padding: 8 }}>{l.itemName}</td>
                    <td style={{ padding: 8 }}>{l.qty}</td>
                    <td style={{ padding: 8 }}>{l.rate}</td>
                    <td style={{ padding: 8 }}>{l.days || "—"}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>₹{Number(l.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ width: 300, marginLeft: "auto", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>Item Subtotal:</span>
                <span>₹{itemRentTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>Transport Charges:</span>
                <span>₹{Number(transportTotal).toFixed(2)}</span>
              </div>
              {calculatedGst.applicable && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>GST Total ({GST_RATE}%):</span>
                  <span>₹{calculatedGst.totalGst.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>Deposit Deduction:</span>
                <span>−₹{Number(depositTotal).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "2px solid #333", fontWeight: "bold", fontSize: 15 }}>
                <span>Grand Total:</span>
                <span>₹{currentFinalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </PrintPortal>
      </div>
    </div>
  );
}

/* ---------------- Party Ledger & Payments ---------------- */

export function PartyLedger({ data, persist }) {
  const [partyId, setPartyId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const partyInvoices = useMemo(() => {
    if (!partyId) return [];
    return data.invoices.filter((i) => i.partyId === partyId);
  }, [data.invoices, partyId]);

  const partyPayments = useMemo(() => {
    if (!partyId) return [];
    return data.payments.filter((p) => p.partyId === partyId);
  }, [data.payments, partyId]);

  const totalBilled = partyInvoices.reduce((s, i) => s + (i.finalTotal ?? i.netTotal ?? 0), 0);
  const totalPaid = partyPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceDue = round2(totalBilled - totalPaid);

  const addPayment = () => {
    if (!partyId || !Number(paymentAmount)) return;
    const payment = {
      id: crypto.randomUUID(),
      partyId,
      date: paymentDate,
      amount: Number(paymentAmount),
      note: paymentNote,
      createdAt: new Date().toISOString(),
    };
    persist({
      ...data,
      payments: [...data.payments, payment],
    });
    setPaymentAmount("");
    setPaymentNote("");
  };

  const removePayment = (id) => {
    const pay = data.payments.find((p) => p.id === id);
    if (!pay) return;
    moveToBin(data, persist, "payment", pay, `Payment ₹${pay.amount} — ${partyName(data, pay.partyId)}`);
    setConfirmDeleteId(null);
  };

  const combinedLedger = useMemo(() => {
    const events = [
      ...partyInvoices.map((i) => ({ type: "invoice", date: i.invoiceDate, ref: `Invoice #${i.invoiceNo}`, amount: i.finalTotal ?? i.netTotal ?? 0, id: i.id })),
      ...partyPayments.map((p) => ({ type: "payment", date: p.date, ref: `Payment received (${p.note || "No note"})`, amount: -(Number(p.amount) || 0), id: p.id })),
    ];
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    return events.map((e) => {
      running = round2(running + e.amount);
      return { ...e, runningBalance: running };
    });
  }, [partyInvoices, partyPayments]);

  return (
    <div>
      <PageHeader subtitle="Track total billing vs. payments received to know running balances per party." title="Party Ledger & Payments" />

      <Panel title="Select Party">
        <div style={styles.formRow}>
          <SelectField
            label="Party"
            onChange={setPartyId}
            options={data.parties.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            value={partyId}
          />
        </div>
      </Panel>

      {partyId && (
        <>
          <div style={styles.statRow}>
            <StatCard label="Total Billed" value={`₹${totalBilled.toFixed(2)}`} />
            <StatCard label="Total Payments Received" value={`₹${totalPaid.toFixed(2)}`} />
            <StatCard highlight={balanceDue > 0} label="Outstanding Balance" value={`₹${balanceDue.toFixed(2)}`} />
          </div>

          <Panel title="Record Payment Received">
            <div style={styles.formRow}>
              <Field label="Payment Date" onChange={setPaymentDate} type="date" value={paymentDate} />
              <Field label="Amount (₹)" onChange={setPaymentAmount} type="number" value={paymentAmount} />
              <Field label="Note / Reference" onChange={setPaymentNote} placeholder="e.g. UPI, Cheque #1234, Cash" value={paymentNote} wide />
            </div>
            <button style={{ ...styles.primaryBtn, opacity: Number(paymentAmount) ? 1 : 0.5 }} disabled={!Number(paymentAmount)} onClick={addPayment}>
              <Plus size={15} /> Record Payment
            </button>
          </Panel>

          <Panel title="Ledger Statement">
            {combinedLedger.length === 0 ? (
              <Empty text="No invoices or payments recorded for this party." />
            ) : (
              <Table
                cols={["Date", "Ref", "Debit (Billed)", "Credit (Paid)", "Running Balance", "Actions"]}
                rows={combinedLedger.map((e) => [
                  fmtDateDisplay(e.date),
                  e.ref,
                  e.type === "invoice" ? `₹${e.amount.toFixed(2)}` : "—",
                  e.type === "payment" ? `₹${Math.abs(e.amount).toFixed(2)}` : "—",
                  `₹${e.runningBalance.toFixed(2)}`,
                  e.type === "payment" ? (
                    <ConfirmDelete confirmId={confirmDeleteId} id={e.id} label="Move to bin?" onConfirm={removePayment} setConfirmId={setConfirmDeleteId} title="Delete payment" key={e.id} />
                  ) : "—",
                ])}
              />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/* ---------------- Expenses ---------------- */

export function Expenses({ data, persist }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(data.expenseCategories[0] || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const addExpense = () => {
    if (!category || !Number(amount)) return;
    const exp = {
      id: crypto.randomUUID(),
      date,
      category,
      amount: Number(amount),
      note,
      createdAt: new Date().toISOString(),
    };
    persist({
      ...data,
      expenses: [...data.expenses, exp],
    });
    setAmount("");
    setNote("");
  };

  const removeExpense = (id) => {
    const exp = data.expenses.find((e) => e.id === id);
    if (!exp) return;
    moveToBin(data, persist, "expense", exp, `Expense ${exp.category} — ₹${exp.amount}`);
    setConfirmDeleteId(null);
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    if (data.expenseCategories.includes(newCatName.trim())) return;
    persist({
      ...data,
      expenseCategories: [...data.expenseCategories, newCatName.trim()],
    });
    setCategory(newCatName.trim());
    setNewCatName("");
  };

  const totalExpense = data.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div>
      <PageHeader subtitle="Track business expenses like land rent, labour, fuel, and equipment maintenance." title="Expense Management" />

      <div style={styles.statRow}>
        <StatCard label="Total Expenses Recorded" value={`₹${totalExpense.toFixed(2)}`} />
        <StatCard label="Categories" value={data.expenseCategories.length} />
      </div>

      <Panel title="Add New Expense">
        <div style={styles.formRow}>
          <Field label="Date" onChange={setDate} type="date" value={date} />
          <SelectField label="Category" onChange={setCategory} options={data.expenseCategories.map((c) => ({ value: c, label: c }))} value={category} />
          <Field label="Amount (₹)" onChange={setAmount} type="number" value={amount} />
          <Field label="Notes / Payee" onChange={setNote} value={note} wide />
        </div>
        <button style={{ ...styles.primaryBtn, opacity: Number(amount) ? 1 : 0.5 }} disabled={!Number(amount)} onClick={addExpense}>
          <Plus size={15} /> Add Expense
        </button>
      </Panel>

      <Panel title="Manage Expense Categories">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 400 }}>
          <Field label="New Category Name" onChange={setNewCatName} value={newCatName} />
          <button style={styles.ghostBtn} onClick={addCategory}><Plus size={14} /> Add Category</button>
        </div>
      </Panel>

      <Panel title="Recent Expenses">
        {data.expenses.length === 0 ? (
          <Empty text="No expenses recorded yet." />
        ) : (
          <Table
            cols={["Date", "Category", "Notes", "Amount", "Actions"]}
            rows={[...data.expenses]
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((e) => [
                fmtDateDisplay(e.date),
                e.category,
                e.note || "—",
                `₹${e.amount.toFixed(2)}`,
                <ConfirmDelete confirmId={confirmDeleteId} id={e.id} label="Move to bin?" onConfirm={removeExpense} setConfirmId={setConfirmDeleteId} title="Delete expense" key={e.id} />,
              ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Recycle Bin ---------------- */

export function RecycleBin({ data, persist }) {
  const [confirmPurgeId, setConfirmPurgeId] = useState(null);
  const bin = data.recycleBin || [];

  return (
    <div>
      <PageHeader
        subtitle={`Deleted records stay here for ${BIN_RETENTION_DAYS} days before permanent removal. You can restore them anytime.`}
        title="Recycle Bin"
      />

      <Panel title={`Bin Items (${bin.length})`}>
        {bin.length === 0 ? (
          <Empty text="Recycle bin is empty." />
        ) : (
          <Table
            cols={["Deleted At", "Type", "Summary", "Actions"]}
            rows={[...bin]
              .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))
              .map((b) => [
                fmtDateTime(b.deletedAt),
                <span key="type" style={styles.tinyTag}>{BIN_TYPE_META[b.type]?.label || b.type}</span>,
                b.summary,
                <div key="act" style={{ display: "flex", gap: 6 }}>
                  <button style={styles.ghostBtn} onClick={() => restoreFromBin(data, persist, b.binId)}>
                    <RotateCcw size={13} /> Restore
                  </button>
                  <ConfirmDelete
                    confirmId={confirmPurgeId}
                    id={b.binId}
                    label="Delete forever?"
                    onConfirm={(id) => { purgeFromBin(data, persist, id); setConfirmPurgeId(null); }}
                    setConfirmId={setConfirmPurgeId}
                    title="Permanent delete"
                  />
                </div>,
              ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Backup & Restore ---------------- */

export function BackupRestore({ data, persist }) {
  const [jsonText, setJsonText] = useState("");

  const downloadBackup = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stockengine_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setJsonText(evt.target.result);
    reader.readAsText(file);
  };

  const restoreBackup = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.parties || !parsed.items) {
        alert("Invalid backup file format.");
        return;
      }
      persist(parsed);
      alert("Database successfully restored!");
      setJsonText("");
    } catch {
      alert("Failed to parse JSON backup file.");
    }
  };

  return (
    <div>
      <PageHeader subtitle="Export your complete dataset for offline safe-keeping or import an existing JSON backup." title="Backup & Restore" />

      <Panel title="Export Backup">
        <p style={{ fontSize: 13, color: COLORS.muted }}>
          Download a complete JSON file containing all parties, items, delivery challans, return challans, invoices, payments, and expenses.
        </p>
        <button style={styles.primaryBtn} onClick={downloadBackup}>
          <Download size={15} /> Download JSON Backup
        </button>
      </Panel>

      <Panel title="Import / Restore Backup">
        <p style={{ fontSize: 13, color: COLORS.muted }}>
          Select a previously exported JSON backup file to overwrite current app state.
        </p>
        <input type="file" accept=".json" onChange={handleFileChange} style={{ marginBottom: 12, display: "block" }} />
        {jsonText && (
          <button style={{ ...styles.primaryBtn, background: COLORS.danger }} onClick={restoreBackup}>
            <Upload size={15} /> Overwrite & Restore State
          </button>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Company Settings ---------------- */

export function CompanySettings({ data, persist }) {
  const comp = data.company || DEFAULT_COMPANY;
  const [form, setForm] = useState(comp);

  const save = () => {
    persist({ ...data, company: form });
    alert("Company details updated!");
  };

  return (
    <div>
      <PageHeader subtitle="Configure business details shown on printed invoices." title="Company Settings" />

      <Panel title="Company Header Information">
        <div style={styles.formRow}>
          <Field label="Company Name" onChange={(v) => setForm({ ...form, name: v })} value={form.name} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Tagline / Subtitle" onChange={(v) => setForm({ ...form, tagline: v })} value={form.tagline} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Full Address" onChange={(v) => setForm({ ...form, address: v })} value={form.address} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Company Email" onChange={(v) => setForm({ ...form, email: v })} value={form.email} />
          <Field label="Company GSTIN" onChange={(v) => setForm({ ...form, gstin: v })} placeholder="Optional company GSTIN" value={form.gstin || ""} />
        </div>
        <button style={styles.primaryBtn} onClick={save}>
          <CheckCircle2 size={15} /> Save Settings
        </button>
      </Panel>
    </div>
  );
}

/* ---------------- Shared Helper UI Components ---------------- */

function SortToggle({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {label && <span style={{ fontSize: 12, color: COLORS.muted }}>{label}</span>}
      <select style={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function PartyFilter({ value, onChange, parties = [] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: COLORS.muted }}>Filter Party:</span>
      <select style={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All Parties</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </select>
    </div>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px 0", color: COLORS.ink }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 13, color: COLORS.muted }}>{subtitle}</div>}
    </div>
  );
}

function Panel({ title, hint, children }) {
  return (
    <div style={styles.panel}>
      {title && (
        <div style={styles.panelHeader}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.ink }}>{title}</h3>
          {hint && <span style={{ fontSize: 12, color: COLORS.muted }}>{hint}</span>}
        </div>
      )}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div style={{ ...styles.statCard, ...(highlight ? { borderColor: COLORS.amber } : {}) }}>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? COLORS.amber : COLORS.ink }}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={styles.empty}>{text}</div>;
}

function Field({ label, value, onChange, type = "text", placeholder, wide }) {
  return (
    <label style={{ ...styles.field, flex: wide ? 2 : 1 }}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        style={styles.input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <select style={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Table({ cols, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} style={styles.th}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={styles.tr}>
              {r.map((cell, j) => (
                <td key={j} style={styles.td}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, val, bold, grand }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 0",
      fontSize: grand ? 15 : 13,
      fontWeight: grand || bold ? 700 : 400,
      borderTop: grand ? "2px solid #ddd" : "none",
      marginTop: grand ? 6 : 0,
      paddingTop: grand ? 8 : 4,
    }}>
      <span>{label}</span>
      <span>₹{val}</span>
    </div>
  );
}

function ConfirmDelete({ id, confirmId, setConfirmId, onConfirm, title }) {
  const isConfirming = confirmId === id;
  if (isConfirming) {
    return (
      <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <button style={{ ...styles.ghostBtn, color: COLORS.danger, borderColor: COLORS.danger }} onClick={() => onConfirm(id)}>
          Confirm
        </button>
        <button style={styles.ghostBtn} onClick={() => setConfirmId(null)}>Cancel</button>
      </div>
    );
  }
  return (
    <button style={styles.iconBtn} onClick={() => setConfirmId(id)} title={title}>
      <Trash2 size={14} />
    </button>
  );
}

/* ---------------- Styles ---------------- */

const COLORS = {
  bg: "#f8fafc",
  panelBg: "#ffffff",
  sidebarBg: "#0f172a",
  sidebarInk: "#f8fafc",
  ink: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  amber: "#d97706",
  amberLight: "#fef3c7",
  danger: "#ef4444",
};

const styles = {
  panel: { background: COLORS.panelBg, borderRadius: 8, border: `1px solid ${COLORS.border}`, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" },
  panelHeader: { padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 },
  statCard: { background: "#fff", borderRadius: 8, border: `1px solid ${COLORS.border}`, padding: 16 },
  formRow: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: COLORS.muted },
  input: { padding: "8px 10px", borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, outline: "none" },
  select: { padding: "8px 10px", borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, outline: "none", background: "#fff" },
  primaryBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: COLORS.amber, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12, cursor: "pointer" },
  iconBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "#fff", cursor: "pointer", color: COLORS.muted },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" },
  th: { padding: "10px 12px", borderBottom: `2px solid ${COLORS.border}`, color: COLORS.muted, fontWeight: 600, fontSize: 12 },
  tr: { borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: "10px 12px" },
  empty: { padding: 32, textAlign: "center", color: COLORS.muted, fontSize: 13 },
  tinyTag: { background: COLORS.amberLight, color: COLORS.amber, padding: "1px 4px", borderRadius: 3, fontSize: 10, fontWeight: 600 },
  totalsBox: { width: 260, marginLeft: "auto", marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 6, border: `1px solid ${COLORS.border}` },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: "#fff", borderRadius: 8, padding: 20, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" },
  invoiceDocument: { border: "1px solid #ccc", padding: 24, background: "#fff", borderRadius: 4 },
};
