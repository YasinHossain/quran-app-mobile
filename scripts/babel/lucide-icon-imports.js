const fs = require('node:fs');
const path = require('node:path');

/**
 * Rewrites `import { Home } from 'lucide-react-native'` to a direct import of that icon's module.
 *
 * Metro does not tree-shake, so the package barrel makes every launch evaluate ~1,700 icon
 * modules (~35 ms on a budget Android phone) to use a few dozen. Lucide's `exports` map does not
 * expose individual icons, so the rewrite targets each icon file by absolute path.
 */
const PACKAGE_NAME = 'lucide-react-native';
const BARREL_EXPORT = /export \{([^}]+)\} from '\.\/icons\/([^']+)';/g;

let iconPathsByName = null;

function getIconPathsByName() {
  if (iconPathsByName) return iconPathsByName;

  // The package `main` is dist/cjs/lucide-react-native.js; the ESM barrel and icons sit beside it.
  const esmDir = path.resolve(path.dirname(require.resolve(PACKAGE_NAME)), '../esm');
  const barrel = fs.readFileSync(path.join(esmDir, 'lucide-react-native.mjs'), 'utf8');
  iconPathsByName = new Map();
  for (const [, specifiers, file] of barrel.matchAll(BARREL_EXPORT)) {
    const iconPath = path.join(esmDir, 'icons', file);
    for (const specifier of specifiers.split(',')) {
      const match = specifier.trim().match(/^default as (\w+)$/);
      if (match) iconPathsByName.set(match[1], iconPath);
    }
  }
  return iconPathsByName;
}

module.exports = function lucideIconImports({ types: t }) {
  return {
    name: 'lucide-icon-imports',
    visitor: {
      ImportDeclaration(declaration) {
        const { node } = declaration;
        if (node.source.value !== PACKAGE_NAME || node.importKind === 'type') return;

        const iconPaths = getIconPathsByName();
        const iconImports = [];
        const remaining = node.specifiers.filter((specifier) => {
          if (!t.isImportSpecifier(specifier) || specifier.importKind === 'type') return true;
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;
          const iconPath = iconPaths.get(importedName);
          if (!iconPath) return true;

          iconImports.push(
            t.importDeclaration(
              [t.importDefaultSpecifier(t.identifier(specifier.local.name))],
              t.stringLiteral(iconPath)
            )
          );
          return false;
        });

        if (iconImports.length === 0) return;
        if (remaining.length === 0) {
          declaration.replaceWithMultiple(iconImports);
        } else {
          node.specifiers = remaining;
          declaration.insertAfter(iconImports);
        }
      },
    },
  };
};
