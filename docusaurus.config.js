// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

// const lastVersion = "v0.47";
const lastVersion = "current";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Explore the SDK",
  tagline: "Cosmos SDK is the world's most popular framework for building application-specific blockchains.",
  url: "https://docs.cosmos.network",
  baseUrl: "/",
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.svg",
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "cosmos",
  projectName: "cosmos-sdk",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          routeBasePath: "/",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: "img/banner.jpg",
      docs: {
        sidebar: {
          autoCollapseCategories: true,
        },
      },
      navbar: {
        title: "Cosmos SDK",
        hideOnScroll: false,
        logo: {
          alt: "Cosmos SDK Logo",
          src: "img/logo-sdk.svg",
          href: "/",
          target: "_self",
        },
        items: [
          {
            to: "/develop/intro/what-is-sdk",
            position: "left",
            label: "Develop",
          },
          {
            to: "/integrate/building-modules/intro",
            position: "left",
            label: "Integrate",
          },
          {
            to: "/user/run-node/keyring",
            position: "left",
            label: "User Guides",
          },
          // {
          //   to: "/",
          //   position: "left",
          //   label: "Vision",
          // },
          {
            href: "http://docsevmos.lucq.fun/",
            html: `<svg width="24" height="24" viewBox="0 0 156 156" fill="none" xmlns="http://www.w3.org/2000/svg" class="github-icon"><circle cx="77.5713" cy="77.5713" fill="#ed4e33" r="77.5713"/><path d="m63.5871 41.5434c-21.1617 8.1368-23.1002 28.975-29.1681 38.7069-6.1398 9.8475-20.2058 15.281-18.2823 20.2997 1.9234 5.018 16.0062-.372 27.1477 2.83 11.0095 3.164 26.3706 17.352 47.5323 9.215 10.7803-4.145 18.5863-12.6765 22.1763-22.7817.386-1.0847-.336-2.2447-1.481-2.3519-.712-.0669-1.395.3064-1.716.9458-3.247 6.4779-8.817 11.8128-16.1066 14.6148-12.0339 4.627-25.2008.994-33.2875-8.1168-1.8366-2.0689-3.4075-4.4241-4.6475-7.027-.3409-.7164-.6651-1.4445-.9525-2.1978-.2891-.7532-.5348-1.5115-.7604-2.2731 6.3604-2.9695 13.7-6.1147 22.0207-9.3135 8.1585-3.1369 15.5834-5.6812 22.1944-7.7166 4.4724-1.376 8.5714-2.5209 12.2724-3.4566.268-.067.532-.1339.794-.1992.56-.1389 1.135.1607 1.342.6997l.004.01c.122.3197.227.6411.34.9625.732 2.074 1.281 4.1697 1.643 6.2704.159.919 1.162 1.4195 1.984.9776 3.038-1.6338 5.817-3.2273 8.3-4.7606 9.254-5.7079 14.384-10.5488 13.331-13.2923-1.051-2.7452-8.097-2.9025-18.787-.9441-3.397.6227-7.164 1.4596-11.223 2.4958-.702.1791-1.412.3649-2.131.5557-3.416.9073-7.0188 1.9467-10.7705 3.1101-6.977 2.1643-14.4621 4.7572-22.1894 7.7283-7.2294 2.7803-14.0811 5.6628-20.3646 8.5352-.0768-12.1909 7.2812-23.7157 19.3151-28.3423 7.2879-2.8021 14.9918-2.5727 21.7332.067.6651.2611 1.4222.0803 1.9085-.4469.7787-.8454.5397-2.1912-.4713-2.7402-9.4186-5.1003-20.9194-6.2084-31.6999-2.0639z" fill="#fff"/></svg>`,
            position: "right",
          },
          {
            href: "https://github.com/cosmos/cosmos-sdk",
            html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="github-icon">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 0.300049C5.4 0.300049 0 5.70005 0 12.3001C0 17.6001 3.4 22.1001 8.2 23.7001C8.8 23.8001 9 23.4001 9 23.1001C9 22.8001 9 22.1001 9 21.1001C5.7 21.8001 5 19.5001 5 19.5001C4.5 18.1001 3.7 17.7001 3.7 17.7001C2.5 17.0001 3.7 17.0001 3.7 17.0001C4.9 17.1001 5.5 18.2001 5.5 18.2001C6.6 20.0001 8.3 19.5001 9 19.2001C9.1 18.4001 9.4 17.9001 9.8 17.6001C7.1 17.3001 4.3 16.3001 4.3 11.7001C4.3 10.4001 4.8 9.30005 5.5 8.50005C5.5 8.10005 5 6.90005 5.7 5.30005C5.7 5.30005 6.7 5.00005 9 6.50005C10 6.20005 11 6.10005 12 6.10005C13 6.10005 14 6.20005 15 6.50005C17.3 4.90005 18.3 5.30005 18.3 5.30005C19 7.00005 18.5 8.20005 18.4 8.50005C19.2 9.30005 19.6 10.4001 19.6 11.7001C19.6 16.3001 16.8 17.3001 14.1 17.6001C14.5 18.0001 14.9 18.7001 14.9 19.8001C14.9 21.4001 14.9 22.7001 14.9 23.1001C14.9 23.4001 15.1 23.8001 15.7 23.7001C20.5 22.1001 23.9 17.6001 23.9 12.3001C24 5.70005 18.6 0.300049 12 0.300049Z" fill="currentColor"/>
            </svg>
            `,
            position: "right",
          },
          {
            type: "docsVersionDropdown",
            position: "right",
            dropdownActiveClassDisabled: true,
          },
        ],
      },
      footer: {
        links: [
          {
            items: [
              {
                html: `<a href="https://cosmos.network"><img src="/img/logo-bw.svg" alt="Cosmos Logo"></a>`,
              },
            ],
          },
          {
            title: "Documentation",
            items: [
              {
                label: "Cosmos Hub",
                href: "https://hub.cosmos.network",
              },
              {
                label: "CometBFT",
                href: "https://docs.cometbft.com",
              },
              {
                label: "IBC Go",
                href: "https://ibc.cosmos.network",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Blog",
                href: "https://blog.cosmos.network",
              },
              {
                label: "Forum",
                href: "https://forum.cosmos.network",
              },
              {
                label: "Discord",
                href: "https://discord.gg/cosmosnetwork",
              },
              {
                label: "Reddit",
                href: "https://reddit.com/r/cosmosnetwork",
              },
            ],
          },
          {
            title: "Social",
            items: [
              {
                label: "Discord",
                href: "https://discord.gg/cosmosnetwork",
              },
              {
                label: "Twitter",
                href: "https://twitter.com/cosmos",
              },
              {
                label: "Youtube",
                href: "https://www.youtube.com/c/CosmosProject",
              },
              {
                label: "Telegram",
                href: "https://t.me/cosmosproject",
              },
            ],
          },
        ],
        copyright: `<p>The development of the Cosmos SDK is led primarily by <a href="https://interchain.io/ecosystem">Interchain Core Teams</a>. Funding for this development comes primarily from the Interchain Foundation, a Swiss non-profit.</p>`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ["protobuf", "go-module"], // https://prismjs.com/#supported-languages
      },
      algolia: {
        appId: "QLS2QSP47E",
        apiKey: "4d9feeb481e3cfef8f91bbc63e090042",
        indexName: "cosmos_network",
        contextualSearch: false,
      },
    }),
  themes: ["@you54f/theme-github-codeblock"],
  plugins: [
    async function myPlugin(context, options) {
      return {
        name: "docusaurus-tailwindcss",
        configurePostCss(postcssOptions) {
          postcssOptions.plugins.push(require("postcss-import"));
          postcssOptions.plugins.push(require("tailwindcss/nesting"));
          postcssOptions.plugins.push(require("tailwindcss"));
          postcssOptions.plugins.push(require("autoprefixer"));
          return postcssOptions;
        },
      };
    },
    [
      "@docusaurus/plugin-google-analytics",
      {
        trackingID: "UA-51029217-2",
        anonymizeIP: true,
      },
    ],
  ],
};

module.exports = config;
