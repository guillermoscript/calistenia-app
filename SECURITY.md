# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@calistenia.app** (or open a [private security advisory](https://github.com/guillermoscript/calistenia-app/security/advisories/new)).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix timeline**: depends on severity, but we aim for critical fixes within 7 days

## Security Best Practices for Contributors

- Never commit secrets, API keys, tokens, or credentials
- Use `.env` files for local configuration (they are gitignored)
- Report any accidentally committed secrets immediately
- Keep dependencies up to date
