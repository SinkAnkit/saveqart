const logger = require('../../utils/logger');
const { newLocatedPage, waitForProducts } = require('./browser');
const { isAdResult } = require('../../utils/adDetection');

// Titles that are actually availability/status strings, not product names.
function isBadTitle(name) {
    if (!name) return true;
    const n = name.trim().toLowerCase();
    return (
        n.length < 3 ||
        n === 'currently unavailable' ||
        n === 'out of stock' ||
        n === 'sold out' ||
        n === 'coming soon' ||
        /^₹/.test(name)
    );
}

async function fetchFlipkartResults(query, location = {}) {
    const page = await newLocatedPage(location, 'https://www.flipkart.com');

    try {
        if (location.pincode) {
            try {
                await page.setCookie({
                    name: 'pin',
                    value: String(location.pincode),
                    domain: '.flipkart.com',
                });
            } catch (_e) { /* best effort */ }
        }

        const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await waitForProducts(page, ['a[href*="/p/"]']);

        const allProducts = await page.evaluate(() => {
            const productLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'));
            const seen = new Set();
            const results = [];

            for (const link of productLinks) {
                const href = link.href;
                const pidMatch = href.match(/pid=([A-Z0-9]+)/);
                if (!pidMatch) continue;
                const pid = pidMatch[1];
                if (seen.has(pid)) continue;
                seen.add(pid);

                let card = link;
                let attempts = 0;
                while (card && attempts < 6) {
                    const text = card.innerText || '';
                    if (text.includes('₹') && card.querySelector('img')) break;
                    card = card.parentElement;
                    attempts++;
                }

                if (!card) continue;
                const text = card.innerText || '';
                if (!text.includes('₹')) continue;

                const img = card.querySelector('img');
                const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

                // Use the link's own title text when possible; fall back to the
                // first non-status line so we don't pick up "Currently unavailable".
                const linkTitle = (link.getAttribute('title') || link.innerText || '')
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)[0];
                const name = linkTitle || lines.find((l) => l.length > 3 && !l.includes('₹'));

                const quantityLine = lines.find(
                    (line) => /^\d+(\.\d+)?\s*(ml|g\b|kg|l\b|ltr|litre|pack|piece|pcs)/i.test(line)
                );

                const etaLine = lines.find((line) => /\bmins?\b/i.test(line) && /\d/.test(line));
                const etaMinutes = etaLine ? parseInt(etaLine.match(/(\d+)/)?.[1] || '', 10) : null;

                const cleanText = text.replace(/\d+%\s*off/i, '');
                const priceMatches = [...cleanText.matchAll(/₹([\d,]+)/g)];
                if (!name || priceMatches.length === 0) continue;

                const price = parseInt(priceMatches[0][1].replace(/,/g, ''));
                let mrp = null;
                if (priceMatches.length > 1) {
                    mrp = parseInt(priceMatches[1][1].replace(/,/g, ''));
                }

                results.push({
                    name,
                    quantity: quantityLine || '',
                    price,
                    mrp,
                    etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
                    img: img ? img.src : null,
                    href,
                    rawText: text,
                });
            }

            return results;
        });

        if (!allProducts || allProducts.length === 0) return null;

        let chosen = null;
        for (const p of allProducts) {
            if (!isBadTitle(p.name) && !isAdResult({ productName: p.name, query, cardText: p.rawText })) {
                chosen = p;
                break;
            }
        }
        // Only fall back to a real-looking title, never a status string.
        if (!chosen) chosen = allProducts.find((p) => !isBadTitle(p.name)) || null;
        if (!chosen) return null;

        return {
            title: chosen.name,
            quantity: chosen.quantity,
            imageUrl: chosen.img,
            price: { amount: chosen.price, currency: 'INR', mrp: chosen.mrp },
            etaMinutes: chosen.etaMinutes,
            url: chosen.href,
            inStock: true,
        };
    } catch (err) {
        logger.error('Flipkart scrape error:', err.message);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { fetchFirstResult: fetchFlipkartResults };
