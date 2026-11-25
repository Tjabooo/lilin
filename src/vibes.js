// Vibes ("Moods" on Discover): hand-made categories like "Slow-burn rainy day thriller" or "90s indie
// nostalgia". Each one is a few TMDB discover queries (keywords, genres, years, languages, vote floors)
// plus anchor titles picked by hand, merged into one pool, scored, and ordered by the page with a
// seed so it doesn't look the same every visit (public/vibes.js).
//
// Keyword and title IDs are TMDB's and don't change; the names next to them are what TMDB calls them,
// and `node tools/vibes-check.mjs` checks every one against the API. Change a vibe, run that, then open
// the vibe in Lilin and judge whether the titles feel right.

// TMDB genres. Films and shows have different lists.
const M = { action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80, documentary: 99, drama: 18, family: 10751,
  fantasy: 14, history: 36, horror: 27, music: 10402, mystery: 9648, romance: 10749, scifi: 878, thriller: 53, war: 10752 };
const TV = { actionAdventure: 10759, animation: 16, comedy: 35, crime: 80, documentary: 99, drama: 18, family: 10751, kids: 10762,
  mystery: 9648, news: 10763, reality: 10764, scifiFantasy: 10765, soap: 10766, talk: 10767, warPolitics: 10768 };

// TMDB keywords: id → name (as TMDB spells it; tools/vibes-check.mjs compares).
export const KEYWORDS = {
  // tone (TMDB tags many titles with how they feel)
  suspenseful: [314730, 'suspenseful'], gloomy: [325822, 'gloomy'], melancholy: [4232, 'melancholy'], slowBurn: [277551, 'slow burn'],
  grim: [210162, 'grim'], dreary: [261264, 'dreary'], foreboding: [325817, 'foreboding'], depressing: [323809, 'depressing'],
  tense: [316832, 'tense'], ambiguous: [325763, 'ambiguous'], introspective: [269808, 'introspective'], mysterious: [197582, 'mysterious'],
  comforting: [325784, 'comforting'], cheerful: [325782, 'cheerful'], heartwarming: [319357, 'heartwarming'], feelgood: [275276, 'feelgood'],
  lighthearted: [288816, 'lighthearted'], whimsical: [324713, 'whimsical'], hopeful: [325824, 'hopeful'], joyful: [325832, 'joyful'],
  gentle: [325820, 'gentle'], calm: [209673, 'calm'], nostalgic: [164246, 'nostalgic'], bittersweet: [278730, 'bittersweet'],
  tragic: [325854, 'tragic'], tearjerker: [156924, 'tearjerker'], awestruck: [325775, 'awestruck'], complex: [239797, 'complex'],
  witty: [319397, 'witty'], cynical: [33424, 'cynical'], irreverent: [276775, 'irreverent'], absurd: [309974, 'absurd'],
  absurdist: [210710, 'absurdist'], surreal: [3307, 'surreal'], offbeat: [315905, 'offbeat'], eccentric: [10483, 'eccentric'],
  vibrant: [325856, 'vibrant'], inspirational: [281585, 'inspirational'], romantic: [324429, 'romantic'],
  // what happens, where and when
  neoNoir: [207268, 'neo-noir'], psychThriller: [12565, 'psychological thriller'], detective: [703, 'detective'], policeDetective: [15167, 'police detective'],
  murderInvestigation: [161982, 'murder investigation'], serialKiller: [10714, 'serial killer'], rain: [2217, 'rain'],
  independentFilm: [281237, 'independent film'], comingOfAge: [10683, 'coming of age'], sliceOfLife: [9914, 'slice of life'],
  nineties: [210608, '1990s'], eighties: [208289, '1980s'],
  nonlinear: [157171, 'nonlinear timeline'], timeLoop: [10854, 'time loop'], parallelWorld: [33465, 'parallel world'],
  alternateTimeline: [186760, 'alternate timeline'], virtualReality: [4563, 'virtual reality'], timeParadox: [208757, 'time paradox'],
  unreliableNarrator: [174089, 'unreliable narrator'], realityVsFantasy: [170351, 'reality vs fantasy'], identityCrisis: [3394, 'identity crisis'],
  dreamWorld: [186789, 'dream world'], timeTravel: [4379, 'time travel'],
  oneNight: [162914, 'one night'], nightclub: [2334, 'nightclub'], nineteenthCentury: [207928, '19th century'], eighteenthCentury: [160279, '18th century'],
  victorianEngland: [8250, 'victorian england'], forbiddenLove: [3691, 'forbidden love'], surrealism: [9887, 'surrealism'],
  sitcom: [193171, 'sitcom'], workplaceComedy: [210605, 'workplace comedy'], mockumentary: [11800, 'mockumentary'],
  cyberpunk: [12190, 'cyberpunk'], nightlife: [1759, 'night life'], urban: [33556, 'urban setting'], neon: [9822, 'neon'],
  nordicNoir: [191820, 'nordic noir'],
  summer: [13088, 'summer'], summerVacation: [14714, 'summer vacation'], summerCamp: [5767, 'summer camp'], summerRomance: [200129, 'summer romance'],
  heist: [10051, 'heist'], robbery: [642, 'robbery'], conArtist: [10453, 'con artist'], bankRobbery: [15363, 'bank robbery'],
  folkHorror: [209568, 'folk horror'], pagan: [155071, 'pagan'], cult: [6158, 'cult'], ritual: [4720, 'ritual'], village: [5331, 'village'],
  grief: [9872, 'grief'], lossOfLovedOne: [697, 'loss of loved one'], dyingAndDeath: [3737, 'dying and death'],
  darkComedy: [10123, 'dark comedy'], satire: [8201, 'satire'],
  space: [9882, 'space'], spaceTravel: [3801, 'space travel'], astronaut: [14626, 'astronaut'],
  whodunit: [12570, 'whodunit'], murderMystery: [207046, 'murder mystery'],
  conspiracy: [10410, 'conspiracy'], paranoia: [2340, 'paranoia'], governmentConspiracy: [181635, 'government conspiracy'],
  surveillance: [18420, 'surveillance'], espionage: [5265, 'espionage'], coldWar: [2106, 'cold war'],
  firstLove: [157303, 'first love'], teenager: [296608, 'teenager'], highSchool: [6270, 'high school'],
  roadTrip: [7312, 'road trip'], roadMovie: [167043, 'road movie'],
  dystopia: [4565, 'dystopia'], postApocalyptic: [4458, 'post-apocalyptic future'],
  chef: [18293, 'chef'], restaurant: [1946, 'restaurant'], cooking: [1918, 'cooking'], food: [10637, 'food'],
  christmas: [207317, 'christmas'], christmasEve: [260365, 'christmas eve'], santaClaus: [1991, 'santa claus'],
  halloween: [3335, 'halloween'], halloweenNight: [232795, 'halloween night'], trickOrTreating: [180193, 'trick or treating'],
  hauntedHouse: [3358, 'haunted house'], witch: [616, 'witch'],
  newYearsEve: [613, "new year's eve"], newYear: [252123, 'new year'], valentinesDay: [160404, "valentine's day"],
  snow: [10794, 'snow'], winter: [1442, 'winter'], blizzard: [156783, 'blizzard'], isolation: [1533, 'isolation'],
  periodDrama: [15060, 'period drama'], costumeDrama: [195013, 'costume drama'],
  anime: [210024, 'anime'], iyashikei: [291483, 'iyashikei'],
  underdog: [240, 'underdog'], sports: [6075, 'sports'],
};
const kw = (...names) => names.map((n) => {
  if (!KEYWORDS[n]) throw new Error(`vibes: unknown keyword ${n}`);
  return KEYWORDS[n][0];
}).join('|');
const g = (...ids) => ids.join('|');

// Anchor titles: [type, TMDB id, title as TMDB has it (checked by tools/vibes-check.mjs)].
const film = (id, title) => ['movie', id, title];
const show = (id, title) => ['tv', id, title];

// A vibe: `queries` are alternatives (each { movie?, tv? } of TMDB discover parameters), merged into one
// pool. `floor`: the least rating and votes a discovered title needs (anchors always count). `look`: the
// chip's two colours and its glyph (public/vibes.js). `months`: only shown in these months (1-12).
export const VIBES = [
  {
    id: 'rainy-thriller',
    name: { en: 'Slow-burn rainy day thriller', sv: 'Smygande thriller för regniga dagar' },
    blurb: { en: 'Grey skies, cold cases and a dread that builds and builds.', sv: 'Grå himmel, olösta fall och en olust som bara växer.' },
    look: ['#1d3243', '#6f8fa3', 'rain'],
    floor: { rating: 6.9, movie: 400, tv: 200 },
    queries: [
      { movie: { with_genres: g(M.thriller, M.mystery, M.crime), with_keywords: kw('slowBurn', 'gloomy', 'melancholy', 'grim', 'dreary', 'foreboding', 'depressing', 'rain'), without_genres: g(M.action, M.comedy, M.horror, M.animation, M.scifi, M.fantasy, M.family, M.adventure) },
        tv: { with_genres: g(TV.crime, TV.mystery), with_keywords: kw('slowBurn', 'gloomy', 'melancholy', 'grim', 'dreary', 'foreboding', 'depressing', 'neoNoir'), without_genres: g(TV.comedy, TV.animation, TV.actionAdventure, TV.scifiFantasy, TV.family) } },
      { movie: { with_genres: `${M.drama},${M.crime}`, with_keywords: kw('detective', 'policeDetective', 'murderInvestigation', 'serialKiller'), without_genres: g(M.action, M.comedy, M.horror, M.animation, M.scifi, M.fantasy, M.adventure) } },
      { boost: true, movie: { with_keywords: kw('neoNoir', 'suspenseful', 'tense', 'slowBurn', 'detective') }, tv: { with_keywords: kw('policeDetective', 'murderInvestigation', 'tense', 'suspenseful', 'detective') } },
    ],
    skip: ['tv:1398', 'tv:1438', 'tv:60059', 'tv:1405', 'tv:200875', 'movie:1422', 'movie:264644', 'movie:524', 'movie:4982', 'movie:3131', 'tv:66788', 'tv:113988', 'movie:414906', 'movie:379170', 'tv:65708', 'tv:69050'],
    anchors: [film(146233, 'Prisoners'), film(1949, 'Zodiac'), film(807, 'Se7en'), film(11423, 'Memories of Murder'), film(395834, 'Wind River'),
      film(322, 'Mystic River'), film(210577, 'Gone Girl'), show(46648, 'True Detective'), show(67744, 'MINDHUNTER'), show(1427, 'Broadchurch'),
      show(115004, 'Mare of Easttown'), show(34415, 'The Killing'), show(70453, 'Sharp Objects')],
  },
  {
    id: '90s-indie',
    name: { en: '90s indie nostalgia', sv: 'Indienostalgi från 90-talet' },
    blurb: { en: 'Slackers, record stores, long talks and lo-fi cool.', sv: 'Slackers, skivbutiker, långa samtal och lo-fi-coolhet.' },
    look: ['#4f3466', '#d79a52', 'cassette'],
    floor: { rating: 6.6, movie: 200, tv: 40 },
    queries: [
      { movie: { 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', with_keywords: kw('independentFilm', 'comingOfAge', 'sliceOfLife', 'nostalgic'), with_genres: g(M.drama, M.comedy), without_genres: g(M.action, M.horror, M.scifi, M.fantasy, M.animation, M.family, M.war, M.history, M.music) },
        tv: { 'first_air_date.gte': '1990-01-01', 'first_air_date.lte': '1999-12-31', with_keywords: kw('comingOfAge', 'sliceOfLife', 'highSchool', 'teenager'), with_genres: g(TV.drama, TV.comedy), without_genres: g(TV.animation, TV.kids, TV.family, TV.actionAdventure, TV.scifiFantasy) } },
      { movie: { 'primary_release_date.gte': '1990-01-01', with_keywords: `${KEYWORDS.nineties[0]},${KEYWORDS.comingOfAge[0]}`, with_genres: g(M.drama, M.comedy), without_genres: g(M.action, M.horror, M.scifi, M.fantasy, M.animation, M.thriller, M.war, M.history, M.crime) } },
    ],
    anchors: [film(2292, 'Clerks'), film(76, 'Before Sunrise'), film(2788, 'Reality Bites'), film(9571, 'Dazed and Confused'), film(2255, 'Chasing Amy'),
      film(11545, 'Rushmore'), film(627, 'Trainspotting'), film(13531, 'Empire Records'), film(10218, 'Swingers'), film(9464, "Buffalo '66"),
      film(14022, 'Slacker'), film(9603, 'Clueless'), film(1542, 'Office Space'), film(1443, 'The Virgin Suicides'),
      show(1101, 'My So-Called Life'), show(2382, 'Freaks and Geeks'), show(2131, 'Daria')],
  },
  {
    id: 'cozy',
    name: { en: 'Cozy and comforting', sv: 'Mysigt och tryggt' },
    blurb: { en: 'Blanket, tea, nothing bad happens. Or nothing too bad.', sv: 'Filt, te och inget hemskt händer. Eller inget för hemskt.' },
    look: ['#7a4a2c', '#e8b878', 'mug'],
    floor: { rating: 7, movie: 400, tv: 80 },
    queries: [
      { movie: { with_keywords: kw('comforting', 'heartwarming', 'feelgood', 'gentle'), with_genres: g(M.comedy, M.family, M.romance, M.animation), without_genres: g(M.horror, M.thriller, M.crime, M.war, M.action, M.adventure, M.scifi, M.history) },
        tv: { with_keywords: kw('comforting', 'heartwarming', 'feelgood', 'gentle'), with_genres: g(TV.comedy, TV.family, TV.animation), with_original_language: 'en', without_genres: g(TV.crime, TV.actionAdventure, TV.warPolitics, TV.mystery, TV.scifiFantasy) } },
      { boost: true, movie: { with_keywords: kw('cheerful', 'lighthearted', 'whimsical', 'hopeful', 'joyful') }, tv: { with_keywords: kw('cheerful', 'lighthearted', 'whimsical', 'hopeful', 'joyful') } },
    ],
    skip: ['tv:3796', 'tv:64396', 'movie:698508', 'movie:9571', 'movie:1297842'],
    anchors: [film(346648, 'Paddington 2'), film(194, 'Amélie'), film(8392, 'My Neighbor Totoro'), film(16859, "Kiki's Delivery Service"), film(212778, 'Chef'),
      film(122906, 'About Time'), film(331482, 'Little Women'), film(9489, "You've Got Mail"), show(4586, 'Gilmore Girls'), show(97546, 'Ted Lasso'),
      show(61662, "Schitt's Creek"), show(82728, 'Bluey'), show(124834, 'Heartstopper'), film(116149, 'Paddington'), film(12429, 'Ponyo'),
      show(108255, 'All Creatures Great & Small')],
  },
  {
    id: 'mind-bending',
    name: { en: 'Mind-bending', sv: 'Hjärnvridare' },
    blurb: { en: 'Loops, twists and timelines you’ll argue about afterwards.', sv: 'Tidsloopar, vändningar och tidslinjer att bråka om efteråt.' },
    look: ['#2a1f5c', '#9d6bff', 'spiral'],
    floor: { rating: 7, movie: 500, tv: 150 },
    queries: [
      { movie: { with_keywords: kw('nonlinear', 'timeLoop', 'parallelWorld', 'alternateTimeline', 'timeParadox', 'unreliableNarrator', 'realityVsFantasy', 'dreamWorld', 'identityCrisis'), with_genres: g(M.scifi, M.mystery, M.thriller), without_genres: g(M.animation, M.family, M.comedy, M.action, M.crime, M.war, M.history) },
        tv: { with_keywords: kw('nonlinear', 'timeLoop', 'parallelWorld', 'alternateTimeline', 'virtualReality'), with_genres: g(TV.scifiFantasy, TV.mystery), without_genres: g(TV.animation, TV.kids, TV.family, TV.comedy, TV.crime, TV.actionAdventure) } },
      { boost: true, movie: { with_keywords: kw('complex', 'surreal', 'timeTravel') }, tv: { with_keywords: kw('complex', 'surreal', 'timeTravel') } },
    ],
    skip: ['tv:93846', 'movie:55', 'movie:863873'],
    anchors: [film(27205, 'Inception'), film(77, 'Memento'), film(14337, 'Primer'), film(329865, 'Arrival'), film(141, 'Donnie Darko'),
      film(38, 'Eternal Sunshine of the Spotless Mind'), film(220289, 'Coherence'), film(206487, 'Predestination'), film(11324, 'Shutter Island'),
      film(1124, 'The Prestige'), show(70523, 'Dark'), show(95396, 'Severance'), show(84977, 'Russian Doll'), show(62560, 'Mr. Robot'), show(42009, 'Black Mirror')],
  },
  {
    id: 'comfort-sitcoms',
    name: { en: 'Comfort sitcoms', sv: 'Trygga sitcoms' },
    blurb: { en: 'The ones you put on for the hundredth time.', sv: 'De du sätter på för hundrade gången.' },
    look: ['#8a3b4e', '#f0a46a', 'couch'],
    floor: { rating: 7.2, tv: 300 },
    queries: [
      { tv: { with_keywords: kw('sitcom', 'workplaceComedy', 'mockumentary'), with_genres: String(TV.comedy), with_original_language: 'en', without_genres: g(TV.animation, TV.crime, TV.drama, TV.kids) } },
    ],
    skip: ['tv:5371'],
    anchors: [show(1668, 'Friends'), show(2316, 'The Office'), show(8592, 'Parks and Recreation'), show(48891, 'Brooklyn Nine-Nine'), show(1400, 'Seinfeld'),
      show(18347, 'Community'), show(4556, 'Scrubs'), show(1100, 'How I Met Your Mother'), show(3452, 'Frasier'), show(125935, 'Abbott Elementary'),
      show(1420, 'New Girl'), show(1421, 'Modern Family'), show(2004, 'Malcolm in the Middle'), show(62649, 'Superstore'), show(66573, 'The Good Place'),
      show(4589, 'Arrested Development'), show(61662, "Schitt's Creek")],
  },
  {
    id: 'late-night-neon',
    name: { en: 'Late-night neon', sv: 'Neon efter midnatt' },
    blurb: { en: 'Wet streets, synths, and someone driving too fast.', sv: 'Blöta gator, syntar och någon som kör för fort.' },
    look: ['#2b0f3d', '#ff3d8b', 'neon'],
    floor: { rating: 6.8, movie: 400, tv: 150 },
    queries: [
      { movie: { 'primary_release_date.gte': '1978-01-01', with_keywords: kw('oneNight', 'nightclub', 'nightlife', 'neon', 'urban'), with_genres: g(M.crime, M.thriller, M.drama), without_genres: g(M.comedy, M.family, M.animation, M.history, M.war, M.western, M.music) } },
      { movie: { with_keywords: kw('cyberpunk'), without_genres: g(M.comedy, M.family) }, tv: { with_keywords: kw('cyberpunk'), without_genres: g(TV.comedy, TV.family, TV.kids) } },
      { boost: true, movie: { 'primary_release_date.gte': '1978-01-01', with_keywords: kw('neoNoir'), with_genres: g(M.crime, M.thriller) }, tv: { with_keywords: kw('neoNoir') } },
    ],
    skip: ['movie:562', 'movie:280', 'movie:218', 'movie:627', 'movie:4982', 'movie:179144'],
    anchors: [film(64690, 'Drive'), film(335984, 'Blade Runner 2049'), film(78, 'Blade Runner'), film(1538, 'Collateral'), film(242582, 'Nightcrawler'),
      film(429200, 'Good Time'), film(11524, 'Thief'), film(949, 'Heat'), film(11104, 'Chungking Express'), film(11220, 'Fallen Angels'),
      film(9323, 'Ghost in the Shell'), film(245891, 'John Wick'), film(153, 'Lost in Translation'), film(103, 'Taxi Driver'),
      show(105248, 'Cyberpunk: Edgerunners'), show(90296, 'Tokyo Vice'), show(68421, 'Altered Carbon')],
  },
  {
    id: 'nordic-noir',
    name: { en: 'Nordic noir', sv: 'Nordisk noir' },
    blurb: { en: 'Long winters, quiet detectives and secrets under the snow.', sv: 'Långa vintrar, tystlåtna poliser och hemligheter under snön.' },
    look: ['#14262e', '#8fb3c0', 'snowflake'],
    floor: { rating: 6.4, movie: 100, tv: 15 },
    queries: [
      { movie: { with_keywords: kw('nordicNoir') }, tv: { with_keywords: kw('nordicNoir') } },
      { movie: { with_genres: `${M.crime},${M.thriller}`, with_origin_country: 'SE|DK|NO|IS|FI', without_genres: g(M.comedy, M.family, M.animation, M.action, M.horror) },
        tv: { with_genres: g(TV.crime), with_origin_country: 'SE|DK|NO|IS|FI', without_genres: g(TV.comedy, TV.family, TV.animation, TV.kids) } },
    ],
    skip: ['movie:553', 'movie:889699', 'movie:9065'],
    anchors: [show(45016, 'The Bridge'), show(32368, 'The Killing'), film(15472, 'The Girl with the Dragon Tattoo'), show(64852, 'Trapped'),
      film(70670, 'Headhunters'), film(26610, 'Insomnia'), film(196024, 'The Keeper of Lost Causes'), show(74802, 'Deadwind'), show(70337, 'Before We Die')],
  },
  {
    id: '80s-movie-night',
    name: { en: '80s movie night', sv: '80-talskväll' },
    blurb: { en: 'BMX gangs, big hair and adventures with a synth score.', sv: 'BMX-gäng, stort hår och äventyr med syntmusik.' },
    look: ['#3a1260', '#ff7a3d', 'star'],
    floor: { rating: 6.8, movie: 1500, tv: 300 },
    queries: [
      { movie: { 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', with_original_language: 'en', with_genres: g(M.adventure, M.comedy, M.family, M.scifi, M.fantasy), without_genres: g(M.horror, M.war, M.drama, M.animation) } },
      { movie: { 'primary_release_date.gte': '1990-01-01', with_keywords: kw('eighties'), with_genres: g(M.adventure, M.comedy, M.scifi, M.family), without_genres: g(M.horror, M.war, M.crime, M.drama, M.animation) } },
    ],
    anchors: [film(105, 'Back to the Future'), film(9340, 'The Goonies'), film(601, 'E.T. the Extra-Terrestrial'), film(620, 'Ghostbusters'),
      film(927, 'Gremlins'), film(9377, "Ferris Bueller's Day Off"), film(2108, 'The Breakfast Club'), film(1885, 'The Karate Kid'), film(235, 'Stand by Me'),
      show(66732, 'Stranger Things'), show(77169, 'Cobra Kai'), show(49009, 'The Goldbergs'), show(70573, 'GLOW'), film(369557, 'Sing Street')],
  },
  {
    id: 'endless-summer',
    name: { en: 'Endless summer', sv: 'Sommaren som aldrig tar slut' },
    blurb: { en: 'Warm nights, lake swims and summers that changed everything.', sv: 'Ljumma kvällar, sjöbad och somrar som ändrade allt.' },
    look: ['#e0643a', '#f7cf68', 'sun'],
    floor: { rating: 6.8, movie: 250, tv: 80 },
    queries: [
      { movie: { with_keywords: kw('summer', 'summerVacation', 'summerCamp', 'summerRomance'), with_genres: g(M.comedy, M.drama, M.romance, M.animation), without_genres: g(M.horror, M.thriller, M.crime, M.war, M.action, M.family) },
        tv: { with_keywords: kw('summer', 'summerVacation', 'summerCamp', 'summerRomance'), without_genres: g(TV.crime, TV.mystery, TV.actionAdventure, TV.kids, TV.animation) } },
      { boost: true, movie: { with_keywords: kw('comingOfAge', 'firstLove', 'nostalgic', 'bittersweet') } },
    ],
    skip: ['movie:500006', 'movie:802', 'tv:62875'],
    anchors: [film(398818, 'Call Me by Your Name'), film(147773, 'The Way Way Back'), film(16614, 'Adventureland'), film(83666, 'Moonrise Kingdom'),
      film(508943, 'Luca'), film(773, 'Little Miss Sunshine'), film(11528, 'The Sandlot'), film(965150, 'Aftersun'), film(11631, 'Mamma Mia!'),
      show(194766, 'The Summer I Turned Pretty')],
  },
  {
    id: 'one-last-job',
    name: { en: 'One last job', sv: 'En sista stöt' },
    blurb: { en: 'Crews, plans, double-crosses and the getaway car.', sv: 'Gäng, planer, dubbelspel och flyktbilen.' },
    look: ['#1f2a24', '#c9a24a', 'diamond'],
    floor: { rating: 6.7, movie: 800, tv: 150 },
    queries: [
      { movie: { with_keywords: kw('heist', 'bankRobbery', 'conArtist'), without_genres: g(M.horror, M.family, M.animation, M.scifi, M.fantasy) },
        tv: { with_keywords: kw('heist', 'conArtist'), without_genres: g(TV.kids, TV.animation, TV.family, TV.scifiFantasy) } },
      { boost: true, movie: { with_keywords: kw('robbery') }, tv: { with_keywords: kw('robbery') } },
    ],
    skip: ['movie:537996', 'movie:483'],
    anchors: [film(161, "Ocean's Eleven"), film(949, 'Heat'), film(388, 'Inside Man'), film(339403, 'Baby Driver'), film(399170, 'Logan Lucky'),
      film(23168, 'The Town'), film(107, 'Snatch'), film(100, 'Lock, Stock and Two Smoking Barrels'), film(968, 'Dog Day Afternoon'),
      show(71446, 'Money Heist'), show(96677, 'Lupin'), show(3764, 'Hustle')],
  },
  {
    id: 'folk-horror',
    name: { en: 'Folk horror', sv: 'Folkskräck' },
    blurb: { en: 'Remote villages, old rituals and a festival you shouldn’t stay for.', sv: 'Avlägsna byar, gamla riter och en fest du inte borde stanna på.' },
    look: ['#2a2f16', '#c9b25b', 'antlers'],
    floor: { rating: 6, movie: 150, tv: 50 },
    queries: [
      { movie: { with_keywords: kw('folkHorror', 'pagan'), without_genres: g(M.comedy, M.animation) }, tv: { with_keywords: kw('folkHorror'), without_genres: g(TV.comedy, TV.animation, TV.kids) } },
      { boost: true, movie: { with_genres: String(M.horror), with_keywords: kw('cult', 'ritual', 'village') } },
    ],
    anchors: [film(530385, 'Midsommar'), film(16307, 'The Wicker Man'), film(310131, 'The Witch'), film(74725, 'Kill List'), film(424121, 'Apostle'),
      film(788929, 'Lamb'), film(433808, 'The Ritual'), film(493922, 'Hereditary'), show(97400, 'Midnight Mass')],
  },
  {
    id: 'good-cry',
    name: { en: 'A good cry', sv: 'Ta fram näsdukarna' },
    blurb: { en: 'Grief, love, goodbyes. Have tissues nearby.', sv: 'Sorg, kärlek och avsked. Ha näsdukar nära.' },
    look: ['#23365c', '#88a9d8', 'drop'],
    floor: { rating: 7.2, movie: 800, tv: 200 },
    queries: [
      { movie: { with_keywords: kw('tearjerker', 'bittersweet', 'grief', 'lossOfLovedOne', 'dyingAndDeath'), with_genres: String(M.drama), without_genres: g(M.horror, M.thriller, M.crime, M.action, M.war, M.scifi, M.western, M.history) },
        tv: { with_keywords: kw('tearjerker', 'bittersweet', 'grief', 'lossOfLovedOne'), with_genres: String(TV.drama), without_genres: g(TV.crime, TV.mystery, TV.actionAdventure, TV.scifiFantasy) } },
      { boost: true, movie: { with_keywords: kw('tragic', 'melancholy') }, tv: { with_keywords: kw('tragic', 'melancholy') } },
    ],
    skip: ['movie:335', 'movie:490', 'movie:422', 'movie:439', 'movie:881', 'movie:44264', 'movie:922', 'movie:802', 'movie:175', 'movie:1677', 'movie:69', 'movie:334'],
    anchors: [film(334541, 'Manchester by the Sea'), film(12477, 'Grave of the Fireflies'), film(666277, 'Past Lives'), film(354912, 'Coco'), film(14160, 'Up'),
      film(46705, 'Blue Valentine'), film(258230, 'A Monster Calls'), film(965150, 'Aftersun'), show(67136, 'This Is Us'), show(89905, 'Normal People'),
      show(79410, 'After Life')],
  },
  {
    id: 'darkly-funny',
    name: { en: 'Darkly funny', sv: 'Kolsvart humor' },
    blurb: { en: 'Laughing at things you probably shouldn’t laugh at.', sv: 'Skratt åt sådant man kanske inte borde skratta åt.' },
    look: ['#1c1c22', '#d94f4f', 'smirk'],
    floor: { rating: 7, movie: 600, tv: 150 },
    queries: [
      { movie: { with_keywords: kw('darkComedy'), with_genres: String(M.comedy), without_genres: g(M.family, M.animation, M.horror, M.war, M.romance) },
        tv: { with_keywords: kw('darkComedy'), with_genres: String(TV.comedy), with_original_language: 'en', without_genres: g(TV.kids, TV.family, TV.animation, TV.actionAdventure, TV.scifiFantasy) } },
      { boost: true, movie: { with_keywords: kw('satire', 'cynical', 'irreverent') }, tv: { with_keywords: kw('satire', 'cynical', 'irreverent') } },
    ],
    skip: ['movie:637', 'movie:37165', 'movie:661374', 'movie:348678'],
    anchors: [film(8321, 'In Bruges'), film(674324, 'The Banshees of Inisherin'), film(402897, 'The Death of Stalin'), film(4944, 'Burn After Reading'),
      film(497828, 'Triangle of Sadness'), film(275, 'Fargo'), film(37495, 'Four Lions'), show(73107, 'Barry'), show(67070, 'Fleabag'), show(60622, 'Fargo'),
      show(83631, 'What We Do in the Shadows')],
  },
  {
    id: 'space-wonder',
    name: { en: 'Space and wonder', sv: 'Rymden och det stora okända' },
    blurb: { en: 'Big skies, small humans, and that feeling of awe.', sv: 'Stor himmel, små människor och den där känslan av vördnad.' },
    look: ['#0c1430', '#5e7bff', 'planet'],
    floor: { rating: 6.9, movie: 800, tv: 150 },
    queries: [
      { movie: { with_keywords: kw('space', 'spaceTravel', 'astronaut'), with_genres: g(M.scifi, M.drama, M.adventure), without_genres: g(M.comedy, M.horror, M.animation, M.family, M.action) },
        tv: { with_keywords: kw('space', 'spaceTravel', 'astronaut'), with_genres: g(TV.scifiFantasy, TV.drama, TV.documentary), without_genres: g(TV.comedy, TV.animation, TV.kids, TV.actionAdventure) } },
      { boost: true, movie: { with_keywords: kw('awestruck', 'complex') }, tv: { with_keywords: kw('awestruck', 'complex') } },
    ],
    skip: ['tv:6357', 'tv:73602'],
    anchors: [film(157336, 'Interstellar'), film(62, '2001: A Space Odyssey'), film(686, 'Contact'), film(286217, 'The Martian'), film(49047, 'Gravity'),
      film(329865, 'Arrival'), film(438631, 'Dune'), show(63639, 'The Expanse'), show(87917, 'For All Mankind'), show(58474, 'Cosmos')],
  },
  {
    id: 'whodunit',
    name: { en: 'Whodunit night', sv: 'Mordgåtekväll' },
    blurb: { en: 'A body, a house full of suspects, and you trying to guess first.', sv: 'Ett lik, ett hus fullt av misstänkta och du som försöker gissa först.' },
    look: ['#3b2318', '#d6a25f', 'magnifier'],
    floor: { rating: 6.7, movie: 400, tv: 100 },
    queries: [
      { movie: { with_keywords: kw('whodunit', 'murderMystery'), with_genres: g(M.mystery, M.comedy), without_genres: g(M.horror, M.action, M.animation, M.family) },
        tv: { with_keywords: kw('whodunit', 'murderMystery'), with_genres: String(TV.mystery), without_genres: g(TV.animation, TV.kids, TV.actionAdventure, TV.scifiFantasy) } },
    ],
    skip: ['tv:69050', 'movie:77'],
    anchors: [film(546554, 'Knives Out'), film(661374, 'Glass Onion: A Knives Out Mystery'), film(4176, 'Murder on the Orient Express'), film(15196, 'Clue'),
      film(5279, 'Gosford Park'), film(766475, 'See How They Run'), show(107113, 'Only Murders in the Building'), show(790, "Agatha Christie's Poirot"),
      show(764, 'Midsomer Murders'), show(41956, 'Death in Paradise')],
  },
  {
    id: 'paranoia',
    name: { en: 'Paranoia and conspiracies', sv: 'Paranoia och konspirationer' },
    blurb: { en: 'Someone is listening. Trust nobody, especially not the man in the suit.', sv: 'Någon lyssnar. Lita inte på någon, minst av allt mannen i kostym.' },
    look: ['#1b2620', '#7fbf8a', 'eye'],
    floor: { rating: 6.9, movie: 500, tv: 150 },
    queries: [
      { movie: { with_keywords: kw('conspiracy', 'paranoia', 'governmentConspiracy', 'surveillance', 'espionage'), with_genres: String(M.thriller), without_genres: g(M.comedy, M.horror, M.animation, M.family, M.fantasy, M.action, M.scifi) },
        tv: { with_keywords: kw('conspiracy', 'paranoia', 'governmentConspiracy', 'espionage'), with_genres: g(TV.mystery, TV.warPolitics), with_original_language: 'en', without_genres: g(TV.comedy, TV.animation, TV.kids, TV.scifiFantasy, TV.actionAdventure) } },
      { boost: true, movie: { with_keywords: kw('tense', 'suspenseful') }, tv: { with_keywords: kw('tense', 'suspenseful') } },
    ],
    anchors: [film(592, 'The Conversation'), film(891, "All the President's Men"), film(9798, 'Enemy of the State'), film(11963, 'Three Days of the Condor'),
      film(4566, 'Michael Clayton'), film(17365, 'The Parallax View'), film(49517, 'Tinker Tailor Soldier Spy'), show(62560, 'Mr. Robot'),
      show(1407, 'Homeland'), show(61859, 'The Night Manager'), show(95480, 'Slow Horses'), show(95396, 'Severance')],
  },
  {
    id: 'growing-up',
    name: { en: 'Growing up', sv: 'Att växa upp' },
    blurb: { en: 'First loves, best friends and the summer everything changed.', sv: 'Första kärleken, bästa vänner och sommaren då allt förändrades.' },
    look: ['#2f4a3a', '#e6c06a', 'bike'],
    floor: { rating: 7, movie: 600, tv: 150 },
    queries: [
      { movie: { with_keywords: kw('comingOfAge'), with_genres: g(M.drama, M.comedy), without_genres: g(M.horror, M.action, M.animation, M.scifi, M.fantasy, M.thriller, M.crime, M.war) },
        tv: { with_keywords: kw('comingOfAge', 'firstLove'), with_genres: g(TV.drama, TV.comedy), without_genres: g(TV.animation, TV.kids, TV.crime, TV.mystery, TV.scifiFantasy, TV.actionAdventure) } },
    ],
    anchors: [film(391713, 'Lady Bird'), film(85350, 'Boyhood'), film(489925, 'Eighth Grade'), film(84892, 'The Perks of Being a Wallflower'),
      film(376867, 'Moonlight'), film(505600, 'Booksmart'), film(235, 'Stand by Me'), film(8816, 'My Life as a Dog'), film(11634, 'Show Me Love'),
      show(81356, 'Sex Education'), show(65320, 'SKAM'), show(2382, 'Freaks and Geeks')],
  },
  {
    id: 'road-trip',
    name: { en: 'Road trip', sv: 'Ut på vägarna' },
    blurb: { en: 'Windows down, wrong turns, and who you are by the end of the road.', sv: 'Nedvevade rutor, fel avfarter och vem du är när vägen tar slut.' },
    look: ['#5c3a1e', '#e3a857', 'road'],
    floor: { rating: 6.8, movie: 500, tv: 100 },
    queries: [
      { movie: { with_keywords: kw('roadTrip', 'roadMovie'), without_genres: g(M.horror, M.animation, M.family, M.action, M.fantasy, M.scifi, M.crime, M.war) },
        tv: { with_keywords: kw('roadTrip'), without_genres: g(TV.animation, TV.kids, TV.family, TV.scifiFantasy) } },
    ],
    skip: ['movie:277216', 'movie:338967', 'movie:9769'],
    anchors: [film(773, 'Little Miss Sunshine'), film(1541, 'Thelma & Louise'), film(1391, 'Y Tu Mamá También'), film(129670, 'Nebraska'),
      film(655, 'Paris, Texas'), film(2609, 'Planes, Trains and Automobiles'), film(5915, 'Into the Wild'), film(1653, 'The Motorcycle Diaries'),
      film(9013, 'Midnight Run'), film(624, 'Easy Rider'), film(490132, 'Green Book')],
  },
  {
    id: 'bleak-futures',
    name: { en: 'Bleak futures', sv: 'Dystra framtider' },
    blurb: { en: 'The world ended, or got worse. People carry on anyway.', sv: 'Världen gick under, eller blev värre. Folk kämpar på ändå.' },
    look: ['#2b2b2b', '#c4703b', 'tower'],
    floor: { rating: 7, movie: 800, tv: 200 },
    queries: [
      { movie: { with_keywords: kw('dystopia', 'postApocalyptic'), without_genres: g(M.comedy, M.animation, M.family) },
        tv: { with_keywords: kw('dystopia', 'postApocalyptic'), without_genres: g(TV.comedy, TV.animation, TV.kids, TV.family) } },
    ],
    skip: ['movie:157336', 'movie:348', 'movie:550', 'movie:187', 'movie:438631', 'movie:263115', 'movie:18', 'tv:87917', 'tv:3322'],
    anchors: [film(9693, 'Children of Men'), film(76341, 'Mad Max: Fury Road'), film(110415, 'Snowpiercer'), film(68, 'Brazil'), film(782, 'Gattaca'),
      film(70160, 'The Hunger Games'), show(69478, "The Handmaid's Tale"), show(90972, 'Station Eleven'), show(100088, 'The Last of Us'),
      show(125988, 'Silo'), show(42009, 'Black Mirror')],
  },
  {
    id: 'kitchens',
    name: { en: 'Kitchens and chefs', sv: 'Kök och kockar' },
    blurb: { en: 'Hot pans, perfect plates and very stressed cooks.', sv: 'Heta pannor, perfekta tallrikar och mycket stressade kockar.' },
    look: ['#4a1d14', '#f08a4b', 'pan'],
    floor: { rating: 6.6, movie: 150, tv: 40 },
    queries: [
      { movie: { with_keywords: kw('chef', 'cooking'), without_genres: g(M.horror, M.action, M.family) },
        tv: { with_keywords: kw('chef', 'cooking'), with_genres: g(TV.drama, TV.comedy, TV.documentary), without_genres: g(TV.kids, TV.animation, TV.crime) } },
      { boost: true, movie: { with_keywords: kw('restaurant', 'food') }, tv: { with_keywords: kw('restaurant', 'food') } },
    ],
    skip: ['tv:2207', 'movie:523781'],
    anchors: [show(136315, 'The Bear'), film(212778, 'Chef'), film(2062, 'Ratatouille'), film(24803, 'Julie & Julia'), film(18203, 'Big Night'),
      film(80767, 'Jiro Dreams of Sushi'), film(11832, "Babette's Feast"), film(593643, 'The Menu'), film(11830, 'Tampopo'),
      film(228194, 'The Hundred-Foot Journey'), show(62391, "Chef's Table"), show(34549, 'The Great British Bake Off')],
  },
  {
    id: 'snowed-in-christmas',
    name: { en: 'Snowed-in Christmas', sv: 'Insnöad jul' },
    blurb: { en: 'Lights up, cocoa out. The ones you watch every December.', sv: 'Tänd ljusen, fram med chokladen. De du ser varje december.' },
    look: ['#6b1420', '#e7c46f', 'gift'],
    months: [11, 12],
    floor: { rating: 6.5, movie: 500, tv: 50 },
    queries: [
      { movie: { with_keywords: kw('christmas', 'christmasEve', 'santaClaus'), without_genres: g(M.horror, M.thriller, M.crime, M.action, M.war) },
        tv: { with_keywords: kw('christmas'), without_genres: g(TV.crime, TV.mystery) } },
    ],
    // Series where Christmas is only the backdrop, not a December watch (Smiley, La Palma, This Is England '88).
    skip: ['tv:52083', 'tv:214609', 'tv:242977', 'tv:42174'],
    anchors: [film(771, 'Home Alone'), film(10719, 'Elf'), film(508, 'Love Actually'), film(1581, 'The Holiday'), film(1585, "It's a Wonderful Life"),
      film(508965, 'Klaus'), film(562, 'Die Hard'), film(10437, 'The Muppet Christmas Carol'), film(51052, 'Arthur Christmas'), film(840430, 'The Holdovers')],
  },
  {
    id: 'halloween',
    name: { en: 'Halloween night', sv: 'Halloweenkväll' },
    blurb: { en: 'Pumpkins, witches and the house nobody should go into.', sv: 'Pumpor, häxor och huset ingen borde gå in i.' },
    look: ['#2a1206', '#f28c28', 'pumpkin'],
    months: [10],
    floor: { rating: 6.2, movie: 300, tv: 40 },
    queries: [
      { movie: { with_keywords: kw('halloween', 'halloweenNight', 'trickOrTreating'), without_genres: g(M.war, M.romance) },
        tv: { with_keywords: kw('halloween'), without_genres: g(TV.crime) } },
      { movie: { with_keywords: kw('hauntedHouse', 'witch'), with_genres: g(M.horror), without_genres: g(M.war, M.romance) } },
    ],
    // Titles with one Halloween scene that aren't Halloween films (every Harry Potter has a feast).
    skip: ['movie:671', 'movie:672', 'movie:673', 'movie:674', 'movie:675', 'movie:767', 'movie:12444', 'movie:12445', 'movie:83533', 'movie:58',
      'movie:10144', 'movie:411', 'movie:2454', 'movie:408', 'movie:10882', 'movie:62177', 'movie:10192', 'movie:259316', 'movie:338952',
      'movie:338953', 'movie:492', 'movie:630'],
    anchors: [film(10439, 'Hocus Pocus'), film(948, 'Halloween'), film(9479, 'The Nightmare Before Christmas'), film(23202, "Trick 'r Treat"),
      film(14836, 'Coraline'), film(4011, 'Beetlejuice'), film(8839, 'Casper'), film(2907, 'The Addams Family'), film(4232, 'Scream'),
      film(620, 'Ghostbusters'), film(3933, 'Corpse Bride'), show(119051, 'Wednesday')],
  },
  {
    id: 'new-years-eve',
    name: { en: "New Year's Eve", sv: 'Nyårsafton' },
    blurb: { en: 'Countdowns, last chances and a kiss at midnight.', sv: 'Nedräkningar, sista chanser och en kyss vid midnatt.' },
    look: ['#151a33', '#e8c872', 'firework'],
    months: [12, 1],
    floor: { rating: 6, movie: 150, tv: 30 },
    queries: [
      { movie: { with_keywords: kw('newYearsEve', 'newYear'), without_genres: g(M.horror, M.war) },
        tv: { with_keywords: kw('newYearsEve'), without_genres: g(TV.crime) } },
    ],
    skip: ['movie:240', 'movie:13', 'movie:110415', 'movie:605886', 'movie:5062', 'movie:157354', 'movie:551'],
    anchors: [film(639, 'When Harry Met Sally...'), film(15256, '200 Cigarettes'), film(284, 'The Apartment'), film(281, 'Strange Days'),
      film(1621, 'Trading Places'), film(13485, 'Holiday Inn'), film(122906, 'About Time'), film(62838, "New Year's Eve")],
  },
  {
    id: 'valentines',
    name: { en: "Valentine's date night", sv: 'Alla hjärtans dejtkväll' },
    blurb: { en: 'Grand gestures, near misses and the ones that finally say it.', sv: 'Stora gester, nästan-möten och de som till slut säger det.' },
    look: ['#3a0f1f', '#ff7a9a', 'heart'],
    months: [2],
    floor: { rating: 6.6, movie: 400, tv: 60 },
    queries: [
      { movie: { with_keywords: kw('valentinesDay'), without_genres: g(M.horror, M.thriller, M.crime) } },
      { movie: { with_genres: g(M.romance), with_keywords: kw('romantic', 'firstLove', 'heartwarming', 'feelgood'), without_genres: g(M.horror, M.war, M.thriller) },
        tv: { with_keywords: kw('romantic', 'firstLove'), with_genres: g(TV.drama, TV.comedy), without_genres: g(TV.crime, TV.kids) } },
    ],
    skip: ['tv:224372', 'tv:9156', 'tv:14009', 'tv:109958', 'tv:61664', 'tv:135959', 'movie:11020', 'movie:9820', 'movie:13', 'movie:854'],
    anchors: [film(639, 'When Harry Met Sally...'), film(76, 'Before Sunrise'), film(122906, 'About Time'), film(4348, 'Pride & Prejudice'),
      film(11036, 'The Notebook'), film(509, 'Notting Hill'), film(313369, 'La La Land'), film(50646, 'Crazy, Stupid, Love.'),
      film(4951, '10 Things I Hate About You'), film(38, 'Eternal Sunshine of the Spotless Mind'), film(712, 'Four Weddings and a Funeral')],
  },
  {
    id: 'snowbound',
    name: { en: 'Snowbound and freezing', sv: 'Snö, kyla och mörker' },
    blurb: { en: 'Cut off by the cold, and not everyone will make it to spring.', sv: 'Avskurna av kylan, och alla klarar sig inte till våren.' },
    look: ['#1b2b3a', '#cfe3f0', 'snowflake'],
    floor: { rating: 6.6, movie: 250, tv: 60 },
    queries: [
      { movie: { with_keywords: kw('snow', 'winter', 'blizzard'), with_genres: g(M.thriller, M.horror, M.mystery, M.crime, M.drama), without_genres: g(M.comedy, M.family, M.animation, M.romance, M.action, M.war, M.music, M.fantasy, M.history) },
        tv: { with_keywords: kw('snow', 'winter', 'isolation'), with_genres: g(TV.crime, TV.mystery, TV.drama), without_genres: g(TV.comedy, TV.family, TV.kids, TV.animation) } },
      { boost: true, movie: { with_keywords: kw('isolation', 'grim', 'foreboding', 'tense') }, tv: { with_keywords: kw('isolation', 'grim', 'tense') } },
    ],
    skip: ['movie:1197137', 'movie:1423191', 'tv:66272', 'tv:96977'],
    anchors: [film(1091, 'The Thing'), film(273248, 'The Hateful Eight'), film(13310, 'Let the Right One In'), film(694, 'The Shining'), film(275, 'Fargo'),
      film(395834, 'Wind River'), film(75174, 'The Grey'), film(320, 'Insomnia'), show(61335, 'Fortitude'), show(64852, 'Trapped'), show(60622, 'Fargo')],
  },
  {
    id: 'candlelight',
    name: { en: 'Corsets and candlelight', sv: 'Korsetter och levande ljus' },
    blurb: { en: 'Ballrooms, letters, longing looks across the drawing room.', sv: 'Balsalar, brev och längtande blickar över salongen.' },
    look: ['#3d2433', '#e3b7a0', 'candle'],
    floor: { rating: 7, movie: 300, tv: 80 },
    queries: [
      { movie: { with_keywords: kw('periodDrama', 'costumeDrama'), with_genres: String(M.romance), without_genres: g(M.war, M.action, M.horror, M.thriller, M.crime, M.comedy, M.animation) },
        tv: { with_keywords: kw('costumeDrama', 'nineteenthCentury', 'eighteenthCentury', 'victorianEngland'), with_genres: String(TV.drama), with_original_language: 'en', without_genres: g(TV.warPolitics, TV.actionAdventure, TV.crime, TV.animation, TV.mystery, TV.scifiFantasy) } },
      { movie: { with_keywords: kw('nineteenthCentury', 'eighteenthCentury', 'victorianEngland'), with_genres: String(M.romance), without_genres: g(M.war, M.action, M.horror, M.thriller, M.crime, M.comedy, M.animation) } },
      { boost: true, movie: { with_keywords: kw('forbiddenLove', 'periodDrama', 'romantic') }, tv: { with_keywords: kw('forbiddenLove', 'periodDrama', 'romantic') } },
    ],
    anchors: [film(4348, 'Pride & Prejudice'), show(91239, 'Bridgerton'), show(33907, 'Downton Abbey'), film(331482, 'Little Women'), film(4584, 'Sense and Sensibility'),
      film(556678, 'Emma.'), film(3175, 'Barry Lyndon'), film(10436, 'The Age of Innocence'), film(531428, 'Portrait of a Lady on Fire'),
      show(1457, 'Pride and Prejudice'), show(13643, 'North & South'), show(65494, 'The Crown')],
  },
  {
    id: 'gentle-anime',
    name: { en: 'Gentle anime', sv: 'Lugn anime' },
    blurb: { en: 'Soft colours, small adventures and a lot of heart.', sv: 'Mjuka färger, små äventyr och mycket hjärta.' },
    look: ['#2e4d5c', '#f2a7b5', 'blossom'],
    floor: { rating: 7.5, movie: 300, tv: 50 },
    queries: [
      { tv: { with_genres: String(TV.animation), with_original_language: 'ja', with_keywords: kw('iyashikei', 'calm', 'gentle', 'comforting'), without_genres: g(TV.actionAdventure, TV.crime) },
        movie: { with_genres: String(M.animation), with_original_language: 'ja', with_keywords: kw('sliceOfLife', 'comforting', 'heartwarming', 'whimsical', 'gentle', 'calm'), without_genres: g(M.action, M.horror, M.war, M.thriller) } },
      { boost: true, tv: { with_genres: String(TV.animation), with_keywords: kw('sliceOfLife', 'heartwarming', 'whimsical') } },
    ],
    skip: ['movie:820067', 'tv:99073', 'tv:272556', 'tv:118541', 'tv:95269'],
    anchors: [film(8392, 'My Neighbor Totoro'), film(16859, "Kiki's Delivery Service"), film(37797, 'Whisper of the Heart'), film(129, 'Spirited Away'),
      film(372058, 'Your Name.'), film(378064, 'A Silent Voice: The Movie'), show(75214, 'Violet Evergarden'), show(209867, "Frieren: Beyond Journey's End"),
      show(76075, 'Laid-Back Camp'), show(26867, 'Mushi-Shi'), show(67048, 'Barakamon'), show(69500, "Natsume's Book of Friends")],
  },
  {
    id: 'swedish-favourites',
    name: { en: 'Swedish favourites', sv: 'Svenska favoriter' },
    blurb: { en: 'Films and series from Sweden that everyone here has seen.', sv: 'Svenska filmer och serier som alla har sett.' },
    look: ['#0f3d6b', '#f2c94c', 'crown'],
    floor: { rating: 6.5, movie: 80, tv: 15 },
    queries: [
      { movie: { with_origin_country: 'SE', with_original_language: 'sv', without_genres: g(M.horror, M.animation) },
        tv: { with_origin_country: 'SE', with_original_language: 'sv', without_genres: g(TV.animation, TV.kids) } },
    ],
    anchors: [film(742, 'Together'), film(464, 'As It Is in Heaven'), film(348678, 'A Man Called Ove'), film(8816, 'My Life as a Dog'), film(11634, 'Show Me Love'),
      film(16026, 'Package Tour'), film(13310, 'Let the Right One In'), film(265189, 'Force Majeure'), show(31934, 'Solsidan'), show(51665, "Don't Ever Wipe Tears Without Gloves"),
      show(125910, 'Young Royals'), show(45016, 'The Bridge')],
  },
  {
    id: 'korean-twists',
    name: { en: 'Korean twists', sv: 'Koreanska vändningar' },
    blurb: { en: 'Thrillers from Seoul that never go where you think.', sv: 'Thrillers från Seoul som aldrig går dit du tror.' },
    look: ['#1d1235', '#e8506c', 'bolt'],
    floor: { rating: 7.2, movie: 400, tv: 80 },
    queries: [
      { movie: { with_original_language: 'ko', with_genres: g(M.thriller, M.crime, M.mystery), without_genres: g(M.animation, M.comedy, M.romance) },
        tv: { with_original_language: 'ko', with_genres: g(TV.crime, TV.mystery), without_genres: g(TV.animation, TV.comedy, TV.kids) } },
    ],
    anchors: [film(670, 'Oldboy'), film(496243, 'Parasite'), film(11423, 'Memories of Murder'), film(13855, 'The Chaser'), film(49797, 'I Saw the Devil'),
      film(491584, 'Burning'), film(30018, 'Mother'), film(396535, 'Train to Busan'), film(290098, 'The Handmaiden'), show(93405, 'Squid Game'),
      show(64840, 'Signal'), show(70593, 'Kingdom')],
  },
  {
    id: 'underdogs',
    name: { en: 'Underdog stories', sv: 'Underdogs som vägrar ge upp' },
    blurb: { en: 'Nobody believed in them. Cue the training montage.', sv: 'Ingen trodde på dem. Dags för träningsmontaget.' },
    look: ['#173b2c', '#f0b545', 'trophy'],
    floor: { rating: 6.9, movie: 500, tv: 100 },
    queries: [
      { movie: { with_keywords: kw('sports'), with_genres: g(M.drama, M.comedy, M.family), without_genres: g(M.horror, M.animation, M.documentary, M.thriller, M.crime) },
        tv: { with_keywords: kw('sports'), with_genres: g(TV.drama, TV.comedy), with_original_language: 'en', without_genres: g(TV.animation, TV.kids, TV.documentary, TV.reality) } },
      { boost: true, movie: { with_keywords: kw('underdog', 'inspirational') }, tv: { with_keywords: kw('underdog', 'inspirational') } },
    ],
    anchors: [film(1366, 'Rocky'), film(10637, 'Remember the Titans'), film(864, 'Cool Runnings'), film(60308, 'Moneyball'), film(10414, 'The Mighty Ducks'),
      film(5693, 'Hoosiers'), film(14534, 'Rudy'), show(4278, 'Friday Night Lights'), show(97546, 'Ted Lasso')],
  },
  {
    id: 'wonderfully-weird',
    name: { en: 'Wonderfully weird', sv: 'Underbart konstigt' },
    blurb: { en: 'Odd, dreamlike, impossible to explain to your parents.', sv: 'Udda, drömska och omöjliga att förklara för föräldrarna.' },
    look: ['#3b1d4a', '#5fd3b6', 'eye-swirl'],
    floor: { rating: 6.9, movie: 400, tv: 100 },
    queries: [
      { movie: { with_keywords: kw('surreal', 'absurdist', 'surrealism'), without_genres: g(M.family, M.animation, M.documentary, M.action, M.war, M.western) },
        tv: { with_keywords: kw('surreal', 'absurdist'), without_genres: g(TV.kids, TV.family, TV.animation, TV.crime) } },
      { boost: true, movie: { with_keywords: kw('absurd', 'offbeat', 'eccentric') }, tv: { with_keywords: kw('absurd', 'offbeat', 'eccentric') } },
    ],
    skip: ['tv:62286', 'movie:694', 'movie:627', 'movie:1429', 'movie:1360', 'movie:45612'],
    anchors: [film(492, 'Being John Malkovich'), film(545611, 'Everything Everywhere All at Once'), film(1018, 'Mulholland Drive'), film(254320, 'The Lobster'),
      film(985, 'Eraserhead'), film(347031, 'Swiss Army Man'), film(792307, 'Poor Things'), film(103328, 'Holy Motors'), show(67195, 'Legion'),
      show(1920, 'Twin Peaks'), show(65495, 'Atlanta'), show(73411, 'Maniac')],
  },
  // ---- time of day (hidden: not in the Moods row; public/daypart.js shows one as its own Discover row) ----
  {
    id: 'morning-short', hidden: true,
    name: { en: 'Good morning: short and bright', sv: 'God morgon: kort och ljust' },
    blurb: { en: 'Warm, light and over before the coffee goes cold.', sv: 'Varmt, lätt och slut innan kaffet hunnit kallna.' },
    look: ['#c8622a', '#ffcf8a', 'mug'],
    floor: { rating: 6.6, movie: 300, tv: 100 },
    queries: [
      { movie: { with_keywords: kw('cheerful', 'feelgood', 'lighthearted', 'heartwarming', 'comforting', 'joyful', 'whimsical', 'hopeful', 'gentle'),
        'with_runtime.gte': '60', 'with_runtime.lte': '100', without_genres: g(M.horror, M.thriller, M.crime, M.war, M.history) },
        tv: { with_keywords: kw('cheerful', 'feelgood', 'lighthearted', 'heartwarming', 'comforting', 'joyful', 'whimsical', 'witty'),
          'with_runtime.gte': '15', 'with_runtime.lte': '32', without_genres: g(TV.crime, TV.warPolitics, TV.mystery) } },
      { movie: { with_genres: g(M.comedy, M.animation, M.family), 'with_runtime.gte': '60', 'with_runtime.lte': '95', without_genres: g(M.horror, M.thriller, M.crime, M.war, M.drama) },
        tv: { with_genres: g(TV.comedy), with_keywords: kw('sitcom', 'workplaceComedy', 'mockumentary'), 'with_runtime.lte': '32', without_genres: g(TV.crime, TV.drama, TV.mystery) } },
    ],
    anchors: [film(8392, 'My Neighbor Totoro'), film(116149, 'Paddington'), film(533, 'Wallace & Gromit: The Curse of the Were-Rabbit'), film(7443, 'Chicken Run'),
      film(10315, 'Fantastic Mr. Fox'), film(120467, 'The Grand Budapest Hotel'),
      show(8592, 'Parks and Recreation'), show(48891, 'Brooklyn Nine-Nine'), show(61662, "Schitt's Creek"), show(66573, 'The Good Place'), show(125935, 'Abbott Elementary')],
  },
  {
    // Films only: TMDB's runtime filter doesn't hold for shows (Breaking Bad got in), so "under 95 min" would lie.
    id: 'late-night', hidden: true,
    name: { en: 'Late night: under 95 min', sv: 'Sent i natt: under 95 min' },
    blurb: { en: 'Dark, strange and short enough to finish before you nod off.', sv: 'Mörkt, konstigt och kort nog att se klart innan du somnar.' },
    look: ['#0c0a1c', '#5a3d8c', 'eye'],
    floor: { rating: 6.3, movie: 250, tv: 60 },
    queries: [
      { movie: { with_keywords: kw('surreal', 'surrealism', 'absurd', 'absurdist', 'offbeat', 'mysterious', 'dreamWorld', 'realityVsFantasy', 'timeLoop', 'cult'),
        'with_runtime.gte': '65', 'with_runtime.lte': '95', without_genres: g(M.family, M.romance, M.music, M.animation, M.action, M.war, M.adventure, M.comedy) } },
      { movie: { with_genres: g(M.horror, M.scifi, M.mystery), with_keywords: kw('gloomy', 'foreboding', 'grim', 'tense', 'suspenseful', 'mysterious', 'paranoia', 'isolation'),
        'with_runtime.gte': '65', 'with_runtime.lte': '95', without_genres: g(M.family, M.comedy, M.romance, M.animation) } },
      { boost: true, movie: { with_keywords: kw('neoNoir', 'oneNight', 'nightlife', 'neon', 'cyberpunk', 'darkComedy'), 'with_runtime.lte': '95' } },
    ],
    anchors: [film(985, 'Eraserhead'), film(473, 'Pi'), film(14337, 'Primer'), film(220289, 'Coherence'), film(431, 'Cube'), film(837, 'Videodrome'),
      film(14139, 'Timecrimes'), film(25623, 'House'), film(1694, 'Re-Animator'), film(2667, 'The Blair Witch Project'),
      film(4011, 'Beetlejuice'), film(892, 'Delicatessen')],
  },
];

const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_WITHOUT = { movie: [M.documentary], tv: [TV.documentary, TV.news, TV.reality, TV.soap, TV.talk, TV.kids] };
const RAW_PAGES = 2; // pages per query and type, sorted by vote count

// The TMDB parameters for one query of a vibe. Exported for the tests.
export function discoverParams(vibe, query, type, page = 1, day = today()) {
  const params = query[type];
  if (!params) return null;
  const floor = { ...(vibe.floor || {}), ...(query.floor || {}) };
  const without = new Set([...DEFAULT_WITHOUT[type], ...String(params.without_genres || '').split(/[|,]/).filter(Boolean).map(Number)]);
  for (const id of String(params.with_genres || '').split(/[|,]/).filter(Boolean).map(Number)) without.delete(id);
  const dateKey = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
  return {
    sort_by: query.sort || 'vote_count.desc',
    ...params,
    ...(without.size ? { without_genres: [...without].join(',') } : {}),
    'vote_count.gte': String(floor[type] ?? 100),
    'vote_average.gte': String(floor.rating ?? 6),
    include_adult: 'false',
    [dateKey]: params[dateKey] && params[dateKey] < day ? params[dateKey] : day,
    page: String(page),
  };
}

// How good a title is for its vibe: a vote-weighted rating, a little for being well known, more for
// turning up in several of the vibe's queries, and most for being one of its hand-picked anchors.
export function scoreTitle(t, { hits = 1, anchor = false } = {}) {
  const votes = t.votes || 0, prior = t.type === 'tv' ? 150 : 600;
  const rating = ((t.rating || 0) * votes + 6.3 * prior) / (votes + prior);
  return Math.round((rating + 0.18 * Math.log10(votes + 1) + 0.25 * Math.min(hits - 1, 2) + (anchor ? 0.9 : 0)) * 100) / 100;
}

export const vibeTypes = (vibe) => ['movie', 'tv'].filter((t) => vibe.queries.some((q) => q[t]) || vibe.anchors.some(([type]) => type === t));
export const inSeason = (vibe, month = new Date().getMonth() + 1) => !vibe.months || vibe.months.includes(month);

const POOL_TTL = 6 * 3600 * 1000;
const POOL_MAX = 120;

// One vibe's titles from its answers: `found` is [{ boost, titles }] per TMDB page, `anchors` the anchor
// titles (null where TMDB had none). A title found only by `boost` queries doesn't count; each extra
// query that found it raises it. `skip` leaves out titles that match the queries but not the feeling.
export function poolFrom(vibe, found, anchors) {
  const skip = new Set(vibe.skip || []);
  const pool = new Map();
  for (const { boost, titles } of found) {
    for (const t of titles) {
      const key = `${t.type}:${t.id}`;
      const hit = pool.get(key) || { t, hits: 0, core: false, anchor: false };
      hit.hits += 1; // pages of one query don't overlap, so this counts the queries that found it
      hit.core ||= !boost;
      pool.set(key, hit);
    }
  }
  for (const t of anchors) {
    if (!t) continue;
    const key = `${t.type}:${t.id}`;
    pool.set(key, { ...(pool.get(key) || { hits: 1 }), t, core: true, anchor: true });
  }
  return [...pool.entries()]
    .filter(([key, { t, core }]) => core && t.poster && !skip.has(key))
    .map(([, { t, hits, anchor }]) => ({ ...t, score: scoreTitle(t, { hits, anchor }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, POOL_MAX);
}

// deps: { tmdb(endpoint, params) (in the viewer's language), mapTitle(raw, type), language() }
export function createVibes(deps) {
  const lang = () => (deps.language?.() === 'sv' ? 'sv' : 'en');
  const pools = new Map(); // `${lang}:${id}` -> { at, promise }

  const publicVibe = (v) => ({
    id: v.id, name: v.name[lang()] || v.name.en, blurb: v.blurb[lang()] || v.blurb.en,
    colors: v.look.slice(0, 2), glyph: v.look[2], types: vibeTypes(v), seasonal: Boolean(v.months),
  });

  function list({ month } = {}) {
    return VIBES.filter((v) => !v.hidden && inSeason(v, month)).map(publicVibe);
  }

  async function anchorTitle([type, id]) {
    const d = await deps.tmdb(`/${type}/${id}`, {}).catch(() => null);
    if (!d || d.adult) return null;
    return deps.mapTitle({ ...d, genre_ids: (d.genres || []).map((x) => x.id) }, type);
  }

  async function buildPool(v) {
    const day = today();
    const asks = [];
    for (const query of v.queries) {
      for (const type of ['movie', 'tv']) {
        for (let page = 1; page <= (query.pages || RAW_PAGES); page++) {
          const params = discoverParams(v, query, type, page, day);
          if (!params) continue;
          asks.push(deps.tmdb(`/discover/${type}`, params)
            .then((d) => ({ boost: Boolean(query.boost), titles: (d.results || []).map((x) => deps.mapTitle(x, type)) }))
            .catch(() => ({ boost: true, titles: [] })));
        }
      }
    }
    const [found, anchors] = await Promise.all([Promise.all(asks), Promise.all(v.anchors.map(anchorTitle))]);
    return poolFrom(v, found, anchors);
  }

  // One vibe's titles, best first (the page orders them itself), or null if there's no such vibe.
  async function vibe(id, { month } = {}) {
    const v = VIBES.find((x) => x.id === id && inSeason(x, month));
    if (!v) return null;
    const key = `${lang()}:${v.id}`;
    let hit = pools.get(key);
    if (!hit || Date.now() - hit.at > POOL_TTL) {
      hit = { at: Date.now(), promise: buildPool(v) };
      pools.set(key, hit);
      hit.promise.then((items) => { if (!items.length) pools.delete(key); }, () => pools.delete(key));
    }
    return { ...publicVibe(v), results: await hit.promise };
  }

  return { list, vibe };
}
