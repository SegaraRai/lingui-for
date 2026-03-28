use lingui_analyzer::conventions::{
    FrameworkConventions, FrameworkKind, MacroConventions, RuntimeBindingSeeds, RuntimeConventions,
    RuntimeExportConventions,
};

pub fn astro_default_conventions() -> FrameworkConventions {
    FrameworkConventions {
        framework: FrameworkKind::Astro,
        macro_: MacroConventions {
            primary_package: "lingui-for-astro/macro".to_string(),
            accepted_packages: vec![
                "lingui-for-astro/macro".to_string(),
                "@lingui/core/macro".to_string(),
            ],
        },
        runtime: RuntimeConventions {
            package: "lingui-for-astro/runtime".to_string(),
            exports: RuntimeExportConventions {
                trans: "RuntimeTrans".to_string(),
                i18n_accessor: Some("createFrontmatterI18n".to_string()),
            },
        },
        bindings: RuntimeBindingSeeds {
            i18n_accessor_factory: Some("__l4a_createI18n".to_string()),
            context: None,
            get_i18n: None,
            translate: None,
            i18n_instance: Some("__l4a_i18n".to_string()),
            runtime_trans_component: "L4aRuntimeTrans".to_string(),
        },
        synthetic: None,
        wrappers: None,
    }
}
