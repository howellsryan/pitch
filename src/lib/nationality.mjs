const SUBDIVISIONS = {
  gbeng: 'ENG',
  gbsct: 'SCO',
  gbwls: 'WAL',
};

// Source feeds and older saves can contain country names or demonyms instead
// of generated flags. Keep common EA aliases equivalent to their flag codes.
const NATIONALITY_ALIASES = {
  england:'ENG', english:'ENG', scotland:'SCO', scottish:'SCO', wales:'WAL', welsh:'WAL',
  northernireland:'NIR', northernirish:'NIR', nireland:'NIR',
  ireland:'IE', irish:'IE', republicofireland:'IE',
  italy:'IT', italian:'IT', france:'FR', french:'FR', spain:'ES', spanish:'ES',
  germany:'DE', german:'DE', portugal:'PT', portuguese:'PT',
  netherlands:'NL', holland:'NL', dutch:'NL', belgium:'BE', belgian:'BE',
  brazil:'BR', brazilian:'BR', argentina:'AR', argentine:'AR', argentinian:'AR',
  uruguay:'UY', uruguayan:'UY', colombia:'CO', colombian:'CO',
  chile:'CL', chilean:'CL', ecuador:'EC', ecuadorian:'EC', peru:'PE', peruvian:'PE',
  paraguay:'PY', paraguayan:'PY', venezuela:'VE', venezuelan:'VE',
  unitedstates:'US', unitedstatesofamerica:'US', american:'US', usa:'US',
  canada:'CA', canadian:'CA', mexico:'MX', mexican:'MX',
  trinidadandtobago:'TT', trinidadtobago:'TT', trinidadian:'TT',
  jamaica:'JM', jamaican:'JM', barbados:'BB', barbadian:'BB',
  korea:'KR', korearepublic:'KR', southkorea:'KR', southkorean:'KR',
  china:'CN', chinapr:'CN', chinese:'CN', japan:'JP', japanese:'JP',
  australia:'AU', australian:'AU', newzealand:'NZ', newzealander:'NZ',
  congodr:'CD', drcongo:'CD', democraticrepublicofthecongo:'CD', congolese:'CD',
  capeverde:'CV', capeverdeislands:'CV', capeverdean:'CV',
  stlucia:'LC', saintlucia:'LC', saintlucian:'LC',
  uzbekistan:'UZ', uzbek:'UZ', indonesia:'ID', indonesian:'ID',
  mozambique:'MZ', mozambican:'MZ', uganda:'UG', ugandan:'UG',
  sweden:'SE', swedish:'SE', norway:'NO', norwegian:'NO', denmark:'DK', danish:'DK',
  finland:'FI', finnish:'FI', switzerland:'CH', swiss:'CH', austria:'AT', austrian:'AT',
  poland:'PL', polish:'PL', croatia:'HR', croatian:'HR', serbia:'RS', serbian:'RS',
  ukraine:'UA', ukrainian:'UA', turkey:'TR', turkish:'TR', russia:'RU', russian:'RU',
  ghana:'GH', ghanaian:'GH', nigeria:'NG', nigerian:'NG', senegal:'SN', senegalese:'SN',
  ivorycoast:'CI', cotedivoire:'CI', ivorian:'CI', cameroon:'CM', cameroonian:'CM',
  morocco:'MA', moroccan:'MA', algeria:'DZ', algerian:'DZ', egypt:'EG', egyptian:'EG',
};

export function nationalityCode(value) {
  const cps = Array.from(String(value ?? ''), (ch) => ch.codePointAt(0));

  const regionals = cps.filter((cp) => cp >= 0x1F1E6 && cp <= 0x1F1FF);
  if (regionals.length >= 2) {
    return String.fromCharCode(...regionals.slice(0, 2).map((cp) => 65 + cp - 0x1F1E6));
  }

  const tags = cps
    .filter((cp) => cp >= 0xE0061 && cp <= 0xE007A)
    .map((cp) => String.fromCharCode(97 + cp - 0xE0061))
    .join('');
  if (tags) return SUBDIVISIONS[tags] ?? tags.slice(-3).toUpperCase();

  const plain = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return NATIONALITY_ALIASES[plain.toLowerCase()] ?? (plain.slice(0, 3) || 'INT');
}

export function nationalityLabel(value) {
  const code = nationalityCode(value);
  if (code === 'ENG') return 'England';
  if (code === 'SCO') return 'Scotland';
  if (code === 'WAL') return 'Wales';
  return code;
}
