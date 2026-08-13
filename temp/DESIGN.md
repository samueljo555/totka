---
name: Academic Excellence System
colors:
  surface: '#f8f9fb'
  surface-dim: '#d9dadc'
  surface-bright: '#f8f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f6'
  surface-container: '#edeef0'
  surface-container-high: '#e7e8ea'
  surface-container-highest: '#e1e2e4'
  on-surface: '#191c1e'
  on-surface-variant: '#444651'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f3'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#0060ac'
  on-secondary: '#ffffff'
  secondary-container: '#64a8fe'
  on-secondary-container: '#003c70'
  tertiary: '#00311f'
  on-tertiary: '#ffffff'
  tertiary-container: '#004a31'
  on-tertiary-container: '#27c38a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#d4e3ff'
  secondary-fixed-dim: '#a4c9ff'
  on-secondary-fixed: '#001c39'
  on-secondary-fixed-variant: '#004883'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9fb'
  on-background: '#191c1e'
  surface-variant: '#e1e2e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-max-width: 1280px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
---

## Brand & Style

The design system is engineered for a high-stakes National Exam Simulation (TKA) environment. The brand personality is **authoritative, focused, and supportive**, designed to reduce cognitive load while instilling confidence in students and educators.

The visual style follows **Corporate Modernism with a focus on Functional Minimalism**. This approach prioritizes content clarity and task completion above all else. By utilizing a systematic layout and a restrained aesthetic, the UI ensures that the student's primary focus remains on the examination material. The interface avoids unnecessary decorative elements, favoring structural alignment and clear visual hierarchies to guide the user through complex testing workflows.

## Colors

The color palette is strategically chosen to foster a professional and trustworthy educational environment:

*   **Primary (#1E3A8A):** Deep Blue is utilized for core navigation, headers, and primary actions to project authority and institutional stability.
*   **Secondary (#60A5FA):** Light Blue is used for interactive states, focus indicators, and highlighting active questions, providing a softer touch for user engagement.
*   **Success (#10B981):** Green is strictly reserved for positive outcomes, correct answers, and completion states.
*   **Neutral (#F3F4F6):** A range of cool grays provides the foundation for the UI, ensuring the canvas is unobtrusive and accessible.
*   **Surface:** Use pure white (`#FFFFFF`) for cards and question areas to maximize contrast and legibility.

## Typography

The design system utilizes **Inter** for all typographic needs. Inter is chosen for its exceptional legibility in digital interfaces and its neutral, systematic character.

*   **Hierarchy:** High contrast in weight (Bold vs. Regular) is used to distinguish between question stems and answer choices.
*   **Readability:** For long-form examination text, `body-lg` is the standard to prevent eye strain during extended sessions.
*   **Labels:** All data points and metadata (e.g., "Time Remaining," "Question 1 of 50") use `label-md` or `label-sm` with increased tracking for rapid scanning.

## Layout & Spacing

This design system employs a **Fixed Grid** model for desktop and a **Fluid Grid** for mobile devices.

*   **Desktop:** A 12-column grid with a maximum width of 1280px. This ensures that question text does not span too wide, which can hinder reading speed.
*   **Exam Interface:** A "Split Layout" is recommended for the simulation view. A narrow sidebar (4 columns) for question navigation and timer, and a wide main panel (8 columns) for the content.
*   **Spacing Rhythm:** An 8px linear scale is used to define all margins and padding. Use 24px (3 units) for standard gaps between elements and 48px (6 units) for section separations.

## Elevation & Depth

To maintain a focused and professional atmosphere, this design system uses **Tonal Layering** supplemented by **Low-Contrast Outlines**.

*   **Background:** The lowest layer is the base neutral gray (`#F3F4F6`).
*   **Surface:** Primary content areas (Question Cards, Sidebars) are white (`#FFFFFF`) with a subtle 1px border in a light gray (`#E5E7EB`).
*   **Elevation:** Shadows should be used sparingly. Use a single, soft ambient shadow (`0px 4px 12px rgba(30, 58, 138, 0.05)`) only for floating elements like modals or dropdown menus.
*   **Active State:** Use a 2px solid stroke of the Secondary Blue to indicate the currently selected answer or active input field.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a clean, modern aesthetic that feels approachable without appearing overly casual or "playful."

*   **Standard Elements:** Buttons, input fields, and checkboxes use `rounded` (4px).
*   **Containers:** Large cards and exam panels use `rounded-lg` (8px).
*   **Status Indicators:** Progress bar tracks and "Question Pill" navigators use `rounded-xl` (12px) to provide a distinct visual difference from functional interactive elements.

## Components

### Buttons
*   **Primary:** Solid Primary Blue background with White text. Used for "Submit Exam" or "Start Test."
*   **Secondary:** Outline Primary Blue with no fill. Used for "Previous" or "Save Draft."
*   **Action:** Solid Secondary Blue for "Next Question" to indicate forward momentum.

### Progress Bars & Timers
*   **Timer:** Displayed in a fixed top-right corner. Turns Red when less than 5 minutes remain. Use a monospaced variant of Inter for digits to prevent jitter.
*   **Progress:** A thin 8px bar at the top of the viewport. The track is light gray; the fill is the Success Green.

### Question Cards
*   White background with a 1px border. 
*   Clear separation between the Question Stem (Headline-MD) and Options (Body-MD).
*   Options should have a large tap/click target area and highlight on hover.

### Data Tables (Admin/Management)
*   Condensed row heights for data density.
*   Header rows in Primary Blue or Dark Gray with White/Light Gray text.
*   Zebra-striping using the Neutral Gray to assist in horizontal scanning across scores and student IDs.

### Role-Specific Dashboards
*   **Student:** Focused on "Next Steps" and "Recent Scores" using large, clear cards.
*   **Admin:** Focused on "Analytics" and "User Management" using the data table styles and small, metric-focused cards.