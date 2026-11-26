# Partner-Fragebogen

Interaktive, verschlüsselte Fassung eines Partner-Fragebogens.

## So ist es aufgebaut

- `index.html` enthält nur die App, keinen Fragebogentext.
- `data.js` enthält Fragebogen und Auswertungsschlüssel, beides verschlüsselt
  (AES-GCM 256, PBKDF2-SHA256 mit 600 000 Runden).
  - Das **Zugangspasswort** öffnet den Fragebogen.
  - Das **Auswertungspasswort** öffnet den privaten Schlüssel für die Auswertung.
- Wer den Fragebogen ausfüllt, bekommt am Ende einen **Antwortcode**
  (`PF1.…`). Er ist mit dem öffentlichen Auswertungsschlüssel verschlüsselt
  (ECDH P-256 + AES-GCM). Lesen kann ihn nur, wer das Auswertungspasswort kennt.
- „Verschlüsselt absenden“ legt den Antwortcode in einer Supabase-Tabelle ab
  (Einrichtung: `supabase.sql`). Der Server sieht nur Chiffretext. Die
  Auswertung lädt alle Codes und entschlüsselt sie erst im Browser. Erlaubt
  sind nur Lesen und Anlegen; gelöscht wird über `antwort_loeschen()`, das ein
  Löschmerkmal verlangt, das nur im verschlüsselten Code steckt.
- Erneutes Absenden **ersetzt** die vorherige Fassung (die App merkt sich ID und
  Löschmerkmal der letzten Fassung).
- **Weiter bearbeiten:**
  - Auf demselben Gerät bleibt der Entwurf nach dem Absenden erhalten.
  - **Bearbeitungskopie:** Beim Abschließen kann man ein Bearbeitungspasswort
    festlegen. Dann liegt der ganze Entwurf (auch „nur für mich“) mit diesem
    Passwort verschlüsselt in derselben Tabelle, als `PF1.E.<tag>.<daten>`.
    Der `tag` (PBKDF2 aus Vorname + Passwort) macht sie auffindbar, ohne Name
    oder Passwort preiszugeben; die Auswertung blendet diese Zeilen aus.
    Startseite → „Abgesendeten Fragebogen bearbeiten“ öffnet sie auf jedem Gerät.
  - **Aus der Auswertung:** „Bearbeiten“ lädt eine abgesendete Antwort als
    Entwurf („nur für mich“-Antworten fehlen, sie wurden nie abgesendet).
- Ohne Server geht es weiterhin über Code, Link oder Datei.
- Entwürfe, lokal gesammelte Codes und Verabredungen liegen verschlüsselt im
  `localStorage` des jeweiligen Browsers.
- Antworten mit „nur für mich“ kommen nicht in den Antwortcode.

## Passwörter ändern / neu bauen

```
node fragebogen/build.mjs
```

Das Skript fragt beide Passwörter ab (oder liest `FB_ZUGANG` und
`FB_AUSWERTUNG`). Klartext (`inhalt.json`), Schlüsselpaar und Passwörter liegen
in `fragebogen/_privat/`. Der Ordner steht in `.gitignore` und darf **nie**
gepusht werden. Das Schlüsselpaar bleibt beim Neubauen erhalten, bereits
erzeugte Antwortcodes bleiben also lesbar.
