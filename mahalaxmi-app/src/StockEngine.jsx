import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Package, Truck, RotateCcw, Users, Boxes, LayoutGrid, Plus, Trash2, AlertCircle, CheckCircle2, FileText, Archive, Printer, Download, Upload, History, Pencil, X, Ban, Settings, LogOut, Menu, Wallet } from "lucide-react";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "mlx-stockengine-v1";

// Dates are always stored as YYYY-MM-DD internally (required by <input type="date">).
// This only changes how they're shown on screen, e.g. in tables.
function fmtDateDisplay(iso) {
  if (!iso || typeof iso !== "string") return iso || "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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
  seq: { party: 1, item: 1, delivery: 1, return: 1, invoice: 1 },
  company: { ...DEFAULT_COMPANY },
});

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
  const [navOpen, setNavOpen] = useState(false); // mobile-only sidebar drawer

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
        setData(loaded);
      } catch {
        setData(buildSeedData());
      }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    setSaveState("saving");
    try {
      const { error } = await supabase
        .from("app_state")
        .update({ data: next, updated_at: new Date().toISOString() })
        .eq("id", "default");
      if (error) throw error;
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setSaveState("idle");
    }
  }, []);

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
    { id: "archive", label: "Invoice Archive", icon: Archive },
    { id: "ledger", label: "Party Ledger", icon: History },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "backup", label: "Backup & Restore", icon: Download },
    { id: "settings", label: "Company Settings", icon: Settings },
  ];

  return (
    <div className="app-shell" style={styles.app}>
      <style>{globalCss}</style>

      {/* Mobile-only top bar with hamburger — hidden on desktop via CSS */}
      <div className="mobile-topbar">
        <button
          className="mobile-menu-btn"
          onClick={() => setNavOpen(true)}
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
      {navOpen && <div className="mobile-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar${navOpen ? " sidebar-open" : ""}`} style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>M</div>
          <div>
            <div style={styles.brandName}>Mahalaxmi</div>
            <div style={styles.brandSub}>Stock Engine</div>
          </div>
          <button
            className="mobile-close-btn"
            onClick={() => setNavOpen(false)}
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
                onClick={() => {
                  setTab(n.id);
                  setNavOpen(false); // close drawer after picking a page on mobile
                }}
                style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}
              >
                <Icon size={16} strokeWidth={2} />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div style={styles.saveIndicator}>
          {saveState === "saving" && <span style={styles.saveDim}>Saving…</span>}
          {saveState === "saved" && (
            <span style={styles.saveOk}><CheckCircle2 size={13} /> Saved</span>
          )}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {session?.user?.email && (
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8, wordBreak: "break-all" }}>
              {session.user.email}
            </div>
          )}
          <button
            onClick={onLogout}
            style={{ ...styles.navBtn, width: "100%", justifyContent: "flex-start" }}
          >
            <LogOut size={16} strokeWidth={2} />
            Log out
          </button>
        </div>
      </aside>

      <main className="main-content" style={styles.main}>
        {tab === "dashboard" && <Dashboard data={data} />}
        {tab === "parties" && <PartyMaster data={data} persist={persist} />}
        {tab === "items" && <ItemMaster data={data} persist={persist} />}
        {tab === "backup" && <BackupRestore data={data} persist={persist} />}
        {tab === "settings" && <CompanySettings data={data} persist={persist} />}
        {tab === "delivery" && <DeliveryEntry data={data} persist={persist} />}
        {tab === "return" && <ReturnEntry data={data} persist={persist} />}
        {tab === "invoice" && <InvoiceBuilder data={data} persist={persist} />}
        {tab === "archive" && <InvoiceArchive data={data} persist={persist} />}
        {tab === "ledger" && <PartyLedger data={data} persist={persist} />}
        {tab === "expenses" && <Expenses data={data} persist={persist} />}
      </main>
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

function Dashboard({ data }) {
  const rented = useMemo(() => {
    return partyItemPairs(data)
      .map((pair) => {
        const del = deliveredQty(data, pair.partyId, pair.itemId);
        const ret = returnedQty(data, pair.partyId, pair.itemId);
        return { ...pair, delivered: del, returned: ret, current: del - ret };
      })
      .sort((a, b) => b.current - a.current);
  }, [data]);

  const depotAvailable = useMemo(() => {
    return data.items.map((it) => {
      const rentedOut = rented.filter((r) => r.itemId === it.id).reduce((s, r) => s + r.current, 0);
      return { ...it, rentedOut, available: (Number(it.totalDepotStock) || 0) - rentedOut };
    });
  }, [data, rented]);

  const pendingChallanRows = useMemo(() => {
    const rows = [];
    for (const c of data.deliveryChallans) {
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
  }, [data]);

  return (
    <div>
      <PageHeader title="Stock Dashboard" subtitle="Live position across every party and item — recalculated from every delivery and return entered." />

      <div style={styles.statRow}>
        <StatCard label="Parties" value={data.parties.length} />
        <StatCard label="Items" value={data.items.length} />
        <StatCard label="Open delivery challans" value={data.deliveryChallans.length} />
        <StatCard label="Return challans logged" value={data.returnChallans.length} />
      </div>

      <div style={styles.grid2}>
        <Panel title="Party-wise Rented Stock" hint="Delivered − Returned, per party & item">
          {rented.length === 0 ? (
            <Empty text="No delivery entries yet." />
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
      </div>

      <Panel title="Pending Challan Stock" hint="Per delivery challan, quantity not yet returned">
        {pendingChallanRows.length === 0 ? (
          <Empty text="Nothing outstanding — every challan fully returned." />
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
    </div>
  );
}

/* ---------------- Party Master ---------------- */

function PartyMaster({ data, persist }) {
  const blank = { name: "", address: "", siteName: "", phone: "", reference: "", gstin: "", requiresGst: false, gstType: "CGST_SGST" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);

  const add = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      persist({ ...data, parties: data.parties.map((p) => (p.id === editingId ? { ...p, ...form } : p)) });
      setEditingId(null);
    } else {
      const code = uid("P", data.seq.party);
      persist({
        ...data,
        parties: [...data.parties, { id: crypto.randomUUID(), code, ...form }],
        seq: { ...data.seq, party: data.seq.party + 1 },
      });
    }
    setForm(blank);
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      address: p.address || "",
      siteName: p.siteName || "",
      phone: p.phone || "",
      reference: p.reference || "",
      gstin: p.gstin || "",
      requiresGst: !!p.requiresGst,
      gstType: p.gstType || "CGST_SGST",
    });
  };
  const cancelEdit = () => { setEditingId(null); setForm(blank); };

  const remove = (id) => {
    if (editingId === id) cancelEdit();
    persist({ ...data, parties: data.parties.filter((p) => p.id !== id) });
  };

  return (
    <div>
      <PageHeader title="Party Master" subtitle="Codes are permanent. Rename freely — every past entry follows the new name automatically." />
      <Panel title={editingId ? "Edit Party (code stays fixed)" : "Add Party"}>
        <div style={styles.formRow}>
          <Field label="Party Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Site Name" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </div>
        <div style={styles.formRow}>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} wide />
          <Field label="Reference" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} />
        </div>
        <div style={styles.formRow}>
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
          <button style={styles.primaryBtn} onClick={add}>
            {editingId ? <><CheckCircle2 size={15} /> Save Changes</> : <><Plus size={15} /> Add Party</>}
          </button>
          {editingId && <button style={styles.ghostBtn} onClick={cancelEdit}>Cancel</button>}
        </div>
      </Panel>

      <Panel title={`All Parties (${data.parties.length})`}>
        {data.parties.length === 0 ? (
          <Empty text="No parties yet — add one above." />
        ) : (
          <Table
            cols={["Code", "Name", "Site", "Phone", "GST", ""]}
            rows={data.parties.map((p) => [
              <span style={styles.codeTag}>{p.code}</span>,
              p.name,
              p.siteName || "—",
              p.phone || "—",
              p.requiresGst
                ? <span style={styles.tinyTag}>{p.gstType === "IGST" ? "IGST 18%" : "CGST+SGST 18%"}</span>
                : <span style={{ color: COLORS.muted, fontSize: 12 }}>—</span>,
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.ghostBtn} onClick={() => startEdit(p)}>Edit</button>
                <button style={styles.iconBtn} onClick={() => remove(p.id)}><Trash2 size={14} /></button>
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Item Master ---------------- */

function ItemMaster({ data, persist }) {
  const blank = { name: "", dailyRate: "", serviceCharge: "", totalDepotStock: "" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);

  const add = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      dailyRate: Number(form.dailyRate) || 0,
      serviceCharge: Number(form.serviceCharge) || 0,
      totalDepotStock: Number(form.totalDepotStock) || 0,
    };
    if (editingId) {
      persist({ ...data, items: data.items.map((i) => (i.id === editingId ? { ...i, ...payload } : i)) });
      setEditingId(null);
    } else {
      const code = uid("I", data.seq.item);
      persist({
        ...data,
        items: [...data.items, { id: crypto.randomUUID(), code, ...payload }],
        seq: { ...data.seq, item: data.seq.item + 1 },
      });
    }
    setForm(blank);
  };

  const startEdit = (it) => {
    setEditingId(it.id);
    setForm({ name: it.name, dailyRate: it.dailyRate, serviceCharge: it.serviceCharge, totalDepotStock: it.totalDepotStock });
  };
  const cancelEdit = () => { setEditingId(null); setForm(blank); };

  const remove = (id) => {
    if (editingId === id) cancelEdit();
    persist({ ...data, items: data.items.filter((i) => i.id !== id) });
  };

  return (
    <div>
      <PageHeader title="Item Master" subtitle={'Add "ft" to the item name (e.g. "chavi 8ft") to mark it as a running-feet item.'} />
      <Panel title={editingId ? "Edit Item (code stays fixed)" : "Add Item"}>
        <div style={styles.formRow}>
          <Field label="Item Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. chavi 8ft" />
          <Field label="Daily Rate" value={form.dailyRate} onChange={(v) => setForm({ ...form, dailyRate: v })} type="number" />
          <Field label="Service Charge / unit" value={form.serviceCharge} onChange={(v) => setForm({ ...form, serviceCharge: v })} type="number" />
          <Field label="Total Depot Stock" value={form.totalDepotStock} onChange={(v) => setForm({ ...form, totalDepotStock: v })} type="number" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.primaryBtn} onClick={add}>
            {editingId ? <><CheckCircle2 size={15} /> Save Changes</> : <><Plus size={15} /> Add Item</>}
          </button>
          {editingId && <button style={styles.ghostBtn} onClick={cancelEdit}>Cancel</button>}
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
                  <button style={styles.ghostBtn} onClick={() => startEdit(it)}>Edit</button>
                  <button style={styles.iconBtn} onClick={() => remove(it.id)}><Trash2 size={14} /></button>
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

function DeliveryEntry({ data, persist }) {
  const emptyHeader = {
    date: new Date().toISOString().slice(0, 10),
    partyId: "",
    siteAddress: "",
    driverName: "",
    vehicleNumber: "",
    transportCharge: "",
    deposit: "",
  };
  const [header, setHeader] = useState(emptyHeader);
  const [lines, setLines] = useState([{ itemId: "", qty: "", rate: "" }]);
  const [editingId, setEditingId] = useState(null);

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
    setHeader({
      date: c.date,
      partyId: c.partyId,
      siteAddress: c.siteAddress || "",
      driverName: c.driverName || "",
      vehicleNumber: c.vehicleNumber || "",
      transportCharge: c.transportCharge || "",
      deposit: c.deposit || "",
    });
    setLines(c.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, rate: l.rate })));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setHeader(emptyHeader);
    setLines([{ itemId: "", qty: "", rate: "" }]);
  };

  const save = () => {
    if (!canSave) return;
    const cleanLines = lines
      .filter((l) => l.itemId && Number(l.qty) > 0)
      .map((l) => ({ itemId: l.itemId, qty: Number(l.qty), rate: Number(l.rate) || 0 }));

    let next;
    if (editingId) {
      next = {
        ...data,
        deliveryChallans: data.deliveryChallans.map((c) =>
          c.id === editingId
            ? { ...c, ...header, transportCharge: Number(header.transportCharge) || 0, deposit: Number(header.deposit) || 0, lines: cleanLines }
            : c
        ),
      };
    } else {
      const challanNo = data.seq.delivery;
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
          },
        ],
        seq: { ...data.seq, delivery: data.seq.delivery + 1 },
      };
    }
    persist(next);
    setEditingId(null);
    setHeader(emptyHeader);
    setLines([{ itemId: "", qty: "", rate: "" }]);
  };

  return (
    <div>
      <PageHeader title="Delivery Entry" subtitle="One challan, one or more items. Transport charge & deposit apply once per challan." />

      <Panel title={editingId ? `Editing Delivery Challan No. ${data.deliveryChallans.find((c) => c.id === editingId)?.challanNo ?? ""}` : `New Delivery Challan — No. ${data.seq.delivery}`}>
        {data.parties.length === 0 && <Notice text="Add at least one party in Party Master first." />}
        <div style={styles.formRow}>
          <Field label="Date" type="date" value={header.date} onChange={(v) => setHeader({ ...header, date: v })} />
          <SelectField
            label="Party"
            value={header.partyId}
            onChange={(v) => setHeader({ ...header, partyId: v })}
            options={data.parties.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          />
          <Field label="Site Address" value={header.siteAddress} onChange={(v) => setHeader({ ...header, siteAddress: v })} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Driver Name" value={header.driverName} onChange={(v) => setHeader({ ...header, driverName: v })} />
          <Field label="Vehicle Number" value={header.vehicleNumber} onChange={(v) => setHeader({ ...header, vehicleNumber: v })} />
          <Field label="Transport Charge" type="number" value={header.transportCharge} onChange={(v) => setHeader({ ...header, transportCharge: v })} />
          <Field label="Deposit" type="number" value={header.deposit} onChange={(v) => setHeader({ ...header, deposit: v })} />
        </div>

        <div style={styles.lineHeaderRow}>
          <span style={{ flex: 3 }}>Item</span>
          <span style={{ flex: 1 }}>Qty</span>
          <span style={{ flex: 1 }}>Rate</span>
          <span style={{ width: 32 }} />
        </div>
        {lines.map((l, idx) => (
          <div key={idx} style={styles.lineRow}>
            <select style={{ ...styles.select, flex: 3 }} value={l.itemId} onChange={(e) => setLine(idx, { itemId: e.target.value })}>
              <option value="">Select item…</option>
              {data.items.map((it) => (
                <option key={it.id} value={it.id}>{it.code} — {it.name}</option>
              ))}
            </select>
            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} />
            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Rate" value={l.rate} onChange={(e) => setLine(idx, { rate: e.target.value })} />
            <button style={styles.iconBtn} onClick={() => removeLine(idx)} disabled={lines.length === 1}><Trash2 size={14} /></button>
          </div>
        ))}
        <button style={styles.ghostBtn} onClick={addLine}><Plus size={14} /> Add line</button>

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.5 }} disabled={!canSave} onClick={save}>
            <CheckCircle2 size={15} /> {editingId ? "Update Challan" : "Save Challan"}
          </button>
          {editingId && (
            <button style={styles.ghostBtn} onClick={cancelEdit}><X size={13} /> Cancel Edit</button>
          )}
        </div>
      </Panel>

      <Panel title={`Delivery Challans (${data.deliveryChallans.length})`}>
        {data.deliveryChallans.length === 0 ? (
          <Empty text="No deliveries recorded yet." />
        ) : (
          <Table
            cols={["Challan No.", "Date", "Party", "Items", ""]}
            rows={[...data.deliveryChallans].reverse().map((c) => [
              c.challanNo,
              fmtDateDisplay(c.date),
              partyName(data, c.partyId),
              c.lines.map((l) => `${itemName(data, l.itemId)} × ${l.qty}`).join(", "),
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.iconBtn} onClick={() => startEdit(c)} title="Edit challan"><Pencil size={14} /></button>
                <button style={styles.iconBtn} onClick={() => { if (editingId === c.id) cancelEdit(); persist({ ...data, deliveryChallans: data.deliveryChallans.filter((x) => x.id !== c.id) }); }} title="Delete challan"><Trash2 size={14} /></button>
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Return Entry ---------------- */

function ReturnEntry({ data, persist }) {
  const emptyHeader = { date: new Date().toISOString().slice(0, 10), partyId: "" };
  const [header, setHeader] = useState(emptyHeader);
  const [lines, setLines] = useState([{ itemId: "", againstChallanId: "", qty: "", brokenQty: "", brokenRate: "" }]);
  const [editingId, setEditingId] = useState(null);

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
    setHeader({ date: c.date, partyId: c.partyId });
    setLines(c.lines.map((l) => ({ itemId: l.itemId, againstChallanId: l.againstChallanId, qty: l.qty, brokenQty: l.brokenQty, brokenRate: l.brokenRate })));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setHeader(emptyHeader);
    setLines([{ itemId: "", againstChallanId: "", qty: "", brokenQty: "", brokenRate: "" }]);
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
    if (editingId) {
      next = {
        ...data,
        returnChallans: data.returnChallans.map((c) =>
          c.id === editingId ? { ...c, date: header.date, partyId: header.partyId, lines: cleanLines } : c
        ),
      };
    } else {
      const returnChallanNo = data.seq.return;
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
          },
        ],
        seq: { ...data.seq, return: data.seq.return + 1 },
      };
    }
    persist(next);
    setEditingId(null);
    setHeader(emptyHeader);
    setLines([{ itemId: "", againstChallanId: "", qty: "", brokenQty: "", brokenRate: "" }]);
  };

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

  return (
    <div>
      <PageHeader title="Return Entry" subtitle="Pick the item first — the challan dropdown only shows delivery challans still pending for that party & item." />

      <Panel title={editingId ? `Editing Return Challan No. ${data.returnChallans.find((c) => c.id === editingId)?.returnChallanNo ?? ""}` : `New Return Challan — No. ${data.seq.return}`}>
        <div style={styles.formRow}>
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
            <div style={styles.lineHeaderRow}>
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
                <div key={idx} style={styles.lineRow}>
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
                  <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="0" value={l.brokenQty} onChange={(e) => setLine(idx, { brokenQty: e.target.value })} />
                  <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="0" value={l.brokenRate} onChange={(e) => setLine(idx, { brokenRate: e.target.value })} />
                  <button style={styles.iconBtn} onClick={() => removeLine(idx)} disabled={lines.length === 1}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <button style={styles.ghostBtn} onClick={addLine}><Plus size={14} /> Add line</button>

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button style={{ ...styles.primaryBtn, opacity: canSave ? 1 : 0.5 }} disabled={!canSave} onClick={save}>
                <CheckCircle2 size={15} /> {editingId ? "Update Return" : "Save Return"}
              </button>
              {editingId && (
                <button style={styles.ghostBtn} onClick={cancelEdit}><X size={13} /> Cancel Edit</button>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel title={`Return Challans (${data.returnChallans.length})`}>
        {data.returnChallans.length === 0 ? (
          <Empty text="No returns recorded yet." />
        ) : (
          <Table
            cols={["Return No.", "Date", "Party", "Items", ""]}
            rows={[...data.returnChallans].reverse().map((c) => [
              c.returnChallanNo,
              fmtDateDisplay(c.date),
              partyName(data, c.partyId),
              c.lines.map((l) => `${itemName(data, l.itemId)} × ${l.qty}`).join(", "),
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.iconBtn} onClick={() => startEdit(c)} title="Edit return"><Pencil size={14} /></button>
                <button style={styles.iconBtn} onClick={() => { if (editingId === c.id) cancelEdit(); persist({ ...data, returnChallans: data.returnChallans.filter((x) => x.id !== c.id) }); }} title="Delete return"><Trash2 size={14} /></button>
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Invoice Builder ---------------- */

function InvoiceBuilder({ data, persist }) {
  const [partyId, setPartyId] = useState("");
  const [billStart, setBillStart] = useState("");
  const [billEnd, setBillEnd] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));

  const party = data.parties.find((p) => p.id === partyId) || null;

  const result = useMemo(() => {
    if (!partyId || !billStart || !billEnd) return null;
    return computeInvoiceLines(data, partyId, billStart, billEnd);
  }, [data, partyId, billStart, billEnd]);

  const gst = useMemo(() => {
    if (!result) return null;
    return computeGst(party, result.itemRentTotal + result.additionalCharges);
  }, [result, party]);

  const finalTotal = result && gst ? round2(gst.grandTotal - result.depositTotal) : null;

  const save = () => {
    if (!result || result.lines.length === 0) return;
    const invoiceNo = data.seq.invoice;
    const next = {
      ...data,
      invoices: [
        ...data.invoices,
        { id: crypto.randomUUID(), invoiceNo, partyId, billStart, billEnd, invoiceDate, ...result, gst, finalTotal },
      ],
      seq: { ...data.seq, invoice: data.seq.invoice + 1 },
    };
    persist(next);
    setPartyId("");
    setBillStart("");
    setBillEnd("");
  };

  return (
    <div>
      <PageHeader title="Create Invoice" subtitle="Bills every delivered item for the window below — returned quantities to their return date, the rest through Billing End Date." />

      <Panel title="Billing Window">
        <div style={styles.formRow}>
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
        result.lines.length === 0 ? (
          <Panel title="Preview"><Empty text="No billable lines for this party in this window — check the dates or that deliveries exist." /></Panel>
        ) : (
          <>
            <Panel title={`Preview — ${result.lines.length} line${result.lines.length > 1 ? "s" : ""}`} hint={result.lines.length > 15 ? "Over 15 lines — will print as a continuation invoice" : undefined}>
              <Table
                cols={["Sr.", "Item", "Qty", "Rate/Ft/Day", "S.Date", "E.Date", "Days", "Amount"]}
                rows={result.lines.map((l, i) => [
                  i + 1,
                  <span>{l.itemName} {l.returned && <em style={styles.tinyTag}>returned</em>} {l.broken && <em style={styles.tinyTag}>broken</em>} {l.service && <em style={styles.tinyTag}>service</em>}</span>,
                  l.qty,
                  l.feet ? `${l.rate} × ${l.feet}ft` : l.rate,
                  l.start,
                  l.end,
                  l.days,
                  l.amount.toFixed(2),
                ])}
              />
              <div style={styles.totalsBox}>
                <TotalRow label="Item Rent Amount" value={result.itemRentTotal} />
                {result.brokenTotal > 0 && <TotalRow label="  — of which Broken Charges" value={result.brokenTotal} />}
                {result.serviceTotal > 0 && <TotalRow label="  — of which Service Charges" value={result.serviceTotal} />}
                <TotalRow label="Transport Charge" value={result.transportTotal} />
                {gst && gst.applicable ? (
                  <>
                    <TotalRow label="Taxable Value" value={gst.taxableValue} bold />
                    {gst.gstType === "IGST" ? (
                      <TotalRow label={`IGST @ ${gst.rate}%`} value={gst.igst} />
                    ) : (
                      <>
                        <TotalRow label={`CGST @ ${gst.rate / 2}%`} value={gst.cgst} />
                        <TotalRow label={`SGST @ ${gst.rate / 2}%`} value={gst.sgst} />
                      </>
                    )}
                    <TotalRow label="Deposit (deducted)" value={-result.depositTotal} />
                    <TotalRow label="Grand Total (incl. GST)" value={finalTotal} big />
                  </>
                ) : (
                  <>
                    <TotalRow label="Deposit (deducted)" value={-result.depositTotal} />
                    <TotalRow label="Net Total" value={result.netTotal} big />
                  </>
                )}
              </div>
              <button style={{ ...styles.primaryBtn, marginTop: 14 }} onClick={save}>
                <CheckCircle2 size={15} /> Finalize & Save Invoice #{data.seq.invoice}
              </button>
            </Panel>
          </>
        )
      )}
    </div>
  );
}

/* ---------------- Invoice Archive ---------------- */

function InvoiceArchive({ data, persist }) {
  const [selectedId, setSelectedId] = useState(null);
  const [confirmVoidId, setConfirmVoidId] = useState(null);
  const selected = data.invoices.find((i) => i.id === selectedId);

  const voidInvoice = (id) => {
    persist({ ...data, invoices: data.invoices.filter((x) => x.id !== id) });
    if (selectedId === id) setSelectedId(null);
    setConfirmVoidId(null);
  };

  return (
    <div>
      <PageHeader title="Invoice Archive" subtitle="Every finalized invoice, saved permanently as a snapshot." />
      <Panel title={`Invoices (${data.invoices.length})`}>
        {data.invoices.length === 0 ? (
          <Empty text="No invoices finalized yet — create one in Create Invoice." />
        ) : (
          <Table
            cols={["Invoice No.", "Date", "Party", "Item Rent", "Additional Charges", "GST", "Total", ""]}
            rows={[...data.invoices].reverse().map((inv) => [
              inv.invoiceNo,
              fmtDateDisplay(inv.invoiceDate),
              partyName(data, inv.partyId),
              inv.itemRentTotal.toFixed(2),
              inv.additionalCharges.toFixed(2),
              inv.gst?.applicable
                ? <span style={styles.tinyTag}>{inv.gst.gstType === "IGST" ? "IGST" : "CGST+SGST"}</span>
                : <span style={{ color: COLORS.muted, fontSize: 12 }}>—</span>,
              <strong>{(inv.gst?.applicable ? (inv.finalTotal ?? inv.netTotal) : inv.netTotal).toFixed(2)}</strong>,
              confirmVoidId === inv.id ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: "system-ui, sans-serif" }}>Void this invoice?</span>
                  <button style={{ ...styles.iconBtn, color: "#b3261e", borderColor: "#b3261e" }} onClick={() => voidInvoice(inv.id)} title="Confirm void"><CheckCircle2 size={14} /></button>
                  <button style={styles.iconBtn} onClick={() => setConfirmVoidId(null)} title="Cancel"><X size={14} /></button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.ghostBtn} onClick={() => setSelectedId(inv.id)}><Printer size={13} /> View</button>
                  <button style={styles.iconBtn} onClick={() => setConfirmVoidId(inv.id)} title="Void invoice"><Ban size={14} /></button>
                </div>
              ),
            ])}
          />
        )}
      </Panel>
      {selected && <InvoicePrintView data={data} invoice={selected} />}
    </div>
  );
}

function InvoicePrintView({ data, invoice }) {
  const company = data.company || DEFAULT_COMPANY;

  return (
    <Panel title={`Invoice #${invoice.invoiceNo}`}>
      <div className="no-print" style={{ marginBottom: 14 }}>
        <button style={styles.primaryBtn} onClick={() => window.print()}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>
      <div className="print-area">
        <div className="invoice-sheet" style={styles.invoiceSheet}>
          <div style={styles.invoiceLetterhead}>
            <div style={styles.invoiceCompany}>{company.name}</div>
            <div style={styles.invoiceTagline}>{company.tagline}</div>
            <div style={styles.invoiceAddress}>{company.address} · {company.email}{company.gstin ? ` · GSTIN: ${company.gstin}` : ""}</div>
            {invoice.gst?.applicable && <div style={{ ...styles.invoiceTagline, fontWeight: 700, marginTop: 4 }}>TAX INVOICE</div>}
          </div>
          <div style={styles.invoiceMetaRow}>
            <span><strong>Party:</strong> {partyName(data, invoice.partyId)}</span>
            <span><strong>Invoice No.:</strong> {invoice.invoiceNo}</span>
            <span><strong>Invoice Date:</strong> {fmtDateDisplay(invoice.invoiceDate)}</span>
          </div>
          {invoice.gst?.applicable && (
            <div style={styles.invoiceMetaRow}>
              <span><strong>Party GSTIN:</strong> {data.parties.find((p) => p.id === invoice.partyId)?.gstin || "—"}</span>
              <span><strong>Tax Type:</strong> {invoice.gst.gstType === "IGST" ? "IGST" : "CGST + SGST"}</span>
            </div>
          )}
          <div style={styles.invoiceMetaRow}>
            <span><strong>Billing Period:</strong> {fmtDateDisplay(invoice.billStart)} → {fmtDateDisplay(invoice.billEnd)}</span>
          </div>
          <Table
            cols={["Sr.", "Item", "Qty", "Rate/Ft/Day", "S.Date", "E.Date", "Days", "Amount"]}
            rows={invoice.lines.map((l, i) => [
              i + 1,
              l.itemName,
              l.qty,
              l.feet ? `${l.rate} × ${l.feet}ft` : l.rate,
              fmtDateDisplay(l.start),
              fmtDateDisplay(l.end),
              l.days,
              l.amount.toFixed(2),
            ])}
          />
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
      </div>
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

function PartyLedger({ data, persist }) {
  const [partyId, setPartyId] = useState("");
  const [printMode, setPrintMode] = useState(null); // "rented" | "timeline" | null
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const party = data.parties.find((p) => p.id === partyId);
  const printRequested = useRef(false);

  useEffect(() => {
    const clear = () => setPrintMode(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  // reset the payment form whenever the selected party changes
  useEffect(() => {
    setPaymentForm(emptyPaymentForm());
  }, [partyId]);

  // Only print once React has actually committed the print-area class to the
  // DOM (printMode changed) — a fixed setTimeout can fire before that commit,
  // especially on slower mobile renders, leaving the print preview blank.
  useEffect(() => {
    if (printMode && printRequested.current) {
      printRequested.current = false;
      // one extra frame so the browser has painted the new class before we print
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    }
  }, [printMode]);

  const triggerPrint = (mode) => {
    printRequested.current = true;
    setPrintMode(mode);
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
    persist(next);
    setPaymentForm(emptyPaymentForm());
  };

  const deletePayment = (id) => {
    persist({ ...data, payments: (data.payments || []).filter((p) => p.id !== id) });
  };

  const rentedItems = useMemo(() => {
    if (!partyId) return [];
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
    return events.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data, partyId]);

  const totals = useMemo(() => {
    if (!partyId) return null;
    const partyInvoices = data.invoices.filter((i) => i.partyId === partyId);
    const partyPayments = (data.payments || []).filter((p) => p.partyId === partyId);
    const invoiced = round2(partyInvoices.reduce((s, i) => s + i.netTotal, 0));
    const paid = round2(partyPayments.reduce((s, p) => s + p.amount, 0));
    return {
      invoiced,
      brokenCharges: round2(partyInvoices.reduce((s, i) => s + (i.brokenTotal || 0), 0)),
      invoiceCount: partyInvoices.length,
      paid,
      balanceDue: round2(invoiced - paid),
    };
  }, [data, partyId]);

  const typeTagStyle = (type) => {
    if (type === "invoice") return { ...styles.tinyTag, background: "#eaf5ea", color: "#2e7d32" };
    if (type === "return") return { ...styles.tinyTag, background: "#fbeceb", color: COLORS.danger };
    if (type === "payment") return { ...styles.tinyTag, background: "#e6f0fb", color: "#1d5fa8" };
    return styles.tinyTag;
  };

  return (
    <div>
      <PageHeader title="Party Ledger" subtitle="Full history for one party — deliveries, returns, and invoices, in a single timeline." />

      <Panel title="Select Party">
        <div style={styles.formRow}>
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
          <div style={styles.statRow}>
            <StatCard label="Items currently rented" value={rentedItems.filter((r) => r.current > 0).length} />
            <StatCard label="Invoices raised" value={totals.invoiceCount} />
            <StatCard label="Total invoiced (₹)" value={totals.invoiced.toFixed(2)} />
            <StatCard label="Paid (₹)" value={totals.paid.toFixed(2)} />
            <StatCard label="Balance due (₹)" value={totals.balanceDue.toFixed(2)} />
          </div>

          <Panel title="Record a Payment" hint="Simple record-keeping — no receipts or gateway integration">
            <div style={styles.formRow}>
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
            <button style={{ ...styles.primaryBtn, opacity: canSavePayment ? 1 : 0.5 }} disabled={!canSavePayment} onClick={addPayment}>
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
                      <button style={styles.iconBtn} onClick={() => deletePayment(p.id)} title="Delete payment"><Trash2 size={14} /></button>,
                    ])}
                />
              </div>
            )}
          </Panel>

          <div className={printMode === "rented" ? "print-area" : ""}>
            <div className="no-print" style={{ marginBottom: 10 }}>
              <button style={styles.primaryBtn} onClick={() => triggerPrint("rented")}>
                <Printer size={15} /> Print / Save PDF
              </button>
            </div>
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
          </div>

          <div className={printMode === "timeline" ? "print-area" : ""}>
            <div className="no-print" style={{ marginBottom: 10 }}>
              <button style={styles.primaryBtn} onClick={() => triggerPrint("timeline")}>
                <Printer size={15} /> Print / Save PDF
              </button>
            </div>
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
                    fmtDateDisplay(e.date),
                    <em style={typeTagStyle(e.type)}>{e.type}</em>,
                    e.label,
                    e.detail,
                    e.amount != null ? `₹ ${e.amount.toFixed(2)}` : "—",
                  ])}
                />
              )}
            </Panel>
          </div>
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

function Expenses({ data, persist }) {
  const [form, setForm] = useState(emptyExpenseForm());
  const [customCategory, setCustomCategory] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const initialPeriod = defaultPeriod();
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);

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
    persist(next);
    setForm(emptyExpenseForm());
  };

  const deleteExpense = (id) => {
    persist({ ...data, expenses: (data.expenses || []).filter((e) => e.id !== id) });
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
    persist({ ...data, expenseCategories: nextCategories });
    setForm({ ...form, category: name });
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
        <div style={styles.formRow}>
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
          <button style={styles.iconBtn} onClick={() => setAddingCustom(true)}>
            <Plus size={14} /> Add custom category
          </button>
        ) : (
          <div style={styles.formRow}>
            <Field label="New category" value={customCategory} placeholder="e.g. Equipment Purchase" onChange={setCustomCategory} wide />
            <button style={styles.primaryBtn} onClick={addCustomCategory}>
              <CheckCircle2 size={15} /> Add
            </button>
            <button style={styles.iconBtn} onClick={() => { setAddingCustom(false); setCustomCategory(""); }}>
              <X size={14} />
            </button>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button style={{ ...styles.primaryBtn, opacity: canSaveExpense ? 1 : 0.5 }} disabled={!canSaveExpense} onClick={addExpense}>
            <CheckCircle2 size={15} /> Save Expense
          </button>
        </div>
      </Panel>

      <Panel title="Balance Sheet" hint="Pick a period to see spend vs. payments received">
        <div style={styles.formRow}>
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
              <button style={styles.iconBtn} onClick={() => deleteExpense(e.id)} title="Delete expense"><Trash2 size={14} /></button>,
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
        <button style={styles.primaryBtn} onClick={exportData}><Download size={15} /> Download Backup</button>
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
            <span style={{ fontSize: 12.5, color: COLORS.danger, fontFamily: "system-ui, sans-serif" }}>Replace all current data with the Excel import?</span>
            <button style={{ ...styles.primaryBtn, background: COLORS.danger }} onClick={reloadSeed}><CheckCircle2 size={14} /> Yes, reload it</button>
            <button style={styles.ghostBtn} onClick={() => setConfirmSeed(false)}><X size={13} /> Cancel</button>
          </div>
        ) : (
          <button style={styles.ghostBtn} onClick={() => setConfirmSeed(true)}><Upload size={14} /> Reload from Excel</button>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Company Settings ---------------- */

function CompanySettings({ data, persist }) {
  const current = { ...DEFAULT_COMPANY, ...(data.company || {}) };
  const [form, setForm] = useState(current);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(current);

  const save = () => {
    persist({ ...data, company: { ...form } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const resetDefaults = () => setForm({ ...DEFAULT_COMPANY });

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="This is the letterhead printed on every invoice — name, tagline, address and contact." />
      <Panel title="Letterhead">
        <div style={styles.formRow}>
          <Field label="Company Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Tagline" value={form.tagline} onChange={(v) => setForm({ ...form, tagline: v })} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} wide />
        </div>
        <div style={styles.formRow}>
          <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Company GSTIN" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v })} placeholder="e.g. 24AAAAA0000A1Z5" />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <button style={{ ...styles.primaryBtn, opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={save}>
            <CheckCircle2 size={15} /> Save Letterhead
          </button>
          <button style={styles.ghostBtn} onClick={resetDefaults}>Reset to default</button>
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
    <div style={styles.pageHeader}>
      <h1 style={styles.h1}>{title}</h1>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
function Panel({ title, hint, children }) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h2 style={styles.h2}>{title}</h2>
        {hint && <span style={styles.hint}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}
function Table({ cols, rows }) {
  return (
    <div className="table-wrap" style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>{cols.map((c, i) => <th key={i} style={styles.th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={styles.tr}>
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
  bg: "#faf7f1",
  panel: "#ffffff",
  ink: "#241c14",
  muted: "#8a7d6b",
  border: "#e7ddcd",
  amber: "#b5651d",
  amberDeep: "#8a4413",
  danger: "#b3261e",
  sidebar: "#241c14",
  sidebarInk: "#efe6d8",
};

const globalCss = `
  :root { --amber: ${COLORS.amber}; --ink: ${COLORS.ink}; --muted: ${COLORS.muted}; --danger: ${COLORS.danger}; }
  * { box-sizing: border-box; }
  input, select { font-family: inherit; }
  input:focus, select:focus, button:focus-visible { outline: 2px solid ${COLORS.amber}; outline-offset: 1px; }
  ::placeholder { color: #b6a98f; }

  @media print {
    @page { size: A4; margin: 10mm; }
    html, body { width: 100%; height: auto; }
    body * { display: none !important; }
    .print-area, .print-area * { display: revert !important; }
    .no-print { display: none !important; }
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
  }

  @media print and (orientation: landscape) {
    @page { size: A4 landscape; margin: 10mm; }
  }

  @media print and (orientation: portrait) {
    @page { size: A4 portrait; margin: 10mm; }
  }

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
      padding: 14px !important;
    }
  }
`;

const styles = {
  app: {
    display: "flex",
    minHeight: "600px",
    fontFamily: "'Georgia', 'Iowan Old Style', serif",
    background: COLORS.bg,
    color: COLORS.ink,
  },
  loadingWrap: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, background: COLORS.bg },
  loadingCard: { fontFamily: "Georgia, serif", color: COLORS.muted },
  sidebar: {
    width: 220,
    background: COLORS.sidebar,
    color: COLORS.sidebarInk,
    padding: "20px 14px",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 22px" },
  brandMark: {
    width: 32, height: 32, borderRadius: 6, background: COLORS.amber, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16,
    fontFamily: "Georgia, serif",
  },
  brandName: { fontSize: 14.5, fontWeight: 700, letterSpacing: 0.2 },
  brandSub: { fontSize: 11, color: "#a89a83", letterSpacing: 0.5, textTransform: "uppercase" },
  nav: { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  navBtn: {
    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
    padding: "9px 10px", borderRadius: 6, border: "none", background: "transparent",
    color: "#cfc3ac", fontSize: 13.5, cursor: "pointer", fontFamily: "system-ui, sans-serif",
    transition: "background 0.15s",
  },
  navBtnActive: { background: "rgba(181,101,29,0.25)", color: "#fff" },
  saveIndicator: { height: 20, paddingLeft: 10, fontSize: 11.5, fontFamily: "system-ui, sans-serif" },
  saveDim: { color: "#8a7d6b" },
  saveOk: { color: "#c9e4a8", display: "flex", alignItems: "center", gap: 4 },
  main: { flex: 1, padding: "28px 34px 60px", overflowY: "auto" },
  pageHeader: { marginBottom: 22, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 14 },
  h1: { fontSize: 22, margin: 0, fontWeight: 700 },
  subtitle: { fontSize: 13, color: COLORS.muted, margin: "6px 0 0", fontFamily: "system-ui, sans-serif" },
  h2: { fontSize: 14.5, margin: 0, fontWeight: 700 },
  hint: { fontSize: 11.5, color: COLORS.muted, fontFamily: "system-ui, sans-serif" },
  panel: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10,
    padding: 18, marginBottom: 18,
  },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 },
  statCard: { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" },
  statValue: { fontSize: 24, fontWeight: 700, color: COLORS.amber },
  statLabel: { fontSize: 11.5, color: COLORS.muted, fontFamily: "system-ui, sans-serif", marginTop: 2 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  formRow: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, minWidth: 120 },
  fieldLabel: { fontSize: 11, color: COLORS.muted, fontFamily: "system-ui, sans-serif" },
  input: {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${COLORS.border}`,
    fontSize: 13.5, background: "#fffdf9", color: COLORS.ink, fontFamily: "system-ui, sans-serif",
  },
  select: {
    padding: "8px 10px", borderRadius: 6, border: `1px solid ${COLORS.border}`,
    fontSize: 13.5, background: "#fffdf9", color: COLORS.ink, fontFamily: "system-ui, sans-serif",
  },
  primaryBtn: {
    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px",
    background: COLORS.amber, color: "#fff", border: "none", borderRadius: 7,
    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },
  ghostBtn: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
    background: "transparent", color: COLORS.amberDeep, border: `1px dashed ${COLORS.amber}`,
    borderRadius: 6, fontSize: 12.5, cursor: "pointer", fontFamily: "system-ui, sans-serif", marginTop: 4,
  },
  iconBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 6,
    color: COLORS.muted, cursor: "pointer",
  },
  lineHeaderRow: { display: "flex", gap: 8, fontSize: 11, color: COLORS.muted, fontFamily: "system-ui, sans-serif", padding: "0 2px 4px", marginTop: 6 },
  lineRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 6 },
  tableWrap: { overflowX: "auto", overflowY: "auto", maxHeight: 460, borderRadius: 6 },
  table: { width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif" },
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
  empty: { color: COLORS.muted, fontSize: 13, fontFamily: "system-ui, sans-serif", padding: "10px 0" },
  plainText: { fontSize: 13, color: COLORS.ink, fontFamily: "system-ui, sans-serif", marginBottom: 12, lineHeight: 1.5 },
  okNotice: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#2e7d32",
    background: "#eaf5ea", border: "1px solid #cbe6cc", borderRadius: 6, padding: "8px 10px",
    marginBottom: 10, fontFamily: "system-ui, sans-serif",
  },
  notice: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.danger,
    background: "#fbeceb", border: "1px solid #f0cfcc", borderRadius: 6, padding: "8px 10px",
    marginBottom: 10, fontFamily: "system-ui, sans-serif",
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
    fontFamily: "system-ui, sans-serif",
  },
  totalRowBig: {
    fontSize: 16, borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 8, color: COLORS.amberDeep,
  },
  invoiceSheet: {
    border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 18, marginBottom: 16, background: "#fffdf9",
  },
  invoiceLetterhead: { textAlign: "center", marginBottom: 14, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10 },
  invoiceCompany: { fontSize: 17, fontWeight: 700, letterSpacing: 0.3 },
  invoiceTagline: { fontSize: 10.5, color: COLORS.muted, marginTop: 3, fontFamily: "system-ui, sans-serif" },
  invoiceAddress: { fontSize: 10.5, color: COLORS.muted, marginTop: 3, fontFamily: "system-ui, sans-serif" },
  invoiceMetaRow: {
    display: "flex", gap: 20, fontSize: 12.5, marginBottom: 6, fontFamily: "system-ui, sans-serif", flexWrap: "wrap",
  },
};
