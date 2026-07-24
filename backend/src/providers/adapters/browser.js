const logger = require('../../utils/logger');
const puppeteer = require('puppeteer');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/brave-browser';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

let browserPromise = null;

/**
 * Single shared headless browser instance across all adapters.
 */
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: EXECUTABLE_PATH,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=Automation',
        ],
      })
      .catch((err) => {
        // Reset so a later call can retry a failed launch.
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

function isValidCoord(location) {
  return (
    location &&
    Number.isFinite(Number(location.lat)) &&
    Number.isFinite(Number(location.lng))
  );
}

/**
 * Create a page pre-configured with the user's real location.
 *
 * The user's map-selected coordinates are injected via the browser
 * geolocation API (navigator.geolocation), which is how quick-commerce
 * SPAs resolve the serving store/darkstore for a delivery address.
 * No coordinates are hardcoded anywhere — everything comes from `location`.
 */
async function newLocatedPage(location, originForPermission) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);

  if (isValidCoord(location)) {
    try {
      const context = browser.defaultBrowserContext();
      if (originForPermission) {
        await context.overridePermissions(originForPermission, ['geolocation']);
      }
      await page.setGeolocation({
        latitude: Number(location.lat),
        longitude: Number(location.lng),
      });
    } catch (_err) {
      // Geolocation override is best-effort; continue without it.
    }
  }

  return page;
}

/**
 * Wait for any of the given selectors to appear, or resolve after a
 * fallback timeout. Replaces blind fixed sleeps so pages that render
 * fast return quickly, while slow pages still get a bounded wait.
 */
async function waitForAny(page, selectors = [], { timeout = 8000, settle = 1200 } = {}) {
  if (selectors.length > 0) {
    try {
      await Promise.race(
        selectors.map((sel) => page.waitForSelector(sel, { timeout }))
      );
      // brief settle so late-rendering prices/images attach
      await new Promise((r) => setTimeout(r, settle));
      return true;
    } catch (_err) {
      // fall through to fallback wait
    }
  }
  await new Promise((r) => setTimeout(r, Math.min(timeout, 4000)));
  return false;
}

/**
 * Poll until real product content is present, not just any DOM node.
 * Waits for at least one matching selector AND a price signal (₹) in the body,
 * which is what actually indicates the product grid has rendered. This defeats
 * the race where a heavy SPA is read before its products hydrate.
 */
async function waitForProducts(page, selectors = [], { timeout = 15000, priceSignal = true } = {}) {
  const start = Date.now();
  const sel = selectors.join(',');
  while (Date.now() - start < timeout) {
    try {
      const ready = await page.evaluate(
        (selector, wantPrice) => {
          const hasCards = selector ? document.querySelectorAll(selector).length > 0 : true;
          const body = document.body ? document.body.innerText || '' : '';
          const hasPrice = wantPrice ? body.includes('₹') || /\brs\.?\b/i.test(body) : true;
          return hasCards && hasPrice;
        },
        sel,
        priceSignal
      );
      if (ready) {
        // small settle so late nodes attach
        await new Promise((r) => setTimeout(r, 700));
        return true;
      }
    } catch (_e) {
      // navigation/eval mid-flight; keep polling
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * Minimal concurrency limiter (no dependency). Caps how many scrapes run at
 * once so shared-browser pages don't starve each other for CPU/memory.
 */
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

/**
 * Gracefully close the shared browser instance.
 * Call this on process shutdown to free resources.
 */
async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (_err) {
    // Browser was already dead or never launched — fine.
  } finally {
    browserPromise = null;
  }
}

// Ensure the browser shuts down on process exit signals.
function setupGracefulShutdown() {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[saveqart] ${signal} received, closing browser…`);
    await closeBrowser();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

setupGracefulShutdown();

module.exports = { getBrowser, closeBrowser, newLocatedPage, waitForAny, waitForProducts, createLimiter, USER_AGENT };
