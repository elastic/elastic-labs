export const INDEX_NAME = 'amazon-electronics';
export const TARGET_COUNT = 10000;

export function extractImageUrl(images) {
  if (!images) {
    return null;
  }

  if (Array.isArray(images)) {
    for (const image of images) {
      if (!image || typeof image !== 'object') {
        continue;
      }
      const url = pickUrl(image);
      if (url) {
        return url;
      }
    }
    return null;
  }

  if (typeof images === 'object') {
    const lists = ['large', 'hi_res', 'thumb'];
    for (const key of lists) {
      const values = images[key];
      if (!Array.isArray(values)) {
        continue;
      }
      for (const value of values) {
        if (isValidUrl(value)) {
          return value;
        }
      }
    }
  }

  return null;
}

function pickUrl(image) {
  return (
    [image.large, image.hi_res, image.thumb].find(isValidUrl) || null
  );
}

function isValidUrl(value) {
  return typeof value === 'string' && value.startsWith('https://');
}

export function parseBrand(row) {
  if (row.store && row.store !== 'None') {
    return row.store;
  }

  if (row.details) {
    try {
      const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      if (details?.Brand) {
        return details.Brand;
      }
    } catch {
      // ignore invalid details JSON
    }
  }

  return 'Unknown';
}

export function parseCategory(row) {
  if (Array.isArray(row.categories) && row.categories.length > 0) {
    return row.categories[row.categories.length - 1];
  }

  if (row.main_category) {
    return row.main_category.replace(/_/g, ' ');
  }

  return 'Electronics';
}

export function parseDescription(row) {
  const parts = [];

  if (Array.isArray(row.description)) {
    parts.push(...row.description.filter(Boolean));
  } else if (typeof row.description === 'string' && row.description) {
    parts.push(row.description);
  }

  if (Array.isArray(row.features)) {
    parts.push(...row.features.filter(Boolean));
  }

  const text = parts.join(' ').trim();
  return text || row.title || '';
}

export function mapAmazonRow(row) {
  const imageUrl = extractImageUrl(row.images);
  if (!row.parent_asin || !row.title || !imageUrl) {
    return null;
  }

  return {
    id: row.parent_asin,
    name: row.title.trim(),
    description: parseDescription(row),
    category: parseCategory(row),
    brand: parseBrand(row),
    image_url: imageUrl,
  };
}

export function writeNdjsonLine(stream, index, product) {
  stream.write(`${JSON.stringify({ index: { _index: index, _id: product.id } })}\n`);
  stream.write(`${JSON.stringify(product)}\n`);
}
