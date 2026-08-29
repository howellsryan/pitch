/** ui/helpers.js — fmt.money/wage/date, toast, showModal, showLoader, navigateTo */

// ─── Formatting ───────────────────────────────────────────────
export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

export const fmt = {
  date:      (d) => { const dt = new Date(d); return `${DAYS[dt.getDay()]} ${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; },
  dateShort: (d) => { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]}`; },
  money:     (v) => { v = Number(v) || 0; return v <= 0 ? 'Free' : v >= 1e9 ? `£${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `£${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `£${(v/1e3).toFixed(0)}K` : `£${v}`; },
  wage:      (v) => { v = Number(v) || 0; return v <= 0 ? 'Free' : v >= 1000 ? `£${(v/1000).toFixed(0)}K/w` : `£${v}/w`; },
};

// ─── Position helpers ────────────────────────────────────────
export function posGroup(pos) {
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return 'ATT';
  if (['CM','CDM','RM','LM'].includes(pos))       return 'MID';
  if (['CB','RB','LB'].includes(pos))             return 'DEF';
  if (pos === 'GK')                               return 'GK';
  return 'MID';
}

export function formLabel(p) {
  const score = 50 + (p.goals ?? 0) * 8 + (p.assists ?? 0) * 5 + (p.cleanSheets ?? 0) * 6;
  const capped = Math.min(99, score);
  if (capped >= 75) return { text: '🔥 Hot',   cls: 'hot' };
  if (capped >= 62) return { text: '✅ Good',  cls: 'good' };
  return               { text: '📉 Avg',   cls: 'avg' };
}

// ─── Player nationality by ID + league fallback ──────────────
// Covers all real players in the game data. Youth/generated players fall back to league.
export const _NAT = {
  // ── PREMIER LEAGUE ────────────────────────────────────────────
  ars_raya:'🇪🇸',ars_turner:'🇺🇸',ars_white:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',ars_timber:'🇳🇱',ars_saliba:'🇫🇷',ars_gabriel:'🇧🇷',
  ars_calafiori:'🇮🇹',ars_zinchenko:'🇺🇦',ars_rice:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',ars_partey:'🇬🇭',ars_merino:'🇪🇸',
  ars_odegaard:'🇳🇴',ars_saka:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',ars_martinelli:'🇧🇷',ars_trossard:'🇧🇪',ars_havertz:'🇩🇪',ars_nketiah:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  avl_martinez:'🇦🇷',avl_olsen:'🇸🇪',avl_cash:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',avl_konsa:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',avl_carlos:'🇧🇷',avl_digne:'🇫🇷',
  avl_tielemans:'🇧🇪',avl_mcginn:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',avl_rogers:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',avl_bailey:'🇯🇲',avl_diaby:'🇫🇷',
  avl_duran:'🇨🇴',avl_kamara:'🇸🇱',
  che_sanchez:'🇩🇴',che_disasi:'🇫🇷',che_fofana:'🇫🇷',che_colwill:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',che_cucurella:'🇪🇸',
  che_caicedo:'🇪🇨',che_enzo:'🇦🇷',che_palmer:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',che_neto:'🇧🇷',che_jackson:'🇸🇳',che_madueke:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  che_mudryk:'🇺🇦',che_gusto:'🇫🇷',che_sterling:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  lfc_alisson:'🇧🇷',lfc_kelleher:'🇮🇪',lfc_alexander_arnold:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',lfc_konate:'🇫🇷',lfc_van_dijk:'🇳🇱',
  lfc_robertson:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',lfc_gravenberch:'🇳🇱',lfc_mac_allister:'🇦🇷',lfc_szoboszlai:'🇭🇺',
  lfc_salah:'🇪🇬',lfc_gakpo:'🇳🇱',lfc_nunez:'🇺🇾',lfc_jota:'🇵🇹',lfc_diaz:'🇨🇴',lfc_jones:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  liv_wirtz:'🇩🇪',
  mci_ederson:'🇧🇷',mci_ortega:'🇩🇪',mci_walker:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mci_akanji:'🇨🇭',mci_dias:'🇵🇹',mci_gvardiol:'🇭🇷',
  mci_stones:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mci_kovacic:'🇭🇷',mci_rodri:'🇪🇸',mci_de_bruyne:'🇧🇪',mci_bernardo:'🇵🇹',
  mci_doku:'🇧🇪',mci_foden:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mci_haaland:'🇳🇴',mci_bob:'🇸🇱',
  mun_onana:'🇨🇲',mun_de_gea:'🇪🇸',mun_dalot:'🇵🇹',mun_varane:'🇫🇷',mun_lisandro:'🇦🇷',mun_shaw:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  mun_casemiro:'🇧🇷',mun_fernandes:'🇵🇹',mun_mount:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mun_rashford:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mun_antony:'🇧🇷',
  mun_martial:'🇫🇷',mun_hojlund:'🇩🇰',mun_mainoo:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mun_garnacho:'🇦🇷',
  tot_vicario:'🇮🇹',tot_romero:'🇦🇷',tot_van_de_ven:'🇳🇱',tot_porro:'🇪🇸',tot_udogie:'🇮🇹',
  tot_bissouma:'🇲🇱',tot_bentancur:'🇺🇾',tot_maddison:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',tot_kulusevski:'🇸🇪',tot_son:'🇰🇷',
  tot_richarlison:'🇧🇷',tot_johnson:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  new_pope:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',new_trippier:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',new_botman:'🇳🇱',new_schar:'🇨🇭',new_burn:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  new_tonali:'🇮🇹',new_guimaraes:'🇧🇷',new_joelinton:'🇧🇷',new_almiron:'🇵🇾',new_isak:'🇸🇪',new_gordon:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  // ── BUNDESLIGA ────────────────────────────────────────────────
  bay_neuer:'🇩🇪',bay_ulreich:'🇩🇪',bay_kimmich:'🇩🇪',bay_guerreiro:'🇵🇹',bay_upamecano:'🇫🇷',
  bay_dier:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',bay_kim:'🇰🇷',bay_davies:'🇨🇦',bay_goretzka:'🇩🇪',bay_kimmich_m:'🇵🇹',
  bay_musiala:'🇩🇪',bay_muller:'🇩🇪',bay_olise:'🇫🇷',bay_gnabry:'🇩🇪',bay_coman:'🇫🇷',
  bay_sane:'🇩🇪',bay_kane:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',bay_tel:'🇫🇷',
  bvb_kobel:'🇨🇭',bvb_meyer:'🇩🇪',bvb_ryerson:'🇺🇸',bvb_yan_couto:'🇧🇷',bvb_schlotterbeck:'🇩🇪',
  bvb_anton:'🇩🇪',bvb_sule:'🇩🇪',bvb_bensebaini:'🇩🇿',bvb_gross:'🇩🇪',bvb_nmecha:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  bvb_sabitzer:'🇦🇹',bvb_can:'🇩🇪',bvb_malen:'🇳🇱',bvb_adeyemi:'🇩🇪',bvb_gittens:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  bvb_brandt:'🇩🇪',bvb_guirassy:'🇬🇳',bvb_beier:'🇩🇪',
  lev_hradecky:'🇫🇮',lev_kovar:'🇨🇿',lev_frimpong:'🇳🇱',lev_hincapie:'🇪🇨',lev_tapsoba:'🇧🇫',
  lev_xhaka:'🇨🇭',lev_palacios:'🇦🇷',lev_grimaldo:'🇪🇸',lev_boniface:'🇳🇬',lev_terrier:'🇫🇷',
  rbl_gulacsi:'🇭🇺',rbl_simakan:'🇫🇷',rbl_orban:'🇭🇺',rbl_raum:'🇩🇪',rbl_henrichs:'🇩🇪',
  rbl_kampl:'🇸🇮',rbl_laimer:'🇦🇹',rbl_szoboszlai_rbl:'🇭🇺',rbl_nkunku:'🇫🇷',rbl_openda:'🇧🇪',rbl_sesko:'🇸🇮',
  // ── LA LIGA ───────────────────────────────────────────────────
  rma_courtois:'🇧🇪',rma_lunin:'🇺🇦',rma_carvajal:'🇪🇸',rma_militao:'🇧🇷',rma_alaba:'🇦🇹',rma_mendy:'🇫🇷',
  rma_tchouameni:'🇫🇷',rma_valverde:'🇺🇾',rma_kroos:'🇩🇪',rma_modric:'🇭🇷',rma_camavinga:'🇫🇷',
  rma_bellingham:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',rma_vinicius:'🇧🇷',rma_mbappe:'🇫🇷',rma_rodrygo:'🇧🇷',rma_brahim:'🇲🇦',
  fcb_ter_stegen:'🇩🇪',fcb_araujo:'🇺🇾',fcb_christensen:'🇩🇰',fcb_kounde:'🇫🇷',fcb_balde:'🇪🇸',
  fcb_de_jong:'🇳🇱',fcb_pedri:'🇪🇸',fcb_gavi:'🇪🇸',fcb_yamal:'🇪🇸',fcb_raphinha:'🇧🇷',fcb_lewandowski:'🇵🇱',
  fcb_ferran:'🇪🇸',fcb_martinez:'🇪🇸',
  atm_oblak:'🇸🇮',atm_savic:'🇲🇪',atm_gimenez:'🇺🇾',atm_hermoso:'🇪🇸',atm_llorente:'🇪🇸',
  atm_koke:'🇪🇸',atm_witsel:'🇧🇪',atm_griezmann:'🇫🇷',atm_correa:'🇦🇷',atm_morata:'🇪🇸',
  // ── SERIE A ───────────────────────────────────────────────────
  int_sommer:'🇨🇭',int_de_vrij:'🇳🇱',int_bastoni:'🇮🇹',int_pavard:'🇫🇷',int_darmian:'🇮🇹',int_dumfries:'🇳🇱',
  int_calhanoglu:'🇹🇷',int_barella:'🇮🇹',int_mkhitaryan:'🇦🇲',int_dimarco:'🇮🇹',int_lautaro:'🇦🇷',int_thuram:'🇫🇷',
  juv_szczesny:'🇵🇱',juv_bremer:'🇧🇷',juv_danilo:'🇧🇷',juv_gatti:'🇮🇹',juv_rabiot:'🇫🇷',
  juv_locatelli:'🇮🇹',juv_kostic:'🇷🇸',juv_chiesa:'🇮🇹',juv_vlahovic:'🇷🇸',juv_yildiz:'🇩🇪',
  mil_maignan:'🇫🇷',mil_kalulu:'🇫🇷',mil_tomori:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',mil_theo:'🇫🇷',mil_bennacer:'🇩🇿',
  mil_tonali_m:'🇮🇹',mil_reijnders:'🇳🇱',mil_pulisic:'🇺🇸',mil_leao:'🇵🇹',mil_giroud:'🇫🇷',mil_jovic:'🇷🇸',
  nap_meret:'🇮🇹',nap_di_lorenzo:'🇮🇹',nap_kim_min:'🇰🇷',nap_rrahmani:'🇽🇰',nap_lobotka:'🇸🇰',
  nap_anguissa:'🇨🇲',nap_zielinski:'🇵🇱',nap_kvaratskhelia:'🇬🇪',nap_osimhen:'🇳🇬',nap_politano:'🇮🇹',
  // ── LIGUE 1 ───────────────────────────────────────────────────
  psg_donnarumma:'🇮🇹',psg_hakimi:'🇲🇦',psg_marques:'🇫🇷',psg_hernandez_l:'🇫🇷',psg_nuno_mendes:'🇵🇹',
  psg_fabian:'🇪🇸',psg_verratti:'🇮🇹',psg_vitinha:'🇵🇹',psg_dembele:'🇫🇷',psg_kolo_muani:'🇫🇷',psg_barcola:'🇫🇷',
  // ── EREDIVISIE ────────────────────────────────────────────────
  ajx_pasveer:'🇳🇱',ajx_rensch:'🇳🇱',ajx_sutalo:'🇭🇷',ajx_hato:'🇳🇱',ajx_henderson:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  ajx_klaassen:'🇳🇱',ajx_brobbey:'🇳🇱',ajx_godts:'🇧🇪',ajx_taylor:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',ajx_weghorst:'🇳🇱',
  psv_benitez:'🇺🇾',psv_teze:'🇫🇷',psv_ramalho:'🇧🇷',psv_boscagli:'🇫🇷',psv_dest:'🇺🇸',
  psv_veerman:'🇳🇱',psv_van_ginkel:'🇳🇱',psv_lang:'🇧🇪',psv_til:'🇳🇱',psv_bakayoko:'🇧🇪',psv_de_jong_l:'🇳🇱',
  fey_bijlow:'🇳🇱',fey_geertruida:'🇳🇱',fey_trauner:'🇦🇹',fey_hartman:'🇳🇱',fey_cook:'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  fey_wieffer:'🇳🇱',fey_stengs:'🇳🇱',fey_paixao:'🇵🇹',fey_gimenez:'🇲🇽',fey_ueda:'🇯🇵',
};

// League-based fallback flag
export const _LEAGUE_FLAG = {
  'Premier League':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Championship':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','League One':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','League Two':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'La Liga':'🇪🇸','Bundesliga':'🇩🇪','Serie A':'🇮🇹','Ligue 1':'🇫🇷','Eredivisie':'🇳🇱',
};

export function playerNationality(player, teamLeague) {
  return _NAT[player.id] || _LEAGUE_FLAG[teamLeague] || '🌍';
}

// ─── Toast ───────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  el.innerHTML = `<span class="toast-icon">${icons[type] ?? 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('vis'));
  setTimeout(() => { el.classList.remove('vis'); el.addEventListener('transitionend', () => el.remove(), { once: true }); }, duration);
}

// ─── Loader ───────────────────────────────────────────────────
export function showLoader(msg = 'Simulating…') {
  const el = document.getElementById('loader');
  if (el) { el.querySelector('.loader-msg').textContent = msg; el.classList.add('vis'); }
}
export function hideLoader() {
  document.getElementById('loader')?.classList.remove('vis');
}

// ─── Modal ───────────────────────────────────────────────────
export function showModal(title, bodyHTML, actions = [], opts = {}) {
  document.getElementById('modal-bd')?.remove();
  const bd = document.createElement('div');
  bd.id = 'modal-bd'; bd.className = 'modal-bd';
  if (opts.wide) bd.classList.add('modal-wide');
  const actHTML = actions.map(a =>
    `<button class="btn ${a.cls ?? 'btn-sec'}" id="modal-${a.id}" data-aid="${a.id}">${a.label}</button>`
  ).join('');
  bd.innerHTML = `
    <div class="modal${opts.wide ? ' modal-xl' : ''}">
      <div class="modal-hdr">
        <span class="modal-title">${title}</span>
        <button class="modal-x" id="modal-x">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${actions.length ? `<div class="modal-foot">${actHTML}</div>` : ''}
    </div>`;
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('open'));
  const close = () => { bd.classList.remove('open'); bd.addEventListener('transitionend', () => bd.remove(), { once: true }); };
  bd.querySelector('#modal-x').onclick = close;
  if (!opts.noDismiss) {
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
  }
  bd.querySelectorAll('[data-aid]').forEach(btn => {
    const a = actions.find(x => x.id === btn.dataset.aid);
    if (a?.handler) btn.addEventListener('click', async () => { const result = await a.handler(); if (result !== false) close(); });
    else btn.addEventListener('click', close);
  });
  return { close };
}

// ─── Screen navigation ────────────────────────────────────────
export const _screens = new Map();
export let _active = null;

const ROUTE_PARAM = 'screen';
const ROUTE_ALIASES = { tactics: 'squad' };

function canonicalScreen(id) { return ROUTE_ALIASES[id] ?? id; }

function routeFromLocation() {
  return new URL(window.location.href).searchParams.get(ROUTE_PARAM);
}

function writeRoute(id, mode) {
  if (mode === 'none') return;
  const url = new URL(window.location.href);
  url.searchParams.set(ROUTE_PARAM, id);
  const state = { ...(history.state || {}), pitchScreen: id };
  history[mode === 'replace' ? 'replaceState' : 'pushState'](state, '', url);
}

export function registerScreen(id, onEnter) {
  const el = document.getElementById(`screen-${id}`);
  if (el) _screens.set(id, { el, onEnter });
}

export async function navigateTo(id, { history: historyMode = 'push' } = {}) {
  id = canonicalScreen(id);
  if (!_screens.has(id) || _active === id) return;
  if (_active) {
    _screens.get(_active).el.classList.remove('active');
    document.querySelectorAll(`[data-nav="${_active}"]`).forEach(n => n.classList.remove('active'));
  }
  _active = id;
  const s = _screens.get(id);
  s.el.classList.add('active');
  s.el.scrollTop = 0;
  document.querySelectorAll(`[data-nav="${id}"]`).forEach(n => n.classList.add('active'));
  if (s.onEnter) { try { await s.onEnter(); } catch(e) { console.error(`[screen:${id}]`, e); } }
  writeRoute(id, historyMode);
  window.dispatchEvent(new CustomEvent('pitch:navigation', { detail: { id } }));
}

export const getActiveScreen = () => _active;

/** Restore a browser-history entry without making a second history entry. */
export function restoreScreenFromHistory() {
  const id = canonicalScreen(history.state?.pitchScreen || routeFromLocation() || 'home');
  return navigateTo(_screens.has(id) ? id : 'home', { history: 'none' });
}
