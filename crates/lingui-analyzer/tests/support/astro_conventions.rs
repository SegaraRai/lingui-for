use std::collections::BTreeMap;

use lean_string::LeanString;
use lingui_analyzer::conventions::{
    FrameworkConventions, FrameworkKind, MacroConventions, MacroPackage, MacroPackageKind,
    RuntimeBindingSeeds, RuntimeConventions, RuntimeExportConventions,
};

fn ls(text: &str) -> LeanString {
    LeanString::from(text)
}

pub fn astro_default_conventions() -> FrameworkConventions {
    FrameworkConventions {
        framework: FrameworkKind::Astro,
        macro_: MacroConventions {
            packages: BTreeMap::from([
                (
                    MacroPackageKind::Core,
                    MacroPackage {
                        packages: vec![ls("@lingui/core/macro")],
                    },
                ),
                (
                    MacroPackageKind::Astro,
                    MacroPackage {
                        packages: vec![ls("lingui-for-astro/macro")],
                    },
                ),
            ]),
        },
        runtime: RuntimeConventions {
            package: ls("lingui-for-astro/runtime"),
            exports: RuntimeExportConventions {
                trans: ls("RuntimeTrans"),
                i18n_accessor: Some(ls("createLinguiAccessors")),
            },
        },
        bindings: RuntimeBindingSeeds {
            i18n_accessor_factory: Some(ls("__l4a_createI18n")),
            context: None,
            get_i18n: None,
            translate: None,
            i18n_instance: Some(ls("__l4a_i18n")),
            runtime_trans_component: ls("L4aRuntimeTrans"),
        },
        synthetic: None,
        wrappers: None,
    }
}
