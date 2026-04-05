use std::{
    env, fs,
    io::{self, Read},
    process::ExitCode,
};

use lingui_analyzer::framework::astro::ir::lower_astro_html_interpolations;

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let source = match args.as_slice() {
        [path] => match fs::read_to_string(path) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("failed to read {path}: {error}");
                return ExitCode::FAILURE;
            }
        },
        [] => {
            let mut source = String::new();
            if let Err(error) = io::stdin().read_to_string(&mut source) {
                eprintln!("failed to read stdin: {error}");
                return ExitCode::FAILURE;
            }
            source
        }
        _ => {
            eprintln!("usage: cargo run --example astro_html_ir -- [path]");
            return ExitCode::FAILURE;
        }
    };

    match lower_astro_html_interpolations(&source) {
        Ok(lowered) => {
            for (index, interpolation) in lowered.iter().enumerate() {
                println!(
                    "[{}] bytes {}..{}",
                    index, interpolation.outer_span.start, interpolation.outer_span.end
                );
                println!("original: {}", interpolation.original.trim());
                println!("lowered:  {}", interpolation.code);
                println!();
            }
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
