pub(crate) fn is_explicit_whitespace_string_expression(text: &str) -> bool {
    let Some(inner) = text
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
    else {
        return false;
    };
    let inner = inner.trim();
    let Some(quote) = inner.chars().next() else {
        return false;
    };
    if !matches!(quote, '"' | '\'' | '`') {
        return false;
    }
    let Some(content) = inner
        .strip_prefix(quote)
        .and_then(|value| value.strip_suffix(quote))
    else {
        return false;
    };
    if content.is_empty() {
        return false;
    }

    let mut chars = content.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            let Some(escaped) = chars.next() else {
                return false;
            };
            if !matches!(escaped, 'n' | 'r' | 't') {
                return false;
            }
            continue;
        }

        if !ch.is_whitespace() {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::is_explicit_whitespace_string_expression;

    #[test]
    fn detects_explicit_whitespace_string_expressions() {
        for source in [
            r#"{" "}"#,
            r#"{ " " }"#,
            r#"{'\n'}"#,
            r#"{ `\t\r` }"#,
            "{`\n`}",
        ] {
            assert!(is_explicit_whitespace_string_expression(source), "{source}");
        }
    }

    #[test]
    fn rejects_non_whitespace_or_non_string_expressions() {
        for source in [
            r#"{" x "}"#,
            r#"{"\u00a0"}"#,
            r#"{space}"#,
            r#"{"\""}"#,
            r#"{}"#,
            r#"{""}"#,
            r#"{` ${space} `}"#,
        ] {
            assert!(
                !is_explicit_whitespace_string_expression(source),
                "{source}"
            );
        }
    }
}
