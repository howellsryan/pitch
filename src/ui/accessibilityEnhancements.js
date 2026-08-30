/*
 * Accessible-name bridge for controls that still live in older screen markup.
 *
 * Most screens are Svelte islands now, but a few range inputs pre-date the
 * shared field primitives and render without an associated label. The browser
 * audit caught them because a visual heading beside a slider is not an
 * accessible name. Keep the mapping explicit and idempotent while those
 * screens are migrated; component-local labels can replace these entries later.
 */

function setLabels(nodes, labels) {
  nodes.forEach((node, index) => {
    if (!node.hasAttribute('aria-label') && labels[index]) {
      node.setAttribute('aria-label', labels[index]);
    }
  });
}

export function applyAccessibleControlNames(root = document) {
  const transferRoot = root.querySelector?.('#screen-transfers') || document.querySelector('#screen-transfers');
  if (transferRoot) {
    const groups = transferRoot.querySelectorAll('.tr-adv-grid > div');
    if (groups[0]) setLabels([...groups[0].querySelectorAll('input[type="range"]')], ['Minimum age', 'Maximum age']);
    if (groups[1]) setLabels([...groups[1].querySelectorAll('input[type="range"]')], ['Minimum rating', 'Maximum rating']);

    const price = transferRoot.querySelector('.tr-adv-body > div > input[type="range"]');
    if (price && !price.hasAttribute('aria-label')) price.setAttribute('aria-label', 'Maximum transfer fee');
  }

  const academy = (root.querySelector?.('#screen-academy') || document.querySelector('#screen-academy'))
    ?.querySelector('.ac-invest-row input[type="range"]');
  if (academy && !academy.hasAttribute('aria-label')) academy.setAttribute('aria-label', 'Academy investment amount');
}

let scheduled = false;
function scheduleAccessibleNames() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyAccessibleControlNames();
  });
}

function startAccessibilityEnhancements() {
  applyAccessibleControlNames();
  const app = document.getElementById('app');
  if (app) {
    const observer = new MutationObserver(scheduleAccessibleNames);
    observer.observe(app, { childList: true, subtree: true });
  }
  window.addEventListener('pitch:navigation', scheduleAccessibleNames);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAccessibilityEnhancements, { once: true });
} else {
  startAccessibilityEnhancements();
}
