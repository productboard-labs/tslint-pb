# Productboard's TSlint Rules

These are highly experimental rules we are trying to use in our daily life to help maintain code more effectively. Because the rules are tied to our codebase, it will probably be very difficult to use them in your project. However, you can definitely take a look! 💪

## Rules

> 💡 All the rules consume `reference: string` configuration for custom message

### check-unused-selectors

This rule checks if our connect (Flux) or selector implementation has all required dependencies, or if there is some dependency unused. If you are wondering, how this works in real life just ping us – [we are hiring.](https://www.productboard.com/careers/senior-javascript-developer-react-js/) 🤓

### Configuration

```json
{
  "rules": {
    "check-unused-selectors": [
      true,
      {
        "reference": "Optional text to explain the error"
      }
    ]
  }
}
```

### Example

```text
import { show, hide } from 'selectors/some';

export default compose(connect([show], () => ({
  a: show(),
  b: hide(),
     ~~~~    [You forgot to listen for the "hide" dependency!]
})))(component);
```

### import-group-order

> 💡 This rule has fixer

This rule needs configuration for proper usage. Basically, you are able to set convention on how to group and sort imports based on the naming convention of imports. Check it out tests for the real-case usage.

### Configuration

```json
{
  "rules": {
    "import-group-order": [
      true,
      {
        "convention": [
          "react",
          "node_modules",
          "libs",
          null,
          "actions",
          "stores",
          "selectors",
          null,
          "components",
          null,
          "constants",
          null,
          "styles",
          null,
          "undefined"
        ],
        "recognizer": {
          "react": "^react$",
          "node_modules": "^[^/]*$",
          "libs": "libs/.*",
          "actions": { "regex": "actions?", "flags": "i" },
          "stores": { "regex": "stores?", "flags": "i" },
          "selectors": { "regex": "selectors?", "flags": "i" },
          "components": ["components?/", ".*\\.react$"],
          "constants": "constants?.*",
          "styles": ".*\\.styles$"
        },
        "reference": "Optional text to explain the error"
      }
    ]
  }
}
```

#### Example

```tsx
import a from "libs/flux/r";
import { b } from "libs/flux/r";
import { c, d, f, g } from "modules/views/libs/v";

import { h } from "stores/u";

import { i } from "constants/b";
import * as j from "constants/b";
import { k, l } from "constants/b";
import { m } from "constants/m";
import { n } from "constants/p";
import { o } from "modules/views/constants/v";
```

### sort-flux-dependencies

This rule checks if all connect (Flux) or selector dependencies are sorted alphabetically.

### Configuration

```json
{
  "rules": {
    "sort-flux-dependencies": [
      true,
      {
        "maxLineLength": "For formatting purposes",
        "reference": "Optional text to explain the error"
      }
    ]
  }
}
```

### Example

```text
connect(
  [
    AlonglonglongStore,
    getLongLongLongA,
    ~~~~~~~~~~~~~~~~  [Dependency array is not sorted correctly!]
    BlonglonglongStore,
    getLongLongLongB,
    getLongLongLongC,
  ],
  () => {},
)
```

## Install

```
yarn add -D @productboard/tslint-pb
```

_tslint.json_

```json
{
  "extends": ["@productboard/tslint-pb"],
  "rules": {}
}
```

## Contribution

There are test provided, just run `yarn run test`. For quick prototyping use http://astexplorer.net – it's a great tool! Any contribution welcomed! 🙏

## License

MIT
