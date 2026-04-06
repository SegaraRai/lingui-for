use std::collections::BTreeMap;

use lean_string::LeanString;

use lingui_analyzer::conventions::{
    FrameworkConventions, FrameworkKind, MacroConventions, MacroPackage, MacroPackageKind,
    RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions, SyntheticConventions,
    WrapperConventions,
};

fn ls(text: &str) -> LeanString {
    LeanString::from(text)
}

pub fn svelte_default_conventions() -> FrameworkConventions {
    FrameworkConventions {
        framework: FrameworkKind::Svelte,
        macro_: MacroConventions {
            packages: BTreeMap::from([
                (
                    MacroPackageKind::Core,
                    MacroPackage {
                        packages: vec![ls("@lingui/core/macro")],
                    },
                ),
                (
                    MacroPackageKind::Svelte,
                    MacroPackage {
                        packages: vec![ls("lingui-for-svelte/macro")],
                    },
                ),
            ]),
        },
        runtime: RuntimeConventions {
            package: ls("lingui-for-svelte/runtime"),
            exports: RuntimeExportConventions {
                trans: ls("RuntimeTrans"),
                i18n_accessor: Some(ls("createLinguiAccessors")),
            },
        },
        bindings: RuntimeBindingSeeds {
            i18n_accessor_factory: Some(ls("createLinguiAccessors")),
            context: Some(ls("__l4s_ctx")),
            get_i18n: Some(ls("__l4s_getI18n")),
            translate: Some(ls("__l4s_translate")),
            i18n_instance: None,
            runtime_trans_component: ls("L4sRuntimeTrans"),
        },
        synthetic: Some(SyntheticConventions {
            expression_prefix: Some(ls("__lingui_for_svelte_expr_")),
            component_prefix: Some(ls("__lingui_for_svelte_component_")),
        }),
        wrappers: Some(WrapperConventions {
            reactive_translation: Some(ls("__lingui_for_svelte_reactive_translation__")),
            eager_translation: Some(ls("__lingui_for_svelte_eager_translation__")),
        }),
    }
}
