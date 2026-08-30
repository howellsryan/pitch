const SUBDIVISIONS = {
  gbeng: 'ENG',
  gbsct: 'SCO',
  gbwls: 'WAL',
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
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return plain.slice(0, 3) || 'INT';
}

export function nationalityLabel(value) {
  const code = nationalityCode(value);
  if (code === 'ENG') return 'England';
  if (code === 'SCO') return 'Scotland';
  if (code === 'WAL') return 'Wales';
  return code;
}
