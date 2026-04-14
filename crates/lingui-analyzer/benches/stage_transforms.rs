use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use lean_string::LeanString;

use lingui_analyzer::conventions::{FrameworkConventions, FrameworkKind};
use lingui_analyzer::extract::build_synthetic_module;
use lingui_analyzer::framework::astro::AstroAdapter;
use lingui_analyzer::framework::svelte::SvelteAdapter;
use lingui_analyzer::framework::{AnalyzeOptions, FrameworkAdapter};
use lingui_analyzer::{
    AstroFinishTransformOptions, AstroTransformPlan, MacroCandidate, MacroCandidateStrategy,
    SvelteFinishTransformOptions, SvelteTransformPlan, TransformPlanOptions, TransformedPrograms,
    WhitespaceMode, build_astro_transform_plan, build_svelte_transform_plan,
    build_synthetic_module_for_framework, finish_astro_transform, finish_svelte_transform,
};

#[path = "../tests/support/astro_conventions.rs"]
mod astro_conventions;
#[path = "../tests/support/svelte_conventions.rs"]
mod svelte_conventions;

use astro_conventions::astro_default_conventions;
use svelte_conventions::svelte_default_conventions;

#[derive(Clone)]
struct FixtureCase {
    framework: FrameworkKind,
    name: &'static str,
    source_name: LeanString,
    source: LeanString,
    transformed_programs: StaticTransformedPrograms,
}

#[derive(Clone)]
struct StaticTransformedPrograms {
    lowered_code: Option<LeanString>,
    lowered_source_map_json: Option<LeanString>,
    contextual_code: Option<LeanString>,
    contextual_source_map_json: Option<LeanString>,
}

impl From<StaticTransformedPrograms> for TransformedPrograms {
    fn from(value: StaticTransformedPrograms) -> Self {
        TransformedPrograms {
            contextual_code: value.contextual_code,
            contextual_source_map_json: value.contextual_source_map_json,
            lowered_code: value.lowered_code,
            lowered_source_map_json: value.lowered_source_map_json,
        }
    }
}

#[derive(Clone)]
struct ExtractInputs {
    imports: Vec<lingui_analyzer::MacroImport>,
    candidates: Vec<MacroCandidate>,
    source_anchors: Vec<usize>,
}

#[derive(Clone)]
enum TransformPlanCase {
    Astro(AstroTransformPlan),
    Svelte(SvelteTransformPlan),
}

const FIXTURE_CASES: [FixtureCase; 4] = [
    FixtureCase {
        framework: FrameworkKind::Astro,
        name: "full",
        source_name: LeanString::from_static_str("astro-full.astro"),
        source: LeanString::from_static_str(include_str!("fixtures/astro-full.astro")),
        transformed_programs: StaticTransformedPrograms {
            lowered_code: None,
            lowered_source_map_json: None,
            contextual_code: Some(LeanString::from_static_str(include_str!(
                "fixtures/astro-full.astro.transform.contextual.tsx"
            ))),
            contextual_source_map_json: Some(LeanString::from_static_str(include_str!(
                "fixtures/astro-full.astro.transform.contextual.tsx.map"
            ))),
        },
    },
    FixtureCase {
        framework: FrameworkKind::Astro,
        name: "unicode",
        source_name: LeanString::from_static_str("astro-unicode.astro"),
        source: LeanString::from_static_str(include_str!("fixtures/astro-unicode.astro")),
        transformed_programs: StaticTransformedPrograms {
            lowered_code: None,
            lowered_source_map_json: None,
            contextual_code: Some(LeanString::from_static_str(include_str!(
                "fixtures/astro-unicode.astro.transform.contextual.tsx"
            ))),
            contextual_source_map_json: Some(LeanString::from_static_str(include_str!(
                "fixtures/astro-unicode.astro.transform.contextual.tsx.map"
            ))),
        },
    },
    FixtureCase {
        framework: FrameworkKind::Svelte,
        name: "full",
        source_name: LeanString::from_static_str("svelte-full.svelte"),
        source: LeanString::from_static_str(include_str!("fixtures/svelte-full.svelte")),
        transformed_programs: StaticTransformedPrograms {
            lowered_code: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-full.svelte.transform.lowered.tsx"
            ))),
            lowered_source_map_json: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-full.svelte.transform.lowered.tsx.map"
            ))),
            contextual_code: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-full.svelte.transform.contextual.tsx"
            ))),
            contextual_source_map_json: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-full.svelte.transform.contextual.tsx.map"
            ))),
        },
    },
    FixtureCase {
        framework: FrameworkKind::Svelte,
        name: "unicode",
        source_name: LeanString::from_static_str("svelte-unicode.svelte"),
        source: LeanString::from_static_str(include_str!("fixtures/svelte-unicode.svelte")),
        transformed_programs: StaticTransformedPrograms {
            lowered_code: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-unicode.svelte.transform.lowered.tsx"
            ))),
            lowered_source_map_json: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-unicode.svelte.transform.lowered.tsx.map"
            ))),
            contextual_code: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-unicode.svelte.transform.contextual.tsx"
            ))),
            contextual_source_map_json: Some(LeanString::from_static_str(include_str!(
                "fixtures/svelte-unicode.svelte.transform.contextual.tsx.map"
            ))),
        },
    },
];

fn framework_name(framework: FrameworkKind) -> &'static str {
    match framework {
        FrameworkKind::Astro => "astro",
        FrameworkKind::Svelte => "svelte",
    }
}

fn conventions(framework: FrameworkKind) -> FrameworkConventions {
    match framework {
        FrameworkKind::Astro => astro_default_conventions(),
        FrameworkKind::Svelte => svelte_default_conventions(),
    }
}

fn whitespace(framework: FrameworkKind) -> WhitespaceMode {
    match framework {
        FrameworkKind::Astro => WhitespaceMode::Astro,
        FrameworkKind::Svelte => WhitespaceMode::Svelte,
    }
}

fn analyze_options(case: &FixtureCase) -> AnalyzeOptions {
    AnalyzeOptions {
        source_name: case.source_name.clone(),
        whitespace: whitespace(case.framework),
        conventions: conventions(case.framework),
    }
}

fn transform_plan_options(case: &FixtureCase) -> TransformPlanOptions {
    TransformPlanOptions {
        source: case.source.clone(),
        source_name: Some(case.source_name.clone()),
        synthetic_name: Some(LeanString::from_static_str("synthetic-extract.tsx")),
        whitespace: Some(whitespace(case.framework)),
        conventions: conventions(case.framework),
        runtime_warnings: None,
    }
}

fn standalone_candidates(mut candidates: Vec<MacroCandidate>) -> Vec<MacroCandidate> {
    candidates.retain(|candidate| candidate.strategy == MacroCandidateStrategy::Standalone);
    candidates.sort_by_key(|candidate| (candidate.outer_span.start, candidate.outer_span.end));
    candidates
}

fn collect_extract_inputs(case: &FixtureCase) -> ExtractInputs {
    match case.framework {
        FrameworkKind::Astro => {
            let analysis = AstroAdapter
                .analyze(&case.source, &analyze_options(case))
                .expect("astro analysis succeeds");
            let mut candidates = analysis.semantic.frontmatter_candidates.clone();
            candidates.extend(
                analysis
                    .semantic
                    .template_expressions
                    .iter()
                    .flat_map(|expression| expression.candidates.iter().cloned()),
            );
            candidates.extend(
                analysis
                    .semantic
                    .template_components
                    .iter()
                    .map(|component| component.candidate.clone()),
            );
            ExtractInputs {
                imports: analysis.semantic.macro_imports,
                candidates: standalone_candidates(candidates),
                source_anchors: analysis.metadata.source_anchors,
            }
        }
        FrameworkKind::Svelte => {
            let analysis = SvelteAdapter
                .analyze(&case.source, &analyze_options(case))
                .expect("svelte analysis succeeds");
            let imports = analysis
                .semantic
                .scripts
                .iter()
                .flat_map(|script| script.macro_imports.iter().cloned())
                .collect::<Vec<_>>();
            let mut candidates = analysis
                .semantic
                .scripts
                .iter()
                .flat_map(|script| script.candidates.iter().cloned())
                .collect::<Vec<_>>();
            candidates.extend(
                analysis
                    .semantic
                    .template_expressions
                    .iter()
                    .flat_map(|expression| expression.candidates.iter().cloned()),
            );
            candidates.extend(
                analysis
                    .semantic
                    .template_components
                    .iter()
                    .map(|component| component.candidate.clone()),
            );
            ExtractInputs {
                imports,
                candidates: standalone_candidates(candidates),
                source_anchors: analysis.metadata.source_anchors,
            }
        }
    }
}

fn build_transform_plan(case: &FixtureCase) -> TransformPlanCase {
    match case.framework {
        FrameworkKind::Astro => TransformPlanCase::Astro(
            build_astro_transform_plan(&transform_plan_options(case))
                .expect("astro transform plan succeeds"),
        ),
        FrameworkKind::Svelte => TransformPlanCase::Svelte(
            build_svelte_transform_plan(&transform_plan_options(case))
                .expect("svelte transform plan succeeds"),
        ),
    }
}

fn bench_analyze(c: &mut Criterion) {
    let mut group = c.benchmark_group("analyze");
    for case in FIXTURE_CASES {
        group.bench_with_input(
            BenchmarkId::new(framework_name(case.framework), case.name),
            &case,
            |b, case| {
                let options = analyze_options(case);
                b.iter(|| match case.framework {
                    FrameworkKind::Astro => {
                        let analysis = AstroAdapter
                            .analyze(black_box(&case.source), black_box(&options))
                            .expect("astro analysis succeeds");
                        black_box(analysis);
                    }
                    FrameworkKind::Svelte => {
                        let analysis = SvelteAdapter
                            .analyze(black_box(&case.source), black_box(&options))
                            .expect("svelte analysis succeeds");
                        black_box(analysis);
                    }
                });
            },
        );
    }
    group.finish();
}

fn bench_extract(c: &mut Criterion) {
    let mut group = c.benchmark_group("extract");
    for case in FIXTURE_CASES {
        group.bench_with_input(
            BenchmarkId::new(framework_name(case.framework), case.name),
            &case,
            |b, case| {
                let case_conventions = conventions(case.framework);
                let case_synthetic_name = LeanString::from_static_str("synthetic-extract.tsx");

                b.iter(|| {
                    let module = build_synthetic_module_for_framework(
                        black_box(&case.source),
                        black_box(&case.source_name),
                        black_box(&case_synthetic_name),
                        Some(whitespace(case.framework)),
                        black_box(&case_conventions),
                    )
                    .expect("extract succeeds");
                    black_box(module);
                });
            },
        );
    }
    group.finish();
}

fn bench_extract_build_only(c: &mut Criterion) {
    let mut group = c.benchmark_group("extract_build_only");
    for case in FIXTURE_CASES {
        let inputs = collect_extract_inputs(&case);

        group.bench_with_input(
            BenchmarkId::new(framework_name(case.framework), case.name),
            &case,
            |b, case| {
                let case_synthetic_name = LeanString::from_static_str("synthetic-extract.tsx");

                b.iter(|| {
                    let module = build_synthetic_module(
                        black_box(&case.source),
                        black_box(&case.source_name),
                        black_box(&case_synthetic_name),
                        black_box(&inputs.imports),
                        black_box(&inputs.candidates),
                        black_box(&inputs.source_anchors),
                    )
                    .expect("synthetic builder succeeds");
                    black_box(module);
                });
            },
        );
    }
    group.finish();
}

fn bench_transform_plan(c: &mut Criterion) {
    let mut group = c.benchmark_group("transform_plan");
    for case in FIXTURE_CASES {
        group.bench_with_input(
            BenchmarkId::new(framework_name(case.framework), case.name),
            &case,
            |b, case| {
                let options = transform_plan_options(case);
                b.iter(|| match case.framework {
                    FrameworkKind::Astro => {
                        let plan = build_astro_transform_plan(black_box(&options))
                            .expect("astro transform plan succeeds");
                        black_box(plan);
                    }
                    FrameworkKind::Svelte => {
                        let plan = build_svelte_transform_plan(black_box(&options))
                            .expect("svelte transform plan succeeds");
                        black_box(plan);
                    }
                });
            },
        );
    }
    group.finish();
}

fn bench_finish_transform(c: &mut Criterion) {
    let mut group = c.benchmark_group("finish_transform");
    for case in FIXTURE_CASES {
        let plan = build_transform_plan(&case);
        let transformed_programs: TransformedPrograms = case.transformed_programs.clone().into();

        group.bench_with_input(
            BenchmarkId::new(framework_name(case.framework), case.name),
            &case,
            |b, case| {
                b.iter(|| match &plan {
                    TransformPlanCase::Astro(plan) => {
                        let finished =
                            finish_astro_transform(black_box(&AstroFinishTransformOptions {
                                plan: plan.clone(),
                                source: case.source.clone(),
                                transformed_programs: transformed_programs.clone(),
                            }))
                            .expect("astro finish transform succeeds");
                        black_box(finished);
                    }
                    TransformPlanCase::Svelte(plan) => {
                        let finished =
                            finish_svelte_transform(black_box(&SvelteFinishTransformOptions {
                                plan: plan.clone(),
                                source: case.source.clone(),
                                transformed_programs: transformed_programs.clone(),
                            }))
                            .expect("svelte finish transform succeeds");
                        black_box(finished);
                    }
                });
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_analyze,
    bench_extract,
    bench_extract_build_only,
    bench_transform_plan,
    bench_finish_transform
);
criterion_main!(benches);
