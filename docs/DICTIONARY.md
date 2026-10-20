# Arabic word validation

This document says exactly what the validator does, what data it uses, and what it cannot do.

## Honest status

| Item | Status |
|---|---|
| Validation engine (normalization, lexicon, morphology, policies, worker, custom words) | Implemented and unit-tested |
| **Shipped lexicon** (`public/data/lexicon/core.txt`) | A **small seed list (~600 entries) written by the project author**. It is *not* a dictionary of Arabic. It exists so the engine can be demonstrated, tested and run offline out of the box. Many valid Arabic words will be reported as "not found". |
| Large lexicon from Wiktionary | **Builder implemented** (`scripts/build-lexicon.mjs`) and tested on a hand-written fixture that follows the Wiktextract schema. It has **not** been run on a real dump: the environment this project was prepared in had no network access, so no external dataset could be downloaded, inspected or bundled. |
| Coverage figures | None claimed. Run the builder and read the printed counts for the real numbers. |

Because the shipped lexicon is incomplete, the default behaviour for an unrecognised word is **ask the players** (Settings → "when a word is not in the dictionary"), never silently reject. "Block the move" mode is available for use with a full lexicon.

## Result statuses

* `valid` – found in the lexicon (`source: lexicon`), in the player's custom list (`custom`), or accepted by lexicon-backed morphology (`morphology`).
* `not_found` – absent from the installed resources. This is **not** a claim that the word is not Arabic.
* `unavailable` – the lexicon could not be loaded (the game continues; players are asked).

## Normalization (`public/js/arabic/normalize.js`)

The displayed word is never modified. Lookup keys are produced by a named profile:

* **orthographic** – removes only decoration: harakat, shadda, tanwin, dagger alef, Quranic marks, tatweel, bidi/zero-width controls; NFKC (presentation forms → letters); Persian kaf/yeh → Arabic kaf/yeh. Hamza, alef, ya and ta marbuta distinctions are **kept**. Lexicon headwords are stored in this form so the real spelling is always available.
* **tile** – orthographic plus the folds forced by a 28-letter tile set: `أ إ آ ٱ → ا`, `ى → ي`, `ة → ه`, `ؤ → و`, `ئ → ي`. A stand-alone `ء` is never dropped, so words that need a stand-alone hamza cannot be formed (the original tile set has no `ء`, `ة` or `ى` tile; the distribution was kept unchanged).

Consequences, deliberately accepted and tested: `على` and `علي` share a key (the tiles cannot tell them apart); different letter sequences never merge (`كتب` ≠ `كتاب`). Options are individually switchable (`normalize(text, { foldAlef: false })`), but the game itself uses `tile`.

## Lexicon files and flags

Plain UTF-8, `headword<TAB>flags`, `#` comments. Registered in `public/data/lexicon/meta.json` with a **tier**:

* `core` tier → used by both policies.
* `extended` tier → used by *Expanded* only.

Flags decide which affixes may attach (nothing is generated unless a flag allows it):

| Flag | Meaning |
|---|---|
| `X` | exact form only (default) |
| `N` | nominal: proclitics و/ف, ب/ك/ل, ال (incl. لل), possessive suffixes (ي نا ك كما كم كن ه ها هم هما هن) – but not ال + possessive |
| `d` / `m` / `f` | dual ان/ين; sound masculine plural ون/ين; sound feminine plural ات (ta marbuta rules: `ة→ت` before dual/possessive, dropped before ات) |
| `S` | function word taking pronoun suffixes (في → فيه) |
| `G` | sound triliteral form-I verb: full paradigm generated (past, present/subjunctive/jussive, imperative) incl. root-final ن/ت assimilation |
| `V` | listed verb form (any person/class): accepts و/ف and object pronouns on consonant-final forms |

## Policies (`Validator`)

* **Strict** – the key must equal a lexicon headword of a `core` file. No morphology.
* **Expanded** – all tiers, plus morphology limited to the flags above.
* **Custom list** – user words (Settings, or "accept and add" in the challenge dialog) are accepted under both policies, normalised on entry, stored only in the browser (`localStorage`).

## Not covered (must be present in the lexicon to be accepted)

Broken plurals; weak, hamzated and doubled verbs (only listed forms); derived verb forms II–X; participles, verbal nouns, comparatives, nisba adjectives; dialectal words; proper nouns (excluded by the builder); isolated-word grammar/syntax (a single board word cannot establish sentence-level grammaticality, so none is attempted). The morphology can never legitimise a form whose stem is not in the lexicon.

## Building a large lexicon (recommended next step)

1. Download the Arabic JSONL extract from <https://kaikki.org> (Wiktextract output for Arabic) into `data-raw/` (git-ignored).
2. `npm run lexicon:build -- --kaikki data-raw/<file>.jsonl`
3. `npm run build && npm test` and commit the generated `public/data/lexicon/*.txt` + `meta.json`.

The builder keeps single Arabic words (2–15 letters), drops names/affixes/phrases/symbols and entries tagged misspelling/nonstandard, puts lemma headwords in the `core` tier and Wiktionary-listed inflected forms in the `extended` tier, and writes an attribution header into each file.

## Licensing

* Project code and the seed list: MIT.
* Wiktionary-derived data (if you generate it): Wiktionary text is available under CC BY-SA (and GFDL); keep the attribution header in the generated files and credit Wiktionary and Wiktextract (<https://github.com/tatuylonen/wiktextract>) in your deployment. Check the current terms at <https://kaikki.org> and Wiktionary's copyright page before redistributing. Share-alike applies to the data files.
* No commercial or unverifiable dictionary is bundled. Other open resources were considered but **not** verified or integrated; verify their licences before use.

## Performance

Measured in Node (not on a phone): 1,000 checks against a synthetic 300,000-entry lexicon took ≈70 ms on the machine used (`tests/arabic.test.mjs`). Parsing and memory use of a real large lexicon in mobile browsers were **not** measured. Parsing happens in a Web Worker (main-thread fallback if workers are unavailable); lookups use a `Map`, fine for hundreds of thousands of entries, but test on target devices before shipping millions.
