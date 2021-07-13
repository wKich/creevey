# 📸+👦🏼 [Creevey](https://harrypotter.fandom.com/wiki/Colin_Creevey)

Cross-browser screenshot testing tool for [Storybook](https://storybook.js.org/) with fancy UI Runner.

[![Creevey downloads](https://img.shields.io/npm/dt/creevey)](https://www.npmjs.com/package/creevey)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

![Creevey Demo](https://user-images.githubusercontent.com/6397708/100863723-cd6b8500-34b6-11eb-94e1-849590bc8066.gif)

## Core features

- 📚 Integrates with Storybook
- 📜 Uses stories as tests
- ✏️ Allows write interaction tests
- ✨ Has fancy UI Runner
- 🐳 Supports Docker
- ⚔️ Cross-browsers testing
- 🔥 Tests hot-reloading
- ⚙️ CI Ready

It named after [Colin Creevey](https://harrypotter.fandom.com/wiki/Colin_Creevey) character from the Harry Potter universe.

## Contents

- [Pre-requisites](#pre-requisites)
- [How to Start](#how-to-start)
- [Comparison with other tools](#comparison-with-other-tools)
- [Config/Options](docs/config.md)
- [Examples](https://github.com/wKich/creevey-examples)
- Advanced usage
  - [Write tests](docs/tests.md)
  - [Use your Selenium Grid (BrowserStack/SauceLabs/etc)](docs/grid.md)
- [Future plans](#future-plans)
- [Known issues](#known-issues)
- [Used by](#used-by)

## Pre-requisites

- Make sure you have installed [Docker](https://www.docker.com/products/docker-desktop). But if you going to use your own separate Selenium Grid, you don't need `Docker`.

## How to start

- Install `creevey` package

```bash
yarn add -D creevey
```

- Add addon `creevey` into your storybook config

```js
// .storybook/main.js
module.exports = {
  stories: [
    /* ... */
  ],
  addons: [
    /* ... */
    'creevey',
  ],
};
```

- Start storybook and then start Creevey UI Runner in separate terminal. (To start tests from CLI, run Creevey without `--ui` flag)

```bash
yarn start-storybook -p 6006
yarn creevey --ui
```

And that's it.

**NOTE:** In first run you may noticed, that all your tests are failing, it because you don't have source screenshot images yet. If you think, that all images are acceptable, you may approve them all in one command `yarn creevey --update`.

**NOTE:** Creevey captures screenshot of the `#root` element and sometimes you need to capture a whole browser viewport. To achieve this you could define `captureElement` Creevey parameter for story or kind. Or you may pass any different css selector.

```tsx
// stories/MyModal.stories.tsx

// NOTE: Define parameter for all stories
export default {
  title: 'MyModal',
  parameters: { creevey: { captureElement: null } },
};

// NOTE: Or define it for specific one

export const MyModalStory = () => <MyModal />;
MyModalStory.parameters = { creevey: { captureElement: null } };
```

## Comparison with other tools

| Features\Tools              | Creevey            | Loki               | Storyshots         | Hermione           | BackstopJS         | Percy/Happo        | Chromatic          |
| --------------------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| Easy-to-Setup               | :heavy_check_mark: | :heavy_check_mark: | :warning:          | :no_entry:         | :no_entry:         | :heavy_check_mark: | :heavy_check_mark: |
| Storybook Support           | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :no_entry:         | :no_entry:         | :heavy_check_mark: | :heavy_check_mark: |
| Run tests from Storybook UI | :heavy_check_mark: | :no_entry:         | :no_entry:         | :no_entry:         | :no_entry:         | :no_entry:         | :no_entry:         |
| Cross-browser               | :heavy_check_mark: | :warning:          | :no_entry:         | :heavy_check_mark: | :no_entry:         | :heavy_check_mark: | :heavy_check_mark: |
| Test Interaction            | :heavy_check_mark: | :no_entry:         | :warning:          | :heavy_check_mark: | :heavy_check_mark: | :no_entry:         | :no_entry:         |
| UI Test Runner              | :heavy_check_mark: | :no_entry:         | :no_entry:         | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: | :heavy_check_mark: |
| Built-in Docker             | :heavy_check_mark: | :heavy_check_mark: | :no_entry:         | :no_entry:         | :heavy_check_mark: | :warning:          | :warning:          |
| Tests hot-reload            | :heavy_check_mark: | :no_entry:         | :no_entry:         | :heavy_check_mark: | :no_entry:         | :no_entry:         | :no_entry:         |
| OSS/SaaS                    | OSS                | OSS                | OSS                | OSS                | OSS                | SaaS               | SaaS               |

## Future plans

- Allow use different webdrivers not only `selenium`, but also `puppeteer` or `playwright`.
- Add ability to ignore elements.
- Allow to define different viewport sizes for specific stories or capture story with different args.
- And more, check [TODO](TODO.md) for more details. Also feel free to ask about feature that you want

## Known issues

### Creevey is trying to build storybook but fail or tests don't work

This might happens because Creevey patches storybook webpack config and build nodejs bundle with stories meta information. And in some cases Creevey couldn't properly remove all unnecessary code cause of side-effects in stories files or you create stories dynamically. Try to rewrite such places. If it still doesn't help, [send to me](mailto:creevey@kich.dev) bundle that Creevey created (it located in `node_modules/creevey/.cache/creevey/storybook/main.js`)

A little bit later I'll add possibility to run tests without building that bundle, so it fixes this issue.

### Docker-in-Docker

Currently it's not possible to run Creevey in this configuration. I'll fix this in later versions.
If you use `CircleCI` or another CI that use docker to run jobs. Try to configure to use virtual machine executor

**Update** I added support to use local browsers. So it should be possible run Creevey inside docker.
The only issue, that you need to find or build docker image with node, browser and selenium-webdriver. I'll add special images for Creevey later.

### Chrome webdriver + 1px border with border-radius.

This cause to flaky screenshots. Possible solutions:

- Increase threshold ratio in Creevey config `diffOptions: { threshold: 0.1 }`
- Replace border to box-shadow `border: 1px solid red` -> `box-shadow: 0 0 0 1px red`
- Set max retries to more than 5

### You can't directly import `selenium-webdriver` package in story file

Because tests defined in story parameters and `selenium-webdriver` depends on nodejs builtin packages. Storybook may fail to build browser bundle. To avoid import use these workarounds:

- `.findElement(By.css('#root'))` -> `.findElement({ css: '#root' })`
- `.sendKeys(Keys.ENTER)` -> `.sendKeys(this.keys.ENTER)`

## Used by

| [![Whisk](https://raw.githubusercontent.com/wKich/creevey/master/.github/images/whisk.svg)](https://whisk.com/) | [![SKB Kontur](https://kontur.ru/Files/userfiles/image/brandbook/logo-skb-kontur-eng.png)](https://kontur.ru/) | [![ABBYY](https://raw.githubusercontent.com/wKich/creevey/master/.github/images/abbyy.svg)](https://www.abbyy.com/) |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
