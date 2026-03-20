---
"unplugin-markup-import": patch
---

Added `include` and `exclude` options.

To fix type definition file generation, the plugin now generates temporary files during the build.
This requires knowing the target markup files ahead of time, which makes the previous automatic
detection based on the module graph no longer feasible. Users must now explicitly specify the
location of their markup files using these new options.
