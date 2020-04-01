/**
 * Copyright (c) 2019-present, ProductBoard, Inc.
 * All rights reserved.
 */

import * as Lint from 'tslint';
import * as ts from 'typescript';

export class Rule extends Lint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): Array<Lint.RuleFailure> {
    return this.applyWithWalker(
      new SelectorsFormatRule(sourceFile, this.getOptions()),
    );
  }
}

type Configuration = {
  reference: string;
  importPaths: { [key: string]: string | Array<string> };
};

class SelectorsFormatRule extends Lint.RuleWalker {
  private configuration: Configuration;
  private validIdentifiers: Set<string> = new Set();

  constructor(sourceFile: ts.SourceFile, options: Lint.IOptions) {
    super(sourceFile, options);

    const configuration = {
      reference: '',
      ...options.ruleArguments[0],
    } as Configuration;

    if (!configuration.importPaths) {
      throw new Error("'import-paths' option is mandatory.");
    }

    if (
      typeof configuration.importPaths !== 'object' ||
      Object.values(configuration.importPaths).some(
        paths => typeof paths !== 'string' && !Array.isArray(paths),
      )
    ) {
      throw new Error("Invalid 'import-paths' option format. Check docs for details please.");
    }

    this.configuration = configuration;

    sourceFile.statements
      .filter(ts.isImportDeclaration)
      .forEach(({ importClause, moduleSpecifier }) => {
        Object.entries(configuration.importPaths).forEach(([identifier, paths]) => {
          if (typeof paths === 'string') paths = [paths];

          if (
            !importClause ||
            !ts.isStringLiteral(moduleSpecifier) ||
            !paths.some(path => path === moduleSpecifier.text)
          ) {
            return;
          }

          if (
            (importClause.name && importClause.name.text === identifier) ||
            (importClause.namedBindings &&
              ts.isNamedImports(importClause.namedBindings) &&
              importClause.namedBindings.elements.some(
                importSpecifier => importSpecifier.name.text === identifier,
              ))
          ) {
            this.validIdentifiers.add(identifier);
          }
        });
      });
  }

  private getFormattedError(error: string): string {
    return (
      error +
      (this.configuration.reference ? ` ${this.configuration.reference}` : '')
    );
  }

  private checkDependenciesNode(dependenciesNode: ts.Node) {
    if (!ts.isArrayLiteralExpression(dependenciesNode)) {
      return this.addFailureAtNode(
        dependenciesNode,
        this.getFormattedError('Dependencies must be defined as array literal.'),
      );
    }

    if (!dependenciesNode.elements.length) {
      return this.addFailureAtNode(
        dependenciesNode,
        this.getFormattedError(
          "Dependencies shouldn't be empty. You probably want to define plain function instead of a selector?",
        ),
      );
    }
  }

  private checkResultFuncNode(resultFuncNode: ts.Node) {
    if (!ts.isArrowFunction(resultFuncNode)) {
      return this.addFailureAtNode(
        resultFuncNode,
        this.getFormattedError(
          'Function must be defined as arrow function literal.',
        ),
      );
    }

    // check each parameter of function
    resultFuncNode.parameters.forEach(paramNode => {
      if (paramNode.initializer) {
        this.addFailureAtNode(
          paramNode,
          this.getFormattedError('Default arguments are forbidden.'),
        );
      }

      if (paramNode.questionToken) {
        this.addFailureAtNode(
          paramNode,
          this.getFormattedError('Optional arguments are forbidden.'),
        );
      }

      if (!paramNode.type) {
        this.addFailureAtNode(
          paramNode,
          this.getFormattedError('All arguments must be typed.'),
        );
      }
    });
  }

  public visitCallExpression(node: ts.CallExpression) {
    const identifier = (node.expression as ts.Identifier).text;

    if (
      node.expression.kind === ts.SyntaxKind.Identifier &&
      this.validIdentifiers.has(identifier)
    ) {
      if (node.arguments.length < 2) {
        return this.addFailureAtNode(
          node,
          this.getFormattedError('Selector must have at least 2 arguments'),
        );
      }

      this.checkDependenciesNode(node.arguments[0]);
      this.checkResultFuncNode(node.arguments[1]);
    }

    super.visitCallExpression(node);
  }
}
