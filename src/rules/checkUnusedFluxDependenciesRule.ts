/**
 * Copyright (c) 2019-present, ProductBoard, Inc.
 * All rights reserved.
 */

import * as ts from "typescript";
import * as Lint from "tslint";
import { IOptions } from "tslint";

type TFluxDependency = "store" | "selector";

enum FLUX_FACTORY {
  CONNECT = "connect",
  SELECT = "select"
}

const watchedIdentifiers: { [key: string]: TFluxDependency } = {};

export class Rule extends Lint.Rules.AbstractRule {
  public static NOT_LISTENING = (name: string) =>
    `You forgot to listen for the "${name}" dependency!`;
  public static UNUSED_SELECTOR = (name: string) =>
    `The "${name}" dependency  is unused. This has performance impact!`;
  public static ALREADY_DEFINED = (name: string) =>
    `The "${name}" dependency is already defined.`;

  public apply(sourceFile: ts.SourceFile): Array<Lint.RuleFailure> {
    return this.applyWithWalker(
      new NoUnusedDependenciesWalker(sourceFile, this.getOptions())
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

const addToWatchedIdentifiers = (name: string, type: TFluxDependency) => {
  watchedIdentifiers[name] = type;
};

const addToWatchedIdentifiersFromImportNode = (
  node: ts.ImportDeclaration,
  type: TFluxDependency,
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
    addToWatchedIdentifiers(i, type);
  }
};

type Configuration = {
  reference: string;
};

// The walker takes care of all the work.
class NoUnusedDependenciesWalker extends Lint.RuleWalker {
  private configuration: Configuration;

  constructor(sourceFile: ts.SourceFile, options: IOptions) {
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

  private checkDependencies(node: ts.CallExpression) {
    const [dependencyNode, implementationNode] = node.arguments;

    if (
      dependencyNode.kind === ts.SyntaxKind.ArrayLiteralExpression &&
      implementationNode.kind === ts.SyntaxKind.ArrowFunction
    ) {
      const selectorsNodesIdentifiers = (dependencyNode as ts.ArrayLiteralExpression).elements.filter(
        a => a.kind === ts.SyntaxKind.Identifier
      ) as Array<ts.Identifier>;
      const dependencies = selectorsNodesIdentifiers.map(
        element => element.text
      );

      const usedDependencies: Array<string> = [];

      const addToUsed = (node: ts.Node, identifier: string) => {
        if (!identifier) return;

        usedDependencies.push(identifier);

        if (
          watchedIdentifiers[identifier] &&
          !dependencies.includes(identifier)
        ) {
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

      // Check if dependencies are not defined multiple times
      const definedSelectors: { [key: string]: boolean } = {};
      for (let selectorNode of selectorsNodesIdentifiers) {
        if (!definedSelectors[selectorNode.text]) {
          definedSelectors[selectorNode.text] = true;
        } else {
          this.addIssue(selectorNode, Rule.ALREADY_DEFINED(selectorNode.text));
        }
      }

      // walk the implementation
      ts.forEachChild(implementationNode, cb);

      const unusedDependencies = dependencies.filter(
        dependency => !usedDependencies.includes(dependency)
      );

      unusedDependencies.forEach(unusedSelector => {
        const unusedDependenciesNode = (dependencyNode as ts.ArrayLiteralExpression).elements.find(
          element => (element as ts.Identifier).text === unusedSelector
        );

        if (unusedDependenciesNode) {
          this.addIssue(
            unusedDependenciesNode,
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
      addToWatchedIdentifiersFromImportNode(node, "store", true);
    }

    if (moduleName.match(/selectors/i)) {
      addToWatchedIdentifiersFromImportNode(node, "selector");
    }

    super.visitImportDeclaration(node);
  }

  public visitCallExpression(node: ts.CallExpression) {
    const identifier = (node.expression as ts.Identifier).text;

    if (
      node.expression.kind === ts.SyntaxKind.Identifier &&
      (identifier === FLUX_FACTORY.SELECT ||
        identifier === FLUX_FACTORY.CONNECT)
    ) {
      if (
        identifier === FLUX_FACTORY.SELECT &&
        node.parent.kind === ts.SyntaxKind.VariableDeclaration
      ) {
        const selectorName = ((node.parent as ts.VariableDeclaration)
          .name as ts.Identifier).text;

        addToWatchedIdentifiers(selectorName, "selector");
      }

      this.checkDependencies(node);
    }

    super.visitCallExpression(node);
  }
}
