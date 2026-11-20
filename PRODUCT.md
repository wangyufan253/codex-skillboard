# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Node.js 24+, native HTTP and SQLite, plain HTML/CSS/JavaScript, official MCP SDK. Local Codex App Server supplies skill discovery and configuration writes. Recommendations run locally without a model API.

## Users
One macOS Codex user who has many personal skills and needs relevant recommendations, manual selection and a searchable inventory.

## Product Purpose
Make personal skills easy to discover, select for a conversation and manage globally, with honest usage and repository popularity data.

## Operating Context
Query from a Codex MCP tool; use the full local workbench beside the chat or in a browser. A conversation selection persists until replaced or cleared and never carries into another conversation.

## Capabilities and Constraints
- Show standalone user-installed skills in personal/shared skill directories; exclude hidden system directories and plugin caches.
- Both recommendation and inventory views use compact grid cards with rounded square checkboxes, clear boundaries and visible recommendation ranks.
- Categories are design, development, research, documents and other; automatic labels can be corrected manually.
- Global config writes use the official Codex API, create backups and report existing-chat availability as unknown.
- Hook output provides conversation-selected instructions without changing the global setting, including globally disabled skills.
- UserPromptSubmit and PostToolUse hooks require the user's Codex trust review. Installation is a distinct persistent setup action.
- Selection, Hook output and observable loading are separate evidence types; loaded is not equivalent to executed successfully.
- Stars are source-repository statistics. Unknown source/data remains unknown. No chat content or skill instructions are uploaded for recommendations or popularity lookup.

## Brand Commitments
Compact, clear cards and restrained workbench chrome. Neutral gray surfaces, ink-colored actions and selection, distinct saturated category badges. Avoid promotional copy and decorative effects.

## Evidence on Hand
Real local filesystem inventory, official Codex discovery and write responses, local usage evidence, GitHub REST repository responses, isolated integration tests and browser test fixtures.
