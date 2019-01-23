# Productboard's TSlint Rules

There are highly experimental rules we are trying to use in our daily life to help maintain code more effectively. Because the the rules are tied to our codebase it will be probably very difficult to use them in your project. However, you can definitely take a look! 💪

## Rules

> 💡 All the rules consume `reference: string` configuration for custom message

### check-unused-selectors

This rule checks if ours connect (Flux) or selector implementation has all required dependencies, or if there is some dependency unused. If you are wondering, how this works in real life just ping us – [we are hiring.](https://www.productboard.com/careers/senior-javascript-developer-react-js/) 🤓

### import-group-order

This rule needs configuration to proper usage. Basically, you are able to set convention how to group and sort imports based on the naming convention of imports. Check it out tests for real-case usage.

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
