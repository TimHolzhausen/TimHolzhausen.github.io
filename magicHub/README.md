# MagicHub

Web-App, die Zauber-Gadgets per **Web Bluetooth** verbindet und frei **kombiniert** – ein Link für Android und iPhone.

**Live:** <https://timholzhausen.github.io/magicHub/>

| Eingaben | Ausgaben |
| --- | --- |
| GoDice (mehrere Würfel, Summe/Einzelwerte) | PeekSmith One/2/3 (Text, Helligkeit) |
| Davinci-Palette (5 Farbtöpfe) | Selfie Screen (Text, Zeichnung, Foto als JPEG) |
| Ultra Sharpie / Ultra Pen (Zeichnung) | Peripage P21 (quer/hochkant, Schrift, Ränder, Kopien …) |
| Erkennung der Zeichnung: **kostenlos** (Google Handschrift, Tesseract) oder per Key (Claude, OpenAI, Gemini, Google Vision), lokal | Sprachausgabe (Handy) |
| Inject (Web-Abfrage), eigene JSON-URL | Vibration (Handy, nicht iPhone), **an Inject senden** |
| PeekSmith- und Selfie-Tasten (Auslöser) | |

Eine **Kombi** ist eine Regel: **Auslöser** (Eingabe) → **Bedingung** (immer, „ist genau“, „enthält“,
Zahlenbereich, gerade/ungerade) → **Inhalt** (Wert, letzter Inhalt oder eigener Text, mit Zuordnung
`3=Karo Drei` und Vorlage `Karte: {text}`) → beliebig viele **Aktionen** (anzeigen/leeren, Verzögerung,
nach x s ausblenden). Dazu Sperrzeit, „nur neue Werte“, „nur einmal“ und ein Testknopf.

**Karten-Stacks** (Mnemonica, Aronson, Si Stebbins, Eight Kings, neue Packung) lassen sich als Zuordnung
einfügen – Nummer → Karte oder Karte → Nummer – und unter „Kombis“ nachschlagen.

## Starten (lokal)

Kein Build nötig – reine statische Dateien (ES-Module).

```bash
cd TimHolzhausen.github.io
python -m http.server 8791
# → http://localhost:8791/magicHub/
```

Web Bluetooth braucht HTTPS oder `localhost` und einen echten Tipp auf „Verbinden“.
Ohne Hardware: **Live → Ohne Hardware simulieren**.

## Hosting

GitHub Pages aus diesem Repo; der Ordner `magicHub/` ist direkt erreichbar. Nach Dateiänderungen
in `sw.js` die `VERSION` erhöhen, damit installierte Apps die neue Fassung laden.

## Vom Entwickler einzutragende Werte (`js/config.js`)

| Wert | Bedeutung |
| --- | --- |
| `appUrl` | Dauerhafte HTTPS-Adresse (voreingestellt: GitHub-Pages-URL) |
| `shortcutIcloudUrl` | iCloud-Link des Apple-Kurzbefehls – leer lassen, bis er auf einem iPhone erstellt und getestet ist |
| `bluefyLinkVariant` | `'encoded'` oder `'plain'` – nach iPhone-Test festlegen |

KI-API-Keys trägt jeder Nutzer selbst in der App ein (nur im eigenen Browser gespeichert).

## iPhone: Apple-Kurzbefehl einmalig anlegen

1. Auf dem iPhone in **Kurzbefehle** neuen Kurzbefehl: Aktion **URL** mit
   `bluefy://open?url=https%3A%2F%2Ftimholzhausen.github.io%2FmagicHub%2F`, danach **URLs öffnen**.
2. Mit installiertem Bluefy testen (sonst die Variante ohne Kodierung probieren).
3. Teilen → **iCloud-Link kopieren** → in `shortcutIcloudUrl` eintragen.

Ein Mac ist nicht nötig.

## Aufbau

```
magicHub/
├── index.html, css/app.css, manifest.webmanifest, sw.js, icons/
├── vendor/godice.js        offizielle GoDice-Bibliothek (Particula-Lizenz)
└── js/
    ├── main.js             Oberfläche: Geräte, Kombis, Live, Einrichtung, Hilfe
    ├── hub.js              Quellen → Kombis → Ziele, Speicherung
    ├── config.js, platform.js, bluefy.js
    ├── render.js           Text/Zeichnung → Canvas (Displays)
    ├── print-layout.js     Drucklayout (Ausrichtung, Schrift, Ränder …) für Thermodrucker
    ├── ble/                base.js + je Gerät ein Treiber
    ├── web/sources.js      Inject, JSON-URL
    └── ai/vision.js        KI-Anbieter
```

## Herkunft der Protokolle

- **Davinci-Palette, GoDice:** eigene Projekte `davinci_Landingpage/`, `GoDice/`.
- **PeekSmith, Ultra Sharpie, Selfie Screen, Peripage P21, Inject:** rekonstruiert aus der
  MysterSmith-App (OTA-Bundle 2.3.91, `mystersmith_helper/`), siehe auch
  `peeksmith_ble_protokoll.md` und `ultra_sharpie_ble_protokoll.md`.
- Inject-Server erlaubt Browser-Abfragen (CORS `*`, geprüft am 13.11.2026). Goo und viele andere
  Magie-App-Server tun das nicht und sind deshalb nicht eingebaut.

## Offene Tests (nichts davon ist auf echter Hardware/echtem iPhone geprüft)

- [ ] Ultra Sharpie: Verbindung, Init-Sequenz, Koordinaten, Kappe
- [ ] PeekSmith: Text, Tasten, Helligkeit; PS3-Schrift/Umlaute
- [ ] Selfie Screen: Größenmeldung, JPEG-Übertragung, Tasten
- [ ] Peripage P21: Druck (Standard/Sicher), Papiervorschub, Akku
- [ ] GoDice & Davinci in dieser App (in den Einzel-Apps erprobt)
- [ ] Inject mit echter Account-ID
- [ ] KI: Claude, OpenAI, Gemini, Google Vision mit echten Keys; lokale KI in Chrome
  (Google Handschrift und Tesseract am PC mit Test-Strichen geprüft, noch nicht mit echtem Stift)
- [ ] Peripage: Querdruck-Richtung (rechts/links) am echten Gerät, Kopien, Vorschub
- [ ] Vibration auf Android
- [ ] Bluefy-Direktlink (beide Varianten) auf echtem iPhone
- [ ] Apple-Kurzbefehl importieren, auf Home-Bildschirm legen, starten
- [ ] Bluefy-Vollbild (manuell)
- [ ] Android: PWA installieren, vom Homescreen starten, BLE erneut testen
- [ ] Offline: gecachte Oberfläche lädt
