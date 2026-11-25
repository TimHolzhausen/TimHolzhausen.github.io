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
- Es gibt keinen Server. Entwürfe, gesammelte Codes und Verabredungen liegen
  verschlüsselt im `localStorage` des jeweiligen Browsers.
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
