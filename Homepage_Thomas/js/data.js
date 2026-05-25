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
            street: "Testweg 1",
            zip: "55555",
            city: "Teststadt",
            country: "Deutschland"
        },
        social: {
            facebook: "#",
            instagram: "#",
            linkedin: "#"
        }
    },

    services: [
        {
            id: "private-cooking",
            icon: "🍳",
            title: "Private Cooking",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.32.02.jpeg", // Chocolate dessert cups
            description: "Ein exklusives Dinner-Erlebnis in Ihren eigenen vier Wänden. Thomas Wies kocht live vor Ort für Sie und Ihre Gäste. Genießen Sie ein maßgeschneidertes Menü auf Sterneniveau, während Sie sich ganz entspannt zurücklehnen und Gast im eigenen Haus sind.",
            linkText: "Mehr erfahren"
        },
        {
            id: "event-catering",
            icon: "🍷",
            title: "Event Catering",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.09.47 (1).jpeg", // Slider Burgers
            description: "Ob Hochzeit, runder Geburtstag oder Jubiläum: Für Feiern ab 50 bis zu 250 Personen zaubern wir kulinarische Erlebnisse. Unser Fokus liegt auf der perfekten Kombination aus edlem Fingerfood, kreativen Buffets und spektakulärem Live-Cooking.",
            linkText: "Ihr Event planen"
        },
        {
            id: "business-catering",
            icon: "💼",
            title: "Business Catering",
            image: "Bilder/Food/WhatsApp Image 2026-05-25 at 08.09.47.jpeg", // Winzer Wrap
            description: "Professionelle Bewirtung für Ihre Meetings, Firmen-Events, Konferenzen oder Weihnachtsfeiern. Wir bieten moderne, gesunde und kreative Speisekonzepte wie unsere beliebten Winzer-Wraps und Canapés, die Ihr Team begeistern werden.",
            linkText: "Firmen-Anfrage"
        }
    ],

    menuCategories: [
        { id: "fingerfood_glas", name: "Fingerfood & Salate im Glas" },
        { id: "herzhaft_snacks", name: "Herzhafte Snacks & Spieße" },
        { id: "desserts_glas", name: "Desserts im Glas" }
    ],

    menuItems: {
        fingerfood_glas: [
            {
                name: "Veggie Kartoffelsalat im Glas",
                description: "Klassischer Kartoffelsalat mit frischen Kräutern und leichtem Vinaigrette-Dressing.",
                tags: ["Vegetarisch", "Glutenfrei"]
            },
            {
                name: "Schicht-Pananzella mit Basilikumcreme im Glas",
                description: "Italienischer Brotsalat geschichtet mit reifen Tomaten, roten Zwiebeln und feiner Basilikumcreme.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Apfel-Sellerie-Salat im Glas",
                description: "Erfrischender Salat aus knackigem Apfel und feinem Sellerie mit Joghurt-Dressing und Walnüssen.",
                tags: ["Vegetarisch", "Glutenfrei"]
            },
            {
                name: "Cous-Cous-Salat im Glas",
                description: "Schmackhafter Couscous-Salat mit mediterranem Gemüse, Minze und einem Hauch Zitrone.",
                tags: ["Vegan"]
            },
            {
                name: "Mixsalat mit Caesar-Dressing",
                description: "Knackige Blattsalate mit cremigem Caesar-Dressing, Parmesan und hausgemachten Croûtons.",
                tags: ["Vegetarisch"]
            },
            {
                name: "Winzer-Wrap (vegetarisch)",
                description: "Tortilla-Wrap mit rheinhessischen Weintrauben, Frischkäse, buntem Salat und Kräutern.",
                tags: ["Vegetarisch", "Bestseller"]
            }
        ],
        herzhaft_snacks: [
            {
                name: "Pizzaschnecken",
                description: "Herzhaft gefüllte Blätterteigschnecken, wahlweise mit würziger Salami oder saftigem Schinken und Käse.",
                tags: ["Warm serviert"]
            },
            {
                name: "Empanadas (veggie)",
                description: "Knusprige Teigtaschen mit einer würzigen, vegetarischen Gemüsefüllung.",
                tags: ["Vegetarisch", "Warm serviert"]
            },
            {
                name: "Kartoffel-Paprika-Tortilla",
                description: "Klassisches spanisches Omelett mit Kartoffeln und roter Paprika, in mundgerechten Happen.",
                tags: ["Vegetarisch", "Glutenfrei"]
            },
            {
                name: "Mini-Burger",
                description: "Kleine Gourmet-Burger mit Rindfleisch-Patty oder vegetarischem Patty, Cheddar und Burgersauce im weichen Brioche-Bun.",
                tags: ["Fleisch & Veggie gemischt"]
            },
            {
                name: "Lachs-Frischkäseröllchen-Spieß",
                description: "Feiner Räucherlachs mit Kräuterfrischkäse in Tortillaröllchen am Spieß serviert.",
                tags: ["Fisch"]
            },
            {
                name: "Mini Köfte mit Joghurt-Dip",
                description: "Würzige Hackfleischbällchen nahöstlicher Art am Spieß mit einem erfrischenden Joghurt-Dip.",
                tags: ["Herzhaft"]
            },
            {
                name: "BBQ-Hähnchenspieße",
                description: "Zarte Hähnchenbruststücke in einer rauchig-süßen Barbecuemarinade gegrillt.",
                tags: ["Beliebt"]
            }
        ],
        desserts_glas: [
            {
                name: "Oreo-Himbeertraum",
                description: "Dessert aus cremiger Quark-Sahne, fruchtigen Himbeeren und knusprigen Oreo-Keksen.",
                tags: ["Dessert-Highlight"]
            },
            {
                name: "Tiramisu im Glas",
                description: "Der italienische Klassiker mit in Espresso getränkten Löffelbiskuits und Mascarponecreme im Glas.",
                tags: ["Klassiker"]
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
            text: "Für unsere Firmenfeier mit 80 Gästen haben wir das Buffet und die Burger-Sliders gebucht. Es war fantastisch! Der Service war extrem zuvorkommend und das Essen unglaublich lecker.",
            author: "Dr. Marcus Becker, IT-Solutions",
            event: "Firmenevent, Wiesbaden"
        },
        {
            rating: 5,
            text: "Unsere Hochzeitsgäste schwärmen immer noch von den Winzer-Wraps und der Maispoularde. Thomas und sein Team arbeiten hochprofessionell, sauber und mit enormer Leidenschaft. Absolute Empfehlung!",
            author: "Julia & Tom S.",
            event: "Hochzeit, Eltville am Rhein"
        }
    ]
};
