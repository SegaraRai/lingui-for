use std::collections::BTreeMap;

use lingui_analyzer::conventions::{
    FrameworkConventions, FrameworkKind, MacroConventions, MacroPackage, MacroPackageKind,
    RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions, SyntheticConventions,
    WrapperConventions,
};

pub fn svelte_default_conventions() -> FrameworkConventions {
    FrameworkConventions {
        framework: FrameworkKind::Svelte,
        macro_: MacroConventions {
            packages: BTreeMap::from([
                (
                    MacroPackageKind::Core,
                    MacroPackage {
                        packages: vec!["@lingui/core/macro".to_string()],
                    },
                ),
                (
                    MacroPackageKind::Svelte,
                    MacroPackage {
                        packages: vec!["lingui-for-svelte/macro".to_string()],
                    },
                ),
            ]),
        },
        runtime: RuntimeConventions {
            package: "lingui-for-svelte/runtime".to_string(),
            exports: RuntimeExportConventions {
                trans: "RuntimeTrans".to_string(),
                i18n_accessor: Some("createLinguiAccessors".to_string()),
            },
        },
        bindings: RuntimeBindingSeeds {
            i18n_accessor_factory: Some("createLinguiAccessors".to_string()),
            context: Some("__l4s_ctx".to_string()),
            get_i18n: Some("__l4s_getI18n".to_string()),
            translate: Some("__l4s_translate".to_string()),
            i18n_instance: None,
            runtime_trans_component: "L4sRuntimeTrans".to_string(),
        },
        synthetic: Some(SyntheticConventions {
            expression_prefix: Some("__lingui_for_svelte_expr_".to_string()),
            component_prefix: Some("__lingui_for_svelte_component_".to_string()),
        }),
        wrappers: Some(WrapperConventions {
            reactive_translation: Some("__lingui_for_svelte_reactive_translation__".to_string()),
            eager_translation: Some("__lingui_for_svelte_eager_translation__".to_string()),
        }),
    }
}
