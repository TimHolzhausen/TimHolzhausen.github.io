// Bluefy-Direktlink. Der Link wird ausschließlich hier gebaut, damit die Variante nach dem iPhone-Test
// an einer Stelle umgestellt werden kann (config.bluefyLinkVariant).
// Status: NICHT auf echtem iPhone verifiziert.

import { config, isAllowedAppUrl } from './config.js';

/**
 * @param {string} appUrl  vollständige HTTPS-Adresse
 * @param {'encoded'|'plain'} [variant]
 * @returns {string} bluefy://open?url=… oder '' bei ungültiger Adresse
 */
export function buildBluefyUrl(appUrl, variant = config.bluefyLinkVariant) {
  if (!isAllowedAppUrl(appUrl)) return '';
  const target = new URL(appUrl).href;
  return variant === 'plain'
    ? 'bluefy://open?url=' + target
    : 'bluefy://open?url=' + encodeURIComponent(target);
}
