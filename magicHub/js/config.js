// Zentrale Konfiguration. Nur diese Werte muss der Entwickler anpassen (siehe README.md).

export const config = {
  appName: 'MagicHub',

  // Dauerhafte HTTPS-Adresse der App. Wird für den Bluefy-Direktlink und den Apple-Kurzbefehl benutzt.
  // GitHub Pages: Repo "TimHolzhausen.github.io", Ordner "magicHub".
  appUrl: 'https://timholzhausen.github.io/magicHub/',

  bluefyAppStoreUrl: 'https://apps.apple.com/de/app/bluefy-web-ble-browser/id1492822055',

  // Erst eintragen, nachdem der Kurzbefehl auf einem iPhone erstellt, getestet und per iCloud geteilt wurde.
  // Muss mit https://www.icloud.com/shortcuts/ beginnen. Leer = Button deaktiviert.
  shortcutIcloudUrl: '',

  // Welche Form des Bluefy-Links benutzt wird. Auf einem echten iPhone testen und dann festlegen:
  //   'encoded' → bluefy://open?url=https%3A%2F%2F...
  //   'plain'   → bluefy://open?url=https://...
  bluefyLinkVariant: 'encoded',
};

/** Prüft, ob eine Adresse eine erlaubte App-Adresse ist (HTTPS oder lokale Entwicklung). */
export function isAllowedAppUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/**
 * Adresse, die geteilt bzw. in Bluefy geöffnet wird.
 * Lokal (localhost) wird die aktuelle Adresse benutzt, damit sich der Ablauf am Rechner durchspielen lässt;
 * für geteilte Links und den Kurzbefehl gilt immer config.appUrl.
 */
export function resolvedAppUrl() {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (local) return location.origin + location.pathname.replace(/[^/]*$/, '');
  return isAllowedAppUrl(config.appUrl) ? config.appUrl : location.origin + location.pathname.replace(/[^/]*$/, '');
}

/** iCloud-Kurzbefehl-Link nur akzeptieren, wenn er wirklich auf icloud.com/shortcuts zeigt. */
export function shortcutUrl() {
  const v = (config.shortcutIcloudUrl || '').trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' && u.hostname === 'www.icloud.com' && u.pathname.startsWith('/shortcuts/')) return u.href;
  } catch { /* ungültig */ }
  console.warn('[config] shortcutIcloudUrl ist kein gültiger iCloud-Kurzbefehl-Link und wird ignoriert.');
  return '';
}
