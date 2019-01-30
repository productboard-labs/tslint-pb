/**
 * Copyright (c) 2019-present, ProductBoard, Inc.
 * All rights reserved.
 */

import * as Lint from "tslint";
import * as ts from "typescript";

export class Rule extends Lint.Rules.AbstractRule {
  public static ERROR = `Dependency array is not sorted correctly!`;

  public apply(sourceFile: ts.SourceFile): Array<Lint.RuleFailure> {
    return this.applyWithWalker(
      new SortFluxDependencies(sourceFile, this.getOptions())
    );
  }
}

const MAX_LINE_LENGTH = 80;

/**
 * Gets the full indentation of the provided node
 */
function getIndentation(node: ts.Node, sourceFile: ts.SourceFile): string {
  const text = sourceFile.text.substr(node.pos, node.getStart() - node.pos);
  const matches = text.match(/([ \t]*)$/);
  return matches !== null ? matches[1] : "";
}

class SortFluxDependencies extends Lint.RuleWalker {
  private configuration: {
    reference: string;
    maxLineLength: number;
  };

  constructor(sourceFile, options) {
    super(sourceFile, options);

    const configuration = {
      maxLineLength: MAX_LINE_LENGTH,
      reference: "",
      ...options.ruleArguments[0]
    } as {
      reference: string;
      maxLineLength: number;
    };

    this.configuration = configuration;
  }

  private checkSelectors(node: ts.CallExpression) {
    const [selectorsNode, implementationNode] = node.arguments;

    if (
      selectorsNode.kind === ts.SyntaxKind.ArrayLiteralExpression &&
      implementationNode.kind === ts.SyntaxKind.ArrowFunction
    ) {
      const dependencyNodes = (selectorsNode as ts.ArrayLiteralExpression).elements.filter(
        a => a.kind === ts.SyntaxKind.Identifier
      ) as Array<ts.Identifier>;

      const sortedImportsIdentifiers = [...dependencyNodes]
        .map(node => node.text)
        .sort();

      let fixer: Lint.Replacement | undefined;
      if (
        dependencyNodes.every(node => node.kind === ts.SyntaxKind.Identifier)
      ) {
        const indentation = getIndentation(
          dependencyNodes[0],
          this.getSourceFile()
        );

        let formatedSortedIdentifiers;
        if (
          sortedImportsIdentifiers.join().length >
          this.configuration.maxLineLength
        ) {
          formatedSortedIdentifiers = sortedImportsIdentifiers.join(
            `,\n${indentation}`
          );
        } else {
          formatedSortedIdentifiers = sortedImportsIdentifiers.join(`, `);
        }

        fixer = Lint.Replacement.replaceFromTo(
          dependencyNodes[0].getStart(),
          dependencyNodes[dependencyNodes.length - 1].getEnd(),
          formatedSortedIdentifiers
        );
      }

      for (let i = 0; i <= dependencyNodes.length; i++) {
        if (dependencyNodes[i].text !== sortedImportsIdentifiers[i]) {
          return this.addFailure(
            this.createFailure(
              dependencyNodes[i].getStart(),
              dependencyNodes[i].getWidth(),
              Rule.ERROR + this.configuration.reference,
              fixer
            )
          );
        }
      }
    }
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
