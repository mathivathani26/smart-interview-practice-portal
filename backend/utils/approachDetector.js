/**
 * Approach-tag feedback for the coding round.
 *
 * This is a lightweight, keyword/pattern heuristic — NOT full static
 * analysis or an AST parser. It looks for surface-level signals in the
 * submitted source code that suggest a particular technique was used,
 * and compares that against the technique tags the question was authored
 * with (CodingQuestion.tags, e.g. "hash map", "dynamic programming").
 *
 * Being explicit about "heuristic" here matters: it's a reasonable signal
 * for feedback purposes, not a claim of understanding the code's logic.
 */

const TAG_DETECTORS = {
  "hash map": (code) => /\b(dict\(|unordered_map|HashMap|Map\(|\{\}\s*;?\s*$|seen\s*=\s*\{|seen\[)/im.test(code) || /\bdict\b/i.test(code),
  "arrays": (code) => /\[\s*\]|\bnums\[|\barr\[|List<|vector</i.test(code),
  "linked list": (code) => /\bnode\b|\.next\b|->next\b/i.test(code),
  "dynamic programming": (code) => /\bdp\[|\bmemo\b|@lru_cache|\btabulation\b|\bdp\s*=\s*\[/i.test(code),
  "two pointer": (code) => /\bleft\b[\s\S]{0,80}\bright\b|\blo\b[\s\S]{0,40}\bhi\b/i.test(code),
  "recursion": (code, fnName) => fnName && new RegExp(`\\b${fnName}\\s*\\(`, "g").test(code.replace(/def\s+\w+|function\s+\w+/g, "")),
  "sorting": (code) => /\.sort\(|sorted\(|Arrays\.sort|Collections\.sort/i.test(code),
  "greedy": (code) => /\bgreedy\b/i.test(code), // rarely self-labeled, kept for completeness
};

function extractFunctionName(code) {
  const pyMatch = code.match(/def\s+(\w+)\s*\(/);
  if (pyMatch) return pyMatch[1];
  const jsMatch = code.match(/function\s+(\w+)\s*\(/);
  if (jsMatch) return jsMatch[1];
  return null;
}

function detectApproachTags(code, idealTags) {
  if (!code || !idealTags || idealTags.length === 0) {
    return { matched: [], missing: idealTags || [] };
  }

  const fnName = extractFunctionName(code);
  const matched = [];
  const missing = [];

  idealTags.forEach((tag) => {
    const key = tag.toLowerCase().trim();
    const detector = TAG_DETECTORS[key];
    const hit = detector ? detector(code, fnName) : false;
    if (hit) matched.push(tag);
    else missing.push(tag);
  });

  return { matched, missing };
}

module.exports = { detectApproachTags };
