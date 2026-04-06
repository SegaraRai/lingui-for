#[path = "support/svelte.rs"]
mod svelte_support;

use indoc::indoc;
use lean_string::LeanString;
use sourcemap::DecodedMap;

use lingui_analyzer::extract::build_synthetic_module;
use lingui_analyzer::framework::{FrameworkAdapter, svelte::SvelteAdapter};
use lingui_analyzer::{MacroFlavor, WhitespaceMode, build_synthetic_module_for_framework};

use svelte_support::analyze_options_for_svelte;

fn ls(text: &str) -> LeanString {
    LeanString::from(text)
}

#[test]
fn builds_synthetic_module_with_normalized_svelte_macros() {
    let source = indoc! {r#"
        <script>
          import { t as tt, plural } from "@lingui/core/macro";

          const direct = tt`Hello`;
          const eager = tt.eager({ id: "msg" });
          const reactive = $plural(count, { one: "item", other: "items" });
        </script>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let script = &analysis.semantic.scripts[0];
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &script.macro_imports,
        &script.candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");

    assert!(
        synthetic
            .source
            .contains("import { plural, t as tt } from \"@lingui/core/macro\";")
    );
    assert!(synthetic.source.contains("const __lf_0 = tt`Hello`;"));
    assert!(
        synthetic
            .source
            .contains("const __lf_1 = tt({ id: \"msg\" });")
    );
    assert!(
        synthetic
            .source
            .contains("const __lf_2 = plural(count, { one: \"item\", other: \"items\" });")
    );

    let flavors = script
        .candidates
        .iter()
        .map(|candidate| candidate.flavor)
        .collect::<Vec<_>>();
    assert_eq!(
        flavors,
        vec![
            MacroFlavor::Direct,
            MacroFlavor::Eager,
            MacroFlavor::Reactive
        ]
    );

    assert_eq!(synthetic.declaration_ids.len(), 3);
    assert_eq!(synthetic.mappings.len(), 3);
    assert!(synthetic.generated_spans["__lf_0"].start < synthetic.generated_spans["__lf_0"].end);
    assert!(synthetic.source_map_json.is_some());
}

#[test]
fn builds_synthetic_module_for_svelte_template_components() {
    let source = indoc! {r#"
        <script>
          import { Trans as T } from "lingui-for-svelte/macro";
        </script>

        <T id="root" />
        <T id="second">Hello</T>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let candidates = analysis
        .semantic
        .template_components
        .iter()
        .map(|component| component.candidate.clone())
        .collect::<Vec<_>>();
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &analysis.semantic.scripts[0].macro_imports,
        &candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");

    assert!(
        synthetic
            .source
            .contains("import { Trans as T } from \"lingui-for-svelte/macro\";")
    );
    assert!(
        synthetic
            .source
            .contains("const __lf_0 = <T id=\"root\" />;")
    );
    assert!(
        synthetic
            .source
            .contains("const __lf_1 = <T id=\"second\">Hello</T>;")
    );
    assert_eq!(synthetic.declaration_ids.len(), 2);
}

#[test]
fn groups_synthetic_imports_by_source() {
    let source = indoc! {r#"
        <script>
          import { t } from "@lingui/core/macro";
          import { Trans as T } from "lingui-for-svelte/macro";
          const direct = t`Hello`;
        </script>

        <T id="root" />
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let mut candidates = analysis.semantic.scripts[0].candidates.clone();
    candidates.extend(
        analysis
            .semantic
            .template_components
            .iter()
            .map(|component| component.candidate.clone()),
    );
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &analysis.semantic.scripts[0].macro_imports,
        &candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");

    assert!(
        synthetic
            .source
            .contains("import { t } from \"@lingui/core/macro\";")
    );
    assert!(
        synthetic
            .source
            .contains("import { Trans as T } from \"lingui-for-svelte/macro\";")
    );
    assert!(synthetic.source.contains("const __lf_0 = t`Hello`;"));
    assert!(
        synthetic
            .source
            .contains("const __lf_1 = <T id=\"root\" />;")
    );
}

#[test]
fn emits_lookupable_sourcemap_for_normalized_segments() {
    let source = indoc! {r#"
        <script>
          import { t } from "@lingui/core/macro";
          const eager = t.eager({ id: "msg" });
        </script>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &analysis.semantic.scripts[0].macro_imports,
        &analysis.semantic.scripts[0].candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");
    let map_json = synthetic.source_map_json.as_ref().expect("map exists");
    let decoded = DecodedMap::from_reader(map_json.as_bytes()).expect("source map decodes");
    let needle = "t({ id: \"msg\" })";
    let generated_offset = synthetic
        .source
        .find(needle)
        .expect("normalized code present");
    let generated = offset_to_position(&synthetic.source, generated_offset);
    let token = decoded
        .lookup_token(generated.0 as u32, generated.1 as u32)
        .expect("mapping exists");
    let original_offset =
        line_start(source, token.get_src_line() as usize) + token.get_src_col() as usize;

    assert_eq!(token.get_source(), Some("source"));
    assert!(source[original_offset..].starts_with("t.eager({ id: \"msg\" })"));
}

#[test]
fn emits_utf16_columns_for_unicode_prefixes() {
    let source = indoc! {r#"
        <script>
          import { t } from "@lingui/core/macro";
          const eager = t.eager({ id: "あ🙂" });
        </script>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &analysis.semantic.scripts[0].macro_imports,
        &analysis.semantic.scripts[0].candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");
    let map_json = synthetic.source_map_json.as_ref().expect("map exists");
    let decoded = DecodedMap::from_reader(map_json.as_bytes()).expect("source map decodes");
    let needle = "\"あ🙂\"";
    let generated_offset = synthetic.source.find(needle).expect("unicode code present");
    let generated = offset_to_utf16_position(&synthetic.source, generated_offset);
    let token = decoded
        .lookup_token(generated.0 as u32, generated.1 as u32)
        .expect("mapping exists");
    let original_offset = utf16_column_to_byte_offset(
        source,
        token.get_src_line() as usize,
        token.get_src_col() as usize,
    );

    assert_eq!(token.get_source(), Some("source"));
    assert!(source[original_offset..].starts_with("\"あ🙂\""));
}

#[test]
fn maps_component_declaration_start_to_component_message_anchor() {
    let source = indoc! {r#"
        <script>
          import { Trans as T } from "lingui-for-svelte/macro";
          const name = "Ada";
        </script>

        <T>Component origin {name}</T>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let candidates = analysis
        .semantic
        .template_components
        .iter()
        .map(|component| component.candidate.clone())
        .collect::<Vec<_>>();
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &analysis.semantic.scripts[0].macro_imports,
        &candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");
    let map_json = synthetic.source_map_json.as_ref().expect("map exists");
    let decoded = DecodedMap::from_reader(map_json.as_bytes()).expect("source map decodes");
    let generated_offset = synthetic.source.find("<T>").expect("component present");
    let generated = offset_to_utf16_position(&synthetic.source, generated_offset);
    let token = decoded
        .lookup_token(generated.0 as u32, generated.1 as u32)
        .expect("mapping exists");
    let original_offset = utf16_column_to_byte_offset(
        source,
        token.get_src_line() as usize,
        token.get_src_col() as usize,
    );

    assert!(source[original_offset..].starts_with("<T>Component origin "));
}

#[test]
fn merges_owned_svelte_nested_macro_normalization_into_parent_synthetic_source() {
    let source = indoc! {r#"
        <script lang="ts">
          import { msg, t as translate } from "lingui-for-svelte/macro";

          const summary = $derived(
            $translate(
              msg`参照中のパスは ${String(selectedPath ?? $translate`未設定`)} で、候補は ${String(
                relatedPaths[1] ?? $translate`ありません`,
              )} です。`,
            ),
          );
        </script>
    "#};

    let analysis = SvelteAdapter
        .analyze(source, &analyze_options_for_svelte(WhitespaceMode::Svelte))
        .expect("analysis succeeds");
    let script = &analysis.semantic.scripts[0];
    let source_name = ls("source");
    let synthetic = build_synthetic_module(
        &ls(source),
        &source_name,
        "synthetic.js",
        &script.macro_imports,
        &script.candidates,
        &analysis.metadata.source_anchors,
    )
    .expect("synthetic module builds");

    assert!(synthetic.source.contains("translate`未設定`"));
    assert!(synthetic.source.contains("translate`ありません`"));
    assert!(!synthetic.source.contains("$translate`未設定`"));
    assert!(!synthetic.source.contains("$translate`ありません`"));
}

#[test]
fn normalizes_owned_svelte_nested_macros_for_framework_extract_synthetic_source() {
    let source = indoc! {r#"
        <script lang="ts">
          import { msg, t as translate } from "lingui-for-svelte/macro";

          const summary = $derived(
            $translate(
              msg`参照中のパスは ${String(selectedPath ?? $translate`未設定`)} で、候補は ${String(
                relatedPaths[1] ?? $translate`ありません`,
              )} です。`,
            ),
          );
        </script>
    "#};

    let synthetic = build_synthetic_module_for_framework(
        &ls(source),
        &ls("source.svelte"),
        &ls("source.svelte?extract.tsx"),
        Some(WhitespaceMode::Svelte),
        &svelte_support::svelte_default_conventions(),
    )
    .expect("framework synthetic module builds");

    assert!(synthetic.source.contains("translate`未設定`"));
    assert!(synthetic.source.contains("translate`ありません`"));
    assert!(!synthetic.source.contains("$translate`未設定`"));
    assert!(!synthetic.source.contains("$translate`ありません`"));
}

fn offset_to_position(source: &str, offset: usize) -> (usize, usize) {
    let bounded = offset.min(source.len());
    let line_start = source[..bounded].rfind('\n').map_or(0, |index| index + 1);
    let line = source[..bounded]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count();
    (line, bounded - line_start)
}

fn offset_to_utf16_position(source: &str, offset: usize) -> (usize, usize) {
    let bounded = offset.min(source.len());
    let line_start = source[..bounded].rfind('\n').map_or(0, |index| index + 1);
    let line = source[..bounded]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count();
    let column = source[line_start..bounded]
        .chars()
        .map(char::len_utf16)
        .sum();
    (line, column)
}

fn line_start(source: &str, line: usize) -> usize {
    if line == 0 {
        return 0;
    }

    let mut seen = 0;
    for (index, byte) in source.bytes().enumerate() {
        if byte == b'\n' {
            seen += 1;
            if seen == line {
                return index + 1;
            }
        }
    }

    source.len()
}

fn utf16_column_to_byte_offset(source: &str, line: usize, utf16_column: usize) -> usize {
    let start = line_start(source, line);
    let mut offset = start;
    let mut seen_utf16 = 0;

    for ch in source[start..].chars() {
        if ch == '\n' {
            break;
        }
        if seen_utf16 >= utf16_column {
            break;
        }
        seen_utf16 += ch.len_utf16();
        offset += ch.len_utf8();
    }

    offset
}
