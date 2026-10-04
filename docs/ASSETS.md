# Runtime assets and provenance

All assets below are included. The renderer makes no request to the old prototype folder. GLBs contain their geometry/materials; the current scene uses no separate external texture images. Scene shaders are in TypeScript.

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `src/frontend/assets/drought-paddock.jpg` | 579557 | `357dff225798fb1851ccaa31e39375e787fb48eb8c11b145f922c5043f6effbb` |
| `src/frontend/public/assets/roots/roots_wheat.glb` | 2321740 | `8b3e9e3b7abd1ea95ad5394f65fa51982f8ad13f44a0ffbb5ef9e2f246e8febc` |
| `src/frontend/public/assets/stubble/stubble_A.glb` | 12748 | `3e2e88d0e9996a3b7f03cb4e1afb2029f317e75a63bf8321ec5e59f1567d7a82` |
| `src/frontend/public/assets/wheat/wheat_A.glb` | 23228 | `2ea6faf9ea73b9b67472f7f94a82993b0f94a62b6b8416616f90a45f33b3c2fd` |
| `src/frontend/public/assets/wheat/wheat_B.glb` | 23240 | `03191e4d526be1e66c60704c0ccbf9dd8554b47a787ab5827f00f704eae8be33` |
| `src/frontend/public/assets/wheat/wheat_C.glb` | 23240 | `7bc1bf3c1ec8e4eda4c76db8e78694da3bb6f4785026343ddf00d1f94684fd9a` |
| `src/frontend/public/fonts/outfit-regular.woff2` | 14096 | `9786922fdba6d0ceb8b11f35672b039229bdddb9714584128233f1f836c591a1` |
| `src/frontend/public/fonts/plus-jakarta-sans-bold.woff2` | 12280 | `388e45211c162f3b2e8b0ca21261d4ddf9fd5db42f848892640a06d1c1321f46` |
| `src/frontend/public/fonts/source-sans-3-medium.woff2` | 15688 | `d71841e61621163e42bea22810b28086bcbfec8b9400886b197f5afeb65e355d` |
| `src/frontend/public/soil-type-icon.png` | 26544 | `c1670af9bb54105b9e183b49b62d9fa560d546f72d3c08ff8264b08db6691848` |

Three.js asset loaders resolve against the static site root. The nested `/simulation/` page retains its `<base href="/">` handling. `src/frontend/scene/tools/blender/wheat_profiles.json` and `stubble_profiles.json` are runtime-imported recipes and are included.

Fonts: Outfit Regular, Plus Jakarta Sans Bold and Source Sans 3 Medium; original OFL text files are alongside the font files. Dependency licences are provided by npm packages on installation.

The five GLBs and recipes come from the supplied sister simulator handoff. The soil icon and paddock image come from the existing Farm Forward application. This task preserves supplied project assets; it does not assert a new licence for user-supplied images/models. No separate asset-rights clearance has been inferred. Original Blender authoring sources and historical render captures are not required to run the current site and are excluded.

This release contains one application. Older prototype and integration-reference folders are excluded; current operating instructions are in the root handoff guide.
