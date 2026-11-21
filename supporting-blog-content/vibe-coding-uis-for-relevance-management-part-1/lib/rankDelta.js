export function buildRankMap(hits) {
  const rankById = {};

  hits.forEach((hit, index) => {
    const id = hit.id || hit._source?.id;
    if (id) {
      rankById[id] = index + 1;
    }
  });

  return rankById;
}

export function formatHit(hit) {
  const source = hit._source || {};

  return {
    ...source,
    id: source.id || hit._id,
    name: source.name || '',
    description: source.description || '',
    category: source.category || '',
    brand: source.brand || '',
    image_url: source.image_url || '',
    score: hit._score ?? 0,
  };
}

export function computeDelta(currentRank, otherRank) {
  if (otherRank == null) {
    return null;
  }

  const delta = otherRank - currentRank;
  if (delta === 0) {
    return { direction: 'same', value: 0, label: '—' };
  }

  if (delta > 0) {
    return { direction: 'up', value: delta, label: `↑${delta}` };
  }

  return { direction: 'down', value: Math.abs(delta), label: `↓${Math.abs(delta)}` };
}

export function enrichHits(hits, thisRankById, otherRankById, panel) {
  return hits.map((hit) => {
    const id = hit.id;
    const currentRank = thisRankById[id];
    const otherRank = otherRankById[id];
    const isNew = panel === 'new' && currentRank != null && otherRank == null;

    return {
      ...hit,
      rank: currentRank,
      delta: computeDelta(currentRank, otherRank),
      isNew,
    };
  });
}

export function prepareCompareResults(oldHits, newHits) {
  const oldFormatted = oldHits.map(formatHit);
  const newFormatted = newHits.map(formatHit);
  const oldRankById = buildRankMap(oldFormatted);
  const newRankById = buildRankMap(newFormatted);

  return {
    oldQuery: {
      hits: enrichHits(oldFormatted, oldRankById, newRankById, 'old'),
    },
    newQuery: {
      hits: enrichHits(newFormatted, newRankById, oldRankById, 'new'),
    },
    rankMeta: { oldRankById, newRankById },
  };
}
