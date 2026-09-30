# Contributing to Beasty Printer Hub

Thank you for your interest in contributing to Beasty Printer Hub!

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `bun install && (cd frontend && bun install)`
4. Create a branch for your changes: `git checkout -b feature/your-feature-name`

## Development

### Running locally

```bash
# Build the frontend, then start the backend with auto-reload
bun run build
bun run dev

# Optional: frontend dev server with hot reload (proxies /api to port 3000)
cd frontend && bun run dev
```

### Building

```bash
# Build the frontend
bun run build

# Build and run the Docker image from source
docker compose -f docker-compose.build.yml up -d
```

## Pull Requests

1. Ensure your code follows the existing style
2. Test your changes locally
3. Write a clear PR description explaining what and why
4. Link any related issues

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node/Bun version, browser if applicable)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
