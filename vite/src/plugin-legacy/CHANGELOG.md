# [1.4.0](https://github.com/vitejs/vite/compare/plugin-legacy@1.3.4...plugin-legacy@1.4.0) (2021-05-17)


### Bug Fixes

* **plugin-legacy:** turn off babel loose mode ([#3406](https://github.com/vitejs/vite/issues/3406)) ([5348c02](https://github.com/vitejs/vite/commit/5348c02f58bde36c412dbfe36c3ad37772bf83e5))
* restore dynamic-import-polyfill ([#3434](https://github.com/vitejs/vite/issues/3434)) ([4112c5d](https://github.com/vitejs/vite/commit/4112c5d103673b83c50d446096086617dfaac5a3))



## [1.3.4](https://github.com/vitejs/vite/compare/plugin-legacy@1.3.3...plugin-legacy@1.3.4) (2021-05-11)


### Bug Fixes

* **plugin-legacy:** move polyfills in plugin post, fixes [#2786](https://github.com/vitejs/vite/issues/2786) and [#2781](https://github.com/vitejs/vite/issues/2781) ([#3023](https://github.com/vitejs/vite/issues/3023)) ([43150e3](https://github.com/vitejs/vite/commit/43150e352d164744e2fda766927053439bdf7db9))
* **plugin-legacy:** require Vite 2.0.0 final ([#3265](https://github.com/vitejs/vite/issues/3265)) ([e395dee](https://github.com/vitejs/vite/commit/e395deeb0f11ebb1bcebe69233adebaad10f77eb))



## [1.3.3](https://github.com/vitejs/vite/compare/plugin-legacy@1.3.2...plugin-legacy@1.3.3) (2021-05-03)


### Bug Fixes

* **plugin-legacy:** correct log level to error ([#3241](https://github.com/vitejs/vite/issues/3241)) ([474fe9a](https://github.com/vitejs/vite/commit/474fe9a3abbdf4845447eaab821d2ba51fda6207))
* ignore babelrc in legacy plugin ([#2801](https://github.com/vitejs/vite/issues/2801)) ([d466ad0](https://github.com/vitejs/vite/commit/d466ad0a095859a895fd4cb85f425ad4c4583e4e))



## [1.3.2](https://github.com/vitejs/vite/compare/plugin-legacy@1.3.1...plugin-legacy@1.3.2) (2021-03-27)


### Bug Fixes

* typo in plugin-legacy ([#2651](https://github.com/vitejs/vite/issues/2651)) ([9a2ce75](https://github.com/vitejs/vite/commit/9a2ce7580772cb783a9f8fda7e45e4a9adacbec2))



## [1.3.1](https://github.com/vitejs/vite/compare/plugin-legacy@1.3.0...plugin-legacy@1.3.1) (2021-02-15)


### Bug Fixes

* **plugin-legacy:** prevent constant folding for import.meta.env.LEGACY ([bace724](https://github.com/vitejs/vite/commit/bace7244e776b3f4c9dd7e3ff1885df668cbcb87)), closes [#1999](https://github.com/vitejs/vite/issues/1999)
* **plugin-legacy:** use correct string length in legacy env replacement ([#2015](https://github.com/vitejs/vite/issues/2015)) ([7f48086](https://github.com/vitejs/vite/commit/7f4808634f57ca8f4be3b455cc4fb8016acdc4fd))



# [1.3.0](https://github.com/vitejs/vite/compare/plugin-legacy@1.2.3...plugin-legacy@1.3.0) (2021-02-11)


### Features

* **plugin-legacy:** inject import.meta.env.LEGACY ([416f190](https://github.com/vitejs/vite/commit/416f190aa92f06a06f3ded403fb1e4cb8729256d))



## [1.2.3](https://github.com/vitejs/vite/compare/plugin-legacy@1.2.2...plugin-legacy@1.2.3) (2021-02-01)


### Features

* **plugin-legacy:** use compact output when transpiling legacy chunks ([045e519](https://github.com/vitejs/vite/commit/045e519d51fbce94bddb60793e9e99311acc5aa2)), closes [#1828](https://github.com/vitejs/vite/issues/1828)



## [1.2.2](https://github.com/vitejs/vite/compare/plugin-legacy@1.2.1...plugin-legacy@1.2.2) (2021-01-25)


### Bug Fixes

* **plugin-legacy:** throw error when using esbuild minify with legacy plugin ([8fb2511](https://github.com/vitejs/vite/commit/8fb2511a02c163d85f60dfab0bef104756768e35))


### Features

* default vendor chunk splitting ([f6b58a0](https://github.com/vitejs/vite/commit/f6b58a0f535b1c26f9c1dfda74c28c685402c3c9))
* support `base` option during dev, deprecate `build.base` ([#1556](https://github.com/vitejs/vite/issues/1556)) ([809d4bd](https://github.com/vitejs/vite/commit/809d4bd3bf62d3bc6b35f182178922d2ab2175f1))



## [1.2.1](https://github.com/vitejs/vite/compare/plugin-legacy@1.2.0...plugin-legacy@1.2.1) (2021-01-14)


### Bug Fixes

* **plugin-legacy:** respect config.build.assetsDir ([#1532](https://github.com/vitejs/vite/issues/1532)) ([3e7ad3f](https://github.com/vitejs/vite/commit/3e7ad3fa26a6149b44b2e522648cbda1009e4888)), closes [#1530](https://github.com/vitejs/vite/issues/1530)



# [1.2.0](https://github.com/vitejs/vite/compare/plugin-legacy@1.1.1...plugin-legacy@1.2.0) (2021-01-11)


### Bug Fixes

* **plugin-html:** typo in the Safari 10 nomodule snippet ([#1483](https://github.com/vitejs/vite/issues/1483)) ([e5576c3](https://github.com/vitejs/vite/commit/e5576c32c08214766c8bac5458dfcad8301d3a1a))


### Features

* **plugin-legacy:** support additionalLegacyPolyfills ([ca25896](https://github.com/vitejs/vite/commit/ca258962957c32df0196f30267c3d77b544aacbd)), closes [#1475](https://github.com/vitejs/vite/issues/1475)



## [1.1.1](https://github.com/vitejs/vite/compare/plugin-legacy@1.1.0...plugin-legacy@1.1.1) (2021-01-09)


### Bug Fixes

* **plugin-legacy:** add `index.d.ts` at publish ([#1457](https://github.com/vitejs/vite/issues/1457)) ([dce2456](https://github.com/vitejs/vite/commit/dce245629651edab9719127deaf07ecfbcf20c5f))



# [1.1.0](https://github.com/vitejs/vite/compare/plugin-legacy@1.0.1...plugin-legacy@1.1.0) (2021-01-07)


### Features

* use constant inline script + provide CSP hashes ([72107cd](https://github.com/vitejs/vite/commit/72107cdcdb7241e9fadd67528abb14f54b1c901d))



## [1.0.1](https://github.com/vitejs/vite/compare/plugin-legacy@1.0.0...plugin-legacy@1.0.1) (2021-01-07)


### Bug Fixes

* **plugin-legacy:** avoid esbuild transform on legacy chunks ([7734105](https://github.com/vitejs/vite/commit/7734105093c6dabf64da6bfc11486aa9ac62efea))
* add promise polyfill if not used in bundle ([b72db4e](https://github.com/vitejs/vite/commit/b72db4e3ec5ca8974ea2f1913d5611f73c0978b5))


### Performance Improvements

* use @babel/standalone + lazy load ([b2f98fb](https://github.com/vitejs/vite/commit/b2f98fba0215ef171af2abc62e3aefc35f00d168))



# 1.0.0 (2021-01-07)


### Features

* **plugin-legacy:** @vitejs/plugin-legacy ([8c34870](https://github.com/vitejs/vite/commit/8c34870040f8c2f4be7d00245a3683f9e64d894e))



