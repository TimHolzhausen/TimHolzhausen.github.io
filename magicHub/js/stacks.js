// Gängige Karten-Stacks für die Zuordnung Nummer ↔ Karte in Kombis.
// Karten-Codes: Wert (A,2–10,J,Q,K) + Farbe (C=Kreuz, H=Herz, S=Pik, D=Karo).

const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Zyklischer Stack (Si Stebbins, Eight Kings): Werte- und Farbfolge laufen getrennt durch. */
function cyclic(valueSeq, suitSeq) {
  return Array.from({ length: 52 }, (_, i) => valueSeq[i % 13] + suitSeq[i % 4]);
}

export const STACKS = {
  mnemonica: {
    label: 'Mnemonica (Tamariz)',
    cards: ('4C 2H 7D 3C 4H 6D AS 5H 9S 2S QH 3D QC 8H 6S 5S 9H KC 2D JH 3S 8S 6H 10C 5D KD ' +
      '2C 3H 8D 5C KS JD 8C 10S KH JC 7S 10H AD 4S 7H 4D AC 9C JS QD 7C QS 10D 6C AH 9D').split(' '),
  },
  aronson: {
    label: 'Aronson',
    cards: ('JS KC 5C 2H 9S AS 3H 6C 8D AC 10S 5H 2D KD 7D 8C 3S AD 7S 5S QD AH 8S 3D 7H QH ' +
      '5D 7C 4H KH 4D 10D JC JH 10C JD 4S 10H 6H 3C 2S 9H KS 6S 4C 8H 9C QS 6D QC 2C 9D').split(' '),
  },
  stebbins: {
    label: 'Si Stebbins (+3, CHSD, ab Kreuz-Ass)',
    cards: cyclic(Array.from({ length: 13 }, (_, i) => VALUES[(i * 3) % 13]), ['C', 'H', 'S', 'D']),
  },
  eightkings: {
    label: 'Eight Kings (CHSD, ab Kreuz-Acht)',
    cards: cyclic(['8', 'K', '3', '10', '2', '7', '9', '5', 'Q', '4', 'A', '6', 'J'], ['C', 'H', 'S', 'D']),
  },
  ndo: {
    label: 'Neue Packung (Bicycle: ♥A–K, ♣A–K, ♦K–A, ♠K–A)',
    cards: [
      ...VALUES.map((v) => v + 'H'), ...VALUES.map((v) => v + 'C'),
      ...[...VALUES].reverse().map((v) => v + 'D'), ...[...VALUES].reverse().map((v) => v + 'S'),
    ],
  },
};

const DE_SUIT = { C: 'Kreuz', H: 'Herz', S: 'Pik', D: 'Karo' };
const DE_VALUE = { A: 'Ass', J: 'Bube', Q: 'Dame', K: 'König' };
const DE_SHORT = { A: 'A', J: 'B', Q: 'D', K: 'K' };
const DE_SUIT_SHORT = { C: 'Kr', H: 'H', S: 'P', D: 'Ka' };
const EN_SUIT = { C: 'Clubs', H: 'Hearts', S: 'Spades', D: 'Diamonds' };
const EN_VALUE = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten' };
const SYM = { C: '♣', H: '♥', S: '♠', D: '♦' };

export const CARD_FORMATS = {
  de: { label: 'Deutsch („Herz Dame“)', fmt: (v, s) => DE_SUIT[s] + ' ' + (DE_VALUE[v] || v) },
  deShort: { label: 'Kurz deutsch („HD“, „Kr10“, „KaK“)', fmt: (v, s) => DE_SUIT_SHORT[s] + (DE_SHORT[v] || v) },
  symbol: { label: 'Symbol („D♥“) – PeekSmith zeigt „DH“', fmt: (v, s) => (DE_SHORT[v] || v) + SYM[s] },
  en: { label: 'Englisch („Queen of Hearts“)', fmt: (v, s) => EN_VALUE[v] + ' of ' + EN_SUIT[s] },
  code: { label: 'Code („QH“)', fmt: (v, s) => v + s },
};

const split = (code) => [code.slice(0, -1), code.slice(-1)];

export function cardName(code, format = 'de') {
  const [v, s] = split(code);
  return (CARD_FORMATS[format] || CARD_FORMATS.de).fmt(v, s);
}

/** Alle gängigen Schreibweisen einer Karte (für Karte → Nummer). Kommas sind in Schlüsseln nicht erlaubt. */
function allNames(code) {
  const [v, s] = split(code);
  const names = new Set([code, cardName(code, 'de'), cardName(code, 'deShort'), cardName(code, 'symbol'), cardName(code, 'en'),
    (DE_VALUE[v] || v) + ' ' + DE_SUIT[s], (DE_SHORT[v] || v) + DE_SUIT_SHORT[s], v + SYM[s]]);
  return [...names];
}

/**
 * Zuordnungstext für das Kombi-Feld „Zuordnung“.
 * direction 'num2card': „1=Kreuz Vier“ … · 'card2num': „Kreuz Vier,4C,…=1“ …
 */
export function stackMapText(stackId, { format = 'de', direction = 'num2card' } = {}) {
  const st = STACKS[stackId];
  if (!st) return '';
  return st.cards.map((code, i) => (direction === 'card2num'
    ? allNames(code).join(',') + '=' + (i + 1)
    : (i + 1) + '=' + cardName(code, format))).join('\n');
}

// ---------------------------------------------------------------- Karte erkennen / ACAAN

/**
 * Gezeichnete Farbsymbole kommen je nach Erkennung als Umriss, Emoji oder Ersatzzeichen zurück
 * (❤ ♡ 💜 ◇ ◊ ♤ ♧ …) → einheitlich ♥ ♦ ♠ ♣. Gilt app-weit (Erkennung, Zuordnung, Bedingungen).
 */
export function normalizeSuitSymbols(s) {
  return String(s ?? '')
    .replace(/[♡❤❥💗💓💕💖💘💙💚💛💜🖤🤍♥]️?/gu, '♥').replace(/[♢◇◆◊⬦⬥🔶🔷♦]️?/gu, '♦')
    .replace(/[♤♠]️?/gu, '♠').replace(/[♧♣]️?/gu, '♣');
}

const normName = (s) => normalizeSuitSymbols(s).toLowerCase()
  .replace(/[-_.:]/g, ' ').replace(/\s+/g, ' ').trim();
let cardIndex = null;

/** Text („Herz Dame“, „Dame Herz“, „HD“, „QH“, „Queen of Hearts“, „D♥“ …) → Karten-Code oder null. */
export function parseCard(text) {
  if (!cardIndex) {
    cardIndex = new Map();
    for (const v of VALUES) {
      for (const s of ['C', 'H', 'S', 'D']) {
        for (const n of allNames(v + s)) {
          const k = normName(n);
          cardIndex.set(k, v + s);
          cardIndex.set(k.replace(/ /g, ''), v + s);
        }
      }
    }
  }
  const t = normName(text);
  if (!t) return null;
  // Typische Lesefehler der Handschrift-Erkennung: „1o“/„lo“/„l0“ statt „10“, „o“ statt „0“.
  const variants = [t, t.replace(/(^|\s)[1li|][o0](?=\s|$|[a-zäö♥♦♠♣])/g, '$110'), t.replace(/o/g, '0')];
  for (const v of variants) {
    const hit = cardIndex.get(v) || cardIndex.get(v.replace(/ /g, ''));
    if (hit) return hit;
  }
  return null;
}

/**
 * Any Card at Any Number: Wie muss abgehoben werden, damit `code` an Position `target` (1 = oben) liegt?
 * Abheben = k Karten von oben unter das Spiel (bzw. 52 − k von unten nach oben – je nachdem, was weniger ist).
 * Ergebnis: { position, target, k, fromTop, count, topCard } – topCard liegt nach dem Abheben oben.
 */
export function acaanCut(stackId, code, target) {
  const st = STACKS[stackId];
  if (!st || !code) return null;
  const n = st.cards.length;
  const p = st.cards.indexOf(code) + 1;
  const t = Math.round(Number(target));
  if (!p || !(t >= 1 && t <= n)) return null;
  const k = (((p - t) % n) + n) % n;
  const fromTop = k <= n / 2;
  return { position: p, target: t, k, fromTop, count: fromTop ? k : n - k, topCard: st.cards[k] };
}

export function acaanText(cut) {
  if (!cut) return '?';
  if (!cut.count) return 'passt';
  return cut.count + (cut.fromTop ? ' von oben' : ' von unten');
}
