pub(crate) fn find_pattern_near_start(
    source: &str,
    current_start: usize,
    current_end: usize,
    pattern: &str,
) -> Option<usize> {
    let window_start =
        clamp_to_char_boundary_floor(source, current_start.saturating_sub(pattern.len() + 8));
    let window_end = clamp_to_char_boundary_ceil(source, current_end.min(source.len()));
    source[window_start..window_end]
        .match_indices(pattern)
        .map(|(offset, _)| window_start + offset)
        .filter(|start| *start <= current_start)
        .max()
}

pub(crate) fn clamp_to_char_boundary_floor(source: &str, mut index: usize) -> usize {
    index = index.min(source.len());
    while index > 0 && !source.is_char_boundary(index) {
        index -= 1;
    }
    index
}

pub(crate) fn clamp_to_char_boundary_ceil(source: &str, mut index: usize) -> usize {
    index = index.min(source.len());
    while index < source.len() && !source.is_char_boundary(index) {
        index += 1;
    }
    index
}
