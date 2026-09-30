---
version: alpha
name: Liner Notes
description: Design system for Guess the Song — a music guessing game played solo or in rooms with friends, on phones and laptops, often at night. Set like the inside of a record booklet.

colors:
  # Light theme — booklet paper and offset ink
  primary: "#1E1814"
  primary-hover: "#3C332F"
  secondary: "#615953"
  tertiary: "#8E2A2B"
  tertiary-subtle: "#F8E0DB"
  success: "#2E558F"
  success-subtle: "#DDE9F6"
  neutral: "#EEE9DF"
  surface: "#F8F4EC"
  on-surface: "#1E1814"
  border: "#CDC6BC"
  error: "{colors.tertiary}"
  # Stage inks — the gig-poster pair, brand moments only
  stage-violet: "#5B3FD6"
  stage-coral: "#C4522C"
  # Dark theme — black gatefold stock and cream ink
  dark-primary: "#ECE6D8"
  dark-primary-hover: "#D2CAB9"
  dark-secondary: "#A7A097"
  dark-tertiary: "#DE7C6C"
  dark-tertiary-subtle: "#3A1D1B"
  dark-success: "#86B6E5"
  dark-success-subtle: "#162638"
  dark-neutral: "#1E1A16"
  dark-surface: "#13100D"
  dark-on-surface: "#ECE6D8"
  dark-border: "#3C3732"
  dark-error: "{colors.dark-tertiary}"
  dark-stage-violet: "#8B6CFF"
  dark-stage-coral: "#FF8F62"

typography:
  poster:
    fontFamily: Archivo
    fontSize: 128px
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: -0.035em
    fontVariation: "'wdth' 88"
  display:
    fontFamily: Newsreader
    fontSize: 88px
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: -0.03em
    fontVariation: "'opsz' 72"
  headline-lg:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.02em
    fontVariation: "'opsz' 60"
  headline-md:
    fontFamily: Newsreader
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.012em
    fontVariation: "'opsz' 36"
  title-md:
    fontFamily: Newsreader
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.005em
    fontVariation: "'opsz' 24"
  body-lg:
    fontFamily: Newsreader
    fontSize: 19px
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'opsz' 18"
  body-md:
    fontFamily: Newsreader
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
    fontVariation: "'opsz' 16"
  body-sm:
    fontFamily: Newsreader
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'opsz' 14"
  label-md:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.08em
    fontFeature: "'case' 1"
  label-caps:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0.12em
    fontFeature: "'case' 1"
  data-display:
    fontFamily: IBM Plex Mono
    fontSize: 64px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.02em
    fontFeature: "'tnum' 1, 'zero' 1"
  data-md:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  data-sm:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.02em
    fontFeature: "'tnum' 1"

rounded:
  none: 0px
  sm: 2px
  tile: 10px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  xxl: 96px
  gutter: 24px
  margin: 48px
  margin-mobile: 16px

components:
  # ── Light ──────────────────────────────────────────────────────
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  sleeve:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  rule:
    backgroundColor: "{colors.border}"
    height: 1px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: 48px
  track-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: 72px
  track-row-correct:
    backgroundColor: "{colors.success-subtle}"
    textColor: "{colors.on-surface}"
  track-row-wrong:
    backgroundColor: "{colors.tertiary-subtle}"
    textColor: "{colors.on-surface}"
  mark-correct:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.label-caps}"
  mark-wrong:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-caps}"
  live-marker:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.none}"
    padding: "{spacing.xs}"
  credit:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.data-sm}"
  readout:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-display}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm}"
    height: 48px
  input-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.body-sm}"
  toast:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  avatar:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    size: 32px
  # Stage layer (day)
  wordmark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.poster}"
  button-brand:
    backgroundColor: "{colors.stage-violet}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 32px
    height: 56px
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 32px
    height: 56px
  chip:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    height: 44px
  waveform-start:
    backgroundColor: "{colors.stage-violet}"
    width: 3px
  waveform-end:
    backgroundColor: "{colors.stage-coral}"
    width: 3px
  cover-tile:
    rounded: "{rounded.tile}"
    size: 170px
  # ── Dark ───────────────────────────────────────────────────────
  page-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-md}"
  sleeve-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  rule-dark:
    backgroundColor: "{colors.dark-border}"
    height: 1px
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: 48px
  button-primary-dark-hover:
    backgroundColor: "{colors.dark-primary-hover}"
    textColor: "{colors.dark-surface}"
  button-secondary-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
    height: 48px
  track-row-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.title-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: 72px
  track-row-correct-dark:
    backgroundColor: "{colors.dark-success-subtle}"
    textColor: "{colors.dark-on-surface}"
  track-row-wrong-dark:
    backgroundColor: "{colors.dark-tertiary-subtle}"
    textColor: "{colors.dark-on-surface}"
  mark-correct-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-success}"
    typography: "{typography.label-caps}"
  mark-wrong-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-tertiary}"
    typography: "{typography.label-caps}"
  live-marker-dark:
    backgroundColor: "{colors.dark-tertiary}"
    textColor: "{colors.dark-surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.none}"
    padding: "{spacing.xs}"
  credit-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-secondary}"
    typography: "{typography.data-sm}"
  readout-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.data-display}"
  input-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm}"
    height: 48px
  input-error-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-error}"
    typography: "{typography.body-sm}"
  toast-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  avatar-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    size: 32px
  # Stage layer (night)
  wordmark-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.poster}"
  button-brand-dark:
    backgroundColor: "{colors.dark-stage-violet}"
    textColor: "{colors.dark-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 32px
    height: 56px
  button-outline-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 32px
    height: 56px
  chip-dark:
    backgroundColor: "{colors.dark-neutral}"
    textColor: "{colors.dark-on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    height: 44px
  waveform-start-dark:
    backgroundColor: "{colors.dark-stage-violet}"
    width: 3px
  waveform-end-dark:
    backgroundColor: "{colors.dark-stage-coral}"
    width: 3px
---

# Liner Notes

## Overview

Guess the Song is a music quiz: a clip plays, four song titles sit underneath, you have ten seconds. It is played in bursts — a round on the bus, a room of six friends on a sofa at 1am, one phone passed around. The songs are the content and the reason anyone is here. The interface's job is to present them the way music has always presented itself on paper: **as a record booklet**.

The direction is **Editorial Print, specifically the liner notes of an LP or CD booklet** — a large serif for the song, a typewriter-plain mono for the credits (track numbers, running times, catalog numbers, scores), hairline rules, uncoated paper, two inks. Every screen should look like it could have been folded into a jewel case. The reveal after each question is literally a credit: *Blinding Lights — The Weeknd. After Hours, 2019.*

**Two layers, strictly separated.** The booklet is the inside of the record: everything you read, choose, or score — tracklists, credits, the disc, the leaderboard — in two inks, square, flat, and quiet. The **stage** is the outside of the record: the sleeve and the gig poster. It appears only at brand moments — the poster wordmark, the hero's two big buttons and chips, the waveform, and the floating cover tiles on the title screen, plus the waveform flourish on the results, lobby and final-standings screens. The stage is where the fun lives: a violet→coral poster ink, pill shapes, a soft glow, tilted sleeves drifting in the background. It never crosses into the booklet. A tracklist row is never violet; a credit is never a pill.

What this gives up, deliberately: **arcade excitement inside the game itself**. There is no confetti, no bouncing score, no neon in the answer list. A correct answer gets a blue-pencil tick in the margin, not fireworks. The excitement is spent up front, on the cover, so that once the needle drops the screen gets out of the way of the music. The bet is that music people find a well-set credit more satisfying than a slot-machine flash. Both themes are first-class and designed as separate printings — daytime is ink on booklet stock, night is cream ink on a black gatefold — not one palette inverted.

The music-native devices from the first version survive and carry the identity: the spinning disc countdown, the equalizer bars, and numbered answer tracks. The generic parts (an indigo accent everywhere, glass headers, emoji icons, Inter) are gone; the violet survives only as a stage ink with one job.

## Colors

Two inks on paper, in each of two printings. Everything is sampled from how music is printed, and every neutral carries a warm tint (OKLCH hue bending from ≈82° in the paper to ≈55° in the ink, chroma 0.008–0.016). No value in the system has R = G = B, and neither theme uses pure white or pure black.

**Daytime printing — ink on booklet stock**

- **Surface (#F8F4EC):** *Uncoated booklet paper.* The page. Faintly cream, never white, because liner notes are printed on matte stock that has been handled.
- **Neutral (#EEE9DF):** *The inner sleeve.* A half-step darker paper for panels that sit on the page — the lobby, the settings sheet, the quiz editor's track list. It is a different paper stock, not a floating card.
- **Primary / On-surface (#1E1814):** *Offset black.* Warm near-black process ink. Carries all text and is the fill of the primary button: actions in this system are printed in ink, not colored in.
- **Primary-hover (#3C332F):** The same ink at a lighter impression, for hover and pressed states only.
- **Secondary (#615953):** *Credit grey.* Artist names, album and year, catalog numbers, timestamps, anything that would be set small in a credits column. 6.2:1 on paper. Also the stroke color for input underlines, because the hairline rule is too faint to mark a control boundary.
- **Border (#CDC6BC):** *Hairline rule.* Divides tracks in a list and sections on a page. Decorative only (1.5:1) — it never marks the edge of something you can click.
- **Tertiary (#8E2A2B):** *Red Seal oxblood* — the deep red of RCA's Red Seal record labels, and the red of a proofreader's pen. It has exactly one job: **the red pen.** It marks the live and the urgent: the countdown's last three seconds, the "now playing" marker, a wrong answer's strike-through, and form errors. It never fills a primary button and never decorates. Under 5% of any screen.
- **Tertiary-subtle (#F8E0DB):** The red pen's wash — the tint behind a track you picked wrong.
- **Success (#2E558F):** *Editor's blue pencil.* The copy editor's approval mark. It marks correct answers (a tick in the margin), your points gained, and "saved" confirmations. Red pen and blue pencil sit on the red/blue axis, which stays distinguishable for the most common colour-vision deficiencies — a deliberate choice over the usual red/green.
- **Success-subtle (#DDE9F6):** The blue pencil's wash — the tint behind the correct track after a reveal.
- **Error:** an alias of Tertiary. In this system an error *is* a red-pen mark; a separate stock alert red would be a third ink.

**Night printing — cream ink on a black gatefold**

The dark theme is the inside of a black-sleeved gatefold printed in cream ink. It is a separate printing with its own values, not an inversion.

- **Dark-surface (#13100D) / Dark-neutral (#1E1A16):** *Black board stock* and a lifted panel of the same board. Warm, never `#000`: pure black halates against cream type and smears on OLED during scroll.
- **Dark-on-surface / Dark-primary (#ECE6D8):** *Cream ink.* Text and primary-button fill. Deliberately not white; white type on black board looks like a screen, cream looks printed.
- **Dark-primary-hover (#D2CAB9):** Cream at a heavier impression.
- **Dark-secondary (#A7A097):** Credit grey, lifted for the dark board (7.3:1).
- **Dark-border (#3C3732):** The hairline, cut into black stock.
- **Dark-tertiary (#DE7C6C):** Red Seal, re-inked for black board. Oxblood collapses to near-invisible on dark ground, so the night printing uses a lighter vermilion-leaning red (6.5:1) with slightly less chroma. Same single job.
- **Dark-success (#86B6E5):** The blue pencil, lifted to read on black (8.9:1).
- **Dark-tertiary-subtle (#3A1D1B) / Dark-success-subtle (#162638):** The two washes, re-mixed dark.
- **Dark-error:** alias of Dark-tertiary.

**Stage inks — the gig-poster pair**

The sleeve is printed in two poster inks that never appear in the booklet: **stage violet** (#5B3FD6 by day, #8B6CFF at night) and **stage coral** (#C4522C / #FF8F62) — the two-colour overprint of a basement-show flyer. Their only uses: the violet→coral gradient on "the Song" in the wordmark, the waveform bars (violet fading to coral across their length), the fill and glow of the one brand button (*Play now*), and the outline of its partner (*Play with friends*). Brand-button text is paper on the day violet (6.1:1) and **black board on the night violet** (5.1:1) — white on the lighter night violet fails at 3.7:1, so the night printing inverts it. The cover tiles use five muted sleeve fields (plum, moss, navy, rust, teal) each carrying one brighter motif ink; they are decorative, carry no text, and appear only behind the title screen hero.

Every colored text pair in both printings clears 5:1 against the background it is used on; the lowest is the night red pen on its own wash at 5.25:1, and the night brand button at 5.1:1.

## Typography

Two families, split the way a booklet splits them: **the song in a serif, the credits in a mono.**

**Newsreader** carries the voice — the title screen, song titles, reveals, headings, and all running prose. It is a variable serif drawn for editorial use, with a real optical-size axis: `opsz 72` at display sizes gives thin hairlines and tight apertures that look set for a cover, while `opsz 14–18` at body sizes opens the counters and thickens the strokes so it survives a phone screen at night. That axis is why one family can do both the 88px title and the 15px caption without a second serif. Italic is used for exactly one thing: the artist name in a credit line (*The Weeknd*), as in printed liner notes. Fallback: `Newsreader, "Source Serif 4", Georgia, serif`. SIL Open Font License, on Google Fonts.

**IBM Plex Mono** carries the apparatus — track numbers, the countdown, scores, room codes, catalog numbers, button labels, and every uppercase label. Liner-note credits were typed, and a monospace keeps the numbers honest: tabular figures (`'tnum' 1`) keep the score column and the countdown from jittering, and the slashed zero (`'zero' 1`) on the big readout stops a room code like `D0CE` from being misread. It is chosen over JetBrains Mono because its slightly humanist, typewriter-derived shapes sit comfortably next to a book serif rather than looking like code. Fallback: `"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace`. SIL Open Font License, on Google Fonts.

**Archivo** is the stage face, and only the stage face: the `poster` wordmark, set at 800 weight, uppercase, in a compressed width (`wdth 88`) with 0.88 leading so "GUESS / THE SONG" stacks like a gig poster. It appears nowhere in the booklet. Fallback: `Archivo, "Archivo Narrow", "Helvetica Neue", Arial, sans-serif`. SIL Open Font License, on Google Fonts. This is the one deliberate third family, and it has exactly one job.

The serif scale runs on ≈1.333 (15 → 17 → 21 → 30 → 48) and is broken at the top: `display` jumps to 88px so the title screen reads as a cover, not a larger heading. Tracking is optical — −0.03em at display, −0.02em at 48px, neutral through body, +0.08em on mono button labels and +0.12em on the smallest uppercase labels. Line height runs inversely, 0.95 at display to 1.6 at body. **Two weights only: 400 and 600.** Song titles in the answer list are 600 because they are the thing being chosen; everything else is 400, and hierarchy comes from size, family, and space. The display is 400, not bold — a high-contrast serif at `opsz 72` has all the weight it needs.

## Layout

A **12-column grid**, 24px gutters, 48px outer margins on desktop, collapsing to one column with 16px margins below 640px. Spacing runs on an **8px base** with a 4px half-step inside labels and markers; nothing sits off the scale.

**The cover is centered; the booklet is flush-left.** The title screen opens with the stage: a centered hero (eyebrow, poster wordmark, waveform, tagline, the two brand buttons, a row of chips, a stat line) with cover tiles drifting at the edges. That is the only centered composition in the system. Below a hairline, the booklet begins and never centers again: *Side A · Solo* sets "Pick a record." at the left over five columns while the categories run down the right-hand columns as a numbered tracklist with catalog numbers; *Side B · With friends* follows under the same list. Every other screen is flush-left. Running text is capped at **62 characters**.

**The game screen is a track sheet.** At the top, a credits strip in mono: `TRACK 03 / 10`, the score, the streak, the countdown. Below, the four answers are a **numbered tracklist**, not a grid of cards: each row is a track number in mono (`01`–`04`, keyboard 1–4 still work), the title in Newsreader 600, and the artist in italic, separated by hairline rules. The list is one column at every width, which also removes the 2×2 layout that made answers hard to scan in order.

**Density varies by screen on purpose.** The title, reveal, and results screens are sparse and set large — they are the "cover". The answer list, leaderboard, lobby, and quiz editor are dense and set small with rules between rows — they are the "credits". A player should know which kind of screen they are on before reading a word.

## Elevation & Depth

The booklet is **flat**. There are no drop shadows in it, including dialogs and toasts, and no glass or blur anywhere. The stage has exactly two lit elements: the brand button carries a soft violet glow (`0 8px 28px` at 28% violet by day, 40% at night) because it is the single thing the title screen asks you to press, and cover tiles cast a deep shadow in the night printing only, so the sleeves read as objects floating over black board. Nothing else is allowed a shadow.

Depth comes from three printing devices:

1. **Paper stock.** Surface and Neutral (Dark-surface and Dark-neutral at night) are two stocks a half-step apart. A panel is a different sheet laid on the page, not an object hovering over it.
2. **Hairline rules.** 1px in `border` / `dark-border`, used to *divide* — between tracks, between sections, above a credit line. Rules run edge to edge of their column; they do not wrap around content to make boxes.
3. **Space.** Related items sit 8px apart, groups 24px, sections 48–96px. Most things that look like they need a shadow need more space instead.

Dialogs sit on Neutral with a 1px `on-surface` rule on all four sides — the only full box in the system, so being boxed is itself the signal that something is on top. The scrim behind them is a flat wash of `on-surface` at 40% (Dark: `dark-surface` at 70%), with no blur.

## Shapes

**Square, with two exceptions that are both round for a reason.**

In the booklet, rows, panels, inputs, dialogs, markers, and the album art after a reveal all use `none` (0px) — they are cut paper. Booklet buttons use `sm` (2px), just enough to read as a pressable object rather than a printed block. `full` circles are reserved for **the record and the people**: the vinyl-disc countdown and player avatars.

The stage is rounder on purpose, because it is the playful half: the two hero buttons and the chips (*Make a quiz*, *How to play*, filters on the leaderboard and quiz editor) are `full` pills, and cover tiles use `tile` (10px) — the soft corner of a card sleeve. Pills never appear inside a tracklist, a credit, or a form.

Borders: controls that take input (text fields, the room-code box, the search field) are drawn as a **1px underline in `secondary`** (`dark-secondary` at night), which clears 3:1 against the page, becoming a 2px underline in `on-surface` on focus. Secondary buttons get a full 1px `on-surface` outline. Focus rings everywhere are a 2px `on-surface` outline offset by 3px (`dark-on-surface` at night) — ink, not the red pen, because focus is not an alarm. These values are normative even though the token schema has no border sub-token.

## Motion

Motion exists to show that something **changed state**, and nothing else.

- **120ms, ease-out:** button press, row hover (a 1px rule thickening to 2px), focus.
- **200ms, ease-out:** screen changes (a crossfade, no slide), a toast appearing.
- **320ms, ease-in-out:** the reveal — the blue-pencil tick draws itself (stroke animation) and the album art replaces the disc.
- **Continuous:** the disc spins at 33⅓ rpm while the clip plays and stops dead when it ends; the equalizer bars move only while audio is actually playing.
- **Stage drift:** on the title screen the cover tiles drift 14px up and down on a slow 7-second ease-in-out, each out of phase, and the hero waveform pulses — the only motion that plays with no audio behind it, and only on the stage.

**What does not animate:** booklet content on load (no fade-up, no staggered entrances), the score (it updates, it does not count up), headings, the answer list appearing. There is no confetti and there are no particle bursts. With reduced motion or "Animations off" (a toggle in the top bar and in Settings), the disc, bars, waveform and tiles hold still and the tick appears without drawing.

## Components

**Stage: wordmark, brand buttons, chips, waveform, cover tiles.** The wordmark is two stacked lines of `poster` type — "Guess" in ink, "the Song" in the violet→coral gradient — sized up to 128px and never smaller than 64px. Under it, the waveform: 28–48 thin bars of fixed, pseudo-random heights, coloured violet→coral along their length. The brand button (*Play now*, with a ▶ glyph) is a 56px violet pill with a glow; its partner (*Play with friends*) is the same pill outlined in violet. The chips beneath are 44px neutral pills in serif 600. Cover tiles (disc, square, or bar-chart motifs; 120–180px; rotated −10° to +9°) sit at the edges of the hero, never behind text, and fade out below 900px. A stat line (`310 songs · 16 categories · 3 modes · your best`) closes the hero with numbers in mono.

**Top bar.** One mono caps line: `GTS · LINER NOTES` on the left, then *Solo · With friends · My quizzes · Leaderboard | How to play · Animations on · Day printing · Settings*. The printing toggle is labeled with the printing you would switch *to*. On phones the two toggles move into Settings only.

**Buttons.** Primary is solid ink (`primary`, cream at night) with paper-colored mono uppercase text, 2px radius, 48px tall — one per screen: *Play*, *Next track*, *Start game*. Secondary is paper with a 1px ink outline. There is no tertiary, ghost, or colored button; the red pen never fills a button. Hover lightens the ink impression (`primary-hover`); there is no lift, scale, or shadow.

**Track rows (answers).** The core component. 72px minimum height, full column width, hairline rule below each. Contents left to right: track number (`data-md`, `secondary`), title (`title-md`), artist in Newsreader italic on the line below. After a reveal:
- *Correct pick:* row takes `success-subtle`; a blue-pencil tick and the word `CORRECT` (`mark-correct`) appear in the right margin.
- *Wrong pick:* row takes `tertiary-subtle`; the title gets a 2px red-pen strike-through and `YOUR ANSWER ✗` (`mark-wrong`) in the margin.
- *The right answer you missed:* the blue-pencil tick circles its track number and `CORRECT ANSWER` appears — no fill, because you didn't pick it.
- *Everything else:* text drops to `secondary`.
State is always carried by a mark and a word, never by the tint alone.

**Credits strip (in-game header).** One mono line: `TRACK 03 / 10 · 1,450 PTS · STREAK 3 · 07`. Sticky, on the page color with a hairline below — no blur. The countdown is ink until the last three seconds, when it switches to the `live-marker` (red-pen fill, paper text).

**Readout.** `data-display` (64px mono, tabular, slashed zero) for the final score, the countdown inside the disc, and the room code in the lobby. Always ink; the only readout that may turn red is the countdown, via `live-marker`.

**Disc.** The spinning countdown record keeps its role: black vinyl with fine grooves, a paper label in the center carrying the countdown digits in `data-display`. In daylight the vinyl is `primary` ink; at night it is `dark-neutral` with `dark-border` grooves so it stays visible on black board.

**Credit line.** Used wherever a song is revealed or listed: title in Newsreader, *artist* in italic, then `ALBUM · YEAR` in `credit` (mono, `secondary`). The results recap, reveal, leaderboard sub-lines, and quiz-editor track list all use this same line.

**Catalog numbers instead of icons.** Categories, modes, and quizzes carry a catalog number the way record labels number releases — `GTS-101 POP`, `GTS-104 K-POP`, `GTS-210 80s`, custom quizzes `GTS-Q ROAD TRIP` — set in `label-caps`. They replace every emoji icon in the current UI. The only non-typographic marks in the system are the blue-pencil tick, the red-pen strike and ✗, the disc, and the equalizer.

**Inputs.** Paper background, 1px `secondary` underline, `body-md` text at full size, because room codes and names are typed on phones. Error: underline and message in the red pen (`input-error`), always with a written message.

**Toasts.** Ink block with paper text (`toast`), square except the 2px button-matching corners, bottom-left, 200ms in, gone after 3s. At night: cream block, black text.

**Avatars (multiplayer).** Circles in ink with the player's initial in paper-colored mono. Players are told apart by name and position in the list, never by a generated color — the rainbow of hue-hashed avatars goes.

**Leaderboard and scoreboards.** Tables, not cards: rank in mono, name in serif, score right-aligned in mono with tabular figures, hairline between rows, the current player's row in `neutral` with a `YOU` label. Medals are not emoji; positions 1–3 are set in `title-md` instead of `data-md`.

## Do's and Don'ts

- **Do** keep the stage inks (violet, coral, the gradient, the glow) on the stage: wordmark, hero buttons and chips, waveform, cover tiles. If violet appears on a tracklist row, a credit, a mark, a form, or a booklet button, remove it.
- **Do** keep the red pen (`tertiary` / `dark-tertiary`) to its one job: live, urgent, or wrong. If it appears on a button, a heading, a link, or a decoration, remove it. Its meaning depends entirely on being rare.
- **Don't** introduce another ink in the booklet. Anything that wants emphasis gets size, weight 600, or space — not a new color.
- **Do** design every screen in both printings before calling it done. Check the night printing first on anything with the red pen or the brand button: oxblood does not survive on black board, and white text fails on the night violet.
- **Don't** use emoji anywhere in the interface — not for categories, modes, streaks (`STREAK 3`, not 🔥3), medals, or buttons. Use catalog numbers and words. The only glyphs are ♪ in the hero eyebrow, ▶ on the play button, the tick, and ✗.
- **Do** set every number in IBM Plex Mono with tabular figures — scores, timers, track numbers, room codes, percentages, years in credits. A number in Newsreader is a bug.
- **Don't** center anything below the hero. Titles, reveals, empty states, results, and dialogs are all flush-left. The hero and the digit inside the disc are the only centered things.
- **Do** mark every answer state with a word and a mark (tick, strike, ✗) as well as a tint. Players are in dim rooms and some can't separate the washes.
- **Don't** add shadows, blur, or glass in the booklet — including the sticky credits strip, dialogs, and toasts. The brand-button glow and the night cover-tile shadow are the only shadows in the system.
- **Don't** wrap things in cards by default. Answers are a tracklist, the leaderboard is a table, a quiz's songs are a list with rules. A panel (`sleeve`) is for a genuinely separate sheet: the room settings, a dialog, the matching progress in the quiz editor.
- **Do** keep album artwork square with no radius and no shadow, and show it only after a reveal. Before a reveal the page shows no artwork, title, or artist that could give the answer away.
- **Don't** add a fourth family or a third booklet weight. Newsreader and Plex Mono carry the booklet at 400/600; Archivo carries only the wordmark. If a heading doesn't read as a heading, it needs more space above it, not a bolder cut.
- **Do** let the disc spin and the equalizer move only while audio is actually playing, and hold them still the moment it stops or when animations are off.
