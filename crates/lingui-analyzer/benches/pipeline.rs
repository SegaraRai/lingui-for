use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use lingui_analyzer::conventions::FrameworkConventions;
use lingui_analyzer::extract::reinsert_transformed_declarations;
use lingui_analyzer::{
    AstroFinishCompileOptions, CompilePlanOptions, ExtractTransformedProgram, FrameworkKind,
    SvelteFinishCompileOptions, TransformedPrograms, WhitespaceMode, build_astro_compile_plan,
    build_svelte_compile_plan, build_synthetic_module_for_framework, finish_astro_compile,
    finish_svelte_compile,
};

#[path = "../tests/support/astro_conventions.rs"]
mod astro_conventions;
#[path = "../tests/support/svelte_conventions.rs"]
mod svelte_conventions;

struct BenchmarkFixture {
    name: &'static str,
    framework: FrameworkKind,
    source_name: &'static str,
    source: &'static str,
    extract_transformed_code: &'static str,
    extract_transformed_map: &'static str,
    compile_raw_code: Option<&'static str>,
    compile_raw_map: Option<&'static str>,
    compile_context_code: &'static str,
    compile_context_map: &'static str,
}

impl BenchmarkFixture {
    fn conventions(&self) -> FrameworkConventions {
        match self.framework {
            FrameworkKind::Astro => astro_conventions::astro_default_conventions(),
            FrameworkKind::Svelte => svelte_conventions::svelte_default_conventions(),
        }
    }

    fn whitespace(&self) -> WhitespaceMode {
        match self.framework {
            FrameworkKind::Astro => WhitespaceMode::Astro,
            FrameworkKind::Svelte => WhitespaceMode::Svelte,
        }
    }

    fn synthetic_name(&self, suffix: &str) -> String {
        format!("{name}?{suffix}", name = self.source_name)
    }

    fn compile_plan_options(&self) -> CompilePlanOptions {
        CompilePlanOptions {
            source: self.source.to_string(),
            source_name: Some(self.source_name.to_string()),
            synthetic_name: Some(self.synthetic_name("compile.tsx")),
            whitespace: Some(self.whitespace()),
            conventions: self.conventions(),
        }
    }

    fn synthetic_module_options(&self) -> (String, String, FrameworkConventions) {
        (
            self.source_name.to_string(),
            self.synthetic_name("extract.tsx"),
            self.conventions(),
        )
    }

    fn transformed_programs(&self) -> TransformedPrograms {
        TransformedPrograms {
            raw_code: self.compile_raw_code.map(str::to_string),
            raw_source_map_json: self.compile_raw_map.map(str::to_string),
            context_code: Some(self.compile_context_code.to_string()),
            context_source_map_json: Some(self.compile_context_map.to_string()),
        }
    }

    fn extract_transformed_program(&self) -> ExtractTransformedProgram {
        ExtractTransformedProgram {
            code: self.extract_transformed_code.to_string(),
            source_map_json: Some(self.extract_transformed_map.to_string()),
        }
    }
}

const VIEWER_PAGE_SVELTE: BenchmarkFixture = BenchmarkFixture {
    name: "ViewerPage.svelte",
    framework: FrameworkKind::Svelte,
    source_name: "ViewerPage.svelte",
    source: include_str!("../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte"),
    extract_transformed_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte.extract.final.ts"
    ),
    extract_transformed_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte.extract.final.map"
    ),
    compile_raw_code: Some(include_str!(
        "../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte.transform.raw.tsx"
    )),
    compile_raw_map: Some(include_str!(
        "../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte.transform.raw.map"
    )),
    compile_context_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte.transform.context.tsx"
    ),
    compile_context_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/ViewerPage.svelte.transform.context.map"
    ),
};

const SVELTE_RICH_TEXT_ISLAND: BenchmarkFixture = BenchmarkFixture {
    name: "SvelteRichTextIsland.svelte",
    framework: FrameworkKind::Svelte,
    source_name: "SvelteRichTextIsland.svelte",
    source: include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte"
    ),
    extract_transformed_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte.extract.final.ts"
    ),
    extract_transformed_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte.extract.final.map"
    ),
    compile_raw_code: Some(include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte.transform.raw.tsx"
    )),
    compile_raw_map: Some(include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte.transform.raw.map"
    )),
    compile_context_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte.transform.context.tsx"
    ),
    compile_context_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/SvelteRichTextIsland.svelte.transform.context.map"
    ),
};

const ASTRO_RICH_TEXT: BenchmarkFixture = BenchmarkFixture {
    name: "AstroRichText.astro",
    framework: FrameworkKind::Astro,
    source_name: "AstroRichText.astro",
    source: include_str!("../../../examples/conformance/tests/fixtures/new/AstroRichText.astro"),
    extract_transformed_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/AstroRichText.astro.extract.final.tsx"
    ),
    extract_transformed_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/AstroRichText.astro.extract.final.map"
    ),
    compile_raw_code: None,
    compile_raw_map: None,
    compile_context_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/AstroRichText.astro.transform.context.tsx"
    ),
    compile_context_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/AstroRichText.astro.transform.context.map"
    ),
};

const UNICODE_ASTRO: BenchmarkFixture = BenchmarkFixture {
    name: "UnicodeFixture.astro",
    framework: FrameworkKind::Astro,
    source_name: "UnicodeFixture.astro",
    source: include_str!("../../../examples/conformance/tests/fixtures/new/UnicodeFixture.astro"),
    extract_transformed_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/UnicodeFixture.astro.extract.final.tsx"
    ),
    extract_transformed_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/UnicodeFixture.astro.extract.final.map"
    ),
    compile_raw_code: None,
    compile_raw_map: None,
    compile_context_code: include_str!(
        "../../../examples/conformance/tests/fixtures/new/UnicodeFixture.astro.transform.context.tsx"
    ),
    compile_context_map: include_str!(
        "../../../examples/conformance/tests/fixtures/new/UnicodeFixture.astro.transform.context.map"
    ),
};

const FIXTURES: &[BenchmarkFixture] = &[
    VIEWER_PAGE_SVELTE,
    SVELTE_RICH_TEXT_ISLAND,
    ASTRO_RICH_TEXT,
    UNICODE_ASTRO,
];

fn bench_build_synthetic_module(c: &mut Criterion) {
    let mut group = c.benchmark_group("build_synthetic_module");
    for fixture in FIXTURES {
        let (source_name, synthetic_name, conventions) = fixture.synthetic_module_options();
        group.bench_with_input(
            BenchmarkId::from_parameter(fixture.name),
            fixture,
            |b, fixture| {
                b.iter(|| {
                    build_synthetic_module_for_framework(
                        fixture.source,
                        &source_name,
                        &synthetic_name,
                        Some(fixture.whitespace()),
                        &conventions,
                    )
                    .expect("synthetic module benchmark should succeed")
                });
            },
        );
    }
    group.finish();
}

fn bench_reinsert_transformed_declarations(c: &mut Criterion) {
    let mut group = c.benchmark_group("reinsert_transformed_declarations");
    for fixture in FIXTURES {
        let (source_name, synthetic_name, conventions) = fixture.synthetic_module_options();
        let synthetic_module = build_synthetic_module_for_framework(
            fixture.source,
            &source_name,
            &synthetic_name,
            Some(fixture.whitespace()),
            &conventions,
        )
        .expect("synthetic module setup should succeed");
        let transformed_program = fixture.extract_transformed_program();

        group.bench_with_input(
            BenchmarkId::from_parameter(fixture.name),
            fixture,
            |b, fixture| {
                b.iter(|| {
                    reinsert_transformed_declarations(
                        fixture.source,
                        fixture.source_name,
                        &synthetic_module,
                        &transformed_program,
                    )
                    .expect("reinsert benchmark should succeed")
                });
            },
        );
    }
    group.finish();
}

fn bench_build_compile_plan(c: &mut Criterion) {
    let mut group = c.benchmark_group("build_compile_plan");
    for fixture in FIXTURES {
        let options = fixture.compile_plan_options();
        group.bench_with_input(
            BenchmarkId::from_parameter(fixture.name),
            fixture,
            |b, _| {
                b.iter(|| match fixture.framework {
                    FrameworkKind::Astro => {
                        let _ = build_astro_compile_plan(&options)
                            .expect("astro compile plan should succeed");
                    }
                    FrameworkKind::Svelte => {
                        let _ = build_svelte_compile_plan(&options)
                            .expect("svelte compile plan should succeed");
                    }
                });
            },
        );
    }
    group.finish();
}

fn bench_finish_compile(c: &mut Criterion) {
    let mut group = c.benchmark_group("finish_compile");
    for fixture in FIXTURES {
        let options = fixture.compile_plan_options();
        match fixture.framework {
            FrameworkKind::Astro => {
                let plan = build_astro_compile_plan(&options)
                    .expect("astro compile plan setup should succeed");
                let finish_options = AstroFinishCompileOptions {
                    plan,
                    source: fixture.source.to_string(),
                    transformed_programs: fixture.transformed_programs(),
                };
                group.bench_with_input(
                    BenchmarkId::from_parameter(fixture.name),
                    fixture,
                    |b, _| {
                        b.iter(|| {
                            finish_astro_compile(&finish_options)
                                .expect("astro finish compile benchmark should succeed")
                        });
                    },
                );
            }
            FrameworkKind::Svelte => {
                let plan = build_svelte_compile_plan(&options)
                    .expect("svelte compile plan setup should succeed");
                let finish_options = SvelteFinishCompileOptions {
                    plan,
                    source: fixture.source.to_string(),
                    transformed_programs: fixture.transformed_programs(),
                };
                group.bench_with_input(
                    BenchmarkId::from_parameter(fixture.name),
                    fixture,
                    |b, _| {
                        b.iter(|| {
                            finish_svelte_compile(&finish_options)
                                .expect("svelte finish compile benchmark should succeed")
                        });
                    },
                );
            }
        }
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_build_synthetic_module,
    bench_reinsert_transformed_declarations,
    bench_build_compile_plan,
    bench_finish_compile
);
criterion_main!(benches);
