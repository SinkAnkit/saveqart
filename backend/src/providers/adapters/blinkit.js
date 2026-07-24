const logger = require('../../utils/logger');
const { newLocatedPage, waitForProducts } = require('./browser');
const { isAdResult } = require('../../utils/adDetection');
function constructProductUrl(name, id) {
  if (!id) return null;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `https://blinkit.com/prn/${slug}/prid/${id}`;
}

async function fetchBlinkitResults(query, location = {}) {
  const page = await newLocatedPage(location, 'https://blinkit.com');

  try {
    // Set Blinkit's location cookies from the USER'S pin (no hardcoded values).
    if (Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
      const cookies = [
        { name: 'gr_1_lat', value: String(location.lat), domain: '.blinkit.com' },
        { name: 'gr_1_lon', value: String(location.lng), domain: '.blinkit.com' },
      ];
      if (location.city) {
        cookies.push({ name: 'gr_1_locality', value: String(location.city), domain: '.blinkit.com' });
      }
      await page.setCookie(...cookies);
    }

    const searchUrl = `https://blinkit.com/s/?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitForProducts(page, ['div[id][role="button"]', 'a[href*="/prn/"]']);

    // Detect "not serviceable" — Blinkit shows a location/serviceability
    // interstitial when it does not deliver to the selected coordinates.
    const serviceability = await page.evaluate(() => {
      const body = (document.body.innerText || '').toLowerCase();
      const notServiceable =
        body.includes('not serviceable') ||
        body.includes("doesn't deliver") ||
        body.includes('does not deliver') ||
        body.includes('not available in your') ||
        body.includes('coming soon to your');
      const hasProducts = !!document.querySelector('div[id][role="button"], a[href*="/prn/"]');
      return { notServiceable, hasProducts };
    });

    if (serviceability.notServiceable && !serviceability.hasProducts) {
      return { serviceable: false };
    }

    // Nudge lazy-loaded images/cards into view before extraction.
    try {
      await page.evaluate(async () => {
        window.scrollBy(0, 900);
        await new Promise((r) => setTimeout(r, 600));
        window.scrollTo(0, 0);
      });
    } catch (_e) { /* non-fatal */ }

    const allProducts = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll('div[id][role="button"], a[href*="/prn/"]')
      );

      const results = [];
      for (const card of cards) {
        const text = card.innerText || '';
        const id =
          card.getAttribute('id') ||
          (card.href ? card.href.match(/prid\/(\d+)/)?.[1] : null);
        const img = card.querySelector('img');

        // Image is optional: Blinkit lazy-loads images, so many valid product
        // cards have no <img> yet at scrape time. Require price + ADD + id only.
        if (text.includes('₹') && text.includes('ADD') && id) {
          const lines = text
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l);

          const name = lines.find(
            (line) =>
              line.length > 3 &&
              !line.includes('MINS') &&
              !line.includes('₹') &&
              !line.includes('ADD') &&
              !/^\d+%?\s*OFF$/i.test(line) &&
              !line.match(/^\d+/)
          );

          const quantity = lines.find(
            (line) =>
              line.match(/^\d+/) &&
              /ml|g\b|kg|l\b|ltr|litre|piece|pcs|pack/i.test(line)
          );

          // ETA e.g. "12 MINS"
          const etaLine = lines.find((line) => /\bmins?\b/i.test(line) && /\d/.test(line));
          const etaMinutes = etaLine ? parseInt(etaLine.match(/(\d+)/)?.[1] || '', 10) : null;

          const priceMatch = text.match(/₹([\d,]+)/);

          if (name && priceMatch) {
            results.push({
              id,
              name,
              quantity: quantity || '',
              price: parseInt(priceMatch[1].replace(/,/g, '')),
              etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
              img: img ? img.src : null,
              href: card.tagName === 'A' ? card.href : null,
              rawText: text,
            });
          }
        }
      }

      return results;
    });

    if (!allProducts || allProducts.length === 0) return null;

    let chosen = null;
    for (const p of allProducts) {
      if (!isAdResult({ productName: p.name, query, cardText: p.rawText })) {
        chosen = p;
        break;
      }
    }
    if (!chosen) chosen = allProducts[0];

    const finalUrl = chosen.href || constructProductUrl(chosen.name, chosen.id);

    return {
      title: chosen.name,
      quantity: chosen.quantity,
      imageUrl: chosen.img,
      price: { amount: chosen.price, currency: 'INR', mrp: null },
      etaMinutes: chosen.etaMinutes,
      url: finalUrl,
      inStock: true,
    };
  } catch (err) {
    logger.error('Blinkit scrape error:', err.message);
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { fetchFirstResult: fetchBlinkitResults };
