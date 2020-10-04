// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/experimental-utils';

import { PacketAnalyzer, IAnalyzerError, MyMessageIds, MyMessageIds2 } from './PackletAnalyzer';

export type MessageIds = MyMessageIds | MyMessageIds2;
type Options = [];

const mechanics: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    messages: {
      'missing-tsconfig':
        'In order to use @rushstack/eslint-plugin-packlets, your ESLint config file' +
        ' must configure the TypeScript parser',
      'missing-src-folder': 'Expecting to find a "src" folder at: {{srcFolderPath}}',
      'packlet-folder-case': 'The packlets folder must be all lower case: {{packletsFolderPath}}',
      'invalid-packlet-name':
        'Invalid packlet name "{{packletName}}".' +
        ' The name must be lowercase alphanumeric words separated by hyphens. Example: "my-packlet"',
      'misplaced-packlets-folder': 'The packlets folder must be located at "{{expectedPackletsFolder}}"',
      'bypassed-entry-point':
        'The import statement does not use the packlet\'s entry point "{{entryPointModulePath}}"',
      'circular-entry-point': 'Files under a packlet folder must not import from their own index.ts file',
      'packlet-importing-project-file':
        'A local project file cannot be imported.' +
        " A packlet's dependencies must be NPM packages and/or other packlets."
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description: '',
      category: 'Best Practices',
      recommended: 'warn',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets'
    }
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    // Example: /path/to/my-project/src/packlets/my-packlet/index.ts
    const inputFilePath: string = context.getFilename();

    // Example: /path/to/my-project/tsconfig.json
    const tsconfigFilePath: string | undefined = ESLintUtils.getParserServices(
      context
    ).program.getCompilerOptions()['configFilePath'] as string;

    const packletAnalyzer: PacketAnalyzer = new PacketAnalyzer(inputFilePath, tsconfigFilePath);
    if (packletAnalyzer.nothingToDo) {
      return {};
    }

    return {
      // Match the first node in the source file.  Ideally we should be matching "Program > :first-child"
      // so a warning doesn't highlight the whole file.  But that's blocked behind a bug in the query selector:
      // https://github.com/estools/esquery/issues/114
      Program: (node: TSESTree.Node): void => {
        if (packletAnalyzer.error) {
          context.report({
            node: node,
            messageId: packletAnalyzer.error.messageId,
            data: packletAnalyzer.error.data
          });
        }
      },

      // ImportDeclaration matches these forms:
      //   import { X } from '../../packlets/other-packlet';
      //   import X from '../../packlets/other-packlet';
      //   import type { X, Y } from '../../packlets/other-packlet';
      //   import * as X from '../../packlets/other-packlet';
      //
      // ExportNamedDeclaration matches these forms:
      //   export { X } from '../../packlets/other-packlet';
      //
      // ExportAllDeclaration matches these forms:
      //   export * from '../../packlets/other-packlet';
      //   export * as X from '../../packlets/other-packlet';
      'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration': (
        node: TSESTree.ImportDeclaration | TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration
      ): void => {
        if (node.source?.type === AST_NODE_TYPES.Literal) {
          if (packletAnalyzer.projectUsesPacklets) {
            // Extract the import/export module path
            // Example: "../../packlets/other-packlet"
            const modulePath = node.source.value;
            if (typeof modulePath !== 'string') {
              return;
            }

            if (!(modulePath.startsWith('.') || modulePath.startsWith('..'))) {
              // It's not a local import.

              // Examples:
              //   import { X } from "npm-package";
              //   import { X } from "raw-loader!./webpack-file.ts";
              return;
            }

            const lint: IAnalyzerError | undefined = packletAnalyzer.analyzeImport(modulePath);
            if (lint) {
              context.report({
                node: node,
                messageId: lint.messageId,
                data: lint.data
              });
            }
          }
        }
      }
    };
  }
};

export { mechanics };
