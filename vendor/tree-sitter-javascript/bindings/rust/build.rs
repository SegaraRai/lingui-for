fn main() {
    let src_dir = std::path::Path::new("src");
    let is_wasm_target = std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32");

    let mut c_config = cc::Build::new();
    c_config
        .std("c11")
        .include(src_dir)
        .flag_if_supported("-Wno-unused-parameter");

    #[cfg(target_env = "msvc")]
    c_config.flag("-utf-8");

    if is_wasm_target {
        tree_sitter_wasm_build_tool::add_wasm_headers(&mut c_config).unwrap();
    }

    let parser_path = src_dir.join("parser.c");
    c_config.file(&parser_path);
    println!("cargo:rerun-if-changed={}", parser_path.to_str().unwrap());

    let scanner_path = src_dir.join("scanner.c");
    if scanner_path.exists() {
        c_config.file(&scanner_path);
        println!("cargo:rerun-if-changed={}", scanner_path.to_str().unwrap());
    }

    c_config.compile("tree-sitter-javascript");
}
