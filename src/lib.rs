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

#[cfg(all(unix, not(target_family = "wasm")))]
use std::thread::{spawn, JoinHandle};

#[cfg(target_arch = "wasm32")]
use wasm_thread as thread;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(all(unix, not(target_family = "wasm")))]
fn background(_: Arc<Mutex<Vec<f32>>>) -> JoinHandle<()> {
    spawn(|| {})
}

#[cfg(target_arch = "wasm32")]
fn background(o: Arc<Mutex<Vec<f32>>>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let wav_data = include_bytes!("placeholder.wav");
        let mut vec = Vec::with_capacity(wav_data.len());
        vec.extend_from_slice(wav_data);
        audio::start_voyage(o, vec);
    })
}

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
    let o = Arc::new(Mutex::new(vec![0.0; 1024]));
    let _ = background(o.clone());

    let fragment_shader = include_str!("../shaders/nuage_nuage.frag");
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
