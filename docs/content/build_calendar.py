"""Nyoni Couture content calendar, 7 Oct – 31 Dec 2026: one post a day.

Every post is one short video made from a FIRST frame and a LAST frame (generated in ChatGPT), which an
animation tool (Kling / Higgsfield / Omni / Runway, start-and-end-frame mode) turns into a 5–8 s clip.
"""
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

S = 'https://nyonicouture.com/product/'
# --- products (working links only; Walnut Tweed Pant and Black Satin Tuxedo Pants are excluded: 404) ---
P = {
    'navy3': ('Midnight Navy Three Piece Suit', 895, S + 'three-piece-suit/nathan/', 'a midnight-navy solid wool three-piece suit (single-breasted jacket, matching waistcoat, matching trousers)'),
    'char3': ('Charcoal Three Piece Suit', 895, S + 'three-piece-suit/grayson/', 'a charcoal solid wool three-piece suit (single-breasted jacket, matching waistcoat, matching trousers)'),
    'evano': ('Evano Windowpane Three Piece Suit', 895, S + 'three-piece-suit/evano-windowpane/', 'a grey windowpane-check wool three-piece suit'),
    'perseo': ('Dove Gray Herringbone Double Breast Suit', 985, S + 'double-breasted/perseo/', 'a dove/silver-grey herringbone wool double-breasted suit'),
    'tux': ('Sovereign Black Double-Breasted Tuxedo', 895, S + 'tuxedo/opel-black-tux/', 'a black double-breasted tuxedo with satin peak lapels and a six-button front, matching black trousers'),
    'indigo': ('Indigo Jacquard Tailored Blazer', 495, S + 'blazers/navy-aztec-blazer/', 'a navy blazer with a tonal jacquard texture'),
    'ivoire': ('Ivoire Double-Breasted Blazer', 495, S + 'blazers/ivoire-blazer-2/', 'an ivory double-breasted blazer with peak lapels'),
    'thomson': ('Thomson Blazer', 1095, S + 'blazers/thomson-blazer/', 'a burnt-ochre (rust) unstructured open-weave blazer'),
    'vicenzo': ('Vicenzo Blazer', 895, S + 'blazers/vicenzo/', 'a grey mélange textured blazer'),
    'james': ('James Blazer', 1095, S + 'blazers/james-blazer/', 'a grey-green glen-check blazer with a soft windowpane overcheck'),
    'blackp': ('Classic Side Adjuster Dress Pants', 195, S + 'trousers/nyoni-classic-side-adjuster-dress-pants/', 'black wool dress trousers with side adjusters'),
    'taupep': ('Taupe Flat Front Tailored Dress Pants', 265, S + 'trousers/nyoni-taupe-flat-front-tailored-dress-pants/', 'taupe flat-front tailored wool trousers'),
    'glenp': ('Midnight Glen Plaid Pant', 195, S + 'trousers/nyoni-midnight-glen-plaid-pant/', 'navy glen-plaid tailored trousers'),
    'chalc': ('Chalcedony Shawl Waistcoat', 225, S + 'accessories/vest/chalcedony/', 'a plain charcoal shawl-collar waistcoat'),
    'kenzie': ('Kenzie Waistcoat', 186, S + 'accessories/vest/kenzie/', 'a navy wool waistcoat'),
    'yuma': ('Yuma Double-Breasted Waistcoat', 225, S + 'accessories/vest/yuma/', 'a mid-grey double-breasted shawl-collar waistcoat'),
    'hematite': ('Hematite Windowpane Waistcoat', 225, S + 'accessories/vest/hematite/', 'a blue waistcoat with a fine windowpane check'),
    'gabbro': ('Gabbro Marbled Waistcoat', 225, S + 'accessories/vest/gabbro/', 'a marbled black-and-ivory waistcoat'),
    'antwerp': ('Antwerp Wing-Tip Boot', 495, S + 'boots/antwerp-wing-tip/', 'cognac-brown calf wing-tip boots with a buttoned side'),
    'roma': ('Roma Wing-Tip Boot', 495, S + 'boots/roma-wing-tip/', 'black calf-and-suede laced wing-tip boots'),
    'monaco': ('Monaco Cap-Toe Boot', 550, S + 'boots/monaco-cap-toe/', 'black calf cap-toe boots with a buckled strap'),
    'chelsea': ('Chelsea II Boot', 495, S + 'boots/chelsea-ii/', 'black calf Chelsea boots with a brogued wing-tip'),
    'hamburg': ('Hamburg Wing-Tip Boot', 495, S + 'boots/hamburg-wing-tip/', 'black calf side-zip wing-tip boots'),
    'silvano': ('Silvano Pocket Square', 69, S + 'accessories/pocket-squares/silvano-2/', 'a navy silk pocket square with a fine ivory foliate print'),
    'paisley': ('Paisley Pocket Square', 69, S + 'accessories/pocket-squares/paisley/', 'a black silk pocket square with a small ivory paisley'),
    'belagio': ('Belagio Pocket Square', 69, S + 'accessories/pocket-squares/belagio-2/', 'a deep-teal paisley silk pocket square'),
    'venez': ('Venez Pocket Square', 69, S + 'accessories/pocket-squares/venez-2/', 'a copper baroque-print black silk pocket square'),
    'serenata': ('Serenata Pocket Square', 69, S + 'accessories/pocket-squares/serenata-2/', 'a blue-and-ivory striped silk pocket square'),
    'belt': ('Black Leather Belt', 145, S + 'uncategorized/black-belt-2/', 'a black calf leather belt with a squared buckle'),
}

# --- outfits: (label, pieces, shirt) ---
O = {
    'navy3': ('Navy + Teal', ['navy3', 'belagio', 'antwerp'], 'a crisp white shirt, no tie'),
    'char3': ('Charcoal + Black', ['char3', 'paisley', 'chelsea', 'belt'], 'a white shirt and a slim black tie'),
    'evano': ('Grey Windowpane', ['evano', 'serenata', 'roma'], 'a pale-blue shirt, no tie'),
    'perseo': ('Silver-Grey DB', ['perseo', 'silvano', 'roma'], 'a white shirt and a navy knit tie'),
    'tux': ('Black Tie', ['tux', 'paisley', 'monaco'], 'a white dress shirt and a black silk bow tie'),
    'indigo_taupe': ('Navy + Taupe', ['indigo', 'taupep', 'antwerp', 'venez'], 'a white open-collar shirt'),
    'ivoire_black': ('Ivory + Black', ['ivoire', 'blackp', 'chelsea', 'belt'], 'a black fine-knit roll-neck'),
    'thomson_glen': ('Rust + Navy Plaid', ['thomson', 'glenp', 'antwerp', 'venez'], 'a cream open-collar shirt'),
    'vicenzo_black': ('Grey + Black', ['vicenzo', 'blackp', 'monaco', 'belt'], 'a white shirt, no tie'),
    'james_taupe': ('Grey-Green Check + Taupe', ['james', 'taupep', 'antwerp'], 'a light-blue oxford shirt'),
    'kenzie_navy': ('Navy Waistcoat, Sleeves Rolled', ['kenzie', 'taupep', 'antwerp'], 'a white shirt with sleeves rolled to the forearm'),
    'chalc_black': ('Charcoal Waistcoat + Black', ['chalc', 'blackp', 'chelsea', 'belt'], 'a white shirt with sleeves rolled'),
    'yuma_taupe': ('Grey DB Waistcoat + Taupe', ['yuma', 'taupep', 'antwerp'], 'a pale-blue shirt, top button open'),
    'hematite_glen': ('Blue Waistcoat + Plaid', ['hematite', 'glenp', 'roma'], 'a white shirt and a navy tie'),
    'gabbro_black': ('Marbled Waistcoat Party Look', ['gabbro', 'blackp', 'monaco', 'belt'], 'a white dress shirt and a black bow tie'),
    'indigo_black': ('Navy + Black', ['indigo', 'blackp', 'monaco', 'belt', 'silvano'], 'a black fine-knit roll-neck'),
    'ivoire_glen': ('Ivory + Navy Plaid', ['ivoire', 'glenp', 'antwerp'], 'a white open-collar shirt'),
    'thomson_black': ('Rust + Black', ['thomson', 'blackp', 'chelsea', 'belt'], 'a black fine-knit roll-neck'),
    'char_taupe': ('Charcoal Jacket + Taupe', ['char3', 'taupep', 'antwerp'], 'a white shirt, no tie (wear only the charcoal suit JACKET with the taupe trousers)'),
    'navy_hematite': ('Navy Suit + Blue Windowpane Waistcoat', ['navy3', 'hematite', 'monaco', 'silvano'], 'a white shirt and a navy tie (swap the suit waistcoat for the blue windowpane one)'),
    'ivoire_tux': ('Ivory Dinner Jacket', ['ivoire', 'tux', 'paisley', 'monaco'], 'a white dress shirt and a black bow tie (ivory blazer over the black tuxedo TROUSERS)'),
    'perseo_yuma': ('Grey DB + Grey Waistcoat', ['perseo', 'yuma', 'roma'], 'a white shirt and a burgundy tie'),
}

HIM = ("'The Nyoni Man': a man in his early 30s, athletic-slim build, 6'0\", warm medium-brown skin, short tapered black hair, "
       "neatly trimmed beard, calm confident expression")
HER = ("'Her': a woman in her early 30s with natural curly hair, elegant minimal styling and a warm smile")

SETTINGS = {
    10: ['a warm loft with a tall window and soft autumn light', 'a brick city street lined with orange autumn trees', 'a sunlit stone terrace with autumn vines', 'a minimalist studio with a warm beige backdrop'],
    11: ['a wood-panelled library with warm lamps', 'a city street at blue-hour dusk with shop lights', 'a hotel corridor at golden hour', 'a minimalist studio with a deep green backdrop'],
    12: ['a hotel lobby with a tall decorated Christmas tree', 'a dark lounge with brass lamps and velvet chairs', 'a snowy city street at night with warm window lights', 'a minimalist studio with a deep burgundy backdrop'],
}

def pieces_text(keys):
    return '; '.join(f'{P[k][3]} (“{P[k][0]}”)' for k in keys)

def links(keys):
    return '\n'.join(f'{P[k][0]} (${P[k][1]:,}): {P[k][2]}' for k in keys)

def first_prompt(setting, outfit_key, pose, her=None):
    label, keys, shirt = O[outfit_key]
    cast = f"{HIM}. Use the attached 'Nyoni Man' reference image for his face and build." + (f" With him, {HER} (use her attached reference image); she wears {her}." if her else '')
    return (f"Photorealistic vertical 9:16 photo, shot on a phone at chest height. Setting: {setting}. {cast} "
            f"He wears {pieces_text(keys)}, with {shirt}. Reproduce every Nyoni garment EXACTLY as in the attached product photos (same colour, pattern, lapels, buttons, fit). "
            f"Pose: {pose}. Full body visible head to shoes, natural soft light, realistic skin and fabric texture. No text, no logos, no watermark.")

def last_prompt(outfit_key, pose, her=None, change_setting=None):
    label, keys, shirt = O[outfit_key]
    where = f'move the scene to {change_setting}' if change_setting else 'keep the same background, lighting and camera position'
    return (f"Using the FIRST FRAME image as the reference: same man, same face, same body{', same woman' if her else ''}; {where}. "
            f"Change ONLY his clothing to {pieces_text(keys)}, with {shirt}." + (f" She now wears {her}." if her else '') +
            f" Match the attached product photos exactly. Pose: {pose}. Vertical 9:16, full body, no text, no logos.")

def animate(action):
    return (f"Start frame → end frame, 5–6 seconds, camera locked at chest height, vertical 9:16. {action} "
            "Keep faces, bodies and background identical; the clothes must match the frames exactly (no morphing of lapels, buttons or patterns). No text. Natural, subtle motion.")

HASH = {
    'combo': '#colorcombination #mensoutfits #menswear #styletips #nyonicouture',
    'ways': '#capsulewardrobe #mensstyle #suitstyle #outfitideas #nyonicouture',
    'rule': '#mensstyletips #menswear #styleguide #gentlemanstyle #nyonicouture',
    'couple': '#coupleoutfits #matchingoutfits #coupleswhodress #weddingguest #nyonicouture',
    'occasion': '#mensfashion #whattowear #outfitinspo #suitup #nyonicouture',
    'poll': '#oldmoney #mensfashion #classicmenswear #suits #nyonicouture',
    'detail': '#pocketsquare #menswear #detailsmatter #tailoring #nyonicouture',
}
CTA = 'Every piece is on nyonicouture.com (link in bio).'

# --- rotating content banks ---
COMBO_PAIRS = [('indigo_taupe', 'ivoire_black', 'thomson_glen'), ('vicenzo_black', 'james_taupe', 'indigo_black'),
               ('thomson_black', 'ivoire_glen', 'char_taupe'), ('indigo_taupe', 'thomson_glen', 'vicenzo_black'),
               ('ivoire_black', 'james_taupe', 'thomson_black'), ('char_taupe', 'indigo_black', 'ivoire_glen'),
               ('navy3', 'char3', 'evano'), ('perseo', 'navy_hematite', 'indigo_black'),
               ('vicenzo_black', 'thomson_glen', 'ivoire_black'), ('indigo_taupe', 'james_taupe', 'char_taupe'),
               ('gabbro_black', 'ivoire_tux', 'tux'), ('navy_hematite', 'perseo_yuma', 'char3'), ('ivoire_black', 'indigo_black', 'thomson_black')]
WAYS = [  # anchor piece, three looks, labels
    ('Midnight Navy Three Piece', ['navy3', 'indigo_taupe', 'kenzie_navy'], ['wedding: full three-piece', 'date night: navy jacket with taupe trousers', 'weekend: waistcoat and rolled sleeves']),
    ('Taupe Trousers', ['indigo_taupe', 'james_taupe', 'yuma_taupe'], ['with navy jacquard', 'with grey-green check', 'with a grey DB waistcoat']),
    ('Ivoire Double-Breasted Blazer', ['ivoire_black', 'ivoire_glen', 'ivoire_tux'], ['dinner: with black', 'daytime: with navy plaid', 'black tie: as a dinner jacket']),
    ('Charcoal Three Piece', ['char3', 'char_taupe', 'chalc_black'], ['the full suit', 'jacket with taupe', 'waistcoat only']),
    ('Classic Black Trousers', ['ivoire_black', 'vicenzo_black', 'thomson_black'], ['ivory on top', 'grey on top', 'rust on top']),
    ('Thomson Rust Blazer', ['thomson_glen', 'thomson_black', 'thomson_glen'], ['with navy plaid', 'with black', 'open, sleeves pushed up']),
    ('Indigo Jacquard Blazer', ['indigo_taupe', 'indigo_black', 'navy3'], ['with taupe', 'with black', 'next to the full navy suit']),
    ('Midnight Glen Plaid Pant', ['thomson_glen', 'ivoire_glen', 'hematite_glen'], ['rust blazer', 'ivory blazer', 'blue waistcoat']),
    ('Navy Suit, 3 Waistcoats', ['navy3', 'navy_hematite', 'kenzie_navy'], ['matching waistcoat', 'blue windowpane waistcoat', 'jacket off, navy waistcoat']),
    ('Sovereign Tuxedo', ['tux', 'ivoire_tux', 'gabbro_black'], ['classic black tie', 'ivory dinner jacket', 'marbled waistcoat, jacket off']),
    ('Grey Windowpane Suit', ['evano', 'evano', 'perseo_yuma'], ['with the waistcoat: wedding', 'without it: Tuesday', 'grey on grey']),
    ('Black Chelsea Boots', ['char3', 'ivoire_black', 'thomson_black'], ['with charcoal', 'with ivory and black', 'with rust']),
    ('Antwerp Brown Boots', ['navy3', 'indigo_taupe', 'james_taupe'], ['with navy', 'with taupe', 'with grey-green check']),
]
RULES = [
    ('Start with the trousers', 'they decide how formal the outfit is', 'indigo_taupe', 'holding the taupe trousers up toward the camera in one hand, wearing a white shirt'),
    ('Leave the bottom waistcoat button undone', 'always', 'navy3', 'buttoning his waistcoat, looking down at the buttons'),
    ('Sometimes, always, never', 'top jacket button sometimes, middle always, bottom never', 'char3', 'mid-way through buttoning the jacket, glancing at camera'),
    ('Brown boots with navy or taupe', 'black boots with black, grey and charcoal', 'indigo_taupe', 'seated on a stool lacing up a boot'),
    ('Pattern below means plain above', 'one pattern per outfit', 'thomson_glen', 'holding the plaid trousers and the plain rust blazer side by side'),
    ('Your pocket square should not match your tie', 'pick up a colour instead', 'navy3', 'folding a teal silk pocket square in his hands'),
    ('Light jacket, dark trousers', 'the easiest way to look sharp after dark', 'ivoire_black', 'holding the ivory blazer on a hanger'),
    ('Double-breasted stays buttoned', 'unbutton it only when you sit', 'perseo', 'pulling on the double-breasted jacket'),
    ('Belt matches the boots', 'black with black, always', 'vicenzo_black', 'threading a black belt through the trouser loops'),
    ('Show half an inch of shirt cuff', 'it frames the jacket sleeve', 'navy3', 'tugging his shirt cuff, close to camera'),
    ('Waistcoat without the jacket is a look', 'roll the sleeves and own it', 'kenzie_navy', 'putting on the waistcoat over a white shirt'),
    ('Black tie means a tuxedo', 'a black suit is not a tuxedo', 'tux', 'fastening his bow tie in front of a mirror'),
    ('One statement piece per outfit', 'everything else stays quiet', 'thomson_black', 'shrugging on the rust blazer'),
]
DETAILS = [
    ('The pocket square fold that always works', 'the straight (TV) fold', 'navy3', 'close-up of his hands sliding a folded teal pocket square into the jacket pocket', 'belagio'),
    ('Puff fold for evenings', 'pinch, flip, tuck', 'tux', 'close-up of his hands placing a black paisley silk square in a soft puff fold', 'paisley'),
    ('Boots that go under a suit trouser', 'a slim Chelsea or a cap-toe', 'char3', 'close-up of trouser hem breaking softly over a black Chelsea boot', 'chelsea'),
    ('Why texture beats a logo', 'look closely at the jacquard', 'indigo_black', 'close-up of the navy jacquard blazer fabric and lapel', 'indigo'),
    ('The waistcoat that makes it black tie', 'marbled, black and ivory', 'gabbro_black', 'close-up of his hands buttoning the marbled waistcoat', 'gabbro'),
    ('Cognac boots, made in Italy', 'leather sole, wing-tip toe', 'indigo_taupe', 'close-up of the cognac wing-tip boot with taupe trouser hem', 'antwerp'),
    ('Peak lapels read as confidence', 'look at the ivory double-breasted', 'ivoire_black', 'close-up of the ivory peak lapel as he adjusts it', 'ivoire'),
    ('The copper square for brown tailoring', 'Venez on rust', 'thomson_glen', 'close-up of the copper baroque pocket square in the rust blazer', 'venez'),
    ('A belt you never think about', 'black calf, squared buckle', 'vicenzo_black', 'close-up of him fastening the black belt buckle', 'belt'),
    ('Satin lapel, six buttons', 'the tuxedo in detail', 'tux', 'close-up of the satin peak lapel and double-breasted buttons', 'tux'),
    ('Windowpane, up close', 'a pattern that stays quiet', 'evano', 'close-up of the windowpane check on jacket and waistcoat', 'evano'),
    ('Herringbone you can feel', 'silver-grey, double-breasted', 'perseo', 'close-up of the herringbone weave as he buttons the jacket', 'perseo'),
    ('Side-zip boots for long nights', 'Hamburg wing-tip', 'char3', 'close-up of him zipping a black side-zip wing-tip boot', 'hamburg'),
]
COUPLES = [
    ('indigo_taupe', 'a camel wool coat over a cream knit midi dress', 'navy3', 'an emerald satin midi dress', 'Navy + Camel → Navy + Emerald'),
    ('thomson_glen', 'a chocolate-brown knit dress and gold jewellery', 'char_taupe', 'an ivory tailored trouser suit', 'Rust + Chocolate → Charcoal + Ivory'),
    ('ivoire_black', 'a black slip dress with a cream blazer over her shoulders', 'tux', 'a floor-length black velvet gown', 'Ivory + Black → Black Tie'),
    ('char3', 'a burgundy wrap dress', 'perseo', 'a dusty-blue satin dress', 'Charcoal + Burgundy → Silver + Dusty Blue'),
    ('james_taupe', 'a sage-green knit set', 'vicenzo_black', 'a soft grey wool coat over black', 'Grey-Green + Sage → Grey + Black'),
    ('navy_hematite', 'a pale-blue silk dress', 'indigo_black', 'a navy velvet blazer dress', 'Navy + Pale Blue → Navy Velvet'),
    ('evano', 'a blush-pink wool dress', 'thomson_black', 'a cream turtleneck dress', 'Grey + Blush → Rust + Cream'),
    ('gabbro_black', 'a gold sequin midi dress', 'ivoire_tux', 'a black satin column gown', 'Holiday Party → New Year’s Eve'),
    ('char_taupe', 'a camel turtleneck and tailored camel trousers', 'navy3', 'a deep-red velvet dress', 'Charcoal + Camel → Navy + Red'),
    ('perseo_yuma', 'a silver satin slip dress', 'tux', 'an emerald velvet gown', 'Silver on Silver → Black + Emerald'),
    ('indigo_black', 'a cream cable-knit dress', 'thomson_glen', 'a camel coat and cream knit', 'Navy + Cream → Rust + Camel'),
    ('navy3', 'a burgundy velvet dress', 'char3', 'a forest-green satin dress', 'Holiday Card: Navy + Burgundy → Charcoal + Green'),
    ('ivoire_glen', 'an ivory knit dress', 'gabbro_black', 'a black velvet mini dress', 'Ivory Day → Black Night'),
]
OCCASIONS = {
    10: [('Fall wedding guest', 'navy3'), ('First day at the new job', 'char3'), ('Date night', 'indigo_black'), ('Fall wedding guest: afternoon', 'thomson_glen'), ('Client dinner', 'perseo')],
    11: [('Gallery opening', 'james_taupe'), ('Friendsgiving', 'thomson_black'), ('Work holiday party', 'gabbro_black'), ('Engagement party', 'navy_hematite'), ('Thanksgiving dinner', 'char_taupe')],
    12: [('Office holiday party', 'gabbro_black'), ('Black tie gala', 'tux'), ('Christmas dinner', 'navy3'), ('Holiday date night', 'ivoire_black'), ('Christmas Eve service', 'char3'), ('New Year’s Eve', 'ivoire_tux')],
}
POLLS = [('Which suit looks most expensive?', ['navy3', 'char3', 'perseo']), ('Which blazer would you buy first?', ['indigo_taupe', 'ivoire_black', 'thomson_glen']),
         ('Which waistcoat look wins?', ['kenzie_navy', 'chalc_black', 'yuma_taupe']), ('Which one for a winter wedding?', ['evano', 'navy_hematite', 'perseo_yuma']),
         ('Pick his holiday party fit', ['gabbro_black', 'ivoire_tux', 'tux']), ('Old money, which is most?', ['navy3', 'ivoire_glen', 'james_taupe']),
         ('Which looks richer?', ['char3', 'perseo', 'evano']), ('Date night: 1, 2 or 3?', ['indigo_black', 'thomson_black', 'ivoire_black']),
         ('Which suit would you wear to a gala?', ['tux', 'navy_hematite', 'char3']), ('Which grey is best?', ['vicenzo_black', 'evano', 'perseo']),
         ('Rank these for a first date', ['indigo_taupe', 'james_taupe', 'thomson_glen']), ('The 3 boots: which one?', ['navy3', 'char3', 'evano']),
         ('Black tie: which version?', ['tux', 'ivoire_tux', 'gabbro_black'])]

SPECIAL = {  # date -> (format, theme override)
    dt.date(2026, 10, 31): 'halloween', dt.date(2026, 11, 26): 'thanksgiving', dt.date(2026, 11, 27): 'blackfriday',
    dt.date(2026, 11, 30): 'cybermonday', dt.date(2026, 12, 7): 'gift100', dt.date(2026, 12, 14): 'gift200',
    dt.date(2026, 12, 17): 'lastorder', dt.date(2026, 12, 24): 'xmaseve', dt.date(2026, 12, 25): 'xmas', dt.date(2026, 12, 31): 'nye',
}
WEEKDAY_FORMAT = {0: 'combo', 1: 'ways', 2: 'rule', 3: 'couple', 4: 'occasion', 5: 'poll', 6: 'detail'}

def row(date, n, counters):
    m = date.month; settings = SETTINGS[m]; setting = settings[n % len(settings)]
    sp = SPECIAL.get(date)
    if sp:
        return special(date, sp, setting)
    fmt = WEEKDAY_FORMAT[date.weekday()]
    i = counters[fmt] = counters.get(fmt, -1) + 1
    if fmt == 'combo':
        a, b, c = COMBO_PAIRS[i % len(COMBO_PAIRS)]
        hook = f'Save these combos: {O[a][0]} → {O[b][0]}'
        return dict(fmt='Colour combo swap', cast='Him', hook=hook, outfits=[a, b, c],
            first=first_prompt(setting, a, 'standing facing camera, one hand in trouser pocket, relaxed'),
            last=last_prompt(b, 'same stance, now buttoning the jacket and looking at camera'),
            anim=animate('He turns a quarter to the side and back; as he turns, the outfit transforms into the end-frame outfit.'),
            extra=f'Optional 3rd combo frame (same pose): {O[c][0]}, use the LAST FRAME prompt with that outfit.',
            text=f'1. {O[a][0]}  2. {O[b][0]}  3. {O[c][0]}  ·  Save for later 🤍',
            cap=f'Colour combinations every man should save 🤍 Which one would you wear first? 1, 2 or 3 👇 {CTA} {HASH["combo"]}')
    if fmt == 'ways':
        anchor, looks, labels = WAYS[i % len(WAYS)]
        return dict(fmt='One piece, 3 ways', cast='Him', hook=f'{anchor}: 3 ways', outfits=looks,
            first=first_prompt(setting, looks[0], 'standing facing camera, hands relaxed at his sides'),
            last=last_prompt(looks[2], 'same stance, adjusting a cuff and smiling slightly'),
            anim=animate('He takes one step toward camera; the outfit changes from the first look to the last look mid-step.'),
            extra=f'Optional middle frame (same pose): {O[looks[1]][0]}, {labels[1]}.',
            text=f'1. {labels[0]}  2. {labels[1]}  3. {labels[2]}',
            cap=f'{anchor}, three ways. Cost per wear just dropped. Which is your favourite? 👇 {CTA} {HASH["ways"]}')
    if fmt == 'rule':
        title, sub, o, pose = RULES[i % len(RULES)]
        return dict(fmt='Style rule', cast='Him', hook=title, outfits=[o],
            first=first_prompt(setting, o, pose).replace('He wears', 'He is getting dressed in'),
            last=last_prompt(o, 'fully dressed, standing facing camera, confident'),
            anim=animate('He finishes getting dressed (the action from the first frame) and stands up straight to face camera.'),
            extra='',
            text=f'{title}. ({sub})',
            cap=f'{title}: {sub}. Save this one. {CTA} {HASH["rule"]}')
    if fmt == 'couple':
        a, her_a, b, her_b, label = COUPLES[i % len(COUPLES)]
        return dict(fmt='Couple colour combo (Him + Her)', cast='Him + Her', hook=f'Couple colours: {label}', outfits=[a, b],
            first=first_prompt(setting, a, 'standing side by side facing camera, her hand on his arm', her=her_a),
            last=last_prompt(b, 'same positions, both smiling at each other', her=her_b),
            anim=animate('They exchange a glance and turn slightly toward each other; both outfits transform into the end-frame outfits.'),
            extra='Her clothes are NOT Nyoni products; keep them simple so his pieces stay the focus.',
            text=f'{label}  ·  Save for your next event 🤍',
            cap=f'Couple outfit inspiration to look good together 🤍 Tag the person you’re matching with. His pieces: {CTA} {HASH["couple"]}')
    if fmt == 'occasion':
        occ, o = OCCASIONS[m][i % len(OCCASIONS[m])]
        return dict(fmt='Get ready with me', cast='Him', hook=f'What to wear: {occ}', outfits=[o],
            first=first_prompt('a bedroom with a full-length mirror and warm lamp light', o, 'standing at the mirror in a plain white undershirt and dark trousers, holding the jacket on a hanger').replace('He wears', 'Laid out on the bed: '),
            last=last_prompt(o, 'fully dressed, turning from the mirror to face camera', change_setting=setting),
            anim=animate('He shrugs on the jacket and turns to camera; the room transitions to the destination setting.'),
            extra='', text=f'{occ} ✓',
            cap=f'{occ}? This is the fit. Save it before your next invite. {CTA} {HASH["occasion"]}')
    if fmt == 'poll':
        q, outs = POLLS[i % len(POLLS)]
        return dict(fmt='Which one? (poll)', cast='Him', hook=q, outfits=outs,
            first=first_prompt(setting, outs[0], 'standing facing camera, hands clasped in front'),
            last=last_prompt(outs[1], 'same stance, one hand in pocket'),
            anim=animate('He shifts his weight and turns slightly; the outfit transforms into the end-frame outfit.'),
            extra=f'Optional 3rd frame (same pose): {O[outs[2]][0]}.',
            text=f'{q}  1 · 2 · 3',
            cap=f'{q} Comment 1, 2 or 3 👇 {CTA} {HASH["poll"]}')
    title, sub, o, pose, focus = DETAILS[i % len(DETAILS)]
    return dict(fmt='Detail close-up', cast='Him', hook=title, outfits=[o],
        first=first_prompt(setting, o, pose).replace('Full body visible head to shoes', 'Tight close-up framing on the detail'),
        last=last_prompt(o, 'full body, standing facing camera, the detail clearly visible'),
        anim=animate('The camera pulls back smoothly from the close-up detail to the full-body shot.').replace('camera locked at chest height', 'camera pulls back'),
        extra=f'Feature piece: {P[focus][0]}.', text=f'{title}: {sub}',
        cap=f'{title}: {sub}. Details make the outfit. {CTA} {HASH["detail"]}')

def special(date, sp, setting):
    base = dict(cast='Him', extra='')
    if sp == 'halloween':
        o = 'gabbro_black'
        return dict(base, fmt='Holiday moment', hook='No costume? Be the best-dressed man at the party.', outfits=[o],
            first=first_prompt('a dark lounge decorated with candles and pumpkins', o, 'in the doorway holding a black masquerade mask'),
            last=last_prompt(o, 'mask lowered, smirking at camera'), anim=animate('He lowers the mask from his face and smirks.'),
            text='Halloween costume: the best-dressed man in the room 🎃', cap=f'Skip the costume. Wear the marbled waistcoat. 🎃 {CTA} {HASH["occasion"]}')
    if sp == 'thanksgiving':
        o = 'char_taupe'
        return dict(base, cast='Him + Her', fmt='Holiday moment', hook='Thanksgiving dinner fit', outfits=[o],
            first=first_prompt('a warm dining room with a set Thanksgiving table and candles', o, 'pulling out a chair for her', her='a camel turtleneck dress'),
            last=last_prompt(o, 'both seated, raising wine glasses toward camera', her='a camel turtleneck dress'),
            anim=animate('They sit down at the table and raise their glasses.'), text='Thanksgiving: dressed, not overdressed 🍂',
            cap=f'Happy Thanksgiving 🍂 Charcoal jacket + taupe trousers: dressed, not overdressed. {CTA} {HASH["couple"]}')
    if sp == 'blackfriday':
        outs = ['navy3', 'indigo_taupe', 'ivoire_black']
        return dict(base, fmt='Black Friday', hook='If you buy ONE piece this weekend, make it one of these 3', outfits=outs,
            first=first_prompt(setting, outs[0], 'standing facing camera holding up one finger'),
            last=last_prompt(outs[1], 'same stance, holding up two fingers'), anim=animate('He changes the number of fingers; the outfit transforms between frames.'),
            extra=f'Optional 3rd frame: {O[outs[2]][0]} (three fingers).', text='1. Navy three-piece  2. Navy jacquard blazer  3. Ivory DB blazer',
            cap=f'The 3 pieces worth it this weekend. (Add your Black Friday offer here if you run one.) {CTA} {HASH["poll"]}')
    if sp == 'cybermonday':
        outs = ['navy3', 'char3']
        return dict(base, cast='Him + Her', fmt='Gift guide (for her to buy him)', hook='Buying for him? Start here.', outfits=outs,
            first=first_prompt(setting, outs[0], 'she hands him a gift box with a ribbon; he is in a navy three-piece', her='a cream knit dress'),
            last=last_prompt(outs[0], 'he holds up a teal silk pocket square from the box, delighted', her='a cream knit dress'),
            anim=animate('He opens the gift box and lifts out the pocket square.'), text='The gift he’ll actually wear: a silk pocket square ($69)',
            cap=f'Buying for him? A silk pocket square is the easiest win. Made in Italy, $69. {CTA} #giftsforhim #giftguide #menswear #nyonicouture')
    if sp in ('gift100', 'gift200'):
        under = 100 if sp == 'gift100' else 250
        feat = ['belagio', 'venez', 'paisley'] if sp == 'gift100' else ['belt', 'kenzie', 'chalc']
        o = 'navy3' if sp == 'gift100' else 'kenzie_navy'
        return dict(base, cast='Him + Her', fmt='Gift guide (for her to buy him)', hook=f'Gifts for him under ${under}', outfits=[o],
            first=first_prompt('a cosy living room with a decorated Christmas tree', o, 'she sits on the sofa with three small wrapped gifts; he stands beside the tree', her='a red knit dress'),
            last=last_prompt(o, 'he wears the gift, she smiles at him', her='a red knit dress'),
            anim=animate('She hands him a gift; he unwraps it and puts it on.'),
            extra='Gifts: ' + ', '.join(f'{P[k][0]} (${P[k][1]})' for k in feat) + '\n' + links(feat),
            text=f'Gifts for him under ${under} 🎁', cap=f'Gifts for him under ${under} 🎁 Save this for your list. {CTA} #giftsforhim #giftguide #christmasgifts #nyonicouture')
    if sp == 'lastorder':
        o = 'navy3'
        return dict(base, fmt='Deadline reminder', hook='Last week to order for Christmas', outfits=[o],
            first=first_prompt('a snowy city street at night with warm window lights', o, 'walking toward camera carrying a Nyoni shopping bag'),
            last=last_prompt(o, 'stopped, holding the bag up to camera with a smile'), anim=animate('He walks two steps and lifts the bag toward camera.'),
            text='⚠️ CONFIRM the real last shipping date with the store before posting', cap=f'Last week to order for Christmas 🎄 (Check and add the store’s cut-off date.) {CTA} {HASH["occasion"]}')
    if sp == 'xmaseve':
        o = 'char3'
        return dict(base, cast='Him + Her', fmt='Holiday moment', hook='Christmas Eve: charcoal and candlelight', outfits=[o],
            first=first_prompt('a candlelit living room with a Christmas tree and a fireplace', o, 'standing by the fireplace', her='a forest-green velvet dress'),
            last=last_prompt(o, 'slow-dancing by the tree', her='a forest-green velvet dress'), anim=animate('They step together and begin a slow dance.'),
            text='Christmas Eve 🕯️', cap=f'Christmas Eve in charcoal 🕯️ {CTA} {HASH["couple"]}')
    if sp == 'xmas':
        o = 'navy3'
        return dict(base, cast='Him + Her', fmt='Holiday moment', hook='Merry Christmas from Nyoni', outfits=[o],
            first=first_prompt('a hotel lobby with a tall decorated Christmas tree', o, 'standing together posing for a holiday photo', her='a deep-red velvet dress'),
            last=last_prompt(o, 'laughing together as gold confetti falls', her='a deep-red velvet dress'), anim=animate('They break the pose and laugh as soft gold confetti falls.'),
            text='Merry Christmas 🎄', cap=f'Merry Christmas from all of us at Nyoni Couture 🎄 {HASH["couple"]}')
    o = 'tux'
    return dict(base, cast='Him + Her', fmt='Holiday moment', hook='New Year’s Eve is black tie', outfits=[o, 'ivoire_tux'],
        first=first_prompt('a rooftop terrace at night with the city skyline', o, 'holding two champagne glasses, handing one to her', her='a black satin column gown'),
        last=last_prompt('ivoire_tux', 'they clink glasses as fireworks burst behind them', her='a gold sequin gown'), anim=animate('They clink glasses; fireworks burst in the sky behind them.'),
        text='Black tie or ivory dinner jacket? Happy New Year ✨', cap=f'Two ways to do black tie for New Year’s Eve ✨ Which one? {CTA} {HASH["occasion"]}')

# ---------- workbook ----------
wb = Workbook()
font = Font(name='Arial', size=10); bold = Font(name='Arial', size=10, bold=True); white = Font(name='Arial', size=10, bold=True, color='FFFFFF')
head = PatternFill('solid', fgColor='1F1A14'); gold = PatternFill('solid', fgColor='F3E7C9'); thin = Side(style='thin', color='D9D2C3')
wrap = Alignment(wrap_text=True, vertical='top')

ws = wb.active; ws.title = 'How to use'
guide = [
    ('NYONI COUTURE: CONTENT CALENDAR, 7 OCT – 31 DEC 2026 (one post a day)', ''),
    ('', ''),
    ('Each post = one 5–8 second video', 'ChatGPT makes the FIRST frame and the LAST frame from the prompts. An animation tool (start + end frame mode: Kling, Higgsfield, Runway or Omni) animates between them using the Animation prompt. Optional extra frames can be animated the same way and cut together in CapCut.'),
    ('Step 1: make the characters once', 'In ChatGPT, generate the Nyoni Man from the prompt below and save the best image as his reference. Do the same for Her. Attach these references to EVERY post’s prompts so they always look the same.'),
    ('The Nyoni Man (reference prompt)', f'Photorealistic vertical 9:16 full-body photo of {HIM}, wearing a plain white t-shirt and dark trousers, standing in a minimalist studio with a warm beige backdrop, soft natural light, shot on a phone, realistic skin texture, no text.'),
    ('Her (reference prompt)', f'Photorealistic vertical 9:16 full-body photo of {HER}, wearing a simple black dress, same studio, lighting and camera style as the Nyoni Man reference. No text.'),
    ('Step 2: attach the product photos', 'Open each product link in the “Product links” column, save the main product photo, and attach it to the ChatGPT chat with the FIRST FRAME prompt. ChatGPT needs to SEE the garment to copy it accurately.'),
    ('Step 3: first frame, then last frame', 'Paste the FIRST FRAME prompt (with the references and product photos attached). Then, in the SAME chat, paste the LAST FRAME prompt and attach that outfit’s product photos. It reuses the first image so the man, pose and room stay identical.'),
    ('Step 4: check the clothes', 'Before animating, compare every garment with the real product (lapels, buttons, pattern, colour, pocket square). Regenerate if anything changed. You are selling that exact piece.'),
    ('Step 5: animate', 'Upload FIRST as the start frame and LAST as the end frame, paste the Animation prompt, and generate 5–6 seconds. Keep the best take.'),
    ('Step 6: edit and post', 'In CapCut, add the On-screen text, a trending sound, and (optionally) the extra frame clips. Paste the Caption. Turn ON the platform’s AI-generated label. Post to Instagram Reels and TikTok.'),
    ('Weekly rhythm', 'Mon: Colour combo swap · Tue: One piece, 3 ways · Wed: Style rule · Thu: Couple colours (Him + Her) · Fri: Get ready with me (occasion) · Sat: Which one? (poll) · Sun: Detail close-up. Holidays override the rhythm.'),
    ('Why these formats', 'They copy the AI style-guide accounts that are working right now: @layrandlayr (1M followers in ~5 months; 14.4M views on a couple colour-combination video), @styleformula.daily, @thestyleformulaa and @dresscodelab.co. Same model, same pose, outfit swaps, built to be saved. See docs/content/ai-model-campaign.md.'),
    ('Columns you fill in', 'Status and Posted URL (yellow) are for you to track progress. Everything else is ready to paste.'),
    ('Check before posting', 'Black Friday (27 Nov): add your real offer, or remove the line. Last-order post (17 Dec): confirm the store’s Christmas shipping cut-off. Walnut Tweed Pant and Black Satin Tuxedo Pants are not used: their product links return 404.'),
]
for r, (a, b) in enumerate(guide, 1):
    ws.cell(r, 1, a).font = bold if a else font; ws.cell(r, 2, b).font = font
    ws.cell(r, 1).alignment = wrap; ws.cell(r, 2).alignment = wrap
ws['A1'].font = Font(name='Arial', size=13, bold=True)
ws.column_dimensions['A'].width = 34; ws.column_dimensions['B'].width = 120

cal = wb.create_sheet('Calendar')
cols = ['Date', 'Day', 'Format', 'Cast', 'Hook / title', 'Outfits', 'Product links (open, save the photo, attach to ChatGPT)', 'FIRST FRAME prompt (ChatGPT)', 'LAST FRAME prompt (ChatGPT, same chat)', 'Animation prompt (start → end frame)', 'Extra frames / notes', 'On-screen text', 'Caption + hashtags', 'Status', 'Posted URL']
widths = [11, 6, 18, 9, 30, 26, 52, 70, 60, 48, 36, 34, 52, 12, 22]
for c, (h, w) in enumerate(zip(cols, widths), 1):
    cell = cal.cell(1, c, h); cell.font = white; cell.fill = head; cell.alignment = Alignment(wrap_text=True, vertical='center')
    cal.column_dimensions[get_column_letter(c)].width = w
cal.freeze_panes = 'C2'
counters = {}; d = dt.date(2026, 10, 7); n = 0; r = 2
while d <= dt.date(2026, 12, 31):
    x = row(d, n, counters)
    keys = []
    for o in x['outfits']:
        for k in O[o][1]:
            if k not in keys: keys.append(k)
    vals = [d, d.strftime('%a'), x['fmt'], x['cast'], x['hook'], '\n'.join(f'{i+1}. {O[o][0]}' for i, o in enumerate(x['outfits'])), links(keys),
            x['first'], x['last'], x['anim'], x.get('extra', ''), x['text'], x['cap'], '', '']
    for c, v in enumerate(vals, 1):
        cell = cal.cell(r, c, v); cell.font = font; cell.alignment = wrap; cell.border = Border(bottom=thin)
    cal.cell(r, 1).number_format = 'ddd d mmm'
    for c in (14, 15): cal.cell(r, c).fill = gold
    if d.month != (d - dt.timedelta(days=1)).month or r == 2:
        pass
    r += 1; d += dt.timedelta(days=1); n += 1
cal.auto_filter.ref = f'A1:{get_column_letter(len(cols))}{r-1}'
last = r - 1
cal.cell(last + 2, 1, 'Posts planned:').font = bold
cal.cell(last + 2, 3, f'=COUNTA(A2:A{last})').font = bold
cal.cell(last + 3, 1, 'Posted so far:').font = bold
cal.cell(last + 3, 3, f'=COUNTIF(N2:N{last},"Posted")').font = bold
cal.cell(last + 3, 5, 'Type “Posted” in the Status column to count it.').font = font

pr = wb.create_sheet('Products')
for c, (h, w) in enumerate(zip(['Product', 'Price (USD)', 'Link', 'What it looks like (used in prompts)'], [42, 12, 80, 80]), 1):
    cell = pr.cell(1, c, h); cell.font = white; cell.fill = head; pr.column_dimensions[get_column_letter(c)].width = w
for i, (k, (name, price, url, desc)) in enumerate(P.items(), 2):
    for c, v in enumerate([name, price, url, desc], 1):
        cell = pr.cell(i, c, v); cell.font = font; cell.alignment = wrap
    pr.cell(i, 2).number_format = '$#,##0'
pr.cell(len(P) + 3, 1, 'Not used (product pages return 404): Walnut Tweed Pant, Black Satin Side Stripe Tuxedo Pants.').font = font

import pathlib
out = pathlib.Path(__file__).with_name('nyoni-content-calendar-oct-dec-2026.xlsx')
wb.calculation.fullCalcOnLoad = True
wb.save(out); print(out, 'rows', last - 1)
