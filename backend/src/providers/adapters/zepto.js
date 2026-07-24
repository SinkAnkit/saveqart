const logger = require('../../utils/logger');
const { newLocatedPage, waitForProducts } = require('./browser');
const { isAdResult } = require('../../utils/adDetection');

function extractProducts(page) {
    return page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/pn/"]'));
        const results = [];
        const seen = new Set();

        for (const link of links) {
            const href = link.href;
            if (seen.has(href)) continue;
            seen.add(href);

            const text = link.innerText || '';
            const img = link.querySelector('img');

            // Image optional (Zepto lazy-loads images); require a price.
            if (!text.includes('₹')) continue;

            const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

            const name = lines.find(
                (line) =>
                    line.length > 5 &&
                    !line.includes('₹') &&
                    !/^ADD$/i.test(line) &&
                    !/^\d+%?\s*OFF$/i.test(line) &&
                    !/^\d+\.\d+$/.test(line) &&
                    !/^\(\d/.test(line)
            );

            const quantity = lines.find(
                (line) => /^\d+\s*(pack|g\b|kg|ml|l\b|ltr|litre|piece|pcs)/i.test(line)
            );

            const etaLine = lines.find((line) => /\bmins?\b/i.test(line) && /\d/.test(line));
            const etaMinutes = etaLine ? parseInt(etaLine.match(/(\d+)/)?.[1] || '', 10) : null;

            const priceMatch = text.match(/₹([\d,]+)/);
            const allPrices = [...text.matchAll(/₹([\d,]+)/g)];
            let mrp = null;
            if (allPrices.length >= 2) {
                mrp = parseInt(allPrices[1][1].replace(/,/g, ''));
            }

            if (name && priceMatch) {
                results.push({
                    name,
                    quantity: quantity || '',
                    price: parseInt(priceMatch[1].replace(/,/g, '')),
                    mrp,
                    etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
                    img: img ? img.src : null,
                    href,
                });
            }
        }

        return results;
    });
}

async function checkNotServiceable(page) {
    return page.evaluate(() => {
        const body = (document.body.innerText || '').toLowerCase();
        const notServiceable =
            body.includes('not serviceable') ||
            body.includes('not deliverable') ||
            body.includes("we don't deliver") ||
            body.includes('coming soon') ||
            body.includes('not available in your');
        const hasProducts = !!document.querySelector('a[href*="/pn/"]');
        return notServiceable && !hasProducts;
    });
}

async function fetchZeptoResults(query, location = {}) {
    const page = await newLocatedPage(location, 'https://www.zeptonow.com');
    const searchUrl = `https://www.zeptonow.com/search?query=${encodeURIComponent(query)}`;

    try {
        // Up to 2 attempts: guards against reading the page before it hydrates.
        for (let attempt = 0; attempt < 2; attempt++) {
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await waitForProducts(page, ['a[href*="/pn/"]']);

            if (await checkNotServiceable(page)) {
                return { serviceable: false };
            }

            const allProducts = await extractProducts(page);
            if (allProducts && allProducts.length > 0) {
                let chosen = allProducts.find((p) => !isAdResult({ productName: p.name, query })) || allProducts[0];
                return {
                    title: chosen.name,
                    quantity: chosen.quantity,
                    imageUrl: chosen.img,
                    price: { amount: chosen.price, currency: 'INR', mrp: chosen.mrp },
                    etaMinutes: chosen.etaMinutes,
                    url: chosen.href,
                    inStock: true,
                };
            }
            // empty -> brief pause then retry once
            await new Promise((r) => setTimeout(r, 1200));
        }
        return null;
    } catch (err) {
        logger.error('Zepto scrape error:', err.message);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { fetchFirstResult: fetchZeptoResults };
