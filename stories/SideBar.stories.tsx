import React, { ReactNode } from 'react';
import { StoryFn } from '@storybook/addons';
import { CreeveyContext } from '../src/client/web/CreeveyContext';
import { SideBar } from '../src/client/web/CreeveyView/SideBar';
import { SideBarHeader } from '../src/client/web/CreeveyView/SideBar/SideBarHeader';
import { treeifyTests, checkSuite, getTestByPath } from '../src/client/shared/helpers';
import { noop, CreeveySuite, CreeveyStatus, isDefined, isTest, CreeveyStory, CreeveyStoryParams } from '../src/types';
import { ensure, styled, ThemeProvider, themes } from '@storybook/theming';
import { Story } from '@storybook/react';

function openSuites(suite: CreeveySuite): CreeveySuite {
  suite.opened = true;
  Object.values(suite.children)
    .filter(isDefined)
    .forEach((suite) => isTest(suite) || openSuites(suite));

  return suite;
}

const simpleTests: () => CreeveyStatus['tests'] = () => ({
  1: { id: '1', browser: 'empty', storyPath: ['root', 'simple'], storyId: '', skip: false },
  2: {
    id: '2',
    browser: 'hasResult',
    storyPath: ['root', 'simple'],
    storyId: '',
    skip: false,
    results: [{ status: 'success' }],
  },
  3: { id: '3', browser: 'skipped', storyPath: ['root', 'simple'], storyId: '', skip: true },
  4: { id: '4', browser: 'empty', storyPath: ['root', 'skipped'], storyId: '', skip: true },
  5: {
    id: '5',
    browser: 'Storybook’s Component Story Format (CSF) is the recommended way to write stories',
    storyPath: ['root', 'simple'],
    storyId: '',
    skip: false,
    results: [{ status: 'success' }],
  },
});
const statusTests: () => CreeveyStatus['tests'] = () => ({
  5: { id: '5', browser: 'success', storyPath: ['root', 'success'], storyId: '', skip: false, status: 'success' },
  6: { id: '6', browser: 'empty', storyPath: ['root', 'success'], storyId: '', skip: false },

  7: { id: '7', browser: 'failed', storyPath: ['root', 'failed'], storyId: '', skip: false, status: 'failed' },
  8: { id: '8', browser: 'success', storyPath: ['root', 'failed'], storyId: '', skip: false, status: 'success' },

  9: { id: '9', browser: 'pending', storyPath: ['root', 'pending'], storyId: '', skip: false, status: 'pending' },
  10: { id: '10', browser: 'failed', storyPath: ['root', 'pending'], storyId: '', skip: false, status: 'failed' },

  11: {
    id: '11',
    browser: 'running',
    storyPath: ['root', 'running with very long name'],
    storyId: '',
    skip: false,
    status: 'running',
  },
  12: { id: '12', browser: 'pending', storyPath: ['root', 'running'], storyId: '', skip: false, status: 'pending' },
});

const HeaderContainer = styled.div({
  width: 300,
});

const headerDecorator = (storyFn: StoryFn<ReactNode>): JSX.Element => <HeaderContainer>{storyFn()}</HeaderContainer>;

export default {
  title: 'SideBar',
  decorators: [
    (Story: React.ComponentClass): JSX.Element => (
      <ThemeProvider theme={ensure(themes.light)}>
        <CreeveyContext.Provider
          value={{
            isReport: false,
            isRunning: false,
            onStart: noop,
            onStop: noop,
            onSuiteOpen: noop,
            onSuiteToggle: noop,
          }}
        >
          <Story />
        </CreeveyContext.Provider>
      </ThemeProvider>
    ),
  ],
};

export const HeaderStopped = (): JSX.Element => (
  <SideBarHeader
    testsStatus={{ pendingCount: 0, successCount: 1, failedCount: 2, skippedCount: 3 }}
    filter={{ status: null, subStrings: [] }}
    onFilterChange={noop}
    onStart={noop}
    onStop={noop}
  />
);
HeaderStopped.decorators = [headerDecorator];

export const HeaderRunning = (): JSX.Element => (
  <CreeveyContext.Provider
    value={{
      isReport: false,
      isRunning: true,
      onStart: noop,
      onStop: noop,
      onSuiteOpen: noop,
      onSuiteToggle: noop,
    }}
  >
    <SideBarHeader
      testsStatus={{ pendingCount: 1, successCount: 2, failedCount: 3, skippedCount: 4 }}
      filter={{ status: null, subStrings: [] }}
      onFilterChange={noop}
      onStart={noop}
      onStop={noop}
    />
  </CreeveyContext.Provider>
);
HeaderRunning.decorators = [headerDecorator];

export const HeaderDisabled = (): JSX.Element => (
  <SideBarHeader
    testsStatus={{ pendingCount: 0, successCount: 1, failedCount: 2, skippedCount: 3 }}
    filter={{ status: null, subStrings: [] }}
    onFilterChange={noop}
    onStart={noop}
    onStop={noop}
    canStart={false}
  />
);
HeaderDisabled.decorators = [headerDecorator];

export const SimpleSideBar: Story & CreeveyStory = () => {
  const simpleSuites = openSuites(treeifyTests(simpleTests()));
  const testPath = ['root', 'simple', 'hasResult'];

  checkSuite(simpleSuites, testPath, false);

  return (
    <SideBar
      rootSuite={simpleSuites}
      openedTest={getTestByPath(simpleSuites, testPath)}
      onOpenTest={noop}
      filter={{ status: null, subStrings: [] }}
      setFilter={noop}
    />
  );
};

SimpleSideBar.parameters = {
  creevey: {
    tests: {
      ...Array(1000)
        .fill(null)
        .reduce(
          (acc: CreeveyStoryParams['tests'], _, i) => ({
            ...acc,
            [`test_${i}`]: async function () {
              await this.expect(await this.takeScreenshot()).to.matchImage();
            },
          }),
          {},
        ),
      async hover() {
        await this.browser
          .actions()
          .move({ origin: this.browser.findElement({ css: '[data-tid="root"]' }) })
          .perform();
        const hover = await this.takeScreenshot();

        await this.expect(hover).to.matchImage();
      },
    },
  },
};

export const StatusSideBar = (): JSX.Element => (
  <SideBar
    rootSuite={openSuites(treeifyTests(statusTests()))}
    openedTest={null}
    onOpenTest={noop}
    filter={{ status: null, subStrings: [] }}
    setFilter={noop}
  />
);
