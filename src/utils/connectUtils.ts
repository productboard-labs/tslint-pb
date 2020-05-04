/**
 * Copyright (c) ProductBoard, Inc.
 * All rights reserved.
 */

import * as ts from 'typescript';

const DEFAULT_CONNECT_NAME = 'connect';

export const getConnectMetadata = (
  node: ts.CallExpression,
) => {
  if (
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== DEFAULT_CONNECT_NAME
  ) {
    return null;
  }

  return {
    identifierExpression: node.expression,
  }
}