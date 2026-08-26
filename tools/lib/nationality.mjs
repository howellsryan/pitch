// tools/lib/nationality.mjs
// pitch's player CSVs store `nationality` as a plain demonym adjective
// ("Spanish", "English") - not a flag, not a country name. csv_to_league.py's
// generator turns that demonym into a flag emoji at JS-generation time via a
// NAT_FLAGS table (ported here as DEMONYM_TO_FLAG so the Node generator keeps
// producing the same output for leagues/players that already carry pitch's
// own nationality text).
//
// footy-sim's players.csv COUNTRY column is a country name ("Spain",
// "England"), not a demonym - reconcile.mjs needs to turn that into the same
// demonym convention pitch already uses, so a converted player's nationality
// column reads the same as a native one. COUNTRY_TO_DEMONYM does that
// conversion; unrecognised countries fall back to the country name itself
// (still meaningful text, just won't resolve to a flag from DEMONYM_TO_FLAG
// until someone adds it).

export const DEMONYM_TO_FLAG = {
  English: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Scottish: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Welsh: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Northern Irish': '🇬🇧',
  Irish: '🇮🇪', French: '🇫🇷', Spanish: '🇪🇸', German: '🇩🇪', Italian: '🇮🇹',
  Portuguese: '🇵🇹', Dutch: '🇳🇱', Belgian: '🇧🇪', Brazilian: '🇧🇷', Argentine: '🇦🇷',
  Colombian: '🇨🇴', Uruguayan: '🇺🇾', Chilean: '🇨🇱', Ecuadorian: '🇪🇨', Bolivian: '🇧🇴',
  Peruvian: '🇵🇪', Venezuelan: '🇻🇪', Paraguayan: '🇵🇾', Mexican: '🇲🇽', American: '🇺🇸',
  Canadian: '🇨🇦', Jamaican: '🇯🇲', Trinidadian: '🇹🇹', Barbadian: '🇧🇧',
  Ghanaian: '🇬🇭', Nigerian: '🇳🇬', Senegalese: '🇸🇳', Ivorian: '🇨🇮', Cameroonian: '🇨🇲',
  Congolese: '🇨🇩', Malian: '🇲🇱', Guinean: '🇬🇳', 'Sierra Leonean': '🇸🇱',
  Gambian: '🇬🇲', Zimbabwean: '🇿🇼', 'South African': '🇿🇦', Angolan: '🇦🇴',
  Mozambican: '🇲🇿', Ugandan: '🇺🇬', Kenyan: '🇰🇪', Tanzanian: '🇹🇿', Ethiopian: '🇪🇹',
  Egyptian: '🇪🇬', Moroccan: '🇲🇦', Tunisian: '🇹🇳', Algerian: '🇩🇿', Libyan: '🇱🇾',
  Polish: '🇵🇱', Czech: '🇨🇿', Slovak: '🇸🇰', Hungarian: '🇭🇺', Romanian: '🇷🇴',
  Bulgarian: '🇧🇬', Croatian: '🇭🇷', Serbian: '🇷🇸', Bosnian: '🇧🇦', Slovenian: '🇸🇮',
  Swedish: '🇸🇪', Norwegian: '🇳🇴', Danish: '🇩🇰', Finnish: '🇫🇮', Icelandic: '🇮🇸',
  Swiss: '🇨🇭', Austrian: '🇦🇹', Greek: '🇬🇷', Turkish: '🇹🇷', Russian: '🇷🇺',
  Ukrainian: '🇺🇦', Albanian: '🇦🇱', Macedonian: '🇲🇰', Montenegrin: '🇲🇪',
  Japanese: '🇯🇵', 'South Korean': '🇰🇷', Chinese: '🇨🇳', Australian: '🇦🇺',
  'New Zealander': '🇳🇿', Indonesian: '🇮🇩', Thai: '🇹🇭',
  'Cape Verdean': '🇨🇻', Luxembourger: '🇱🇺', Belarusian: '🇧🇾',
  Kosovan: '🇽🇰', Georgian: '🇬🇪', Armenian: '🇦🇲', Azerbaijani: '🇦🇿',
  Liberian: '🇱🇷', Burkinabe: '🇧🇫', Togolese: '🇹🇬',
  Dominican: '🇩🇴', Haitian: '🇭🇹', Cuban: '🇨🇺', 'Puerto Rican': '🇵🇷',
  // added for footy-sim coverage
  Afghan: '🇦🇫', Antiguan: '🇦🇬', Bermudian: '🇧🇲', 'Central African': '🇨🇫',
  Comoran: '🇰🇲', Curaçaoan: '🇨🇼', Cypriot: '🇨🇾', 'Bissau-Guinean': '🇬🇼',
  Guadeloupean: '🇬🇵', Guatemalan: '🇬🇹', Guyanese: '🇬🇾', Iraqi: '🇮🇶',
  Israeli: '🇮🇱', Lebanese: '🇱🇧', Lithuanian: '🇱🇹', Maltese: '🇲🇹',
  Montserratian: '🇲🇸', Namibian: '🇳🇦', Gibraltarian: '🇬🇮', Grenadian: '🇬🇩',
  Equatoguinean: '🇬🇶', Filipino: '🇵🇭', Saudi: '🇸🇦', 'Sri Lankan': '🇱🇰',
  'Saint Lucian': '🇱🇨', Surinamese: '🇸🇷', Estonian: '🇪🇪', Zambian: '🇿🇲',
};

export const COUNTRY_TO_DEMONYM = {
  Afghanistan: 'Afghan', Albania: 'Albanian', Algeria: 'Algerian', Angola: 'Angolan',
  'Antigua and Barbuda': 'Antiguan', Argentina: 'Argentine', Armenia: 'Armenian',
  Australia: 'Australian', Austria: 'Austrian', Belgium: 'Belgian', Bermuda: 'Bermudian',
  'Bosnia and Herzegovina': 'Bosnian', Brazil: 'Brazilian', Bulgaria: 'Bulgarian',
  'Burkina Faso': 'Burkinabe', Burundi: 'Burundian', Cameroon: 'Cameroonian',
  Canada: 'Canadian', 'Cape Verde': 'Cape Verdean', 'Central African Republic': 'Central African',
  Chile: 'Chilean', Colombia: 'Colombian', Comoros: 'Comoran', Congo: 'Congolese',
  Croatia: 'Croatian', Cuba: 'Cuban', Curaçao: 'Curaçaoan', Cyprus: 'Cypriot',
  'Czech Republic': 'Czech', "Côte d’Ivoire": 'Ivorian', "Côte d'Ivoire": 'Ivorian',
  'DR Congo': 'Congolese', Denmark: 'Danish', 'Dominican Republic': 'Dominican',
  Ecuador: 'Ecuadorian', Egypt: 'Egyptian', England: 'English',
  'Equatorial Guinea': 'Equatoguinean', Estonia: 'Estonian', Finland: 'Finnish',
  France: 'French', Gabon: 'Gabonese', Gambia: 'Gambian', Georgia: 'Georgian',
  Germany: 'German', Ghana: 'Ghanaian', Gibraltar: 'Gibraltarian', Greece: 'Greek',
  Grenada: 'Grenadian', Guadeloupe: 'Guadeloupean', Guatemala: 'Guatemalan',
  Guinea: 'Guinean', 'Guinea-Bissau': 'Bissau-Guinean', Guyana: 'Guyanese',
  Haiti: 'Haitian', Hungary: 'Hungarian', Iceland: 'Icelandic', Iraq: 'Iraqi',
  Ireland: 'Irish', Israel: 'Israeli', Italy: 'Italian', 'Ivory Coast': 'Ivorian',
  Jamaica: 'Jamaican', Japan: 'Japanese', Kenya: 'Kenyan', Kosovo: 'Kosovan',
  Lebanon: 'Lebanese', Liberia: 'Liberian', Lithuania: 'Lithuanian',
  Luxembourg: 'Luxembourger', Mali: 'Malian', Malta: 'Maltese', Mexico: 'Mexican',
  Montenegro: 'Montenegrin', Montserrat: 'Montserratian', Morocco: 'Moroccan',
  'N Ireland': 'Northern Irish', Namibia: 'Namibian', Netherlands: 'Dutch',
  'New Zealand': 'New Zealander', Nigeria: 'Nigerian', 'North Macedonia': 'Macedonian',
  'Northern Ireland': 'Northern Irish', Norway: 'Norwegian', Paraguay: 'Paraguayan',
  Philippines: 'Filipino', Poland: 'Polish', Portugal: 'Portuguese',
  'Republic of Ireland': 'Irish', Romania: 'Romanian', Russia: 'Russian',
  'Saudi Arabia': 'Saudi', Scotland: 'Scottish', Senegal: 'Senegalese',
  Serbia: 'Serbian', 'Sierra Leone': 'Sierra Leonean', Slovakia: 'Slovak',
  Slovenia: 'Slovenian', 'South Africa': 'South African', 'South Korea': 'South Korean',
  Spain: 'Spanish', 'Sri Lanka': 'Sri Lankan', 'St Lucia': 'Saint Lucian',
  Suriname: 'Surinamese', Sweden: 'Swedish', Switzerland: 'Swiss', Tanzania: 'Tanzanian',
  Thailand: 'Thai', Togo: 'Togolese', 'Trinidad & Tobago': 'Trinidadian',
  Tunisia: 'Tunisian', Turkey: 'Turkish', USA: 'American', Ukraine: 'Ukrainian',
  Uruguay: 'Uruguayan', Venezuela: 'Venezuelan', Wales: 'Welsh', Zambia: 'Zambian',
  Zimbabwe: 'Zimbabwean',
};

export function demonymForCountry(country) {
  const c = (country || '').trim();
  return COUNTRY_TO_DEMONYM[c] || c;
}

export function flagForDemonym(demonym) {
  return DEMONYM_TO_FLAG[demonym] || '🌍';
}
