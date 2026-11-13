---
"unplugin-lingui-macro": minor
---

Add a `native` option that transforms macros with the native (Rust + SWC) transformer from `@lingui/native-tools` instead of Babel. Macro options from an inline `config` object (such as `macro.jsxPlaceholderAttribute`) are now passed through to the transform instead of being dropped.
