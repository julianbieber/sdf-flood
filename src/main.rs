mod audio;
mod eye;
mod model;
mod render_pipeline;
mod render_to_file;
mod render_to_screen;
mod renderable;
mod sound;
mod state;
mod util;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
};

use clap::Parser;
use cpal::Stream;
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
    #[arg(long)]
    cam: bool,
    #[arg(long)]
    play_audio: bool,
    #[arg(long)]
    fft_voyage_voyage: bool,
}

#[allow(dead_code)]
enum AudioStream {
    STREAM(Stream),
    THREAD(JoinHandle<()>),
}

fn main() {
    env_logger::init();

    let opt = dbg!(Opt::parse());
    let (_audio_stream, o) = if opt.fft_voyage_voyage {
        let o = Arc::new(Mutex::new(vec![0.0f32; 1024]));
        let o_c = o.clone();
        let s = thread::spawn(move || {
            let wav = std::fs::read("src/voyage.wav").unwrap();
            audio::start_voyage(o_c, wav);
        });
        (AudioStream::THREAD(s), o)
    } else {
        let (s, o) = audio::start();
        (AudioStream::STREAM(s), o)
    };

    let eye_positions = Arc::new(Mutex::new(Vec::new()));
    let eye_join_handle = if opt.cam {
        eye::capture_eyes(eye_positions.clone())
    } else {
        thread::spawn(|| {})
    };
    let _s = if opt.play_audio {
        Some(sound::play_audio())
    } else {
        None
    };

    let fragment_shader = std::fs::read_to_string(opt.shader_path).unwrap();
    match opt.image_path {
        Some(_) => pollster::block_on(render_to_file(opt.srgb, &fragment_shader, &o, opt.time)),
        None => render_to_screen(
            opt.fps,
            opt.pi,
            opt.srgb,
            &fragment_shader,
            &o,
            opt.time,
            eye_positions,
        ),
    }
    eye_join_handle.join().unwrap();
}
