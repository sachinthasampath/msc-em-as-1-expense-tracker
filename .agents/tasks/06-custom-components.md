# 06 — Custom Components

See [`00-overview.md`](./00-overview.md) for context. These three components satisfy the assignment's "one or more custom control/component(s) implemented by the student" requirement. Each needs to be documented in the submission doc with its props/events table (copy the tables below) and a short explanation of how it functions internally — write that explanation once you've actually built it, since it should describe the real implementation, not this spec.

All three live under `src/components/ui/` (see [`01-source-structure.md`](./01-source-structure.md)) and must not depend on a pre-built UI/component library for their *core* rendering or gesture logic — using `react-native-svg`, `react-native-gesture-handler`, and `react-native-reanimated` as low-level primitives is fine and expected; using a ready-made gauge/swipeable-list/camera-UI package would defeat the requirement.

## 1. `SpendingGauge` (`src/components/ui/spending-gauge.tsx`)

Radial/circular progress gauge showing actual spend against a predicted or budgeted target. Built with `react-native-svg` (`Svg`, `Circle` for the track, `Path` or a stroked `Circle` with `strokeDasharray`/`strokeDashoffset` for the progress arc) — no gauge/chart library.

Used on the Dashboard (actual vs. a user-set budget, before the AI feature exists — see build order step 4 in `00-overview.md`) and later on the Predictions screen (actual-so-far vs. AI-predicted total).

| Prop | Type | Description |
|---|---|---|
| `actual` | `number` | Current spend amount to represent |
| `target` | `number` | Amount the gauge is measured against — a budget on the Dashboard, the AI `predictedTotal` on the Predictions screen |
| `formattedActual` | `string?` | Pre-formatted display string; if omitted the component renders the raw number |
| `formattedTarget` | `string?` | As above |
| `size` | `number?` | Diameter in px, default `160` |
| `thresholds` | `{ warning: number; over: number }?` | Ratio cutoffs driving the arc color, default `{ warning: 0.8, over: 1 }` |
| `onPressDetails` | `() => void?` | Fired when the gauge is tapped (e.g. navigate to the category breakdown) |
| `accessibilityLabel` | `string?` | Overrides the generated label |
| `testID` | `string?` | For the per-state UI tests in [`07-ai-prediction.md`](./07-ai-prediction.md) |

Four changes from the first draft of this table, each for a reason:

- **`predicted` → `target`.** The gauge's *first* consumer is the Dashboard showing actual-vs-**budget**, before the AI feature exists at all (build order step 4). A prop named `predicted` receiving a budget is the kind of small lie that makes code hard to read six weeks later. `target` is true at both call sites.
- **`status` → `thresholds`.** The old API made the caller compute `'ok' | 'warning' | 'over'`, which means the 80%/100% cutoffs get duplicated at both call sites and drift apart the first time one is edited. Passing the thresholds keeps the component stateless (it still decides nothing about *your* data) while keeping the policy in one place.
- **`currency` → pre-formatted strings.** A bare currency code implies the component formats money, which means `Intl` — and Hermes' `Intl` support is a recurring source of "works in dev, wrong on device" bugs. Format outside, pass strings in.
- **Accessibility props added.** See the note at the end of this file.

Behavior notes: the arc fill ratio is `clamp(actual / target, 0, 1)` for the drawn arc, but when `actual > target` the component should still visually indicate overflow (the arc colors to the over state, plus a small numeric "+N% over" label) rather than capping silently. Controlled and stateless; no data fetching, no internal state beyond animation values.

**Guard `target === 0`.** This is not a hypothetical: it is the exact state of a brand-new user on the Dashboard before they've set a budget — the component's very first render in the app. `actual / 0` is `Infinity` (or `NaN` when `actual` is also 0), which flows into `strokeDashoffset` and renders as a blank or inexplicably full arc. Render an explicit "no target set" empty state instead. Decide the `actual < 0` case too, once refunds exist.

## 2. `SwipeableCardItem` (`src/components/ui/swipeable-card-item.tsx`)

Swipe-to-reveal list item for the saved cards screen. Built directly on `react-native-gesture-handler`'s `Gesture.Pan()` and `react-native-reanimated`'s `useSharedValue`/`useAnimatedStyle`/`withSpring` — **not** gesture-handler's bundled `Swipeable` component, since that would be "a pre-built swipeable-list component," not a hand-built one.

| Prop | Type | Description |
|---|---|---|
| `card` | `Pick<Card, 'id' \| 'nickname' \| 'last4' \| 'cardType'>` | The card data to render in the resting state. Derive from the shared domain type in `src/types/`, don't re-declare the shape inline — an inline copy drifts from the schema the first time a column changes |
| `isOpen` | `boolean` | Whether this row is currently swiped open. **Controlled by the parent** |
| `onRequestOpen` | `(id: string) => void` | Row wants to open; parent sets its `openCardId` to this id |
| `onRequestClose` | `(id: string) => void` | Row wants to close |
| `onEdit` | `(id: string) => void` | Called when the revealed Edit action is pressed |
| `onDelete` | `(id: string) => void` | Called when the revealed Delete action is pressed |
| `swipeThreshold` | `number?` | Horizontal px of drag required to snap open, default `80` |
| `disabled` | `boolean?` | When true, ignores pan gestures entirely (e.g. while a sync is in flight for this row) |
| `testID` | `string?` | For list/interaction tests |

**The old API could not implement its own spec.** The first draft said "only one row open at a time — the parent list screen owns which card id is currently open," but gave the component no `isOpen` prop and no way to be told to close. The parent had no mechanism to do the job the doc assigned it. `isOpen` + `onRequestOpen`/`onRequestClose` is the standard controlled-component shape and makes the single-open-row rule trivially enforceable (`openCardId === card.id`).

Note also that the old `onSwipeOpen()`/`onSwipeClose()` passed no arguments, while `onEdit(id)`/`onDelete(id)` passed an id the parent already had — exactly backwards. The callbacks that need the id are the ones telling the parent *which* row changed.

Behavior notes: pan gesture drives a shared `translateX` bounded between `0` and `-actionsWidth` (measure the actions container with `onLayout`; it isn't a fixed constant); crossing `swipeThreshold` or releasing past it snaps open via `withSpring`, otherwise back to `0`; a tap anywhere on the row while open closes it.

Four implementation details that are easy to get wrong:

- **Constrain the pan axis.** Inside a scrolling list, an unconstrained `Gesture.Pan()` steals vertical scroll — the row drags when the user is trying to scroll past it. Set `.activeOffsetX([-10, 10])` and `.failOffsetY([-10, 10])`. This is the single most common bug in hand-built swipeable rows.
- **`runOnJS` comes from `react-native-worklets`.** `onRequestOpen`/`onRequestClose` fire from gesture and animation callbacks, which run on the UI thread and cannot call JS directly. In Reanimated **v4** (this project is on 4.5.1) worklets moved to a separate package — importing `runOnJS` from `react-native-reanimated` is a v2/v3 habit that fails here.
- **`GestureHandlerRootView` must wrap the app root** in `src/app/_layout.tsx`, or every gesture in this component silently does nothing on Android — with no error to explain it.
- **Handle `disabled` flipping mid-gesture.** The stated use case is "while a sync is in flight", which can become true at any moment. Reset `translateX` to its resting position rather than leaving the row stranded half-open.

**Delete needs a confirmation.** An irreversible action behind a single swipe, with no undo, will eventually delete a card by accident. Either confirm, or make it an undoable soft delete with a brief "Undo" affordance — the data layer already soft-deletes ([`04-offline-sync.md`](./04-offline-sync.md)), so undo is genuinely cheap here.

Performance: wrap in `React.memo` and keep the callbacks stable (`useCallback` in the parent), or every row re-renders on every parent state change — including each time `openCardId` changes.

## 3. `ReceiptCaptureOverlay` (`src/components/ui/receipt-capture-overlay.tsx`)

Camera capture + crop overlay for attaching a receipt photo to a payment — this is the assignment's graded native-hardware integration (camera). Built on `expo-camera`'s `CameraView` (current SDK 57 API — see `00-overview.md`'s API table) plus hand-drawn, Reanimated-driven draggable crop corner handles, with the actual crop performed by `expo-image-manipulator`'s `manipulateAsync`.

| Prop | Type | Description |
|---|---|---|
| `onCancel` | `() => void` | Called when the user backs out without capturing |
| `onCapture` | `(result: { uri: string; width: number; height: number; mimeType: string; fileSize: number }) => void` | Event: fired with the final cropped image once confirmed |
| `onError` | `(error: { code: 'permission-denied' \| 'camera-unavailable' \| 'capture-failed' \| 'crop-failed'; message: string }) => void` | Event: fired when the flow cannot continue |
| `cropAspectRatio` | `number?` | Optional fixed aspect ratio to constrain the crop box to; default `undefined` = free-form crop |
| `maxDimension` | `number?` | Longest edge of the saved image in px, default `2000` |
| `testID` | `string?` | For interaction tests |

**`visible` is gone.** The first draft had both a `visible` prop *and* described the component as a modal route — but a route is mounted and unmounted by the router, so the prop is redundant. Worse, keeping a `CameraView` mounted with `visible={false}` holds the camera hardware open and drains the battery. Let the route control lifetime.

**`onError` is new, and necessary.** The old prop table had no way to report permission denial, an unavailable camera, or a failed capture — the flow could only succeed or be cancelled. Permission-denied in particular needs its own UI state with a "open Settings" affordance, since the user cannot grant it from inside the app once they've permanently denied it.

Add an **`onRetake`** affordance inside the crop step too: with only confirm and `onCancel`, a blurry shot forces the user out of the whole flow and back in.

**`maxDimension` is a sync concern, not a nicety.** A modern phone camera produces multi-megabyte JPEGs, and these upload through the offline outbox ([`04-offline-sync.md`](./04-offline-sync.md)) — large files mean slow, failure-prone drains on bad connections. The Storage bucket now also enforces a 5 MB limit, so an unresized capture can be rejected outright. Add a `resize` action before saving.

Internal flow (for the submission doc's "how it functions" section, confirm against the real implementation once built):
1. Camera preview via `CameraView`, with a shutter button calling `cameraRef.current.takePictureAsync()`.
2. On capture, switch to crop mode: render the captured still with 4 draggable corner handles (`Gesture.Pan()` per handle, bounded to stay within the image's rendered bounds and, if `cropAspectRatio` is set, constrained to maintain it).
3. **Normalize EXIF orientation before computing anything.** `takePictureAsync` on Android frequently returns an image whose EXIF orientation flag differs from what the preview showed. Cropping in raw pixel space without accounting for that produces crops that are rotated, offset, or both — and it reproduces only on some devices, which makes it miserable to debug later. Either pass `exif: false` / request an already-rotated image, or apply the rotation as the first manipulation action. **This is the single most common bug in hand-rolled crop UIs; handle it deliberately and write it up.**
4. "Confirm crop" computes the crop rectangle in original-image pixel coordinates (accounting for the scale factor between the displayed preview size and the actual captured resolution) and runs the manipulation. **Use the current contextual API, not the deprecated `manipulateAsync` free function** (see the API table in [`00-overview.md`](./00-overview.md) — an earlier draft of these docs wrongly called the legacy function fully supported):
   ```ts
   const context = useImageManipulator(uri);
   const ref = await context
     .crop({ originX, originY, width, height })
     .resize({ width: maxDimension })      // bound the upload size
     .renderAsync();
   const result = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
   ```
   Note the result is an `ImageRef` — `saveAsync()` is what yields `{ uri, width, height }`.
5. `onCapture` fires with the uri, dimensions, mime type and file size — the Storage upload path needs the mime type for its `contentType`, and the size to check against the bucket's 5 MB limit before attempting the upload.
5. A secondary "choose from gallery" affordance uses `expo-image-picker` to pick an existing photo and feeds it into the *same* crop-mode UI from step 2 onward — documented as a secondary, non-core entry path; the camera path is what satisfies the graded native-hardware requirement, the gallery path is just a UX convenience reusing the same crop code.

Also define the **`cropAspectRatio` anchor rule**: with four independently draggable corners and a fixed ratio, dragging one corner must move the others, and you have to say which point stays put. Anchor the corner diagonally opposite the one being dragged. "Constrained to maintain it" isn't a specification.

Required permissions: camera (`useCameraPermissions` from `expo-camera`) and, for the gallery path, media-library read permission (`expo-image-picker` requests this itself). Both need permission-string entries in `app.json`'s `expo-camera`/`expo-image-picker` config plugin blocks — neither block exists yet. Per the SDK 57 docs the camera plugin takes `cameraPermission` (iOS `NSCameraUsageDescription`, Android `CAMERA`).

`expo-camera` **is** included in Expo Go on SDK 57, so this can be developed without a dev build — but it needs a **physical device**, since a simulator has no camera.

## Accessibility and testability (applies to all three)

None of the three prop tables originally carried accessibility or `testID` props, and `07-ai-prediction.md` plans per-state UI tests with nothing to target. Treat these as part of the component contract, not polish — and they're straightforward marks in a UI/UX-graded submission:

- **`SpendingGauge`** is a progress indicator: `accessibilityRole="progressbar"` with `accessibilityValue={{ min, max, now }}` and a label that states the actual, the target and the status *in words*. Status is currently conveyed by **arc color alone**, which is invisible to a colour-blind user — the "+N% over" label should not be exclusive to the over state. If `onPressDetails` is set, add `accessibilityRole="button"` and `hitSlop`. Gate the fill animation on `AccessibilityInfo.isReduceMotionEnabled()`.
- **`SwipeableCardItem`**'s actions are completely unreachable by VoiceOver, TalkBack and Switch Control — a swipe gesture is not an accessible affordance. Add `accessibilityActions={[{ name: 'edit' }, { name: 'delete' }]}` with an `onAccessibilityAction` handler, and label the revealed buttons.
- **`ReceiptCaptureOverlay`**: a four-handle crop UI cannot be driven by a screen reader at all. Provide a labelled "use the whole image" path as the accessible alternative, and label the shutter button.
- All three take `style` and `accessibilityLabel` passthrough, plus `testID`.

## A note on the "hand-built" requirement

The assignment asks for custom components implemented by the student, and the three differ in how strong that claim is — worth knowing before you decide what to foreground in the submission doc:

- **`SwipeableCardItem` is the strongest.** It's genuine gesture and animation work built directly on `Gesture.Pan()` and Reanimated primitives, and it explicitly avoids gesture-handler's ready-made `Swipeable`. Lead with this one.
- **`SpendingGauge` is solid but thin** — a stroked SVG circle driven by `strokeDasharray`/`strokeDashoffset`. The arc math, the overflow handling and the threshold logic are what make it non-trivial, so implement those properly rather than treating them as edge cases.
- **`ReceiptCaptureOverlay` is the weakest claim**, and it's worth being clear-eyed about that: the camera preview is a library component and the crop is a library call, so most of the file is composition. The student-built part is the crop-handle gesture math and the preview→original-pixel coordinate transform (including the EXIF normalization above). Foreground *that* in the write-up, and let the other two carry the requirement.
