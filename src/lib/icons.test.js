import { describe, expect, it } from 'vitest';
import { ICON_NAMES, iconSvg } from './icons.mjs';

describe('semantic icon SVG assets', () => {
  it('emits standalone SVG documents for every icon', () => {
    for (const name of ICON_NAMES) {
      const svg = iconSvg(name, { size: 24, label: `${name} icon` });
      expect(svg, name).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg, name).toContain('viewBox="0 0 24 24"');
    }
  });
});
