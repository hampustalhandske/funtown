import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "web/dist/", "test-results/", "playwright-report/", ".scratch/", ".workflow/", ".claude/worktrees/"] },
  ...tseslint.configs.recommended,
);
