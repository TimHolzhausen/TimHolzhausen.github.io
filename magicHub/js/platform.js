// Plattform-Hinweis nur für die passende Anleitung – kein Sicherheitsmerkmal.
// Entscheidend für die App selbst ist immer die Feature-Erkennung hasWebBluetooth().

const OVERRIDE_KEY = 'magichub_platform';

export function hasWebBluetooth() {
  return typeof navigator !== 'undefined' &&
    typeof navigator.bluetooth?.requestDevice === 'function';
}

/** @returns {'ios'|'android'|'desktop'} */
export function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS meldet sich oft als Mac – Touchpunkte verraten es meist.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function getPlatform() {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    if (v === 'ios' || v === 'android' || v === 'desktop') return v;
  } catch { /* privater Modus */ }
  return detectPlatform();
}

export function setPlatformOverride(value) {
  try {
    if (value) localStorage.setItem(OVERRIDE_KEY, value);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* egal */ }
}

/** Nur als Info-Anzeige; Bluefy wird nicht anhand des User-Agents erkannt, sondern über hasWebBluetooth(). */
export function looksLikeBluefy() {
  return /Bluefy/i.test(navigator.userAgent || '');
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}
