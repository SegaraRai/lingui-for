use std::collections::{HashMap, HashSet};

use crate::framework::MacroImport;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct ScopeFrame {
    names: HashSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LexicalScope {
    imports: HashMap<String, MacroImport>,
    frames: Vec<ScopeFrame>,
}

impl LexicalScope {
    pub fn new(imports: impl IntoIterator<Item = MacroImport>) -> Self {
        let import_map = imports
            .into_iter()
            .map(|import_decl| (import_decl.local_name.clone(), import_decl))
            .collect();

        Self {
            imports: import_map,
            frames: vec![ScopeFrame::default()],
        }
    }

    pub fn push(&mut self) {
        self.frames.push(ScopeFrame::default());
    }

    pub fn pop(&mut self) {
        if self.frames.len() > 1 {
            self.frames.pop();
        }
    }

    pub fn declare(&mut self, name: impl Into<String>) {
        if let Some(frame) = self.frames.last_mut() {
            frame.names.insert(name.into());
        }
    }

    pub fn declare_many<I, S>(&mut self, names: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for name in names {
            self.declare(name);
        }
    }

    pub fn is_shadowed(&self, name: &str) -> bool {
        self.frames
            .iter()
            .rev()
            .any(|frame| frame.names.contains(name))
    }

    pub fn resolve_macro(&self, name: &str) -> Option<&MacroImport> {
        if self.is_shadowed(name) {
            return None;
        }

        self.imports.get(name)
    }
}

#[cfg(test)]
mod tests {
    use crate::common::Span;

    use super::{LexicalScope, MacroImport};

    fn import(local_name: &str, imported_name: &str) -> MacroImport {
        MacroImport {
            source: "@lingui/core/macro".into(),
            imported_name: imported_name.into(),
            local_name: local_name.into(),
            span: Span::new(0, 0),
        }
    }

    #[test]
    fn resolves_import_without_shadowing() {
        let scope = LexicalScope::new([import("t", "t")]);
        assert_eq!(
            scope
                .resolve_macro("t")
                .map(|import_decl| import_decl.imported_name.as_str()),
            Some("t")
        );
    }

    #[test]
    fn local_shadowing_hides_macro_binding() {
        let mut scope = LexicalScope::new([import("t", "t")]);
        scope.declare("t");
        assert!(scope.resolve_macro("t").is_none());
    }

    #[test]
    fn nested_shadowing_is_scoped() {
        let mut scope = LexicalScope::new([import("t", "t")]);
        scope.push();
        scope.declare("t");
        assert!(scope.resolve_macro("t").is_none());

        scope.pop();
        assert!(scope.resolve_macro("t").is_some());
    }

    #[test]
    fn unrelated_locals_do_not_shadow_macro_binding() {
        let mut scope = LexicalScope::new([import("t", "t")]);
        scope.declare("message");
        assert!(scope.resolve_macro("t").is_some());
    }
}
