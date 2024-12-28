mod audio;
mod model;
mod render_pipeline;
mod render_to_file;
mod render_to_screen;
mod renderable;
mod sound;
mod state;
mod util;

use render_to_screen::render_to_screen;
use std::sync::{Arc, Mutex};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen(start))]
pub fn run() {
    cfg_if::cfg_if! {
        if #[cfg(target_arch = "wasm32")] {
            use std::{cell::Cell, rc::Rc};
            std::panic::set_hook(Box::new(console_error_panic_hook::hook));
            console_log::init_with_level(log::Level::Warn).expect("Couldn't initialize logger");

            let document = gloo::utils::document();
            if let Some(play_button) = document.get_element_by_id("play") {

                let stream = Rc::new(Cell::new(None));

                let closure = Closure::<dyn FnMut(_)>::new(move |_event: web_sys::MouseEvent| {
                    stream.set(Some(sound::play_audio()));
                });
                play_button
                    .add_event_listener_with_callback("mousedown", closure.as_ref().unchecked_ref()).unwrap();
                closure.forget();
            }
        } else {
            env_logger::init();
        }
    }
    let o = Arc::new(Mutex::new(vec![0.0; 2048]));

    let fragment_shader = include_str!("../shaders/double_image.frag");
    render_to_screen(
        false,
        false,
        true,
        fragment_shader,
        &o,
        0.0,
        Arc::new(Mutex::new(Vec::new())),
    )
}
