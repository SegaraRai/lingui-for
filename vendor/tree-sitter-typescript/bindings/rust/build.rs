fn main() {
    let root_dir = std::path::Path::new(".");
    let is_wasm_target = std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32");
    let typescript_dir = root_dir.join("typescript").join("src");
    let tsx_dir = root_dir.join("tsx").join("src");
    let common_dir = root_dir.join("common");

    let mut config = cc::Build::new();
    config.include(&typescript_dir);
    config
        .flag_if_supported("-std=c11")
        .flag_if_supported("-Wno-unused-parameter");

    if is_wasm_target {
        tree_sitter_wasm_build_tool::add_wasm_headers(&mut config).unwrap();
    }

    for path in &[
        typescript_dir.join("parser.c"),
        typescript_dir.join("scanner.c"),
        tsx_dir.join("parser.c"),
        tsx_dir.join("scanner.c"),
    ] {
        config.file(path);
        println!("cargo:rerun-if-changed={}", path.to_str().unwrap());
    }

    println!(
        "cargo:rerun-if-changed={}",
        common_dir.join("scanner.h").to_str().unwrap()
    );

    config.compile("tree-sitter-typescript");
}
