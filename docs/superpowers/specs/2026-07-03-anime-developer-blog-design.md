# Anime Developer Blog Design

Date: 2026-07-03

## Goal

Build the first version of a static personal site for a developer. The site should present projects, technical writing, and personal information clearly, while using a gentle anime-style mascot, cozy study-desk visual language, and a more visible anime interface layer to make the site memorable.

The first version is intentionally static. It will not include login, a database, or a custom admin backend. Content will be maintained as Markdown or MDX files in the repository. A Git-based CMS can be added later if writing through a web UI becomes important.

## Positioning

The site is a developer portfolio and technical log hub with a clear anime identity.

The visual metaphor is a warm developer desk: soft daylight, books, notes, a laptop or monitor, project cards, and a gentle site assistant. The anime mascot is not the owner. She is the site's guide, helping visitors choose between project archives, development logs, and profile information.

The site should stay professional enough for technical work, but the interface should feel more like an anime personal site than a generic portfolio. Anime details should be visible in page framing, section titles, card shapes, small UI labels, mascot dialogue, and empty states. They should support personality and navigation without hiding the content.

## First Version Scope

Included:

- Home page with a mascot-guided hero section.
- Projects page listing project archive cards.
- Logs page listing Markdown or MDX technical posts.
- Log detail page for individual posts.
- About page with profile, skills, contact links, and site notes.
- Small ACG or personal-corner module, shown as a secondary detail rather than a full channel.
- A visible anime UI layer across main pages, including mascot dialogue, chapter-like section headings, archive/task card details, and illustrated accents.

Excluded for the first version:

- Login.
- Database.
- Custom admin dashboard.
- Comment system.
- Search engine.
- Full CMS integration.
- Full ACG archive section.

## Technology

- Framework: Astro.
- Language: TypeScript.
- Styling: Tailwind CSS plus shared design tokens.
- Content: Astro Content Collections with Markdown or MDX files.
- Interactive islands: Vue 3 only where interaction is useful.
- Deployment target: static hosting such as Cloudflare Pages, Vercel, Netlify, or GitHub Pages.

The site should be built so that the default page experience remains static and fast. Vue should be used for small enhancements such as mascot tips, theme toggles, filters, or small status widgets, not for rendering the entire site.

## Content Model

Posts live in a content collection:

```txt
src/content/posts/
```

Each post should include frontmatter for title, date, summary, tags, category, and optional cover image.

Projects live in a content collection:

```txt
src/content/projects/
```

Each project should include title, summary, status, tech stack, links, cover or icon, and featured flag.

A small personal or ACG collection can be added later:

```txt
src/content/notes/
src/content/collections/
```

For the first version, personal or ACG content can be a small static module in the home or about page.

## Naming System

Use consistent site language:

- Projects: 项目档案
- Posts: 开发日志
- Skills: 能力面板
- About: 站点档案
- Personal or ACG module: 小小收藏室

The naming should add personality while staying understandable. Navigation may use short labels, but page headings should preserve the site language.

## Home Page

The first viewport should contain:

- Header with brand and navigation.
- Main hero copy:
  - "欢迎回来，今天要查看项目档案还是开发日志？"
- Supporting copy:
  - "这里整理着我的开发项目、技术笔记、日常记录和一点二次元收藏。"
- Primary actions:
  - 项目档案
  - 开发日志
- Mascot illustration on the right side.
- Visible desk, anime, and archive UI elements that create a stronger anime-site feeling without competing with the main text.

Below the hero:

- Featured project archive cards.
- Latest development logs.
- Ability or status panel.
- Small personal or ACG corner.
- Mascot speech bubble or guide note that changes the tone from a normal portfolio to a guided personal site.

## Anime Interface Layer

The site should not rely only on the mascot illustration for its anime feeling. Use a consistent interface layer inspired by anime personal sites, visual novel menus, and light RPG archive screens.

Use these patterns:

- Mascot guide bubbles for short section introductions.
- Chapter-style section labels, such as "Chapter 01" or "Log Entry".
- Project cards styled as "task files" or "archive records".
- Skill blocks styled as a compact status or ability panel.
- Decorative but restrained corner brackets, tabs, small stamps, ribbons, and soft icon badges.
- Soft illustrated empty states for no posts, no projects, or loading-like states.
- A small "desk note" or "memo" component for personal remarks.
- Navigation that feels like a tidy anime menu, not a plain business navbar.

Do not use anime UI as random decoration. Every recurring motif should have a role: guiding, grouping, highlighting status, or adding warmth.

## Pages

### Home

Purpose: introduce the site and route visitors to key content.

Main sections:

- Hero with mascot guide.
- Featured project archives.
- Latest development logs.
- Ability panel.
- Small collection corner.

### Projects

Purpose: show technical work clearly.

The page should use stronger archive-card styling, with each project presented like a tidy task file. Each card should show status, stack, summary, and links. Cards can include small labels, stamps, or status markers, but the hierarchy should stay readable.

### Logs

Purpose: show technical writing and updates.

The list should prioritize reading clarity: title, date, tags, summary, and optional category. The list can use log-entry styling, date stamps, notebook-like dividers, or small mascot notes. Decoration should be present but lighter than the home page.

### Log Detail

Purpose: provide a comfortable reading experience.

The article page should be calmer than the home page, but not visually plain. Use strong typography, clear code block styling, table support, headings, and navigation back to the log list. Anime elements should appear as chapter headers, margin notes, small stamps, or a restrained mascot comment near the beginning or end. Avoid heavy illustration inside the reading column.

### About

Purpose: introduce the owner and the site.

Main sections:

- Profile summary.
- Skills and tools.
- Current focus.
- Contact links.
- Short explanation of the mascot and site concept.

## Visual System

The style should combine:

- Warm Japanese anime study room.
- Developer desk and code details.
- Gentle mascot guide.
- More noticeable anime UI details.
- Light game/archive UI accents.

Palette:

- Warm off-white page background.
- Soft sky blue accent.
- Gentle blush pink accent.
- Muted navy text.
- Light wood or paper-like surfaces.
- Small gold or cyan accents for archive/game details.

Avoid:

- Heavy dark cyberpunk.
- Purple-only gradient style.
- Excessive stickers.
- Overly childish mascot treatment.
- Too many nested cards.
- Visual clutter around reading pages.
- Generic business portfolio sections with no anime personality.
- Random decorative anime elements that do not match the design system.

## Style Architecture

Create a small design system:

```txt
src/styles/theme.css
src/components/ui/
src/components/layout/
src/components/feature/
```

Suggested UI components:

- Button
- Card
- TagPill
- SectionTitle
- ArchiveCard
- ProjectCard
- PostCard
- SkillPanel
- MascotPanel
- MascotBubble
- ChapterHeading
- MemoNote
- StatusBadge
- ArchiveFrame
- SiteHeader
- SiteFooter
- PageShell

All pages should use shared tokens for colors, radii, shadows, typography, and spacing. Components should avoid one-off styling unless the page has a specific reason.

## Images And Assets

The first version can use generated or placeholder illustration assets, but the style should stay consistent:

- Original mascot only, no copyrighted anime character.
- Same palette and line quality across mascot, background, and empty states.
- Project cards can initially use simple icons or screenshots.
- Article pages should not depend on heavy decorative images.

If a final mascot asset is generated later, it should be saved into the project and treated as a real site asset.

## Interaction

The first version should remain mostly static. Optional interactions:

- Theme toggle.
- Mascot tip rotation.
- Project tag filtering.
- Copy code button.

These interactions should be isolated Vue islands and should not require a backend.

## Maintenance

Content maintenance flow:

1. Create or edit a Markdown or MDX file.
2. Commit and push changes.
3. Static hosting rebuilds the site.

Later CMS path:

- Add a Git-based CMS such as Decap CMS or TinaCMS.
- The CMS should write to the same Markdown or MDX content collections.
- The site should not need a full database-backed backend unless future requirements expand.

## Success Criteria

- The home page immediately communicates developer identity and anime-inspired personality.
- Visitors can quickly reach project archives and development logs.
- Article pages are comfortable to read.
- The visual system feels unified across pages.
- New posts and projects can be added by creating Markdown or MDX files.
- The first version can be deployed as a static site.
