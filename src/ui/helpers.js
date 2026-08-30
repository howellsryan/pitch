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
  if (capped >= 75) return { text: 'Hot',     cls: 'hot' };
  if (capped >= 62) return { text: 'Good',    cls: 'good' };
  return               { text: 'Average', cls: 'avg' };
}

// ─── Player nationality by ID + league fallback ──────────────
// Text codes are deliberate: they are stable cross-platform and avoid OS emoji flags.
// Youth/generated players fall back to the league's home nation.
export const _NAT = {
  // ── PREMIER LEAGUE ────────────────────────────────────────────
  ars_raya:'ESP',ars_turner:'USA',ars_white:'ENG',ars_timber:'NED',ars_saliba:'FRA',ars_gabriel:'BRA',
  ars_calafiori:'ITA',ars_zinchenko:'UKR',ars_rice:'ENG',ars_partey:'GHA',ars_merino:'ESP',
  ars_odegaard:'NOR',ars_saka:'ENG',ars_martinelli:'BRA',ars_trossard:'BEL',ars_havertz:'GER',ars_nketiah:'ENG',
  avl_martinez:'ARG',avl_olsen:'SWE',avl_cash:'ENG',avl_konsa:'ENG',avl_carlos:'BRA',avl_digne:'FRA',
  avl_tielemans:'BEL',avl_mcginn:'SCO',avl_rogers:'ENG',avl_bailey:'JAM',avl_diaby:'FRA',
  avl_duran:'COL',avl_kamara:'SLE',
  che_sanchez:'DOM',che_disasi:'FRA',che_fofana:'FRA',che_colwill:'ENG',che_cucurella:'ESP',
  che_caicedo:'ECU',che_enzo:'ARG',che_palmer:'ENG',che_neto:'BRA',che_jackson:'SEN',che_madueke:'ENG',
  che_mudryk:'UKR',che_gusto:'FRA',che_sterling:'ENG',
  lfc_alisson:'BRA',lfc_kelleher:'IRL',lfc_alexander_arnold:'ENG',lfc_konate:'FRA',lfc_van_dijk:'NED',
  lfc_robertson:'SCO',lfc_gravenberch:'NED',lfc_mac_allister:'ARG',lfc_szoboszlai:'HUN',
  lfc_salah:'EGY',lfc_gakpo:'NED',lfc_nunez:'URU',lfc_jota:'POR',lfc_diaz:'COL',lfc_jones:'ENG',
  liv_wirtz:'GER',
  mci_ederson:'BRA',mci_ortega:'GER',mci_walker:'ENG',mci_akanji:'SUI',mci_dias:'POR',mci_gvardiol:'CRO',
  mci_stones:'ENG',mci_kovacic:'CRO',mci_rodri:'ESP',mci_de_bruyne:'BEL',mci_bernardo:'POR',
  mci_doku:'BEL',mci_foden:'ENG',mci_haaland:'NOR',mci_bob:'SLE',
  mun_onana:'CMR',mun_de_gea:'ESP',mun_dalot:'POR',mun_varane:'FRA',mun_lisandro:'ARG',mun_shaw:'ENG',
  mun_casemiro:'BRA',mun_fernandes:'POR',mun_mount:'ENG',mun_rashford:'ENG',mun_antony:'BRA',
  mun_martial:'FRA',mun_hojlund:'DEN',mun_mainoo:'ENG',mun_garnacho:'ARG',
  tot_vicario:'ITA',tot_romero:'ARG',tot_van_de_ven:'NED',tot_porro:'ESP',tot_udogie:'ITA',
  tot_bissouma:'MLI',tot_bentancur:'URU',tot_maddison:'ENG',tot_kulusevski:'SWE',tot_son:'KOR',
  tot_richarlison:'BRA',tot_johnson:'ENG',
  new_pope:'ENG',new_trippier:'ENG',new_botman:'NED',new_schar:'SUI',new_burn:'SCO',
  new_tonali:'ITA',new_guimaraes:'BRA',new_joelinton:'BRA',new_almiron:'PAR',new_isak:'SWE',new_gordon:'ENG',
  // ── BUNDESLIGA ────────────────────────────────────────────────
  bay_neuer:'GER',bay_ulreich:'GER',bay_kimmich:'GER',bay_guerreiro:'POR',bay_upamecano:'FRA',
  bay_dier:'ENG',bay_kim:'KOR',bay_davies:'CAN',bay_goretzka:'GER',bay_kimmich_m:'POR',
  bay_musiala:'GER',bay_muller:'GER',bay_olise:'FRA',bay_gnabry:'GER',bay_coman:'FRA',
  bay_sane:'GER',bay_kane:'ENG',bay_tel:'FRA',
  bvb_kobel:'SUI',bvb_meyer:'GER',bvb_ryerson:'USA',bvb_yan_couto:'BRA',bvb_schlotterbeck:'GER',
  bvb_anton:'GER',bvb_sule:'GER',bvb_bensebaini:'ALG',bvb_gross:'GER',bvb_nmecha:'ENG',
  bvb_sabitzer:'AUT',bvb_can:'GER',bvb_malen:'NED',bvb_adeyemi:'GER',bvb_gittens:'ENG',
  bvb_brandt:'GER',bvb_guirassy:'GUI',bvb_beier:'GER',
  lev_hradecky:'FIN',lev_kovar:'CZE',lev_frimpong:'NED',lev_hincapie:'ECU',lev_tapsoba:'BFA',
  lev_xhaka:'SUI',lev_palacios:'ARG',lev_grimaldo:'ESP',lev_boniface:'NGA',lev_terrier:'FRA',
  rbl_gulacsi:'HUN',rbl_simakan:'FRA',rbl_orban:'HUN',rbl_raum:'GER',rbl_henrichs:'GER',
  rbl_kampl:'SVN',rbl_laimer:'AUT',rbl_szoboszlai_rbl:'HUN',rbl_nkunku:'FRA',rbl_openda:'BEL',rbl_sesko:'SVN',
  // ── LA LIGA ───────────────────────────────────────────────────
  rma_courtois:'BEL',rma_lunin:'UKR',rma_carvajal:'ESP',rma_militao:'BRA',rma_alaba:'AUT',rma_mendy:'FRA',
  rma_tchouameni:'FRA',rma_valverde:'URU',rma_kroos:'GER',rma_modric:'CRO',rma_camavinga:'FRA',
  rma_bellingham:'ENG',rma_vinicius:'BRA',rma_mbappe:'FRA',rma_rodrygo:'BRA',rma_brahim:'MAR',
  fcb_ter_stegen:'GER',fcb_araujo:'URU',fcb_christensen:'DEN',fcb_kounde:'FRA',fcb_balde:'ESP',
  fcb_de_jong:'NED',fcb_pedri:'ESP',fcb_gavi:'ESP',fcb_yamal:'ESP',fcb_raphinha:'BRA',fcb_lewandowski:'POL',
  fcb_ferran:'ESP',fcb_martinez:'ESP',
  atm_oblak:'SVN',atm_savic:'MNE',atm_gimenez:'URU',atm_hermoso:'ESP',atm_llorente:'ESP',
  atm_koke:'ESP',atm_witsel:'BEL',atm_griezmann:'FRA',atm_correa:'ARG',atm_morata:'ESP',
  // ── SERIE A ───────────────────────────────────────────────────
  int_sommer:'SUI',int_de_vrij:'NED',int_bastoni:'ITA',int_pavard:'FRA',int_darmian:'ITA',int_dumfries:'NED',
  int_calhanoglu:'TUR',int_barella:'ITA',int_mkhitaryan:'ARM',int_dimarco:'ITA',int_lautaro:'ARG',int_thuram:'FRA',
  juv_szczesny:'POL',juv_bremer:'BRA',juv_danilo:'BRA',juv_gatti:'ITA',juv_rabiot:'FRA',
  juv_locatelli:'ITA',juv_kostic:'SRB',juv_chiesa:'ITA',juv_vlahovic:'SRB',juv_yildiz:'GER',
  mil_maignan:'FRA',mil_kalulu:'FRA',mil_tomori:'ENG',mil_theo:'FRA',mil_bennacer:'ALG',
  mil_tonali_m:'ITA',mil_reijnders:'NED',mil_pulisic:'USA',mil_leao:'POR',mil_giroud:'FRA',mil_jovic:'SRB',
  nap_meret:'ITA',nap_di_lorenzo:'ITA',nap_kim_min:'KOR',nap_rrahmani:'KOS',nap_lobotka:'SVK',
  nap_anguissa:'CMR',nap_zielinski:'POL',nap_kvaratskhelia:'GEO',nap_osimhen:'NGA',nap_politano:'ITA',
  // ── LIGUE 1 ───────────────────────────────────────────────────
  psg_donnarumma:'ITA',psg_hakimi:'MAR',psg_marques:'FRA',psg_hernandez_l:'FRA',psg_nuno_mendes:'POR',
  psg_fabian:'ESP',psg_verratti:'ITA',psg_vitinha:'POR',psg_dembele:'FRA',psg_kolo_muani:'FRA',psg_barcola:'FRA',
  // ── EREDIVISIE ────────────────────────────────────────────────
  ajx_pasveer:'NED',ajx_rensch:'NED',ajx_sutalo:'CRO',ajx_hato:'NED',ajx_henderson:'ENG',
  ajx_klaassen:'NED',ajx_brobbey:'NED',ajx_godts:'BEL',ajx_taylor:'ENG',ajx_weghorst:'NED',
  psv_benitez:'URU',psv_teze:'FRA',psv_ramalho:'BRA',psv_boscagli:'FRA',psv_dest:'USA',
  psv_veerman:'NED',psv_van_ginkel:'NED',psv_lang:'BEL',psv_til:'NED',psv_bakayoko:'BEL',psv_de_jong_l:'NED',
  fey_bijlow:'NED',fey_geertruida:'NED',fey_trauner:'AUT',fey_hartman:'NED',fey_cook:'SCO',
  fey_wieffer:'NED',fey_stengs:'NED',fey_paixao:'POR',fey_gimenez:'MEX',fey_ueda:'JPN',
};

// League-based fallback nationality code. Kept under the legacy export name
// because multiple migrated screens still import it indirectly.
export const _LEAGUE_FLAG = {
  'Premier League':'ENG','Championship':'ENG','League One':'ENG','League Two':'ENG',
  'La Liga':'ESP','Bundesliga':'GER','Serie A':'ITA','Ligue 1':'FRA','Eredivisie':'NED',
};

export function playerNationality(player, teamLeague) {
  return _NAT[player.id] || _LEAGUE_FLAG[teamLeague] || 'INT';
}

// ─── Toast ───────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons  = { success: 'OK', error: 'X', info: 'i', warning: '!' };
  el.innerHTML = `<span class="toast-icon">${icons[type] ?? 'i'}</span><span>${msg}</span>`;
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
        <button class="modal-x" id="modal-x">×</button>
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
let _matchNavigationLocked = false;

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

export function setMatchNavigationLocked(locked) {
  _matchNavigationLocked = !!locked;
  document.documentElement.classList.toggle('match-navigation-locked', _matchNavigationLocked);
}

export async function navigateTo(id, { history: historyMode = 'push' } = {}) {
  id = canonicalScreen(id);
  if (_matchNavigationLocked && _active === 'match' && id !== 'match') {
    writeRoute('match', 'replace');
    return false;
  }
  if (!_screens.has(id) || _active === id) return;
  if (_active) {
    _screens.get(_active).el.classList.remove('active');
    document.querySelectorAll(`[data-nav="${_active}"]`).forEach(n => n.classList.remove('active'));
  }
  _active = id;
  document.documentElement.classList.toggle('match-route-active', id === 'match');
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
