export const NAV_STRUCTURE = [
  { key: "overall",        label: "Overall",        defaultTo: null, pages: [] },
  {
    key: "d2c",
    label: "D2C",
    defaultTo: "/d2c-overview",
    pages: [
      { to: "/d2c-overview", label: "Overview" },
      { to: "/web-cr",       label: "Web CR" },
      { to: "/app-cr",       label: "App CR" },
      { to: "/rto",          label: "D2C RTO" },
      { to: "/repeat",       label: "Repeat & retention" },
      { to: "/promo",        label: "Promo & basket" },
      { to: "/supply",       label: "Supply chain" },
      { to: "/acquisition",  label: "Acquisition" },
    ],
  },
  { key: "marketplace",    label: "Marketplace",    defaultTo: null, pages: [] },
  { key: "quick-commerce", label: "Quick commerce", defaultTo: null, pages: [] },
  { key: "marketing",      label: "Marketing",      defaultTo: null, pages: [] },
  { key: "influencer",     label: "Influencer",     defaultTo: null, pages: [] },
  { key: "crm",            label: "Customer/CRM",   defaultTo: null, pages: [] },
];

export const ROUTE_TAB = {
  "/d2c-overview": "d2c",
  "/web-cr":       "d2c",
  "/app-cr":       "d2c",
  "/rto":          "d2c",
  "/repeat":       "d2c",
  "/promo":        "d2c",
  "/supply":       "d2c",
  "/acquisition":  "d2c",
};
