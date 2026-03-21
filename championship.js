/**
 * data/championship.js
 * EFL Championship 2025/26 — 24 clubs used for relegation/promotion.
 * When a PL team is relegated they move here; top 3 Championship get promoted.
 * UCL: PL top 4. UEL: 5th+6th. UECL: 7th.
 */
const cp = (id,nm,pos,age,atk,mid,def,gk,val,wage) => ({
  id,name:nm,position:pos,age,attack:atk,midfield:mid,defence:def,goalkeeping:gk,
  value:val*1_000_000,wage:wage*1_000,goals:0,assists:0,cleanSheets:0,form:50,
  injured:false,suspended:false,inSquad:true,fitness:100,
});

const CHAMPIONSHIP_TEAMS = [
  {id:'leeds_utd',name:'Leeds United',shortName:'LEE',crest:'🟡',league:'Championship',stadium:'Elland Road',stadiumCapacity:37792,budget:15_000_000,reputation:72,players:[
    cp('lee_meslier','I. Meslier','GK',24,10,10,14,78,12,28),cp('lee_firpo','J. Firpo','LB',28,64,60,73,10,8,32),
    cp('lee_cooper','L. Cooper','CB',33,41,47,75,10,5,28),cp('lee_rodon','J. Rodon','CB',27,43,49,79,10,18,42),
    cp('lee_ayling','L. Ayling','RB',34,60,57,73,10,4,28),cp('lee_adams','T. Adams','CDM',28,57,73,65,10,14,38),
    cp('lee_roca','M. Roca','CM',25,61,73,61,10,10,28),cp('lee_james_d','D. James','RW',28,78,67,51,10,22,52),
    cp('lee_gnonto','W. Gnonto','LW',21,74,65,49,10,20,35),cp('lee_gelhardt','J. Gelhardt','ST',23,72,59,41,10,10,25),
    cp('lee_bamford','P. Bamford','ST',31,74,59,41,10,8,38),cp('lee_struijk','P. Struijk','CM',25,56,71,67,10,12,32),
    cp('lee_kristensen','R. Kristensen','RB',27,63,59,71,10,10,28),cp('lee_Sinisterra','L. Sinisterra','LW',25,74,65,49,10,14,35),
  ]},
  {id:'sheffield_utd',name:'Sheffield United',shortName:'SHU',crest:'🔴',league:'Championship',stadium:'Bramall Lane',stadiumCapacity:32050,budget:12_000_000,reputation:68,players:[
    cp('shu_foderingham','W. Foderingham','GK',33,10,10,12,75,4,25),cp('shu_baldock','G. Baldock','RB',32,59,57,71,10,5,22),
    cp('shu_basham','C. Basham','CB',35,40,47,75,10,4,22),cp('shu_egan','J. Egan','CB',32,41,49,75,10,5,25),
    cp('shu_lowe','M. Lowe','LB',29,60,57,71,10,6,22),cp('shu_norwood','O. Norwood','CDM',34,52,71,63,10,4,22),
    cp('shu_souza','V. Souza','CM',28,59,71,61,10,8,22),cp('shu_osborn','B. Osborn','LM',30,65,67,55,10,5,22),
    cp('shu_mcateer','C. McAtee','CAM',22,67,69,53,10,8,20),cp('shu_archer','C. Archer','ST',23,73,57,39,10,14,22),
    cp('shu_mcburnie','O. McBurnie','ST',28,71,57,39,10,6,28),cp('shu_doyle','T. Doyle','CM',22,59,69,57,10,10,22),
    cp('shu_brownhill','J. Brownhill','CM',28,62,71,61,10,6,22),cp('shu_rak-sakyi','J. Rak-Sakyi','RW',22,68,61,47,10,8,18),
  ]},
  {id:'burnley',name:'Burnley',shortName:'BUR',crest:'🟣',league:'Championship',stadium:'Turf Moor',stadiumCapacity:21944,budget:11_000_000,reputation:67,players:[
    cp('bur_flaherty','J. Flaherty','GK',27,10,10,12,74,3,18),cp('bur_roberts','C. Roberts','RB',28,62,59,71,10,6,22),
    cp('bur_beyer','J. Beyer','CB',25,43,49,77,10,8,22),cp('bur_harwood-bellis','T. Harwood-Bellis','CB',23,41,48,75,10,10,25),
    cp('bur_taylor','C. Taylor','LB',30,59,57,71,10,7,22),cp('bur_brownhill2','J. Brownhill','CDM',28,57,71,63,10,6,22),
    cp('bur_cullen','J. Cullen','CM',28,57,69,63,10,8,22),cp('bur_rodriguez','J. Rodriguez','RW',33,69,63,51,10,6,25),
    cp('bur_tella','N. Tella','LW',25,72,63,49,10,12,28),cp('bur_barnes','A. Barnes','ST',30,71,57,41,10,6,28),
    cp('bur_foster','B. Foster','GK',41,10,10,14,74,2,18),cp('bur_mcbride','C. McBride','ST',21,68,53,37,10,6,15),
    cp('bur_maatsen','I. Maatsen','LB',23,67,63,73,10,22,32),cp('bur_cornet','M. Cornet','LW',28,71,63,49,10,8,28),
  ]},
  {id:'norwich_city',name:'Norwich City',shortName:'NOR',crest:'🟡🟢',league:'Championship',stadium:'Carrow Road',stadiumCapacity:27359,budget:10_000_000,reputation:66,players:[
    cp('nor_krul','T. Krul','GK',36,10,10,14,76,4,22),cp('nor_aarons','M. Aarons','RB',25,65,61,73,10,12,28),
    cp('nor_omobamidele2','A. Omobamidele','CB',22,41,47,75,10,8,22),cp('nor_zimmermann','C. Zimmermann','CB',32,41,47,75,10,5,22),
    cp('nor_giannoulis','D. Giannoulis','LB',28,60,57,71,10,6,22),cp('nor_gilmour2','B. Gilmour','CM',24,59,77,61,10,20,38),
    cp('nor_sargent','J. Sargent','ST',24,71,57,39,10,14,28),cp('nor_pukki','T. Pukki','ST',35,70,55,37,10,4,28),
    cp('nor_rashica','M. Rashica','RW',28,69,63,49,10,6,22),cp('nor_normann','M. Normann','CM',29,59,69,59,10,7,22),
    cp('nor_byram','S. Byram','RB',30,61,57,71,10,5,22),cp('nor_dowell','K. Dowell','CAM',27,67,69,55,10,8,22),
    cp('nor_gunn','A. Gunn','GK',29,10,10,14,77,6,22),cp('nor_hernandez','O. Hernández','LW',27,68,63,49,10,8,22),
  ]},
  {id:'middlesbrough',name:'Middlesbrough',shortName:'MID',crest:'🔴',league:'Championship',stadium:'Riverside Stadium',stadiumCapacity:34742,budget:10_000_000,reputation:64,players:[
    cp('mid_flaherty2','J. Flaherty','GK',27,10,10,12,73,3,18),cp('mid_jones','J. Jones','RB',25,61,57,71,10,5,18),
    cp('mid_friend','G. Friend','CB',35,39,47,73,10,3,18),cp('mid_dael-fry','D. Fry','CB',26,41,49,75,10,6,18),
    cp('mid_giles','R. Giles','LB',24,59,57,71,10,5,18),cp('mid_howson','J. Howson','CDM',35,52,69,63,10,4,22),
    cp('mid_hackney','H. Hackney','CM',23,61,69,59,10,8,18),cp('mid_crooks','M. Crooks','CM',30,57,67,59,10,5,18),
    cp('mid_giles2','R. Giles','LW',24,67,61,49,10,5,18),cp('mid_akpom','C. Akpom','ST',29,73,57,39,10,10,25),
    cp('mid_muniz2','C. Muniz','ST',24,73,53,37,10,14,28),cp('mid_forss','M. Forss','ST',26,67,53,37,10,6,18),
    cp('mid_mcnair','P. McNair','CM',29,63,67,61,10,6,22),cp('mid_tavernier2','M. Tavernier','CAM',25,70,73,51,10,14,35),
  ]},
  {id:'cardiff_city',name:'Cardiff City',shortName:'CAR',crest:'🔵',league:'Championship',stadium:'Cardiff City Stadium',stadiumCapacity:33280,budget:8_000_000,reputation:62,players:[
    cp('car_flaherty3','J. Flaherty','GK',27,10,10,12,72,2,15),cp('car_hill','J. Hill','RB',22,59,55,69,10,5,15),
    cp('car_mcguinness','M. McGuinness','CB',23,39,45,73,10,4,15),cp('car_ng','Perry Ng','RB',28,60,57,71,10,5,18),
    cp('car_pack','M. Pack','CDM',32,52,67,61,10,4,18),cp('car_robertson','C. Robertson','CM',29,57,65,57,10,4,18),
    cp('car_colwill2','R. Colwill','CM',22,64,67,59,10,8,18),cp('car_harris','M. Harris','LW',28,65,61,49,10,5,18),
    cp('car_davies','I. Davies','RW',25,63,59,47,10,5,15),cp('car_wheatley','R. Wheatley','ST',23,67,53,37,10,6,18),
    cp('car_meite','Y. Meite','ST',28,68,53,37,10,5,18),cp('car_sherif','Y. Sherif','ST',24,65,53,37,10,4,15),
    cp('car_bagan','J. Bagan','LB',25,57,55,69,10,4,15),cp('car_mark-mcguinness','M. McGuinness2','CB',23,39,45,73,10,4,15),
  ]},
];
