use tree_sitter::Node;

use crate::common::{Span, span_text};

pub(crate) fn collect_lingui_directive_spans(
    source: &str,
    root: Node<'_>,
    base_offset: usize,
) -> Vec<Span> {
    let mut spans = Vec::new();
    collect_from_node(source, root, base_offset, &mut spans);
    spans
}

fn collect_from_node(source: &str, node: Node<'_>, base_offset: usize, spans: &mut Vec<Span>) {
    // Some framework grammars expose JSX-style comment-only interpolations as
    // their enclosing `{...}` node instead of a nested JavaScript `comment`.
    if matches!(node.kind(), "comment" | "html_interpolation")
        && lingui_directive_body(node_text(source, node)).is_some()
    {
        spans.push(Span::from_node(node).shifted(base_offset));
        return;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_from_node(source, child, base_offset, spans);
    }
}

fn node_text<'a>(source: &'a str, node: Node<'_>) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}

pub(crate) fn render_lingui_directive(source: &str, span: Span) -> Option<String> {
    lingui_directive_body(span_text(source, span)).map(|body| format!("/* {body} */\n"))
}

fn lingui_directive_body(comment: &str) -> Option<&str> {
    let mut body = comment.trim();
    if let Some(inner) = body
        .strip_prefix('{')
        .and_then(|text| text.strip_suffix('}'))
    {
        body = inner.trim();
    }
    body = if let Some(inner) = body.strip_prefix("//") {
        inner
    } else if let Some(inner) = body
        .strip_prefix("/*")
        .and_then(|text| text.strip_suffix("*/"))
    {
        inner
    } else {
        body.strip_prefix("<!--")
            .and_then(|text| text.strip_suffix("-->"))?
    };

    let body = body.trim();
    ["lingui-set", "lingui-reset"].into_iter().find_map(|name| {
        body.strip_prefix(name)
            .filter(|rest| rest.is_empty() || rest.starts_with(char::is_whitespace))
            .map(|_| body)
    })
}

#[cfg(test)]
mod tests {
    use crate::syntax::parse::{parse_astro, parse_svelte, parse_typescript};

    use super::{collect_lingui_directive_spans, lingui_directive_body};

    #[test]
    fn recognizes_javascript_jsx_and_html_comment_directives() {
        assert_eq!(
            lingui_directive_body("// lingui-set context=\"settings\""),
            Some("lingui-set context=\"settings\"")
        );
        assert_eq!(
            lingui_directive_body("{/* lingui-reset */}"),
            Some("lingui-reset")
        );
        assert_eq!(
            lingui_directive_body("<!-- lingui-set idPrefix=\"page.\" -->"),
            Some("lingui-set idPrefix=\"page.\"")
        );
        assert_eq!(lingui_directive_body("/* lingui-setting */"), None);
    }

    #[test]
    fn only_collects_parser_recognized_comments() {
        let script = r#"
          const example = '// lingui-set context="ignored"';
          // lingui-reset
        "#;
        let script_tree = parse_typescript(script).expect("TypeScript parses");
        assert_eq!(
            collect_lingui_directive_spans(script, script_tree.root_node(), 0).len(),
            1
        );

        let markup = r#"
          <p>// lingui-set context="ignored"</p>
          {/* lingui-set context="jsx" */}
          <!-- lingui-reset -->
        "#;
        let astro_tree = parse_astro(markup).expect("Astro parses");
        assert_eq!(
            collect_lingui_directive_spans(markup, astro_tree.root_node(), 0).len(),
            2
        );
    }

    #[test]
    fn collects_all_framework_comment_forms() {
        let astro = r#"---
// lingui-set context="frontmatter-line"
/* lingui-reset context="frontmatter-block" */
---
{/* lingui-set context="jsx" */}
<!-- lingui-reset context="html" -->
"#;
        let astro_tree = parse_astro(astro).expect("Astro parses");
        assert_eq!(
            collect_lingui_directive_spans(astro, astro_tree.root_node(), 0).len(),
            2,
            "the outer Astro tree contains the JSX and HTML forms"
        );

        let svelte = r#"<script>
// lingui-set context="script-line"
/* lingui-reset context="script-block" */
</script>
<!-- lingui-set context="html" -->
{true /* lingui-reset context="expression" */}
"#;
        let svelte_tree = parse_svelte(svelte).expect("Svelte parses");
        assert_eq!(
            collect_lingui_directive_spans(svelte, svelte_tree.root_node(), 0).len(),
            1,
            "the outer Svelte tree directly contains the HTML comment form"
        );
    }
}
