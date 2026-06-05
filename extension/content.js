(() => {
if (globalThis.__EEH_CONTENT_LOADED__) {
  return;
}
globalThis.__EEH_CONTENT_LOADED__ = true;

const RELATION_TERMS = [
  "related",
  "relationship",
  "associated",
  "association",
  "correlated",
  "correlation",
  "linked",
  "increased",
  "decreased",
  "higher",
  "lower",
  "more",
  "less",
  "greater",
  "reduced",
  "effect",
  "effects",
  "influence",
  "influenced",
  "impact",
  "impacts",
  "predict",
  "predicts",
  "driven",
  "caused",
  "mediated",
  "varied",
  "varies",
  "compared",
  "whereas"
];

const EVIDENCE_PATTERNS = [
  { type: "care guidance", terms: ["care", "guide", "should", "must", "require", "provide", "avoid", "housing", "bedding", "feeding", "veterinary"] },
  { type: "relationship", terms: ["related", "relationship", "associated", "association", "correlated", "linked"] },
  { type: "increase/decrease", terms: ["increased", "decreased", "higher", "lower", "more", "less", "greater", "reduced"] },
  { type: "food evidence", terms: ["eat", "eats", "eaten", "ate", "feed", "feeding", "fed on", "foraging", "consume", "consumed", "diet consists", "prey", "stomach contents", "algae", "shrimp", "crustaceans", "insects", "fish", "seeds", "fruit", "nectar"] },
  { type: "effect", terms: ["effect", "effects", "influence", "impact", "predict", "caused", "driven"] },
  { type: "comparison", terms: ["compared", "whereas", "than", "between"] },
  { type: "candidate evidence", terms: [] }
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EEH_SUGGEST") {
    sendResponse({
      ok: true,
      suggestion: suggestSettingsFromPage(),
      title: document.title,
      url: location.href,
      isPdfLike: location.href.toLowerCase().includes(".pdf"),
      pdfLinks: findPdfLinks()
    });
    return true;
  }

  if (message?.type === "EEH_SCAN") {
    const results = scanPage(message.settings || {});
    sendResponse({
      ok: true,
      results,
      title: document.title,
      url: location.href,
      isPdfLike: location.href.toLowerCase().includes(".pdf"),
      pdfLinks: findPdfLinks()
    });
    return true;
  }

  if (message?.type === "EEH_CLEAR") {
    clearHighlights();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "EEH_FOCUS") {
    const found = focusHighlight(message.id, message.sentence);
    sendResponse({ ok: true, found });
    return true;
  }
});

function scanPage(settings) {
  clearHighlights();

  const intent = inferIntent(settings);
  const conceptTerms = normalizeTerms([
    settings.conceptOne,
    settings.conceptTwo
  ]);
  const questionTerms = termsFromText(settings.question || "");
  const extraTerms = normalizeTerms((settings.extraTerms || "").split(/[,;\n]/));
  const allTerms = [...new Set([...conceptTerms, ...questionTerms, ...extraTerms])];

  const blocks = getReadableBlocks();
  const candidates = [];

  blocks.forEach((block, blockIndex) => {
    const text = normalizeSpaces(block.innerText || "");
    if (!text || text.length < 35) return;
    const context = getTargetContext(settings, text);
    const isReference = isReferenceBlock(block, text);

    splitSentences(text).forEach((sentence) => {
      const scored = scoreSentence(sentence, conceptTerms, allTerms, intent, context);
      if (scored.score < intent.threshold) return;
      const answerTerms = extractAnswerTerms(sentence, intent);

      const id = `eeh-${blockIndex}-${candidates.length}`;
      candidates.push({
        id,
        sentence,
        answerTerms,
        summary: summarizeSentence(sentence, settings, intent),
        concepts: conceptLabel(settings, scored.matches),
        evidenceType: isReference ? "reference" : inferEvidenceType(sentence),
        confidence: isReference ? "reference" : confidenceFromScore(scored.score, intent, scored.directness),
        score: scored.score,
        order: candidates.length,
        matchedTerms: scored.matches,
        pageTitle: document.title,
        url: location.href
      });
    });
  });

  const deduped = dedupeCandidates(candidates).slice(0, 80);
  deduped.forEach((candidate) => {
    const block = blocks.find((item) => normalizeSpaces(item.innerText || "").includes(candidate.sentence));
    if (block) highlightSentence(block, candidate);
  });

  return deduped;
}

function isReferenceBlock(block, text) {
  if (block.closest?.("[id*='ref' i], [class*='ref' i], [id*='bibliography' i], [class*='bibliography' i], [id*='citation' i], [class*='citation' i]")) {
    return true;
  }
  if (/^(references|bibliography|literature cited|works cited)\b/i.test(text)) return true;
  const citationLike = /\(\d{4}\)|\bdoi\b|https?:\/\/|[A-Z][A-Za-z-]+,\s+[A-Z]\./g;
  const matches = text.match(citationLike) || [];
  return matches.length >= 3 && text.length < 1200;
}

function getReadableBlocks() {
  const selector = [
    "p",
    "li",
    "td",
    "blockquote",
    ".gs_rs",
    ".gs_a",
    ".abstract",
    ".article p",
    ".article",
    ".body p",
    ".content p"
  ].join(",");

  return [...document.querySelectorAll(selector)]
    .filter((el) => isVisible(el))
    .filter((el) => {
      const text = normalizeSpaces(el.innerText || "");
      return text.length >= 35 && text.length <= 1200;
    })
    .filter((el) => {
      const childText = [...el.querySelectorAll(selector)]
        .filter((child) => child !== el)
        .map((child) => normalizeSpaces(child.innerText || ""))
        .join(" ");
      const ownText = normalizeSpaces(el.innerText || "");
      return !childText || childText.length < ownText.length * 0.75;
    });
}

function scoreSentence(sentence, conceptTerms, allTerms, intent = inferIntent({}), context = {}) {
  const lower = sentence.toLowerCase();
  const matches = [];
  let score = 0;

  const conceptMatches = conceptTerms.filter((term) => includesTerm(lower, term));
  if (conceptMatches.length === 1) score += 3;
  if (conceptMatches.length >= 2) score += 8;
  matches.push(...conceptMatches);

  for (const term of allTerms) {
    if (!conceptMatches.includes(term) && includesTerm(lower, term)) {
      score += term.length > 8 ? 2 : 1;
      matches.push(term);
    }
  }

  const relationMatches = RELATION_TERMS.filter((term) => includesTerm(lower, term));
  if (relationMatches.length) {
    score += Math.min(4, relationMatches.length + 1);
    matches.push(...relationMatches.slice(0, 3));
  }

  if (conceptTerms.length >= 2 && conceptMatches.length < 2 && relationMatches.length === 0) {
    score -= 2;
  }

  if (intent.kind === "food") {
    const foodEvidence = classifyFoodEvidence(sentence, context);
    if (foodEvidence.directness === "direct") {
      score += 12;
      matches.push(...foodEvidence.matches.slice(0, 4));
    } else if (foodEvidence.directness === "method") {
      score += 2;
      matches.push(...foodEvidence.matches.slice(0, 3));
    } else if (foodEvidence.directness === "behavior") {
      score -= 1;
      matches.push(...foodEvidence.matches.slice(0, 2));
    } else {
      score -= 6;
    }

    if (foodEvidence.offTopic) score -= 18;
    return { score, matches: [...new Set(matches)].slice(0, 10), directness: foodEvidence.directness };
  }

  if (intent.kind === "guide") {
    const guideEvidence = classifyGuideEvidence(sentence);
    if (guideEvidence.directness === "direct") {
      score += 10;
      matches.push(...guideEvidence.matches.slice(0, 5));
    } else if (guideEvidence.directness === "topic") {
      score += 4;
      matches.push(...guideEvidence.matches.slice(0, 4));
    } else {
      score -= 4;
    }
    return { score, matches: [...new Set(matches)].slice(0, 10), directness: guideEvidence.directness };
  }

  return { score, matches: [...new Set(matches)].slice(0, 10), directness: "general" };
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 800);
}

function summarizeSentence(sentence, settings, intent = inferIntent(settings)) {
  const trimmed = sentence.replace(/\s+/g, " ").trim();
  const conceptOne = settings.conceptOne?.trim();
  const conceptTwo = settings.conceptTwo?.trim();

  if (intent.kind === "food" && conceptOne) {
    const food = inferFoodAnswer(trimmed);
    return food ? `${conceptOne} may eat ${food}.` : compressSentence(trimmed);
  }

  if (intent.kind === "guide") {
    const topic = extractGuideTopic(trimmed);
    return topic ? `Key care point: ${topic}.` : compressSentence(trimmed);
  }

  if (conceptOne && conceptTwo) {
    const direction = inferDirection(trimmed);
    return `${conceptOne} ${direction} ${conceptTwo}.`;
  }

  if (settings.question?.trim()) {
    return compressSentence(trimmed);
  }

  return compressSentence(trimmed);
}

const FOOD_EVIDENCE_TERMS = [
  "eat",
  "eats",
  "eaten",
  "ate",
  "feed",
  "feeds",
  "feeding",
  "fed on",
  "forage",
  "forages",
  "foraging",
  "consume",
  "consumes",
  "consumed",
  "diet consists",
  "diet included",
  "prey",
  "stomach contents",
  "crop contents",
  "algae",
  "brine shrimp",
  "plankton",
  "shrimp",
  "crustaceans",
  "insects",
  "fish",
  "seeds",
  "fruit",
  "nectar"
];

function inferIntent(settings) {
  const text = `${settings.question || ""} ${settings.conceptTwo || ""} ${settings.extraTerms || ""}`.toLowerCase();
  if (/\b(what|which).*\b(eat|eats|food|diet|feed|prey)\b/.test(text) || /\b(food|diet|prey|feeding)\b/.test(text)) {
    return { kind: "food", threshold: 5 };
  }
  if (/\b(care|guide|husbandry|handling|housing|bedding|cage|enrichment|veterinary|health|cleaning)\b/.test(text)) {
    return { kind: "guide", threshold: 6 };
  }
  return { kind: "relationship", threshold: 3 };
}

function inferFoodAnswer(sentence) {
  const patterns = [
    /\b(?:eat|eats|eaten|ate|feed(?:s|ing)? on|fed on|forage(?:s|d)? on|consume[sd]?)\s+([^.;:,()]{3,90})/i,
    /\bdiet (?:consists of|included|includes|was composed of)\s+([^.;:,()]{3,90})/i,
    /\b(?:prey|food items?) (?:included|include|were|was)\s+([^.;:,()]{3,90})/i
  ];

  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (match?.[1]) return cleanAnswer(match[1]);
  }

  const foods = sentence.match(/\b(algae|brine shrimp|shrimp|crustaceans?|insects?|fish|mollusks?|seeds?|fruits?|nectar|plants?)\b/gi);
  return foods ? [...new Set(foods.map((item) => item.toLowerCase()))].slice(0, 4).join(", ") : "";
}

function extractAnswerTerms(sentence, intent = inferIntent({})) {
  if (intent.kind === "food") {
    const foods = sentence.match(/\b(algae|diatoms?|cyanobacteria|brine shrimp|shrimp|crustaceans?|copepods?|mollusks?|insects?|larvae|fish|seeds?|fruits?|nectar|plants?|plankton)\b/gi) || [];
    if (foods.length) return [...new Set(foods.map((item) => item.toLowerCase()))].slice(0, 8);

    const object = sentence.match(/\b(?:eat|eats|eaten|ate|feed(?:s|ing)? on|fed on|forage(?:s|d)? on|consume[sd]?|diet (?:consists of|included|includes|was composed of))\s+([^.;:,()]{3,90})/i);
    if (object?.[1]) return splitAnswerPhrase(object[1]);

    if (/\bfilter feeding|filter-feeding\b/i.test(sentence)) return ["filter feeding"];
    return [];
  }

  if (intent.kind === "guide") {
    const terms = sentence.match(/\b(housing|cage|enclosure|bedding|substrate|nesting|food|feeding|water|diet|handling|social|solitary|exercise|wheel|enrichment|cleaning|hygiene|temperature|humidity|veterinary|illness|disease|stress|avoid|provide|required|should|must)\b/gi) || [];
    return [...new Set(terms.map((term) => term.toLowerCase()))].slice(0, 8);
  }

  const relation = sentence.match(/\b(?:related to|associated with|correlated with|increased|decreased|higher|lower|greater|reduced|influenced|affected|predicted)\s+([^.;:,()]{3,90})/i);
  return relation?.[1] ? splitAnswerPhrase(relation[1]) : [];
}

function classifyGuideEvidence(sentence) {
  const careTopics = sentence.match(/\b(housing|cage|enclosure|bedding|substrate|nesting|food|feeding|water|diet|handling|social|solitary|exercise|wheel|enrichment|cleaning|hygiene|temperature|humidity|veterinary|illness|disease|stress)\b/gi) || [];
  const actionWords = sentence.match(/\b(should|must|require[sd]?|need[sd]?|provide[sd]?|avoid(?:ed)?|keep|kept|clean(?:ed)?|monitor(?:ed)?|recommend(?:ed)?|suitable|appropriate|essential|important|safe|unsafe)\b/gi) || [];
  const genericOnly = /\b(book|chapter|website|guide|handbook|study|analysis|review)\b/i.test(sentence) && !careTopics.length;

  if (genericOnly) return { directness: "none", matches: [] };
  if (careTopics.length && actionWords.length) {
    return {
      directness: "direct",
      matches: [...new Set([...careTopics, ...actionWords].map((item) => item.toLowerCase()))]
    };
  }
  if (careTopics.length) {
    return {
      directness: "topic",
      matches: [...new Set(careTopics.map((item) => item.toLowerCase()))]
    };
  }
  return { directness: "none", matches: [] };
}

function extractGuideTopic(sentence) {
  const match = sentence.match(/\b(?:should|must|require[sd]?|need[sd]?|provide[sd]?|avoid(?:ed)?|keep|kept|recommend(?:ed)?)\s+([^.;:,]{4,110})/i);
  if (match?.[1]) return cleanAnswer(match[1]);
  const terms = sentence.match(/\b(housing|cage|enclosure|bedding|food|feeding|water|handling|exercise|enrichment|cleaning|temperature|veterinary|illness|stress)\b/gi);
  return terms ? [...new Set(terms.map((term) => term.toLowerCase()))].slice(0, 4).join(", ") : "";
}

function splitAnswerPhrase(value) {
  return value
    .replace(/\b(?:and|or|the|a|an|of|from|their|its|such as|including)\b/gi, ",")
    .split(/[,;/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && part.length < 45)
    .slice(0, 8);
}

function classifyFoodEvidence(sentence, context = {}) {
  const specificFoods = sentence.match(/\b(algae|diatoms?|cyanobacteria|brine shrimp|shrimp|crustaceans?|copepods?|mollusks?|insects?|larvae|fish|seeds?|fruits?|nectar|plants?)\b/gi) || [];
  const directDietPhrase = /\b(diet (?:consists of|included|includes|was composed of)|prey (?:included|include|were|was)|food items? (?:included|include|were|was)|stomach contents? (?:contained|included))\b/i.test(sentence);
  const directEatingObject = /\b(eat|eats|eaten|ate|consume[sd]?|fed on|feed(?:s|ing)? on|forage(?:s|d)? on)\s+([^.;:,()]{3,90})/i.test(sentence);
  const methodOnly = /\bfilter feeding|filter-feeding|filter feeders?|filter-feeders?\b/i.test(sentence);
  const behaviorOnly = /\b(feed(?:ing|s)?|forag(?:e|es|ed|ing))\b/i.test(sentence);
  const habitatOrAbundanceOnly = /\b(habitat|habitats|wetland|wetlands|mudflat|mudflats|water depth|agricultural fields?|paddy fields?|abundance|density|distribution|spatial|disturbance|food resources?)\b/i.test(sentence);
  const colorOnly = /\b(color|colour|plumage|pigment|carotenoid|pink|red|orange|ornament|feather)\b/i.test(sentence);

  if (specificFoods.length && (directDietPhrase || directEatingObject || /\b(prey|food items?|stomach contents?|diet)\b/i.test(sentence))) {
    return {
      directness: "direct",
      matches: [...new Set([...specificFoods.map((item) => item.toLowerCase()), "direct food item"])],
      offTopic: targetMismatch(sentence, context)
    };
  }

  if (specificFoods.length && !colorOnly && !habitatOrAbundanceOnly) {
    return {
      directness: "direct",
      matches: [...new Set(specificFoods.map((item) => item.toLowerCase()))],
      offTopic: targetMismatch(sentence, context)
    };
  }

  if (methodOnly) {
    return { directness: "method", matches: ["filter feeding"], offTopic: false };
  }

  if (behaviorOnly) {
    return {
      directness: "behavior",
      matches: ["feeding/foraging behavior"],
      offTopic: habitatOrAbundanceOnly || colorOnly
    };
  }

  return { directness: "none", matches: [], offTopic: habitatOrAbundanceOnly || colorOnly || targetMismatch(sentence, context) };
}

function getTargetContext(settings, blockText = "") {
  const aliases = targetAliases(settings.conceptOne || "");
  return {
    aliases,
    blockHasTarget: aliases.some((alias) => includesTerm(blockText.toLowerCase(), alias))
  };
}

function targetMismatch(sentence, context = {}) {
  if (!context.aliases?.length) return false;
  const lower = sentence.toLowerCase();
  if (context.aliases.some((alias) => includesTerm(lower, alias))) return false;
  if (context.blockHasTarget && !mentionsOtherLikelyBird(lower, context.aliases)) return false;
  return true;
}

function targetAliases(rawTarget) {
  const target = rawTarget.toLowerCase().trim();
  if (!target) return [];
  const aliases = new Set([target]);
  target.split(/\s+/).filter((word) => word.length > 3).forEach((word) => {
    aliases.add(word.endsWith("s") ? word.slice(0, -1) : word);
  });

  const known = {
    "black phoebe": ["black phoebe", "phoebe", "sayornis nigricans"],
    "pink flamingo": ["pink flamingo", "flamingo", "flamingos"],
    "pink flamingos": ["pink flamingo", "flamingo", "flamingos"],
    "greater flamingo": ["greater flamingo", "flamingo", "flamingos", "phoenicopterus roseus"]
  };
  (known[target] || []).forEach((alias) => aliases.add(alias));
  return [...aliases];
}

function mentionsOtherLikelyBird(lowerSentence, targetAliasesList) {
  const birdWords = [
    "flamingo", "flamingos", "phoebe", "phoebes", "gull", "gulls", "seagull", "seagulls",
    "robin", "robins", "duck", "ducks", "goose", "geese", "warbler", "warblers",
    "sparrow", "sparrows", "heron", "herons", "egret", "egrets", "ibis", "ibises",
    "shorebird", "shorebirds", "sandpiper", "sandpipers", "tern", "terns"
  ];
  return birdWords.some((bird) => lowerSentence.includes(bird) && !targetAliasesList.some((alias) => includesTerm(lowerSentence, alias)));
}

function cleanAnswer(value) {
  return value
    .replace(/\b(?:and|or|the|a|an|of|from|their|its)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferDirection(sentence) {
  if (/\b(higher|greater|more|increased|increase|positive|positively)\b/i.test(sentence)) {
    return "may increase or be positively related to";
  }
  if (/\b(lower|less|decreased|decrease|reduced|negative|negatively)\b/i.test(sentence)) {
    return "may decrease or be negatively related to";
  }
  if (/\b(no|not|neither|unrelated|not associated|no association|no relationship)\b/i.test(sentence)) {
    return "may not be clearly related to";
  }
  return "may be related to";
}

function compressSentence(sentence) {
  const clean = sentence.replace(/\([^)]{35,}\)/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 150) return clean;
  return `${clean.slice(0, 147).replace(/\s+\S*$/, "")}...`;
}

function inferEvidenceType(sentence) {
  const lower = sentence.toLowerCase();
  for (const pattern of EVIDENCE_PATTERNS) {
    if (pattern.terms.some((term) => includesTerm(lower, term))) return pattern.type;
  }
  return "candidate evidence";
}

function conceptLabel(settings, matches) {
  const concepts = [settings.conceptOne, settings.conceptTwo]
    .map((item) => item?.trim())
    .filter(Boolean);
  return concepts.length ? concepts.join(" + ") : matches.slice(0, 4).join(" + ");
}

function highlightSentence(block, candidate) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, textarea, input, .eeh-highlight")) {
        return NodeFilter.FILTER_REJECT;
      }
      return normalizeSpaces(node.nodeValue || "").length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.nodeValue || "";
    const compactCandidate = compactForSearch(candidate.sentence);
    const compactNode = compactForSearch(text);
    const compactIndex = compactNode.indexOf(compactCandidate);

    if (compactIndex === -1) continue;

    const index = approximateOriginalIndex(text, compactNode, compactIndex);
    const length = Math.min(text.length - index, candidate.sentence.length);
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + length);

    const mark = document.createElement("mark");
    mark.className = "eeh-highlight";
    mark.dataset.eehId = candidate.id;
    mark.dataset.confidence = candidate.confidence;
    range.surroundContents(mark);
    emphasizeAnswerTerms(mark, candidate.answerTerms || []);
    return;
  }

  return false;
}

function clearHighlights() {
  document.querySelectorAll(".eeh-answer").forEach((span) => {
    span.replaceWith(document.createTextNode(span.textContent || ""));
  });
  document.querySelectorAll("mark.eeh-highlight").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
  });
  document.querySelectorAll(".eeh-highlight").forEach((el) => {
    el.classList.remove("eeh-highlight", "eeh-active");
    delete el.dataset.eehId;
    delete el.dataset.confidence;
  });
}

function focusHighlight(id, sentence = "") {
  document.querySelectorAll(".eeh-active").forEach((el) => el.classList.remove("eeh-active"));
  let el = document.querySelector(`[data-eeh-id="${CSS.escape(id)}"]`);
  if (!el && sentence) {
    el = findElementContainingSentence(sentence);
  }
  if (!el) return false;
  el.classList.add("eeh-active");
  el.classList.remove("eeh-pulse");
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  window.setTimeout(() => {
    el.classList.add("eeh-pulse");
    window.setTimeout(() => el.classList.remove("eeh-pulse"), 1800);
  }, 350);
  return true;
}

function findElementContainingSentence(sentence) {
  const target = normalizeSpaces(sentence);
  if (!target) return null;
  const blocks = getReadableBlocks();
  return blocks.find((block) => normalizeSpaces(block.innerText || "").includes(target)) || null;
}

function emphasizeAnswerTerms(container, terms) {
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length > 2))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
  if (!uniqueTerms.length) return;

  uniqueTerms.forEach((term) => wrapTerm(container, term));
}

function wrapTerm(container, term) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest(".eeh-answer")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue?.toLowerCase().includes(term.toLowerCase()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  const node = walker.nextNode();
  if (!node) return;

  const text = node.nodeValue || "";
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return;

  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + term.length);
  const span = document.createElement("span");
  span.className = "eeh-answer";
  range.surroundContents(span);
}

function confidenceFromScore(score, intent = inferIntent({}), directness = "general") {
  if (intent.kind === "food") {
    if (directness === "direct" && score >= 14) return "high";
    if (directness === "direct" && score >= 9) return "medium";
    if (directness === "method") return "medium";
    return "low";
  }
  if (intent.kind === "guide") {
    if (directness === "direct" && score >= 12) return "high";
    if (directness === "direct" || directness === "topic") return "medium";
    return "low";
  }
  if (score >= 10) return "high";
  if (score >= 6) return "medium";
  return "low";
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.sentence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function termsFromText(text) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "against",
    "also",
    "and",
    "are",
    "because",
    "been",
    "between",
    "does",
    "for",
    "from",
    "has",
    "have",
    "how",
    "into",
    "its",
    "that",
    "the",
    "their",
    "then",
    "there",
    "this",
    "with",
    "what",
    "when",
    "where",
    "whether",
    "which",
    "why"
  ]);

  return normalizeTerms(text.split(/[^A-Za-z0-9-]+/).filter((word) => {
    return word.length > 2 && !stopWords.has(word.toLowerCase());
  }));
}

function suggestSettingsFromPage() {
  const queryInfo = getSearchQuery();
  if (!queryInfo.query) {
    return { question: "", conceptOne: "", conceptTwo: "", extraTerms: "", source: "none" };
  }

  const concepts = inferConceptsFromQuery(queryInfo.query);
  return {
    question: queryInfo.query,
    conceptOne: concepts[0] || "",
    conceptTwo: concepts[1] || "",
    extraTerms: concepts.slice(2, 6).join(", "),
    source: queryInfo.source
  };
}

function getSearchQuery() {
  const searchInput = document.querySelector("input[name='q'], input[type='search'], textarea[name='q']");
  const inputValue = searchInput?.value?.trim();
  if (inputValue) return { query: inputValue, source: "search_input" };

  const url = new URL(location.href);
  const q = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("search");
  if (q) return { query: q.trim(), source: "url_query" };

  return { query: "", source: "none" };
}

function inferConceptsFromQuery(query) {
  const commaParts = query
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const mainConcept = commaParts[0];
    const targetConcept = commaParts.slice(1).join(" / ");
    return [mainConcept, targetConcept, ...relatedTermsFor([mainConcept, targetConcept])];
  }

  const quoted = [...query.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (quoted.length >= 2) return [...quoted, ...relatedTermsFor(quoted)];

  const topicSplit = splitConceptAndTopic(query);
  if (topicSplit) return topicSplit;

  const cleaned = query
    .replace(/["()]/g, " ")
    .replace(/\b(relationship|relation|related|association|associated|correlation|effect|effects|impact|influence|between|versus|vs|and|with|of|on|in|to|for|the|a|an|does|do|is|are|how|what|when|where|why)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter((word) => word.length > 2);
  if (words.length <= 2) return words;

  const first = words.slice(0, Math.min(2, Math.ceil(words.length / 2))).join(" ");
  const second = words.slice(Math.min(2, Math.ceil(words.length / 2)), Math.min(words.length, 4)).join(" ");
  const rest = words.slice(4);
  return [first, second, ...rest, ...relatedTermsFor([first, second])].filter(Boolean);
}

function splitConceptAndTopic(query) {
  const topicWords = new Set([
    "diet",
    "food",
    "foods",
    "care",
    "guide",
    "guides",
    "husbandry",
    "handling",
    "housing",
    "bedding",
    "cage",
    "enrichment",
    "health",
    "veterinary",
    "eat",
    "eats",
    "eating",
    "fed",
    "feed",
    "feeds",
    "feeding",
    "prey",
    "forage",
    "foraging",
    "stomach",
    "contents"
  ]);
  const cleaned = query
    .replace(/[?]/g, " ")
    .replace(/\b(what|which|does|do|did|is|are|the|a|an|of|on|in|for|about|relationship|effect|impact)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const naturalEatQuestion = query.match(/\bwhat\s+(?:does|do|did)?\s*(.+?)\s+(?:eat|eats|feed on|prey on)\b/i);
  if (naturalEatQuestion?.[1]) {
    const mainConcept = naturalEatQuestion[1]
      .replace(/\b(the|a|an)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (mainConcept) return [mainConcept, "food / diet", ...relatedTermsFor([mainConcept, "food / diet"])];
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const firstTopicIndex = words.findIndex((word) => topicWords.has(word.toLowerCase()));
  if (firstTopicIndex <= 0) return null;

  const mainConcept = words.slice(0, firstTopicIndex).join(" ");
  const targetConcept = words.slice(firstTopicIndex).filter((word) => topicWords.has(word.toLowerCase())).join(" / ");
  if (!mainConcept || !targetConcept) return null;
  return [mainConcept, targetConcept, ...relatedTermsFor([mainConcept, targetConcept])];
}

function findPdfLinks() {
  return [...document.querySelectorAll("a[href]")]
    .map((link) => link.href)
    .filter((href) => /\.pdf(?:$|[?#])/i.test(href))
    .slice(0, 10);
}

function relatedTermsFor(concepts) {
  const text = concepts.join(" ").toLowerCase();
  const related = [];

  if (/\b(food|diet|feed|feeding|eat|eating|prey)\b/.test(text)) {
    related.push("feeding", "prey", "foraging", "stomach contents", "consumed");
  }

  if (/\b(care|guide|husbandry|handling|housing|bedding|cage|enrichment|health|veterinary)\b/.test(text)) {
    related.push("housing", "bedding", "feeding", "water", "handling", "enrichment", "cleaning", "veterinary");
  }

  if (/\b(climate|temperature|warming|rainfall|precipitation|drought)\b/.test(text)) {
    related.push("temperature", "precipitation", "warming", "drought", "seasonal");
  }

  if (/\b(forest|tree|canopy|habitat|cover)\b/.test(text)) {
    related.push("canopy", "habitat", "forest cover", "vegetation", "woodland");
  }

  if (/\b(tick|ticks|mite|mites|parasite|parasites)\b/.test(text)) {
    related.push("abundance", "density", "prevalence", "infestation", "host");
  }

  if (/\b(black phoebe|phoebe)\b/.test(text)) {
    related.push("Sayornis nigricans", "phoebe");
  }

  return [...new Set(related)].slice(0, 8);
}

function normalizeTerms(terms) {
  return [...new Set(terms.map((term) => term?.trim().toLowerCase()).filter(Boolean))];
}

function includesTerm(lowerText, term) {
  if (!term) return false;
  const normalized = term.toLowerCase().trim();
  if (lowerText.includes(normalized)) return true;
  if (normalized.endsWith("s") && lowerText.includes(normalized.slice(0, -1))) return true;
  const words = normalized.split(/\s+/).filter((word) => word.length > 2);
  return words.length > 1 && words.some((word) => lowerText.includes(word.endsWith("s") ? word.slice(0, -1) : word));
}

function normalizeSpaces(text) {
  return text.replace(/\s+/g, " ").trim();
}

function compactForSearch(text) {
  return normalizeSpaces(text).toLowerCase();
}

function approximateOriginalIndex(original, compactOriginal, compactIndex) {
  const prefix = compactOriginal.slice(0, compactIndex);
  for (let i = 0; i < original.length; i += 1) {
    if (compactForSearch(original.slice(0, i)).length >= prefix.length) return i;
  }
  return 0;
}

function isVisible(el) {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}
})();
