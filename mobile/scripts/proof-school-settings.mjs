// PROOF — School settings' pure half (Stage 5 branch 4, M16). Drives
// `settings/schoolSettings.js`: only changed keys are sent, trimmed; the
// school year is never in the body; an untouched form sends nothing; the
// one client refusal. Run from `mobile/`:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/proof-school-settings.mjs
import { changedDetails, DETAIL_KEYS, detailsFrom, detailsProblem } from '../src/screens/settings/schoolSettings.js';

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}`);
  }
}

const stored = {
  academic_year: '2026-2027',
  school_name: 'Captain H. Francisco Elementary School – Main',
  school_address: 'P. Rosales St., Sta. Ana, Pateros',
  school_id: '136893',
  school_phone: '(02) 8350-6114',
  school_email: '136893@deped.gov.ph',
  facebook_page: '',
  logo_url: null,
};

assert(!DETAIL_KEYS.includes('academic_year') && !('academic_year' in detailsFrom(stored)), 'the school year is never in the form');
assert(detailsFrom(stored).logo_url === '', 'a null stored value is an empty field, never "null"');
assert(Object.keys(changedDetails(stored, detailsFrom(stored))).length === 0, 'an untouched form sends nothing');
const phone = changedDetails(stored, { ...detailsFrom(stored), school_phone: ' 0917 000 0000 ' });
assert(JSON.stringify(phone) === '{"school_phone":"0917 000 0000"}', 'one changed key, trimmed, and nothing else');
assert(Object.keys(changedDetails(stored, { ...detailsFrom(stored), school_name: `${stored.school_name}  ` })).length === 0, 'trailing spaces are not a change');
assert(detailsProblem({ school_name: ' ', school_address: 'x' }) === 'School name and school address must not be empty.' && detailsProblem(detailsFrom(stored)) === null, 'name and address may not be emptied; otherwise the server decides');

console.log(`\nproof-school-settings: ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
