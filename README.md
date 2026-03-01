# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Codespaces: exact commands to enable the `work` branch flow

Open the **Terminal** tab in your GitHub Codespace and run these commands line by line.

```bash
git checkout work
git remote add origin git@github.com:<YOUR_GITHUB_USERNAME_OR_ORG>/<YOUR_REPO>.git
git push -u origin work
```

After that first setup, your normal loop is:

```bash
git add .
git commit -m "your message"
git push
```

Then open a PR in GitHub from `work` → `main` and merge there.

> Note: In markdown code blocks, `bash` is only a syntax label for highlighting. Do not type the word `bash` itself.

## If you use both my branch and Claude's branch

Changes do **not** override each other just because they came from different assistants. What matters is the Git branch and merge order:

1. If edits are on different branches and touch different files/lines, both merge cleanly.
2. If both branches edit the same lines, Git raises a merge conflict and you choose which version (or combine them).
3. The branch you merge later can change code merged earlier, but only where its commit differences apply.

Safe pattern:

1. Keep one branch per task (`codex/feature-x`, `claude/feature-y`).
2. Merge each via PR into `main`.
3. Before new work, sync from `main`:

```bash
git checkout <your-branch>
git fetch origin
git rebase origin/main
git push --force-with-lease
```
