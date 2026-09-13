// Voice → quotation parser. Rules-based, offline. Designed for a mixed Tamil/English
// dictation style where the user follows a small trained grammar. The recognizer gives
// us plain English text (Tamil words come through phonetically); we normalize and scan
// for keywords.
//
// Grammar (all case-insensitive, punctuation ignored):
//   Customer block (any order, before the first "add"):
//     customer <name until next kw>
//     phone   <digits or digit-words>
//     mobile  <digits or digit-words>
//     gstin   <alnum token>
//     city    <name until next kw>
//     state   <name until next kw>
//     address <text until next kw>
//     subject <text until next kw>
//
//   Item block (each starts with "add"; commit with "done"/"next"/next "add"):
//     add <material name until next kw>
//     quantity <number>       // or "qty <N>", or "<N> nos"
//     rate <number>           // or "price <N>"
//     size <A> by <B>         // or "size AxB", "size A cross B", "size A into B"
//     unit <word>             // Nos, Kg, Sqft, Meter, Feet, Ft
//     gst <number> percent    // per-line GST override
//     hsn <alnum>
//     description <text until next kw>
//
// Numbers accept English words ("twenty five", "one hundred fifty", "two thousand")
// or digits ("25", "1500"), and Indian scales lakh / crore.

const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, lakh: 100000, lac: 100000, crore: 10000000 };

const UNITS = new Set(['nos', 'no', 'number', 'numbers', 'kg', 'kilo', 'kilograms', 'kilogram',
  'sqft', 'sqm', 'meter', 'metre', 'meters', 'metres', 'feet', 'foot', 'ft',
  'piece', 'pieces', 'pc', 'pcs', 'ltr', 'litre', 'liter']);
const UNIT_NORMALIZED = {
  no: 'Nos', nos: 'Nos', number: 'Nos', numbers: 'Nos', piece: 'Nos', pieces: 'Nos', pc: 'Nos', pcs: 'Nos',
  kg: 'Kg', kilo: 'Kg', kilogram: 'Kg', kilograms: 'Kg',
  sqft: 'Sqft', sqm: 'Sqm',
  meter: 'Meter', metre: 'Meter', meters: 'Meter', metres: 'Meter',
  feet: 'Feet', foot: 'Feet', ft: 'Feet',
  ltr: 'Ltr', litre: 'Ltr', liter: 'Ltr',
};

// Command keywords that terminate a preceding capture.
const KEYWORDS = new Set([
  'customer', 'client', 'party',
  'phone', 'mobile', 'number',
  'gstin', 'gst', 'hsn',
  'flat', 'total', 'per',
  'city', 'state', 'address', 'pincode', 'pin',
  'subject', 'project', 'title',
  'add', 'item', 'material',
  'quantity', 'qty',
  'rate', 'price',
  'size',
  'weight',
  'unit',
  'description', 'desc', 'note',
  'done', 'next', 'finish', 'stop', 'end',
  'delete', 'remove', 'clear',
  'replace', 'change', 'update', 'set',
]);

// Tamil script (and common Tanglish transliterations) → English keyword equivalents.
// Applied FIRST in the normalization pipeline so downstream rules see English.
// Empty string means "strip the word entirely" (Tamil filler like பண்ணு / aadu).
const TAMIL_MAP = {
  // Customer
  'கஸ்டமர்': 'customer', 'கஸ்டமர்கள்': 'customer', 'கிளையண்ட்': 'client', 'பார்ட்டி': 'party',
  'நேம்': '', 'பெயர்': '',
  // Add — "சேர்" is the actual Tamil word for "add". "ஆட்" is often just an English
  // transliteration filler used in Tanglish ("aadu pannu" = "do it"), so we strip it.
  'ஆட்': '', 'ஆட்ட்': '', 'சேர்': 'add', 'சேர்க்கவும்': 'add', 'சேர்க்க': 'add', 'ஆட்': '',
  'ஐட்டம்': 'item',
  // Fillers ("pannu", "aadu", "sey", "seyyi" etc)
  'பண்ணு': '', 'பண்ணி': '', 'பண்ணுங்க': '', 'பண்ணும்': '', 'செய்': '', 'செய்யி': '', 'ஆடு': '',
  'ஆகும்': '', 'இருக்கு': '', 'ஆக': '', 'உள்ளது': '', 'ஆகும்': '',
  // Phone / Mobile
  'போன்': 'phone', 'மொபைல்': 'mobile', 'நம்பர்': '', 'எண்': '',
  // Address / Location
  'சிட்டி': 'city', 'நகரம்': 'city',
  'ஸ்டேட்': 'state', 'மாநிலம்': 'state',
  'அட்ரெஸ்': 'address', 'முகவரி': 'address',
  'பின்கோட்': 'pincode', 'பின்': 'pincode',
  // Subject
  'சப்ஜெக்ட்': 'subject', 'விஷயம்': 'subject', 'ப்ராஜெக்ட்': 'project', 'திட்டம்': 'project',
  // Item metadata
  'குவாண்டிட்டி': 'quantity', 'குவாலிட்டி': 'quantity', 'எண்ணிக்கை': 'quantity', 'கௌ': 'qty',
  'சைஸ்': 'size', 'அளவு': 'size',
  'ரேட்': 'rate', 'விலை': 'rate', 'ப்ரைஸ்': 'price', 'ப்ரைச்': 'price',
  'யூனிட்': 'unit',
  'ஜிஎஸ்டி': 'gst', 'ஜிஎஸ்.டி': 'gst',
  'எச்எஸ்என்': 'hsn',
  // Numbers 1-10 in Tamil (rest usually spoken as digits or English words)
  'ஒன்று': 'one', 'இரண்டு': 'two', 'ரெண்டு': 'two', 'மூன்று': 'three', 'நான்கு': 'four', 'நாலு': 'four',
  'ஐந்து': 'five', 'அஞ்சு': 'five', 'ஆறு': 'six', 'ஏழு': 'seven', 'ஏளு': 'seven',
  'எட்டு': 'eight', 'ஒன்பது': 'nine', 'ஒம்பது': 'nine', 'பத்து': 'ten',
  'நூறு': 'hundred', 'ஆயிரம்': 'thousand', 'லட்சம்': 'lakh', 'கோடி': 'crore',
  // Separators / prepositions
  'பை': 'by', 'இன்டு': 'into', 'குரோஸ்': 'cross',
  'ஆஃப்': 'of',
  // Currency / units
  'பெர்சண்ட்': 'percent', 'சதவீதம்': 'percent',
  'ரூபாய்': '', 'ரூ': '', 'ரூப்பாய்': '',
  'நோஸ்': 'nos', 'நம்ஸ்': 'nos', 'கிலோ': 'kg',
  // Control
  'டன்': 'done', 'முடிந்தது': 'done', 'நெக்ஸ்ட்': 'next', 'அடுத்த': 'next', 'அடுத்து': 'next',
  'ஃபினிஷ்': 'finish', 'முடி': 'finish', 'ஸ்டாப்': 'stop',
  'டெலீட்': 'delete', 'நீக்கு': 'delete',
  'கிளியர்': 'clear',
  'லாஸ்ட்': 'last',
  'ஆல்': 'all',
  // Common material words (Tanglish)
  'விண்டோஸ்': 'windows', 'கிரில்': 'grill', 'கிரில்ஸ்': 'grill',
  'பைப்': 'pipe', 'பைப்ஸ்': 'pipe', 'எம்எஸ்': 'MS', 'ஷீட்': 'sheet',
  'பால்ட்': 'bolt', 'பாட்ஸ்': 'bolts', 'ரிவெட்': 'rivet', 'ஏங்கிள்': 'angle',
  'வெல்டிங்': 'welding', 'ராட்': 'rod',
};

// Letter-by-letter Tamil script → Latin transliteration. Not linguistically perfect,
// but produces recognisable English forms of names ("ரமேஷ்" → "Ramesh") so quotations
// don't end up with Tamil characters in the customer or item fields.
const TAMIL_CONSONANTS = {
  'க':'k','ங':'ng','ச':'ch','ஞ':'ny','ட':'t','ண':'n','த':'th','ந':'n','ப':'p','ம':'m',
  'ய':'y','ர':'r','ல':'l','வ':'v','ழ':'zh','ள':'l','ற':'r','ன':'n',
  'ஷ':'sh','ஸ':'s','ஹ':'h','ஜ':'j','க்ஷ':'ksh','ஶ':'sh',
};
const TAMIL_VOWEL_MOD = {
  'ா':'aa','ி':'i','ீ':'ee','ு':'u','ூ':'oo','ெ':'e','ே':'ae','ை':'ai','ொ':'o','ோ':'oa','ௌ':'au',
};
const TAMIL_INDEP_VOWELS = {
  'அ':'a','ஆ':'aa','இ':'i','ஈ':'ee','உ':'u','ஊ':'oo','எ':'e','ஏ':'ae','ஐ':'ai','ஒ':'o','ஓ':'oa','ஔ':'au',
};
const TAMIL_HALANT = '்';

function transliterateTamilWord(word) {
  // Only touch words that contain Tamil script characters
  if (!/[஀-௿]/.test(word)) return word;
  let out = '';
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];
    if (TAMIL_CONSONANTS[c]) {
      const cons = TAMIL_CONSONANTS[c];
      if (next === TAMIL_HALANT) {
        out += cons;
        i++; // skip halant
      } else if (next && TAMIL_VOWEL_MOD[next]) {
        out += cons + TAMIL_VOWEL_MOD[next];
        i++; // skip modifier
      } else {
        out += cons + 'a'; // inherent 'a'
      }
    } else if (TAMIL_INDEP_VOWELS[c]) {
      out += TAMIL_INDEP_VOWELS[c];
    } else {
      out += c;
    }
  }
  return out;
}

function transliterateTamilPhrase(text) {
  return String(text || '').split(/\s+/).map(transliterateTamilWord).join(' ');
}

function translateTamil(text) {
  return String(text || '').split(/\s+/).map((w) => {
    if (TAMIL_MAP[w] !== undefined) return TAMIL_MAP[w];
    // Word not in the keyword map — if it contains Tamil script, transliterate letter-by-letter
    // so names like "ரமேஷ்" become "ramesh" instead of staying as Tamil script in the quotation.
    return transliterateTamilWord(w);
  }).filter(Boolean).join(' ');
}

// Rewrite common natural phrasings into the trigger-word grammar the main parser expects.
// Runs BEFORE tokenization. Every rewrite is best-effort; unmatched text passes through.
// Examples handled:
//   "twenty pieces of MS pipe at eighty rupees each"
//     → "quantity 20 add MS pipe rate 80"
//   "give me 5 grills at 22600"
//     → "add grills quantity 5 rate 22600"
//   "5 nos of angle at 65 rupees"
//     → "quantity 5 add angle rate 65"
//   "MS pipe 20 nos 80 rupees each"
//     → "add MS pipe quantity 20 rate 80"
function normalizeNaturalPhrasing(text) {
  // Step 0: translate Tamil/Tanglish keywords to English first
  let s = ' ' + translateTamil(String(text || '')) + ' ';
  const NUM = '(\\d+(?:\\.\\d+)?)';
  const NUMW = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)';

  // Strip common English filler words that add noise (also Tanglish "aadu pannu" style already stripped by TAMIL_MAP)
  s = s.replace(/\b(please|kindly|so|then|okay|ok|umm|uh|actually|basically|and now|now)\b/gi, ' ');
  // "customer name X" / "phone number X" → drop the "name"/"number" tag
  s = s.replace(/\b(customer|client|party)\s+name\s+/gi, '$1 ');
  s = s.replace(/\b(phone|mobile)\s+number\s+/gi, '$1 ');
  // Currency-tail filler ("rupees each", "rs each", "each rupees")
  s = s.replace(/\b(rupees|rs\.?)\s*(each|per\s+piece|per\s+nos|per\s+item)?\b/gi, ' ');
  s = s.replace(/\b(each|per\s+piece|per\s+nos|per\s+item)\b/gi, ' ');
  // "at" / "for" / "@" preceding a rate (digit or word-number)
  s = s.replace(new RegExp(`\\b(at|@|for)\\s+(?=\\d|${NUMW})`, 'gi'), ' rate ');
  // "give me / take / put / need / want / order  <N>  <name>" (name until rate/at/and/done)
  // Rewrites to "add <name> quantity <N>" so name lands in the parser's add-capture slot.
  const NAME = '([a-z]+(?:\\s+[a-z]+)*?)';
  const STOP = '(?=\\s+(?:rate|per|at|and|,|done|next|finish|\\.|$))';
  s = s.replace(new RegExp(`\\b(?:give me|give|take|put|need|want|order)\\s+${NUM}\\s+${NAME}${STOP}`, 'gi'),
    (_m, n, name) => ` add ${name.trim()} quantity ${n} `);
  s = s.replace(new RegExp(`\\b(?:give me|give|take|put|need|want|order)\\s+${NUMW}\\s+${NAME}${STOP}`, 'gi'),
    (_m, n, name) => ` add ${name.trim()} quantity ${n} `);
  // "and  <N>  <name>" — list continuation, treat as next item
  s = s.replace(new RegExp(`\\band\\s+${NUM}\\s+${NAME}${STOP}`, 'gi'),
    (_m, n, name) => ` done add ${name.trim()} quantity ${n} `);
  // "<num> pieces/pcs/nos/no of X" → "quantity <num> add" (parser carries forward the qty)
  s = s.replace(new RegExp(`\\b${NUM}\\s*(?:pieces|piece|pcs|nos|no\\.?|numbers|number)\\s*(?:of\\s+)?`, 'gi'),
    (_m, n) => ` quantity ${n} add `);
  s = s.replace(new RegExp(`\\b${NUMW}\\s+(?:pieces|piece|pcs|nos|no\\.?|numbers|number)\\s+(?:of\\s+)?`, 'gi'),
    (_m, n) => ` quantity ${n} add `);
  // "X <num> nos" placed after item name: "MS pipe 20 nos" → best-effort rewrite done
  // (This is common: "MS pipe 20 nos 80 rupees" → keep as is; parser can handle if user says "add" first)
  // "into" already handled by size parser but sometimes "cross" or "*"
  // Numbers 21-99 spoken as "twenty five" — keep together (parseNumber handles it)
  // Collapse whitespace
  return s.replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  const normalized = normalizeNaturalPhrasing(text);
  return normalized
    .toLowerCase()
    // Strip most punctuation, BUT keep decimals inside numbers ("317.6" stays whole).
    .replace(/[,;!?"“”]/g, ' ')
    .replace(/(?<!\d)\.(?!\d)/g, ' ')     // lone "." between non-digits → space; keep "317.6"
    .replace(/[×*]/g, ' x ')              // 4×4 → 4 x 4
    .replace(/(\d)\s*x\s*(\d)/g, '$1 x $2')
    .split(/\s+/)
    .filter(Boolean);
}

// Consume leading number tokens; return { number, consumed } or null.
function parseNumber(tokens) {
  let result = 0;
  let current = 0;
  let consumed = 0;
  let matched = false;
  for (const raw of tokens) {
    const w = raw.replace(/[^a-z0-9.]/g, '');
    if (!w) { consumed++; continue; }
    if (/^\d+(\.\d+)?$/.test(w)) {
      // Numeric literal — start fresh (spoken '25' beats an in-progress word count)
      if (current || result) { result += current; current = 0; matched = true; consumed++; result += Number(w); continue; }
      current = Number(w); consumed++; matched = true; continue;
    }
    if (ONES[w] !== undefined) { current += ONES[w]; consumed++; matched = true; continue; }
    if (TENS[w] !== undefined) { current += TENS[w]; consumed++; matched = true; continue; }
    if (SCALES[w] !== undefined) {
      const mult = SCALES[w];
      if (current === 0) current = 1;
      if (mult >= 1000) { result += current * mult; current = 0; }
      else current = current * mult;
      consumed++; matched = true; continue;
    }
    // NOTE: we do NOT treat "and" as a number filler. That would misread "6 and 3"
    // as 9 in phrases like "size 4 by 6 and 3 by 5" (two-face rectangle). Users can
    // omit "and" between number words — "one hundred fifty" parses to 150 correctly.
    if (w === '-') { consumed++; continue; }
    break;
  }
  if (!matched) return null;
  return { number: result + current, consumed };
}

// Consume a stream of digit-words (for phone numbers). "nine eight seven" → "987".
function parseDigitSequence(tokens) {
  const digits = [];
  let consumed = 0;
  for (const raw of tokens) {
    const w = raw.replace(/[^a-z0-9]/g, '');
    if (!w) { consumed++; continue; }
    if (/^\d+$/.test(w)) { digits.push(w); consumed++; continue; }
    if (ONES[w] !== undefined && ONES[w] < 10) { digits.push(String(ONES[w])); consumed++; continue; }
    if (w === 'oh' || w === 'o' || w === 'zero') { digits.push('0'); consumed++; continue; }
    // 'double' means duplicate next digit
    if (w === 'double' || w === 'triple') {
      // handled later, break for now if the next token isn't a digit-word
      break;
    }
    break;
  }
  if (digits.length === 0) return null;
  return { digits: digits.join(''), consumed };
}

// Capture free-text until next keyword. Skips leading commas/punctuation already stripped.
function captureUntilKeyword(tokens, extraStop = []) {
  const stop = new Set([...KEYWORDS, ...extraStop]);
  const out = [];
  let consumed = 0;
  for (const w of tokens) {
    if (stop.has(w)) break;
    out.push(w);
    consumed++;
  }
  return { text: out.join(' ').trim(), consumed };
}

function titleCase(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Show the normalized (Tamil→English translated + rewrite-applied) form of the transcript.
// Useful for the modal's preview so the user can see what the parser is working with.
export function normalizeForPreview(text) {
  return normalizeNaturalPhrasing(text);
}

// Main entry. Returns { customer, subject, items, gstMode, flatGstRate, warnings }
export function parseVoiceTranscript(text) {
  const tokens = tokenize(text);
  const customer = { name: '', phone: '', gstin: '', city: '', state: '', address: '' };
  let subject = '';
  const items = [];
  let current = null; // current item being built
  let gstMode = null;       // null = leave form default; 'per_line' | 'flat_on_total'
  let flatGstRate = null;
  const warnings = [];

  // Buffer for non-keyword tokens that appear between commands. Used to auto-detect
  // an item name when the user says "windows grill size 4 quantity 3 rate 300" without
  // explicitly saying "add" first. When a size/qty/rate/etc keyword fires and current
  // is null, we take pendingName as the item name.
  let pendingName = [];
  const takePendingName = () => {
    const n = pendingName.join(' ').trim();
    pendingName = [];
    return n;
  };
  const ensureCurrent = () => {
    if (!current) {
      current = { name: takePendingName(), quantity: null, rate: null, unit: 'Nos', size: '', gst_rate: null, hsn_code: '', description: '' };
    }
  };

  const commitItem = () => {
    // Only push items that have a name — a stray "quantity" or "rate" without a name
    // is treated as pending metadata for the NEXT "add".
    if (current && current.name) {
      items.push({
        name: titleCase(current.name || ''),
        description: current.description || '',
        hsn_code: current.hsn_code || '',
        unit: current.unit || 'Nos',
        size: current.size || '',
        weight: current.weight || '',
        price_by: current.price_by === 'weight' ? 'weight' : 'size',
        quantity: current.quantity != null ? current.quantity : 1,
        rate: current.rate != null ? current.rate : 0,
        gst_rate: current.gst_rate != null ? current.gst_rate : 18,
      });
    }
    current = null;
  };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const rest = tokens.slice(i + 1);

    switch (t) {
      case 'customer':
      case 'client':
      case 'party': {
        const { text, consumed } = captureUntilKeyword(rest);
        customer.name = titleCase(text);
        i += 1 + consumed;
        continue;
      }
      case 'phone':
      case 'mobile': {
        // Optionally skip "number" filler
        let skip = 0;
        if (rest[0] === 'number') skip = 1;
        const seq = parseDigitSequence(rest.slice(skip));
        if (seq) { customer.phone = seq.digits; i += 1 + skip + seq.consumed; continue; }
        i += 1; continue;
      }
      case 'gstin': {
        const first = rest[0];
        if (first) { customer.gstin = String(first).toUpperCase(); i += 2; continue; }
        i += 1; continue;
      }
      case 'city': {
        const { text, consumed } = captureUntilKeyword(rest);
        customer.city = titleCase(text);
        i += 1 + consumed; continue;
      }
      case 'state': {
        const { text, consumed } = captureUntilKeyword(rest);
        customer.state = titleCase(text);
        i += 1 + consumed; continue;
      }
      case 'address': {
        const { text, consumed } = captureUntilKeyword(rest);
        customer.address = titleCase(text);
        i += 1 + consumed; continue;
      }
      case 'pincode':
      case 'pin': {
        const seq = parseDigitSequence(rest);
        if (seq) { customer.pincode = seq.digits; i += 1 + seq.consumed; continue; }
        i += 1; continue;
      }
      case 'subject':
      case 'project':
      case 'title': {
        const { text, consumed } = captureUntilKeyword(rest);
        subject = titleCase(text);
        i += 1 + consumed; continue;
      }
      case 'add':
      case 'item':
      case 'material': {
        // If there's a pending item with no name (user said "quantity 20 add pipe"),
        // carry forward its metadata to the new item instead of committing an empty row.
        const carry = (current && !current.name) ? current : null;
        if (!carry) commitItem();
        current = carry || { name: '', quantity: null, rate: null, unit: 'Nos', size: '', gst_rate: null, hsn_code: '', description: '' };
        const { text, consumed } = captureUntilKeyword(rest);
        // Prefer explicit text; otherwise fall back to anything the pending buffer collected.
        current.name = text || takePendingName();
        pendingName = [];
        i += 1 + consumed; continue;
      }
      case 'quantity':
      case 'qty': {
        ensureCurrent();
        const n = parseNumber(rest);
        if (n) { current.quantity = n.number; i += 1 + n.consumed; continue; }
        i += 1; continue;
      }
      case 'rate':
      case 'price': {
        // "price by weight [N kg]" — toggle mode AND optionally capture the weight value in one breath.
        if (rest[0] === 'by' && (rest[1] === 'weight' || rest[1] === 'kg' || rest[1] === 'kilo')) {
          ensureCurrent();
          current.price_by = 'weight';
          // rest[0]=by, rest[1]=weight → weight-number (if any) starts at rest[2]
          const n = parseNumber(rest.slice(2));
          let consumedAfterKeyword = 2; // by + weight
          if (n) {
            let raw = String(n.number);
            const after = rest[2 + n.consumed];
            let extra = 0;
            if (after && ['kg', 'kilo', 'kilos', 'kilograms', 'kilogram', 'ton', 'tonne', 'tons', 'tonnes', 'gm', 'gram', 'grams'].includes(after)) {
              raw += ' ' + after; extra = 1;
            }
            current.weight = raw;
            consumedAfterKeyword += n.consumed + extra;
          }
          i += 1 + consumedAfterKeyword; continue;
        }
        if (rest[0] === 'by' && (rest[1] === 'size' || rest[1] === 'qty' || rest[1] === 'quantity' || rest[1] === 'nos' || rest[1] === 'piece')) {
          const target = current || items[items.length - 1];
          if (target) target.price_by = 'size';
          i += 3; continue;
        }
        ensureCurrent();
        const n = parseNumber(rest);
        if (n) { current.rate = n.number; i += 1 + n.consumed; continue; }
        i += 1; continue;
      }
      case 'size': {
        ensureCurrent();
        // Accepts:
        //   "A"                                — scalar
        //   "A by B"                           — area
        //   "A by B by C"                      — volume (up to 3 dims per group)
        //   "A by B plus C by D"               — sum of two areas (multi-face shape)
        //   "A by B and C by D also E by F"    — sum of three groups
        // Separators inside a group: by / cross / into / x
        // Group separators: plus / and / also  (rendered as "+" in the size string)
        const groups = [];
        let cursor = 0;
        const readGroup = () => {
          const dims = [];
          while (cursor < rest.length && dims.length < 3) {
            const n = parseNumber(rest.slice(cursor));
            if (!n) break;
            dims.push(n.number);
            cursor += n.consumed;
            if (rest[cursor] && ['by', 'cross', 'into', 'x'].includes(rest[cursor])) { cursor++; }
            else { break; }
          }
          return dims;
        };
        let g = readGroup();
        if (g.length) groups.push(g.join('x'));
        while (cursor < rest.length && ['plus', 'and', 'also'].includes(rest[cursor])) {
          cursor++;
          const nextGroup = readGroup();
          if (!nextGroup.length) break;
          groups.push(nextGroup.join('x'));
        }
        if (groups.length === 0) { i += 1; continue; }
        current.size = groups.join('+');
        i += 1 + cursor; continue;
      }
      case 'weight': {
        ensureCurrent();
        // Accept a number followed by an optional unit word (kg, ton, gm, kilo).
        const n = parseNumber(rest);
        if (!n) { i += 1; continue; }
        let raw = String(n.number);
        const after = rest[n.consumed];
        if (after && ['kg', 'kilo', 'kilos', 'kilograms', 'kilogram', 'ton', 'tonne', 'tons', 'tonnes', 'gm', 'gram', 'grams'].includes(after)) {
          raw += ' ' + after;
          i += 1 + n.consumed + 1;
        } else {
          i += 1 + n.consumed;
        }
        current.weight = raw;
        continue;
      }
      case 'unit': {
        ensureCurrent();
        const w = rest[0] && rest[0].replace(/[^a-z]/g, '');
        if (w && UNIT_NORMALIZED[w]) { current.unit = UNIT_NORMALIZED[w]; i += 2; continue; }
        if (w && UNITS.has(w)) { current.unit = titleCase(w); i += 2; continue; }
        i += 1; continue;
      }
      case 'gst': {
        const n = parseNumber(rest);
        if (!n) { i += 1; continue; }
        const after = rest[n.consumed];
        const percentSkip = (after === 'percent' || after === 'percentage') ? 1 : 0;
        // Trust whatever number the user said, including 0. The preview panel shows the
        // captured value so mishears are visible before hitting Fill.
        if (current) {
          current.gst_rate = n.number;
        } else {
          gstMode = 'per_line';
          flatGstRate = n.number;
        }
        i += 1 + n.consumed + percentSkip;
        continue;
      }
      case 'flat':
      case 'total': {
        // "flat gst N percent" / "total gst N percent" → whole quotation on one GST rate
        if (rest[0] === 'gst') {
          const n = parseNumber(rest.slice(1));
          if (n) {
            gstMode = 'flat_on_total';
            flatGstRate = n.number;
            const after = rest[1 + n.consumed];
            const percentSkip = (after === 'percent' || after === 'percentage') ? 1 : 0;
            i += 1 + 1 + n.consumed + percentSkip;
            continue;
          }
        }
        i += 1; continue;
      }
      case 'per': {
        // "per line gst" / "per product gst" / "per item gst" → per-line mode
        if ((rest[0] === 'line' || rest[0] === 'product' || rest[0] === 'item') && rest[1] === 'gst') {
          gstMode = 'per_line';
          i += 3; continue;
        }
        i += 1; continue;
      }
      case 'replace':
      case 'change':
      case 'update':
      case 'set': {
        // Grammar (all optional bits in brackets):
        //   "replace [the] [item [<N>] | last item] <field> [with|to|as|by|is] <value>"
        //   e.g. "replace item 2 name to PVC pipe"
        //        "replace item three size to 4 by 6"
        //        "replace last item quantity to 25"
        //        "replace name to X"  (defaults to last item)
        // <field> ∈ name, size, weight, quantity, qty, rate, price, gst, hsn, unit,
        //          customer, phone, mobile, city, state, address, subject, project
        let cursor = 0;
        let targetIdx = null;   // 0-based; null = "last"

        // Optional "the"
        while (cursor < rest.length && rest[cursor] === 'the') cursor++;

        // Optional "item [<N>]" or "row [<N>]" or "line [<N>]" or "serial [number] <N>"
        if (rest[cursor] === 'item' || rest[cursor] === 'items' || rest[cursor] === 'row' || rest[cursor] === 'line') {
          cursor++;
          if (rest[cursor] === 'number' || rest[cursor] === 'no' || rest[cursor] === 'no.') cursor++;
          // Try to eat a number
          const n = parseNumber(rest.slice(cursor));
          if (n) { targetIdx = n.number - 1; cursor += n.consumed; }
        } else if (rest[cursor] === 'serial') {
          cursor++;
          if (rest[cursor] === 'number' || rest[cursor] === 'no' || rest[cursor] === 'no.') cursor++;
          const n = parseNumber(rest.slice(cursor));
          if (n) { targetIdx = n.number - 1; cursor += n.consumed; }
        } else if (rest[cursor] === 'last') {
          cursor++;
          if (rest[cursor] === 'item' || rest[cursor] === 'row' || rest[cursor] === 'line') cursor++;
          // targetIdx stays null → last item
        } else if (/^\d+$/.test(rest[cursor] || '')) {
          // Bare number: "replace 2 name to X"
          targetIdx = Number(rest[cursor]) - 1;
          cursor++;
        }

        let field = rest[cursor]; cursor++;
        // "customer name" collapses to customer
        if (field === 'customer' && rest[cursor] === 'name') cursor++;
        // Skip glue words
        while (cursor < rest.length && ['with', 'to', 'as', 'by', 'is'].includes(rest[cursor])) cursor++;

        // Target selection: item fields → picked item (by index or last), global → customer/subject state
        const itemTarget = () => {
          if (targetIdx != null && targetIdx >= 0 && targetIdx < items.length) return items[targetIdx];
          return current || items[items.length - 1] || null;
        };

        switch (field) {
          case 'name':
          case 'title':
          case 'material': {
            const { text, consumed } = captureUntilKeyword(rest.slice(cursor));
            const t = itemTarget();
            if (t) t.name = titleCase(text);
            i += 1 + cursor + consumed; continue;
          }
          case 'size': {
            const dims = [];
            let cc = cursor;
            while (cc < rest.length && dims.length < 3) {
              const n = parseNumber(rest.slice(cc));
              if (!n) break;
              dims.push(n.number); cc += n.consumed;
              if (rest[cc] && ['by', 'cross', 'into', 'x'].includes(rest[cc])) cc++; else break;
            }
            const t = itemTarget();
            if (t && dims.length) t.size = dims.join('x');
            i += 1 + cc; continue;
          }
          case 'weight': {
            const n = parseNumber(rest.slice(cursor));
            const t = itemTarget();
            if (n && t) t.weight = String(n.number);
            i += 1 + cursor + (n ? n.consumed : 0); continue;
          }
          case 'quantity':
          case 'qty': {
            const n = parseNumber(rest.slice(cursor));
            const t = itemTarget();
            if (n && t) t.quantity = n.number;
            i += 1 + cursor + (n ? n.consumed : 0); continue;
          }
          case 'rate':
          case 'price': {
            const n = parseNumber(rest.slice(cursor));
            const t = itemTarget();
            if (n && t) t.rate = n.number;
            i += 1 + cursor + (n ? n.consumed : 0); continue;
          }
          case 'gst': {
            const n = parseNumber(rest.slice(cursor));
            const t = itemTarget();
            if (n && t) t.gst_rate = n.number;
            const after = rest[cursor + (n ? n.consumed : 0)];
            i += 1 + cursor + (n ? n.consumed : 0) + ((after === 'percent' || after === 'percentage') ? 1 : 0);
            continue;
          }
          case 'unit': {
            const w = rest[cursor] && rest[cursor].replace(/[^a-z]/g, '');
            const t = itemTarget();
            if (w && t) t.unit = UNIT_NORMALIZED[w] || titleCase(w);
            i += 1 + cursor + 1; continue;
          }
          case 'hsn': {
            const w = rest[cursor];
            const t = itemTarget();
            if (w && t) t.hsn_code = String(w).toUpperCase();
            i += 1 + cursor + 1; continue;
          }
          case 'customer':
          case 'client':
          case 'party': {
            const { text, consumed } = captureUntilKeyword(rest.slice(cursor));
            customer.name = titleCase(text);
            i += 1 + cursor + consumed; continue;
          }
          case 'phone':
          case 'mobile': {
            const seq = parseDigitSequence(rest.slice(cursor));
            if (seq) { customer.phone = seq.digits; i += 1 + cursor + seq.consumed; continue; }
            i += 1 + cursor; continue;
          }
          case 'city': {
            const { text, consumed } = captureUntilKeyword(rest.slice(cursor));
            customer.city = titleCase(text);
            i += 1 + cursor + consumed; continue;
          }
          case 'state': {
            const { text, consumed } = captureUntilKeyword(rest.slice(cursor));
            customer.state = titleCase(text);
            i += 1 + cursor + consumed; continue;
          }
          case 'address': {
            const { text, consumed } = captureUntilKeyword(rest.slice(cursor));
            customer.address = titleCase(text);
            i += 1 + cursor + consumed; continue;
          }
          case 'subject':
          case 'project': {
            const { text, consumed } = captureUntilKeyword(rest.slice(cursor));
            subject = titleCase(text);
            i += 1 + cursor + consumed; continue;
          }
          default:
            // Unknown field — skip the "replace" keyword and move on
            i += 1; continue;
        }
      }
      case 'hsn': {
        if (!current) { i += 1; continue; }
        const first = rest[0];
        if (first) { current.hsn_code = String(first).toUpperCase(); i += 2; continue; }
        i += 1; continue;
      }
      case 'description':
      case 'desc':
      case 'note': {
        if (!current) { i += 1; continue; }
        const { text, consumed } = captureUntilKeyword(rest);
        current.description = text;
        i += 1 + consumed; continue;
      }
      case 'done':
      case 'next':
      case 'finish':
      case 'end':
      case 'stop': {
        commitItem();
        pendingName = [];
        i += 1; continue;
      }
      case 'delete':
      case 'remove': {
        // "delete last item" — pop last committed item
        if (rest[0] === 'last' && (rest[1] === 'item' || rest[1] === 'row')) {
          if (items.length > 0) items.pop();
          i += 3; continue;
        }
        i += 1; continue;
      }
      case 'clear': {
        // "clear item" or "clear all"
        if (rest[0] === 'item') { current = null; i += 2; continue; }
        if (rest[0] === 'all') { items.length = 0; current = null; i += 2; continue; }
        i += 1; continue;
      }
      default:
        // Unknown token — could be part of an item name spoken without "add".
        // Buffer it so a following size/quantity/rate can attach it as the item name.
        // Skip pure numbers (they belong to their command).
        if (!/^\d+(\.\d+)?$/.test(t)) pendingName.push(t);
        i += 1;
    }
  }
  commitItem();

  return { customer, subject, items, gstMode, flatGstRate, warnings };
}

// Small helper — returns true if the browser supports Web Speech API.
export function isVoiceSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
