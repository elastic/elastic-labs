import { getElasticsearchClient, getIndexName } from '@/lib/elasticsearch';
import { buildQuery, loadQueryTemplate, sanitizeTerm } from '@/lib/queryProcessor';
import { prepareCompareResults } from '@/lib/rankDelta';
import { parseEsTotal } from '@/lib/searchTotals';

export async function POST(request) {
  try {
    const body = await request.json();
    const term = sanitizeTerm(body?.term);

    if (!term) {
      return Response.json({ error: 'Search term is required' }, { status: 400 });
    }

    const client = getElasticsearchClient();
    const index = getIndexName();
    const oldTemplate = loadQueryTemplate('old-query.json');
    const newTemplate = loadQueryTemplate('new-query.json');
    const oldBody = buildQuery(oldTemplate, term);
    const newBody = buildQuery(newTemplate, term);

    const [oldResponse, newResponse] = await Promise.all([
      client.search({ index, body: oldBody }),
      client.search({ index, body: newBody }),
    ]);

    const compared = prepareCompareResults(
      oldResponse.hits.hits,
      newResponse.hits.hits
    );

    return Response.json({
      term,
      oldQuery: {
        hits: compared.oldQuery.hits,
        took: oldResponse.took,
        total: parseEsTotal(oldResponse.hits.total),
      },
      newQuery: {
        hits: compared.newQuery.hits,
        took: newResponse.took,
        total: parseEsTotal(newResponse.hits.total),
      },
      rankMeta: compared.rankMeta,
    });
  } catch (error) {
    console.error('Compare API error:', error);
    const message = error.message || 'Search failed';
    const status = message.includes('required') ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
