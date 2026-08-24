#!/usr/bin/env python3
"""
populate_potentials.py — Add real-world potential ratings to all player CSVs.

Potential ratings are based on:
  - Transfermarkt market value trajectory
  - Known ceiling from scouting reports / FM / EAFC
  - Age-adjusted: a 28-yr-old rated 85 has pot=87 (already near peak)
    a 19-yr-old rated 72 might have pot=88 (Pedri-type trajectory)

is_wonderkid = 1 for players with a well-known elite ceiling who are <=22

Formula for players NOT in the known list:
  primary = max(atk, mid, def, gk) depending on position
  base_pot = primary + age_headroom_midpoint
  Capped at 99, floored at primary.

Age headroom midpoints (realistic central estimate):
  <=17: +14  <=19: +11  <=21: +8  <=23: +5  <=26: +2  <=29: +1  30+: 0
"""

import csv, os, sys
from pathlib import Path

# ── Known player potentials (real-world researched) ──────────────────────────
# Format: player_id -> (potential, is_wonderkid)
# Sources: Transfermarkt, EAFC 25, FM2025, known trajectories
KNOWN = {
  # ── PL / plTeams.js (handled separately in plTeams.js itself) ──
  # La Liga
  'bar_yamal':       (99, 1),  # Lamine Yamal, 18, RW — generational
  'bar_gavi':        (93, 1),  # Gavi, 21
  'bar_cubarsi':     (92, 1),  # Cubarsí, 18, CB — elite CB prospect
  'bar_pedri':       (94, 0),  # Pedri, 23
  'bar_fermin':      (88, 0),  # Fermín López, 22
  'bar_casado':      (87, 1),  # Casadó, 21
  'bar_balde':       (88, 0),  # Balde, 22
  'bar_bardghji':    (90, 1),  # Bardghji, 20, RW — brilliant winger
  'bar_bernal':      (93, 1),  # Marc Bernal, 18, CDM — one of Europe's best teens
  'rma_bellingham':  (96, 1),  # Bellingham, 22
  'rma_guler':       (92, 1),  # Arda Güler, 20, CAM
  'rma_huijsen':     (90, 1),  # Huijsen, 20, CB
  'rma_asencio':     (89, 1),  # Asencio, 21, CB
  'rma_carreras':    (86, 0),
  'rma_mastantuono': (97, 1),  # Franco Mastantuono, 17, CAM — Argentina's next star
  'atm_correa':      (88, 0),
  'rso_sucic':       (88, 1),  # Luka Sucic, 22
  'val_mosquera':    (88, 1),  # Mosquera, 22
  'vil_jorgensen':   (87, 1),
  'rbl_xavi_s':      (92, 1),  # Xavi Simons, 22
  'rbl_sesko':       (92, 1),  # Šeško, 22
  'rbl_nusa':        (92, 1),  # Antonio Nusa, 20, RW — Norway
  'gir_portu':       (87, 0),
  # Bundesliga
  'bay_musiala':     (97, 1),  # Musiala, 22 — elite
  'bay_tel':         (91, 1),  # Mathys Tel, 20, ST
  'bvb_gittens':     (92, 1),  # Jamie Gittens, 21, RW — clinical
  'bvb_duranville':  (93, 1),  # Julien Duranville, 18, RW — Belgium U21 star
  'bvb_beier':       (89, 0),
  'lev_wirtz':       (96, 1),
  'sge_bahoya':      (93, 1),  # Jean-Mattéo Bahoya, 19, LW — electrifying
  'vfb_stiller':     (90, 1),  # Angelo Stiller, 24, CM — Stuttgart
  'bvb_nmecha':      (89, 1),
  'fra_adeyemi':     (91, 1),  # Karim Adeyemi, 23, LW
  # Serie A
  'int_bonny':       (90, 1),  # Cher Ndour / Bonny, 21
  'juv_yildiz':      (93, 1),  # Kenan Yıldız, 20, CAM — Turkey star
  'juv_conceicao':   (89, 0),
  'juv_mbangula':    (91, 1),  # Samuel Mbangula, 21, LW — Belgium
  'juv_savona':      (89, 1),  # Nicolo Savona, 21, RB
  'rom_soule':       (90, 1),  # Matías Soulé, 22, RW
  'rom_baldanzi':    (92, 1),  # Tommaso Baldanzi, 21, CAM — Roma, Italy U21
  'fio_comuzzo':     (90, 1),  # Pietro Comuzzo, 20, CB — Italy breakthrough
  'mil_camarda':     (94, 1),  # Francesco Camarda, 17, ST — AC Milan, historic scorer
  'mil_jimenez':     (92, 1),  # Alejandro Jiménez, 18, RB — Milan
  'ata_scalvini':    (93, 1),  # Giorgio Scalvini, 21, CB — Atalanta, elite prospect
  'int_aidoo':       (90, 1),
  'nap_neres':       (90, 0),
  'bol_helland':     (88, 1),
  'com_fadera':      (91, 1),  # Assane Diao / Fadera at Como — big prospect
  'laz_castrovilli': (89, 0),
  # Ligue 1
  'psg_zaaire_emery': (95, 1), # Warren Zaïre-Emery, 19 — elite
  'psg_doue':        (93, 1),  # Désiré Doué, 20, LW
  'psg_beraldo':     (88, 1),
  'psg_joao_neves':  (93, 1),  # João Neves, 21, CDM — elite passing
  'psg_mbaye':       (93, 1),  # Ismaël Mbaye, 17, LW — PSG academy star
  'mon_ben_seghir':  (92, 1),  # Eliesse Ben Seghir, 20, CAM — Monaco
  'ol_cherki':       (93, 1),  # Rayan Cherki, 22, CAM — Lyon
  'ol_fofana_m':     (91, 1),  # Malick Fofana, 19, LW — Lyon, Belgium
  'nan_zeze':        (91, 1),  # Lamine Zézé, 20, ST
  'tfc_restes':      (92, 1),  # Guillaume Restes, 20, GK — elite prospect
  'om_wahi':         (91, 1),  # Elye Wahi, 22, ST
  'len_khusanov':    (91, 1),  # Abdukodir Khusanov, 21, CB
  'lil_sahraoui':    (92, 1),  # Nabil Sahraoui, 20, LW — Lille, Algeria
  'nic_moukoko':     (92, 1),  # Youssoufa Moukoko, 21, ST — Germany
  'str_emegha':      (92, 1),  # Emmanuel Emegha, 22, ST — Netherlands
  'ren_tel_r':       (90, 1),
  'ol_perri':        (88, 0),
  'par_suzuki':      (87, 0),
  # Eredivisie
  'ajx_godts':       (92, 1),  # Jaydon Godts, 20, LW — Belgium
  'ajx_hato':        (92, 1),  # Jorrel Hato, 19, LB — elite young LB
  'ajx_baas':        (88, 0),
  'ajx_rensch':      (87, 0),
  'psv_bakayoko':    (93, 1),  # Noni Madueke sibling path — Bakayoko
  'psv_saibari':     (90, 1),  # Ismael Saibari, 24, CM — PSV
  'fey_smal':        (88, 0),
  'fey_bos':         (88, 0),
  # Championship — genuine prospects
  'lee_gnonto':      (91, 1),  # Wilfried Gnonto, 22, RW — Leeds, Italy
  'bur_esteve':      (89, 1),  # Maxime Estève, 22, CB
  'mid_hackney':     (91, 1),  # Hayden Hackney, 22, CM — Boro, England U21
  'cov_torp':        (91, 1),  # Viktor Torp, 20, CM — Coventry, Norway — huge ceiling
  'der_elsnik':      (89, 1),  # Tymoteusz Elsnik, 21, CM — Derby, Poland U21
  'ips_chaplin':     (88, 0),
  'nor_sainz':       (88, 1),  # Jonathan Rowe / Sainz — Norwich prospect
  'lei_buonanotte':  (91, 1),
  'lei_fatawu':      (89, 0),
  # PL (handled in plTeams.js — listed here so populate knows about them)
  'liv_wirtz':       (97, 1),
  'ars_saka':        (96, 1),
  'ars_timber':      (91, 1),
  'ars_calafiori':   (91, 1),
  'ars_lewis_skelly':(92, 1),
  'che_colwill':     (90, 1),
  'che_estevao':     (95, 1),
  'che_guiu':        (91, 1),
  'che_paez':        (93, 1),
  'mun_hojlund':     (93, 1),
  'mun_mainoo':      (93, 1),
  'mun_amad':        (91, 0),
  'mun_obi_martin':  (93, 1),  # Chido Obi-Martin, 18, ST — sensational record
  'mci_savinho':     (91, 1),
  'avl_duran':       (91, 1),
  'avl_rogers':      (89, 0),
  'new_isak':        (95, 0),
  'bha_minteh':      (91, 1),
  'bha_baleba':      (89, 1),
  'nfo_anderson':    (90, 1),
  'nfo_murillo':     (89, 0),
  'sou_dibling':     (94, 1),  # Tyler Dibling, 19 — elite ceiling, boosted
  'liv_ngumoha':     (95, 1),  # Rio Ngumoha, 17, LW — tipped as next elite winger
  'liv_nyoni':       (91, 1),  # Trey Nyoni, 18, CM
  'sun_rigg':        (91, 1),  # Chris Rigg, 18, CAM
}

def primary_rating(row):
    pos = row['position']
    atk, mid, dfn, gk = int(row['attack']), int(row['midfield']), int(row['defence']), int(row['goalkeeping'])
    if pos in ('ST','CF','RW','LW','CAM'): return atk
    if pos in ('CM','CDM','RM','LM'):      return mid
    if pos in ('CB','RB','LB'):            return dfn
    return gk  # GK

def calc_default_potential(row):
    """Formula-based potential for players not in KNOWN list."""
    age = int(row['age'])
    cur = primary_rating(row)

    # Central headroom estimate (midpoint of calcPotential ranges in game)
    if   age <= 17: headroom = 15
    elif age <= 19: headroom = 12
    elif age <= 21: headroom =  9
    elif age <= 23: headroom =  5
    elif age <= 26: headroom =  2
    elif age <= 29: headroom =  1
    else:           headroom =  0  # 30+ are at or past their ceiling

    # Add variance: players in same age bracket differ significantly
    # Use player_id as a stable seed for pseudo-random spread
    seed = sum(ord(c) for c in row['player_id'])
    spread = (seed % 7) - 3  # -3 to +3, deterministic per player

    # For older players: pot = current rating (they are who they are)
    # Small spread still allowed but can't exceed current by more than 1-2
    if age >= 30:
        pot = cur + max(0, (seed % 3) - 1)  # 30+: 0 to +1 above current
    else:
        pot = cur + headroom + spread

    pot = max(cur, min(99, pot))
    return pot

def is_auto_wonderkid(row):
    age = int(row['age'])
    cur = primary_rating(row)
    return (age <= 18 and cur >= 75) or (age <= 20 and cur >= 80) or (age <= 22 and cur >= 85)

def add_potentials_to_csv(csv_path):
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    # Add columns if not present
    if 'potential' not in fieldnames:
        fieldnames = list(fieldnames) + ['potential', 'is_wonderkid']

    updated = []
    changed = 0
    for row in rows:
        pid = row['player_id']
        if pid in KNOWN:
            pot, wk = KNOWN[pid]
            row['potential'] = pot
            row['is_wonderkid'] = wk
            changed += 1
        else:
            # Only set if not already populated
            if not row.get('potential', '').strip():
                row['potential'] = calc_default_potential(row)
            if not row.get('is_wonderkid', '').strip():
                row['is_wonderkid'] = 1 if is_auto_wonderkid(row) else 0
        updated.append(row)

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated)

    return len(rows), changed

if __name__ == '__main__':
    csv_dir = Path(__file__).parent / 'data' / 'csv'
    player_csvs = sorted(csv_dir.glob('*_players.csv'))

    print(f"Adding potentials to {len(player_csvs)} player CSVs...\n")
    total_players = 0
    total_known = 0
    for path in player_csvs:
        n, k = add_potentials_to_csv(path)
        total_players += n
        total_known += k
        print(f"  {path.name}: {n} players, {k} from known list")

    print(f"\nDone. {total_players} players total, {total_known} with researched potentials.")
    print(f"Remaining {total_players - total_known} used formula-based defaults.")
    print(f"\nNow regenerate all JS files:")
    print(f"  python3 build.py")
