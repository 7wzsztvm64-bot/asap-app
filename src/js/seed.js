import { Util, hashPassword } from './core.js';

/* =============================================================================
   3) TESTDATEN (SEED)
   20 simulierte Nutzer:innen aus dem Raum Frankfurt + 2 Login-Testaccounts.
   Alle Konten haben das Passwort „Test1234“.
   ============================================================================= */
const TEST_PASSWORD = 'Test1234';
const TEST_ACCOUNTS = [
  { id: 'u_test1', email: 'test1@datedate.app', password: TEST_PASSWORD },
  { id: 'u_test2', email: 'test2@datedate.app', password: TEST_PASSWORD },
];

/** Kurzschreibweise für Date-Ideen. */
function I(emoji, title, category, budget, duration, timeOfDay, location, description) {
  return { emoji, title, category, budget, duration, timeOfDay, location, description };
}

const SEED_PEOPLE = [
  /* ---------- Login-Testaccounts ---------- */
  { id: 'u_test1', email: 'test1@datedate.app', isTest: true, name: 'Jonas', age: 29, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Bornheim',
    bio: 'Bauingenieur, Frühaufsteher und Ex-Kreisliga-Tischtennisspieler. Ich plane gern – aber für eine gute Idee bin ich jederzeit spontan.',
    interests: ['Brunch', 'Kaffee', 'Tischtennis', 'Radfahren', 'Reisen'],
    photos: [['#FFB547', '#FF5A3C', null, 1], ['#4FACFE', '#2563EB', '🚲', 2]],
    ideas: [
      I('🥐', 'Sonntagsbrunch im Café Wacker, danach Spaziergang am Main', 'Essen & Trinken', '€€', '2–3 Std.', 'Morgens', 'Café Wacker → Mainufer',
        'Frisch gerösteter Kaffee, ein ausgiebiges Frühstück und dann gemütlich runter zum Main – über den Eisernen Steg mit Blick auf die Skyline.'),
      I('🏓', 'Tischtennis-Duell im Günthersburgpark', 'Sport', '€', '1–2 Std.', 'Nachmittags', 'Günthersburgpark, Nordend',
        'Ich bringe Schläger und Bälle mit. Wer verliert, gibt am Kiosk eine Runde Limo aus – Revanche ausdrücklich erlaubt.'),
    ] },
  { id: 'u_test2', email: 'test2@datedate.app', isTest: true, name: 'Mia', age: 27, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Sachsenhausen',
    bio: 'Doktorandin in Biologie, Balkon-Gärtnerin und auf der ewigen Suche nach der besten Ramen der Stadt. Ich lache laut und oft.',
    interests: ['Streetfood', 'Pflanzen', 'Kino', 'Wandern', 'Reisen'],
    photos: [['#43E97B', '#1FA2A0', '🌿', 3], ['#F6D365', '#FDA085', '🍜', 1]],
    ideas: [
      I('🍜', 'Ramen-Abend im Bahnhofsviertel', 'Essen & Trinken', '€€', '1–2 Std.', 'Abends', 'Kaiserstraße, Bahnhofsviertel',
        'Ich kenne einen kleinen Laden mit der besten Tonkotsu der Stadt. Danach noch ein Absacker oder ein Spaziergang runter zum Main?'),
      I('🌳', 'Durch den Stadtwald zum Goetheturm', 'Outdoor', '€', '2–3 Std.', 'Nachmittags', 'Goetheturm, Sachsenhausen',
        'Sonntagsspaziergang durch den Stadtwald, oben auf dem Goetheturm die Skyline bestaunen und auf dem Rückweg ein Eis.'),
    ] },

  /* ---------- Simulierte Nutzer:innen (reagieren automatisch) ---------- */
  { id: 'u_lena', name: 'Lena', age: 27, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Nordend',
    bio: 'UX-Designerin, Kaffeesnob und Samstags-Flohmarkt-Gängerin. Ich finde, die besten Gespräche passieren beim Spazierengehen.',
    interests: ['Kaffee', 'Design', 'Flohmärkte', 'Fotografie', 'Brunch'],
    photos: [['#FF9A8B', '#FF5E7E', '🌸', 1], ['#F6D365', '#FDA085', '📷', 2], ['#A18CD1', '#E58FD0', '☕', 3]],
    ideas: [
      I('🧺', 'Flohmarkt-Challenge am Museumsufer', 'Entspannt', '€', '2–3 Std.', 'Morgens', 'Schaumainkai, Museumsufer',
        'Jede:r hat 10 € Budget für das skurrilste Fundstück. Danach Kaffee to go am Main – und wir küren gemeinsam den Sieger.'),
      I('🍝', 'Pasta-Kochkurs für Anfänger:innen', 'Essen & Trinken', '€€', '2–3 Std.', 'Abends', 'Kochschule im Ostend',
        'Ich kann Spaghetti kochen – und das war\'s. Lass uns lernen, wie man Pasta von Hand macht, und das Ergebnis direkt zusammen essen.'),
      I('📷', 'Analoger Fotospaziergang durch die Neue Altstadt', 'Kultur', '€', '1–2 Std.', 'Nachmittags', 'Römerberg & Neue Altstadt',
        'Ich bringe zwei Einwegkameras mit, jede:r hat 27 Bilder. Entwickeln lassen wir sie zusammen – das zweite Date ist also schon gesichert.'),
    ] },
  { id: 'u_sophie', name: 'Sophie', age: 24, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Bockenheim',
    bio: 'Medizinstudentin im 9. Semester. Suche Dates, bei denen ich nicht über Anatomie rede 😅 Liebe Bouldern, Thai-Curry und schlechte Wortwitze.',
    interests: ['Bouldern', 'Yoga', 'Streetfood', 'Podcasts', 'Reisen'],
    photos: [['#4FACFE', '#2563EB', '🧗', 2], ['#5EE7DF', '#7F7FD5', '🌊', 1]],
    ideas: [
      I('🧗', 'Bouldern für Anfänger:innen & danach Curry', 'Sport', '€€', '2–3 Std.', 'Abends', 'Boulderhalle im Ostend',
        'Keine Vorkenntnisse nötig, ich zeige dir die Basics. Danach haben wir uns ein scharfes Thai-Curry redlich verdient.'),
      I('🎲', 'Picknick mit Brettspiel im Grüneburgpark', 'Entspannt', '€', '2–3 Std.', 'Nachmittags', 'Grüneburgpark, Westend',
        'Decke, Snacks und eine Runde Codenames oder Azul. Ich warne dich vor: Ich bin eine sehr schlechte Verliererin.'),
    ] },
  { id: 'u_hannah', name: 'Hannah', age: 31, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Sachsenhausen',
    bio: 'Juristin mit Hang zu Apfelwein und Wanderschuhen. Montag bis Freitag Akten, am Wochenende Taunus.',
    interests: ['Wandern', 'Apfelwein', 'Wein', 'Lesen', 'Hunde'],
    photos: [['#43E97B', '#1FA2A0', '🥾', 1], ['#FAD961', '#F76B1C', '🍏', 3]],
    ideas: [
      I('🍏', 'Apfelwein-Abend in Alt-Sachsenhausen', 'Essen & Trinken', '€', '2–3 Std.', 'Abends', 'Apfelweinwirtschaft, Schweizer Straße',
        'Bembel, Grüne Soße und Handkäs mit Musik. Ich zeige dir, wie man richtig ein „Gerippte“ bestellt.'),
      I('🥾', 'Wanderung auf den Großen Feldberg', 'Outdoor', '€', 'Halber Tag', 'Ganztags', 'Hohemark, Oberursel',
        'Von der Hohemark rauf auf den Feldberg, oben Kuchen mit Weitblick. Zurück geht\'s mit dem Bus, falls die Beine streiken.'),
      I('📚', 'Lesung im Literaturhaus', 'Kultur', '€€', '1–2 Std.', 'Abends', 'Literaturhaus, Schöne Aussicht',
        'Eine Lesung, danach ein Glas Wein und die große Frage: Wer hat das Buch schon gelesen – und wer tut nur so?'),
    ] },
  { id: 'u_aylin', name: 'Aylin', age: 26, gender: 'frau', interestedIn: ['frau', 'mann', 'divers'], city: 'Frankfurt-Ostend',
    bio: 'Marketing bei einem Food-Startup, Hobbyköchin und Techno-Herz. Ich mag Menschen, die über sich selbst lachen können.',
    interests: ['Techno', 'Kochen', 'Tanzen', 'Streetfood', 'Festivals'],
    photos: [['#C471F5', '#FA71CD', '🎧', 2], ['#FF758C', '#FF7EB3', '🍓', 1]],
    ideas: [
      I('🥟', 'Streetfood-Tour durchs Bahnhofsviertel', 'Essen & Trinken', '€€', '2–3 Std.', 'Abends', 'Münchener Straße, Bahnhofsviertel',
        'Drei Stopps, drei Länder: Bánh mì, Dumplings und Baklava zum Nachtisch. Wir teilen alles – auch die Rechnung.'),
      I('💃', 'Salsa-Schnupperstunde', 'Sport', '€€', '1–2 Std.', 'Abends', 'Tanzschule, Innenstadt',
        'Keiner von uns muss tanzen können – genau das ist der Spaß. Danach gibt\'s einen Mojito auf den Schreck.'),
      I('🌇', 'Rooftop-Drinks mit Skyline-Blick', 'Entspannt', '€€€', '1–2 Std.', 'Abends', 'Rooftop-Bar, Innenstadt',
        'Sonnenuntergang über den Hochhäusern, ein guter Drink und Gespräche, für die man sonst nie Zeit hat.'),
    ] },
  { id: 'u_clara', name: 'Clara', age: 29, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Westend',
    bio: 'Grundschullehrerin – ich kann also gut erklären und habe unendlich Geduld. Liebe Museen, Jazz und Frühstücke, die bis mittags dauern.',
    interests: ['Museen', 'Jazz', 'Brunch', 'Kunst', 'Lesen'],
    photos: [['#8EC5FC', '#7B61FF', '☁️', 1], ['#F093FB', '#F5576C', '🎷', 2]],
    ideas: [
      I('🖼️', 'Städel-Besuch & Weinbar danach', 'Kultur', '€€', '2–3 Std.', 'Nachmittags', 'Städel Museum, Museumsufer',
        'Jede:r sucht sich ein Lieblingsbild aus und muss es dem anderen in drei Sätzen verkaufen. Danach stoßen wir am Schaumainkai an.'),
      I('🎷', 'Jazzkeller-Abend', 'Kultur', '€€', '2–3 Std.', 'Abends', 'Jazzkeller, Kleine Bockenheimer Straße',
        'Einer der ältesten Jazzclubs Deutschlands: Gewölbekeller, Livemusik und gute Gespräche in den Pausen.'),
    ] },
  { id: 'u_marie', name: 'Marie', age: 21, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Bockenheim',
    bio: 'Studiere Umweltwissenschaften an der Goethe-Uni. Fahrrad statt Auto, Hafermilch statt Kuhmilch – aber ohne erhobenen Zeigefinger 🌱',
    interests: ['Nachhaltigkeit', 'Radfahren', 'Pflanzen', 'Festivals', 'Picknick'],
    photos: [['#43E97B', '#1FA2A0', '🌱', 2], ['#FAD961', '#F76B1C', '🚲', 1]],
    ideas: [
      I('🚲', 'Radtour am Main bis Offenbach', 'Outdoor', '€', 'Halber Tag', 'Nachmittags', 'Start: Eiserner Steg',
        'Immer am Wasser entlang, Zwischenstopp am Offenbacher Hafen auf eine Limo. Wer zuerst schlappmacht, zahlt.'),
      I('🌱', 'Urban Gardening im Gemeinschaftsgarten', 'Entspannt', '€', '2–3 Std.', 'Morgens', 'Gemeinschaftsgarten, Bockenheim',
        'Ein bisschen Erde unter den Fingernägeln, danach selbst geerntete Kräuter im Gepäck. Garantiert ohne Smalltalk-Stress.'),
    ] },
  { id: 'u_julia', name: 'Julia', age: 34, gender: 'frau', interestedIn: ['mann'], city: 'Bad Homburg',
    bio: 'Product Managerin, Halbmarathon-Läuferin und bekennender Thermen-Fan. Ich suche jemanden, mit dem ich Pläne schmiede – und sie auch umsetze.',
    interests: ['Laufen', 'Wellness', 'Reisen', 'Wein', 'Tennis'],
    photos: [['#FF9A8B', '#FF5E7E', '🏃', 2], ['#38B2AC', '#84FAB0', '🧖', 1]],
    ideas: [
      I('🧖', 'Thermen-Nachmittag in der Taunus Therme', 'Entspannt', '€€€', 'Halber Tag', 'Nachmittags', 'Taunus Therme, Bad Homburg',
        'Sauna, Ruhebecken, Bademantel – und zwischendurch die besten Gespräche, weil keiner aufs Handy schaut.'),
      I('🏃', 'Morgenlauf im Kurpark & Frühstück', 'Sport', '€', '1–2 Std.', 'Morgens', 'Kurpark, Bad Homburg',
        'Gemütliche 5 Kilometer, das Tempo bestimmst du. Danach Croissants und Cappuccino – die haben wir uns dann verdient.'),
      I('🍷', 'Weinprobe im Rheingau', 'Essen & Trinken', '€€€', 'Halber Tag', 'Nachmittags', 'Weingut bei Eltville',
        'Mit der S-Bahn raus in die Weinberge, ein paar Rieslinge probieren und den Sonnenuntergang über dem Rhein anschauen.'),
    ] },
  { id: 'u_emma', name: 'Emma', age: 25, gender: 'frau', interestedIn: ['frau', 'mann', 'divers'], city: 'Offenbach am Main',
    bio: 'Illustratorin aus Offenbach (ja, wir sind cooler, als ihr denkt 😉). Ich zeichne heimlich Leute in der S-Bahn.',
    interests: ['Kunst', 'Design', 'Comedy', 'Katzen', 'Kino'],
    photos: [['#F093FB', '#F5576C', '🎨', 3], ['#5EE7DF', '#7F7FD5', '🐈', 1]],
    ideas: [
      I('🏺', 'Töpferkurs: Wir machen uns gegenseitig Tassen', 'Kultur', '€€', '2–3 Std.', 'Nachmittags', 'Töpferwerkstatt, Offenbach',
        'Jede:r töpfert eine Tasse für den anderen. Ob sie hübsch wird, ist zweitrangig – Hauptsache, sie hält Kaffee.'),
      I('🎬', 'Indie-Kino & Pommes-Diskussion', 'Kultur', '€', '2–3 Std.', 'Abends', 'Programmkino, Nordend',
        'Ein Film, den keiner von uns kennt, danach Pommes und eine leidenschaftliche Debatte über das Ende.'),
      I('🎤', 'Karaoke in der Privatkabine', 'Abenteuer', '€€', '1–2 Std.', 'Abends', 'Karaoke-Bar, Innenstadt',
        'Kein Publikum, nur wir zwei und ein Mikro. Ich singe ABBA, du darfst dir die Revanche aussuchen.'),
    ] },
  { id: 'u_nora', name: 'Nora', age: 38, gender: 'frau', interestedIn: ['mann'], city: 'Frankfurt-Innenstadt',
    bio: 'Architektin, Katzenmama und leidenschaftliche Hobbybäckerin. Ich zeige dir Frankfurt aus einer Perspektive, die du noch nicht kennst.',
    interests: ['Design', 'Kunst', 'Fotografie', 'Backen', 'Reisen'],
    photos: [['#8EC5FC', '#7B61FF', '🏙️', 2], ['#F6D365', '#FDA085', '🥐', 3]],
    ideas: [
      I('🏙️', 'Architektur-Spaziergang: Hochhäuser & Neue Altstadt', 'Kultur', '€', '2–3 Std.', 'Nachmittags', 'Start: Opernplatz',
        'Von der Alten Oper durchs Bankenviertel bis in die Neue Altstadt. Ich erzähle dir die Geschichten hinter den Fassaden.'),
      I('🌆', 'Sonnenuntergang auf dem Main Tower', 'Abenteuer', '€€', '1–2 Std.', 'Abends', 'Main Tower, Neue Mainzer Straße',
        '200 Meter über der Stadt, genau dann, wenn die Lichter angehen. Danach suchen wir uns unten ein kleines Restaurant.'),
    ] },
  { id: 'u_kim', name: 'Kim', age: 30, gender: 'frau', interestedIn: ['frau'], city: 'Frankfurt-Nordend',
    bio: 'Intensivpflegerin, schichtdiensterprobt und deshalb Meisterin der spontanen Pläne. Brunch um 15 Uhr? Bin dabei.',
    interests: ['Brunch', 'Yoga', 'Hunde', 'Konzerte', 'Camping'],
    photos: [['#FF758C', '#FF7EB3', '🐶', 1], ['#FAD961', '#F76B1C', '🎸', 2]],
    ideas: [
      I('🐶', 'Hundespaziergang im Holzhausenpark', 'Outdoor', '€', '1–2 Std.', 'Nachmittags', 'Holzhausenpark, Nordend',
        'Mein Beagle Bruno kommt mit und entscheidet, ob du sympathisch bist. Danach gibt\'s Kaffee am Wasserschlösschen.'),
      I('🎸', 'Konzert in der Batschkapp', 'Kultur', '€€', '2–3 Std.', 'Abends', 'Batschkapp, Seckbach',
        'Eine Band, die wir beide noch nicht kennen – Vorhören verboten. Überraschung garantiert, gute oder schlechte.'),
    ] },
  { id: 'u_max', name: 'Max', age: 28, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Bornheim',
    bio: 'Backend-Entwickler, der lieber draußen ist als vorm Bildschirm. Ich koche das beste Curry westlich von Offenbach (Quelle: meine Mitbewohner).',
    interests: ['Kochen', 'Radfahren', 'Gaming', 'Craft Beer', 'Wandern'],
    photos: [['#4FACFE', '#2563EB', '🚵', 1], ['#FAD961', '#F76B1C', '🍛', 3]],
    ideas: [
      I('🧀', 'Probier-Tour durch die Kleinmarkthalle', 'Essen & Trinken', '€€', '1–2 Std.', 'Mittags', 'Kleinmarkthalle, Innenstadt',
        'Wir teilen uns durch: Käse, Oliven, Fleischwurst – und zum Abschluss ein Glas Wein am berühmten Weinstand auf der Empore.'),
      I('🚵', 'Gravelbike-Tour in den Taunus', 'Sport', '€', 'Halber Tag', 'Morgens', 'Start: Bornheim Mitte',
        'Raus aus der Stadt, rein in den Wald. Ca. 50 km in gemütlichem Tempo, oben gibt\'s die verdiente Rast mit Aussicht.'),
      I('🔐', 'Escape Room: Schaffen wir\'s in 60 Minuten?', 'Abenteuer', '€€', '1–2 Std.', 'Abends', 'Escape Room, Ostend',
        'Der ultimative Teamwork-Test fürs erste Date. Wenn wir das schaffen, schaffen wir alles.'),
    ] },
  { id: 'u_lukas', name: 'Lukas', age: 32, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Sachsenhausen',
    bio: 'Assistenzarzt in der Unfallchirurgie – keine Sorge, ich flicke dich wieder zusammen, falls wir übermütig werden. Liebe den Main und Jazz.',
    interests: ['Jazz', 'Apfelwein', 'Schwimmen', 'Reisen', 'Laufen'],
    photos: [['#4FACFE', '#2563EB', '🌊', 2], ['#38B2AC', '#84FAB0', '🏄', 1]],
    ideas: [
      I('🏄', 'Stand-up-Paddling auf dem Main', 'Abenteuer', '€€', '2–3 Std.', 'Nachmittags', 'SUP-Verleih am Mainufer',
        'Wer zuerst ins Wasser fällt, zahlt die Getränke danach. Bretter und Westen leihen wir uns direkt vor Ort.'),
      I('🚋', 'Ebbelwei-Express & Abendessen in Sachsenhausen', 'Kultur', '€€', '2–3 Std.', 'Abends', 'Ebbelwei-Express, Römer',
        'Mit der bunten Oldtimer-Straßenbahn einmal quer durch die Stadt – Apfelwein und Brezeln an Bord inklusive.'),
    ] },
  { id: 'u_felix', name: 'Felix', age: 26, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Westend',
    bio: 'Promoviere in VWL und erkläre dir gern die Zinspolitik der EZB – oder wir reden einfach über Musik. Gitarre, Vinyl, Nachtspaziergänge.',
    interests: ['Vinyl', 'Konzerte', 'Lesen', 'Podcasts', 'Kaffee'],
    photos: [['#5B2A4E', '#C2577E', null, 2], ['#FFB547', '#FF5A3C', '🎶', 1]],
    ideas: [
      I('🎶', 'Plattenläden-Tour & Kaffee', 'Kultur', '€', '2–3 Std.', 'Nachmittags', 'Plattenläden im Nordend',
        'Wir stöbern durch die Kisten und suchen uns gegenseitig eine Platte aus. Danach Kaffee und erstes Probehören.'),
      I('🌙', 'Nachtspaziergang am Main', 'Entspannt', '€', '1–2 Std.', 'Abends', 'Eiserner Steg bis Osthafen',
        'Die Skyline spiegelt sich im Wasser, im Thermobecher gibt\'s Tee oder Glühwein – je nach Saison.'),
      I('🎤', 'Poetry Slam im Mousonturm', 'Kultur', '€', '2–3 Std.', 'Abends', 'Mousonturm, Ostend',
        'Mal lustig, mal berührend, immer überraschend. Und danach diskutieren wir, wer eigentlich hätte gewinnen müssen.'),
    ] },
  { id: 'u_david', name: 'David', age: 35, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Höchst',
    bio: 'Schreiner mit eigener Werkstatt. Ich baue Dinge, die bleiben. Am Wochenende am liebsten auf dem Wasser oder im Wald.',
    interests: ['Camping', 'Wandern', 'Hunde', 'Craft Beer', 'Fotografie'],
    photos: [['#38B2AC', '#84FAB0', '🛶', 3], ['#F6D365', '#FDA085', '🌲', 1]],
    ideas: [
      I('🛶', 'Kanutour auf der Lahn', 'Abenteuer', '€€', 'Ganzer Tag', 'Ganztags', 'Start: Weilburg an der Lahn',
        'Ein Tag auf dem Fluss: paddeln, auf einer Kiesbank picknicken, durch Schleusen fahren. Ich hab das schon oft gemacht – du bist in sicheren Händen.'),
      I('🏰', 'Höchster Altstadt & Schlosscafé', 'Kultur', '€', '1–2 Std.', 'Nachmittags', 'Schlossplatz, Höchst',
        'Fachwerk, Mainufer und Kuchen im Schlosscafé. Frankfurts unterschätztester Stadtteil – ich zeig ihn dir.'),
    ] },
  { id: 'u_tim', name: 'Tim', age: 23, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Gallus',
    bio: 'Duales Studium Informatik, nebenbei Barista. Ich mache dir den besten Flat White deines Lebens. Eintracht-Fan durch und durch 🦅',
    interests: ['Fußball', 'Kaffee', 'Gaming', 'Streetfood', 'Festivals'],
    photos: [['#FAD961', '#F76B1C', '⚽', 2], ['#C471F5', '#FA71CD', '🎮', 1]],
    ideas: [
      I('⚽', 'Eintracht-Spiel in der Kneipe schauen', 'Sport', '€', '2–3 Std.', 'Abends', 'Sportsbar, Sachsenhausen',
        'Trikot optional, Mitfiebern Pflicht. Und wenn\'s schlecht läuft, reden wir einfach über was anderes.'),
      I('⛳', 'Schwarzlicht-Minigolf', 'Abenteuer', '€€', '1–2 Std.', 'Abends', 'Schwarzlicht-Minigolf, Innenstadt',
        'Neonfarben, 18 Bahnen und ein ehrgeiziges Punktesystem. Wer gewinnt, sucht das Dessert danach aus.'),
    ] },
  { id: 'u_ben', name: 'Ben', age: 30, gender: 'mann', interestedIn: ['frau'], city: 'Frankfurt-Nordend',
    bio: 'Lokaljournalist – ich kenne jede Wasserhäuschen-Geschichte dieser Stadt. Frag mich nach dem besten Handkäs!',
    interests: ['Lesen', 'Apfelwein', 'Fotografie', 'Radfahren', 'Comedy'],
    photos: [['#FFB547', '#FF5A3C', '📰', 1], ['#43E97B', '#1FA2A0', '🌅', 3]],
    ideas: [
      I('🍺', 'Wasserhäuschen-Tour durchs Nordend', 'Entspannt', '€', '2–3 Std.', 'Abends', 'Start: Merianplatz',
        'Frankfurts Kiosk-Kultur von ihrer besten Seite: drei Wasserhäuschen, drei Geschichten und ein Feierabendbier auf der Bank.'),
      I('😂', 'Comedy-Open-Mic', 'Kultur', '€', '2–3 Std.', 'Abends', 'Comedy-Bar, Sachsenhausen',
        'Neue Talente, schlechte Witze, großartige Momente. Wer zuerst laut lacht, holt die nächste Runde.'),
      I('🌅', 'Sonnenuntergang am Lohrberg', 'Outdoor', '€', '1–2 Std.', 'Abends', 'Lohrberg, Seckbach',
        'Frankfurts letzter Weinberg mit Blick auf die ganze Skyline. Ich bringe eine Decke und eine Flasche Weinschorle mit.'),
    ] },
  { id: 'u_elias', name: 'Elias', age: 27, gender: 'mann', interestedIn: ['mann'], city: 'Frankfurt-Bornheim',
    bio: 'Erzieher, Hobbyfotograf und Brettspiel-Nerd. Mit mir wird\'s nie langweilig – versprochen.',
    interests: ['Brettspiele', 'Fotografie', 'Kochen', 'Theater', 'Wandern'],
    photos: [['#A18CD1', '#E58FD0', '🎲', 1], ['#4FACFE', '#2563EB', '📷', 2]],
    ideas: [
      I('🎲', 'Brettspielcafé-Abend', 'Entspannt', '€', '2–3 Std.', 'Abends', 'Brettspielcafé, Bornheim',
        'Hunderte Spiele, ein Tisch, zwei Getränke. Ich erkläre dir jedes Spiel – und lasse dich vielleicht sogar gewinnen.'),
      I('🎭', 'Theaterabend im English Theatre', 'Kultur', '€€', '2–3 Std.', 'Abends', 'English Theatre, Gallus',
        'Theater auf Englisch, danach in der Bar nebenan herausfinden, wer wirklich alles verstanden hat.'),
    ] },
  { id: 'u_yusuf', name: 'Yusuf', age: 33, gender: 'mann', interestedIn: ['frau'], city: 'Offenbach am Main',
    bio: 'Koch in einem kleinen Restaurant in Offenbach. Mein freier Tag ist Montag – den verbringe ich am liebsten auf Märkten oder im Grünen.',
    interests: ['Kochen', 'Wein', 'Wandern', 'Streetfood', 'Reisen'],
    photos: [['#FF9A8B', '#FF5E7E', '🍳', 3], ['#38B2AC', '#84FAB0', '🌴', 1]],
    ideas: [
      I('🥐', 'Markt-Frühstück an der Konstablerwache', 'Essen & Trinken', '€', '1–2 Std.', 'Morgens', 'Erzeugermarkt, Konstablerwache',
        'Wir schlendern über den Markt, probieren uns durch und frühstücken im Stehen mitten im Trubel. Ich zeige dir meine Lieblingsstände.'),
      I('🌴', 'Palmengarten & Picknick', 'Outdoor', '€', '2–3 Std.', 'Nachmittags', 'Palmengarten, Westend',
        'Tropenhaus, Rosengarten und danach ein Picknick, für das ich koche. Du musst nur gute Laune mitbringen.'),
    ] },
  { id: 'u_alex', name: 'Alex', age: 29, gender: 'divers', interestedIn: ['frau', 'mann', 'divers'], city: 'Frankfurt-Ostend',
    bio: 'Tontechniker:in bei Konzerten, Pronomen: they/them. Ich finde die besten Konzerte, bevor sie ausverkauft sind.',
    interests: ['Konzerte', 'Techno', 'Festivals', 'Vinyl', 'Radfahren'],
    photos: [['#C471F5', '#FA71CD', '🎛️', 2], ['#5B2A4E', '#C2577E', null, 3]],
    ideas: [
      I('🎵', 'Kleines Clubkonzert & Falafel', 'Kultur', '€€', '2–3 Std.', 'Abends', 'Club an der Konstablerwache',
        'Eine Band, über die in einem Jahr alle reden werden. Danach Falafel auf die Hand – Ohrensausen inklusive.'),
      I('🎯', 'Lasertag-Duell', 'Abenteuer', '€€', '1–2 Std.', 'Abends', 'Lasertag-Arena, Fechenheim',
        'Zwei Teams, ein Ziel: den anderen nach allen Regeln der Kunst besiegen. Danach Pizza, egal wer gewinnt.'),
    ] },
  { id: 'u_robin', name: 'Robin', age: 24, gender: 'divers', interestedIn: ['frau', 'mann', 'divers'], city: 'Frankfurt-Nordend',
    bio: 'Studiere an der Städelschule, liebe Secondhand, Siebdruck und Sonntagsspaziergänge ohne Ziel.',
    interests: ['Kunst', 'Flohmärkte', 'Design', 'Kaffee', 'Tanzen'],
    photos: [['#FF758C', '#FF7EB3', '🎨', 2], ['#8EC5FC', '#7B61FF', '🧭', 1]],
    ideas: [
      I('🎨', 'Siebdruck-Workshop', 'Kultur', '€€', '2–3 Std.', 'Nachmittags', 'Druckwerkstatt, Ostend',
        'Wir gestalten zusammen ein Motiv und drucken es auf Stoffbeutel. Am Ende hat jede:r ein Andenken an das Date.'),
      I('🧭', 'Würfel-Spaziergang durch die Stadt', 'Abenteuer', '€', '2–3 Std.', 'Nachmittags', 'Start: Hauptwache',
        'An jeder Kreuzung entscheidet der Würfel, wo\'s langgeht. Wo wir landen? Keine Ahnung – genau darum geht\'s.'),
    ] },
];

/** Geburtsdatum passend zum gewünschten Alter (stabil pro Person). */
function birthdateForAge(age, seed) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - (20 + (seed % 300)));
  return Util.isoDate(d);
}
/** Nächster Samstag (mind. 2 Tage in der Zukunft) um hh:mm – für vorbereitete Dates. */
function upcomingSaturday(hh, mm) {
  const d = new Date();
  let add = (6 - d.getDay() + 7) % 7;
  if (add < 2) add += 7;
  d.setDate(d.getDate() + add);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

/** Baut die komplette Ausgangsdatenbank (wird beim ersten Start und beim Reset genutzt). */
async function buildSeedDB() {
  const now = Date.now();
  const M = 60000, H = 3600000, D = 86400000;
  const users = [];
  const ideas = [];
  for (const p of SEED_PEOPLE) {
    const email = p.email || (p.id.replace('u_', '') + '@datedate.app');
    const seed = Util.hash(p.id);
    users.push({
      id: p.id,
      email,
      passwordHash: await hashPassword(email, TEST_PASSWORD),
      name: p.name,
      birthdate: birthdateForAge(p.age, seed),
      gender: p.gender,
      interestedIn: p.interestedIn,
      city: p.city,
      bio: p.bio,
      photos: p.photos.map((ph, i) => ({ id: `${p.id}_ph${i}`, colors: [ph[0], ph[1]], emoji: ph[2], pattern: ph[3] })),
      interests: p.interests,
      createdAt: now - (25 + (seed % 140)) * D,
      // Zusatzfelder für den Prototyp:
      isBot: !p.isTest,                // simulierte Person, reagiert automatisch
      isTestAccount: !!p.isTest,       // vorgefertigter Login-Account
      profileComplete: true,
      onboardingStep: 99,
      botLikesSeeded: true,
    });
    p.ideas.forEach((idea, idx) => {
      ideas.push({
        id: `${p.id}_i${idx + 1}`,
        ownerId: p.id,
        ...idea,
        active: true,
        deletedAt: null,
        createdAt: now - (3 + idx * 4 + (seed % 9)) * D,
      });
    });
  }

  const like = (id, from, ideaId, status, ago, message = null) => {
    const idea = ideas.find(i => i.id === ideaId);
    return { id, fromUserId: from, ideaId, toUserId: idea.ownerId, status, createdAt: now - ago, message,
      respondedAt: status === 'pending' ? null : now - ago + 30 * M };
  };
  const likes = [
    // Anfragen an Jonas (test1)
    like('like_s1', 'u_lena', 'u_test1_i1', 'pending', 2 * H, 'Café Wacker ist mein zweites Wohnzimmer ☕ Bin dabei!'),
    like('like_s2', 'u_clara', 'u_test1_i2', 'pending', 5 * H, 'Ich warne dich: Ich war Schulmeisterin 🏓'),
    like('like_s3', 'u_julia', 'u_test1_i1', 'pending', 26 * H, null),
    // Likes von Jonas
    like('like_s4', 'u_test1', 'u_hannah_i1', 'accepted', 2 * D + 2 * H, null),
    like('like_s5', 'u_test1', 'u_test2_i1', 'pending', 3 * H, 'Ich bin für jede Ramen-Empfehlung zu haben! 🍜'),
    like('like_s6', 'u_test1', 'u_sophie_i1', 'pending', 22 * H, null),
    like('like_s7', 'u_test1', 'u_aylin_i1', 'declined', 2 * D, 'Dumplings gehen immer!'), // abgelehnt – Jonas sieht weiter „offen“
    // Anfragen an Mia (test2)
    like('like_s8', 'u_max', 'u_test2_i2', 'pending', 4 * H, 'Goetheturm ist ein Klassiker! Danach Eis? 🍦'),
    like('like_s9', 'u_lukas', 'u_test2_i1', 'pending', 6 * H, null),
    // Likes von Mia
    like('like_s10', 'u_test2', 'u_felix_i1', 'accepted', 3 * D + 3 * H, null),
    like('like_s11', 'u_test2', 'u_ben_i1', 'pending', 20 * H, 'Ich will die Wasserhäuschen-Geschichten hören!'),
  ];

  const matches = [
    { id: 'match_s1', userIds: ['u_hannah', 'u_test1'], ideaId: 'u_hannah_i1', likeId: 'like_s4', createdAt: now - 2 * D - H, seenBy: ['u_hannah', 'u_test1'] },
    { id: 'match_s2', userIds: ['u_felix', 'u_test2'], ideaId: 'u_felix_i1', likeId: 'like_s10', createdAt: now - 3 * D - 2 * H, seenBy: ['u_felix', 'u_test2'] },
  ];
  const msg = (id, matchId, senderId, text, at, read = true) => ({ id, matchId, senderId, text, createdAt: at, read });
  const m1 = matches[0].createdAt, m2 = matches[1].createdAt;
  const messages = [
    msg('msg_s1', 'match_s1', 'u_test1', 'Hey Hannah! Handkäs mit Musik – ich bin gespannt, ob ich das mag 😄', m1 + 5 * M),
    msg('msg_s2', 'match_s1', 'u_hannah', 'Hi Jonas! Wer Handkäs nicht probiert hat, war nie richtig in Frankfurt 😉', m1 + 42 * M),
    msg('msg_s3', 'match_s1', 'u_test1', 'Challenge accepted! Kennst du eine gute Wirtschaft?', now - 1 * D),
    msg('msg_s4', 'match_s1', 'u_hannah', 'Ich schwöre auf die kleinen Wirtschaften rund um die Schweizer Straße. Wann hättest du denn Zeit? 🍏', now - 25 * M, false),
    msg('msg_s5', 'match_s2', 'u_felix', 'Hey Mia! Schön, dass du dabei bist 🎶 Was hörst du so?', m2 + 10 * M),
    msg('msg_s6', 'match_s2', 'u_test2', 'Hi Felix! Querbeet – von Indie-Folk bis Elektro 😄 Und du?', m2 + 55 * M),
    msg('msg_s7', 'match_s2', 'u_felix', 'Vor allem Jazz und 70er-Soul. Du wirst Platten von Labels sehen, von denen du noch nie gehört hast.', now - 2 * D),
    msg('msg_s8', 'match_s2', 'u_test2', 'Dann bringst du mir was bei! Ich schlag dir gleich einen Termin vor.', now - 2 * D + H),
    msg('msg_s9', 'match_s2', 'u_felix', 'Samstag passt perfekt, ich freu mich! 🙌', now - 2 * D + 2 * H + M),
  ];
  const proposals = [
    { id: 'prop_s1', matchId: 'match_s2', proposedBy: 'u_test2', dateTime: upcomingSaturday(15, 0), status: 'confirmed',
      createdAt: now - 2 * D + H + 2 * M, respondedAt: now - 2 * D + 2 * H },
  ];

  return {
    version: 1,
    seededAt: now,
    users, ideas, likes, matches, messages, proposals,
    passes: [],
    sessions: [],
    botQueue: [],      // geplante Reaktionen der simulierten Nutzer:innen
    botMemory: {},     // zuletzt genutzte Antwortvorlagen je Match (für Abwechslung)
  };
}

export { TEST_PASSWORD, TEST_ACCOUNTS, I, SEED_PEOPLE, birthdateForAge, upcomingSaturday, buildSeedDB };
