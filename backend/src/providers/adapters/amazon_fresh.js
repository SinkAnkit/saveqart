const logger = require('../../utils/logger');
const { newLocatedPage, waitForProducts } = require('./browser');
const { isAdResult } = require('../../utils/adDetection');

async function fetchAmazonFreshResults(query, location = {}) {
    const page = await newLocatedPage(location, 'https://www.amazon.in');

    try {
        // Amazon resolves the Fresh/Now store from the session delivery pincode.
        if (location.pincode) {
            try {
                await page.setCookie({
                    name: 'ubid-acbin',
                    value: String(location.pincode),
                    domain: '.amazon.in',
                });
            } catch (_e) { /* best effort */ }
        }

        const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(query)}&i=nowstore`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await waitForProducts(page, ['div[data-component-type="s-search-result"]']);

        const serviceability = await page.evaluate(() => {
            const body = (document.body.innerText || '').toLowerCase();
            const notServiceable =
                body.includes('not available in your area') ||
                body.includes('is not serviceable') ||
                body.includes('fresh is not available');
            const hasProducts = !!document.querySelector('div[data-component-type="s-search-result"]');
            return { notServiceable, hasProducts };
        });

        if (serviceability.notServiceable && !serviceability.hasProducts) {
            return { serviceable: false };
        }

        const allProducts = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]'));
            const results = [];

            for (const item of items) {
                const titleEl = item.querySelector('.a-text-normal');
                if (!titleEl) continue;
                const name = titleEl.innerText.trim();

                const priceEl = item.querySelector('.a-price-whole');
                if (!priceEl) continue;
                const price = parseInt(priceEl.innerText.replace(/,/g, ''));

                const mrpEl = item.querySelector('.a-text-price .a-offscreen');
                const mrp = mrpEl ? parseInt(mrpEl.innerText.replace(/[^0-9]/g, '')) : null;

                const imgEl = item.querySelector('img.s-image');
                const img = imgEl ? imgEl.src : null;

                const linkEl = item.querySelector('a.a-link-normal');
                const href = linkEl ? linkEl.href : null;

                results.push({ name, quantity: '', price, mrp, img, href, rawText: item.innerText });
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
        logger.error('Amazon Fresh scrape error:', err.message);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { fetchFirstResult: fetchAmazonFreshResults };
