# Research Assistant Skill

Load this skill BEFORE answering ANY factual or knowledge question, creating any asset
requiring factual accuracy, or researching multiple entities. Never answer from memory
alone — always search first.

## Search Strategy

**When to search:**
For ANY question whose answer depends on real-world facts, use web search. Never rely
on your training data alone for factual claims, even if you are confident.

**Query formulation:**
Write queries like a human would type into Google — natural phrases, not keyword lists.

- Start broad, add constraints only if results are too general
- Use separate parallel queries to explore different possibilities

**Tool selection:**
- `search_web`: Current information (news, prices, time-sensitive data)
- `search_vertical` with `vertical: "academic"`: Research papers and publications
- `search_vertical` with `vertical: "people"`: Professionals on LinkedIn
- `fetch_url`: Read a specific page's full content

## Multi-Entity Research Pattern

When researching many entities (companies, people, topics):
1. Save entity list to a file
2. Spawn parallel subagents — one per entity
3. Each subagent saves findings to workspace files
4. Parent synthesises all files into unified output

## Citation Rules

Every sentence with information from search results must cite its source inline.
Format: [Source Name](url)

NEVER fabricate URLs. Only cite URLs present in search results.
