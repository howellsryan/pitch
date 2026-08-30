import { getPlayersByTeam, getSave } from '../modules/db.js';
import { primaryRating } from '../modules/matchEngine.js';
import { acceptOffer, counterOffer, formAdjustedValue, rejectOffer } from '../modules/transfers.js';
import { getPotentialLabel, getPotentialStars } from '../modules/potential.js';
import { fmt, formLabel, posGroup, showModal, toast } from './helpers.js';
import { renderHome } from './home_transfers.js';
import { screenTicks } from '../lib/state/screens.svelte.js';

// Squad and Tactics screens moved to src/lib/ui/SquadScreen.svelte and
// src/lib/ui/SquadScreen.svelte (R4, docs/plan/07-redesign.md).
// openSquadPlayerModal used to survive here for the (not yet migrated)
// Transfers screen's desktop-width player-detail branch in home_transfers.js
// — Transfers is migrated now too (src/lib/ui/TransfersScreen.svelte), using
// its own bottom sheet on every viewport instead, so that caller is gone and
// this function went with it.

// ══════════════════════════════════════════════════════════════
// TRANSFER OFFERS — shown via modal from Transfers screen
// ══════════════════════════════════════════════════════════════
export async function showOffersModal() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);

  const offers  = (save.inboundOffers ?? []).filter(o => o.status === 'pending');
  const byId    = new Map(players.map(p => [p.id, p]));
  const listed  = players.filter(p => p.transferListed);

  const bodyHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:14px;max-height:70vh;overflow-y:auto;padding:4px">

      <div>
        <div style="font-family:var(--fd);font-size:16px;letter-spacing:1px;margin-bottom:14px">
          Inbound Offers <span style="font-size:13px;color:var(--tx2);font-family:var(--fb)">(${offers.length})</span>
        </div>
        ${offers.length ? offers.map(offer => {
          const pl = byId.get(offer.playerId);
          if (!pl) return '';
          const fav      = formAdjustedValue(pl);
          const pct      = Math.round((offer.fee / fav) * 100);
          const g        = posGroup(pl.position);
          const fl       = formLabel(pl);
          const isListed = pl.transferListed === true;
          return `<div class="offer-card-v2" data-offer-pid="${pl.id}">
            <div class="offer-card-top">
              <div class="offer-player-info">
                <div class="pl-av" style="background:var(--sur3);font-size:8px;font-family:var(--fm);font-weight:700;color:var(--tx2);letter-spacing:.5px">${posGroup(pl.position)}</div>
                <div>
                  <div style="font-weight:600;font-size:14px">${pl.name} ${isListed ? '<span class="listed-badge">LISTED</span>' : ''}</div>
                  <div style="font-size:11px;color:var(--tx2);display:flex;gap:6px;margin-top:2px;flex-wrap:wrap">
                    <span class="pos ${g}">${pl.position}</span>
                    <span>Age ${pl.age}</span>
                    <span class="fb ${fl.cls}">${fl.text}</span>
                    ${!isListed ? `<span style="color:var(--acc2);font-size:10px">Unsolicited bid</span>` : ''}
                  </div>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:10px;color:var(--tx2)">From</div>
                <div style="font-weight:700;font-size:14px">${offer.clubName}</div>
              </div>
            </div>
            <div class="offer-amounts">
              <div class="offer-amt-box" style="border-color:${pct>=100?'rgba(18,168,100,.4)':'rgba(232,72,85,.4)'}">
                <div class="offer-amt-lbl">Their Offer</div>
                <div class="offer-amt-val" style="color:${pct>=100?'var(--acc)':'var(--acc3)'}">${fmt.money(offer.fee)}</div>
                <div class="offer-amt-sub">${pct}% of form value</div>
              </div>
              <div class="offer-amt-box">
                <div class="offer-amt-lbl">Form Value</div>
                <div class="offer-amt-val">${fmt.money(fav)}</div>
                <div class="offer-amt-sub">Base: ${fmt.money(pl.value)}</div>
              </div>
              <div class="offer-amt-box">
                <div class="offer-amt-lbl">Min. Accept</div>
                <div class="offer-amt-val" style="color:var(--tx2)">${fmt.money(Math.round(fav * (isListed ? 0.88 : 1.05)))}</div>
                <div class="offer-amt-sub">${isListed ? 'Listed player' : 'Unlisted premium'}</div>
              </div>
            </div>
            <div class="offer-btns">
              <button class="btn btn-p" data-offer-accept="${pl.id}">Accept ${fmt.money(offer.fee)}</button>
              <button class="btn btn-s" data-offer-counter="${pl.id}" data-offer-fee="${offer.fee}" data-offer-fav="${fav}" data-offer-listed="${isListed?1:0}" data-offer-name="${pl.name}" data-offer-club="${offer.clubName}">Counter</button>
              <button class="btn btn-d" data-offer-reject="${pl.id}">Reject</button>
            </div>
          </div>`;
        }).join('') : `<div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:40px;text-align:center">
          <div style="font-family:var(--fd);font-size:20px;letter-spacing:1px;margin-bottom:6px">No Pending Offers</div>
          <div style="font-size:12px;color:var(--tx2)">AI clubs bid each gameweek. List players to attract more offers.</div>
        </div>`}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:16px">
          <div style="font-family:var(--fd);font-size:14px;letter-spacing:1px;margin-bottom:4px">Transfer Listed</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:12px">${listed.length} player${listed.length!==1?'s':''} available</div>
          ${listed.length ? listed.map(p => {
            const g = posGroup(p.position);
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr)">
              <span class="pos ${g}">${p.position}</span>
              <span style="flex:1;font-size:12px;font-weight:500">${p.name}</span>
              <span style="font-family:var(--fm);font-size:11px;color:var(--acc2)">${fmt.money(formAdjustedValue(p))}</span>
            </div>`;
          }).join('') : `<div style="font-size:12px;color:var(--txd)">No players listed. Go to Squad to list players.</div>`}
        </div>
        <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:16px">
          <div style="font-family:var(--fd);font-size:14px;letter-spacing:1px;margin-bottom:8px;color:var(--acc2)">Offer Rules</div>
          <div style="font-size:11px;color:var(--tx2);line-height:1.7">
            <div>• <strong>Listed players:</strong> AI offers from 85% of form value</div>
            <div>• <strong>Unlisted players:</strong> AI must offer 110%+ to tempt you</div>
            <div>• <strong>Form boost:</strong> goals/assists increase asking price</div>
            <div>• Offers arrive each gameweek automatically</div>
          </div>
        </div>
      </div>

    </div>`;

  const modal = showModal('Transfer Inbox', bodyHTML, [], { wide: true });

  // ── Button handlers inside modal ────────────────────────
  const bd = document.getElementById('modal-bd');
  if (!bd) return;

  bd.querySelectorAll('[data-offer-accept]').forEach(btn => {
    btn.onclick = async () => {
      try {
        btn.closest('.offer-card-v2')?.remove();
        const { fee, buyerName } = await acceptOffer(btn.dataset.offerAccept);
        toast(`Sold for ${fmt.money(fee)} to ${buyerName}!`, 'success', 5000);
        _updateOffersBadge();
        modal.close();
        screenTicks.transfers++;
        await renderHome();
      } catch(e) { toast(e.message, 'error', 4000); }
    };
  });
  bd.querySelectorAll('[data-offer-reject]').forEach(btn => {
    btn.onclick = async () => {
      btn.closest('.offer-card-v2')?.remove();
      await rejectOffer(btn.dataset.offerReject);
      toast('Offer rejected', 'info', 2000);
      _updateOffersBadge();
      // Check if any offers remain
      const remaining = bd.querySelectorAll('.offer-card-v2');
      if (!remaining.length) {
        modal.close();
        await showOffersModal();
      }
    };
  });
  bd.querySelectorAll('[data-offer-counter]').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.offerCounter;
      const theirFee = parseInt(btn.dataset.offerFee);
      const fav = parseInt(btn.dataset.offerFav);
      const isListed = btn.dataset.offerListed === '1';
      const pName = btn.dataset.offerName;
      const clubName = btn.dataset.offerClub;

      // Counter slider range: from their offer up to 2× form value
      const minAsk = theirFee;
      const maxAsk = Math.round(fav * 2.0);
      const defaultAsk = Math.round(fav * (isListed ? 1.05 : 1.15));

      const likelihoodText = (v) => {
        const ratio = v / theirFee;
        if (ratio <= 1.05) return { text: 'Almost certain — close to their offer', color: 'var(--acc)' };
        if (ratio <= 1.20) return { text: 'Good chance — reasonable ask', color: 'var(--acc)' };
        if (ratio <= 1.40) return { text: 'May negotiate — they\'ll try to meet halfway', color: 'var(--acc2)' };
        if (ratio <= 1.70) return { text: 'Ambitious — they might walk away', color: 'var(--acc3)' };
        return { text: 'Very unlikely — too far from their offer', color: 'var(--acc3)' };
      };

      showModal(`Counter ${clubName}`, `
        <div class="ctr">
          <div class="ctr-pl"><strong>${pName}</strong></div>
          <div class="ctr-row"><span>Their Offer</span><strong style="color:var(--tx2)">${fmt.money(theirFee)}</strong></div>
          <div class="ctr-row"><span>Form Value</span><strong>${fmt.money(fav)}</strong></div>
          <div style="margin:16px 0 8px;font-size:12px;font-weight:600;color:var(--tx)">Your Asking Price</div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="range" id="counter-slider" min="${minAsk}" max="${maxAsk}" value="${defaultAsk}" step="100000" style="flex:1">
            <div id="counter-val" style="font-family:var(--fd);font-size:18px;color:var(--acc2);min-width:80px;text-align:right">${fmt.money(defaultAsk)}</div>
          </div>
          <div id="counter-likelihood" style="font-size:11px;margin-top:6px;color:var(--acc)"></div>
        </div>`,
        [{id:'send',label:'Send Counter',cls:'btn-p',handler:async()=>{
          const askVal = Number(document.getElementById('counter-slider')?.value || defaultAsk);
          const result = await counterOffer(pid, askVal);

          if (result.outcome === 'accepted') {
            toast(`${result.clubName} agreed to ${fmt.money(result.fee)}!`, 'success', 4000);
            modal.close();
            await showOffersModal();
          } else if (result.outcome === 'counter') {
            toast(`${result.clubName} counter: ${fmt.money(result.fee)} (was ${fmt.money(result.originalFee)})`, 'info', 5000);
            modal.close();
            await showOffersModal();
          } else {
            toast(`${result.clubName ?? 'Club'} withdrew their interest`, 'error', 4000);
            _updateOffersBadge();
            modal.close();
            await showOffersModal();
          }
        }},{id:'x',label:'Cancel',cls:'btn-s'}]
      );

      // Wire up the slider live update
      const csl = document.getElementById('counter-slider');
      const cvl = document.getElementById('counter-val');
      const clh = document.getElementById('counter-likelihood');
      const updateCounterHint = () => {
        const v = Number(csl?.value || defaultAsk);
        if (cvl) cvl.textContent = fmt.money(v);
        if (clh) {
          const lk = likelihoodText(v);
          clh.textContent = lk.text;
          clh.style.color = lk.color;
        }
      };
      if (csl) { csl.oninput = updateCounterHint; updateCounterHint(); }
    };
  });
}

// Update the badge on the Offers button in the Transfers screen
export async function _updateOffersBadge() {
  const save  = await getSave();
  const count = (save.inboundOffers ?? []).filter(o => o.status === 'pending').length;
  const badge = document.getElementById('tt-offers-badge');
  const btn   = document.getElementById('tt-offers');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (btn) {
    btn.style.borderColor = count > 0 ? 'var(--acc2)' : 'var(--bdr)';
  }
}

// Keep old name as alias so nothing breaks if referenced elsewhere
export async function renderOffers() { await showOffersModal(); }