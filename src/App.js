import { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ══════════════════════════════════════════════════════════════════
// 🔧 CONFIGURAZIONE — inserisci i tuoi valori qui
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
  CLIENT_ID: "991577222508-lffdo7ns7a7iem93bg8p1ukh42tc4k05.apps.googleusercontent.com",
  SPREADSHEET_ID: "1-n9jW6Zo01J_7RrulTzcmxMFbo9vToI2ON1iX3MXUXE",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets",
  POLL_INTERVAL_MS: 30000, // sincronizzazione automatica ogni 30s
};

// ══════════════════════════════════════════════════════════════════
// PALETTE & COSTANTI
// ══════════════════════════════════════════════════════════════════
const C = {
  navy: "#1B2A4A", dark: "#0D1B2A", gold: "#C9A84C",
  softGold: "#F0E0A0", green: "#2ECC71", red: "#E74C3C",
  grey: "#8892A0", ivory: "#F5F0E8", blue: "#3498DB",
};

const CATEGORIE_DEF = [
  { id: "costi_fissi", label: "Costi Fissi",       emoji: "💳", color: "#E8534A" },
  { id: "benzina",     label: "Benzina",            emoji: "⛽", color: "#F0A500" },
  { id: "spesa",       label: "Spesa",              emoji: "🛒", color: "#3DB87A" },
  { id: "cibo",        label: "Cibo / Ristoranti",  emoji: "🍽️", color: "#FF6B6B" },
  { id: "tabacchi",    label: "Tabacchi",           emoji: "🚬", color: "#9B8EA0" },
  { id: "risparmi",    label: "Risparmi",           emoji: "🏦", color: "#4A9EE8" },
  { id: "viaggio",     label: "Viaggio",            emoji: "✈️", color: "#00BFA5" },
  { id: "altro",       label: "Altro",              emoji: "📦", color: "#6C757D" },
];
const CAT_IDS = CATEGORIE_DEF.map(c => c.id);
const CAT_MAP  = Object.fromEntries(CATEGORIE_DEF.map(c => [c.id, c]));

const MESI       = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const MESI_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const TIPI       = ["Spesa Fissa","Spesa Variabile","Spesa Extra","Entrata"];

// ══════════════════════════════════════════════════════════════════
// SHEETS API
// ══════════════════════════════════════════════════════════════════
const sid = () => CONFIG.SPREADSHEET_ID;

const shGet = async (token, range) => {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid()}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`GET ${range}: ${r.status}`);
  return r.json();
};

const shAppend = async (token, range, values) => {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid()}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values }) }
  );
  if (!r.ok) throw new Error(`APPEND ${range}: ${r.status}`);
  return r.json();
};

const shClear = async (token, range) => {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid()}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`CLEAR ${range}: ${r.status}`);
  return r.json();
};

const shUpdate = async (token, range, values) => {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid()}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values }) }
  );
  if (!r.ok) throw new Error(`UPDATE ${range}: ${r.status}`);
  return r.json();
};

// upsert su foglio Config
const shUpsertConfig = async (token, chiave, valore, configCache) => {
  const idx = configCache.findIndex(r => r[0] === chiave);
  if (idx >= 0) await shUpdate(token, `Config!B${idx + 1}`, [[valore]]);
  else          await shAppend(token, "Config!A:B", [[chiave, valore]]);
};

// ══════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════
const eur = n => {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "€ —";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n));
};

const inp = (extra = {}) => ({
  background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8,
  padding: "8px 12px", color: C.ivory, fontSize: 13, outline: "none", width: "100%", ...extra,
});

const card = (extra = {}) => ({
  background: `linear-gradient(160deg, ${C.navy}EE 0%, ${C.dark}EE 100%)`,
  border: `1px solid ${C.gold}22`, borderRadius: 14, padding: "18px 16px", ...extra,
});

// ══════════════════════════════════════════════════════════════════
// MICRO-COMPONENTS
// ══════════════════════════════════════════════════════════════════
function SH({ title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ height: 2, width: 18, background: C.gold, borderRadius: 2 }} />
      <span style={{ margin: 0, fontSize: 11, fontWeight: 800, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</span>
      <div style={{ height: 1, flex: 1, background: `${C.gold}22` }} />
    </div>
  );
}

function KpiCard({ label, value, icon, color, sub }) {
  return (
    <div style={{ background: `linear-gradient(135deg,${C.dark},${C.navy})`, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: "14px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 8, right: 10, fontSize: 22, opacity: 0.1 }}>{icon}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.grey, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || C.gold, fontFamily: "monospace" }}>{eur(value)}</div>
      {sub && <div style={{ fontSize: 9, color: C.grey, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Spin() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${C.gold}33`, borderTop: `3px solid ${C.gold}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// DONUT CHART (custom SVG, no recharts)
// ══════════════════════════════════════════════════════════════════
function Donut({ dati, totaleSpeso, entrate }) {
  const [hov, setHov] = useState(null);
  const [anim, setAnim] = useState(false);
  const SIZE = 240, CX = 120, CY = 120, RO = 100, RI = 62;

  useEffect(() => { setTimeout(() => setAnim(true), 80); }, []);

  const tot = dati.reduce((s, d) => s + d.valore, 0);
  let off = -Math.PI / 2;
  const slices = dati.map(d => {
    const ang = (d.valore / tot) * 2 * Math.PI;
    const s = off, e = off + ang; off = e;
    const lg = ang > Math.PI ? 1 : 0;
    const path = `M ${CX + RO * Math.cos(s)} ${CY + RO * Math.sin(s)}
      A ${RO} ${RO} 0 ${lg} 1 ${CX + RO * Math.cos(e)} ${CY + RO * Math.sin(e)}
      L ${CX + RI * Math.cos(e)} ${CY + RI * Math.sin(e)}
      A ${RI} ${RI} 0 ${lg} 0 ${CX + RI * Math.cos(s)} ${CY + RI * Math.sin(s)} Z`;
    return { ...d, path };
  });

  const pct = Math.min(100, (totaleSpeso / entrate) * 100);
  const r2 = RI - 10;
  const circ = 2 * Math.PI * r2;
  const hovD = hov ? dati.find(d => d.id === hov) : null;

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto" }}>
      <svg width={SIZE} height={SIZE} style={{ overflow: "visible" }}>
        {slices.map(s => (
          <path key={s.id} d={s.path} fill={s.color}
            opacity={hov === null ? 1 : hov === s.id ? 1 : 0.25}
            stroke="#0D1B2A" strokeWidth={2} style={{ cursor: "pointer", transform: hov === s.id ? "scale(1.05)" : "scale(1)", transformOrigin: `${CX}px ${CY}px`, transition: "all .2s" }}
            onMouseEnter={() => setHov(s.id)} onMouseLeave={() => setHov(null)}
            onTouchStart={() => setHov(s.id)} onTouchEnd={() => setTimeout(() => setHov(null), 1200)}
          />
        ))}
        <circle cx={CX} cy={CY} r={r2} fill="none" stroke="#1B2A4A" strokeWidth={5} />
        <circle cx={CX} cy={CY} r={r2} fill="none"
          stroke={pct > 90 ? C.red : pct > 70 ? C.gold : C.green} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={anim ? circ * (1 - pct / 100) : circ}
          strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
        {hovD ? (
          <>
            <div style={{ fontSize: 20 }}>{CAT_MAP[hovD.id]?.emoji}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: hovD.color, fontFamily: "monospace" }}>{eur(hovD.valore)}</div>
            <div style={{ fontSize: 10, color: C.grey }}>{(hovD.valore / totaleSpeso * 100).toFixed(0)}%</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, color: C.grey, textTransform: "uppercase", letterSpacing: "0.06em" }}>Speso</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.ivory, fontFamily: "monospace", lineHeight: 1.1 }}>{eur(totaleSpeso)}</div>
            <div style={{ fontSize: 10, color: pct > 90 ? C.red : pct > 70 ? C.gold : C.green, fontWeight: 700 }}>{pct.toFixed(0)}% entrate</div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CATEGORIA ROW (panoramica)
// ══════════════════════════════════════════════════════════════════
function CatRow({ cat, valore, valorePrecedente, totale, rank, expanded, onExpand, spese }) {
  const pct = totale > 0 ? (valore / totale) * 100 : 0;
  const delta = valorePrecedente > 0 ? ((valore - valorePrecedente) / valorePrecedente) * 100 : null;
  const [barW, setBarW] = useState(0);
  useEffect(() => { setTimeout(() => setBarW(pct), 80 + rank * 50); }, [pct, rank]);

  const dc = delta === null ? C.grey : delta > 5 ? C.red : delta < -5 ? C.green : C.gold;
  const dl = delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`;
  const de = delta === null ? "" : delta > 5 ? "▲" : delta < -5 ? "▼" : "→";

  return (
    <div style={{ marginBottom: 9 }}>
      <div onClick={onExpand} style={{
        padding: "11px 13px", background: expanded ? `${cat.color}18` : "#1B2A4A55",
        borderRadius: expanded ? "10px 10px 0 0" : 10,
        border: `1px solid ${expanded ? cat.color + "55" : "#1B2A4A"}`,
        borderBottom: expanded ? "none" : undefined, cursor: "pointer", transition: "all .2s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <span style={{ fontSize: 17, flexShrink: 0 }}>{cat.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.ivory }}>{cat.label}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: cat.color, fontFamily: "monospace" }}>{eur(valore)}</span>
            </div>
            <div style={{ background: "#0D1B2A", borderRadius: 3, height: 4 }}>
              <div style={{ height: "100%", borderRadius: 3, background: cat.color, width: `${barW}%`, transition: "width .8s cubic-bezier(.4,0,.2,1)" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 26 }}>
          <span style={{ fontSize: 10, color: C.grey }}>{pct.toFixed(1)}% del totale</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: dc, background: dc + "18", padding: "2px 7px", borderRadius: 8 }}>
            {de} {dl} vs mese prec.
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ background: `${cat.color}0A`, border: `1px solid ${cat.color}44`, borderTop: "none", borderRadius: "0 0 10px 10px" }}>
          {spese.length === 0
            ? <div style={{ padding: "10px 14px", fontSize: 12, color: C.grey, textAlign: "center" }}>Nessuna spesa</div>
            : spese.map((s, i) => (
              <div key={s.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 13px 8px 40px", borderTop: i > 0 ? `1px solid ${cat.color}18` : "none" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ivory }}>{s.descrizione}</div>
                  <div style={{ fontSize: 10, color: C.grey }}>{s.data}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: cat.color, fontFamily: "monospace" }}>{eur(Math.abs(s.importo))}</span>
              </div>
            ))
          }
          <div style={{ padding: "7px 13px 9px 40px", borderTop: `1px solid ${cat.color}33`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: C.grey, fontWeight: 700 }}>{spese.length} transazioni</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: cat.color, fontFamily: "monospace" }}>= {eur(valore)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB FISSI & SCADENZE
// ══════════════════════════════════════════════════════════════════
function TabFissi({ abbonamenti, setAbbonamenti, rate, setRate, totaleFissi, loading, salvaAbbonamenti, salvaRate, eur }) {
  const today = new Date();
  const [formRata, setFormRata] = useState({ nome: "", importo: "", giorno: "1", rateTot: "3", ratePagate: "0", dataFine: "" });
  const [showFormRata, setShowFormRata] = useState(false);

  const nextPayDate = (giorno) => {
    const g = parseInt(giorno);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), g);
    return thisMonth >= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, g);
  };

  const daysUntil = (d) => Math.round((new Date(d) - today) / 86400000);

  const fmtDate = (d) => new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

  const urgenza = (days) => {
    if (days < 0)  return { label: "Pagato",           bg: `${C.grey}22`,  col: C.grey };
    if (days === 0) return { label: "Oggi ⚡",          bg: `${C.red}25`,   col: C.red };
    if (days === 1) return { label: "Domani",           bg: `${C.red}18`,   col: C.red };
    if (days <= 3) return { label: `fra ${days}gg`,    bg: "#F0A50022",    col: "#F0A500" };
    if (days <= 7) return { label: `fra ${days}gg`,    bg: `${C.gold}18`,  col: C.gold };
    return           { label: `fra ${days}gg`,         bg: `${C.green}18`, col: C.green };
  };

  const enrichedAbb = abbonamenti
    .filter(a => a.attivo)
    .map(a => { const next = nextPayDate(a.giorno); return { ...a, next, days: daysUntil(next) }; })
    .sort((a, b) => a.days - b.days);

  const enrichedRate = rate.map(r => {
    const next = nextPayDate(r.giorno);
    const days = daysUntil(next);
    const rimaste = r.rateTot - r.ratePagate;
    const pct = Math.round((r.ratePagate / r.rateTot) * 100);
    return { ...r, next, days, rimaste, pct };
  }).sort((a, b) => a.days - b.days);

  const urgenti = [...enrichedAbb, ...enrichedRate]
    .filter(x => x.days >= 0 && x.days <= 5)
    .sort((a, b) => a.days - b.days);

  const aggiungiRata = () => {
    if (!formRata.nome || !formRata.importo) return;
    const nuova = {
      id: `r${Date.now()}`,
      nome: formRata.nome,
      importo: parseFloat(formRata.importo),
      giorno: parseInt(formRata.giorno),
      rateTot: parseInt(formRata.rateTot),
      ratePagate: parseInt(formRata.ratePagate),
      dataFine: formRata.dataFine,
    };
    const updated = [...rate, nuova];
    setRate(updated);
    salvaRate(updated);
    setFormRata({ nome: "", importo: "", giorno: "1", rateTot: "3", ratePagate: "0", dataFine: "" });
    setShowFormRata(false);
  };

  const segnaRataPagata = (id) => {
    const updated = rate.map(r => r.id === id ? { ...r, ratePagate: Math.min(r.ratePagate + 1, r.rateTot) } : r);
    setRate(updated);
    salvaRate(updated);
  };

  const rimuoviRata = (id) => {
    const updated = rate.filter(r => r.id !== id);
    setRate(updated);
    salvaRate(updated);
  };

  const rowStyle = { display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderBottom: `1px solid ${C.navy}66` };
  const badgeStyle = (bg, col) => ({ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: bg, color: col, flexShrink: 0, whiteSpace: "nowrap" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── IN SCADENZA ENTRO 5 GIORNI ── */}
      {urgenti.length > 0 && (
        <div style={{ ...card(), border: `1px solid ${C.red}44`, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px 8px", background: `${C.red}15`, borderBottom: `1px solid ${C.red}22` }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.red, letterSpacing: "0.06em", textTransform: "uppercase" }}>⚡ In scadenza entro 5 giorni</span>
          </div>
          {urgenti.map((item, i) => {
            const u = urgenza(item.days);
            return (
              <div key={item.id || item.nome + i} style={{ ...rowStyle, borderBottom: i < urgenti.length - 1 ? `1px solid ${C.navy}66` : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ivory }}>{item.nome}</div>
                  <div style={{ fontSize: 10, color: C.grey }}>{fmtDate(item.next)}{item.rimaste ? ` · rata ${item.ratePagate + 1}/${item.rateTot}` : ` · ogni ${item.giorno} del mese`}</div>
                </div>
                <span style={badgeStyle(u.bg, u.col)}>{u.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: u.col, flexShrink: 0 }}>{eur(item.importo)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ABBONAMENTI ── */}
      <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.navy}66` }}>
          <SH title="Abbonamenti mensili" />
        </div>
        {enrichedAbb.map((ab, i) => {
          const u = urgenza(ab.days);
          return (
            <div key={i} style={{ ...rowStyle, borderBottom: i < enrichedAbb.length - 1 ? `1px solid ${C.navy}44` : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ivory }}>{ab.nome}</div>
                <div style={{ fontSize: 10, color: C.grey }}>
                  ogni {ab.giorno} del mese · prossimo <strong style={{ color: u.col }}>{fmtDate(ab.next)}</strong>
                </div>
              </div>
              {/* editor giorno */}
              <input type="number" min="1" max="31" value={ab.giorno}
                onChange={e => setAbbonamenti(prev => { const n = [...prev]; const idx = abbonamenti.findIndex(x => x.nome === ab.nome); n[idx] = { ...n[idx], giorno: parseInt(e.target.value) || 1 }; return n; })}
                style={{ width: 38, background: `${C.navy}44`, border: `1px solid ${C.gold}22`, borderRadius: 6, padding: "3px 4px", color: C.gold, fontSize: 11, fontFamily: "monospace", outline: "none", textAlign: "center" }}
                title="Giorno del mese"
              />
              <span style={badgeStyle(u.bg, u.col)}>{u.label}</span>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: C.ivory }}>{eur(ab.importo)}</div>
                <div style={{ fontSize: 9, color: C.grey }}>{eur(ab.importo * 12)}/anno</div>
              </div>
              <button onClick={() => setAbbonamenti(prev => { const n = [...prev]; const idx = abbonamenti.findIndex(x => x.nome === ab.nome); n[idx] = { ...n[idx], attivo: false }; return n; })}
                style={{ background: "none", border: "none", color: C.grey, cursor: "pointer", fontSize: 12, opacity: 0.5, padding: "0 2px" }}>✕</button>
            </div>
          );
        })}
        {abbonamenti.filter(a => !a.attivo).length > 0 && (
          <div style={{ padding: "6px 14px 8px" }}>
            <span style={{ fontSize: 10, color: C.grey }}>+ {abbonamenti.filter(a => !a.attivo).length} abbonamenti disattivati</span>
          </div>
        )}
        <div style={{ padding: "11px 14px", borderTop: `1px solid ${C.gold}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: C.grey }}>Totale mensile</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: C.gold }}>{eur(totaleFissi)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.grey }}>Annuo</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.grey }}>{eur(totaleFissi * 12)}</div>
          </div>
        </div>
        <div style={{ padding: "0 14px 13px" }}>
          <button onClick={salvaAbbonamenti} disabled={loading} style={{ background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8, padding: "9px", color: C.dark, fontWeight: 800, fontSize: 12, cursor: "pointer", width: "100%", opacity: loading ? .6 : 1 }}>
            💾 SALVA SU SHEETS
          </button>
        </div>
      </div>

      {/* ── RATE IN CORSO ── */}
      <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.navy}66`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH title="Rate in corso" />
          <button onClick={() => setShowFormRata(v => !v)} style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: "4px 10px", color: C.gold, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {showFormRata ? "✕ Annulla" : "+ Aggiungi"}
          </button>
        </div>

        {showFormRata && (
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.navy}66`, background: `${C.gold}08`, display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="text" placeholder="Nome acquisto (es. Scarpe Nike)" value={formRata.nome} onChange={e => setFormRata(p => ({ ...p, nome: e.target.value }))}
              style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "8px 10px", color: C.ivory, fontSize: 12, outline: "none", width: "100%" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Importo rata €</div>
                <input type="number" placeholder="0.00" value={formRata.importo} onChange={e => setFormRata(p => ({ ...p, importo: e.target.value }))}
                  style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Giorno addebito</div>
                <input type="number" min="1" max="31" value={formRata.giorno} onChange={e => setFormRata(p => ({ ...p, giorno: e.target.value }))}
                  style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>N. rate totali</div>
                <input type="number" min="2" value={formRata.rateTot} onChange={e => setFormRata(p => ({ ...p, rateTot: e.target.value }))}
                  style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Rate già pagate</div>
                <input type="number" min="0" value={formRata.ratePagate} onChange={e => setFormRata(p => ({ ...p, ratePagate: e.target.value }))}
                  style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Data ultima rata</div>
              <input type="date" value={formRata.dataFine} onChange={e => setFormRata(p => ({ ...p, dataFine: e.target.value }))}
                style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%" }} />
            </div>
            <button onClick={aggiungiRata} style={{ background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8, padding: "9px", color: C.dark, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
              ➕ AGGIUNGI RATA
            </button>
          </div>
        )}

        {enrichedRate.length === 0 && !showFormRata && (
          <div style={{ padding: "20px 14px", textAlign: "center", color: C.grey, fontSize: 12 }}>Nessuna rata in corso · clicca + Aggiungi</div>
        )}

        {enrichedRate.map((r, i) => {
          const u = urgenza(r.days);
          const isUltima = r.rimaste === 1;
          return (
            <div key={r.id} style={{ borderBottom: i < enrichedRate.length - 1 ? `1px solid ${C.navy}44` : "none" }}>
              <div style={{ ...rowStyle, flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ivory }}>{r.nome}</span>
                    {isUltima && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 8, background: `${C.green}22`, color: C.green }}>ultima!</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.grey, marginTop: 2 }}>
                    Rata <strong style={{ color: C.ivory }}>{r.ratePagate + 1}</strong>/{r.rateTot} · addebito il <strong style={{ color: u.col }}>{r.giorno}</strong> · scade <strong style={{ color: C.grey }}>{r.dataFine ? fmtDate(r.dataFine) : "—"}</strong>
                  </div>
                </div>
                <span style={badgeStyle(u.bg, u.col)}>{u.label}</span>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: C.ivory }}>{eur(r.importo)}/rata</div>
                  <div style={{ fontSize: 9, color: C.grey }}>residuo {eur(r.importo * r.rimaste)}</div>
                </div>
              </div>
              {/* Barra progresso */}
              <div style={{ padding: "0 14px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.grey, marginBottom: 4 }}>
                  <span>{r.ratePagate} pagat{r.ratePagate === 1 ? "a" : "e"} su {r.rateTot}</span>
                  <span>{r.pct}%</span>
                </div>
                <div style={{ background: `${C.navy}88`, borderRadius: 4, height: 5 }}>
                  <div style={{ height: "100%", borderRadius: 4, background: isUltima ? C.green : C.blue, width: `${r.pct}%`, transition: "width .6s" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {r.rimaste > 0 && (
                    <button onClick={() => segnaRataPagata(r.id)} style={{ flex: 1, background: `${C.green}22`, border: `1px solid ${C.green}44`, borderRadius: 7, padding: "6px", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      ✓ Segna pagata
                    </button>
                  )}
                  <button onClick={() => rimuoviRata(r.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}33`, borderRadius: 7, padding: "6px 10px", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Rimuovi
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════
export default function App() {
  // ── auth ──
  const [token, setToken]       = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  // ── ui ──
  const [tab, setTab]           = useState("dashboard");
  const [loading, setLoading]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState("");
  const [meseSel, setMeseSel]   = useState(new Date().getMonth());
  const [catExp, setCatExp]     = useState(null);

  // ── dati ──
  const [spese, setSpese]             = useState([]);
  const [abbonamenti, setAbbonamenti] = useState([
    { nome: "Spotify",      importo: 6.99,  attivo: true },
    { nome: "iCloud",       importo: 0.99,  attivo: true },
    { nome: "Claude AI",    importo: 20.00, attivo: true },
    { nome: "Rata Telefono",importo: 25.00, attivo: true },
    { nome: "SIM",          importo: 7.99,  attivo: true },
    { nome: "WiFi",         importo: 29.00, attivo: true },
    { nome: "Bolletta",     importo: 60.00, attivo: true },
    { nome: "Amazon Prime", importo: 4.99,  attivo: true },
    { nome: "Telepass",     importo: 3.90,  attivo: true },
  ]);
  const [portafoglio, setPortafoglio] = useState({ etoro: 4000, trading212: 4000, fineco: 4000 });
  const [obiettivi, setObiettivi]     = useState({
    emergenza:    { target: 3000,  prog: 0 },
    investimenti: { target: 2000,  prog: 12000 },
    viaggi:       { target: 1000,  prog: 0 },
  });
  const [rate, setRate] = useState([
    { id: "r1", nome: "Stanza (affitto)", importo: 400, giorno: 1,  rateTot: 3, ratePagate: 2, dataFine: "2026-04-01" },
    { id: "r2", nome: "Scarpe",           importo: 50,  giorno: 10, rateTot: 3, ratePagate: 1, dataFine: "2026-05-10" },
  ]);
  const [stipendio, setStipendio] = useState(0);
  const [sim, setSim]             = useState({ anni: 10, rendimento: 7, contributo: 200 });
  const [form, setForm]           = useState({ data: new Date().toISOString().split("T")[0], descrizione: "", categoria: "costi_fissi", importo: "", tipo: "Spesa Fissa", note: "" });
  const configCacheRef = useRef([]);

  // ── NOTIFICA ──
  const notify = (msg, ms = 3000) => {
    setSyncMsg(msg);
    setTimeout(() => setSyncMsg(""), ms);
  };

  // ── OAUTH ──
  const login = () => {
    if (!window.google) { notify("❌ Google API non caricata"); return; }
    window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: async (resp) => {
        if (resp.error) { notify("❌ Login fallito: " + resp.error); return; }
        setToken(resp.access_token);
        try {
          const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${resp.access_token}` } });
          setUserInfo(await ui.json());
        } catch {}
      },
    }).requestAccessToken();
  };

  // ── CARICA DA SHEETS ──
  const loadData = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) { setLoading(true); setSyncMsg("🔄 Sincronizzazione..."); }
    try {
      // Spese
      const sr = await shGet(token, "Spese!A2:F2000");
      setSpese((sr.values || []).map((r, i) => ({
        id: `sh-${i}`, data: r[0] || "", descrizione: r[1] || "",
        categoria: r[2] || "altro", importo: parseFloat(r[3]) || 0,
        tipo: r[4] || "", note: r[5] || "", sheetRow: i + 2,
      })));

      // Abbonamenti
      const ar = await shGet(token, "Abbonamenti!A2:C50");
      if ((ar.values || []).length > 0)
        setAbbonamenti((ar.values).map(r => ({ nome: r[0] || "", importo: parseFloat(r[1]) || 0, attivo: r[2] === "TRUE" })));

      // Rate
      const rateRes = await shGet(token, "Rate!A2:G100");
      if ((rateRes.values || []).length > 0) {
        setRate((rateRes.values).map((r, i) => ({
          id: r[6] || `r${i}`, nome: r[0] || "", importo: parseFloat(r[1]) || 0,
          giorno: parseInt(r[2]) || 1, rateTot: parseInt(r[3]) || 1,
          ratePagate: parseInt(r[4]) || 0, dataFine: r[5] || "",
        })));
      }

      // Config
      const cr = await shGet(token, "Config!A1:B30");
      const cfg = cr.values || [];
      configCacheRef.current = cfg;
      cfg.forEach(([k, v]) => {
        const n = parseFloat(v) || 0;
        if (k === "stipendio")        setStipendio(n);
        if (k === "etoro")            setPortafoglio(p => ({ ...p, etoro: n }));
        if (k === "trading212")       setPortafoglio(p => ({ ...p, trading212: n }));
        if (k === "fineco")           setPortafoglio(p => ({ ...p, fineco: n }));
        if (k === "prog_emergenza")   setObiettivi(o => ({ ...o, emergenza: { ...o.emergenza, prog: n } }));
        if (k === "prog_investimenti")setObiettivi(o => ({ ...o, investimenti: { ...o.investimenti, prog: n } }));
        if (k === "prog_viaggi")      setObiettivi(o => ({ ...o, viaggi: { ...o.viaggi, prog: n } }));
      });

      if (!quiet) notify("✅ Sincronizzato");
    } catch (e) {
      if (!quiet) notify("❌ " + e.message);
    }
    if (!quiet) setLoading(false);
  }, [token]);

  // Prima load + polling automatico
  useEffect(() => {
    if (!token) return;
    loadData();
    const id = setInterval(() => loadData(true), CONFIG.POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, loadData]);

  // ── AGGIUNGI SPESA ──
  const aggiungiSpesa = async () => {
    if (!form.descrizione || !form.importo) return;
    const importoFinal = form.tipo === "Entrata"
      ? Math.abs(parseFloat(form.importo))
      : -Math.abs(parseFloat(form.importo));
    const newRow = { ...form, importo: importoFinal, id: `loc-${Date.now()}` };

    // Ottimistic update
    setSpese(prev => [...prev, newRow]);
    setForm(p => ({ ...p, descrizione: "", importo: "", note: "" }));

    try {
      await shAppend(token, "Spese!A:F", [[form.data, form.descrizione, form.categoria, importoFinal, form.tipo, form.note]]);
      notify("✅ Spesa salvata su Sheets");
      // ricarica per avere sheetRow corretto
      setTimeout(() => loadData(true), 800);
    } catch (e) {
      setSpese(prev => prev.filter(s => s.id !== newRow.id));
      notify("❌ " + e.message);
    }
  };

  // ── ELIMINA SPESA ──
  const eliminaSpesa = async (spesa) => {
    setSpese(prev => prev.filter(s => s.id !== spesa.id));
    if (spesa.sheetRow) {
      try {
        // sostituisce con riga vuota (la delete via API richiede batchUpdate più complesso)
        await shUpdate(token, `Spese!A${spesa.sheetRow}:F${spesa.sheetRow}`, [["","","","","",""]]);
        notify("🗑️ Spesa rimossa");
      } catch (e) { notify("❌ " + e.message); }
    }
  };

  // ── SALVA RATE ──
  const salvaRate = async (nuoveRate) => {
    const rateToSave = nuoveRate || rate;
    try {
      await shClear(token, "Rate!A2:G100");
      await shAppend(token, "Rate!A:G", rateToSave.map(r => [r.nome, r.importo, r.giorno, r.rateTot, r.ratePagate, r.dataFine, r.id]));
    } catch (e) { console.warn("salvaRate:", e.message); }
  };

  // ── SALVA ABBONAMENTI ──
  const salvaAbbonamenti = async () => {
    setLoading(true);
    try {
      await shClear(token, "Abbonamenti!A2:C100");
      await shAppend(token, "Abbonamenti!A:C", abbonamenti.map(a => [a.nome, a.importo, a.attivo ? "TRUE" : "FALSE"]));
      notify("✅ Abbonamenti aggiornati su Sheets");
    } catch (e) { notify("❌ " + e.message); }
    setLoading(false);
  };

  // ── SALVA SINGOLA CONFIG ──
  const saveConfig = useCallback(async (k, v) => {
    if (!token) return;
    try {
      await shUpsertConfig(token, k, v, configCacheRef.current);
      // aggiorna cache locale
      const idx = configCacheRef.current.findIndex(r => r[0] === k);
      if (idx >= 0) configCacheRef.current[idx][1] = String(v);
      else configCacheRef.current.push([k, String(v)]);
    } catch (e) { console.warn("saveConfig:", e.message); }
  }, [token]);

  // ── CALCOLI DERIVATI ──
  const anno = new Date().getFullYear();
  const speseMese  = spese.filter(s => { if (!s.data) return false; const d = new Date(s.data); return d.getMonth() === meseSel && d.getFullYear() === anno; });
  const spesePrec  = spese.filter(s => { if (!s.data) return false; const d = new Date(s.data); const pm = meseSel === 0 ? 11 : meseSel - 1; const pa = meseSel === 0 ? anno - 1 : anno; return d.getMonth() === pm && d.getFullYear() === pa; });

  const totaleFissi   = abbonamenti.filter(a => a.attivo).reduce((s, a) => s + a.importo, 0);
  const totaleEntrate = stipendio + speseMese.filter(s => s.importo > 0).reduce((s, x) => s + x.importo, 0);
  const totaleUscite  = speseMese.filter(s => s.importo < 0).reduce((s, x) => s + Math.abs(x.importo), 0) + totaleFissi;
  const saldoMese     = totaleEntrate - totaleUscite;
  const totalePortafoglio = portafoglio.etoro + portafoglio.trading212 + portafoglio.fineco;

  // aggregazione per categoria
  const aggMese = {}, aggPrec = {};
  CATEGORIE_DEF.forEach(c => { aggMese[c.id] = 0; aggPrec[c.id] = 0; });
  speseMese.filter(s => s.importo < 0).forEach(s => { if (aggMese[s.categoria] !== undefined) aggMese[s.categoria] += Math.abs(s.importo); else aggMese["altro"] += Math.abs(s.importo); });
  spesePrec.filter(s => s.importo < 0).forEach(s => { if (aggPrec[s.categoria] !== undefined) aggPrec[s.categoria] += Math.abs(s.importo); else aggPrec["altro"] += Math.abs(s.importo); });
  aggMese["costi_fissi"] = (aggMese["costi_fissi"] || 0) + totaleFissi;
  aggPrec["costi_fissi"] = (aggPrec["costi_fissi"] || 0) + totaleFissi;

  const totaleSpesoCat  = Object.values(aggMese).reduce((s, v) => s + v, 0);
  const totalePrecCat   = Object.values(aggPrec).reduce((s, v) => s + v, 0);
  const deltaGlobale    = totalePrecCat > 0 ? ((totaleSpesoCat - totalePrecCat) / totalePrecCat) * 100 : 0;

  const donutDati = CATEGORIE_DEF.filter(c => aggMese[c.id] > 0).map(c => ({ id: c.id, label: c.label, color: c.color, valore: aggMese[c.id] })).sort((a, b) => b.valore - a.valore);
  const catSorted = CATEGORIE_DEF.filter(c => aggMese[c.id] > 0).sort((a, b) => aggMese[b.id] - aggMese[a.id]);

  const oggi = new Date();
  const giorniTot = new Date(anno, meseSel + 1, 0).getDate();
  const giorniPass = meseSel === oggi.getMonth() ? oggi.getDate() : giorniTot;
  const mediaGiorn = giorniPass > 0 ? totaleSpesoCat / giorniPass : 0;
  const proiezione = mediaGiorn * giorniTot;

  // simulatore compound
  const simData = [];
  let cap = totalePortafoglio;
  for (let i = 1; i <= sim.anni; i++) {
    cap = cap * (1 + sim.rendimento / 100) + sim.contributo * 12;
    simData.push({ anno: `A${i}`, capitale: Math.round(cap), contributi: Math.round(totalePortafoglio + sim.contributo * 12 * i) });
  }

  // trend annuale
  const trendData = MESI_SHORT.map((m, i) => {
    const sp = spese.filter(s => { const d = new Date(s.data); return d.getMonth() === i && d.getFullYear() === anno; });
    const ent = stipendio + sp.filter(s => s.importo > 0).reduce((s, x) => s + x.importo, 0);
    const usc = sp.filter(s => s.importo < 0).reduce((s, x) => s + Math.abs(x.importo), 0) + totaleFissi;
    return { mese: m, entrate: ent, uscite: usc };
  });

  const TABS = [
    { id: "dashboard",  label: "🏠",    title: "Home" },
    { id: "panoramica", label: "🍩",    title: "Mese" },
    { id: "spese",      label: "📅",    title: "Spese" },
    { id: "abbonamenti",label: "💳",    title: "Fissi" },
    { id: "investimenti",label: "📈",   title: "Invest." },
  ];

  // ── LOGIN SCREEN ──
  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 30% 20%, #1B2A4A 0%, #060D15 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" }}>
        <script src="https://accounts.google.com/gsi/client" async />
        <div style={{ textAlign: "center", padding: "40px 24px", maxWidth: 360 }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>💰</div>
          <div style={{ fontSize: 10, color: C.gold, letterSpacing: "0.22em", fontWeight: 700, textTransform: "uppercase", fontFamily: "Arial,sans-serif", marginBottom: 6 }}>Budget HQ</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.ivory, marginBottom: 8, lineHeight: 1.2 }}>Il tuo patrimonio,<br />sotto controllo.</div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 36, lineHeight: 1.7, fontFamily: "Arial,sans-serif" }}>
            Ogni modifica nell'app va su <strong style={{ color: C.gold }}>Google Sheets</strong> in tempo reale. Ogni modifica su Sheets arriva nell'app ogni 30 secondi.
          </div>
          <button onClick={login} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: `linear-gradient(135deg, ${C.gold}, #9A7830)`, border: "none",
            borderRadius: 12, padding: "14px 24px", color: C.dark, fontWeight: 800,
            fontSize: 14, cursor: "pointer", width: "100%", fontFamily: "Arial,sans-serif",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill={C.dark} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill={C.dark} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill={C.dark} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill={C.dark} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Accedi con Google
          </button>
          {syncMsg && <div style={{ marginTop: 14, fontSize: 12, color: C.red, fontFamily: "Arial,sans-serif" }}>{syncMsg}</div>}
          <div style={{ marginTop: 28, padding: 14, background: `${C.navy}44`, borderRadius: 10, border: `1px solid ${C.gold}22`, fontSize: 11, color: C.grey, lineHeight: 1.7, fontFamily: "Arial,sans-serif" }}>
            ⚙️ Prima di usare: imposta <code style={{ color: C.gold }}>CLIENT_ID</code> e <code style={{ color: C.gold }}>SPREADSHEET_ID</code> nel codice · Segui la guida GUIDA_SETUP_SHEETS.md
          </div>
        </div>
      </div>
    );
  }

  // ── APP ──
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 15% 0%, #1B2A4A88 0%, transparent 55%), #060D15`, fontFamily: "Arial, sans-serif", color: C.ivory, paddingBottom: 60 }}>
      <script src="https://accounts.google.com/gsi/client" async />

      {/* ── HEADER ── */}
      <div style={{ background: `${C.dark}F2`, borderBottom: `1px solid ${C.gold}33`, padding: "13px 16px 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
          <div>
            <div style={{ fontSize: 9, color: C.gold, letterSpacing: "0.22em", fontWeight: 700, textTransform: "uppercase" }}>Budget HQ</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.ivory }}>
              {userInfo ? `Ciao, ${userInfo.given_name} 👋` : "💰 Dashboard"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            {syncMsg && <span style={{ fontSize: 10, color: syncMsg.startsWith("✅") ? C.green : syncMsg.startsWith("🔄") ? C.gold : C.red, maxWidth: 120, textAlign: "right" }}>{syncMsg}</span>}
            <button onClick={() => loadData()} disabled={loading} title="Sincronizza ora" style={{ background: `${C.navy}88`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "5px 9px", color: C.gold, cursor: "pointer", fontSize: 13 }}>{loading ? "⏳" : "🔄"}</button>
            <button onClick={() => setToken(null)} style={{ background: "none", border: `1px solid ${C.red}44`, borderRadius: 8, padding: "5px 9px", color: C.red, cursor: "pointer", fontSize: 10 }}>Esci</button>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "7px 2px", border: "none", cursor: "pointer", background: "transparent",
              borderBottom: tab === t.id ? `2px solid ${C.gold}` : "2px solid transparent",
              color: tab === t.id ? C.gold : C.grey, fontSize: tab === t.id ? 11 : 10, fontWeight: 700,
            }}>
              <div>{t.label}</div>
              <div style={{ fontSize: 9, letterSpacing: "0.04em", marginTop: 1 }}>{t.title}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 14px", maxWidth: 600, margin: "0 auto" }}>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card(), display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: C.grey, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>💼 Stipendio Mensile</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: C.gold, fontWeight: 700, fontSize: 15, alignSelf: "center" }}>€</span>
                  <input type="number" value={stipendio || ""} placeholder="0.00"
                    onChange={e => { const v = parseFloat(e.target.value) || 0; setStipendio(v); }}
                    onBlur={e => saveConfig("stipendio", parseFloat(e.target.value) || 0)}
                    style={{ ...inp({ fontSize: 20, fontWeight: 700, fontFamily: "monospace" }) }} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <KpiCard label="Entrate Mese"  value={totaleEntrate}     icon="⬆️" color={C.green} />
              <KpiCard label="Uscite Mese"   value={totaleUscite}      icon="⬇️" color={C.red} />
              <KpiCard label="Costi Fissi"   value={totaleFissi}       icon="💳" sub={`${abbonamenti.filter(a=>a.attivo).length} abb.`} />
              <KpiCard label="Portafoglio"   value={totalePortafoglio} icon="📈" color={C.blue} />
            </div>

            {totaleEntrate > 0 && (
              <div style={card()}>
                <SH title={`Breakdown ${MESI_SHORT[meseSel]}`} />
                {[
                  { label: "Costi Fissi",      val: totaleFissi,   color: C.red },
                  { label: "Spese Variabili",  val: speseMese.filter(s=>s.importo<0).reduce((s,x)=>s+Math.abs(x.importo),0), color: "#F39C12" },
                  { label: "Risparmio",        val: saldoMese,     color: C.green },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.grey }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{eur(val)}</span>
                    </div>
                    <div style={{ background: `${C.navy}88`, borderRadius: 3, height: 5 }}>
                      <div style={{ height: "100%", borderRadius: 3, background: color, width: `${Math.min(100, Math.max(0, val / totaleEntrate * 100))}%`, transition: "width .6s" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {trendData.some(d => d.entrate > 0 || d.uscite > 0) && (
              <div style={card()}>
                <SH title="Trend Annuale 2026" />
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={.3}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient>
                      <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.red} stopOpacity={.3}/><stop offset="95%" stopColor={C.red} stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={`${C.gold}11`} />
                    <XAxis dataKey="mese" tick={{ fontSize: 9, fill: C.grey }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: C.grey }} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(1)}k`} />
                    <Tooltip formatter={v => eur(v)} contentStyle={{ background: C.dark, border: `1px solid ${C.gold}44`, borderRadius: 8, color: C.ivory, fontSize: 10 }} />
                    <Area type="monotone" dataKey="entrate" stroke={C.green} fill="url(#gE)" strokeWidth={2} dot={false} name="Entrate" />
                    <Area type="monotone" dataKey="uscite"  stroke={C.red}   fill="url(#gU)" strokeWidth={2} dot={false} name="Uscite" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={card()}>
              <SH title="Obiettivi Anno" />
              {Object.entries(obiettivi).map(([key, { target, prog }]) => {
                const labels = { emergenza: "🚨 Fondo Emergenza", investimenti: "📈 Investimenti", viaggi: "✈️ Fondo Viaggi" };
                const pct = Math.min(100, target > 0 ? prog / target * 100 : 0);
                return (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{labels[key]}</span>
                      <span style={{ fontSize: 10, color: C.grey }}>{eur(prog)} / {eur(target)}</span>
                    </div>
                    <div style={{ background: `${C.navy}88`, borderRadius: 5, height: 7, marginBottom: 4 }}>
                      <div style={{ height: "100%", borderRadius: 5, background: pct >= 100 ? C.green : `linear-gradient(90deg,${C.gold},${C.softGold})`, width: `${pct}%`, transition: "width .6s" }} />
                    </div>
                    <input type="number" placeholder="Aggiorna progresso €" style={{ ...inp({ fontSize: 11, padding: "5px 8px" }) }}
                      onBlur={e => {
                        if (!e.target.value) return;
                        const v = parseFloat(e.target.value);
                        setObiettivi(o => ({ ...o, [key]: { ...o[key], prog: v } }));
                        saveConfig(`prog_${key}`, v);
                        e.target.value = "";
                      }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ PANORAMICA MESE ══ */}
        {tab === "panoramica" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header mese */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 9, color: C.gold, letterSpacing: "0.2em", fontWeight: 700, textTransform: "uppercase" }}>Panoramica</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{MESI[meseSel]}</div>
                <div style={{ fontSize: 11, color: C.grey }}>Giorno {giorniPass} di {giorniTot}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.06em" }}>vs mese prec.</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: deltaGlobale > 5 ? C.red : deltaGlobale < -5 ? C.green : C.gold }}>
                  {deltaGlobale > 0 ? "+" : ""}{deltaGlobale.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Donut */}
            <div style={{ ...card(), paddingBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.08em" }}>Entrate mese</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontFamily: "monospace" }}>{eur(totaleEntrate)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rimanente</div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: totaleEntrate - totaleSpesoCat >= 0 ? C.blue : C.red }}>
                    {eur(totaleEntrate - totaleSpesoCat)}
                  </div>
                </div>
              </div>

              {donutDati.length > 0
                ? <Donut dati={donutDati} totaleSpeso={totaleSpesoCat} entrate={totaleEntrate || 1} />
                : <div style={{ textAlign: "center", color: C.grey, padding: "30px 0", fontSize: 13 }}>Nessuna spesa registrata questo mese</div>
              }

              {/* Legenda */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 12px", marginTop: 14, justifyContent: "center" }}>
                {donutDati.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: C.grey }}>{CAT_MAP[d.id]?.emoji} {d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Proiezione */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Media giornaliera",    val: eur(mediaGiorn),  sub: `su ${giorniPass} giorni`, color: C.blue,  icon: "📅" },
                { label: "Proiezione fine mese", val: eur(proiezione),  sub: proiezione > totaleEntrate && totaleEntrate > 0 ? "⚠️ supera entrate" : "✅ nei limiti", color: proiezione > totaleEntrate && totaleEntrate > 0 ? C.red : C.green, icon: "🔮" },
              ].map(({ label, val, sub, color, icon }) => (
                <div key={label} style={{ background: `linear-gradient(135deg,${C.dark},${C.navy})`, border: `1px solid ${color}33`, borderRadius: 12, padding: "13px 12px" }}>
                  <div style={{ fontSize: 14, marginBottom: 3 }}>{icon}</div>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1.1 }}>{val}</div>
                  <div style={{ fontSize: 9, color: C.grey, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Categorie */}
            <div>
              <SH title="Per Categoria · Tocca per dettaglio" />
              {catSorted.map((cat, rank) => (
                <CatRow
                  key={cat.id} cat={cat}
                  valore={aggMese[cat.id] || 0}
                  valorePrecedente={aggPrec[cat.id] || 0}
                  totale={totaleSpesoCat} rank={rank}
                  expanded={catExp === cat.id}
                  onExpand={() => setCatExp(catExp === cat.id ? null : cat.id)}
                  spese={speseMese.filter(s => s.categoria === cat.id && s.importo < 0)}
                />
              ))}
              {catSorted.length === 0 && (
                <div style={{ textAlign: "center", color: C.grey, padding: "20px 0", fontSize: 13 }}>
                  Nessuna spesa questo mese — aggiungile nella tab Spese
                </div>
              )}
            </div>

            {/* Confronto tabella */}
            {catSorted.length > 0 && (
              <div style={{ ...card() }}>
                <SH title={`${MESI[meseSel === 0 ? 11 : meseSel - 1]} → ${MESI[meseSel]}`} />
                {[
                  { label: "Totale", curr: totaleSpesoCat, prev: totalePrecCat, bold: true },
                  ...catSorted.map(c => ({ label: `${c.emoji} ${c.label}`, curr: aggMese[c.id]||0, prev: aggPrec[c.id]||0, color: c.color })),
                ].map(({ label, curr, prev, color, bold }) => {
                  const d = prev > 0 ? (curr - prev) / prev * 100 : 0;
                  return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: `1px solid ${C.navy}88` }}>
                      <span style={{ flex: 1, fontSize: bold ? 13 : 11, fontWeight: bold ? 800 : 600, color: color || C.ivory }}>{label}</span>
                      <span style={{ fontSize: 10, color: C.grey, fontFamily: "monospace", flexShrink: 0 }}>{eur(prev)}</span>
                      <span style={{ fontSize: 9, color: C.grey }}>→</span>
                      <span style={{ fontSize: bold ? 13 : 11, fontWeight: 800, color: color || C.ivory, fontFamily: "monospace", flexShrink: 0 }}>{eur(curr)}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, minWidth: 42, textAlign: "right", color: d > 5 ? C.red : d < -5 ? C.green : C.gold }}>
                        {d > 0 ? "▲" : d < 0 ? "▼" : "—"} {Math.abs(d).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ SPESE ══ */}
        {tab === "spese" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {MESI_SHORT.map((m, i) => (
                <button key={i} onClick={() => setMeseSel(i)} style={{
                  padding: "4px 9px", borderRadius: 20, border: `1px solid ${i === meseSel ? C.gold : C.gold + "33"}`,
                  background: i === meseSel ? C.gold : "transparent", color: i === meseSel ? C.dark : C.grey,
                  fontSize: 10, fontWeight: 700, cursor: "pointer",
                }}>{m}</button>
              ))}
            </div>

            <div style={card()}>
              <SH title="Aggiungi → Sheets" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} style={inp()} />
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={{ ...inp(), background: C.navy }}>
                    {TIPI.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <input type="text" placeholder="Descrizione..." value={form.descrizione} onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))} style={inp()} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp(), background: C.navy }}>
                    {CATEGORIE_DEF.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                  <input type="number" placeholder="€ Importo" value={form.importo} onChange={e => setForm(p => ({ ...p, importo: e.target.value }))} style={{ ...inp(), fontFamily: "monospace", fontWeight: 700 }} />
                </div>
                <input type="text" placeholder="Note (opzionale)" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ ...inp({ fontSize: 11 }) }} />
                <button onClick={aggiungiSpesa} disabled={loading} style={{
                  background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8,
                  padding: "11px", color: C.dark, fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: loading ? .6 : 1,
                }}>
                  {loading ? "⏳ Salvataggio..." : "💾 SALVA SU GOOGLE SHEETS"}
                </button>
              </div>
            </div>

            <div style={card()}>
              <SH title={`${MESI[meseSel]} · ${speseMese.length} transazioni`} />
              {loading && <Spin />}
              {!loading && speseMese.length === 0 && <div style={{ textAlign: "center", color: C.grey, padding: "18px 0", fontSize: 12 }}>Nessuna transazione questo mese</div>}
              {[...speseMese].sort((a, b) => new Date(b.data) - new Date(a.data)).map((s, i) => {
                const cat = CAT_MAP[s.categoria];
                return (
                  <div key={s.id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", background: `${C.navy}55`, borderRadius: 10, border: `1px solid ${C.gold}11`, marginBottom: 6 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{cat?.emoji || "📦"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.descrizione}</div>
                      <div style={{ fontSize: 9, color: C.grey }}>{s.data} · {cat?.label || s.categoria}</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: s.importo > 0 ? C.green : C.red, flexShrink: 0 }}>
                      {s.importo > 0 ? "+" : ""}{eur(s.importo)}
                    </span>
                    <button onClick={() => eliminaSpesa(s)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13, opacity: .5, flexShrink: 0, padding: "0 2px" }}>✕</button>
                  </div>
                );
              })}
            </div>

            <div style={card()}>
              {[
                { label: "Entrate",      val: totaleEntrate,   color: C.green },
                { label: "Uscite var.",  val: -speseMese.filter(s=>s.importo<0).reduce((s,x)=>s+Math.abs(x.importo),0), color: C.red },
                { label: "Costi Fissi", val: -totaleFissi,     color: "#F39C12" },
                { label: "SALDO",        val: saldoMese,       color: saldoMese >= 0 ? C.green : C.red },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.gold}11` }}>
                  <span style={{ fontSize: 12, color: C.grey, fontWeight: label === "SALDO" ? 800 : 400 }}>{label}</span>
                  <span style={{ fontSize: label === "SALDO" ? 17 : 13, fontWeight: 800, color, fontFamily: "monospace" }}>{eur(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ FISSI & SCADENZE ══ */}
        {tab === "abbonamenti" && <TabFissi
          abbonamenti={abbonamenti} setAbbonamenti={setAbbonamenti}
          rate={rate} setRate={setRate}
          totaleFissi={totaleFissi} loading={loading}
          salvaAbbonamenti={salvaAbbonamenti} salvaRate={salvaRate}
          eur={eur}
        />}

        {/* ══ INVESTIMENTI ══ */}
        {tab === "investimenti" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={card()}>
              <SH title="Portafoglio Attuale" />
              {[["etoro","eToro"],["trading212","Trading 212"],["fineco","Fineco"]].map(([key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{label}</span>
                  <span style={{ color: C.gold, fontWeight: 700 }}>€</span>
                  <input type="number" value={portafoglio[key]}
                    onChange={e => setPortafoglio(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                    onBlur={e => saveConfig(key, parseFloat(e.target.value) || 0)}
                    style={{ width: 100, background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontFamily: "monospace", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "right" }} />
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: `${C.dark}88`, borderRadius: 10, border: `1px solid ${C.gold}44`, marginTop: 6 }}>
                <span style={{ color: C.grey, fontWeight: 700, fontSize: 12 }}>TOTALE</span>
                <span style={{ color: C.gold, fontSize: 20, fontWeight: 900, fontFamily: "monospace" }}>{eur(totalePortafoglio)}</span>
              </div>
            </div>

            <div style={card()}>
              <SH title="Simulatore Interesse Composto" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 13 }}>
                {[["anni","Anni"],["rendimento","Rend. %"],["contributo","€/mese"]].map(([key, label]) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: C.grey, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                    <input type="number" value={sim[key]} min={1}
                      onChange={e => setSim(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", background: `${C.navy}66`, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: "7px", color: C.gold, fontSize: 14, fontWeight: 800, fontFamily: "monospace", outline: "none", textAlign: "center" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 13px", background: `linear-gradient(135deg,${C.dark},${C.navy})`, borderRadius: 12, border: `1px solid ${C.gold}44`, marginBottom: 13 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.grey }}>Capitale Anno {sim.anni}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.gold, fontFamily: "monospace" }}>{eur(simData[sim.anni - 1]?.capitale)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: C.grey }}>Crescita</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.green, fontFamily: "monospace" }}>+{eur((simData[sim.anni - 1]?.capitale || 0) - totalePortafoglio)}</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={175}>
                <AreaChart data={simData}>
                  <defs>
                    <linearGradient id="gCap" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.gold} stopOpacity={.3}/><stop offset="95%" stopColor={C.gold} stopOpacity={0}/></linearGradient>
                    <linearGradient id="gCon" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={.3}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={`${C.gold}11`} />
                  <XAxis dataKey="anno" tick={{ fontSize: 8, fill: C.grey }} tickLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: C.grey }} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => eur(v)} contentStyle={{ background: C.dark, border: `1px solid ${C.gold}44`, borderRadius: 8, color: C.ivory, fontSize: 10 }} />
                  <Area type="monotone" dataKey="contributi" stroke={C.blue} fill="url(#gCon)" strokeWidth={1.5} dot={false} name="Solo contributi" />
                  <Area type="monotone" dataKey="capitale"   stroke={C.gold} fill="url(#gCap)" strokeWidth={2}   dot={false} name="Capitale totale" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "linear-gradient(135deg,#2C1B0A,#3D2510)", border: `1px solid ${C.gold}66`, borderRadius: 12, padding: "13px 15px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.gold, marginBottom: 5 }}>⚠️ CRUD.MI — WTI Oil ETC</div>
              <div style={{ fontSize: 12, color: "#D4AC6E", lineHeight: 1.6 }}>
                Scadenza strategica <strong style={{ color: C.gold }}>6 Aprile 2026</strong>.<br />
                Monitora situazione geopolitica Iran/Hormuz prima di agire.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}