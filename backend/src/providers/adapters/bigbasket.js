const logger = require('../../utils/logger');
const { newLocatedPage, waitForProducts } = require('./browser');
const { isAdResult } = require('../../utils/adDetection');

async function fetchBigBasketResults(query, location = {}) {
    const page = await newLocatedPage(location, 'https://www.bigbasket.com');

    try {
        // BigBasket resolves serving area from a pincode cookie when available.
        if (location.pincode) {
            try {
                await page.setCookie(
                    { name: '_bb_pin_code', value: String(location.pincode), domain: '.bigbasket.com' },
                    { name: 'pincode', value: String(location.pincode), domain: '.bigbasket.com' }
                );
            } catch (_e) { /* best effort */ }
        }

        const searchUrl = `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await waitForProducts(page, ['a[href*="/pd/"]']);

        const serviceability = await page.evaluate(() => {
            const body = (document.body.innerText || '').toLowerCase();
            const notServiceable =
                body.includes('not serviceable') ||
                body.includes('do not deliver') ||
                body.includes("don't deliver") ||
                body.includes('not available in your') ||
                body.includes('currently not delivering');
            const hasProducts = !!document.querySelector('a[href*="/pd/"]');
            return { notServiceable, hasProducts };
        });

        if (serviceability.notServiceable && !serviceability.hasProducts) {
            return { serviceable: false };
        }

        const allProducts = await page.evaluate(() => {
            const productLinks = Array.from(document.querySelectorAll('a[href*="/pd/"]'));
            const seen = new Set();
            const results = [];

            for (const link of productLinks) {
                const href = link.href;
                const pdMatch = href.match(/\/pd\/(\d+)\//);
                if (!pdMatch) continue;
                const pdId = pdMatch[1];
                if (seen.has(pdId)) continue;
                seen.add(pdId);

                let card = link;
                let attempts = 0;
                while (card && attempts < 8) {
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

                const nameLines = lines.filter(
                    (line) =>
                        line.length > 3 &&
                        !line.includes('₹') &&
                        !/^(Add|ADD|ADDED|MINS|OFF|min)$/i.test(line) &&
                        !/^\d+%?\s*OFF$/i.test(line) &&
                        !/^\d+\s*MINS?$/i.test(line)
                );
                const name = nameLines.length >= 2
                    ? `${nameLines[0]} ${nameLines[1]}`
                    : nameLines[0] || null;

                const quantity = lines.find(
                    (line) => /^\d+/.test(line) && /ml|g\b|kg|l\b|ltr|litre|pouch|pack|piece|pcs/i.test(line)
                );

                const etaLine = lines.find((line) => /\bmins?\b/i.test(line) && /\d/.test(line));
                const etaMinutes = etaLine ? parseInt(etaLine.match(/(\d+)/)?.[1] || '', 10) : null;

                const priceMatch = text.match(/₹([\d,.]+)/);
                if (!name || !priceMatch) continue;

                const price = parseFloat(priceMatch[1].replace(/,/g, ''));

                results.push({
                    name,
                    quantity: quantity || '',
                    price: Math.round(price),
                    etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
                    img: img ? img.src : null,
                    href,
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
            price: { amount: chosen.price, currency: 'INR', mrp: null },
            etaMinutes: chosen.etaMinutes,
            url: chosen.href,
            inStock: true,
        };
    } catch (err) {
        logger.error('BigBasket scrape error:', err.message);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { fetchFirstResult: fetchBigBasketResults };
