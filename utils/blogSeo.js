const normalizeSlug = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/g, '');

const blogSlug = value => {
  const slug = normalizeSlug(value) || 'article';
  return /^[a-f\d]{24}$/i.test(slug) ? `article-${slug}` : slug;
};

async function resolveSlug(Blog, requested, fallback, currentId) {
  if (requested !== undefined && typeof requested !== 'string') { const error = new Error('URL slug must be text.'); error.status = 400; throw error; }
  requested = requested?.trim();
  const base = blogSlug(requested || fallback);
  let candidate = base, suffix = 1;
  while (await Blog.findOne({ ...(currentId ? { _id: { $ne: currentId } } : {}), $or: [{ slug: candidate }, { slugHistory: candidate }] })) {
    if (requested) { const error = new Error('This URL slug is already used by another blog. Choose a different slug.'); error.status = 409; throw error; }
    candidate = `${base}-${++suffix}`;
  }
  return candidate;
}

function seoFields(body) {
  const fields = {};
  for (const key of ['seoTitle', 'seoDescription', 'focusKeyword', 'seoKeywords', 'imageAlt', 'canonicalUrl']) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') { const error = new Error(`${key} must be text.`); error.status = 400; throw error; }
      fields[key] = body[key].trim();
    }
  }
  if (fields.canonicalUrl) {
    let url;
    try { url = new URL(fields.canonicalUrl); } catch { /* handled below */ }
    if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      const error = new Error('Canonical URL must be a full http:// or https:// address.'); error.status = 400; throw error;
    }
  }
  if (body.noIndex !== undefined) {
    if (typeof body.noIndex !== 'boolean') { const error = new Error('Search visibility must be true or false.'); error.status = 400; throw error; }
    fields.noIndex = body.noIndex;
  }
  return fields;
}
module.exports = { blogSlug, resolveSlug, seoFields };
