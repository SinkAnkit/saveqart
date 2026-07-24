const logger = require('../../utils/logger');
const { newLocatedPage, waitForProducts } = require('./browser');
const { isAdResult } = require('../../utils/adDetection');

async function fetchStarQuikResults(query, location = {}) {
    const page = await newLocatedPage(location, 'https://www.starquik.com');

    try {
        if (location.pincode) {
            try {
                await page.setCookie({
                    name: 'sq_pincode',
                    value: String(location.pincode),
                    domain: '.starquik.com',
                });
            } catch (_e) { /* best effort */ }
        }

        const searchUrl = `https://www.starquik.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitForProducts(page, ['a[href*="/product"]', 'article', '[class*="product"]'], { timeout: 12000 });

        const allProducts = await page.evaluate(() => {
            const allEls = Array.from(document.querySelectorAll('div, a, li, article, section'));
            const results = [];
            const seen = new Set();

            for (const el of allEls) {
                const text = el.innerText || '';
                if (!text.includes('₹') && !text.toLowerCase().includes('rs')) continue;
                if (text.length > 300) continue;

                const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);
                if (lines.length < 2) continue;

                const name = lines.find((l) => l.length > 3 && !l.includes('₹') && !l.toLowerCase().includes('rs') && !l.toLowerCase().includes('off'));
                if (!name) continue;

                const key = name;
                if (seen.has(key)) continue;
                seen.add(key);

                const quantity = lines.find((l) => /^\d+(\.\d+)?\s*(ml|g|kg|l\b|ltr|litre|pack|piece|pcs)/i.test(l)) || '';

                const priceMatches = [...text.matchAll(/(?:₹|rs\.?)\s*([\d,.]+)/ig)];
                if (priceMatches.length === 0) continue;

                let price = null;
                let mrp = null;

                if (priceMatches.length >= 2) {
                    price = parseFloat(priceMatches[0][1].replace(/,/g, ''));
                    mrp = parseFloat(priceMatches[1][1].replace(/,/g, ''));
                    if (price > mrp) {
                        const temp = price;
                        price = mrp;
                        mrp = temp;
                    }
                } else {
                    price = parseFloat(priceMatches[0][1].replace(/,/g, ''));
                }

                const imgEl = el.querySelector('img');
                const linkEl = el.tagName === 'A' ? el : el.querySelector('a');

                results.push({
                    name,
                    quantity,
                    price: Math.round(price),
                    mrp: mrp ? Math.round(mrp) : null,
                    img: imgEl ? imgEl.src : null,
                    href: linkEl ? linkEl.href : null,
                    rawText: text,
                });
            }
            return results;
        });

        if (!allProducts || allProducts.length === 0) return null;

        let chosen = null;
        for (const p of allProducts) {
            if (!isAdResult({ productName: p.name, query })) {
                chosen = p;
                break;
            }
        }
        if (!chosen) chosen = allProducts[0];

        return {
            title: chosen.name,
            quantity: chosen.quantity,
            imageUrl: chosen.img,
            price: { amount: chosen.price, currency: 'INR', mrp: chosen.mrp },
            etaMinutes: null,
            url: chosen.href,
            inStock: true,
        };
    } catch (err) {
        logger.error('StarQuik scrape error:', err.message);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { fetchFirstResult: fetchStarQuikResults };
