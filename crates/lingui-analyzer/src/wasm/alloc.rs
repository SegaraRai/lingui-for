#[cfg(not(target_arch = "wasm32"))]
pub fn ensure_tree_sitter_allocator() {
    // No-op on non-wasm32 targets.
}

#[cfg(target_arch = "wasm32")]
pub fn ensure_tree_sitter_allocator() {
    use core::ffi::c_void;
    use core::ptr;
    use std::alloc::{Layout, alloc, dealloc};

    static mut INSTALLED: bool = false;

    unsafe extern "C" fn ts_malloc(size: usize) -> *mut c_void {
        if size == 0 {
            return ptr::null_mut();
        }

        const ALIGN: usize = 16;
        const HEADER: usize = core::mem::size_of::<usize>();
        let total = match size.checked_add(HEADER) {
            Some(total) => total,
            None => return ptr::null_mut(),
        };
        let layout = match Layout::from_size_align(total, ALIGN) {
            Ok(layout) => layout,
            Err(_) => return ptr::null_mut(),
        };
        let base = unsafe { alloc(layout) };
        if base.is_null() {
            return ptr::null_mut();
        }

        unsafe {
            (base as *mut usize).write(size);
            base.add(HEADER) as *mut c_void
        }
    }

    unsafe extern "C" fn ts_calloc(nmemb: usize, size: usize) -> *mut c_void {
        let total = match nmemb.checked_mul(size) {
            Some(total) => total,
            None => return ptr::null_mut(),
        };
        let ptr = unsafe { ts_malloc(total) } as *mut u8;
        if ptr.is_null() {
            return ptr::null_mut();
        }
        unsafe { ptr::write_bytes(ptr, 0, total) };
        ptr as *mut c_void
    }

    unsafe extern "C" fn ts_free(ptr_in: *mut c_void) {
        if ptr_in.is_null() {
            return;
        }

        const ALIGN: usize = 16;
        const HEADER: usize = core::mem::size_of::<usize>();
        let user = ptr_in as *mut u8;
        let base = unsafe { user.sub(HEADER) };
        let size = unsafe { (base as *mut usize).read() };
        let total = match size.checked_add(HEADER) {
            Some(total) => total,
            None => return,
        };
        let layout = match Layout::from_size_align(total, ALIGN) {
            Ok(layout) => layout,
            Err(_) => return,
        };
        unsafe { dealloc(base, layout) };
    }

    unsafe extern "C" fn ts_realloc(ptr_in: *mut c_void, new_size: usize) -> *mut c_void {
        if ptr_in.is_null() {
            return unsafe { ts_malloc(new_size) };
        }

        if new_size == 0 {
            unsafe { ts_free(ptr_in) };
            return ptr::null_mut();
        }

        const HEADER: usize = core::mem::size_of::<usize>();
        let user = ptr_in as *mut u8;
        let base = unsafe { user.sub(HEADER) };
        let old_size = unsafe { (base as *mut usize).read() };

        let new_ptr = unsafe { ts_malloc(new_size) } as *mut u8;
        if new_ptr.is_null() {
            return ptr::null_mut();
        }

        let to_copy = core::cmp::min(old_size, new_size);
        unsafe { ptr::copy_nonoverlapping(user, new_ptr, to_copy) };
        unsafe { ts_free(ptr_in) };
        new_ptr as *mut c_void
    }

    unsafe {
        if INSTALLED {
            return;
        }
        INSTALLED = true;
        tree_sitter::set_allocator(
            Some(ts_malloc),
            Some(ts_calloc),
            Some(ts_realloc),
            Some(ts_free),
        );
    }
}
