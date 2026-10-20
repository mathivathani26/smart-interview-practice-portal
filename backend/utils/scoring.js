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
  "not", "no", "do", "does", "did", "can", "could", "will", "would",
  "should", "has", "have", "had", "also", "which", "when", "where", "how",
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
    const hit = conceptWords.some((w) => {
      const s = stem(w);
      return answerWords.includes(w) || answerStems.includes(s) || answerStems.some((as) => as.length > 3 && (as.includes(s) || s.includes(as)));
    });
    if (hit) matched.push(concept);
    else missing.push(concept);
  });

  return { matched, missing };
}

function scoreTheoryAnswer(answerText, idealConcepts) {
  const answerTokens = tokenize(answerText);
  const conceptTokens = idealConcepts.flatMap((c) => tokenize(c));

  const jaccardScore = jaccardSimilarity(answerTokens, conceptTokens);
  const tfidfScore = tfidfCosineSimilarity(answerTokens, conceptTokens);
  const { matched, missing } = matchConcepts(answerText, idealConcepts);

  const coverage = idealConcepts.length ? matched.length / idealConcepts.length : 0;
  const blended = jaccardScore * 0.35 + tfidfScore * 0.35 + coverage * 0.3;
  const score = Math.round(Math.min(blended, 1) * 100);

  return {
    score,
    jaccardScore: Number(jaccardScore.toFixed(2)),
    tfidfScore: Number(tfidfScore.toFixed(2)),
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
