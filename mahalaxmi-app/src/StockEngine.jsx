function InvoiceBuilder({ data, persist }) {
  const [partyId, setPartyId] = useState("");
  const [billStart, setBillStart] = useState("");
  const [billEnd, setBillEnd] = useState("");
  
  // State for editable invoice lines
  const [lines, setLines] = useState([]);
  const [transportCharge, setTransportCharge] = useState(0);
  const [deposit, setDeposit] = useState(0);

  // 1. Auto-compute lines when party or dates change, then set to local state
  useEffect(() => {
    if (!partyId || !billStart || !billEnd) {
      setLines([]);
      setTransportCharge(0);
      setDeposit(0);
      return;
    }

    const computed = computeInvoiceLines(data, partyId, billStart, billEnd);
    setLines(computed.lines || []);
    setTransportCharge(computed.transportTotal || 0);
    setDeposit(computed.depositTotal || 0);
  }, [partyId, billStart, billEnd, data]);

  // 2. Handler to edit any field in a line
  const handleUpdateLine = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      // Auto-recalculate row amount if Qty or Rate changes
      if (field === "qty" || field === "rate" || field === "days") {
        const qty = Number(field === "qty" ? value : target.qty) || 0;
        const rate = Number(field === "rate" ? value : target.rate) || 0;
        const days = Number(field === "days" ? value : target.days) || 1;
        
        // Account for item feet measurement if applicable
        const multiplier = target.feet ? target.feet : 1;
        target.amount = round2(qty * rate * (target.kind === "service" || target.kind === "broken" ? 1 : days) * multiplier);
      }

      updated[index] = target;
      return updated;
    });
  };

  // 3. Handler to add a new custom/manual line item
  const handleAddCustomLine = () => {
    const customItem = {
      kind: "custom",
      itemId: `custom-${Date.now()}`,
      itemName: "Custom Item / Labor Charge",
      qty: 1,
      rate: 0,
      days: 1,
      amount: 0,
      start: billStart || "",
      end: billEnd || "",
    };
    setLines((prev) => [...prev, customItem]);
  };

  // 4. Handler to remove a line
  const handleRemoveLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // 5. Dynamic calculations from live editable state
  const itemRentTotal = round2(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
  const additionalCharges = round2(Number(transportCharge) || 0);
  const netTotal = round2(itemRentTotal + additionalCharges - (Number(deposit) || 0));

  const party = data.parties.find((p) => p.id === partyId);
  const gst = computeGst(party, itemRentTotal + additionalCharges);

  return (
    <div style={{ padding: 20 }}>
      <PageHeader title="Create Invoice" subtitle="Generate, edit, or customize party rental invoices." />

      {/* Invoice Details Header */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <PartyFilter parties={data.parties} value={partyId} onChange={setPartyId} />
        <label style={styles.field}>
          <span style={styles.fieldLabel}>From Date</span>
          <input type="date" value={billStart} onChange={(e) => setBillStart(e.target.value)} style={styles.input} />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>To Date</span>
          <input type="date" value={billEnd} onChange={(e) => setBillEnd(e.target.value)} style={styles.input} />
        </label>
      </div>

      {/* Editable Line Items Table */}
      <div style={{ marginBottom: 20 }}>
        <h3>Invoice Line Items</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th>Description</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Days</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                {/* Description editing */}
                <td style={{ padding: 8 }}>
                  <input
                    type="text"
                    value={line.itemName}
                    onChange={(e) => handleUpdateLine(idx, "itemName", e.target.value)}
                    style={{ width: "100%", padding: 4 }}
                  />
                </td>
                {/* Qty editing */}
                <td style={{ padding: 8, width: 80 }}>
                  <input
                    type="number"
                    value={line.qty}
                    onChange={(e) => handleUpdateLine(idx, "qty", e.target.value)}
                    style={{ width: "100%", padding: 4 }}
                  />
                </td>
                {/* Rate editing */}
                <td style={{ padding: 8, width: 100 }}>
                  <input
                    type="number"
                    value={line.rate}
                    onChange={(e) => handleUpdateLine(idx, "rate", e.target.value)}
                    style={{ width: "100%", padding: 4 }}
                  />
                </td>
                {/* Days editing */}
                <td style={{ padding: 8, width: 80 }}>
                  <input
                    type="number"
                    value={line.days || ""}
                    onChange={(e) => handleUpdateLine(idx, "days", e.target.value)}
                    style={{ width: "100%", padding: 4 }}
                    disabled={line.kind === "service" || line.kind === "broken"}
                  />
                </td>
                {/* Calculated Amount */}
                <td style={{ padding: 8, width: 100, fontWeight: "bold" }}>
                  ₹{line.amount}
                </td>
                {/* Action - Remove row */}
                <td style={{ padding: 8, width: 60 }}>
                  <button onClick={() => handleRemoveLine(idx)} style={{ color: "red", border: "none", background: "none", cursor: "pointer" }}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add custom item button */}
        <button
          onClick={handleAddCustomLine}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 4,
          }}
        >
          <Plus size={16} /> Add Custom Line Item
        </button>
      </div>

      {/* Totals Summary */}
      <div style={{ maxWidth: 300, marginLeft: "auto", borderTop: "2px solid #333", paddingTop: 10 }}>
        <div>Subtotal: <strong>₹{itemRentTotal}</strong></div>
        <div>Transport: <strong>₹{transportCharge}</strong></div>
        <div>Deposit Credit: <strong>-₹{deposit}</strong></div>
        {gst.applicable && <div>GST ({gst.rate}%): <strong>₹{gst.totalGst}</strong></div>}
        <hr />
        <div style={{ fontSize: 18, fontWeight: "bold" }}>
          Grand Total: ₹{gst.applicable ? gst.grandTotal : netTotal}
        </div>
      </div>
    </div>
  );
}
