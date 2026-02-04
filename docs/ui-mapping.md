# UI Mapping Rules (Translation Cheatsheet)

This guide maps common web UI patterns to React Native equivalents for this repo (RN + NativeWind). Use it to translate HTML/React web UI to RN components and styling.

## Element / Component Mapping

| Web (HTML/React) | React Native | Notes |
| --- | --- | --- |
| `div`, `section`, `main`, `header`, `footer`, `nav` | `View` | Use `View` for layout containers. Use `SafeAreaView` when screen edges matter. |
| `span`, `p`, `h1`-`h6`, `label`, `strong`, `em` | `Text` | Prefer `Text` for all inline or block text. |
| `button` | `Pressable` | Use `Pressable` with `onPress` and optional `android_ripple`. |
| `a` | `Pressable` + `Linking` | If navigation is in-app, use the router; otherwise use `Linking.openURL`. |
| `input` (text) | `TextInput` | Use `value`, `onChangeText`, `placeholder`. |
| `input` (checkbox) | `Switch` or custom | RN has `Switch`; custom UI may be needed. |
| `textarea` | `TextInput` | Set `multiline` and `numberOfLines`. |
| `img` | `Image` | Use `source={{ uri }}` or static `require`. |
| `ul` / `ol` / `li` | `View` + `Text` | Build lists with `FlatList` when data-driven. |
| `form` | `View` | Handle submit via handlers, not DOM events. |
| `hr` | `View` | Use `View` with `height: 1` and background color. |
| `svg` | `react-native-svg` | Use `Svg` components or static images. |

## Styling Mapping

| Web | React Native / NativeWind |
| --- | --- |
| `className="..."` | `className="..."` (NativeWind) |
| `style={{ ... }}` | `style={{ ... }}` (RN style objects) |
| `display: flex` | RN uses flex by default |
| `gap` | Prefer `gap-*` classes (NativeWind) or manual margins |
| `position: fixed` | Use `position: 'absolute'` and manage layout |

## Layout & Interaction Patterns

- **Flex direction**: RN defaults to `flexDirection: 'column'` instead of `row`.
- **Spacing**: Use NativeWind `p-*`, `m-*`, `gap-*` utilities or RN style objects.
- **Clickable areas**: Prefer `Pressable` and add `hitSlop` for small targets.
- **Text styling**: Use `Text` with className (NativeWind) or `style` (RN), not nested DOM tags.

## Examples

**Web**

```html
<div className="p-4">
  <button className="rounded bg-blue-600 text-white">Save</button>
  <input className="mt-2 w-full border" placeholder="Name" />
</div>
```

**React Native**

```tsx
<View className="p-4">
  <Pressable className="rounded bg-blue-600 px-3 py-2" onPress={onSave}>
    <Text className="text-white">Save</Text>
  </Pressable>
  <TextInput
    className="mt-2 w-full border border-gray-300 px-3 py-2"
    placeholder="Name"
    value={name}
    onChangeText={setName}
  />
</View>
```
