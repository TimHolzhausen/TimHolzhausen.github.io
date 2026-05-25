// Thomas Wies Catering - Webpage Content Database
// This file contains the complete content database. 
// Simply edit these arrays and objects to update the website text, menus, reviews, or locations!

const CATERING_DATA = {
    company: {
        name: "Thomas Wies Catering",
        tagline: "Ihr persönlicher Koch",
        phone: "+49 1575 3672500",
        phoneFormatted: "01575 3672500",
        email: "hallo@thomaswies-catering.de",
        address: {
            street: "Naheweinstrasse 29",
            zip: "55425",
            city: "Waldalgesheim",
            country: "Deutschland"
        },
        social: {
            facebook: "https://www.facebook.com/p/Thomas-Wies-Zauberkunst-100083096055221/",
            instagram: "https://www.instagram.com/thomas.wies_zauberkunst/",
            linkedin: "#"
        }
    },

    services: [
        {
            id: "private-cooking",
            icon: "🍳",
            title: "Private Cooking",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.32.02.jpeg", // Chocolate dessert cups
            description: "Ein exklusives Dinner-Erlebnis in Ihren eigenen vier Wänden. Ich koche als persönlicher Koch live vor Ort für Sie und Ihre Gäste. Genießen Sie ein maßgeschneidertes Menü auf Sterneniveau für kleinere, intime Gruppen bis ca. 20 Personen.",
            linkText: "Dinner anfragen",
            visible: false
        },
        {
            id: "event-catering",
            icon: "🍷",
            title: "Event Catering",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.09.47 (1).jpeg", // Slider Burgers
            description: "Ob runder Geburtstag, Jubiläum oder Familienfeier: Für private Events bis maximal 50 Personen biete ich Ihnen ein maßgeschneidertes Genusserlebnis. Als 1-Mann-Betrieb kümmere ich mich persönlich um jedes Detail auf Ihrem Teller.",
            linkText: "Feier planen",
            visible: true
        },
        {
            id: "business-catering",
            icon: "💼",
            title: "Business Catering",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.09.47.jpeg", // Winzer Wrap
            description: "Modernes Fingerfood und Snacks für Ihre Meetings, Seminare, Firmen-Events oder Weihnachtsfeiern bis maximal 50 Personen. Unkomplizierte, gesunde Konzepte wie meine Wraps und Mini-Burger, die Ihre Kollegen begeistern.",
            linkText: "Firmen-Anfrage",
            visible: true
        },
        {
            id: "zauberei",
            icon: "🪄",
            title: "Catering & Zauberei",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.32.02.jpeg",
            description: "Machen Sie Ihr Event magisch! Neben kulinarischen Köstlichkeiten biete ich Ihnen professionelle Zauberkunst als exklusives Entertainment. Ob Close-Up-Magie an den Tischen oder als Highlight-Show – Gaumenfreuden und Illusion perfekt vereint.",
            linkText: "Magie anfragen",
            visible: true
        }
    ],

    menuCategories: [
        { id: "fingerfood_wraps", name: "Fingerfood & Wraps" },
        { id: "spiesse_snacks", name: "Spieße & warme Snacks" },
        { id: "salate_suppen", name: "Salate & Suppen im Glas" },
        { id: "quiches_tortillas", name: "Quiches & Tortillas" },
        { id: "hauptgerichte", name: "Warme Hauptgerichte" },
        { id: "brunch_klassiker", name: "Brunch-Klassiker" },
        { id: "desserts", name: "Desserts im Glas" }
    ],

    menuItems: {
        fingerfood_wraps: [
            {
                name: "Serrano-Wrap",
                description: "Weiche Weizentortilla mit feinem Serrano-Schinken, Frischkäse und knackigem Eisbergsalat.",
                tags: ["Herzhaft"]
            },
            {
                name: "Winzer-Wrap (Catering-Highlight)",
                description: "Tortilla-Wrap mit rheinhessischen Weintrauben, Frischkäse, knackigem Eisbergsalat, Tomaten, Gurken und Parmesanspänen.",
                tags: ["Vegetarisch", "Bestseller"],
                image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.09.47.jpeg"
            },
            {
                name: "Reisbällchen mit Pilzfüllung",
                description: "Knusprige Reisbällchen mit würziger Pilzfüllung und Sweet-Chili-Soße.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Blätterteigtaschen mit Lachs",
                description: "Knusprige Blätterteigtaschen gefüllt mit feinem Lachs und Kräuterfrischkäse.",
                tags: ["Fisch"]
            },
            {
                name: "Pizzaschnecken",
                description: "Herzhaft gefüllte Blätterteigschnecken mit Käse, Schinken und würziger Salami.",
                tags: ["Warm serviert", "Beliebt"]
            },
            {
                name: "Croquetas de Setas",
                description: "Cremig-knusprige spanische Pilzkroketten.",
                tags: ["Vegetarisch", "Spanische Tapas"]
            },
            {
                name: "Empanadas „veggy style“",
                description: "Knusprige Teigtaschen mit einer würzigen Füllung aus Zucchini, Paprika und Zwiebeln.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Empanadas „Chili style“",
                description: "Knusprige Teigtaschen gefüllt mit würzigem Rinderhackfleisch, Zwiebeln, Kidneybohnen und Mais.",
                tags: ["Herzhaft"]
            },
            {
                name: "Flammkuchenschnecken",
                description: "Gefüllt mit Schmand, krossen Speckwürfeln, Zwiebeln und Käse.",
                tags: ["Warm serviert"]
            },
            {
                name: "Spinat-Feta-Hörnchen",
                description: "Knusprige Blätterteighörnchen mit einer Füllung aus Blattspinat und Feta.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Cheeseburger Muffins",
                description: "Leckere Muffins aus Hefeteig mit Rinderhackfleisch-Füllung, Cheddar und Gewürzgurke.",
                tags: ["Beliebt"]
            }
        ],
        spiesse_snacks: [
            {
                name: "BBQ-Hähnchenspieße",
                description: "Zarte Hähnchenbruststücke in einer rauchig-süßen Barbecuemarinade.",
                tags: ["Beliebt"]
            },
            {
                name: "Bacon-Filet-Happen",
                description: "Saftige Schweinefilet-Stückchen im krossen Baconmantel am Spieß.",
                tags: ["Herzhaft", "Beliebt"]
            },
            {
                name: "Tater Tots mit Räucherlachs",
                description: "Knusprige Kartoffelbällchen mit Räucherlachs-Streifen und einem Klecks Kräuterquark.",
                tags: ["Fisch"]
            },
            {
                name: "Mini Köfte",
                description: "Würzige Hackfleischbällchen nahöstlicher Art am Spieß mit einem Joghurt-Kräuter-Dip.",
                tags: ["Herzhaft"]
            },
            {
                name: "Hähnchenspieße mit Zucchini & Tomate",
                description: "Saftige Hähnchenspieße mit Zucchini, Tomaten und buntem Pfeffer.",
                tags: ["Herzhaft"]
            },
            {
                name: "Hähnchen-Saltimbocca Spieß",
                description: "Zarte Hähnchenbruststücke mit Salbeiblatt im Parmaschinkenmantel gebraten.",
                tags: ["Warm serviert"]
            },
            {
                name: "Lachs-Frischkäseröllchen-Spieß",
                description: "Feiner Räucherlachs mit Kräuterfrischkäse in Crepeteig gerollt und gespießt.",
                tags: ["Fisch"]
            },
            {
                name: "Albondigas mit Salsa",
                description: "Klassische spanische Hackfleischbällchen in pikanter Tomatensalsa.",
                tags: ["Spanische Tapas", "Warm serviert"]
            }
        ],
        salate_suppen: [
            {
                name: "Vegetarische Suppe",
                description: "Feine Gemüsesuppe, ändert sich je nach Saison und frischen Zutaten.",
                tags: ["Vegetarisch", "Saisonal", "Warm serviert"]
            },
            {
                name: "Basilikum-Nudelsalat",
                description: "Erfrischender Nudelsalat mit hausgemachter Basilikumcreme und Geflügel-Hackbällchen.",
                tags: ["Herzhaft"]
            },
            {
                name: "Mediterraner Couscous-Salat",
                description: "Couscous mit mediterranem Gemüse, frischer Minze und Olivenöl.",
                tags: ["Vegetarisch", "Vegan"]
            },
            {
                name: "Spanische Ensaladilla Rusa",
                description: "Feiner spanischer Kartoffelsalat mit Thunfisch, Ei und Oliven.",
                tags: ["Fisch"]
            },
            {
                name: "Bohnen-Chorizo-Salat",
                description: "Herzhafter Salat aus weißen Bohnen, Paprika und würziger spanischer Chorizo.",
                tags: ["Herzhaft"]
            },
            {
                name: "Apfel-Selleriesalat",
                description: "Erfrischender, knackiger Salat aus Äpfeln und Sellerie mit Walnüssen.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Veggie Kartoffelsalat im Glas",
                description: "Klassischer Kartoffelsalat mit frischen Kräutern im Portionsglas angerichtet.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Schicht-Panzanella im Glas",
                description: "Italienischer Brotsalat geschichtet mit reifen Tomaten, roten Zwiebeln und feiner Basilikumcreme im Glas.",
                tags: ["Vegetarisch"]
            }
        ],
        quiches_tortillas: [
            {
                name: "Flammkuchen-Quiche",
                description: "Herzhafte Quiche nach Elsässer Art mit Speck, Zwiebeln und Schmand.",
                tags: ["Klassiker"]
            },
            {
                name: "Spinat-Feta-Quiche",
                description: "Herzhafte Quiche mit frischem Blattspinat und würzigem Feta-Käse.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Mini-Quiche mit Birnen & Gorgonzola",
                description: "Herzhafte Mini-Quiche aus feinem Mürbeteig mit fruchtigen Birnen und würzigem Gorgonzola.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Kartoffel-Tortilla mit Zwiebeln & Paprika",
                description: "Klassisches spanisches Omelett mit Kartoffeln, Zwiebeln und roter Paprika.",
                tags: ["Vegetarisch"]
            }
        ],
        hauptgerichte: [
            {
                name: "Schweinefilet Medaillons",
                description: "Zarte Medaillons in feiner Champignon-Rahmsoße, serviert mit Rosmarinkartoffeln und buntem Marktgemüse.",
                tags: ["Warm serviert", "Hauptgericht"]
            },
            {
                name: "Spinat-Ricotta-Tortelliniauflauf",
                description: "Cremig überbackene Tortellini gefüllt mit Spinat und Ricotta.",
                tags: ["Vegetarisch", "Hauptgericht"]
            },
            {
                name: "Saisonale Spargelsuppe",
                description: "Feine, cremige Spargelsuppe aus regionalem Spargel.",
                tags: ["Warm serviert", "Saisonal"]
            }
        ],
        brunch_klassiker: [
            {
                name: "Brunch-Backwaren & Croissants",
                description: "Gemischte Brötchen (Weizen, Körner), frische Croissants, Bäckerbrot und Vollkornbrot.",
                tags: ["Frühstück"]
            },
            {
                name: "Aufschnitt & Käsevariationen",
                description: "Auswahl von rohem Schinken, Putenwurst und Fleischwurst sowie Schnittkäse, Pfefferkäse und Weichkäse.",
                tags: ["Frühstück"]
            },
            {
                name: "Frühstücks-Spezialitäten",
                description: "Cremiger Frischkäse, gefüllte Eier, saisonale Spargelröllchen und Räucherlachs mit Sahnemeerrettich.",
                tags: ["Herzhaft"]
            },
            {
                name: "Vital-Ecke",
                description: "Frischer, bunter Obstsalat und cremiger Naturjoghurt.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Warmes Frühstücksbuffet",
                description: "Fluffige Pancakes mit Ahornsirup oder Nutella, Nürnberger Bratwürste und Mini-Hackbällchen.",
                tags: ["Warm serviert"]
            }
        ],
        desserts: [
            {
                name: "Oreo-Himbeertraum & Panna-Cotta",
                description: "Dessert-Highlights aus cremiger Quark-Sahne mit Oreo und Himbeeren sowie Panna-Cotta mit Erdbeersauce im Glas.",
                tags: ["Dessert-Highlight"],
                image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.32.02.jpeg"
            }
        ]
    },

    testimonials: [
        {
            rating: 5,
            text: "Thomas Wies hat uns mit seinem Private Cooking zum Hochzeitstag absolut begeistert. Jeder Gang war perfekt aufeinander abgestimmt und die Qualität der Zutaten war herausragend. Ein toller Abend!",
            author: "Sabine & Christian K.",
            event: "Private Dinner, Mainz"
        },
        {
            rating: 5,
            text: "Für unsere Firmenfeier mit 45 Gästen haben wir das Fingerfood und die Burger-Sliders gebucht. Es war fantastisch! Thomas kocht mit enormer Leidenschaft und organisiert alles perfekt.",
            author: "Dr. Marcus Becker, IT-Solutions",
            event: "Firmenevent, Wiesbaden"
        },
        {
            rating: 5,
            text: "Unsere Gäste schwärmen immer noch von den Winzer-Wraps und den feinen Salaten im Glas. Thomas arbeitet als 1-Mann-Betrieb hochprofessionell und mit enormer Leidenschaft. Und seine Zaubertricks zwischen den Gängen haben alle verblüfft!",
            author: "Julia & Tom S.",
            event: "Private Feier, Eltville am Rhein"
        },
        {
            rating: 5,
            text: "Die Kombination aus exklusivem Fingerfood und Close-Up-Zauberei direkt an den Tischen war das absolute Highlight auf meiner Geburtstagsfeier! Thomas hat nicht nur kulinarisch voll ins Schwarze getroffen, sondern unsere Gäste auch magisch komplett sprachlos hinterlassen. Einzigartiges Konzept!",
            author: "Michael R.",
            event: "50. Geburtstag, Ingelheim"
        },
        {
            rating: 5,
            text: "Wir haben Thomas für unser privates Sommerfest mit 30 Personen gebucht. Das Essen (besonders die Mini-Burger und feinen Nachspeisen) war köstlich und wunderschön angerichtet. Nach dem Essen gab es eine kleine Zaubershow, die Jung und Alt begeistert hat. Thomas ist ein toller Gastgeber und absolut professionell!",
            author: "Familie Weber",
            event: "Sommerfest, Bingen"
        },
        {
            rating: 5,
            text: "Ein magischer Abend im wahrsten Sinne! Thomas hat für unsere kleine Firmenweihnachtsfeier (18 Personen) live bei uns gekocht. Jeder Gang war ein Genuss. Dass er zwischen den Gängen noch unfassbare Zaubertricks direkt vor unseren Augen vorführte, hat die Stimmung perfekt gelockert. Das werden wir definitiv wiederholen!",
            author: "Katrin S., Agentur Herzblut",
            event: "Firmenfeier, Alzey"
        }
    ],

    homepage: {
        hero: {
            tagline: "Exklusive Genuss-Erlebnisse für Ihr privates Dinner, Firmenevent oder Hochzeitsfest im Rhein-Main-Gebiet",
            buttonPrimary: "Jetzt anfragen",
            buttonSecondary: "Speisekarte ansehen"
        },
        servicesIntro: {
            title: "Meine Leistungen",
            description: "Von intimen Dinners zu Hause bis hin zu exklusiven Veranstaltungen biete ich maßgeschneiderte Genusskonzepte jenseits des Standards."
        },
        philosophy: {
            badge: "Genuss aus Leidenschaft",
            title: "Kochen ist für mich echtes Handwerk",
            text1: "Ich kombiniere Fingerspitzengefühl, Detailverliebtheit und den Mut zum Experimentieren, um für Sie unvergessliche Momente zu bereiten. Jenseits von Standard-Catering rücke ich das Saisonale, Regionale und den Menschen in den Fokus.",
            text2: "Als leidenschaftlicher 1-Mann-Betrieb kreiere ich persönlich aus hochwertigen Zutaten aus Rheinhessen etwas unvergleichlich Leckeres und lasse gerne die Jahreszeiten meine Menükarten schreiben.",
            buttonText: "Lernen Sie mich kennen",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.09.47.jpeg"
        },
        menuIntro: {
            title: "Auszug aus der Speisekarte",
            description: "Lassen Sie sich inspirieren. Meine Gerichte werden saisonal angepasst und individuell für Ihr Event zusammengestellt."
        },
        testimonialsIntro: {
            title: "Was meine Kunden sagen",
            description: "Zufriedene Gäste und perfekte Events sind mein schönster Lohn. Ein Auszug aus meinen Kundenstimmen.",
            formTitle: "Ihre Meinung ist mir wichtig"
        },
        contactIntro: {
            title: "Ihre Anfrage",
            description: "Planen Sie gerade ein Event? Erzählen Sie mir davon. Ich sende Ihnen ein unverbindliches, maßgeschneidertes Angebot."
        },
        contactCards: [
            {
                title: "Regionalität & Qualität",
                description: "Ich beziehe meine Lebensmittel von ausgewählten Lieferanten direkt aus Rheinhessen und der Region Mainz/Wiesbaden. Frische und Nähe, die man schmeckt."
            }
        ],
        footerDescription: "Ihr Premium-Catering jenseits des Standards für Mainz, Wiesbaden, Bingen und das gesamte Rhein-Main-Gebiet.",
        legal: {
            impressum: `<h4>Angaben gemäß § 5 TMG</h4><p>Thomas Wies Catering<br>Naheweinstrasse 29<br>55425 Waldalgesheim</p><h4>Vertreten durch:</h4><p>Thomas Wies</p><h4>Kontakt:</h4><p>Telefon: +49 1575 3672500<br>E-Mail: hallo@thomaswies-catering.de</p><h4>Umsatzsteuer-ID:</h4><p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br>DE 123 456 789</p><h4>Aufsichtsbehörde:</h4><p>Gewerbeamt Waldalgesheim</p><h4>EU-Streitschlichtung:</h4><p>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" style="color:var(--accent-gold);text-decoration:underline;">https://ec.europa.eu/consumers/odr/</a>.<br>Unsere E-Mail-Adresse finden Sie oben im Impressum.</p>`,
            datenschutz: `<h4>1. Datenschutz auf einen Blick</h4><p>Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.</p><h4>2. Datenerfassung auf dieser Website</h4><p>Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Dessen Kontaktdaten können Sie dem Impressum dieser Website entnehmen.</p><p>Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen. Hierbei kann es sich z. B. um Daten handeln, die Sie in ein Kontaktformular eingeben (Name, E-Mail-Adresse, Telefonnummer).</p><h4>3. Rechte der betroffenen Person</h4><p>Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben außerdem ein Recht, die Berichtigung oder Löschung dieser Daten zu verlangen.</p><h4>4. Kontaktformular und Kundenstimmen</h4><p>Wenn Sie uns per Kontaktformular Anfragen zukommen lassen, werden Ihre Angaben aus dem Anfrageformular inkl. der Kontaktdaten zwecks Bearbeitung bei uns gespeichert. Diese Daten geben wir nicht ohne Einwilligung weiter.</p><p>Wenn Sie eine Kundenstimme abgeben, wird der eingegebene Name und Event-Typ zur Veröffentlichung lokal und auf unserem Server gespeichert.</p>`
        }
    }
};
