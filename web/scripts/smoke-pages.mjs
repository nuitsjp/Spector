const RETRY_COUNT = 12;
const RETRY_DELAY_MILLISECONDS = 5_000;
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

const targetArgument =
  globalThis.process.argv[2] ?? globalThis.process.env.PAGES_URL;

if (targetArgument === undefined) {
  throw new Error('Usage: node web/scripts/smoke-pages.mjs <GitHub Pages URL>');
}

const targetUrl = new globalThis.URL(targetArgument);
if (!['http:', 'https:'].includes(targetUrl.protocol)) {
  throw new Error('The GitHub Pages URL must use HTTP or HTTPS.');
}

const sleep = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

const fetchText = async (url) => {
  const response = await globalThis.fetch(url, {
    cache: 'no-store',
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) {
    throw new Error(`${url.href} returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length === 0) {
    throw new Error(`${url.href} returned an empty response.`);
  }
  return text;
};

const readAttribute = (tag, name) => {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'),
  );
  return match?.[1] ?? null;
};

const extractPageAssets = (html, pageUrl) => {
  const scriptUrls = (html.match(/<script\b[^>]*>/giu) ?? [])
    .map((tag) => readAttribute(tag, 'src'))
    .filter((value) => value !== null)
    .map((value) => new globalThis.URL(value, pageUrl));
  const stylesheetUrls = (html.match(/<link\b[^>]*>/giu) ?? [])
    .filter((tag) =>
      (readAttribute(tag, 'rel') ?? '')
        .toLowerCase()
        .split(/\s+/u)
        .includes('stylesheet'),
    )
    .map((tag) => readAttribute(tag, 'href'))
    .filter((value) => value !== null)
    .map((value) => new globalThis.URL(value, pageUrl));

  if (scriptUrls.length === 0 || stylesheetUrls.length === 0) {
    throw new Error(
      'The deployed page does not reference both JavaScript and CSS.',
    );
  }
  return { scriptUrls, stylesheetUrls };
};

const extractAudioAssets = (javascript, scriptUrl) => {
  const references = [
    ...javascript.matchAll(
      /["'`]([^"'`]*(?:capture\.worklet|recorder\.worker)[^"'`]*\.js)["'`]/giu,
    ),
  ].map((match) => new globalThis.URL(match[1], scriptUrl));

  if (!references.some((url) => url.pathname.includes('capture.worklet-'))) {
    throw new Error(
      'The main JavaScript does not reference the AudioWorklet asset.',
    );
  }
  if (!references.some((url) => url.pathname.includes('recorder.worker-'))) {
    throw new Error(
      'The main JavaScript does not reference the recorder Worker asset.',
    );
  }
  return [...new Map(references.map((url) => [url.href, url])).values()];
};

const smokeTest = async () => {
  const cacheBustedPageUrl = new globalThis.URL(targetUrl);
  cacheBustedPageUrl.searchParams.set(
    'deployment-smoke',
    Date.now().toString(),
  );
  const html = await fetchText(cacheBustedPageUrl);
  if (
    !/<title>Spector<\/title>/iu.test(html) ||
    !/id=["']root["']/iu.test(html)
  ) {
    throw new Error('The deployed page is not the Spector top page.');
  }

  const { scriptUrls, stylesheetUrls } = extractPageAssets(html, targetUrl);
  const javascriptFiles = await Promise.all(
    scriptUrls.map(async (url) => ({ url, text: await fetchText(url) })),
  );
  await Promise.all(stylesheetUrls.map((url) => fetchText(url)));

  const audioAssets = javascriptFiles.flatMap(({ url, text }) =>
    extractAudioAssets(text, url),
  );
  await Promise.all(audioAssets.map((url) => fetchText(url)));

  return {
    scripts: scriptUrls.length,
    stylesheets: stylesheetUrls.length,
    audioAssets: audioAssets.length,
  };
};

let lastError;
for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
  try {
    const result = await smokeTest();
    globalThis.console.log(
      `Pages smoke test passed: ${targetUrl.href} (${result.scripts} JS, ${result.stylesheets} CSS, ${result.audioAssets} audio worker assets).`,
    );
    lastError = undefined;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < RETRY_COUNT) {
      globalThis.console.warn(
        `Pages smoke test attempt ${attempt}/${RETRY_COUNT} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(RETRY_DELAY_MILLISECONDS);
    }
  }
}

if (lastError !== undefined) {
  throw lastError;
}
