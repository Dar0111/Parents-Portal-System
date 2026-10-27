/**
 * Remove earlier copies of the three SMS gateway lines in server/.env.
 *
 * dotenv keeps the last occurrence of a key. This deletes the earlier
 * allow-listed lines and leaves every other line byte-identical, including
 * each line's own ending and a leading BOM. The default is a dry run and
 * writes nothing. There is no backup file: the owner's copy lives outside
 * the repo.
 *
 *   node scripts/dedupe-env-duplicates.js
 *   node scripts/dedupe-env-duplicates.js --apply
 *   node scripts/dedupe-env-duplicates.js --self-test
 *
 * Names, counts and line numbers only. Never a value.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '..', '.env');
const ALLOW = ['SMS_GATEWAY_URL', 'SMS_GATEWAY_USER', 'SMS_GATEWAY_PASS'];
const ALLOW_SET = new Set(ALLOW);
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

function usage() {
  console.error('usage: node scripts/dedupe-env-duplicates.js [--apply | --self-test]');
  process.exit(2);
}

function splitLines(text) {
  if (text.length === 0) return [];
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    } else if (ch === '\r') {
      const end = text[i + 1] === '\n' ? i + 2 : i + 1;
      lines.push(text.slice(start, end));
      i = end - 1;
      start = end;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

function bodyOf(line) {
  return line.replace(/\r\n$|\n$|\r$/, '');
}

function endingKind(text) {
  const withoutCrlf = text.replace(/\r\n/g, '');
  const hasCrlf = text.includes('\r\n');
  const hasLf = withoutCrlf.includes('\n');
  const hasCr = withoutCrlf.includes('\r');
  const kinds = [hasCrlf, hasLf, hasCr].filter(Boolean).length;
  if (kinds > 1) return 'mixed';
  if (hasCrlf) return 'CRLF';
  return 'LF';
}

// One leading BOM is a file prefix, not part of a line. dotenv's pattern
// does not treat U+FEFF as whitespace, so the comparison strips one from
// each text before parse. The bytes written still start with the BOM.
function effectiveParse(text) {
  return dotenv.parse(text.replace(/^\uFEFF/, ''));
}

function keyOfLine(line) {
  const parsed = effectiveParse(bodyOf(line));
  const keys = Object.keys(parsed);
  if (keys.length !== 1) return null;
  return keys[0];
}

function assignmentRest(body) {
  const match = body.match(/^\uFEFF?\s*(?:export\s+)?[\w.-]+(?:\s*=\s*?|:\s+?)([\s\S]*)$/);
  return match ? match[1] : null;
}

function quoteUnclosed(line) {
  const rest = assignmentRest(bodyOf(line));
  if (rest == null) return false;
  const value = rest.replace(/^\s*/, '');
  const quote = value[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') return false;
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === '\\' && value[i + 1] === quote) {
      i += 1;
      continue;
    }
    if (value[i] === quote) return false;
  }
  return true;
}

function differingKeys(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff = [];
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(before, name) || !Object.prototype.hasOwnProperty.call(after, name) || before[name] !== after[name]) {
      diff.push(name);
    }
  }
  return diff.sort();
}

function transform(text) {
  const lines = splitLines(text);
  const occurrences = new Map();
  const unclosed = [];

  lines.forEach((line, index) => {
    const key = keyOfLine(line);
    if (!key) return;
    const lineNumber = index + 1;
    if (!occurrences.has(key)) occurrences.set(key, []);
    occurrences.get(key).push(lineNumber);
    if (ALLOW_SET.has(key) && quoteUnclosed(line)) unclosed.push({ key, line: lineNumber });
  });

  if (unclosed.length) {
    return { ok: false, reason: 'unclosed', unclosed, linesBefore: lines.length };
  }

  const remove = new Set();
  for (const key of ALLOW) {
    const nums = occurrences.get(key) || [];
    nums.slice(0, -1).forEach((lineNumber) => remove.add(lineNumber));
  }

  const kept = [];
  lines.forEach((line, index) => {
    if (!remove.has(index + 1)) kept.push(line);
  });
  const result = kept.join('');
  const before = effectiveParse(text);
  const after = effectiveParse(result);
  const differing = differingKeys(before, after);

  return {
    ok: differing.length === 0,
    reason: differing.length === 0 ? null : 'parse',
    differing,
    text: result,
    linesBefore: lines.length,
    linesAfter: kept.length,
    occurrences,
    removed: remove.size,
    endings: endingKind(text),
    keyCount: Object.keys(before).length,
    identical: differing.length === 0,
  };
}

function lineList(nums) {
  return nums.length ? nums.join(', ') : 'none';
}

function formatReport(modeLabel, hasBom, outcome) {
  const rows = [`mode: ${modeLabel}`];
  if (outcome.reason === 'unclosed') {
    for (const item of outcome.unclosed) {
      rows.push(`refusing: ${item.key} opens a quoted value that does not close on the same line (line ${item.line})`);
    }
    return rows;
  }
  for (const key of ALLOW) {
    const nums = outcome.occurrences.get(key) || [];
    const kept = nums.length ? nums[nums.length - 1] : 'none';
    const removed = nums.slice(0, -1);
    const word = nums.length === 1 ? 'occurrence' : 'occurrences';
    rows.push(`${key}: ${nums.length} ${word}, lines ${lineList(nums)}, kept ${kept}, removed ${lineList(removed)}`);
  }
  const others = [];
  for (const [name, nums] of outcome.occurrences) {
    if (!ALLOW_SET.has(name) && nums.length >= 2) others.push({ name, nums });
  }
  others.sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) rows.push('other duplicated keys: none');
  else {
    rows.push('other duplicated keys:');
    for (const item of others) {
      rows.push(`  ${item.name}: ${item.nums.length} occurrences, lines ${item.nums.join(', ')}, untouched`);
    }
  }
  rows.push(`lines before: ${outcome.linesBefore}`);
  rows.push(`lines after: ${outcome.linesAfter}`);
  rows.push(`line endings: ${outcome.endings}`);
  rows.push(`BOM: ${hasBom ? 'yes' : 'no'}`);
  rows.push(`effective values identical: ${outcome.identical ? 'yes' : 'no'} (${outcome.keyCount} keys)`);
  if (!outcome.identical) rows.push(`differing keys: ${outcome.differing.join(', ')}`);
  return rows;
}

function printRows(rows) {
  for (const row of rows) console.log(row);
}

function finishLine(outcome, apply) {
  if (!outcome.ok) return null;
  if (outcome.removed === 0) return 'nothing to do';
  if (!apply) return 'nothing written';
  return null;
}

function decode(buf) {
  const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  const text = (hasBom ? buf.subarray(3) : buf).toString('utf8');
  return { hasBom, text };
}

function encode(hasBom, text) {
  const body = Buffer.from(text, 'utf8');
  return hasBom ? Buffer.concat([BOM, body]) : body;
}

function runFile(apply) {
  let buf;
  try {
    buf = fs.readFileSync(ENV_PATH);
  } catch (error) {
    if (error.code === 'ENOENT') console.error('refusing: server/.env is missing');
    else console.error(`refusing: server/.env could not be read (${error.code || 'error'})`);
    process.exit(1);
  }
  const { hasBom, text } = decode(buf);
  const outcome = transform(text);
  const modeLabel = apply ? 'apply' : 'DRY RUN';
  printRows(formatReport(modeLabel, hasBom, outcome));
  if (!outcome.ok) process.exit(1);
  const closing = finishLine(outcome, apply);
  if (closing) {
    console.log(closing);
    return;
  }
  const expected = encode(hasBom, outcome.text);
  fs.writeFileSync(ENV_PATH, expected);
  const againBuf = fs.readFileSync(ENV_PATH);
  const again = decode(againBuf);
  const checked = transform(again.text);
  const allowDup = ALLOW.some((key) => (checked.occurrences.get(key) || []).length > 1);
  const parsedOk = checked.ok && checked.identical && differingKeys(effectiveParse(text), effectiveParse(again.text)).length === 0;
  if (!againBuf.equals(expected) || allowDup || !parsedOk || checked.removed !== 0) {
    console.error('verify after write: FAILED');
    process.exit(1);
  }
  console.log('verify after write: ok');
}

function fail(n, reason) {
  console.log(`${n} FAIL ${reason}`);
  return false;
}

function pass(n) {
  console.log(`${n} PASS`);
  return true;
}

function parsesMatch(before, after) {
  return differingKeys(effectiveParse(before), effectiveParse(after)).length === 0;
}

function selfTest() {
  let all = true;

  const pair = [
    'SMS_GATEWAY_URL=old-url',
    'SMS_GATEWAY_USER=old-user',
    'SMS_GATEWAY_PASS=old-pass',
    'SMS_GATEWAY_URL=new-url',
    'SMS_GATEWAY_USER=new-user',
    'SMS_GATEWAY_PASS=new-pass',
    'OTHER=keep',
  ].join('\n') + '\n';
  const once = transform(pair);
  const keptLf = 'SMS_GATEWAY_URL=new-url\nSMS_GATEWAY_USER=new-user\nSMS_GATEWAY_PASS=new-pass\nOTHER=keep\n';
  if (!once.ok || once.removed !== 3 || once.text !== keptLf || !parsesMatch(pair, once.text) || once.text.includes('\r')) all = fail(1, 'shape') && all;
  else all = pass(1) && all;

  const cr = (line) => `${line}\r\n`;
  const crlf = ['SMS_GATEWAY_URL=old-url', 'SMS_GATEWAY_USER=old-user', 'SMS_GATEWAY_PASS=old-pass', 'SMS_GATEWAY_URL=new-url', 'SMS_GATEWAY_USER=new-user', 'SMS_GATEWAY_PASS=new-pass', 'OTHER=keep'].map(cr).join('');
  const twice = transform(crlf);
  const keptCr = ['SMS_GATEWAY_URL=new-url', 'SMS_GATEWAY_USER=new-user', 'SMS_GATEWAY_PASS=new-pass', 'OTHER=keep'].map(cr).join('');
  if (!twice.ok || twice.text !== keptCr || twice.endings !== 'CRLF' || !parsesMatch(crlf, twice.text)) all = fail(2, 'endings') && all;
  else all = pass(2) && all;

  const bomText = 'SMS_GATEWAY_URL=old-url\nSMS_GATEWAY_URL=new-url\n';
  const bom = transform(bomText);
  const bomBytes = encode(true, bom.text);
  if (!bom.ok || bom.text !== 'SMS_GATEWAY_URL=new-url\n' || bomBytes[0] !== 0xEF || !parsesMatch(bomText, bom.text)) all = fail(3, 'bom') && all;
  else all = pass(3) && all;

  const noNl = 'SMS_GATEWAY_URL=old-url\nSMS_GATEWAY_URL=new-url';
  const bare = transform(noNl);
  if (!bare.ok || bare.text !== 'SMS_GATEWAY_URL=new-url' || bare.text.endsWith('\n') || !parsesMatch(noNl, bare.text)) all = fail(4, 'newline') && all;
  else all = pass(4) && all;

  const commented = 'SMS_GATEWAY_URL=only-url\n# SMS_GATEWAY_URL=commented-url\n';
  const comments = transform(commented);
  if (!comments.ok || comments.removed !== 0 || (comments.occurrences.get('SMS_GATEWAY_URL') || []).length !== 1 || comments.text !== commented) all = fail(5, 'comment') && all;
  else all = pass(5) && all;

  const spaced = 'SMS_GATEWAY_URL = old-url\nSMS_GATEWAY_URL=new-url\n';
  const spaces = transform(spaced);
  if (!spaces.ok || spaces.removed !== 1 || spaces.text !== 'SMS_GATEWAY_URL=new-url\n' || !parsesMatch(spaced, spaces.text)) all = fail(6, 'spaces') && all;
  else all = pass(6) && all;

  const outside = 'OTHER=alpha-value\nOTHER=beta-value\nSMS_GATEWAY_URL=only-url\n';
  const other = transform(outside);
  const otherReport = formatReport('DRY RUN', false, other).join('\n');
  if (!other.ok || other.removed !== 0 || other.text !== outside || !otherReport.includes('OTHER: 2 occurrences, lines 1, 2, untouched') || otherReport.includes('alpha-value') || otherReport.includes('beta-value')) all = fail(7, 'other') && all;
  else all = pass(7) && all;

  const triple = 'SMS_GATEWAY_URL=old-url\nSMS_GATEWAY_URL=mid-url\nSMS_GATEWAY_URL=new-url\n';
  const three = transform(triple);
  if (!three.ok || three.removed !== 2 || three.text !== 'SMS_GATEWAY_URL=new-url\n' || !(three.occurrences.get('SMS_GATEWAY_URL') || []).every((n, i) => n === i + 1) || !parsesMatch(triple, three.text)) all = fail(8, 'triple') && all;
  else all = pass(8) && all;

  const open = 'SMS_GATEWAY_PASS="no-close\nSMS_GATEWAY_PASS=ok-pass\n';
  const refused = transform(open);
  if (refused.ok || refused.reason !== 'unclosed' || refused.text != null) all = fail(9, 'quote') && all;
  else all = pass(9) && all;

  const clean = 'SMS_GATEWAY_URL=only-url\nSMS_GATEWAY_USER=only-user\nSMS_GATEWAY_PASS=only-pass\n';
  const idle = transform(clean);
  const idleReport = formatReport('DRY RUN', false, idle).join('\n');
  if (!idle.ok || idle.removed !== 0 || idle.text !== clean || finishLine(idle, false) !== 'nothing to do' || !idleReport.includes('effective values identical: yes')) all = fail(10, 'clean') && all;
  else all = pass(10) && all;

  const again = transform(once.text);
  if (!again.ok || again.text !== once.text || again.removed !== 0 || !parsesMatch(pair, again.text) || !parsesMatch(once.text, again.text)) all = fail(11, 'twice') && all;
  else all = pass(11) && all;

  process.exit(all ? 0 : 1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) usage();
  if (args.length === 1 && args[0] === '--self-test') {
    selfTest();
    return;
  }
  if (args.length === 1 && args[0] !== '--apply') usage();
  runFile(args.length === 1);
}

if (require.main === module) main();

module.exports = { transform, formatReport, encode, ENV_PATH, ALLOW };
