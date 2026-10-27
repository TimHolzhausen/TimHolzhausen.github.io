// Einzige Stelle für die Versionsnummer von Landingpage und WebApp.
// Bei jeder Veröffentlichung APP_VERSION erhöhen: sw.js liest diese Datei,
// dadurch holen sich installierte Apps automatisch die neuen Dateien.
var APP_VERSION = '2.5.0';
var APP_DATE = '2026-10-27';

// Ab hier nur im Browserfenster (nicht im Service Worker)
if (typeof document !== 'undefined') {
    (function () {
        function isGerman() {
            return (document.documentElement.lang || '').toLowerCase().startsWith('de');
        }

        function showVersion() {
            document.querySelectorAll('[data-app-version]').forEach(function (el) {
                el.textContent = 'Version ' + APP_VERSION + ' · ' + APP_DATE;
            });
        }

        // Lädt die Seite neu, sobald der neue Service Worker die Kontrolle übernommen hat
        function reloadWithUpdate() {
            var reloaded = false;
            function reloadOnce() {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
            }
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
                navigator.serviceWorker.getRegistration().then(function (reg) {
                    if (reg) return reg.update();
                }).catch(function () {});
            }
            setTimeout(reloadOnce, 2500);
        }

        // Fragt am Server die aktuelle version.js ab (am Cache vorbei) und meldet eine neuere Version
        function checkForUpdate() {
            fetch('version.js?check=' + Date.now(), { cache: 'no-store' })
                .then(function (res) { return res.ok ? res.text() : ''; })
                .then(function (text) {
                    var match = text.match(/APP_VERSION\s*=\s*'([^']+)'/);
                    if (!match || match[1] === APP_VERSION) return;
                    document.querySelectorAll('[data-app-update]').forEach(function (btn) {
                        btn.textContent = isGerman()
                            ? 'Neue Version ' + match[1] + ' verfügbar · jetzt laden'
                            : 'New version ' + match[1] + ' available · load now';
                        btn.hidden = false;
                        btn.onclick = reloadWithUpdate;
                    });
                })
                .catch(function () { /* offline: nichts anzeigen */ });
        }

        document.addEventListener('DOMContentLoaded', function () {
            showVersion();
            checkForUpdate();
        });
    })();
}
