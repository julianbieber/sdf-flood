mod audio;
mod model;
mod render_pipeline;
mod render_to_file;
mod render_to_screen;
mod renderable;
mod state;
mod util;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use clap::Parser;
use render_to_file::render_to_file;
use render_to_screen::render_to_screen;

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
    #[arg(long)]
    pi: bool,
    #[arg(long, default_value_t = 0.0)]
    time: f32,
}

fn main() {
    env_logger::init();
    let o = Arc::new(Mutex::new(vec![0.0; 2048]));
    let _audio_stream = audio::start(o.clone());

    let opt = dbg!(Opt::parse());

    let fragment_shader = std::fs::read_to_string(opt.shader_path).unwrap();
    match opt.image_path {
        Some(_) => pollster::block_on(render_to_file(opt.srgb, &fragment_shader, &o, opt.time)),
        None => render_to_screen(opt.fps, opt.pi, opt.srgb, &fragment_shader, &o, opt.time),
    }
}
