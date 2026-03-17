# Dataview Query Templates

Requires the Dataview community plugin in your vault.

Copy this file into your vault config folder:

```bash
cp templates/dataview-queries.md ~/obsidian/prompts/_config/
```

## Prompts by tag

Change `writing` to any tag you use.

```dataview
TABLE WITHOUT ID file.link AS Prompt, tags
FROM ""
WHERE tags AND contains(tags, "writing")
SORT file.name ASC
```

## Prompts by keyword prefix

Change `draft` to the prefix you want.

```dataview
TABLE WITHOUT ID file.link AS Prompt, keyword
FROM ""
WHERE keyword AND startswith(lower(string(keyword)), "draft")
SORT keyword ASC
```

## Recently modified

```dataview
TABLE WITHOUT ID file.link AS Prompt, file.mtime AS Modified
FROM ""
WHERE !startswith(file.path, "_config/")
SORT file.mtime DESC
LIMIT 25
```

## Snippet dependencies

Uses snippet links generated from `{snippet name="..."}` references.

```dataview
TABLE WITHOUT ID file.link AS Prompt, snippet AS Snippet
FROM ""
FLATTEN file.outlinks AS snippet
WHERE snippet AND !startswith(file.path, "_config/")
SORT file.name ASC
```

## Missing keywords

```dataview
TABLE WITHOUT ID file.link AS Prompt, tags
FROM ""
WHERE !keyword OR string(keyword) = ""
SORT file.name ASC
```
