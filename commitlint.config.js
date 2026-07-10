export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The changelog scripts (scripts/generate-changelog*.mjs) parse subjects as
    // type(scope): description — keep the type list in sync with TYPE_MAP there.
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'revert', 'security', 'style', 'docs', 'chore', 'test', 'ci', 'build'],
    ],
    'subject-case': [0], // Spanish subjects don't fit sentence/lower-case rules well
    'header-max-length': [2, 'always', 100],
  },
}
