import { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ══════════════════════════════════════════════════════════════════
// 🔧 CONFIGURAZIONE
// ══════════════════════════════════════════════════════════════════
const CONFIG = {
  CLIENT_ID: "991577222508-lffdo7ns7a7iem93bg8p1ukh42tc4k05.apps.googleusercontent.com",
  SPREADSHEET_ID: "1-n9jW6Zo01J_7RrulTzcmxMFbo9vToI2ON1iX3MXUXE",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets",
  POLL_INTERVAL_MS: 30000,
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
const CAT_IDS = CATEGORIE_DEF.map(c => c.id); // eslint-disable-line no-unused-vars
const CAT_MAP = Object.fromEntries(CATEGORIE_DEF.map(c => [c.id, c]));

const MESI       = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const MESI_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
const TIPI       = ["Spesa Fissa","Spesa Variabile","Spesa Extra","Entrata"]; // eslint-disable-line no-unused-vars

const EMOJI_FONDI  = ["🎯","✈️","🏠","🚗","📱","💍","🎓","🏋️","🎸","🐕","💻","🛍️","🏖️","🎮","🍕","💎","🌍","📚","🎨","⚽"];
const COLORI_FONDI = ["#4A9EE8","#2ECC71","#C9A84C","#E8534A","#9B59B6","#00BFA5","#F0A500","#FF6B6B","#3DB87A","#E91E63"];

// ══════════════════════════════════════════════════════════════════
// SHEETS API
// ══════════════════════════════════════════════════════════════════
const sid = () => CONFIG.SPREADSHEET_ID;

const shGet = async (token, range, on401) => {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid()}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (r.status === 401) {
    localStorage.removeItem("bghq_token");
    if (on401) on401();
    throw new Error("TOKEN_EXPIRED");
  }
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
// DONUT CHART
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
// CATEGORIA ROW
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
    if (days < 0)   return { label: "Pagato",        bg: `${C.grey}22`,  col: C.grey };
    if (days === 0) return { label: "Oggi ⚡",         bg: `${C.red}25`,   col: C.red };
    if (days === 1) return { label: "Domani",         bg: `${C.red}18`,   col: C.red };
    if (days <= 3)  return { label: `fra ${days}gg`,  bg: "#F0A50022",    col: "#F0A500" };
    if (days <= 7)  return { label: `fra ${days}gg`,  bg: `${C.gold}18`,  col: C.gold };
    return                 { label: `fra ${days}gg`,  bg: `${C.green}18`, col: C.green };
  };

  const enrichedAbb = abbonamenti.filter(a => a.attivo).map(a => { const next = nextPayDate(a.giorno); return { ...a, next, days: daysUntil(next) }; }).sort((a, b) => a.days - b.days);
  const enrichedRate = rate.map(r => { const next = nextPayDate(r.giorno); const days = daysUntil(next); const rimaste = r.rateTot - r.ratePagate; const pct = Math.round((r.ratePagate / r.rateTot) * 100); return { ...r, next, days, rimaste, pct }; }).sort((a, b) => a.days - b.days);
  const urgenti = [...enrichedAbb, ...enrichedRate].filter(x => x.days >= 0 && x.days <= 5).sort((a, b) => a.days - b.days);

  const aggiungiRata = () => {
    if (!formRata.nome || !formRata.importo) return;
    const nuova = { id: `r${Date.now()}`, nome: formRata.nome, importo: parseFloat(formRata.importo), giorno: parseInt(formRata.giorno), rateTot: parseInt(formRata.rateTot), ratePagate: parseInt(formRata.ratePagate), dataFine: formRata.dataFine };
    const updated = [...rate, nuova];
    setRate(updated);
    salvaRate(updated);
    setFormRata({ nome: "", importo: "", giorno: "1", rateTot: "3", ratePagate: "0", dataFine: "" });
    setShowFormRata(false);
  };

  const segnaRataPagata = (id) => { const updated = rate.map(r => r.id === id ? { ...r, ratePagate: Math.min(r.ratePagate + 1, r.rateTot) } : r); setRate(updated); salvaRate(updated); };
  const rimuoviRata = (id) => { const updated = rate.filter(r => r.id !== id); setRate(updated); salvaRate(updated); };

  const rowStyle = { display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderBottom: `1px solid ${C.navy}66` };
  const badgeStyle = (bg, col) => ({ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: bg, color: col, flexShrink: 0, whiteSpace: "nowrap" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

      <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.navy}66` }}><SH title="Abbonamenti mensili" /></div>
        {enrichedAbb.map((ab, i) => {
          const u = urgenza(ab.days);
          return (
            <div key={i} style={{ ...rowStyle, borderBottom: i < enrichedAbb.length - 1 ? `1px solid ${C.navy}44` : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ivory }}>{ab.nome}</div>
                <div style={{ fontSize: 10, color: C.grey }}>ogni <strong style={{ color: C.ivory }}>{ab.giorno}</strong> del mese · prossimo <strong style={{ color: u.col }}>{fmtDate(ab.next)}</strong></div>
              </div>
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

      <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.navy}66`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH title="Rate in corso" />
          <button onClick={() => setShowFormRata(v => !v)} style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: "4px 10px", color: C.gold, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {showFormRata ? "✕ Annulla" : "+ Aggiungi"}
          </button>
        </div>
        {showFormRata && (
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.navy}66`, background: `${C.gold}08`, display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="text" placeholder="Nome acquisto (es. Scarpe Nike)" value={formRata.nome} onChange={e => setFormRata(p => ({ ...p, nome: e.target.value }))} style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "8px 10px", color: C.ivory, fontSize: 12, outline: "none", width: "100%" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Importo rata €</div>
                <input type="number" placeholder="0.00" inputMode="decimal" step="0.01" min="0" value={formRata.importo} onChange={e => setFormRata(p => ({ ...p, importo: e.target.value }))} style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Giorno addebito</div>
                <input type="number" min="1" max="31" value={formRata.giorno} onChange={e => setFormRata(p => ({ ...p, giorno: e.target.value }))} style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>N. rate totali</div>
                <input type="number" min="2" value={formRata.rateTot} onChange={e => setFormRata(p => ({ ...p, rateTot: e.target.value }))} style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Rate già pagate</div>
                <input type="number" min="0" value={formRata.ratePagate} onChange={e => setFormRata(p => ({ ...p, ratePagate: e.target.value }))} style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%", fontFamily: "monospace" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>Data ultima rata</div>
              <input type="date" value={formRata.dataFine} onChange={e => setFormRata(p => ({ ...p, dataFine: e.target.value }))} style={{ background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontSize: 12, outline: "none", width: "100%" }} />
            </div>
            <button onClick={aggiungiRata} style={{ background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8, padding: "9px", color: C.dark, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
              ➕ AGGIUNGI RATA
            </button>
          </div>
        )}
        {enrichedRate.length === 0 && !showFormRata && <div style={{ padding: "20px 14px", textAlign: "center", color: C.grey, fontSize: 12 }}>Nessuna rata in corso · clicca + Aggiungi</div>}
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
                  <div style={{ fontSize: 10, color: C.grey, marginTop: 2 }}>Rata <strong style={{ color: C.ivory }}>{r.ratePagate + 1}</strong>/{r.rateTot} · addebito il <strong style={{ color: u.col }}>{r.giorno}</strong> · scade <strong style={{ color: C.grey }}>{r.dataFine ? fmtDate(r.dataFine) : "—"}</strong></div>
                </div>
                <span style={badgeStyle(u.bg, u.col)}>{u.label}</span>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: C.ivory }}>{eur(r.importo)}/rata</div>
                  <div style={{ fontSize: 9, color: C.grey }}>residuo {eur(r.importo * r.rimaste)}</div>
                </div>
              </div>
              <div style={{ padding: "0 14px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.grey, marginBottom: 4 }}>
                  <span>{r.ratePagate} pagat{r.ratePagate === 1 ? "a" : "e"} su {r.rateTot}</span>
                  <span>{r.pct}%</span>
                </div>
                <div style={{ background: `${C.navy}88`, borderRadius: 4, height: 5 }}>
                  <div style={{ height: "100%", borderRadius: 4, background: isUltima ? C.green : C.blue, width: `${r.pct}%`, transition: "width .6s" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {r.rimaste > 0 && <button onClick={() => segnaRataPagata(r.id)} style={{ flex: 1, background: `${C.green}22`, border: `1px solid ${C.green}44`, borderRadius: 7, padding: "6px", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ Segna pagata</button>}
                  <button onClick={() => rimuoviRata(r.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}33`, borderRadius: 7, padding: "6px 10px", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Rimuovi</button>
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
// TAB RISPARMI
// ══════════════════════════════════════════════════════════════════
function TabRisparmi({ token, notify }) {
  const [fondi, setFondi] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNuovo, setShowNuovo] = useState(false);
  const [fondoSelezionato, setFondoSelezionato] = useState(null);
  const [showVersamento, setShowVersamento] = useState(false);
  const [formNuovo, setFormNuovo] = useState({ nome: "", target: "", emoji: "🎯", colore: COLORI_FONDI[0] });
  const [formVersamento, setFormVersamento] = useState({ importo: "", nota: "", data: new Date().toISOString().split("T")[0] });

  const caricaFondi = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await shGet(token, "Risparmi!A2:F200");
      const rows = res.values || [];
      const parsedFondi = [];
      const fondiMap = {};
      rows.forEach(r => {
        if (r[0] === "FONDO") {
          const fondo = { id: r[1], nome: r[2], emoji: r[3] || "🎯", target: parseFloat(r[4]) || 0, colore: r[5] || COLORI_FONDI[0], versamenti: [] };
          fondiMap[fondo.id] = fondo;
          parsedFondi.push(fondo);
        } else if (r[0] === "VERSAMENTO" && fondiMap[r[1]]) {
          fondiMap[r[1]].versamenti.push({ data: r[2], importo: parseFloat(r[3]) || 0, nota: r[4] || "" });
        }
      });
      setFondi(parsedFondi);
    } catch (e) { notify("❌ " + e.message); }
    setLoading(false);
  }, [token, notify]);

  useEffect(() => { caricaFondi(); }, [caricaFondi]);

  const salvaTutti = async (nuoviFondi) => {
    await shClear(token, "Risparmi!A2:F500");
    const rows = [];
    nuoviFondi.forEach(f => {
      rows.push(["FONDO", f.id, f.nome, f.emoji, f.target, f.colore]);
      f.versamenti.forEach(v => rows.push(["VERSAMENTO", f.id, v.data, v.importo, v.nota]));
    });
    if (rows.length > 0) await shAppend(token, "Risparmi!A:F", rows);
  };

  const aggiungiFondo = async () => {
    if (!formNuovo.nome || !formNuovo.target) return;
    const nuovo = { id: `f${Date.now()}`, nome: formNuovo.nome, target: parseFloat(formNuovo.target), emoji: formNuovo.emoji, colore: formNuovo.colore, versamenti: [] };
    const nuoviFondi = [...fondi, nuovo];
    setFondi(nuoviFondi);
    setShowNuovo(false);
    setFormNuovo({ nome: "", target: "", emoji: "🎯", colore: COLORI_FONDI[0] });
    try { await salvaTutti(nuoviFondi); notify("✅ Fondo creato"); } catch (e) { notify("❌ " + e.message); }
  };

  const aggiungiVersamento = async () => {
    if (!formVersamento.importo || !fondoSelezionato) return;
    const nuovoV = { data: formVersamento.data, importo: parseFloat(formVersamento.importo), nota: formVersamento.nota };
    const nuoviFondi = fondi.map(f => f.id === fondoSelezionato ? { ...f, versamenti: [...f.versamenti, nuovoV] } : f);
    setFondi(nuoviFondi);
    setShowVersamento(false);
    setFormVersamento({ importo: "", nota: "", data: new Date().toISOString().split("T")[0] });
    try { await salvaTutti(nuoviFondi); notify("✅ Versamento registrato"); } catch (e) { notify("❌ " + e.message); }
  };

  const eliminaFondo = async (id) => {
    const nuoviFondi = fondi.filter(f => f.id !== id);
    setFondi(nuoviFondi);
    if (fondoSelezionato === id) setFondoSelezionato(null);
    try { await salvaTutti(nuoviFondi); notify("🗑️ Fondo rimosso"); } catch (e) { notify("❌ " + e.message); }
  };

  const eliminaVersamento = async (fondoId, vIdx) => {
    const nuoviFondi = fondi.map(f => f.id === fondoId ? { ...f, versamenti: f.versamenti.filter((_, i) => i !== vIdx) } : f);
    setFondi(nuoviFondi);
    try { await salvaTutti(nuoviFondi); notify("🗑️ Versamento rimosso"); } catch (e) { notify("❌ " + e.message); }
  };

  const totaleSavedAll = fondi.reduce((s, f) => s + f.versamenti.reduce((vs, v) => vs + v.importo, 0), 0);
  const totalTargetAll = fondi.reduce((s, f) => s + f.target, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...card(), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Totale accantonato</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.green, fontFamily: "monospace" }}>{eur(totaleSavedAll)}</div>
          <div style={{ fontSize: 10, color: C.grey }}>su {eur(totalTargetAll)} totale obiettivi</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: totalTargetAll > 0 ? (totaleSavedAll / totalTargetAll > 0.8 ? C.green : C.gold) : C.grey, fontFamily: "monospace" }}>
            {totalTargetAll > 0 ? `${Math.round(totaleSavedAll / totalTargetAll * 100)}%` : "—"}
          </div>
          <div style={{ fontSize: 9, color: C.grey }}>{fondi.length} fond{fondi.length === 1 ? "o" : "i"} attivi</div>
        </div>
      </div>

      <button onClick={() => setShowNuovo(v => !v)} style={{ background: showNuovo ? `${C.red}22` : `linear-gradient(135deg,${C.gold},#9A7830)`, border: showNuovo ? `1px solid ${C.red}44` : "none", borderRadius: 10, padding: "12px", color: showNuovo ? C.red : C.dark, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
        {showNuovo ? "✕ Annulla" : "+ Nuovo fondo risparmio"}
      </button>

      {showNuovo && (
        <div style={{ ...card(), border: `1px solid ${C.gold}44` }}>
          <SH title="Nuovo fondo" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="text" placeholder="Nome del fondo (es. AirPods, Vacanza Grecia...)" value={formNuovo.nome} onChange={e => setFormNuovo(p => ({ ...p, nome: e.target.value }))} style={inp()} />
            <input type="number" placeholder="Obiettivo €" inputMode="decimal" value={formNuovo.target} onChange={e => setFormNuovo(p => ({ ...p, target: e.target.value }))} style={{ ...inp(), fontFamily: "monospace" }} />
            <div>
              <div style={{ fontSize: 9, color: C.grey, marginBottom: 6, textTransform: "uppercase" }}>Icona</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {EMOJI_FONDI.map(e => (
                  <button key={e} onClick={() => setFormNuovo(p => ({ ...p, emoji: e }))} style={{ fontSize: 18, background: formNuovo.emoji === e ? `${C.gold}33` : "transparent", border: `1px solid ${formNuovo.emoji === e ? C.gold : C.gold + "22"}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.grey, marginBottom: 6, textTransform: "uppercase" }}>Colore</div>
              <div style={{ display: "flex", gap: 8 }}>
                {COLORI_FONDI.map(col => (
                  <button key={col} onClick={() => setFormNuovo(p => ({ ...p, colore: col }))} style={{ width: 28, height: 28, borderRadius: "50%", background: col, border: formNuovo.colore === col ? `3px solid ${C.ivory}` : "3px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>
            <button onClick={aggiungiFondo} style={{ background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8, padding: "11px", color: C.dark, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              💾 CREA FONDO
            </button>
          </div>
        </div>
      )}

      {loading && <Spin />}
      {!loading && fondi.length === 0 && !showNuovo && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.grey }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🏦</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nessun fondo ancora</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Crea il tuo primo fondo risparmio</div>
        </div>
      )}

      {fondi.map(fondo => {
        const totaleVersato = fondo.versamenti.reduce((s, v) => s + v.importo, 0);
        const pct = fondo.target > 0 ? Math.min(100, totaleVersato / fondo.target * 100) : 0;
        const mancante = Math.max(0, fondo.target - totaleVersato);
        const isExpanded = fondoSelezionato === fondo.id;
        const colore = fondo.colore || C.blue;

        return (
          <div key={fondo.id} style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${isExpanded ? colore + "66" : C.gold + "18"}`, transition: "border-color .2s" }}>
            <div onClick={() => setFondoSelezionato(isExpanded ? null : fondo.id)} style={{ background: `linear-gradient(135deg,${C.dark},${C.navy})`, padding: "14px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${colore}22`, border: `1px solid ${colore}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {fondo.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.ivory }}>{fondo.nome}</div>
                  <div style={{ fontSize: 10, color: C.grey }}>{fondo.versamenti.length} versament{fondo.versamenti.length === 1 ? "o" : "i"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: colore, fontFamily: "monospace" }}>{eur(totaleVersato)}</div>
                  <div style={{ fontSize: 10, color: C.grey }}>/ {eur(fondo.target)}</div>
                </div>
              </div>
              <div style={{ background: `${C.navy}88`, borderRadius: 4, height: 8, marginBottom: 6 }}>
                <div style={{ height: "100%", borderRadius: 4, background: pct >= 100 ? C.green : colore, width: `${pct}%`, transition: "width .8s cubic-bezier(.4,0,.2,1)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: pct >= 100 ? C.green : colore }}>{pct.toFixed(0)}% raggiunto</span>
                {mancante > 0 && <span style={{ fontSize: 10, color: C.grey }}>mancano {eur(mancante)}</span>}
                {pct >= 100 && <span style={{ fontSize: 11, fontWeight: 800, color: C.green }}>🎉 Obiettivo raggiunto!</span>}
              </div>
            </div>

            {isExpanded && (
              <div style={{ background: `${colore}08`, borderTop: `1px solid ${colore}22` }}>
                <div style={{ display: "flex", gap: 8, padding: "12px 14px 0" }}>
                  <button onClick={() => setShowVersamento(true)} style={{ flex: 1, background: `${colore}22`, border: `1px solid ${colore}44`, borderRadius: 8, padding: "9px", color: colore, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                    + Aggiungi versamento
                  </button>
                  <button onClick={() => eliminaFondo(fondo.id)} style={{ background: `${C.red}15`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "9px 12px", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🗑️</button>
                </div>

                {showVersamento && fondoSelezionato === fondo.id && (
                  <div style={{ margin: "12px 14px", padding: "12px", background: `${C.dark}88`, borderRadius: 10, border: `1px solid ${colore}33` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colore, marginBottom: 8 }}>Nuovo versamento</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input type="number" placeholder="Importo €" inputMode="decimal" value={formVersamento.importo} onChange={e => setFormVersamento(p => ({ ...p, importo: e.target.value }))} style={{ ...inp({ fontFamily: "monospace" }) }} />
                      <input type="date" value={formVersamento.data} onChange={e => setFormVersamento(p => ({ ...p, data: e.target.value }))} style={inp()} />
                      <input type="text" placeholder="Nota (opzionale)" value={formVersamento.nota} onChange={e => setFormVersamento(p => ({ ...p, nota: e.target.value }))} style={{ ...inp({ fontSize: 12 }) }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={aggiungiVersamento} style={{ flex: 1, background: `linear-gradient(135deg,${colore},${colore}88)`, border: "none", borderRadius: 8, padding: "9px", color: C.dark, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>💾 SALVA</button>
                        <button onClick={() => setShowVersamento(false)} style={{ background: "none", border: `1px solid ${C.grey}44`, borderRadius: 8, padding: "9px 12px", color: C.grey, fontSize: 12, cursor: "pointer" }}>Annulla</button>
                      </div>
                    </div>
                  </div>
                )}

                {fondo.versamenti.length > 0 ? (
                  <div style={{ padding: "10px 14px 14px" }}>
                    <div style={{ fontSize: 10, color: C.grey, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Storico versamenti</div>
                    {[...fondo.versamenti].reverse().map((v, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: `${C.navy}55`, borderRadius: 8, marginBottom: 5 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.ivory }}>{v.nota || "Versamento"}</div>
                          <div style={{ fontSize: 10, color: C.grey }}>{v.data}</div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: colore, fontFamily: "monospace" }}>+{eur(v.importo)}</span>
                        <button onClick={() => eliminaVersamento(fondo.id, fondo.versamenti.length - 1 - i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12, opacity: 0.5 }}>✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "16px 14px", textAlign: "center", color: C.grey, fontSize: 12 }}>Ancora nessun versamento</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB REPORTS
// ══════════════════════════════════════════════════════════════════
function TabReports({ token, spese, abbonamenti, stipendio, notify }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportAperto, setReportAperto] = useState(null);
  const [generando, setGenerando] = useState(false);
  const autoGenRef = useRef(false);

  const caricaReports = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await shGet(token, "Reports!A2:E100");
      const rows = res.values || [];
      const parsed = rows.filter(r => r[0] && r[1]).map(r => ({
        id: r[0], mese: parseInt(r[1]), anno: parseInt(r[2]),
        generato_il: r[3], dati: (() => { try { return JSON.parse(r[4] || "{}"); } catch { return {}; } })()
      }));
      setReports(parsed.sort((a, b) => b.anno - a.anno || b.mese - a.mese));
    } catch (e) { notify("❌ " + e.message); }
    setLoading(false);
  }, [token, notify]);

  useEffect(() => { caricaReports(); }, [caricaReports]);

  const generaDati = useCallback((mese, anno) => {
    const totaleFissi = abbonamenti.filter(a => a.attivo).reduce((s, a) => s + a.importo, 0);
    const speseMese = spese.filter(s => { const d = new Date(s.data); return d.getMonth() === mese && d.getFullYear() === anno; });
    const mesePrec = mese === 0 ? 11 : mese - 1;
    const annoPrec = mese === 0 ? anno - 1 : anno;
    const spesePrec = spese.filter(s => { const d = new Date(s.data); return d.getMonth() === mesePrec && d.getFullYear() === annoPrec; });

    const entrate = stipendio + speseMese.filter(s => s.importo > 0).reduce((s, x) => s + x.importo, 0);
    const usciteVar = speseMese.filter(s => s.importo < 0).reduce((s, x) => s + Math.abs(x.importo), 0);
    const totaleUscite = usciteVar + totaleFissi;
    const saldo = entrate - totaleUscite;
    const tassoRisparmio = entrate > 0 ? saldo / entrate * 100 : 0;

    const aggMese = {}, aggPrec = {};
    CATEGORIE_DEF.forEach(c => { aggMese[c.id] = 0; aggPrec[c.id] = 0; });
    speseMese.filter(s => s.importo < 0).forEach(s => { if (aggMese[s.categoria] !== undefined) aggMese[s.categoria] += Math.abs(s.importo); else aggMese["altro"] += Math.abs(s.importo); });
    spesePrec.filter(s => s.importo < 0).forEach(s => { if (aggPrec[s.categoria] !== undefined) aggPrec[s.categoria] += Math.abs(s.importo); else aggPrec["altro"] += Math.abs(s.importo); });
    aggMese["costi_fissi"] = (aggMese["costi_fissi"] || 0) + totaleFissi;
    aggPrec["costi_fissi"] = (aggPrec["costi_fissi"] || 0) + totaleFissi;

    const giorniMese = new Date(anno, mese + 1, 0).getDate();
    const mediaGiorn = giorniMese > 0 ? totaleUscite / giorniMese : 0;
    const top3 = [...speseMese].filter(s => s.importo < 0).sort((a, b) => Math.abs(a.importo) - Math.abs(b.importo)).slice(-3).reverse();
    const totPrec = Object.values(aggPrec).reduce((s, v) => s + v, 0);
    const totCurr = Object.values(aggMese).reduce((s, v) => s + v, 0);
    const deltaGlobale = totPrec > 0 ? (totCurr - totPrec) / totPrec * 100 : 0;

    let catFuoriControllo = null, maxDelta = 0;
    CATEGORIE_DEF.forEach(c => {
      if (aggPrec[c.id] > 0) {
        const d = (aggMese[c.id] - aggPrec[c.id]) / aggPrec[c.id] * 100;
        if (d > maxDelta && aggMese[c.id] > 20) { maxDelta = d; catFuoriControllo = { ...c, delta: d, valore: aggMese[c.id] }; }
      }
    });

    return { mese, anno, entrate, usciteVar, totaleFissi, totaleUscite, saldo, tassoRisparmio, aggMese, aggPrec, mediaGiorn, top3, deltaGlobale, catFuoriControllo, totaleTransazioni: speseMese.length };
  }, [spese, abbonamenti, stipendio]);

  const generaReport = useCallback(async (mese, anno) => {
    setGenerando(true);
    try {
      const dati = generaDati(mese, anno);
      const id = `rep-${mese}-${anno}`;
      const generato_il = new Date().toISOString();
      const nuovoReport = { id, mese, anno, generato_il, dati };
      const nuoviReports = [nuovoReport, ...reports.filter(r => !(r.mese === mese && r.anno === anno))].sort((a, b) => b.anno - a.anno || b.mese - a.mese);
      setReports(nuoviReports);
      setReportAperto(nuovoReport);
      await shAppend(token, "Reports!A:E", [[id, mese, anno, generato_il, JSON.stringify(dati)]]);
      notify("✅ Report generato e salvato");
    } catch (e) { notify("❌ " + e.message); }
    setGenerando(false);
  }, [generaDati, reports, token, notify]);

  // Auto-genera il report del mese precedente se non esiste
  useEffect(() => {
    if (!token || spese.length === 0 || loading || autoGenRef.current) return;
    const oggi = new Date();
    const mp = oggi.getMonth() === 0 ? 11 : oggi.getMonth() - 1;
    const ap = oggi.getMonth() === 0 ? oggi.getFullYear() - 1 : oggi.getFullYear();
    const esiste = reports.some(r => r.mese === mp && r.anno === ap);
    const hasSpese = spese.some(s => { const d = new Date(s.data); return d.getMonth() === mp && d.getFullYear() === ap; });
    if (!esiste && hasSpese) { autoGenRef.current = true; generaReport(mp, ap); }
  }, [token, spese, reports, loading, generaReport]);

  const scaricaHTML = (report) => {
    const { dati } = report;
    const totaleSpeso = Object.values(dati.aggMese || {}).reduce((s, v) => s + v, 0);

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Report ${MESI[dati.mese]} ${dati.anno} — Budget HQ</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Georgia,serif;background:#0D1B2A;color:#F5F0E8;padding:32px;min-height:100vh}
  .header{text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #C9A84C44}
  .badge{font-size:10px;font-weight:800;letter-spacing:0.2em;color:#C9A84C;text-transform:uppercase;margin-bottom:8px;font-family:Arial,sans-serif}
  .title{font-size:32px;font-weight:900;margin-bottom:4px}
  .subtitle{font-size:13px;color:#8892A0;font-family:Arial,sans-serif}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
  .grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:18px}
  .kpi{background:linear-gradient(135deg,#1B2A4A,#0D1B2A);border:1px solid #C9A84C33;border-radius:12px;padding:14px}
  .kpi-label{font-size:9px;font-weight:700;color:#8892A0;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;font-family:Arial,sans-serif}
  .kpi-value{font-size:20px;font-weight:900;font-family:monospace}
  .section{background:linear-gradient(160deg,#1B2A4AEE,#0D1B2AEE);border:1px solid #C9A84C22;border-radius:14px;padding:18px;margin-bottom:18px}
  .sh{display:flex;align-items:center;gap:10px;margin-bottom:14px}
  .sh-line{height:2px;width:18px;background:#C9A84C;border-radius:2px}
  .sh-title{font-size:11px;font-weight:800;color:#C9A84C;letter-spacing:0.1em;text-transform:uppercase;font-family:Arial,sans-serif}
  .sh-fill{height:1px;flex:1;background:#C9A84C22}
  .cat-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #1B2A4A88}
  .cat-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
  .bar-bg{background:#0D1B2A;border-radius:3px;height:5px;flex:1}
  .bar-fill{height:100%;border-radius:3px}
  .top3{display:flex;justify-content:space-between;padding:8px 12px;background:#1B2A4A55;border-radius:8px;margin-bottom:6px}
  .delta{font-size:11px;font-weight:800;padding:3px 8px;border-radius:8px}
  .alert{background:linear-gradient(135deg,#E74C3C18,#0D1B2A);border:1px solid #E74C3C44;border-radius:12px;padding:14px;margin-bottom:18px}
  .footer{text-align:center;padding-top:20px;border-top:1px solid #C9A84C22;font-size:10px;color:#8892A0;font-family:Arial,sans-serif}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="header">
  <div class="badge">Budget HQ · Report Mensile</div>
  <div class="title">${MESI[dati.mese]} ${dati.anno}</div>
  <div class="subtitle">Generato il ${new Date(report.generato_il).toLocaleDateString("it-IT")} · ${dati.totaleTransazioni} transazioni</div>
</div>
<div class="grid4">
  <div class="kpi"><div class="kpi-label">Entrate</div><div class="kpi-value" style="color:#2ECC71">${eur(dati.entrate)}</div></div>
  <div class="kpi"><div class="kpi-label">Uscite totali</div><div class="kpi-value" style="color:#E74C3C">${eur(dati.totaleUscite)}</div></div>
  <div class="kpi"><div class="kpi-label">Saldo netto</div><div class="kpi-value" style="color:${dati.saldo >= 0 ? "#2ECC71" : "#E74C3C"}">${eur(dati.saldo)}</div></div>
  <div class="kpi"><div class="kpi-label">Tasso risparmio</div><div class="kpi-value" style="color:${dati.tassoRisparmio >= 20 ? "#2ECC71" : dati.tassoRisparmio >= 10 ? "#C9A84C" : "#E74C3C"}">${dati.tassoRisparmio.toFixed(1)}%</div></div>
</div>
<div class="grid2">
  <div class="kpi"><div class="kpi-label">Media giornaliera</div><div class="kpi-value" style="color:#3498DB;font-size:18px">${eur(dati.mediaGiorn)}/giorno</div></div>
  <div class="kpi"><div class="kpi-label">Var. vs mese prec.</div><div class="kpi-value" style="color:${dati.deltaGlobale > 5 ? "#E74C3C" : dati.deltaGlobale < -5 ? "#2ECC71" : "#C9A84C"};font-size:18px">${dati.deltaGlobale > 0 ? "+" : ""}${dati.deltaGlobale.toFixed(1)}%</div></div>
</div>
${dati.catFuoriControllo ? `<div class="alert"><div style="font-size:12px;font-weight:800;color:#E74C3C;margin-bottom:4px">⚠️ Categoria fuori controllo</div><div style="font-size:13px">${dati.catFuoriControllo.emoji} <strong>${dati.catFuoriControllo.label}</strong> — +${dati.catFuoriControllo.delta.toFixed(0)}% vs mese prec. (${eur(dati.catFuoriControllo.valore)})</div></div>` : ""}
<div class="section">
  <div class="sh"><div class="sh-line"></div><div class="sh-title">Spese per categoria</div><div class="sh-fill"></div></div>
  ${CATEGORIE_DEF.filter(c => dati.aggMese[c.id] > 0).sort((a, b) => dati.aggMese[b.id] - dati.aggMese[a.id]).map(c => {
    const val = dati.aggMese[c.id];
    const prev = dati.aggPrec[c.id] || 0;
    const pct = totaleSpeso > 0 ? val / totaleSpeso * 100 : 0;
    const delta = prev > 0 ? (val - prev) / prev * 100 : null;
    return `<div class="cat-row">
      <div class="cat-dot" style="background:${c.color}"></div>
      <span style="font-size:16px">${c.emoji}</span>
      <span style="flex:1;font-size:13px;font-weight:700">${c.label}</span>
      <div class="bar-bg" style="max-width:80px"><div class="bar-fill" style="background:${c.color};width:${pct}%"></div></div>
      <span style="font-size:10px;color:#8892A0;min-width:30px;text-align:right">${pct.toFixed(0)}%</span>
      <span style="font-size:13px;font-weight:800;color:${c.color};font-family:monospace;min-width:80px;text-align:right">${eur(val)}</span>
      ${delta !== null ? `<span class="delta" style="background:${delta > 5 ? "#E74C3C18" : "#2ECC7118"};color:${delta > 5 ? "#E74C3C" : "#2ECC71"}">${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}%</span>` : ""}
    </div>`;
  }).join("")}
</div>
${dati.top3 && dati.top3.length > 0 ? `
<div class="section">
  <div class="sh"><div class="sh-line"></div><div class="sh-title">Top 3 spese singole</div><div class="sh-fill"></div></div>
  ${dati.top3.map((s, i) => `<div class="top3"><div><div style="font-size:13px;font-weight:700">${["🥇","🥈","🥉"][i]} ${s.descrizione}</div><div style="font-size:10px;color:#8892A0">${s.data} · ${CAT_MAP[s.categoria]?.label || s.categoria}</div></div><span style="font-size:16px;font-weight:900;color:#E74C3C;font-family:monospace">${eur(Math.abs(s.importo))}</span></div>`).join("")}
</div>` : ""}
<div class="section">
  <div class="sh"><div class="sh-line"></div><div class="sh-title">Confronto ${MESI[dati.mese === 0 ? 11 : dati.mese - 1]} → ${MESI[dati.mese]}</div><div class="sh-fill"></div></div>
  ${[
    { label: "Totale spese", curr: totaleSpeso, prev: Object.values(dati.aggPrec).reduce((s,v)=>s+v,0), bold: true },
    ...CATEGORIE_DEF.filter(c => dati.aggMese[c.id] > 0 || dati.aggPrec[c.id] > 0).map(c => ({ label: `${c.emoji} ${c.label}`, curr: dati.aggMese[c.id]||0, prev: dati.aggPrec[c.id]||0, color: c.color }))
  ].map(({ label, curr, prev, color, bold }) => {
    const d = prev > 0 ? (curr - prev) / prev * 100 : 0;
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #1B2A4A88">
      <span style="flex:1;font-size:${bold?13:11}px;font-weight:${bold?800:600};color:${color||"#F5F0E8"}">${label}</span>
      <span style="font-size:10px;color:#8892A0;font-family:monospace">${eur(prev)}</span>
      <span style="font-size:9px;color:#8892A0">→</span>
      <span style="font-size:${bold?13:11}px;font-weight:800;color:${color||"#F5F0E8"};font-family:monospace">${eur(curr)}</span>
      <span style="font-size:10px;font-weight:800;min-width:40px;text-align:right;color:${d>5?"#E74C3C":d<-5?"#2ECC71":"#C9A84C"}">${d>0?"▲":"▼"} ${Math.abs(d).toFixed(0)}%</span>
    </div>`;
  }).join("")}
</div>
<div class="footer">Budget HQ · ${new Date().getFullYear()}</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BudgetHQ_${MESI[dati.mese]}_${dati.anno}.html`;
    a.click();
    URL.revokeObjectURL(url);
    notify("📄 Apri il file nel browser → Stampa → Salva come PDF");
  };

  const oggi = new Date();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card()}>
        <SH title="Report Mensili" />
        <p style={{ fontSize: 12, color: C.grey, lineHeight: 1.7, margin: 0 }}>
          Generati automaticamente al primo accesso del mese successivo. Puoi anche generarli manualmente per qualsiasi mese.
        </p>
      </div>

      <div style={{ ...card(), border: `1px solid ${C.gold}33` }}>
        <SH title="Genera report manuale" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select defaultValue={oggi.getMonth() === 0 ? 11 : oggi.getMonth() - 1} id="sel-mese-report" style={{ ...inp({ flex: 1 }), background: C.navy }}>
            {MESI.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input type="number" defaultValue={oggi.getFullYear()} id="sel-anno-report" style={{ ...inp({ width: 80 }), fontFamily: "monospace" }} />
          <button onClick={() => { const m = parseInt(document.getElementById("sel-mese-report").value); const a = parseInt(document.getElementById("sel-anno-report").value); generaReport(m, a); }} disabled={generando} style={{ background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8, padding: "9px 14px", color: C.dark, fontWeight: 800, fontSize: 12, cursor: "pointer", flexShrink: 0, opacity: generando ? 0.6 : 1 }}>
            {generando ? "⏳" : "Genera"}
          </button>
        </div>
      </div>

      {loading && <Spin />}
      {!loading && reports.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.grey }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nessun report ancora</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Il primo verrà generato automaticamente</div>
        </div>
      )}

      {reports.map(report => {
        const { dati } = report;
        const totaleSpeso = Object.values(dati.aggMese || {}).reduce((s, v) => s + v, 0);
        const isAperto = reportAperto?.id === report.id;
        const tassoColor = (dati.tassoRisparmio || 0) >= 20 ? C.green : (dati.tassoRisparmio || 0) >= 10 ? C.gold : C.red;

        return (
          <div key={report.id} style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${isAperto ? C.gold + "55" : C.gold + "18"}` }}>
            <div onClick={() => setReportAperto(isAperto ? null : report)} style={{ background: `linear-gradient(135deg,${C.dark},${C.navy})`, padding: "14px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.ivory }}>{MESI[dati.mese]} {dati.anno}</div>
                  <div style={{ fontSize: 10, color: C.grey }}>Gen. il {new Date(report.generato_il).toLocaleDateString("it-IT")} · {dati.totaleTransazioni} transazioni</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase" }}>Saldo netto</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: dati.saldo >= 0 ? C.green : C.red, fontFamily: "monospace" }}>{eur(dati.saldo)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: `${tassoColor}18`, color: tassoColor }}>💰 Risparmio {(dati.tassoRisparmio || 0).toFixed(1)}%</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: `${(dati.deltaGlobale || 0) > 0 ? C.red : C.green}18`, color: (dati.deltaGlobale || 0) > 0 ? C.red : C.green }}>
                  {(dati.deltaGlobale || 0) > 0 ? "▲" : "▼"} {Math.abs(dati.deltaGlobale || 0).toFixed(0)}% vs prec.
                </span>
              </div>
            </div>

            {isAperto && (
              <div style={{ background: `${C.navy}44`, borderTop: `1px solid ${C.gold}22` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "14px" }}>
                  {[
                    { label: "Entrate", val: dati.entrate, color: C.green },
                    { label: "Uscite", val: dati.totaleUscite, color: C.red },
                    { label: "Media/giorno", val: dati.mediaGiorn, color: C.blue },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: `${C.dark}88`, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: C.grey, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "monospace" }}>{eur(val)}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "0 14px 8px" }}>
                  <div style={{ fontSize: 10, color: C.grey, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Ripartizione spese</div>
                  {CATEGORIE_DEF.filter(c => dati.aggMese[c.id] > 0).sort((a, b) => dati.aggMese[b.id] - dati.aggMese[a.id]).map(c => {
                    const val = dati.aggMese[c.id];
                    const pct = totaleSpeso > 0 ? val / totaleSpeso * 100 : 0;
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{c.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: C.ivory }}>{c.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: c.color, fontFamily: "monospace" }}>{eur(val)}</span>
                          </div>
                          <div style={{ background: `${C.navy}88`, borderRadius: 3, height: 4 }}>
                            <div style={{ height: "100%", borderRadius: 3, background: c.color, width: `${pct}%` }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: C.grey, minWidth: 28, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: "0 14px 14px" }}>
                  <button onClick={() => scaricaHTML(report)} style={{ width: "100%", background: `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 10, padding: "12px", color: C.dark, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    📄 SCARICA REPORT
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("bghq_token") || null);
  const [userInfo, setUserInfo] = useState(() => { try { return JSON.parse(localStorage.getItem("bghq_user") || "null"); } catch { return null; } });

  const [tab, setTab]         = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [meseSel, setMeseSel] = useState(new Date().getMonth());
  const [catExp, setCatExp]   = useState(null);

  const [spese, setSpese]             = useState([]);
  const [abbonamenti, setAbbonamenti] = useState([
    { nome: "Spotify",       importo: 6.99,  attivo: true, giorno: 1 },
    { nome: "iCloud",        importo: 0.99,  attivo: true, giorno: 1 },
    { nome: "Claude AI",     importo: 20.00, attivo: true, giorno: 1 },
    { nome: "Rata Telefono", importo: 25.00, attivo: true, giorno: 1 },
    { nome: "SIM",           importo: 7.99,  attivo: true, giorno: 1 },
    { nome: "WiFi",          importo: 29.00, attivo: true, giorno: 1 },
    { nome: "Bolletta",      importo: 60.00, attivo: true, giorno: 1 },
    { nome: "Amazon Prime",  importo: 4.99,  attivo: true, giorno: 1 },
    { nome: "Telepass",      importo: 3.90,  attivo: true, giorno: 1 },
  ]);
  const [portafoglio, setPortafoglio] = useState({ etoro: 4000, trading212: 4000, fineco: 4000 });
  const [obiettivi, setObiettivi]     = useState({
    emergenza:    { target: 3000,  prog: 0 },
    investimenti: { target: 2000,  prog: 12000 },
    viaggi:       { target: 1000,  prog: 0 },
  });
  const [rate, setRate]   = useState([
    { id: "r1", nome: "Stanza (affitto)", importo: 400, giorno: 1,  rateTot: 3, ratePagate: 2, dataFine: "2026-04-01" },
    { id: "r2", nome: "Scarpe",           importo: 50,  giorno: 10, rateTot: 3, ratePagate: 1, dataFine: "2026-05-10" },
  ]);
  const [stipendio, setStipendio] = useState(0);
  const [sim, setSim]             = useState({ anni: 10, rendimento: 7, contributo: 200 });
  const [form, setForm]           = useState({ data: new Date().toISOString().split("T")[0], descrizione: "", categoria: "costi_fissi", importo: "", isEntrata: false, note: "" });
  const configCacheRef = useRef([]);

  const notify = useCallback((msg, ms = 3000) => {
    setSyncMsg(msg);
    setTimeout(() => setSyncMsg(""), ms);
  }, []);

  const tokenClientRef = useRef(null);
  const getTokenClient = useCallback(() => {
    if (!tokenClientRef.current && window.google) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        prompt: "",
        callback: async (resp) => {
          if (resp.error) { notify("❌ Riconnetti fallito: " + resp.error); return; }
          setToken(resp.access_token);
          localStorage.setItem("bghq_token", resp.access_token);
        },
      });
    }
    return tokenClientRef.current;
  }, [notify]);

  const silentRefresh = useCallback(() => {
    if (!window.google) return;
    const client = getTokenClient();
    if (client) client.requestAccessToken();
  }, [getTokenClient]);

  const login = () => {
    if (!window.google) { notify("❌ Google API non caricata"); return; }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: async (resp) => {
        if (resp.error) { notify("❌ Login fallito: " + resp.error); return; }
        setToken(resp.access_token);
        localStorage.setItem("bghq_token", resp.access_token);
        try {
          const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${resp.access_token}` } });
          const data = await ui.json();
          setUserInfo(data);
          localStorage.setItem("bghq_user", JSON.stringify(data));
        } catch {}
      },
    });
    client.requestAccessToken();
  };

  const logout = () => {
    setToken(null); setUserInfo(null);
    localStorage.removeItem("bghq_token"); localStorage.removeItem("bghq_user");
  };

  const loadData = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) { setLoading(true); setSyncMsg("🔄 Sincronizzazione..."); }
    try {
      const on401 = () => { setToken(null); silentRefresh(); };

      const parseData = (raw) => {
        if (!raw) return "";
        if (/^\d{5}$/.test(String(raw))) { const d = new Date(Math.round((parseFloat(raw) - 25569) * 86400 * 1000)); return d.toISOString().split("T")[0]; }
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) { const [dd, mm, yyyy] = raw.split("/"); return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`; }
        return raw;
      };

      const sr = await shGet(token, "Spese!A2:F2000", on401);
      setSpese((sr.values || []).map((r, i) => ({ id: `sh-${i}`, data: parseData(r[0]), descrizione: r[1] || "", categoria: r[2] || "altro", importo: parseFloat(r[3]) || 0, tipo: r[4] || "", note: r[5] || "", sheetRow: i + 2 })));

      const ar = await shGet(token, "Abbonamenti!A2:D50", on401);
      if ((ar.values || []).length > 0) setAbbonamenti((ar.values).map(r => ({ nome: r[0] || "", importo: parseFloat(r[1]) || 0, attivo: r[2] === "TRUE", giorno: parseInt(r[3]) || 1 })));

      const rateRes = await shGet(token, "Rate!A2:G100", on401);
      if ((rateRes.values || []).length > 0) setRate((rateRes.values).map((r, i) => ({ id: r[6] || `r${i}`, nome: r[0] || "", importo: parseFloat(r[1]) || 0, giorno: parseInt(r[2]) || 1, rateTot: parseInt(r[3]) || 1, ratePagate: parseInt(r[4]) || 0, dataFine: r[5] || "" })));

      const cr = await shGet(token, "Config!A1:B30", on401);
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
      if (e.message === "TOKEN_EXPIRED") { if (!quiet) notify("🔄 Riconnessione..."); }
      else { if (!quiet) notify("❌ " + e.message); }
    }
    if (!quiet) setLoading(false);
  }, [token, silentRefresh, notify]);

  useEffect(() => {
    if (!token) return;
    loadData();
    const id = setInterval(() => loadData(true), CONFIG.POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, loadData]);

  const aggiungiSpesa = async () => {
    if (!form.descrizione || !form.importo) return;
    const importoFinal = form.isEntrata ? Math.abs(parseFloat(form.importo)) : -Math.abs(parseFloat(form.importo));
    const [y, m, d] = form.data.split("-");
    const dataSheets = `${d}/${m}/${y}`;
    const tipoLabel = form.isEntrata ? "Entrata" : "Spesa";
    const newRow = { ...form, importo: importoFinal, id: `loc-${Date.now()}` };
    setSpese(prev => [...prev, newRow]);
    setForm(p => ({ ...p, descrizione: "", importo: "", note: "" }));
    try {
      await shAppend(token, "Spese!A:F", [[dataSheets, form.descrizione, form.categoria, importoFinal.toFixed(2), tipoLabel, form.note]]);
      notify("✅ Spesa salvata su Sheets");
      setTimeout(() => loadData(true), 800);
    } catch (e) { setSpese(prev => prev.filter(s => s.id !== newRow.id)); notify("❌ " + e.message); }
  };

  const eliminaSpesa = async (spesa) => {
    setSpese(prev => prev.filter(s => s.id !== spesa.id));
    if (spesa.sheetRow) {
      try { await shUpdate(token, `Spese!A${spesa.sheetRow}:F${spesa.sheetRow}`, [[""," ","","","",""]]); notify("🗑️ Spesa rimossa"); }
      catch (e) { notify("❌ " + e.message); }
    }
  };

  const salvaRate = async (nuoveRate) => {
    try {
      await shClear(token, "Rate!A2:G100");
      await shAppend(token, "Rate!A:G", nuoveRate.map(r => [r.nome, r.importo, r.giorno, r.rateTot, r.ratePagate, r.dataFine, r.id]));
    } catch (e) { console.warn("salvaRate:", e.message); }
  };

  const salvaAbbonamenti = async () => {
    setLoading(true);
    try {
      await shClear(token, "Abbonamenti!A2:D100");
      await shAppend(token, "Abbonamenti!A:D", abbonamenti.map(a => [a.nome, a.importo.toFixed(2), a.attivo ? "TRUE" : "FALSE", a.giorno || 1]));
      notify("✅ Abbonamenti aggiornati su Sheets");
    } catch (e) { notify("❌ " + e.message); }
    setLoading(false);
  };

  const saveConfig = useCallback(async (k, v) => {
    if (!token) return;
    try {
      await shUpsertConfig(token, k, v, configCacheRef.current);
      const idx = configCacheRef.current.findIndex(r => r[0] === k);
      if (idx >= 0) configCacheRef.current[idx][1] = String(v);
      else configCacheRef.current.push([k, String(v)]);
    } catch (e) { console.warn("saveConfig:", e.message); }
  }, [token]);

  // ── CALCOLI ──
  const anno = new Date().getFullYear();
  const speseMese = spese.filter(s => { const d = new Date(s.data); return d.getMonth() === meseSel && d.getFullYear() === anno; });
  const spesePrec = spese.filter(s => { const d = new Date(s.data); const pm = meseSel === 0 ? 11 : meseSel - 1; const pa = meseSel === 0 ? anno - 1 : anno; return d.getMonth() === pm && d.getFullYear() === pa; });

  const totaleFissi       = abbonamenti.filter(a => a.attivo).reduce((s, a) => s + a.importo, 0);
  const totaleEntrate     = stipendio + speseMese.filter(s => s.importo > 0).reduce((s, x) => s + x.importo, 0);
  const totaleUscite      = speseMese.filter(s => s.importo < 0).reduce((s, x) => s + Math.abs(x.importo), 0) + totaleFissi;
  const saldoMese         = totaleEntrate - totaleUscite;
  const totalePortafoglio = portafoglio.etoro + portafoglio.trading212 + portafoglio.fineco;

  const aggMese = {}, aggPrec = {};
  CATEGORIE_DEF.forEach(c => { aggMese[c.id] = 0; aggPrec[c.id] = 0; });
  speseMese.filter(s => s.importo < 0).forEach(s => { if (aggMese[s.categoria] !== undefined) aggMese[s.categoria] += Math.abs(s.importo); else aggMese["altro"] += Math.abs(s.importo); });
  spesePrec.filter(s => s.importo < 0).forEach(s => { if (aggPrec[s.categoria] !== undefined) aggPrec[s.categoria] += Math.abs(s.importo); else aggPrec["altro"] += Math.abs(s.importo); });
  aggMese["costi_fissi"] = (aggMese["costi_fissi"] || 0) + totaleFissi;
  aggPrec["costi_fissi"] = (aggPrec["costi_fissi"] || 0) + totaleFissi;

  const totaleSpesoCat = Object.values(aggMese).reduce((s, v) => s + v, 0);
  const totalePrecCat  = Object.values(aggPrec).reduce((s, v) => s + v, 0);
  const deltaGlobale   = totalePrecCat > 0 ? ((totaleSpesoCat - totalePrecCat) / totalePrecCat) * 100 : 0;
  const donutDati      = CATEGORIE_DEF.filter(c => aggMese[c.id] > 0).map(c => ({ id: c.id, label: c.label, color: c.color, valore: aggMese[c.id] })).sort((a, b) => b.valore - a.valore);
  const catSorted      = CATEGORIE_DEF.filter(c => aggMese[c.id] > 0).sort((a, b) => aggMese[b.id] - aggMese[a.id]);

  const oggi2      = new Date();
  const giorniTot  = new Date(anno, meseSel + 1, 0).getDate();
  const giorniPass = meseSel === oggi2.getMonth() ? oggi2.getDate() : giorniTot;
  const mediaGiorn = giorniPass > 0 ? totaleSpesoCat / giorniPass : 0;
  const proiezione = mediaGiorn * giorniTot;

  const simData = [];
  let cap = totalePortafoglio;
  for (let i = 1; i <= sim.anni; i++) {
    cap = cap * (1 + sim.rendimento / 100) + sim.contributo * 12;
    simData.push({ anno: `A${i}`, capitale: Math.round(cap), contributi: Math.round(totalePortafoglio + sim.contributo * 12 * i) });
  }

  const trendData = MESI_SHORT.map((m, i) => {
    const sp = spese.filter(s => { const d = new Date(s.data); return d.getMonth() === i && d.getFullYear() === anno; });
    const ent = stipendio + sp.filter(s => s.importo > 0).reduce((s, x) => s + x.importo, 0);
    const usc = sp.filter(s => s.importo < 0).reduce((s, x) => s + Math.abs(x.importo), 0) + totaleFissi;
    return { mese: m, entrate: ent, uscite: usc };
  });

  const TABS = [
    { id: "dashboard",    label: "🏠", title: "Home" },
    { id: "panoramica",   label: "🍩", title: "Mese" },
    { id: "spese",        label: "📅", title: "Spese" },
    { id: "abbonamenti",  label: "💳", title: "Fissi" },
    { id: "risparmi",     label: "🏦", title: "Risparmi" },
    { id: "investimenti", label: "📈", title: "Invest." },
    { id: "reports",      label: "📊", title: "Reports" },
  ];

  // ── LOGIN ──
  if (!token) {
    const savedUser = userInfo;
    return (
      <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 30% 20%, #1B2A4A 0%, #060D15 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" }}>
        <script src="https://accounts.google.com/gsi/client" async />
        <div style={{ textAlign: "center", padding: "40px 24px", maxWidth: 360 }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>💰</div>
          <div style={{ fontSize: 10, color: C.gold, letterSpacing: "0.22em", fontWeight: 700, textTransform: "uppercase", fontFamily: "Arial,sans-serif", marginBottom: 6 }}>Budget HQ</div>
          {savedUser ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.ivory, marginBottom: 6 }}>Bentornato, {savedUser.given_name || savedUser.name} 👋</div>
              <div style={{ fontSize: 13, color: C.grey, marginBottom: 28, fontFamily: "Arial,sans-serif" }}>La sessione è scaduta. Un tap per rientrare.</div>
              <button onClick={silentRefresh} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: `linear-gradient(135deg, ${C.gold}, #9A7830)`, border: "none", borderRadius: 12, padding: "16px 24px", color: C.dark, fontWeight: 800, fontSize: 16, cursor: "pointer", width: "100%", fontFamily: "Arial,sans-serif" }}>
                🔄 Riconnetti
              </button>
              <button onClick={() => { setUserInfo(null); localStorage.removeItem("bghq_user"); }} style={{ marginTop: 14, background: "none", border: "none", color: C.grey, fontSize: 12, cursor: "pointer", fontFamily: "Arial,sans-serif" }}>
                Accedi con un altro account
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 26, fontWeight: 900, color: C.ivory, marginBottom: 8, lineHeight: 1.2 }}>Il tuo patrimonio,<br />sotto controllo.</div>
              <div style={{ fontSize: 13, color: C.grey, marginBottom: 36, lineHeight: 1.7, fontFamily: "Arial,sans-serif" }}>Ogni modifica nell'app va su <strong style={{ color: C.gold }}>Google Sheets</strong> in tempo reale.</div>
              <button onClick={login} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: `linear-gradient(135deg, ${C.gold}, #9A7830)`, border: "none", borderRadius: 12, padding: "14px 24px", color: C.dark, fontWeight: 800, fontSize: 14, cursor: "pointer", width: "100%", fontFamily: "Arial,sans-serif" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill={C.dark} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill={C.dark} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill={C.dark} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill={C.dark} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Accedi con Google
              </button>
            </>
          )}
          {syncMsg && <div style={{ marginTop: 14, fontSize: 12, color: C.red, fontFamily: "Arial,sans-serif" }}>{syncMsg}</div>}
        </div>
      </div>
    );
  }

  // ── APP ──
  const nome = userInfo?.given_name || userInfo?.name?.split(" ")[0] || null;
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 15% 0%, #1B2A4A88 0%, transparent 55%), #060D15`, fontFamily: "Arial, sans-serif", color: C.ivory, paddingBottom: "calc(70px + env(safe-area-inset-bottom))" }}>
      <script src="https://accounts.google.com/gsi/client" async />

      {/* HEADER */}
      <div style={{ background: `${C.dark}F2`, borderBottom: `1px solid ${C.gold}33`, padding: "0 16px 10px", paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))", paddingTop: "calc(env(safe-area-inset-top) + 12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, color: C.gold, letterSpacing: "0.22em", fontWeight: 700, textTransform: "uppercase" }}>Budget HQ</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.ivory }}>{nome ? `Ciao, ${nome} 👋` : "💰 Dashboard"}</div>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            {syncMsg && <span style={{ fontSize: 10, color: syncMsg.startsWith("✅") ? C.green : syncMsg.startsWith("🔄") ? C.gold : C.red, maxWidth: 130, textAlign: "right" }}>{syncMsg}</span>}
            <button onClick={() => loadData()} disabled={loading} title="Sincronizza ora" style={{ background: `${C.navy}88`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "5px 9px", color: C.gold, cursor: "pointer", fontSize: 13 }}>{loading ? "⏳" : "🔄"}</button>
            <button onClick={logout} style={{ background: "none", border: `1px solid ${C.red}44`, borderRadius: 8, padding: "5px 9px", color: C.red, cursor: "pointer", fontSize: 10 }}>Esci</button>
          </div>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: `${C.dark}F8`, borderTop: `1px solid ${C.gold}33`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", overflowX: "auto", scrollbarWidth: "none" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, minWidth: 52, padding: "10px 2px 8px", border: "none", cursor: "pointer", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>{t.label}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: tab === t.id ? C.gold : C.grey, borderTop: tab === t.id ? `2px solid ${C.gold}` : "2px solid transparent", paddingTop: 3, width: "100%", textAlign: "center" }}>{t.title}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 14px", paddingLeft: "max(14px, env(safe-area-inset-left))", paddingRight: "max(14px, env(safe-area-inset-right))", maxWidth: 600, margin: "0 auto" }}>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card(), display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: C.grey, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>💼 Stipendio Mensile</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: C.gold, fontWeight: 700, fontSize: 15, alignSelf: "center" }}>€</span>
                  <input type="number" value={stipendio || ""} placeholder="0.00" onChange={e => setStipendio(parseFloat(e.target.value) || 0)} onBlur={e => saveConfig("stipendio", parseFloat(e.target.value) || 0)} style={{ ...inp({ fontSize: 20, fontWeight: 700, fontFamily: "monospace" }) }} />
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
                  { label: "Costi Fissi",     val: totaleFissi, color: C.red },
                  { label: "Spese Variabili", val: speseMese.filter(s=>s.importo<0).reduce((s,x)=>s+Math.abs(x.importo),0), color: "#F39C12" },
                  { label: "Risparmio",       val: saldoMese, color: C.green },
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

        {/* ══ PANORAMICA ══ */}
        {tab === "panoramica" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

            <div style={{ ...card(), paddingBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.08em" }}>Entrate mese</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontFamily: "monospace" }}>{eur(totaleEntrate)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rimanente</div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: totaleEntrate - totaleSpesoCat >= 0 ? C.blue : C.red }}>{eur(totaleEntrate - totaleSpesoCat)}</div>
                </div>
              </div>
              {donutDati.length > 0
                ? <Donut dati={donutDati} totaleSpeso={totaleSpesoCat} entrate={totaleEntrate || 1} />
                : <div style={{ textAlign: "center", color: C.grey, padding: "30px 0", fontSize: 13 }}>Nessuna spesa registrata questo mese</div>
              }
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 12px", marginTop: 14, justifyContent: "center" }}>
                {donutDati.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: C.grey }}>{CAT_MAP[d.id]?.emoji} {d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Media giornaliera",    val: eur(mediaGiorn), sub: `su ${giorniPass} giorni`, color: C.blue,  icon: "📅" },
                { label: "Proiezione fine mese", val: eur(proiezione), sub: proiezione > totaleEntrate && totaleEntrate > 0 ? "⚠️ supera entrate" : "✅ nei limiti", color: proiezione > totaleEntrate && totaleEntrate > 0 ? C.red : C.green, icon: "🔮" },
              ].map(({ label, val, sub, color, icon }) => (
                <div key={label} style={{ background: `linear-gradient(135deg,${C.dark},${C.navy})`, border: `1px solid ${color}33`, borderRadius: 12, padding: "13px 12px" }}>
                  <div style={{ fontSize: 14, marginBottom: 3 }}>{icon}</div>
                  <div style={{ fontSize: 9, color: C.grey, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1.1 }}>{val}</div>
                  <div style={{ fontSize: 9, color: C.grey, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>

            <div>
              <SH title="Per Categoria · Tocca per dettaglio" />
              {catSorted.map((cat, rank) => (
                <CatRow key={cat.id} cat={cat} valore={aggMese[cat.id] || 0} valorePrecedente={aggPrec[cat.id] || 0} totale={totaleSpesoCat} rank={rank} expanded={catExp === cat.id} onExpand={() => setCatExp(catExp === cat.id ? null : cat.id)} spese={speseMese.filter(s => s.categoria === cat.id && s.importo < 0)} />
              ))}
              {catSorted.length === 0 && <div style={{ textAlign: "center", color: C.grey, padding: "20px 0", fontSize: 13 }}>Nessuna spesa questo mese</div>}
            </div>

            {catSorted.length > 0 && (
              <div style={card()}>
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
                <button key={i} onClick={() => setMeseSel(i)} style={{ padding: "4px 9px", borderRadius: 20, border: `1px solid ${i === meseSel ? C.gold : C.gold + "33"}`, background: i === meseSel ? C.gold : "transparent", color: i === meseSel ? C.dark : C.grey, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{m}</button>
              ))}
            </div>

            <button onClick={async () => {
              const today = new Date();
              const [y, m, d] = today.toISOString().split("T")[0].split("-");
              const dataSheets = `${d}/${m}/${y}`;
              const spesaRapida = { id: `loc-${Date.now()}`, data: today.toISOString().split("T")[0], descrizione: "Tabacchi", categoria: "tabacchi", importo: -5.50, tipo: "Spesa", note: "" };
              setSpese(prev => [...prev, spesaRapida]);
              try {
                await shAppend(token, "Spese!A:F", [[dataSheets, "Tabacchi", "tabacchi", "-5.50", "Spesa", ""]]);
                notify("🚬 Tabacchi salvati");
                setTimeout(() => loadData(true), 800);
              } catch (e) { setSpese(prev => prev.filter(s => s.id !== spesaRapida.id)); notify("❌ " + e.message); }
            }} disabled={loading} style={{ background: `linear-gradient(135deg, #9B8EA0, #6B5E70)`, border: "none", borderRadius: 12, padding: "14px", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? .6 : 1 }}>
              🚬 Tabacchi — €5,50
            </button>

            <div style={card()}>
              <SH title="Aggiungi → Sheets" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${C.gold}33` }}>
                  <button onClick={() => setForm(p => ({ ...p, isEntrata: false }))} style={{ flex: 1, padding: "9px", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12, background: !form.isEntrata ? C.red : `${C.navy}66`, color: !form.isEntrata ? "white" : C.grey }}>💸 Spesa</button>
                  <button onClick={() => setForm(p => ({ ...p, isEntrata: true }))} style={{ flex: 1, padding: "9px", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12, background: form.isEntrata ? C.green : `${C.navy}66`, color: form.isEntrata ? "white" : C.grey }}>💰 Entrata</button>
                </div>
                <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} style={inp()} />
                <input type="text" placeholder="Descrizione..." value={form.descrizione} onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))} style={inp()} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} style={{ ...inp(), background: C.navy }}>
                    {CATEGORIE_DEF.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                  <input type="number" placeholder="€ Importo" inputMode="decimal" step="0.01" min="0" value={form.importo} onChange={e => setForm(p => ({ ...p, importo: e.target.value }))} style={{ ...inp(), fontFamily: "monospace", fontWeight: 700 }} />
                </div>
                <button onClick={aggiungiSpesa} disabled={loading} style={{ background: form.isEntrata ? `linear-gradient(135deg,${C.green},#1a8a4a)` : `linear-gradient(135deg,${C.gold},#9A7830)`, border: "none", borderRadius: 8, padding: "11px", color: "white", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: loading ? .6 : 1 }}>
                  {loading ? "⏳ Salvataggio..." : `💾 SALVA ${form.isEntrata ? "ENTRATA" : "SPESA"}`}
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
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: s.importo > 0 ? C.green : C.red, flexShrink: 0 }}>{s.importo > 0 ? "+" : ""}{eur(s.importo)}</span>
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

        {/* ══ FISSI ══ */}
        {tab === "abbonamenti" && <TabFissi abbonamenti={abbonamenti} setAbbonamenti={setAbbonamenti} rate={rate} setRate={setRate} totaleFissi={totaleFissi} loading={loading} salvaAbbonamenti={salvaAbbonamenti} salvaRate={salvaRate} eur={eur} />}

        {/* ══ RISPARMI ══ */}
        {tab === "risparmi" && <TabRisparmi token={token} notify={notify} />}

        {/* ══ INVESTIMENTI ══ */}
        {tab === "investimenti" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={card()}>
              <SH title="Portafoglio Attuale" />
              {[["etoro","eToro"],["trading212","Trading 212"],["fineco","Fineco"]].map(([key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{label}</span>
                  <span style={{ color: C.gold, fontWeight: 700 }}>€</span>
                  <input type="number" value={portafoglio[key]} onChange={e => setPortafoglio(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} onBlur={e => saveConfig(key, parseFloat(e.target.value) || 0)} style={{ width: 100, background: `${C.navy}66`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: "7px 9px", color: C.ivory, fontFamily: "monospace", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "right" }} />
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
                    <input type="number" value={sim[key]} min={1} onChange={e => setSim(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} style={{ width: "100%", background: `${C.navy}66`, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: "7px", color: C.gold, fontSize: 14, fontWeight: 800, fontFamily: "monospace", outline: "none", textAlign: "center" }} />
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
              <div style={{ fontSize: 12, color: "#D4AC6E", lineHeight: 1.6 }}>Scadenza strategica <strong style={{ color: C.gold }}>6 Aprile 2026</strong>.<br />Monitora situazione geopolitica Iran/Hormuz prima di agire.</div>
            </div>
          </div>
        )}

        {/* ══ REPORTS ══ */}
        {tab === "reports" && <TabReports token={token} spese={spese} abbonamenti={abbonamenti} stipendio={stipendio} notify={notify} />}

      </div>
    </div>
  );
}