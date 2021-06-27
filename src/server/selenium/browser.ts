import { PNG } from 'pngjs';
import { Context, Test, Suite } from 'mocha';
import { Builder, By, WebDriver, Origin, Capabilities, WebElement } from 'selenium-webdriver';
import { Config, BrowserConfig, StoryInput, CreeveyStoryParams, noop, isDefined, StorybookGlobals } from '../../types';
import { subscribeOn } from '../messages';
import { networkInterfaces } from 'os';
import { runSequence, LOCALHOST_REGEXP } from '../utils';
import { PageLoadStrategy } from 'selenium-webdriver/lib/capabilities';
import chalk from 'chalk';
import { isStorybookVersionLessThan } from '../storybook/helpers';

type ElementRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

declare global {
  interface Window {
    __CREEVEY_RESTORE_SCROLL__?: () => void;
    __CREEVEY_UPDATE_GLOBALS__: (globals: StorybookGlobals) => void;
    __CREEVEY_INSERT_IGNORE_STYLES__: (ignoreElements: string[]) => HTMLStyleElement;
    __CREEVEY_REMOVE_IGNORE_STYLES__: (ignoreStyles: HTMLStyleElement) => void;
  }
}

const DOCKER_INTERNAL = 'host.docker.internal';

async function resolveStorybookUrl(storybookUrl: string, checkUrl: (url: string) => Promise<boolean>): Promise<string> {
  const addresses = [DOCKER_INTERNAL].concat(
    ...Object.values(networkInterfaces())
      .filter(isDefined)
      .map((network) => network.filter((info) => info.family == 'IPv4').map((info) => info.address)),
  );
  for (const ip of addresses) {
    const resolvedUrl = storybookUrl.replace(LOCALHOST_REGEXP, ip);
    if (await checkUrl(resolvedUrl)) {
      return resolvedUrl;
    }
  }
  const error = new Error('Please specify `storybookUrl` with IP address that accessible from remote browser');
  error.name = 'ResolveUrlError';
  throw error;
}

async function openUrlAndWaitForPageSource(
  browser: WebDriver,
  url: string,
  predicate: (source: string) => boolean,
): Promise<string> {
  let source = '';
  await browser.get(url);
  do {
    try {
      source = await browser.getPageSource();
    } catch (_) {
      // NOTE: Firefox can raise exception "curContainer.frame.document.documentElement is null"
    }
  } while (predicate(source));
  return source;
}

function getUrlChecker(browser: WebDriver): (url: string) => Promise<boolean> {
  return async (url: string): Promise<boolean> => {
    try {
      // NOTE: Before trying a new url, reset the current one
      await openUrlAndWaitForPageSource(browser, 'about:blank', (source: string) => !source.includes('<body></body>'));
      const source = await openUrlAndWaitForPageSource(
        browser,
        url,
        // NOTE: IE11 can return only `head` without body
        (source: string) => source.length == 0 || !/<body([^>]*>).+<\/body>/s.test(source),
      );
      // NOTE: This is the most optimal way to check if we in storybook or not
      // We don't use any page load strategies except `NONE`
      // because other add significant delay and some of them don't work in earlier chrome versions
      // Browsers always load page successful even it's failed
      // So we just check `#root` element
      return source.includes('<div id="root"></div>');
    } catch (error) {
      return false;
    }
  };
}

function waitForStorybook(browser: WebDriver): Promise<void> {
  return browser.executeAsyncScript(function (callback: () => void): void {
    if (document.readyState == 'complete') return callback();
    window.addEventListener('load', function () {
      callback();
    });
  });
}

async function resetMousePosition(browser: WebDriver): Promise<void> {
  const browserName = (await browser.getCapabilities()).getBrowserName();
  const [browserVersion] =
    (await browser.getCapabilities()).getBrowserVersion()?.split('.') ??
    ((await browser.getCapabilities()).get('version') as string | undefined)?.split('.') ??
    [];

  // NOTE Reset mouse position to support keweb selenium grid browser versions
  if (browserName == 'chrome' && browserVersion == '70') {
    const { top, left, width, height } = await browser.executeScript<ElementRect>(function (): ElementRect {
      const bodyRect = document.body.getBoundingClientRect();

      return {
        top: bodyRect.top,
        left: bodyRect.left,
        width: bodyRect.width,
        height: bodyRect.height,
      };
    });
    // NOTE Bridge mode doesn't support `Origin.VIEWPORT`, move mouse relative
    await browser
      .actions({ bridge: true })
      .move({
        origin: browser.findElement(By.css('body')),
        x: Math.ceil((-1 * width) / 2) - left,
        y: Math.ceil((-1 * height) / 2) - top,
      })
      .perform();
  } else if (browserName == 'firefox' && browserVersion == '61') {
    // NOTE Firefox for some reason moving by 0 x 0 move cursor in bottom left corner :sad:
    await browser.actions().move({ origin: Origin.VIEWPORT, x: 0, y: 1 }).perform();
  } else {
    // NOTE IE don't emit move events until force window focus or connect by RDP on virtual machine
    await browser.actions().move({ origin: Origin.VIEWPORT, x: 0, y: 0 }).perform();
  }
}

async function resizeViewport(browser: WebDriver, viewport: { width: number; height: number }): Promise<void> {
  const windowRect = await browser.manage().window().getRect();
  const { innerWidth, innerHeight } = await browser.executeScript<{ innerWidth: number; innerHeight: number }>(
    function () {
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      };
    },
  );
  const dWidth = windowRect.width - innerWidth;
  const dHeight = windowRect.height - innerHeight;
  await browser
    .manage()
    .window()
    .setRect({
      width: viewport.width + dWidth,
      height: viewport.height + dHeight,
    });
}

const getScrollBarWidth: (browser: WebDriver) => Promise<number> = (() => {
  let scrollBarWidth: number | null = null;

  return async (browser: WebDriver): Promise<number> => {
    if (scrollBarWidth != null) return Promise.resolve(scrollBarWidth);
    scrollBarWidth = await browser.executeScript<number>(function () {
      // eslint-disable-next-line no-var
      var div = document.createElement('div');
      div.innerHTML = 'a'; // NOTE: In IE clientWidth is 0 if this div is empty.
      div.style.overflowY = 'scroll';
      document.body.appendChild(div);
      // eslint-disable-next-line no-var
      var widthDiff = div.offsetWidth - div.clientWidth;
      document.body.removeChild(div);

      return widthDiff;
    });
    return scrollBarWidth;
  };
})();

// NOTE Firefox and Safari take viewport screenshot without scrollbars
async function hasScrollBar(browser: WebDriver): Promise<boolean> {
  const browserName = (await browser.getCapabilities()).getBrowserName();
  const [browserVersion] = (await browser.getCapabilities()).getBrowserVersion()?.split('.') ?? [];

  return (
    browserName != 'Safari' &&
    // NOTE This need to work with keweb selenium grid
    !(browserName == 'firefox' && browserVersion == '61')
  );
}

async function resolveCaptureElement(browser: WebDriver): Promise<string | null> {
  const childrenCount = await browser.executeScript<number>(function () {
    // eslint-disable-next-line no-var
    var root = document.getElementById('root');
    return root ? root.childElementCount : 0;
  });
  if (childrenCount == 0) return null;
  if (childrenCount == 1) return '#root > *';
  return '#root';
}

async function takeCompositeScreenshot(
  browser: WebDriver,
  windowRect: ElementRect,
  elementRect: ElementRect,
): Promise<string> {
  const screens = [];
  const isScreenshotWithoutScrollBar = !(await hasScrollBar(browser));
  const scrollBarWidth = await getScrollBarWidth(browser);
  // NOTE Sometimes viewport has been scrolled somewhere
  const normalizedElementRect = {
    left: elementRect.left - windowRect.left,
    right: elementRect.left + elementRect.width - windowRect.left,
    top: elementRect.top - windowRect.top,
    bottom: elementRect.top + elementRect.height - windowRect.top,
  };
  const isFitHorizontally = windowRect.width >= elementRect.width + normalizedElementRect.left;
  const isFitVertically = windowRect.height >= elementRect.height + normalizedElementRect.top;
  const viewportWidth = windowRect.width - (isFitVertically ? 0 : scrollBarWidth);
  const viewportHeight = windowRect.height - (isFitHorizontally ? 0 : scrollBarWidth);
  const cols = Math.ceil(elementRect.width / viewportWidth);
  const rows = Math.ceil(elementRect.height / viewportHeight);
  const xOffset = Math.round(
    isFitHorizontally ? normalizedElementRect.left : Math.max(0, cols * viewportWidth - elementRect.width),
  );
  const yOffset = Math.round(
    isFitVertically ? normalizedElementRect.top : Math.max(0, rows * viewportHeight - elementRect.height),
  );

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const dx = Math.min(
        viewportWidth * col + normalizedElementRect.left,
        Math.max(0, normalizedElementRect.right - viewportWidth),
      );
      const dy = Math.min(
        viewportHeight * row + normalizedElementRect.top,
        Math.max(0, normalizedElementRect.bottom - viewportHeight),
      );
      await browser.executeScript(
        function (x: number, y: number) {
          window.scrollTo(x, y);
        },
        dx,
        dy,
      );
      screens.push(await browser.takeScreenshot());
    }
  }

  const images = screens.map((s) => Buffer.from(s, 'base64')).map((b) => PNG.sync.read(b));
  const compositeImage = new PNG({ width: Math.round(elementRect.width), height: Math.round(elementRect.height) });

  for (let y = 0; y < compositeImage.height; y += 1) {
    for (let x = 0; x < compositeImage.width; x += 1) {
      const col = Math.floor(x / viewportWidth);
      const row = Math.floor(y / viewportHeight);
      const isLastCol = cols - col == 1;
      const isLastRow = rows - row == 1;
      const scrollOffset = isFitVertically || isScreenshotWithoutScrollBar ? 0 : scrollBarWidth;
      const i = (y * compositeImage.width + x) * 4;
      const j =
        // NOTE compositeImage(x, y) => image(x, y)
        ((y % viewportHeight) * (viewportWidth + scrollOffset) + (x % viewportWidth)) * 4 +
        // NOTE Offset for last row/col image
        (isLastRow ? yOffset * (viewportWidth + scrollOffset) * 4 : 0) +
        (isLastCol ? xOffset * 4 : 0);
      const image = images[row * cols + col];
      compositeImage.data[i + 0] = image.data[j + 0];
      compositeImage.data[i + 1] = image.data[j + 1];
      compositeImage.data[i + 2] = image.data[j + 2];
      compositeImage.data[i + 3] = image.data[j + 3];
    }
  }
  return PNG.sync.write(compositeImage).toString('base64');
}

async function takeScreenshot(
  browser: WebDriver,
  captureElement?: string | null,
  ignoreElements?: string | string[] | null,
): Promise<string> {
  let screenshot: string;

  const ignoreStyles = await insertIgnoreStyles(browser, ignoreElements);

  try {
    if (!captureElement) {
      screenshot = await browser.takeScreenshot();
    } else {
      const rects = await browser.executeScript<{ elementRect: ElementRect; windowRect: ElementRect } | undefined>(
        function (selector: string): { elementRect: ElementRect; windowRect: ElementRect } | undefined {
          window.scrollTo(0, 0); // TODO Maybe we should remove same code from `resetMousePosition`
          // eslint-disable-next-line no-var
          var element = document.querySelector(selector);
          if (!element) return;

          // eslint-disable-next-line no-var
          var elementRect = element.getBoundingClientRect();

          return {
            elementRect: {
              top: elementRect.top,
              left: elementRect.left,
              width: elementRect.width,
              height: elementRect.height,
            },
            windowRect: {
              top: Math.round(window.scrollY || window.pageYOffset),
              left: Math.round(window.scrollX || window.pageXOffset),
              width: window.innerWidth,
              height: window.innerHeight,
            },
          };
        },
        captureElement,
      );
      const { elementRect, windowRect } = rects ?? {};

      if (!elementRect || !windowRect) throw new Error(`Couldn't find element with selector: '${captureElement}'`);

      const isFitIntoViewport =
        elementRect.width + elementRect.left <= windowRect.width &&
        elementRect.height + elementRect.top <= windowRect.height;

      screenshot = isFitIntoViewport
        ? await browser.findElement(By.css(captureElement)).takeScreenshot()
        : // TODO pointer-events: none, need to research
          await takeCompositeScreenshot(browser, windowRect, elementRect);
    }
  } finally {
    await removeIgnoreStyles(browser, ignoreStyles);
  }

  return screenshot;
}

async function selectStory(
  browser: WebDriver,
  { id, kind, name }: { id: string; kind: string; name: string },
  waitForReady = false,
): Promise<void> {
  const errorMessage = await browser.executeAsyncScript<string | undefined>(
    function (id: string, kind: string, name: string, shouldWaitForReady: boolean, callback: (error?: string) => void) {
      if (typeof window.__CREEVEY_SELECT_STORY__ == 'undefined') {
        return callback(
          "Creevey can't switch story. This may happened if forget to add `creevey` addon to your storybook config, or storybook not loaded in browser due syntax error.",
        );
      }
      window.__CREEVEY_SELECT_STORY__(id, kind, name, shouldWaitForReady, callback);
    },
    id,
    kind,
    name,
    waitForReady,
  );
  if (errorMessage) throw new Error(errorMessage);
}

export async function updateStorybookGlobals(browser: WebDriver, globals: StorybookGlobals): Promise<void> {
  if (isStorybookVersionLessThan(6)) {
    console.log(
      chalk`[{yellow WARN}{gray :${process.pid}}] Globals are not supported by Storybook versions less than 6`,
    );
    return;
  }
  await browser.executeScript(function (globals: StorybookGlobals) {
    window.__CREEVEY_UPDATE_GLOBALS__(globals);
  }, globals);
}

function appendIframePath(url: string): string {
  return `${url.replace(/\/$/, '')}/iframe.html`;
}

async function openStorybookPage(
  browser: WebDriver,
  storybookUrl: string,
  resolver?: () => Promise<string>,
): Promise<void> {
  if (!LOCALHOST_REGEXP.test(storybookUrl)) {
    return browser?.get(appendIframePath(storybookUrl));
  }

  try {
    if (resolver) {
      return browser.get(appendIframePath(await resolver()));
    }
    // NOTE: getUrlChecker already calls `browser.get` so we don't need another one
    return void (await resolveStorybookUrl(appendIframePath(storybookUrl), getUrlChecker(browser)));
  } catch (error) {
    console.log(
      chalk`[{yellow WARN}{grey :${process.pid}}]`,
      'Failed to resolve storybook URL',
      error instanceof Error ? error.message : '',
    );
    throw error;
  }
}

export async function getBrowser(config: Config, browserConfig: BrowserConfig): Promise<WebDriver | null> {
  const {
    gridUrl = config.gridUrl,
    storybookUrl: address = config.storybookUrl,
    limit,
    viewport,
    _storybookGlobals,
    ...userCapabilities
  } = browserConfig;
  void limit;
  const realAddress = address;
  let browser: WebDriver | null = null;
  let shuttingDown = false;

  // TODO Define some capabilities explicitly and define typings
  const capabilities = new Capabilities(userCapabilities);
  capabilities.setPageLoadStrategy(PageLoadStrategy.NONE);

  subscribeOn('shutdown', () => {
    shuttingDown = true;
    browser?.quit().catch(noop);
    browser = null;
  });

  try {
    browser = await new Builder().usingServer(gridUrl).withCapabilities(capabilities).build();

    await runSequence(
      [
        () => browser?.manage().setTimeouts({ pageLoad: 5000, script: 60000 }),
        () => viewport && browser && resizeViewport(browser, viewport),
        () => browser && openStorybookPage(browser, realAddress, config.resolveStorybookUrl),
        () => browser && waitForStorybook(browser),
      ],
      () => !shuttingDown,
    );
  } catch (originalError) {
    if (shuttingDown) {
      browser?.quit().catch(noop);
      return null;
    }
    if (originalError instanceof Error && originalError.name == 'ResolveUrlError') throw originalError;
    const error = new Error(`Can't load storybook root page by URL ${(await browser?.getCurrentUrl()) ?? realAddress}`);
    if (originalError instanceof Error) error.stack = originalError.stack;
    throw error;
  }

  if (_storybookGlobals) {
    await updateStorybookGlobals(browser, _storybookGlobals);
  }

  return browser;
}

export async function switchStory(this: Context): Promise<void> {
  let testOrSuite: Test | Suite | undefined = this.currentTest;

  if (!testOrSuite) throw new Error("Can't switch story, because test context doesn't have 'currentTest' field");

  this.testScope.length = 0;
  this.testScope.push(this.browserName);
  while (testOrSuite?.title) {
    this.testScope.push(testOrSuite.title);
    testOrSuite = testOrSuite.parent;
  }
  const story = this.currentTest?.ctx?.story as StoryInput | undefined;

  if (!story) throw new Error(`Current test '${this.testScope.join('/')}' context doesn't have 'story' field`);

  const { id, kind, name, parameters } = story;
  const creeveyParams = (parameters.creevey ?? {}) as CreeveyStoryParams;
  const { waitForReady, ignoreElements } = creeveyParams;

  await resetMousePosition(this.browser);
  await selectStory(this.browser, { id, kind, name }, waitForReady);

  const { captureElement = await resolveCaptureElement(this.browser) } = creeveyParams;

  if (captureElement)
    Object.defineProperty(this, 'captureElement', {
      enumerable: true,
      configurable: true,
      get: () => this.browser.findElement(By.css(captureElement)),
    });
  else Reflect.deleteProperty(this, 'captureElement');

  this.takeScreenshot = () => takeScreenshot(this.browser, captureElement, ignoreElements);

  this.testScope.reverse();
}

async function insertIgnoreStyles(
  browser: WebDriver,
  ignoreElements?: string | string[] | null,
): Promise<WebElement | null> {
  const ignoreSelectors = Array.prototype.concat(ignoreElements).filter(Boolean);
  if (!ignoreSelectors.length) return null;

  return await browser.executeScript(function (ignoreSelectors: string[]) {
    return window.__CREEVEY_INSERT_IGNORE_STYLES__(ignoreSelectors);
  }, ignoreSelectors);
}

async function removeIgnoreStyles(browser: WebDriver, ignoreStyles: WebElement | null): Promise<void> {
  if (ignoreStyles) {
    await browser.executeScript(function (ignoreStyles: HTMLStyleElement) {
      window.__CREEVEY_REMOVE_IGNORE_STYLES__(ignoreStyles);
    }, ignoreStyles);
  }
}
