import { useEffect } from 'react';

const SITE_NAME = 'Millo';
const BASE_URL = 'https://milloapp.com';
const DEFAULT_DESCRIPTION = 'Millo — live streaming and creator platform.';
const DEFAULT_IMAGE = 'https://milloapp.com/og-default.png';
const TWITTER_SITE = '@milloapp';

function setMeta(selector, attr, attrValue, content) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * SEO: sets title, description, canonical, Open Graph, and Twitter Card meta tags.
 * Props:
 *   title       — page title (appended with "| Millo")
 *   description — page description
 *   path        — URL path, e.g. "/live"
 *   image       — absolute URL for OG/Twitter image (defaults to og-default.png)
 *   twitterCard — "summary" | "summary_large_image" (default: "summary_large_image")
 */
export function SEO({ title, description, path = '', image, twitterCard = 'summary_large_image' }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const desc = description || DEFAULT_DESCRIPTION;
  const canonical = path ? `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}` : BASE_URL;
  const img = image || DEFAULT_IMAGE;

  useEffect(() => {
    document.title = fullTitle;

    // — canonical
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);

    // — standard description
    setMeta('meta[name="description"]', 'name', 'description', desc);

    // — Open Graph
    setMeta('meta[property="og:type"]',        'property', 'og:type',        'website');
    setMeta('meta[property="og:site_name"]',   'property', 'og:site_name',   SITE_NAME);
    setMeta('meta[property="og:title"]',       'property', 'og:title',       fullTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc);
    setMeta('meta[property="og:url"]',         'property', 'og:url',         canonical);
    setMeta('meta[property="og:image"]',       'property', 'og:image',       img);

    // — Twitter Card
    setMeta('meta[name="twitter:card"]',        'name', 'twitter:card',        twitterCard);
    setMeta('meta[name="twitter:site"]',        'name', 'twitter:site',        TWITTER_SITE);
    setMeta('meta[name="twitter:title"]',       'name', 'twitter:title',       fullTitle);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc);
    setMeta('meta[name="twitter:image"]',       'name', 'twitter:image',       img);
  }, [fullTitle, desc, canonical, img, twitterCard]);

  return null;
}
