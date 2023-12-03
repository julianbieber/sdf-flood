mod audio;
mod model;
mod render_pipeline;
mod render_surface;
mod render_to_file;
mod render_to_screen;
mod renderable;
mod state;
mod util;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use clap::Parser;
use state::State;
use util::Fps;
use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
    monitor::VideoMode,
    window::{Fullscreen, WindowBuilder},
};

#[derive(Parser, Debug)]
struct Opt {
    #[arg(long, default_value = "shaders/shader.frag")]
    shader_path: PathBuf,
    #[arg(long)]
    srgb: bool,
    #[arg(long)]
    fps: bool,
    #[arg(long)]
    image_path: Option<PathBuf>,
}

fn main() {
    env_logger::init();
    let o = Arc::new(Mutex::new(vec![0.0; 2048]));
    let _audio_stream = audio::start(o.clone());

    let opt = dbg!(Opt::parse());

    let fragment_shader = std::fs::read_to_string(opt.shader_path).unwrap();
    let mut state = pollster::block_on(State::new(&window, &fragment_shader, &o, opt.srgb));
}
