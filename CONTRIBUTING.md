# Contributing to PRNT

Thank you for your interest in contributing to PRNT! This document provides guidelines for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

### Local Development

```bash
# Install dependencies
npm install

# Create a D1 database for local development
npx wrangler d1 create prnt-db-dev

# Update wrangler.toml with your database ID

# Initialize the database schema
npx wrangler d1 execute prnt-db-dev --local --file=./schema.sql

# Start local development server
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values. For local development, Google OAuth won't work without a public callback URL.

## Code Style

- Use consistent 2-space indentation
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and small

## Making Changes

### Frontend (index.html)

The frontend is a single HTML file with embedded CSS and JavaScript. When making changes:

- Test in both light and dark themes
- Test on mobile viewport sizes
- Ensure keyboard navigation works
- Check for XSS vulnerabilities (use `escapeHtml()` for user content)

### API Functions (functions/api/)

API endpoints use Cloudflare Pages Functions. When making changes:

- Use prepared statements for all database queries (prevents SQL injection)
- Validate all input data
- Return appropriate HTTP status codes
- Include CORS headers

### Database Schema

If you need to modify the database schema:

1. Update `schema.sql` with the new schema
2. Create a migration file in `migrations/` (if applicable)
3. Document the changes in your PR

## Pull Request Process

1. **Create a descriptive PR title** summarizing your changes
2. **Fill out the PR template** with:
   - What changes you made
   - Why you made them
   - How to test them
3. **Ensure all tests pass** (if applicable)
4. **Request review** from maintainers

## Reporting Issues

When reporting issues, please include:

- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Browser/environment information
- Screenshots (if applicable)

## Feature Requests

Feature requests are welcome! Please:

- Check existing issues first
- Describe the use case
- Explain why it would be valuable

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Questions? Open an issue or start a discussion!
