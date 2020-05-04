/**
 * Copyright (c) ProductBoard, Inc.
 * All rights reserved.
 */

import * as ts from 'typescript';

const DEFAULT_SELECT_NAME = 'select';
const VALID_PROPERTY_NAMES = new Set(['noMemo', 'customMemo']);

export const getSelectMetadata = (
  node: ts.CallExpression,
  validIdentifiers: Set<string> = new Set([DEFAULT_SELECT_NAME]),
) => {
  const identifierExpression =
    ts.isPropertyAccessExpression(node.expression) &&
    VALID_PROPERTY_NAMES.has(node.expression.name.text)
      ? node.expression.expression
      : node.expression;

  if (
    !ts.isIdentifier(identifierExpression) ||
    !validIdentifiers.has(identifierExpression.text)
  ) {
    return null;
  }

  const variableName =
    ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
      ? node.parent.name.text
      : null;

  return {
    identifierExpression,
    hasNoMemo:
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'noMemo',
    hasCustomMemo:
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'customMemo',
    variableName,
  };
};
