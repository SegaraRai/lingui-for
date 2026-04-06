use lean_string::LeanString;
use tree_sitter::Node;

use crate::common::{Span, node_text};
use crate::framework::MacroImport;

pub(crate) fn collect_import_specifiers_from_node(
    source: &str,
    node: Node<'_>,
    base_offset: usize,
    module_specifier: &LeanString,
    imports: &mut Vec<MacroImport>,
) {
    if node.kind() == "import_specifier" {
        let imported = node.child_by_field_name("name");
        let local = node.child_by_field_name("alias").or(imported);
        let (Some(imported), Some(local)) = (imported, local) else {
            return;
        };

        imports.push(MacroImport {
            source: module_specifier.clone(),
            imported_name: LeanString::from(node_text(source, imported)),
            local_name: LeanString::from(node_text(source, local)),
            span: Span::from_node(node).shifted(base_offset),
        });
        return;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_import_specifiers_from_node(source, child, base_offset, module_specifier, imports);
    }
}
