/**
 * Copyright (c) 2019-present, ProductBoard, Inc.
 * All rights reserved.
 */

import * as ts from "typescript";
import * as Lint from "tslint";

const watchedIdentifiers: { [key: string]: "store" | "selector" } = {};

export class Rule extends Lint.Rules.AbstractRule {
  public static NOT_LISTENING = (name: string) =>
    `You forgot to listen for the "${name}" dependency!`;
  public static UNUSED_SELECTOR = (name: string) =>
    `The "${name}" dependency  is unused. This has performance impact!`;

  public apply(sourceFile: ts.SourceFile): Array<Lint.RuleFailure> {
    return this.applyWithWalker(
      new NoUnusedSelectorsWalker(sourceFile, this.getOptions())
    );
  }
}

const getImports = (node: ts.ImportDeclaration) => {
  const importClause = node.importClause;
  let collectedIdentifiers: Array<string> = [];

  if (!importClause) return collectedIdentifiers;

  if (importClause.name) {
    collectedIdentifiers = [importClause.name.text];
  }

  const namedImports = importClause.namedBindings as ts.NamedImports;

  return [
    ...collectedIdentifiers,
    ...(namedImports
      ? namedImports.elements.map(element => element.name.text)
      : [])
  ];
};

const addToWatchedIdentifiers = (
  node: ts.ImportDeclaration,
  type: "store" | "selector",
  onlyDefault?: boolean
) => {
  if (onlyDefault) {
    const importClause = node.importClause;

    if (!importClause) return;
    if (!importClause.name) return;

    watchedIdentifiers[importClause.name.text] = type;

    return;
  }

  for (const i of getImports(node)) {
    watchedIdentifiers[i] = type;
  }
};

type Configuration = {
  reference: string;
};

// The walker takes care of all the work.
class NoUnusedSelectorsWalker extends Lint.RuleWalker {
  private configuration: Configuration;

  constructor(sourceFile, options) {
    super(sourceFile, options);

    const configuration = {
      reference: "",
      ...options.ruleArguments[0]
    } as Configuration;

    this.configuration = configuration;
  }

  private addIssue(node: ts.Node, text: string) {
    this.addFailure(
      this.createFailure(
        node.getStart(),
        node.getWidth(),
        text +
          (this.configuration.reference
            ? ` ${this.configuration.reference}`
            : "")
      )
    );
  }

  private checkSelectors(node: ts.CallExpression) {
    const [selectorsNode, implementationNode] = node.arguments;

    if (
      selectorsNode.kind === ts.SyntaxKind.ArrayLiteralExpression &&
      implementationNode.kind === ts.SyntaxKind.ArrowFunction
    ) {
      const selectors = (selectorsNode as ts.ArrayLiteralExpression).elements
        .filter(a => a.kind === ts.SyntaxKind.Identifier)
        .map(element => (element as ts.Identifier).text);

      const usedSelectors: Array<string> = [];

      const addToUsed = (node, identifier) => {
        if (!identifier) return;

        usedSelectors.push(identifier);

        if (watchedIdentifiers[identifier] && !selectors.includes(identifier)) {
          this.addIssue(node, Rule.NOT_LISTENING(identifier));
        }
      };

      const cb = (startNode: ts.Node): void => {
        let identifier: string;
        let identifierNode: ts.Node;

        /**
         * This gonna cover case like:
         * const something = debug ? Store.someMethod : Another.someMethod;
         */
        if (
          startNode.kind === ts.SyntaxKind.PropertyAccessExpression &&
          (startNode as ts.PropertyAccessExpression).expression.kind ===
            ts.SyntaxKind.Identifier
        ) {
          identifier = ((startNode as ts.PropertyAccessExpression)
            .expression as ts.Identifier).text as string;

          addToUsed(startNode, identifier);
        }

        if (startNode.kind === ts.SyntaxKind.CallExpression) {
          (startNode as ts.CallExpression).arguments.map(element => {
            if (element.kind !== ts.SyntaxKind.PropertyAccessExpression) return;
            const node = (element as ts.PropertyAccessExpression)
              .expression as ts.Identifier;
            if (!node) return;
            identifier = node.text;
            addToUsed(node, identifier);
          });

          identifierNode = (startNode as ts.CallExpression)
            .expression as ts.Identifier;

          if (identifierNode) {
            identifier = (identifierNode as ts.Identifier).text as string;
            addToUsed(identifierNode, identifier);
          }

          if (identifierNode.kind === ts.SyntaxKind.PropertyAccessExpression) {
            identifierNode = (identifierNode as ts.PropertyAccessExpression)
              .expression;

            if (identifierNode) {
              identifier = (identifierNode as ts.Identifier).text as string;
              addToUsed(identifierNode, identifier);
            }
          }
        }

        return ts.forEachChild(startNode, cb);
      };

      // walk the implementation
      ts.forEachChild(implementationNode, cb);

      const unusedSelectors = selectors.filter(
        selector => !usedSelectors.includes(selector)
      );

      unusedSelectors.forEach(unusedSelector => {
        const unusedSelectorsNode = (selectorsNode as ts.ArrayLiteralExpression).elements.find(
          element => (element as ts.Identifier).text === unusedSelector
        );

        if (unusedSelectorsNode) {
          this.addIssue(
            unusedSelectorsNode,
            Rule.UNUSED_SELECTOR(unusedSelector)
          );
        }
      });
    }
  }

  public visitImportDeclaration(node: ts.ImportDeclaration) {
    if (!node.importClause) return;

    const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;

    if (moduleName.match(/store/i)) {
      addToWatchedIdentifiers(node, "store", true);
    }

    if (moduleName.match(/selectors/i)) {
      addToWatchedIdentifiers(node, "selector");
    }

    super.visitImportDeclaration(node);
  }

  public visitCallExpression(node: ts.CallExpression) {
    const identifier = (node.expression as ts.Identifier).text;

    if (
      node.expression.kind === ts.SyntaxKind.Identifier &&
      // support select lib and aso connect called as argument, for instance with 'compose'
      (identifier === "select" || identifier === "connect")
    ) {
      this.checkSelectors(node);
    }

    super.visitCallExpression(node);
  }
}
