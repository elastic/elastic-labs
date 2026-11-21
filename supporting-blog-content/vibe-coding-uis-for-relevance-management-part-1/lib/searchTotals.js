export function parseEsTotal(total) {
  if (total == null) {
    return { value: 0, relation: 'eq' };
  }

  if (typeof total === 'number') {
    return { value: total, relation: 'eq' };
  }

  return {
    value: total.value ?? 0,
    relation: total.relation ?? 'eq',
  };
}

export function formatEsTotal(total) {
  const { value, relation } = parseEsTotal(total);
  const formatted = Number(value).toLocaleString();
  return relation === 'gte' ? `${formatted}+` : formatted;
}
