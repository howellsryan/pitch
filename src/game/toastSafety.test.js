import { afterEach, expect, it, vi } from 'vitest';
import { toast } from '../ui/helpers.js';

afterEach(() => vi.unstubAllGlobals());

it('displays imported player names as text without interpreting their markup', () => {
  const created = [];
  const container = { appendChild:vi.fn() };
  vi.stubGlobal('document', {
    getElementById:() => container,
    createElement:tag => {
      const element = { tag, children:[], classList:{ add:vi.fn() }, appendChild(child) { this.children.push(child); } };
      Object.defineProperty(element, 'innerHTML', { set() { throw new Error('Untrusted toast HTML'); } });
      created.push(element);
      return element;
    },
  });
  vi.stubGlobal('requestAnimationFrame', callback => callback());
  vi.stubGlobal('setTimeout', vi.fn());
  const message = '<img src=x onerror="window.stolen=true"> signed';
  toast(message, 'success');
  expect(container.appendChild).toHaveBeenCalledOnce();
  expect(created.map(element => element.tag)).toEqual(['div', 'span', 'span']);
  expect(created[2].textContent).toBe(message);
});
