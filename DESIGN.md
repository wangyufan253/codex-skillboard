# Skill 工作台

- Compact card grids: four inventory columns and three recommendation columns at wide desktop sizes; reflow down to one column.
- Cards have full visible borders, 12px corner radii, 12px padding and 10px gaps. Reading order remains left-to-right, top-to-bottom; selection never changes recommendation rank.
- Neutral gray canvas, white/light card surfaces, ink-colored action buttons and selected borders. A neutral selected surface separates selection from category meaning.
- Category badges and filters: design blue, development green, research orange, documents rose, other gray. Category labels always include text.
- Typography uses a familiar system sans; body scale 14px, names 13px, description and secondary labels at least 12px. No text-opacity tricks for disabled buttons.
- Controls include keyboard focus, disabled, pending and error feedback. Unknown data is explicitly labeled.
- Current conversation, global configuration and observed runtime discovery have separate status wording.
- Conversation navigation uses two native selects: project, then the project's real conversation titles. No serial-number suffixes in normal labels. IDs and grouping evidence live in collapsed conversation details. Project changes clear the active conversation without auto-selecting another; drafts remain scoped by conversation.
- Navigation never displays the current task or message preview. Missing source titles read “未命名对话”. Manual recommendation queries are optional, collapsed and confined to the recommendation view; they are never prefilled from the latest message.
- The global switch reads “允许自动选用”; it never claims loading. Cards distinguish saved conversation selection (and unsaved drafts), historical full-instruction delivery, and observed reads. Evidence is scoped to the bound conversation, with timestamps in details; all-conversation statistics remain separate.
- No hero, decorative icons, invented metrics, animated backgrounds or nested cards.

The main visual implementation is public/styles.css. Interaction and source data are in public/app.js and the local server, respectively.
