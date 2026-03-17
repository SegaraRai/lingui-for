use serde::{Deserialize, Serialize};
use tree_sitter::Node;

use crate::parse::parse_astro;

#[derive(thiserror::Error, Debug)]
pub enum AstroAnalyzerError {
    #[error("tree-sitter failed to parse input")]
    ParseFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ByteRange {
    pub start: usize,
    pub end: usize,
}

impl ByteRange {
    fn from_node(node: Node<'_>) -> Self {
        Self {
            start: node.start_byte(),
            end: node.end_byte(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct TextPoint {
    pub row: usize,
    pub column: usize,
}

impl From<tree_sitter::Point> for TextPoint {
    fn from(value: tree_sitter::Point) -> Self {
        Self {
            row: value.row,
            column: value.column,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct FrontmatterBlock {
    pub range: ByteRange,
    pub content_range: ByteRange,
    pub start: TextPoint,
    pub end: TextPoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum AstroExpressionKind {
    HtmlInterpolation,
    AttributeInterpolation,
    AttributeBacktickString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct AstroExpression {
    pub kind: AstroExpressionKind,
    pub range: ByteRange,
    pub inner_range: ByteRange,
    pub start: TextPoint,
    pub end: TextPoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum AstroTagKind {
    Normal,
    SelfClosing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct AstroComponentCandidate {
    pub tag_name: String,
    pub tag_kind: AstroTagKind,
    pub range: ByteRange,
    pub tag_name_range: ByteRange,
    pub tag_start_range: ByteRange,
    pub start: TextPoint,
    pub end: TextPoint,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct AstroAnalysis {
    pub frontmatter: Option<FrontmatterBlock>,
    pub expressions: Vec<AstroExpression>,
    pub component_candidates: Vec<AstroComponentCandidate>,
    pub has_errors: bool,
}

pub fn analyze_astro(source: &str) -> Result<AstroAnalysis, AstroAnalyzerError> {
    let tree = parse_astro(source)?;
    let root = tree.root_node();

    let frontmatter = find_frontmatter(root);
    let mut expressions = Vec::new();
    let mut component_candidates = Vec::new();
    collect_analysis(source, root, &mut expressions, &mut component_candidates);

    Ok(AstroAnalysis {
        frontmatter,
        expressions,
        component_candidates,
        has_errors: root.has_error(),
    })
}

fn find_frontmatter(root: Node<'_>) -> Option<FrontmatterBlock> {
    let mut cursor = root.walk();
    root.children(&mut cursor)
        .find(|node| node.kind() == "frontmatter")
        .map(|node| {
            let content = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "frontmatter_js_block");

            let content_range = content.map(ByteRange::from_node).unwrap_or(ByteRange {
                start: node.start_byte(),
                end: node.start_byte(),
            });

            FrontmatterBlock {
                range: ByteRange::from_node(node),
                content_range,
                start: node.start_position().into(),
                end: node.end_position().into(),
            }
        })
}

fn collect_analysis(
    source: &str,
    node: Node<'_>,
    expressions: &mut Vec<AstroExpression>,
    component_candidates: &mut Vec<AstroComponentCandidate>,
) {
    match node.kind() {
        "html_interpolation" => expressions.push(AstroExpression {
            kind: AstroExpressionKind::HtmlInterpolation,
            range: ByteRange::from_node(node),
            inner_range: inner_range_from_delimiters(node, 1, 1),
            start: node.start_position().into(),
            end: node.end_position().into(),
        }),
        "attribute_interpolation" => {
            let inner = node
                .children(&mut node.walk())
                .find(|child| child.kind() == "attribute_js_expr")
                .map(ByteRange::from_node)
                .unwrap_or_else(|| inner_range_from_delimiters(node, 1, 1));

            expressions.push(AstroExpression {
                kind: AstroExpressionKind::AttributeInterpolation,
                range: ByteRange::from_node(node),
                inner_range: inner,
                start: node.start_position().into(),
                end: node.end_position().into(),
            });
        }
        "attribute_backtick_string" => expressions.push(AstroExpression {
            kind: AstroExpressionKind::AttributeBacktickString,
            range: ByteRange::from_node(node),
            inner_range: inner_range_from_delimiters(node, 1, 1),
            start: node.start_position().into(),
            end: node.end_position().into(),
        }),
        "element" => {
            if let Some(candidate) = extract_component_candidate(source, node) {
                component_candidates.push(candidate);
            }
        }
        _ => {}
    }

    if node.kind() == "frontmatter_js_block" {
        return;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_analysis(source, child, expressions, component_candidates);
    }
}

fn extract_component_candidate(source: &str, node: Node<'_>) -> Option<AstroComponentCandidate> {
    let mut cursor = node.walk();
    let tag_node = node
        .children(&mut cursor)
        .find(|child| child.kind() == "start_tag" || child.kind() == "self_closing_tag")?;

    let tag_kind = if tag_node.kind() == "self_closing_tag" {
        AstroTagKind::SelfClosing
    } else {
        AstroTagKind::Normal
    };

    let mut tag_cursor = tag_node.walk();
    let tag_name_node = tag_node
        .children(&mut tag_cursor)
        .find(|child| child.kind() == "tag_name")?;
    let tag_name = source
        .get(tag_name_node.start_byte()..tag_name_node.end_byte())?
        .to_string();

    let is_component_candidate = tag_name
        .chars()
        .next()
        .map(|first| first.is_ascii_uppercase())
        .unwrap_or(false);

    if !is_component_candidate {
        return None;
    }

    Some(AstroComponentCandidate {
        tag_name,
        tag_kind,
        range: ByteRange::from_node(node),
        tag_name_range: ByteRange::from_node(tag_name_node),
        tag_start_range: ByteRange::from_node(tag_node),
        start: node.start_position().into(),
        end: node.end_position().into(),
    })
}

fn inner_range_from_delimiters(node: Node<'_>, prefix_len: usize, suffix_len: usize) -> ByteRange {
    let start = node.start_byte().saturating_add(prefix_len);
    let end = node.end_byte().saturating_sub(suffix_len).max(start);
    ByteRange { start, end }
}
