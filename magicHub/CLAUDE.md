# CLAUDE.md – MagicHub

Arbeitsanweisung für Claude Code, damit die Arbeit an MagicHub auf jedem Rechner nahtlos weitergehen kann.
Benutzer-Doku und Startbefehle stehen in [README.md](README.md).

## Was ist MagicHub?

Web-App (PWA), die Zauber-Gadgets per **Web Bluetooth** verbindet und über **Kombis** (Regeln) frei
kombiniert. Ein HTTPS-Link für Android (Chrome) und iPhone (App **Bluefy**).

- Live: <https://timholzhausen.github.io/magicHub/> (GitHub Pages, Repo `TimHolzhausen.github.io`, Branch `main`)
- Lokal: im Repo-Root `python -m http.server 8791` → <http://localhost:8791/magicHub/>
  (Port 8765 ist durch ein anderes Projekt belegt)
- Kein Build, keine Abhängigkeiten: reine ES-Module, direkt ausgeliefert.

## Arbeitsweise mit dem Entwickler

- **Sprache:** Oberfläche, Kommentare und Antworten auf Deutsch, mit korrekten Umlauten.
- **Commit und Push** sind ausdrücklich erlaubt, sobald eine Aufgabe fertig und lokal geprüft ist.
  Nicht committen: `style.css` im Repo-Root (gehört nicht zu MagicHub) und `.playwright-mcp/`.
- **Versionierung:** Bei jeder Auslieferung
  - `VERSION` in `js/main.js` erhöhen (wird in der Hilfe angezeigt),
  - `VERSION` in `sw.js` erhöhen,
  - neue Dateien in `ASSETS` von `sw.js` eintragen.
  Commit-Format: `MagicHub 0.x.y: kurze Beschreibung`.
- **Testen:** im Browser (Playwright) gegen den lokalen Server:
  - „Live → Ohne Hardware simulieren“ und „Manuell senden“,
  - Konsole auf Fehler prüfen,
  - Handybreite (390 px) prüfen.
  - Nach Änderungen kann ein Cache alte Module liefern: Dateien per `fetch(url, {cache:'reload'})` neu laden, dann `location.reload()`.
- **Hardware** liegt nur beim Entwickler. BLE-Fehler mit ihm über das **„Verbindungsprotokoll“** analysieren: im Gerätefenster aufklappen und kopieren.
- **Debuggen am PC:** Chrome unter Windows kann Web Bluetooth. Mit `chrome://bluetooth-internals` lassen sich Geräte, Dienste und Characteristics ansehen.
  Häufigste Ursache für „Gerät nicht gefunden“: Es ist noch mit dem Handy bzw. mit MysterSmith verbunden.

## Verbindliche Regeln (aus der ursprünglichen Projektvorgabe)

- **iOS:** Safari kann kein Web Bluetooth. Der Weg ist Bluefy plus optionaler Apple-Kurzbefehl.
  - Deep-Link `bluefy://open?url=…` wird nur in `js/bluefy.js` (`buildBluefyUrl`) gebaut; Variante kodiert oder unkodiert über `config.bluefyLinkVariant`.
  - Deep-Link nur nach Nutzer-Tipp auslösen. Keine „Ist Bluefy installiert?“-Heuristik.
- **Keine erfundenen URLs oder UUIDs.**
  - `shortcutIcloudUrl` bleibt leer, bis der Kurzbefehl auf einem echten iPhone erstellt wurde; der Button ist bis dahin deaktiviert.
  - BLE-UUIDs nur aus belegten Quellen (siehe Protokolle).
- **Web Bluetooth:**
  - `requestDevice()` nur direkt aus einem Klick-Handler aufrufen.
  - Kein automatischer Reconnect; nach Verbindungsverlust „Erneut verbinden“ anbieten.
    Gegen Abbrüche stattdessen: Selfie-Screen-Keep-Alive (aktuelles Bild alle 15 s erneut, nur bei offener Anforderung), Wake Lock solange ein Gerät verbunden ist (`settings.keepAwake`), Abbruch-Diagnose im Geräte-Protokoll.
  - Für Bluefy immer 128-Bit-UUIDs verwenden (`uuid16()`).
- **Feature Detection** über `navigator.bluetooth?.requestDevice`, das Betriebssystem nur für Hinweise nutzen. Plattform immer auch manuell wählbar (iPadOS meldet sich als Mac).
- **Ehrlichkeit:** Ungetestetes nicht als funktionierend darstellen. Alle iPhone-Praxistests bleiben als offen markiert (Hilfe → „Noch nicht getestet“ und README-Checkliste).
- **Zentrale Konfiguration** in `js/config.js`: `appName`, `appUrl`, `bluefyAppStoreUrl`, `shortcutIcloudUrl`, `bluefyLinkVariant`.
- **Sitzungsliste (0.4.0):** `hub.list` (nur Speicher) bekommt Text-Ereignisse der gewählten Quellen VOR dem Auswerten der Kombis. `listConfig` (Store `listConfig`): Quellen, Leeren manuell / nach N Einträgen (nächster Wert beginnt neu) / nach X min Pause. Bedingungen `count`/`countMin`, Vorlagen `{liste} {anzahl} {1}…{9} {-1}`, Quelle `list` (jeder neue Eintrag), Ziel `list` (Eintrag hinzufügen/Leeren).
- **Letzte N kombiniert (0.4.1):** Inhalt `list` + `listN` (0 = alle) + `joiner` (`JOINERS`); Zuordnung gilt je Eintrag. Vorlage `{letzte:N}`; `{liste}` nutzt ebenfalls `joiner`.
- **0.4.2/0.4.3:** Aktion kann `font` haben (Druckschrift nur für diese Aktion, Drucker-Ziel liest `p.font`). Vorlagen „Candy Prediction“ (KI, Liste = 4, letzte 4 ohne Trenner → Drucker Handschrift, dann Liste leeren) und „Sitzungsliste live aufs PeekSmith“. Kombis mit Quelle `list` laufen VOR den Kombis der eigentlichen Quelle (sonst leert Candy die Liste vor der Anzeige). Selfie: `settings.selfie.livePen` spiegelt Stift-Punkte alle 250 ms (wie MysterSmith „peek drawing“).
- **Stift-Puffer:** `settings.pen.clearAfter` 'send' (Standard: nach jeder weitergegebenen Zeichnung leeren) | 'keep'. Ziel `pen-buffer` (`clearOnly`) für Kombis. Kappen-Erkennung funktioniert beim Ultra Sharpie NICHT (Nutzer-Test 13.11.2026) – nicht dafür verwenden.
- **Inject senden (0.3.1):** Ziel `inject-send` → `InjectSource.send()` = POST `https://11z.co/_w/<Account-Nr>/selection` mit JSON `{value}` (wie MysterSmith). Echo-Schutz: gerade empfangener Wert wird 10 s nicht zurückgeschickt; gesendeter Wert gilt als bekannt. Benutzername → Account-Nr. (inject.joshuariley.co.uk) geht im Browser nicht (kein CORS).
- **Updates/Installation (0.3.0):** Die Update-Prüfung liest `magichub-x.y.z` aus `sw.js` am Server und vergleicht mit `VERSION` in `main.js` → beide immer gleich hochzählen (Semver-Vergleich). Geprüft wird beim Start und nach >30 min im Hintergrund; Banner „Jetzt aktualisieren“ löscht die Caches und lädt neu. Installieren über `beforeinstallprompt` (Knopf oben + Hilfe → „App, Updates & Daten“). Einstellungen nur in `localStorage` (`magichub_v1`), `navigator.storage.persist()`, Sicherung als JSON (API-Keys nur auf Wunsch).
- Offline-Oberfläche ist keine Offline-Funktion: Der Service Worker cacht nur die App-Shell; fremde Anfragen (APIs) fasst er nicht an.

## Architektur

```
js/main.js            Oberfläche (Geräte-Kacheln, Detail-Sheets, Kombi-Editor, Live, Einrichtung, Hilfe), Verdrahtung
js/hub.js             Regel-Engine: Quellen → Kombis → Ziele; Speicherung (localStorage „magichub_v1“)
js/stacks.js          Karten-Stacks (Mnemonica, Aronson, Si Stebbins, Eight Kings, neue Packung) + Schreibweisen
js/print-layout.js    Drucklayout (quer/hochkant, Schrift min/max, Ausrichtung, Ränder, Neigung, Länge)
js/render.js          Text/Zeichnung → Canvas für Displays
js/ai/vision.js       Erkennung: ghand (kostenlos), tesseract (kostenlos), claude, openai, gemini, gvision, local
js/ble/base.js        BleDevice: connect/Schnellverbindung (getDevices), 3 GATT-Versuche, Fehlertexte, Protokoll
js/ble/*.js           ein Treiber je Gerät (godice, davinci, ultrasharpie, peeksmith, selfiescreen, peripage)
js/web/sources.js     Inject (Polling 11z.co), eigene JSON-URL
js/config.js, platform.js, bluefy.js   Projektvorgabe (s. o.)
```

### Hub und Kombis

- **Quellen** werden mit `hub.registerSource({id, label, icon, kind, hint, values})` angemeldet:
  - `kind` ist `text`, `image` oder `trigger`;
  - `values()` liefert Vorschläge für Bedingungen.
- **Ziele** werden mit `hub.registerTarget({id, label, icon, accepts, deliver(p), clear?()})` angemeldet.
- **Ereignisse:** `hub.publish(sourceId, {kind, text?, strokes?, canvas?})`.
- **Kombi-Format** (siehe Kopf von `hub.js`):
  - `source`
  - `when {type: any|is|not|contains|range|even|odd}`
  - `content` (`event`, `last` oder `fixed`)
  - `map` (Zeilen `Wert=Text`, `*=` als Rest)
  - `template` (`{text} {quelle} {letzter} {zähler} {uhrzeit} {datum}`)
  - `actions[] {target, do: show|clear, delay, hideAfter}`
  - `cooldown`, `onlyNew`, `once`
- Karten-Stacks: Im Kombi-Editor unter „Zuordnung“ lässt sich ein Stack einfügen (Nummer → Karte oder Karte → Nummer, Letzteres mit allen Schreibweisen als Schlüssel). Unter Kombis gibt es eine Stack-Tabelle mit Suche.
  Neue Stacks in `js/stacks.js` eintragen; Codes `AS`, `10H` usw. Nur belegte Reihenfolgen verwenden.
- Alte Kombis aus Version 0.1 (`targets[]`) migriert `normalizeCombo()` automatisch.
- **Neues Gerät hinzufügen:**
  1. Treiber in `js/ble/` anlegen (von `BleDevice` erben, `requestOptions()` und `setup()` implementieren).
  2. Gerät in `dev`, `DEVICES` und `PANELS` in `main.js` eintragen.
  3. Gerät als Quelle oder Ziel registrieren.
  4. Datei in `sw.js` `ASSETS` aufnehmen.

### Drucker (Peripage P21)

- `buildPrint(content, layout, 384)` liefert `{page, print}`:
  - `page` ist die Leseansicht und dient als Vorschau;
  - `print` ist für „quer“ um 90° gedreht und immer 384 px breit (576 px beim P21+).
- Einstellungen liegen in `settings.printLayout` (Standard: **quer**).
- Schwärzung `00`, `01` oder `02` wie bei MysterSmith.
- `printJob()` erledigt Kopien und Vorschub.
- Schriften „Handschrift“ (Caveat) und „Filzstift“ (Permanent Marker) kommen von Google Fonts; ohne Internet greift eine Ersatzschrift.

### Erkennung (KI)

- **Standard ist `ghand`:** Die inoffizielle Google-Input-Tools-Schnittstelle erkennt Handschrift direkt aus den Stift-Strichen, kostenlos und ohne Key.
  - Handschrift: `inputtools.google.com/request?ime=handwriting&app=mobilesearch`.
  - Zeichnungen: `app=autodraw` mit `language: 'quickdraw'`; Begriffe sind englisch und werden über `DRAW_DE` übersetzt.
  - CORS funktioniert (geprüft am 13.11.2026). Da die Schnittstelle inoffiziell ist, kann sie jederzeit wegfallen; dann auf Tesseract oder Gemini (kostenlose Stufe) ausweichen.
- **Tesseract.js 5.1.1** wird bei Bedarf von jsDelivr geladen; gut für Druckbuchstaben.
- **Claude:**
  - roher `fetch` mit `anthropic-version: 2026-10-21`, `anthropic-dangerous-direct-browser-access: true`, `anthropic-beta: server-side-fallback-2026-07-01`, `fallbacks: "default"`, `output_config.effort: "low"`;
  - Standardmodell `claude-opus-5-5`.
- API-Keys liegen nur im localStorage des Nutzers.

## Geräte-Protokolle (Quellen)

Rekonstruiert aus MysterSmith (OTA-Bundle 2.3.91) in `E:\Dropbox\Mein Code\mystersmith_helper`.
Den Code macht `webcrack@2` lesbar, z. B. mit einem kleinen Node-Skript `webcrack(code)`.

- **PeekSmith:**
  - FFE0/FFE1; Textzeilen beginnen mit `#` (beim PS3 mit `$`);
  - Pakete à 18 Byte im Abstand von 60 ms;
  - Tasten-Tokens `isb0/1/2,click|longpress`.
- **Ultra Sharpie:** NeoSmartpen-Frames `C0 CMD LEN PAYLOAD C1`, Escape-Byte `7D`, Keepalive alle 30 s.
- **Selfie Screen:**
  - Nordic-UART-UUIDs `6e40000x-…-ca9d`;
  - Nachrichten mit `AA 55`, Bilder als JPEG;
  - jedes Paket endet mit einem Flag-Byte.
  - Der Name variiert (SelfieCom, TP02 …).
- **Peripage:**
  - FF00 (Schreiben FF02, Antworten FF01 und FF03);
  - Raster `1D 76 30`;
  - Flusssteuerung über Credits.
- **GoDice:** `vendor/godice.js` (Particula). **Davinci-Palette:** Dienst 0x181A, Characteristic 0x2A58 als Bitmaske.
- **Inject:** `https://11z.co/_w/<id>/selection` (CORS `*`).
- Unbekanntes Gerät im Umfeld: „NEMR62617774“ meldet sich intern als „PICKSMART“.
  - Es bietet die Dienste FEF0 und Telink-OTA, aber keinen Selfie-Dienst.
  - FEF0 nutzt MysterSmith für Pitata Ultra/Chalk und den E-Ink-Tag.
  - Was das Gerät ist, ist noch ungeklärt.

## Stand und offene Punkte (13.11.2026, version 0.4.3)

- **Selfie Screen:** verbindet am PC, nachdem das Handy getrennt war. Bildübertragung und Tasten mit dem Entwickler prüfen.
- **Alle Geräte:** auf echter Hardware in MagicHub noch ungetestet (Checkliste in README).
- **Kostenlose Erkennung:** nur mit synthetischen Strichen geprüft (Ergebnisse „17“, „house“ → „Haus“, „heart“ → „Herz“). Mit echtem Ultra Sharpie testen.
- **Peripage:** welche Querdruck-Richtung („nach rechts“ oder „nach links gedreht“) richtig lesbar ist, am Gerät klären und den Standard ggf. anpassen.
- **iPhone:** Bluefy-Link (beide Varianten), Kurzbefehl und Vollbild sind offen.
- **Ideen:**
  - weitere Quellen: Zeitplan/Timer, Wiederverbindung als Auslöser;
  - Kombis exportieren und importieren;
  - weitere MysterSmith-Geräte (Pitata, E-Ink-Tag …).
