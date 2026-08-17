---
name: Productivity Precision
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#464555'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  sidebar_width: 240px
  gutter: 16px
  margin_desktop: 24px
  component_padding_x: 12px
  component_padding_y: 8px
---

## Brand & Style

This design system is built on the principles of **High-Utility Minimalism**. It prioritizes focus and speed by stripping away visual noise, drawing inspiration from macOS native utility and modern developer tools. 

The aesthetic is characterized by:
- **Spatial Clarity:** Generous whitespace used as a functional tool to separate concerns rather than just for decoration.
- **Micro-interactions:** Subtle transitions and state changes that provide immediate feedback without distracting the user.
- **Information Density:** A compact but legible scale that allows power users to see more data at once without feeling overwhelmed.
- **Intentionality:** Every line, shadow, and color choice serves a specific functional purpose, primarily navigation or action confirmation.

## Colors

The palette is intentionally restrained to maximize the "Calm Tech" atmosphere. 

- **Surface Strategy:** Use `#FFFFFF` for primary content areas (cards, editors, main canvas) and `#F9FAFB` for structural elements like sidebars and background layers to create a subtle sense of hierarchy.
- **Typography:** Use `#111827` for high-contrast readability in headings and body text. Use `#4B5563` for secondary information and metadata.
- **Accents:** The indigo accent (`#4F46E5`) is reserved exclusively for primary calls to action, active navigation states, and focused input indicators. 
- **Separators:** Use a thin, 1px border of `#E5E7EB` for all structural divisions. Avoid heavy shadows for separation.

## Typography

This design system utilizes **Inter** for its neutral, systematic character. The type scale is optimized for desktop productivity.

- **Weight Selection:** Use Semi-Bold (`600`) for headers to create clear landmarks. Use Medium (`500`) for functional labels and buttons to ensure they stand out from body text.
- **Readability:** Body text is set at `14px` (`body-md`) for standard density, with `16px` (`body-lg`) reserved for long-form reading or empty state descriptions.
- **Tracking:** Apply a slight negative letter-spacing to larger headlines to maintain a tight, professional appearance.

## Layout & Spacing

The layout follows a **structured sidebar-to-canvas model** common in professional macOS applications.

- **The Sidebar:** Fixed at `240px`. It should utilize the secondary background color (`#F9FAFB`) to frame the primary workspace.
- **The Grid:** A fluid content area with a maximum readable width of `1200px` for centered content, or full-width for data-heavy views. 
- **Spacing Scale:** Based on a 4px baseline. Most components should use `8px` or `12px` for internal padding to maintain a compact, "pro" feel.
- **Margins:** A consistent `24px` margin should be maintained around the main application window's primary content block.

## Elevation & Depth

Elevation is communicated primarily through **Tonal Layering** and **Minimalist Borders** rather than heavy shadows.

- **Level 0 (Floor):** `#F9FAFB` used for the application background and sidebars.
- **Level 1 (Card/Surface):** `#FFFFFF` with a 1px `#E5E7EB` border. This is the primary container for content.
- **Level 2 (Popovers/Menus):** `#FFFFFF` with a 1px border and a very soft, diffused shadow (`0 4px 12px rgba(0,0,0,0.05)`).
- **Active State:** Elements being dragged or interacted with should use a slightly more pronounced shadow to indicate detachment from the grid.

## Shapes

The shape language is "Soft-Modern," utilizing an 8px (`0.5rem`) standard radius for most UI components.

- **Standard Elements:** Buttons, input fields, and cards use the `rounded` (8px) token.
- **Small Elements:** Checkboxes and tags use the `rounded-sm` (4px) token to prevent them from appearing too circular.
- **Large Containers:** Modals or large dashboard cards can scale up to `rounded-lg` (16px) to soften the overall interface.

## Components

### Buttons
- **Primary:** Background `#4F46E5`, Text `#FFFFFF`. No shadow, or a 1px inset top-border for a subtle "pressed" feel.
- **Secondary:** Background `#FFFFFF`, Border `#E5E7EB`, Text `#111827`. Hover state shifts background to `#F9FAFB`.
- **Ghost:** No background or border. Text `#4B5563`. Used for low-emphasis actions in sidebars or toolbars.

### Input Fields
- Use a `1px` border of `#E5E7EB`. On focus, the border color changes to `#4F46E5` with a subtle `2px` indigo outer glow (low opacity).

### Sidebar Items
- Active state should use a subtle `#EEF2FF` (light indigo tint) background with indigo text, or a simple left-aligned vertical bar indicator.

### Lists & Tables
- Row height should be compact (`36px` to `40px`). Use horizontal separators only. Hovering over a row should trigger a background color shift to `#F9FAFB`.

### Chips & Tags
- Use a light grey background (`#F3F4F6`) with `12px` (`label-sm`) typography. Keep padding tight: `2px` top/bottom, `8px` left/right.