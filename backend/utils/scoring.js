/**
 * Theory-round scoring engine — Jaccard similarity + TF-IDF cosine similarity.
 * Plain, dependency-free implementation. Called as:
 *   scoreTheoryAnswer(answerText, idealConcepts) -> { score, jaccardScore, tfidfScore, matchedConcepts, missingConcepts }
 */

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "of", "in", "on", "at", "to", "for", "and", "or", "but", "so", "if",
  "it", "its", "this", "that", "these", "those", "as", "by", "with",
  "from", "into", "than", "then", "there", "here", "we", "you", "they",
  "i", "he", "she", "them", "his", "her", "their", "our", "your", "my",
  "no", "do", "does", "did", "can", "could", "will", "would",
  "should", "has", "have", "had", "also", "which", "when", "where", "how",
]);

const NEGATION_WORDS = new Set([
  "not", "never", "no", "none", "without", "cannot", "cant", "won't", "wont",
  "isn't", "isnt", "aren't", "arent", "doesn't", "doesnt", "didn't", "didnt",
  "wasn't", "wasnt", "weren't", "werent", "instead", "rather", "false", "incorrect",
  "wrong", "opposite", "contradict", "contradiction",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function stem(word) {
  return word.replace(/(ing|tion|ed|es|s)$/i, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNegatedContext(answerText, concept) {
  const normalized = (answerText || "").toLowerCase();
  const conceptTerms = tokenize(concept).map(stem).filter(Boolean).map(escapeRegExp);
  if (!conceptTerms.length) return false;

  const negationPattern = "(?:not|never|no|without|cannot|cant|won't|wont|isn't|isnt|aren't|arent|doesn't|doesnt|didn't|didnt|wasn't|wasnt|weren't|werent|instead|rather|false|incorrect|wrong|opposite|contradict|contradiction)";

  const patterns = [
    new RegExp(`${negationPattern}\\s+(?:\\w+\\s+){0,6}(?:${conceptTerms.join("|")})`, "i"),
    new RegExp(`(?:${conceptTerms.join("|")})\\s+(?:\\w+\\s+){0,6}${negationPattern}`, "i"),
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function jaccardSimilarity(answerTokens, conceptTokens) {
  const a = new Set(answerTokens);
  const b = new Set(conceptTokens);
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function tfidfCosineSimilarity(answerTokens, conceptTokens) {
  const vocab = Array.from(new Set([...answerTokens, ...conceptTokens]));
  if (vocab.length === 0) return 0;
  const docs = [answerTokens, conceptTokens];

  function termFreq(doc, term) {
    const count = doc.filter((t) => t === term).length;
    return doc.length ? count / doc.length : 0;
  }
  function idf(term) {
    const docsWithTerm = docs.filter((d) => d.includes(term)).length;
    return Math.log((1 + docs.length) / (1 + docsWithTerm)) + 1;
  }
  function vector(doc) {
    return vocab.map((term) => termFreq(doc, term) * idf(term));
  }

  const v1 = vector(answerTokens);
  const v2 = vector(conceptTokens);
  const dot = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
  const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
  if (mag1 === 0 || mag2 === 0) return 0;
  return dot / (mag1 * mag2);
}

function matchConcepts(answerText, idealConcepts) {
  const answerWords = tokenize(answerText);
  const answerStems = answerWords.map(stem);
  const matched = [];
  const missing = [];

  idealConcepts.forEach((concept) => {
    const conceptWords = tokenize(concept);
    if (!conceptWords.length) {
      missing.push(concept);
      return;
    }

    const hit = conceptWords.some((w) => {
      const s = stem(w);
      return answerWords.includes(w)
        || answerStems.includes(s)
        || answerStems.some((as) => as.length > 3 && (as.includes(s) || s.includes(as)));
    });

    if (hit && !hasNegatedContext(answerText, concept)) {
      matched.push(concept);
    } else {
      missing.push(concept);
    }
  });

  return { matched, missing };
}

function scoreTheoryAnswer(answerText, idealConcepts, evaluation = {}) {
  const rubric = Array.isArray(evaluation.markingRubric) ? evaluation.markingRubric.filter(Boolean) : [];
  const normalizedIdealConcepts = rubric.length
    ? rubric
    : (Array.isArray(idealConcepts) ? idealConcepts.filter(Boolean) : []);
  const answerTokens = tokenize(answerText);
  const conceptTokens = normalizedIdealConcepts.flatMap((c) => tokenize(c));

  const jaccardScore = jaccardSimilarity(answerTokens, conceptTokens);
  const tfidfScore = tfidfCosineSimilarity(answerTokens, conceptTokens);
  const referenceTokens = tokenize(evaluation.referenceAnswer || "");
  const questionTokens = tokenize(evaluation.questionText || "");
  const referenceScore = referenceTokens.length
    ? tfidfCosineSimilarity(answerTokens, referenceTokens) * 0.85
      + (questionTokens.length ? tfidfCosineSimilarity(answerTokens, questionTokens) * 0.15 : 0)
    : null;
  const { matched, missing } = matchConcepts(answerText, normalizedIdealConcepts);

  const coverage = normalizedIdealConcepts.length ? matched.length / normalizedIdealConcepts.length : 0;
  const contradictionPenalty = normalizedIdealConcepts.length
    ? Math.max(0, normalizedIdealConcepts.length - matched.length) / normalizedIdealConcepts.length
    : 0;
  const meaningfulness = answerTokens.length > 0 ? Math.min(1, answerTokens.length / 25) : 0;

  let blended = referenceScore == null
    ? jaccardScore * 0.25 + tfidfScore * 0.25 + coverage * 0.4 + meaningfulness * 0.1
    : jaccardScore * 0.2 + tfidfScore * 0.2 + referenceScore * 0.2 + coverage * 0.3 + meaningfulness * 0.1;

  if (answerTokens.length === 0) {
    blended = 0;
  } else if (coverage === 0) {
    blended *= 0.2;
  }

  if (contradictionPenalty > 0) {
    blended *= 1 - Math.min(0.75, contradictionPenalty * 0.75);
  }

  if (coverage >= 0.8 && contradictionPenalty === 0) {
    blended = Math.max(blended, 0.74);
  }

  const score = Math.max(0, Math.min(100, Math.round(Math.min(blended, 1) * 100)));
  const maxMarks = Number.isFinite(evaluation.maxMarks) && evaluation.maxMarks > 0
    ? evaluation.maxMarks
    : normalizedIdealConcepts.length * 10;
  const marksAwarded = Number(((score / 100) * maxMarks).toFixed(2));

  let status = "incorrect";
  let feedback = "The answer is not aligned with the expected concepts.";

  if (answerTokens.length === 0) {
    status = "empty";
    feedback = "No answer was provided.";
  } else if (score >= 65 && coverage >= 0.75 && contradictionPenalty === 0) {
    status = "correct";
    feedback = "The explanation is accurate and covers the expected concepts.";
  } else if (score >= 25) {
    status = "partial";
    feedback = "The answer shows partial understanding but is missing or weakening some key points.";
  }

  return {
    score,
    maxMarks,
    marksAwarded,
    status,
    feedback,
    jaccardScore: Number(jaccardScore.toFixed(2)),
    tfidfScore: Number(tfidfScore.toFixed(2)),
    referenceScore: referenceScore == null ? null : Number(referenceScore.toFixed(2)),
    matchedConcepts: matched,
    missingConcepts: missing,
  };
}

// Reused for the code-similarity check: plain Jaccard over tokenized source code
function codeSimilarity(codeA, codeB) {
  const tokensA = new Set((codeA || "").toLowerCase().match(/[a-z0-9_]+/g) || []);
  const tokensB = new Set((codeB || "").toLowerCase().match(/[a-z0-9_]+/g) || []);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return Number((intersection.size / union.size).toFixed(2));
}

module.exports = { scoreTheoryAnswer, tokenize, codeSimilarity };
