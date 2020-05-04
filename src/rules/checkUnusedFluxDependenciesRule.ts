/**
 * Copyright (c) 2019-present, ProductBoard, Inc.
 * All rights reserved.
 */

import * as ts from 'typescript';
import * as Lint from 'tslint';
import { IOptions } from 'tslint';
import { getSelectMetadata } from '../utils/selectUtils';
import { getConnectMetadata } from '../utils/connectUtils';

type TFluxDependency = 'store' | 'selector';

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
      new NoUnusedDependenciesWalker(sourceFile, this.getOptions()),
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
    ...(namedImports ? namedImports.elements.map(element => element.name.text) : []),
  ];
};

const addToWatchedIdentifiers = (name: string, type: TFluxDependency) => {
  watchedIdentifiers[name] = type;
};

const addToWatchedIdentifiersFromImportNode = (
  node: ts.ImportDeclaration,
  type: TFluxDependency,
  onlyDefault?: boolean,
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
      reference: '',
      ...(options.ruleArguments && options.ruleArguments[0]),
    } as Configuration;

    this.configuration = configuration;
  }

  private addIssue(node: ts.Node, text: string) {
    this.addFailure(
      this.createFailure(
        node.getStart(),
        node.getWidth(),
        text +
          (this.configuration.reference ? ` ${this.configuration.reference}` : ''),
      ),
    );
  }

  private checkDependencies(node: ts.CallExpression) {
    const [dependencyNode, implementationNode] = node.arguments;

    if (
      ts.isArrowFunction(implementationNode) &&
      ts.isArrayLiteralExpression(dependencyNode)
    ) {
      const selectorsNodesIdentifiers = dependencyNode.elements.filter(
        ts.isIdentifier,
      );

      const dependencies = selectorsNodesIdentifiers.map(element => element.text);

      if (
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        dependencies.push(node.parent.name.text);
      }

      const usedDependencies: Array<string> = [];

      const addToUsed = (node: ts.Node, identifier: string) => {
        if (!identifier) return;

        usedDependencies.push(identifier);

        if (watchedIdentifiers[identifier] && !dependencies.includes(identifier)) {
          this.addIssue(node, Rule.NOT_LISTENING(identifier));
        }
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

      const cb = (startNode: ts.Node): void => {
        if (
          ts.isIdentifier(startNode) &&
          !ts.isTypeReferenceNode(startNode.parent) &&
          !ts.isPropertyAssignment(startNode.parent) &&
          !ts.isPropertyAccessExpression(startNode.parent)
        ) {
          const identifier = startNode.text;

          addToUsed(startNode, identifier);
        }

        if (
          ts.isPropertyAccessExpression(startNode) &&
          ts.isIdentifier(startNode.expression)
        ) {
          const identifier = startNode.expression.text;

          addToUsed(startNode, identifier);
        }

        return ts.forEachChild(startNode, cb);
      };

      // walk the implementation
      ts.forEachChild(implementationNode, cb);

      const unusedDependencies = dependencies.filter(
        dependency => !usedDependencies.includes(dependency),
      );

      unusedDependencies.forEach(unusedSelector => {
        const unusedDependenciesNode = dependencyNode.elements
          .filter(ts.isIdentifier)
          .find(element => element.text === unusedSelector);

        if (unusedDependenciesNode) {
          this.addIssue(
            unusedDependenciesNode,
            Rule.UNUSED_SELECTOR(unusedSelector),
          );
        }
      });
    }
  }

  public visitImportDeclaration(node: ts.ImportDeclaration) {
    if (!node.importClause) return;

    const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;

    if (moduleName.match(/store/i)) {
      addToWatchedIdentifiersFromImportNode(node, 'store', true);
    }

    if (moduleName.match(/selectors/i)) {
      addToWatchedIdentifiersFromImportNode(node, 'selector');
    }

    super.visitImportDeclaration(node);
  }

  public visitCallExpression(node: ts.CallExpression) {
    const selectMetadata = getSelectMetadata(node);
    const connectMetadata = getConnectMetadata(node);

    if (selectMetadata || connectMetadata) {
      if (selectMetadata && selectMetadata.variableName) {
        addToWatchedIdentifiers(selectMetadata.variableName, 'selector');
      }

      this.checkDependencies(node);
    }

    super.visitCallExpression(node);
  }
}
