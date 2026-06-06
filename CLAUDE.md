# CLAUDE Skill Configuration

## gstack
- For all web browsing and online research tasks, always use gstack's `/browse` skill.
- Never use `mcp__claude-in-chrome__*` tools or any Chrome integration for browsing when gstack is available.
- Core gstack skills available in this project:
  - `/office-hours`
  - `/plan-ceo-review`
  - `/plan-eng-review`
  - `/review`
  - `/ship`
  - `/qa`
  - `/retro`
- Use gstack for browser-based information gathering, review workflows, planning, and QA support.

## Superpowers
- On session startup, immediately load and use Superpowers `using-superpowers` skill.
- For complex, vague, or open-ended new requirements, always begin with Superpowers `brainstorming` skill to analyze and clarify the request.
- During implementation of core logic, follow a test-driven development (TDD) workflow by default:
  1. write failing tests first,
  2. implement minimal code to satisfy them,
  3. refactor and improve the implementation.

## Auto-Invocation Rules
- Prefer gstack skills for browsing and structured planning workflows.
- Prefer Superpowers for initial requirement analysis and brainstorming on ambiguous or complex tasks.
- Maintain TDD discipline during development of project core logic.
