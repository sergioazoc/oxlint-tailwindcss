/**
 * CSS property names (standard, SVG and `-ms-`), from csstype's `*PropertiesHyphen`
 * interfaces, minus the 15 that are also Tailwind classes (`flex`, `grid`, `border`,
 * `container`, `transition`, …). A test holds that no name here is a class.
 *
 * An object key with one of these names is a style declaration, never a class:
 * Solid, Vue, Qwik and Lit's `styleMap` take kebab-case keys, which the default
 * `^styles?$` variable pattern reaches (`const style = { 'background-color': c }`).
 * `-webkit-` / `-moz-` keys are matched by prefix instead; `-ms-` only by name,
 * since `-ms-4` is a negative margin.
 */
export const CSS_PROPERTY_NAMES: ReadonlySet<string> = new Set(
  `
  -ms-accelerator -ms-block-progression -ms-content-zoom-chaining -ms-content-zoom-limit
  -ms-content-zoom-limit-max -ms-content-zoom-limit-min -ms-content-zoom-snap
  -ms-content-zoom-snap-points -ms-content-zoom-snap-type -ms-content-zooming -ms-filter -ms-flex
  -ms-flex-direction -ms-flex-positive -ms-flow-from -ms-flow-into -ms-grid-columns -ms-grid-rows
  -ms-high-contrast-adjust -ms-hyphenate-limit-chars -ms-hyphenate-limit-lines
  -ms-hyphenate-limit-zone -ms-hyphens -ms-ime-align -ms-line-break -ms-order -ms-overflow-style
  -ms-overflow-x -ms-overflow-y -ms-scroll-chaining -ms-scroll-limit -ms-scroll-limit-x-max
  -ms-scroll-limit-x-min -ms-scroll-limit-y-max -ms-scroll-limit-y-min -ms-scroll-rails
  -ms-scroll-snap-points-x -ms-scroll-snap-points-y -ms-scroll-snap-type -ms-scroll-snap-x
  -ms-scroll-snap-y -ms-scroll-translation -ms-scrollbar-arrow-color -ms-scrollbar-base-color
  -ms-scrollbar-darkshadow-color -ms-scrollbar-face-color -ms-scrollbar-highlight-color
  -ms-scrollbar-shadow-color -ms-scrollbar-track-color -ms-text-autospace
  -ms-text-combine-horizontal -ms-text-overflow -ms-touch-action -ms-touch-select -ms-transform
  -ms-transform-origin -ms-transition -ms-transition-delay -ms-transition-duration
  -ms-transition-property -ms-transition-timing-function -ms-user-select -ms-word-break
  -ms-wrap-flow -ms-wrap-margin -ms-wrap-through -ms-writing-mode accent-color align-content
  align-items align-self align-tracks alignment-baseline all anchor-name anchor-scope animation
  animation-composition animation-delay animation-direction animation-duration
  animation-fill-mode animation-iteration-count animation-name animation-play-state
  animation-range animation-range-end animation-range-start animation-timeline
  animation-timing-function appearance aspect-ratio backdrop-filter backface-visibility
  background background-attachment background-blend-mode background-clip background-color
  background-image background-origin background-position background-position-x
  background-position-y background-repeat background-size baseline-shift block-size border-block
  border-block-color border-block-end border-block-end-color border-block-end-style
  border-block-end-width border-block-start border-block-start-color border-block-start-style
  border-block-start-width border-block-style border-block-width border-bottom
  border-bottom-color border-bottom-left-radius border-bottom-right-radius border-bottom-style
  border-bottom-width border-color border-end-end-radius border-end-start-radius border-image
  border-image-outset border-image-repeat border-image-slice border-image-source
  border-image-width border-inline border-inline-color border-inline-end border-inline-end-color
  border-inline-end-style border-inline-end-width border-inline-start border-inline-start-color
  border-inline-start-style border-inline-start-width border-inline-style border-inline-width
  border-left border-left-color border-left-style border-left-width border-radius border-right
  border-right-color border-right-style border-right-width border-spacing border-start-end-radius
  border-start-start-radius border-style border-top border-top-color border-top-left-radius
  border-top-right-radius border-top-style border-top-width border-width bottom
  box-decoration-break box-shadow box-sizing break-after break-before break-inside caption-side
  caret caret-color caret-shape clear clip clip-path clip-rule color color-adjust
  color-interpolation color-interpolation-filters color-rendering color-scheme column-count
  column-fill column-gap column-rule column-rule-color column-rule-style column-rule-width
  column-span column-width columns contain contain-intrinsic-block-size contain-intrinsic-height
  contain-intrinsic-inline-size contain-intrinsic-size contain-intrinsic-width container-name
  container-type content content-visibility counter-increment counter-reset counter-set cursor cx
  cy d direction display dominant-baseline empty-cells field-sizing fill fill-opacity fill-rule
  filter flex-basis flex-direction flex-flow float flood-color flood-opacity font font-family
  font-feature-settings font-kerning font-language-override font-optical-sizing font-palette
  font-size font-size-adjust font-smooth font-stretch font-style font-synthesis
  font-synthesis-position font-synthesis-small-caps font-synthesis-style font-synthesis-weight
  font-variant font-variant-alternates font-variant-caps font-variant-east-asian
  font-variant-emoji font-variant-ligatures font-variant-numeric font-variant-position
  font-variation-settings font-weight font-width forced-color-adjust gap
  glyph-orientation-vertical grid-area grid-auto-columns grid-auto-flow grid-auto-rows
  grid-column grid-column-end grid-column-start grid-row grid-row-end grid-row-start
  grid-template grid-template-areas grid-template-columns grid-template-rows hanging-punctuation
  height hyphenate-character hyphenate-limit-chars hyphens image-orientation image-rendering
  image-resolution initial-letter initial-letter-align inline-size inset inset-block
  inset-block-end inset-block-start inset-inline inset-inline-end inset-inline-start
  interpolate-size isolation justify-content justify-items justify-self justify-tracks left
  letter-spacing lighting-color line-break line-clamp line-height line-height-step list-style
  list-style-image list-style-position list-style-type margin margin-block margin-block-end
  margin-block-start margin-bottom margin-inline margin-inline-end margin-inline-start
  margin-left margin-right margin-top margin-trim marker marker-end marker-mid marker-start mask
  mask-border mask-border-mode mask-border-outset mask-border-repeat mask-border-slice
  mask-border-source mask-border-width mask-clip mask-composite mask-image mask-mode mask-origin
  mask-position mask-size mask-type masonry-auto-flow math-depth math-shift math-style
  max-block-size max-height max-inline-size max-lines max-width min-block-size min-height
  min-inline-size min-width mix-blend-mode motion motion-distance motion-path motion-rotation
  object-fit object-position object-view-box offset offset-anchor offset-distance offset-path
  offset-position offset-rotate offset-rotation opacity order orphans outline-color
  outline-offset outline-style outline-width overflow overflow-anchor overflow-block
  overflow-clip-box overflow-clip-margin overflow-inline overflow-wrap overflow-x overflow-y
  overlay overscroll-behavior overscroll-behavior-block overscroll-behavior-inline
  overscroll-behavior-x overscroll-behavior-y padding padding-block padding-block-end
  padding-block-start padding-bottom padding-inline padding-inline-end padding-inline-start
  padding-left padding-right padding-top page paint-order perspective perspective-origin
  place-content place-items place-self pointer-events position position-anchor position-area
  position-try position-try-fallbacks position-try-order position-visibility print-color-adjust
  quotes r right rotate row-gap ruby-align ruby-merge ruby-overhang ruby-position rx ry scale
  scroll-behavior scroll-initial-target scroll-margin scroll-margin-block scroll-margin-block-end
  scroll-margin-block-start scroll-margin-bottom scroll-margin-inline scroll-margin-inline-end
  scroll-margin-inline-start scroll-margin-left scroll-margin-right scroll-margin-top
  scroll-padding scroll-padding-block scroll-padding-block-end scroll-padding-block-start
  scroll-padding-bottom scroll-padding-inline scroll-padding-inline-end
  scroll-padding-inline-start scroll-padding-left scroll-padding-right scroll-padding-top
  scroll-snap-align scroll-snap-margin scroll-snap-margin-bottom scroll-snap-margin-left
  scroll-snap-margin-right scroll-snap-margin-top scroll-snap-stop scroll-snap-type
  scroll-timeline scroll-timeline-axis scroll-timeline-name scrollbar-color scrollbar-gutter
  scrollbar-width shape-image-threshold shape-margin shape-outside shape-rendering speak-as
  stop-color stop-opacity stroke stroke-color stroke-dasharray stroke-dashoffset stroke-linecap
  stroke-linejoin stroke-miterlimit stroke-opacity stroke-width tab-size table-layout text-align
  text-align-last text-anchor text-autospace text-box text-box-edge text-box-trim
  text-combine-upright text-decoration text-decoration-color text-decoration-line
  text-decoration-skip text-decoration-skip-ink text-decoration-style text-decoration-thickness
  text-emphasis text-emphasis-color text-emphasis-position text-emphasis-style text-indent
  text-orientation text-overflow text-rendering text-shadow text-size-adjust text-spacing-trim
  text-transform text-underline-offset text-underline-position text-wrap-mode text-wrap-style
  timeline-scope top touch-action transform-box transform-origin transform-style
  transition-behavior transition-delay transition-duration transition-property
  transition-timing-function translate unicode-bidi user-select vector-effect vertical-align
  view-timeline view-timeline-axis view-timeline-inset view-timeline-name view-transition-class
  view-transition-name visibility white-space white-space-collapse widows width will-change
  word-break word-spacing word-wrap writing-mode x y z-index zoom
  `
    .trim()
    .split(/\s+/),
)
