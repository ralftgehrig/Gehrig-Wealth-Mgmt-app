import { normalizeMerchant, cleanText } from './normalize';

/**
 * Maps a source statement's own category label (Wise's `Category` column, or
 * the sub-category half of Amex's "TopLevel-SubLevel" `Category` column) to
 * our canonical taxonomy slug. Used as a fallback signal — the keyword engine
 * and learned merchant rules take priority since they're merchant-specific.
 */
const SOURCE_CATEGORY_MAP: Record<string, string> = {
  // Wise
  shopping: 'shopping.general',
  groceries: 'groceries',
  'eating out': 'eating_out.restaurants',
  general: 'general',
  entertainment: 'entertainment',
  transport: 'transport',
  'personal care': 'health_personal_care.personal_care',
  bills: 'bills_utilities',
  trips: 'travel',
  family: 'family_kids',
  'money added': 'transfers',
  // Amex (sub-level part of "TopLevel-SubLevel")
  restaurants: 'eating_out.restaurants',
  'bars & cafés': 'eating_out.cafes',
  'bars & cafes': 'eating_out.cafes',
  'online purchases': 'shopping.online_marketplace',
  pharmacies: 'health_personal_care.pharmacy',
  'department stores': 'shopping.general',
  'general retail': 'shopping.general',
  'clothing stores': 'shopping.clothing',
  'electronics stores': 'shopping.electronics',
  'book stores': 'shopping.general',
  'wholesale stores': 'shopping.general',
  'sporting goods stores': 'shopping.general',
  'computer supplies': 'shopping.electronics',
  clubs: 'entertainment.hobbies_gaming',
  'theatrical events': 'entertainment.cinema_theatre',
  'general events': 'entertainment.events',
  'general attractions': 'entertainment.events',
  airline: 'travel.flights',
  'travel agencies': 'travel.hotels',
  lodging: 'travel.hotels',
  'vehicle rental': 'travel.holiday_activities',
  'other travel': 'travel.holiday_activities',
  'travel related': 'travel.holiday_activities',
  'taxis & coach': 'transport.rideshare',
  'rail services': 'transport.public_transport',
  'auto services': 'transport.maintenance',
  'parking charges': 'transport.parking',
  fuel: 'transport.fuel',
  'insurance services': 'bills_utilities.insurance',
  'internet services': 'bills_utilities.subscriptions',
  education: 'family_kids.education',
  'health care services': 'health_personal_care.medical',
  charities: 'gifts_donations',
};

/** Keyword rules for outgoing (spend) transactions, tested in order — first match wins. */
const EXPENSE_KEYWORD_RULES: Array<[string, RegExp]> = [
  // Labelled for clarity even though unmatched — only an actual cross-account match
  // (see transfers.ts) excludes a row from spending/income analysis.
  ['transfers', /\b(FUNDS\s*TRANSFER|PAYMENT\s+RECEIVED|AUTOPAY)\b/],

  ['health_personal_care.pharmacy', /\b(BOOTS|SUPERDRUG|APOTHEKE|PHARMACY|WALGREENS)\b/],
  ['health_personal_care.personal_care', /\b(TONI\s*&\s*GUY|HAIR\s*(SALON|DRESSER)|BARBER|NAIL\s*BAR|\bSPA\b|DM-?DROGERIE)\b/],
  ['health_personal_care.fitness', /\b(PUREGYM|\bGYM\b|FITNESS\s*FIRST|\bYOGA\b|HUSSLE|THIRD\s*SPACE)\b/],
  ['health_personal_care.medical', /\b(SPECSAVERS|OPTICIAN|DENTIST|\bCLINIC\b|\bDOCTOR\b|HOSPITAL)\b/],

  ['groceries', /\b(TESCO|SAINSBURY'?S?|ASDA|MORRISONS?|WAITROSE|CO-?OP|ALDI|LIDL|REWE|EDEKA|KAUFLAND|WHOLE\s*FOODS|TRADER\s*JOE|SAVE-?ON-?FOODS|ERE?WHON|BUDGENS|MARINA\s*MART|HOLLYWOOD\s*MARKET|B[AÄ]CKEREI|BAKERY|PAPPERTS|KAMPS|NEU\s*SCHOLZ|AU\s*BON\s*PAIN|BETTER\s*PRICE|FOOD\s*CENTRE|FOOD\s*CENTER|VENDING|(?:E\.?\s*)?LECLERC)\b/],

  ['eating_out.takeaway', /\b(DELIVEROO|UBER\s*EATS|JUST\s*EAT|DOORDASH|GRUBHUB|TAKEAWAY|\bITSU\b|UPPER\s*CRUST|HANSEL|PRETZEL)\b/],
  ['eating_out.cafes', /\b(STARBUCKS|COSTA\s*COFFEE|CAFF?E|EISCAFE|GELATERIA|COFFEE|TIM\s*HORTONS)\b/],
  ['eating_out.bars', /\b(\bPUB\b|TAPROOM|BREWERY|BREWHOUSE|WINE\s*BAR|\bBAR\b)\b/],
  ['eating_out.restaurants', /\b(RESTAURANT|RISTORANTE|TAVERNA|PIZZERIA|TRATTORIA|OLIVE\s*GARDEN|NANDO|WAGAMAMA|SUSHI|RAMEN|STEAKHOUSE|BURGER\s*KING|MCDONALD|\bKFC\b|SUBWAY|DOMINO|WHATABURGER|IN-?N-?OUT|DENNY|BURGERKING|PRET\s*A\s*MANGER|\bA&W\b)\b/],

  ['transport.fuel', /\b(SHELL|\bBP\b|ESSO|CHEVRON|\bARCO\b|PETRO-?CANADA|TOTALENERGIES|\bAVIA\b|7-?ELEVEN)\b/],
  ['transport.parking', /\b(PARKING|PARKGEB|PARKAUTOMAT|PAYBYPHONE|APCOA|\bNCP\b|PARK\s*SERVICE|RINGGO)\b/],
  ['transport.tolls', /\b(VINCI\s*AUTOROUTES|\bTOLL\b|AUTOROUTE|CONGESTION\s*CHARGE)\b/],
  ['transport.public_transport', /\b(TRAINLINE|NATIONAL\s*RAIL|\bTFL\b|UNDERGROUND|\bSNCF\b|DEUTSCHE\s*BAHN)\b/],
  ['transport.rideshare', /\b(UBER(?!\s*EATS)|\bLYFT\b|\bBOLT\b|\bWAYMO\b|\bTAXI\b)\b/],
  ['transport.maintenance', /\b(GARAGE|\bTYRE\b|\bTIRE\b|MOT\s*TEST|CAR\s*WASH|AUTO\s*REPAIR|HALFORDS)\b/],

  ['entertainment.hobbies_gaming', /\b(\bSTEAM\b|PLAYSTATION|\bXBOX\b|NINTENDO|\bG2A\b|MTCGAME|GAMESTOP)\b/],
  ['entertainment.subscriptions', /\b(NETFLIX|SPOTIFY|DISNEY\+|\bHULU\b|APPLE\s*(MUSIC|TV)|NVIDIA)\b/],
  ['entertainment.cinema_theatre', /\b(CINEMA|KINOPOLIS|\bKINO\b|CINEWORLD|VUE\s*CINEMA|ODEON|THEATRE|THEATER|TODAYTIX|TICKETMASTER)\b/],
  ['entertainment.events', /\b(MUSEUM|STUDIO\s*TOUR|PALACIO\s*REAL|GOUFFRE|GROTTES|\bZOO\b|AQUARIUM)\b/],

  ['travel.flights', /\b(LUFTHANSA|BRITISH\s*AIRWAYS|EASYJET|RYANAIR|IBERIA|DELTA\s*AIR|UNITED\s*AIRLINES|AMERICAN\s*AIRLINES|AIRALO)\b/],
  ['travel.hotels', /\b(\bHOTEL\b|HOSTEL|SONESTA|MARRIOTT|HILTON|HOLIDAY\s*INN|BOOKING\.COM|AIRBNB|EXPEDIA|DOMAINE\s*DE|\bGITE\b)\b/],

  ['shopping.electronics', /\b(BEST\s*BUY|CURRYS|PC\s*WORLD|COMPUTER\s*SUPPLIES)\b/],
  ['shopping.online_marketplace', /\b(AMAZON|\bAMZN\b|\bEBAY\b|\bETSY\b|ALIEXPRESS)\b/],
  ['shopping.general', /\b(TARGET|WALMART|DOLLARAMA|MARKS\s*&\s*SPENCER|\bM&S\b|JOHN\s*LEWIS|\bARGOS\b|G[ÉE]MO|FLYING\s*TIGER)\b/],

  ['bills_utilities.phone_internet', /\b(VODAFONE|\bO2\b|\bEE\b|THREE\s*MOBILE|MYTELLO|TELEF[OÓ]NICA|VERIZON|AT&T|T-MOBILE)\b/],
  ['bills_utilities.insurance', /\b(LIFE\s*INSURANCE|INSURANCE|\bAVIVA\b|\bAXA\b|ALLIANZ)\b/],
  ['bills_utilities.energy', /\b(BRITISH\s*GAS|OCTOPUS\s*ENERGY|EDF\s*ENERGY|\bE\.?ON\b|SCOTTISH\s*POWER)\b/],
  ['bills_utilities.subscriptions', /\b(OPENAI|CHATGPT|MICROSOFT\s*365|\bADOBE\b|ICLOUD|DROPBOX|GITHUB|PATREON|APPLE\.COM)\b/],
  ['bills_utilities.council_tax', /\b(COUNCIL\s*TAX|COMUNE\s*DI|CITY\s*COUNCIL)\b/],

  ['housing.rent_mortgage', /\b(\bRENT\b|MORTGAGE|LANDLORD)\b/],
  ['housing.maintenance', /\b(PLUMBER|ELECTRICIAN|\bB&Q\b|HOMEBASE|\bIKEA\b|SCREWFIX|TOOLSTATION)\b/],

  ['family_kids.childcare', /\b(NURSERY|CHILDCARE|CR[EÈ]CHE|BABYSITT)\b/],
  ['family_kids.education', /\b(SCHOOL\s*FEES|TUITION|UNIVERSITY)\b/],

  ['fees_charges.debt_collection', /\b(EOS-?DT-?INKASSO|INKASSO|DEBT\s*COLLECTION)\b/],
  ['fees_charges.cash_withdrawal', /\b(\bATM\b|CASH\s*WITHDRAWAL|CASHPOINT)\b/],
  ['fees_charges.fx_fees', /\b(FX\s*FEE|FOREIGN\s*TRANSACTION\s*FEE|CURRENCY\s*CONVERSION\s*FEE)\b/],
  ['fees_charges.bank_fees', /\b(ASSETS?\s*FEE|ACCOUNT\s*FEE|MONTHLY\s*FEE|MEMBERSHIP\s*FEE|CARD\s*FEE|OVERDRAFT|TRANSFERWISE|CARD\s*ORDER)\b/],

  ['gifts_donations', /\b(DONATION|CHARITY|GOFUNDME|JUSTGIVING|OXFAM)\b/],
];

/** Keyword rules for incoming (credit) transactions. */
const INCOME_KEYWORD_RULES: Array<[string, RegExp]> = [
  ['transfers', /\b(FUNDS\s*TRANSFER|PAYMENT\s+RECEIVED|AUTOPAY)\b/],
  ['income.interest', /\b(INTEREST\s*PAID|DIVIDEND)\b/],
  ['income.refund', /\b(REFUND|CASHBACK|REBATE)\b/],
  ['income.salary', /\b(SALARY|PAYROLL|\bWAGES\b)\b/],
];

export interface CategorizeInput {
  merchant: string;
  description: string;
  sourceCategoryHint: string | null;
  isInflow: boolean;
  /** normalizeMerchant(merchant) -> category slug, learned from user corrections */
  merchantRules: Map<string, string>;
}

export interface CategorizeResult {
  slug: string;
  confidence: 'auto';
}

/** Merchant rules are keyed by cash-flow direction too — a merchant's refunds and its charges usually belong in different categories. */
export function merchantRuleKey(merchant: string, isInflow: boolean): string {
  return `${isInflow ? 'in' : 'out'}:${normalizeMerchant(merchant)}`;
}

export function guessCategorySlug(input: CategorizeInput): CategorizeResult {
  const learned = input.merchantRules.get(merchantRuleKey(input.merchant || input.description, input.isInflow));
  if (learned) return { slug: learned, confidence: 'auto' };

  const haystack = `${cleanText(input.merchant)} ${cleanText(input.description)}`.toUpperCase();
  const rules = input.isInflow ? INCOME_KEYWORD_RULES : EXPENSE_KEYWORD_RULES;
  for (const [slug, pattern] of rules) {
    if (pattern.test(haystack)) return { slug, confidence: 'auto' };
  }

  if (input.sourceCategoryHint) {
    const hint = input.sourceCategoryHint.toLowerCase().trim();
    if (SOURCE_CATEGORY_MAP[hint]) return { slug: SOURCE_CATEGORY_MAP[hint], confidence: 'auto' };
    const subPart = hint.split('-').pop()?.trim();
    if (subPart && SOURCE_CATEGORY_MAP[subPart]) return { slug: SOURCE_CATEGORY_MAP[subPart], confidence: 'auto' };
  }

  return { slug: input.isInflow ? 'income.other' : 'general', confidence: 'auto' };
}
