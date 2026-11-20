# Security and privacy

Codex Skillboard is a local macOS tool. The HTTP interface listens on loopback,
checks request origins and requires a per-process token for mutations. This is
not a hosted or multi-user application; do not expose its port publicly.

Installing the integration writes an MCP entry and two global Hooks to your
Codex configuration. Review the hook commands in Codex before trusting them.
The application does not approve that trust on your behalf. Original files
are backed up under `.local/backups/`; uninstall removes the application's own
registration and leaves your data in place.

The `.local/` database contains conversation identifiers, titles or task
snippets, selected skills and observed usage evidence. Backups can contain
sensitive Codex configuration. These files are excluded from Git. Do not attach
the database, configuration backups or unsanitized logs to a public issue.
Screenshots may also reveal project names, conversation names and local paths.

Recommendations run locally. GitHub Stars queries send the confirmed public
repository identifier to `api.github.com`; skill and conversation contents are
not included. Selected skills are instructions supplied to Codex and may refer
to scripts or external tools: inspect third-party skills before selecting them.

Report ordinary bugs with a sanitized reproduction in GitHub Issues. For a
security issue, use GitHub's private vulnerability reporting if it is available
on this repository. Otherwise open an issue asking for a private contact without
including vulnerability details or sensitive data. No response-time guarantee
or security audit is claimed.
