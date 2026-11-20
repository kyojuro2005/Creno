---
name: Data Engine Workspace
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#3130c0'
  on-tertiary: '#ffffff'
  tertiary-container: '#4b4dd8'
  on-tertiary-container: '#d9d8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  cell-data:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '450'
    lineHeight: 18px
    letterSpacing: 0em
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system blends **High-Density Utility** with **Modern Neo-SaaS Elegance**. Inspired by modular database interfaces and sleek productivity dashboards, the system prioritizes computational clarity, low cognitive fatigue during prolonged operations, and razor-sharp structural delineation.

### Brand Personality & Emotional Objectives
- **Precision & Authority:** Users must feel that critical revenue pipelines and data transformations are reliable, immediate, and error-resilient.
- **Fluid Efficiency:** Complex data operations (filtering, bulk editing, inline updates) feel weightless, tactile, and frictionless.
- **Polished Professionalism:** Deep slate foundations paired with crisp boundaries create an executive-grade environment without excessive decorative flourishes.

### Aesthetic Foundation
- **Style Direction:** Modern Structural Minimalism paired with Micro-Tactile Layering. Interfaces utilize hairline borders (`1px`), cool-slate tonal backgrounds, clear semantic badges, and subtle ambient shadows to separate active overlays and floating toolbars from dense grid canvases.

## Colors

The palette establishes an ultra-clean, high-legibility canvas optimized for dense numerical and text scanning.

### Semantic & Architectural Tokens
- **Background Root (`#F8FAFC`):** Soft, anti-glare canvas that minimizes eye fatigue across long data sessions.
- **Surface Elevation 1 (`#FFFFFF`):** High-contrast background for data cells, input controls, and cards.
- **Surface Elevation 2 (`#F1F5F9`):** Container background for toolbars, table column headers, and inactive states.
- **Borders & Dividers (`#E2E8F0`):** Hairline structure dividers ensuring clean matrix separation without visual clutter.
- **Primary Indigo (`#4F46E5` / Hover `#4338CA`):** Action-driving color reserved for primary triggers, active record selections, selected views, and progress states.
- **Deep Navy Text (`#0F172A`):** High-contrast, sharp typography anchor. Secondary labels and metadata use Slate 500 (`#64748B`).

### Lifecycle Status Semantic Hierarchy
Status badges utilize muted pastel fills with high-contrast text and solid indicator dots:
- **Nouveau (`#3B82F6`):** Soft background `#EFF6FF`, border `#BFDBFE`, text `#1D4ED8`.
- **Rappel (`#F59E0B`):** Soft background `#FFFBEB`, border `#FDE68A`, text `#B45309`.
- **Rendez-vous (`#8B5CF6`):** Soft background `#F5F3FF`, border `#DDD6FE`, text `#6D28D9`.
- **Vente (`#10B981`):** Soft background `#ECFDF5`, border `#A7F3D0`, text `#047857`.
- **Perdu (`#EF4444`):** Soft background `#FEF2F2`, border `#FECACA`, text `#B91C1C`.

## Typography

The typographic hierarchy is split into two specialized typefaces:
- **Primary Typeface (Hanken Grotesk):** Delivers clean geometry, balanced letterforms, and tight tracking for high-density reading across dashboards and data sheets.
- **Monospace Engine (JetBrains Mono):** Drives numeric values, currency, dates, IDs, pipeline counters, and metadata tags, guaranteeing strict tabular alignment across grid rows.

### Usage Standards
- Headings maintain strict negative letter spacing (`-0.01em` to `-0.02em`) to retain visual density.
- Cell values in the table grid adhere strictly to `cell-data` or `label-mono`, eliminating uneven wrapping.
- All numbers representing deal amounts and timestamps use tabular numerals (`font-variant-numeric: tabular-nums`).

## Layout & Spacing

The architecture operates on an adaptive full-bleed workspace layout configured for heavy data volume.

### Structural Framework
- **App Shell:** Composed of a fixed/collapsible left navigation sidebar (`240px` expanded, `64px` iconized, off-canvas on mobile), a persistent elevated top action toolbar (`48px` height), and an expansive fluid workspace canvas (`calc(100vw - sidebar)`).
- **Table Density Standards:**
  - Compact: `32px` row height (maximum density viewing).
  - Default: `40px` row height (balanced viewing with badges).
  - Comfortable: `48px` row height (detailed notes & avatars).
- **Responsive Adaptations:**
  - **Desktop (1024px+):** Multi-column grid tables with sticky identifier columns (Lead Name / ID), split view sidebar drawer for record previews, and visible filter controls.
  - **Tablet (768px - 1023px):** Collapsed icon-rail sidebar; horizontal scroll enabled on data matrices with locked left headers.
  - **Mobile (<768px):** Left navigation and record inspect drawers collapse into slide-over sheets (`100vw` or `calc(100vw - 48px)`); action toolbars collapse secondary items into an overflow drawer.

## Elevation & Depth

Visual hierarchy uses crisp boundaries paired with subtle ambient diffusion. Rather than heavy, floating shadows, depth communicates functional elevation:

### Layer Hierarchy
- **Level 0 (Base Canvas):** Background tone `#F8FAFC`. Zero elevation.
- **Level 1 (Data Grid & Cards):** Flat `#FFFFFF` bound by `1px` continuous border `#E2E8F0`. No drop shadow. Hover state triggers a subtle border highlight (`#CBD5E1`).
- **Level 2 (Active Dropdowns, Filter Menus & Flyouts):** Background `#FFFFFF`, border `1px solid #E2E8F0`, shadow `0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Modals & Record Drawers):** Background `#FFFFFF`, backdrop overlay `rgba(15, 23, 42, 0.4)` with `4px` blur filter, shadow `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`.
- **Level 4 (Sticky Cell Headers & Floating Selection Bars):** Top toolbars and floating bulk actions float with a soft edge shadow `0 10px 15px -3px rgba(15, 23, 42, 0.06)` and semi-translucent backdrop saturation (`rgba(255, 255, 255, 0.95)` with `backdrop-filter: blur(8px)`).

## Shapes

The design system employs a **Soft (Level 1)** geometric standard. Sharp precision is central to a table-driven CRM, making large rounding radii counterproductive.

### Geometry Rules
- **Base Components (Inputs, Buttons, Cells):** `0.25rem` (`4px`) to `0.375rem` (`6px`) corner radius. Maintains an orderly look when lined up in high-density tables.
- **Pill Exceptions:** Status badges and numeric counter tags use `9999px` fully-rounded capsules to differentiate them immediately from interactive rectangular controls and data cells.
- **Modals & Flyouts:** `0.5rem` (`8px`) for compact overlays; `0.75rem` (`12px`) maximum for centered import dialogue modals.

## Components

### Buttons
- **Primary:** Solid Electric Indigo background (`#4F46E5`), white text, `4px` radius. Subtle inner shadow highlight `inset 0 1px 0 rgba(255,255,255,0.2)`. Focus: `0 0 0 2px #FFFFFF, 0 0 0 4px #6366F1`.
- **Secondary / Outline:** White surface, `1px solid #E2E8F0`, text `#0F172A`. Hover: `#F8FAFC` background with border `#CBD5E1`.
- **Ghost Toolbar Buttons:** Transparent background, slate text (`#475569`), hover background `#F1F5F9`. Height `32px` for dense top-bar utility.

### Status Badges & Chips
- **Structure:** `20px` fixed height, inline-flex, `padding: 0 8px`, `font-size: 11px`, `font-weight: 600`, pill border-radius (`9999px`).
- **Indicator:** Contains a leading `6px` circular dot with a solid color matching the status tone:
  - *Nouveau:* Light blue container `#EFF6FF`, border `#BFDBFE`, text `#1D4ED8`, dot `#3B82F6`.
  - *Rappel:* Amber container `#FFFBEB`, border `#FDE68A`, text `#B45309`, dot `#F59E0B`.
  - *Rendez-vous:* Purple container `#F5F3FF`, border `#DDD6FE`, text `#6D28D9`, dot `#8B5CF6`.
  - *Vente:* Emerald container `#ECFDF5`, border `#A7F3D0`, text `#047857`, dot `#10B981`.
  - *Perdu:* Rose container `#FEF2F2`, border `#FECACA`, text `#B91C1C`, dot `#EF4444`.

### Spreadsheet Data Table
- **Header Cells:** Background `#F8FAFC`, uppercase `label-xs` font, border bottom `2px solid #E2E8F0`, right column divider `1px solid #E2E8F0`. Includes sort, filter, and drag handles on hover.
- **Body Cells:** Clean white canvas, hairline border `1px solid #F1F5F9`. Active cell on click receives an indigo focus border (`2px inset #4F46E5`).
- **Selection State:** Row background changes to `#EEF2FF` with a leading checkbox checked.

### Form Inputs & Cell Editors
- **Inline Inputs:** Clean transparent borders that transition on focus to `#FFFFFF` background with an indigo perimeter ring (`#4F46E5`).
- **Modal Inputs:** `36px` height, `#FFFFFF` background, `1px solid #CBD5E1`, text `#0F172A`. Placeholder `#94A3B8`.

### Checkboxes
- **Metrics:** `16px x 16px`, `3px` radius.
- **States:** Unchecked border `1.5px solid #CBD5E1`, checked solid `#4F46E5` with sharp white tick icon. Indeterminate state features a centered horizontal bar.

### Import Modal & Views Switcher
- **CSV/Excel Import Trigger Modal:** Centered dialog with an inner dashed drop zone (`2px dashed #CBD5E1`), background `#F8FAFC`, displaying drag-and-drop file targets with sheet field-mapping column lists.
- **Views Switcher:** Segmented inline controller in the primary toolbar. Active view styled with white chip background, slate shadow, and dark navy text; inactive tabs render in muted slate (`#64748B`).