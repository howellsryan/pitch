/**
 * data/extraLeagues.js
 * Top clubs from La Liga, Bundesliga, Serie A, Ligue 1 (2025/26).
 * Compact squads of 14 players each.
 */
const xp = (id,nm,pos,age,atk,mid,def,gk,val,wage) => ({
  id,name:nm,position:pos,age,attack:atk,midfield:mid,defence:def,goalkeeping:gk,
  value:val*1_000_000,wage:wage*1_000,goals:0,assists:0,cleanSheets:0,form:50,
  injured:false,suspended:false,inSquad:true,fitness:100,
});

const EXTRA_LEAGUES_TEAMS = [
];

