# Contributing

Termix Mobile is the iOS and Android app for [Termix](https://github.com/Termix-SSH/Termix), self-hosted, plugin-based server management.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) (built with v24)
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [Git](https://git-scm.com/downloads)

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/Termix-SSH/Mobile
   ```
2. Install the dependencies:
   ```sh
   npm install
   ```

## Running the development server

```sh
npm run start
```

This starts the Expo development server. Open it in Expo Go or a development build, and sign in to a Termix server. If you do not have one, see the [install docs](https://docs.termix.site/install).

## Theme and icons

Theme colors in `src/constants/theme.ts` are copied from the [Classic Themes](https://github.com/Termix-SSH/Plugin-Classic-Themes) plugin. Change them there first, then here. `npm run verify:theme` checks the set is complete.

Every app icon, splash and status bar icon is built from `assets/brand/logo.svg`. After changing the logo or `scripts/icon-spec.cjs`, run:

```sh
npm run icons
npm run verify:app-icons
```

## Making a change

1. Fork the [repo](https://github.com/Termix-SSH/Mobile).
2. Create a branch:
   ```sh
   git checkout -b feature/my-new-feature
   ```
3. Make your changes.
4. Commit your changes:
   ```sh
   git commit -m "feat: add my new feature"
   ```
5. Push to your fork:
   ```sh
   git push origin feature/my-new-feature
   ```
6. Open a pull request with a clear description.

## Support

Bugs and ideas for the mobile app go in [this repo](https://github.com/Termix-SSH/Mobile/issues/new/choose). Add as much detail as you can, in English if possible. You can also ask in the [Discord](https://discord.gg/jVQGdvHDrf) server.
