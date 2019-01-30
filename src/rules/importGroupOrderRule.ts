/**
 * Copyright (c) 2019-present, ProductBoard, Inc.
 * All rights reserved.
 */
import * as Lint from "tslint";
import * as ts from "typescript";

const ERROR = {
  LINE_ABOVE: "Insert line above.",
  REMOVE_EXTRA_LINE_ABOVE: n => `Remove ${n} extra line above.`,
  UNEXPECTED_SEPARATOR: n =>
    `Unexpected group separator, remove ${n} extra line above.`,
  ABSOLUTE_FIRST: "Absolute path should come first.",
  WRONG_ORDER: "Wrong order of the group.",
  ABZ: "Incorrect alphabetical order, replace the order with the next line.",
  TOGETHER: "All imports has to be defined together.",
  FATAL: "Import convention has been violated. This is auto-fixable."
};

const UNDEFINED_KEYWORD = "undefined"; // undefined type in convention array

type ImportType = {
  i: {
    node: ts.ImportDeclaration;
    type: string;
    text: string;
    moduleSpecifier: string;
    end: number;
    start: number;
  };
  id: number;
};

type ImportDeclarationWithJSDoc = ts.ImportDeclaration & {
  jsDoc: Array<{ text: string; end: number }>;
};

type Configuration = {
  convention: Array<string | null>;
  recognizer: {
    [key: string]:
      | string
      | Array<string>
      | { regex: string; flags: string }
      | Array<{ regex: string; flags: string }>;
  };
  reference: string;
};

function isAbsolute(text) {
  return text[0] === ".";
}

function countGroupingSeparator(text) {
  return text.split(/\n/).filter(a => !a).length;
}

function isThereGroupingSeparator(text) {
  return countGroupingSeparator(text) === 2;
}

function doesItFollowConvention(
  {
    currentImport,
    previousImport
  }: { currentImport: ImportType; previousImport: ImportType },
  configuration: Configuration
): [boolean, string?] {
  const { convention } = configuration;

  const currentTypeIndex = convention.findIndex(
    type => type === currentImport.i.type
  );
  if (!previousImport.i) {
    return [true];
  }

  if (currentImport.i.type === previousImport.i.type) {
    if (countGroupingSeparator(currentImport.i.text) > 1) {
      const extra = countGroupingSeparator(currentImport.i.text) - 1;

      return [false, ERROR.UNEXPECTED_SEPARATOR(extra)];
    }

    const currentModuleText = currentImport.i.moduleSpecifier;
    const previousModuleText = previousImport.i.moduleSpecifier;

    const currentIsAbsolute = isAbsolute(currentModuleText);
    const previousIsAbsolute = isAbsolute(previousModuleText);

    if (previousIsAbsolute === currentIsAbsolute) {
      if (currentModuleText < previousModuleText) {
        return [false, ERROR.ABZ];
      }

      return [true];
    }

    if (currentIsAbsolute && !previousIsAbsolute) {
      return [true];
    }

    return [false, ERROR.ABSOLUTE_FIRST];
  }

  for (let i = currentTypeIndex; i >= 0; i--) {
    if (convention[i] === previousImport.i.type) {
      if (
        currentTypeIndex - i === 1 &&
        isThereGroupingSeparator(currentImport.i.text)
      ) {
        const extra = countGroupingSeparator(currentImport.i.text) - 1;

        return [false, ERROR.UNEXPECTED_SEPARATOR(extra)];
      }

      return [true];
    }

    if (
      convention[i] === null &&
      !isThereGroupingSeparator(currentImport.i.text)
    ) {
      const lines = countGroupingSeparator(currentImport.i.text);
      if (lines > 2) {
        const extra = lines - 2;

        return [false, ERROR.REMOVE_EXTRA_LINE_ABOVE(extra)];
      }

      return [false, ERROR.LINE_ABOVE];
    }
  }

  return [false, ERROR.WRONG_ORDER];
}

export class Rule extends Lint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): Array<Lint.RuleFailure> {
    return this.applyWithWalker(
      new SortedImports(sourceFile, this.getOptions())
    );
  }
}

// The walker takes care of all the work.
class SortedImports extends Lint.RuleWalker {
  private imports: ImportsContainer;
  private configuration: Configuration;
  private importDefinitionFinished = false;
  private hasCriticalError = false;

  constructor(sourceFile, options) {
    super(sourceFile, options);

    const configuration = {
      reference: "",
      ...options.ruleArguments[0]
    } as Configuration;

    if (!configuration) throw new Error("Config has not been found!");

    if (!Array.isArray(configuration.convention)) {
      throw new Error("'convention' has to be an array!");
    }

    try {
      configuration.recognizer = Object.entries(configuration.recognizer)
        .map(([k, r]) => {
          if (k === UNDEFINED_KEYWORD) {
            throw new Error("'undefined' type can't have recognizer!");
          }

          const makeRegExp = (
            exp: { flags?: string; regex: string } | string
          ) => {
            if (typeof exp === "string") {
              return new RegExp(exp);
            }

            const flags = exp.flags || "";

            return new RegExp(exp.regex, flags);
          };

          const strategy = Array.isArray(r) ? r : [r];

          return [k, strategy.map(makeRegExp)];
        })
        .reduce((acc, [k, r]) => {
          acc[k as string] = r;

          return acc;
        }, {});
    } catch (e) {
      throw new Error("Wrong recognizer format!");
    }

    this.imports = new ImportsContainer(sourceFile.text, configuration);
    this.configuration = configuration;
  }

  private addIssue(node: ts.Node, text?: string, fix?: Lint.Replacement) {
    this.addFailure(
      this.createFailure(
        node.getStart(),
        node.getWidth(),
        text +
          (this.configuration.reference
            ? ` ${this.configuration.reference}`
            : ""),
        fix
      )
    );
  }

  public visitSourceFile(startNode: ts.SourceFile) {
    ts.forEachChild(startNode, node => {
      if (node.kind === ts.SyntaxKind.ImportDeclaration) {
        if (this.importDefinitionFinished) {
          return this.addIssue(node, ERROR.TOGETHER);
        }

        const currentImport = this.imports.add(node as ts.ImportDeclaration);
        const previousImport = this.imports.previous(currentImport);

        const [status, error] = doesItFollowConvention(
          { currentImport, previousImport },
          this.configuration
        );

        if (!status) {
          this.hasCriticalError = true;

          this.addIssue(currentImport.i.node, error);
        }
      } else {
        if (!this.importDefinitionFinished) {
          this.importDefinitionFinished = true;

          if (this.hasCriticalError) {
            this.addIssue(
              this.imports.getLast().i.node,
              ERROR.FATAL,
              this.imports.getGeneralImportFix()
            );
          }
        }
      }
    });

    super.visitSourceFile(startNode);
  }
}

class ImportsContainer {
  private imports: Array<ImportType["i"]> = [];
  private banner = 0;
  private sourceFile = "";
  private configuration;

  constructor(sourceFile, configuration) {
    this.sourceFile = sourceFile;
    this.configuration = configuration;
  }

  private getType(module: string) {
    const recognizer = this.configuration.convention
      .filter(a => a && a !== UNDEFINED_KEYWORD)
      .map(r => [r, this.configuration.recognizer[r]]) as Array<
      [string, Array<RegExp>]
    >;

    // tslint:disable-next-line
    for (let i = 0; i < recognizer.length; i++) {
      // tslint:disable-next-line
      for (let ii = 0; ii < recognizer[i][1].length; ii++) {
        if (recognizer[i][1][ii].test(module)) {
          return recognizer[i][0];
        }
      }
    }

    return UNDEFINED_KEYWORD;
  }

  public previous({ id }: ImportType): ImportType {
    return { i: this.imports[id - 1], id: id - 1 };
  }

  public getLast(): ImportType {
    return {
      i: this.imports[this.imports.length - 1],
      id: this.imports.length - 1
    };
  }

  public add(node: ts.ImportDeclaration) {
    const start = node.pos;
    const end = node.end;
    const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;

    const newLength = this.imports.push({
      node,
      start,
      end,
      text: this.sourceFile.substring(start, end),
      moduleSpecifier,
      type: this.getType(moduleSpecifier)
    });

    const lastIndex = newLength - 1;

    return {
      i: this.imports[lastIndex],
      id: lastIndex
    };
  }

  public getGeneralImportFix(): Lint.Replacement {
    const imports = [...this.imports];

    // let's handle banner properly
    if (
      (imports[0].node as ImportDeclarationWithJSDoc).jsDoc &&
      (imports[0].node as ImportDeclarationWithJSDoc).jsDoc[0]
    ) {
      this.banner = (imports[0]
        .node as ImportDeclarationWithJSDoc).jsDoc[0].end; // where banner ends
      imports[0].text = imports[0].text.slice(this.banner);
    }

    /**
     * Sort imports, absolute first, then by ABZ of module path
     * Need to be in sync with doesItFollowConvention implementation
     * @param prev
     * @param next
     */
    const sortImports = (prev: ImportType["i"], next: ImportType["i"]) => {
      const prevModuleText = prev.moduleSpecifier;
      const nextModuleText = next.moduleSpecifier;

      const prevIsAbsolute = isAbsolute(prevModuleText);
      const nextIsAbsolute = isAbsolute(nextModuleText);

      if (nextIsAbsolute && !prevIsAbsolute) {
        return -1;
      } else if (!nextIsAbsolute && prevIsAbsolute) {
        return 1;
      }

      if (prevModuleText < nextModuleText) {
        return -1;
      } else if (prevModuleText > nextModuleText) {
        return 1;
      }

      return 0;
    };

    const groupsOfImports = imports.reduce((acc, importObject) => {
      if (!acc[importObject.type]) {
        acc[importObject.type] = [importObject];
      } else {
        acc[importObject.type].push(importObject);
      }

      return acc;
    }, {}) as { [key: string]: Array<ImportType["i"]> };

    const { convention } = this.configuration;

    const rewrittenImports: string = convention
      .reduce(
        (acc: { text: string; blank: boolean }, v: string) => {
          if (v === null && !acc.blank) {
            acc.text += "\n";
            acc.blank = true;

            return acc;
          }

          if (!groupsOfImports[v]) return acc;

          acc.text +=
            groupsOfImports[v]
              .sort(sortImports)
              .map(({ text }) => text.trim())
              .join("\n") + "\n";

          acc.blank = false;

          return acc;
        },
        { text: "", blank: false }
      )
      .text.trim();

    return Lint.Replacement.replaceFromTo(
      this.imports[0].start + this.banner,
      this.imports[this.imports.length - 1].end,
      `${this.banner ? "\n\n" : ""}${rewrittenImports}`
    );
  }
}
