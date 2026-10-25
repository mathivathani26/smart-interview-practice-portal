function normalizeTag(value) {
  if (typeof value !== "string") return "";
  let tag = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (tag.length > 4 && /(?:sses|shes|ches|xes|zes)$/.test(tag)) {
    tag = tag.slice(0, -2);
  } else if (tag.length > 3 && /ies$/.test(tag)) {
    tag = `${tag.slice(0, -3)}y`;
  } else if (tag.length > 3 && /s$/.test(tag) && !/(?:ss|us|is)$/.test(tag)) {
    tag = tag.slice(0, -1);
  }
  return tag;
}

function normalizeTags(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeTag).filter(Boolean))];
}

function tagsMatchAny(questionTags, requestedTags) {
  const requested = new Set(normalizeTags(requestedTags));
  return requested.size === 0 || normalizeTags(questionTags).some((tag) => requested.has(tag));
}

module.exports = { normalizeTag, normalizeTags, tagsMatchAny };
