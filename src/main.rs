mod audio;
mod model;
mod render_pipeline;
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
}

fn main() {
    env_logger::init();
    let o = Arc::new(Mutex::new(vec![0.0; 1920]));
    audio::start(o.clone());

    let opt = dbg!(Opt::parse());

    let fragment_shader = std::fs::read_to_string(opt.shader_path).unwrap();

    // let mut scene = Scene::new(light_spheres, spheres);
    let event_loop = EventLoop::new();
    let mut video_modes: Vec<_> = event_loop
        .available_monitors()
        .next()
        .unwrap()
        .video_modes()
        .collect();
    video_modes.sort_by_key(|a| a.size().height * a.size().width);
    let window_mode = video_modes.last().unwrap().clone();
    let window = WindowBuilder::new()
        .with_fullscreen(Some(Fullscreen::Exclusive(window_mode.clone())))
        .build(&event_loop)
        .unwrap();
    let mut state = pollster::block_on(State::new(&window, &fragment_shader, &o, opt.srgb));
    let mut fps = Fps::new();
    let mut input_state = InputState {
        mouse_position: (0.0, 0.0),
        pressed: HashMap::new(),
    };
    event_loop.run(move |event, _, control_flow| match event {
        Event::WindowEvent {
            ref event,
            window_id,
        } if window_id == window.id() => match event {
            WindowEvent::CloseRequested
            | WindowEvent::KeyboardInput {
                input:
                    KeyboardInput {
                        state: ElementState::Pressed,
                        virtual_keycode: Some(VirtualKeyCode::Escape),
                        ..
                    },
                ..
            } => *control_flow = ControlFlow::Exit,
            WindowEvent::Resized(size) => state.resize(*size),
            WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                state.resize(**new_inner_size)
            }
            WindowEvent::KeyboardInput { input, .. } => {
                // let a = todo!();
                match input.state {
                    ElementState::Pressed => {
                        let just_pressed =
                            input_state.is_just_pressed(input.virtual_keycode.unwrap());
                        if just_pressed {
                            state.report_just_pressed(input.virtual_keycode.unwrap());
                        }
                    }
                    ElementState::Released => input_state.released(input.virtual_keycode.unwrap()),
                }
            }
            WindowEvent::MouseInput { state, .. } => {
                let pressed = match state {
                    ElementState::Pressed => true,
                    ElementState::Released => false,
                };
                dbg!(pressed, &input_state.relative_mouse(&window_mode));
                ()
            }
            WindowEvent::CursorMoved { position, .. } => {
                input_state.mouse_position = (position.x, position.y);
            }
            _ => {}
        },
        Event::RedrawRequested(window_id) if window_id == window.id() => {
            if opt.fps {
                fps.presented();
                dbg!(fps.fps());
            }
            match state.render() {
                Ok(_) => {}
                // Err(wgpu::SurfaceError::Lost) => state.resize(todo!()),
                Err(wgpu::SurfaceError::OutOfMemory) => *control_flow = ControlFlow::Exit,
                Err(e) => {
                    eprintln!("{e:?}");
                }
            }
        }
        Event::MainEventsCleared => window.request_redraw(),
        _ => {}
    });
}

#[derive(Debug)]
struct InputState {
    mouse_position: (f64, f64),
    pressed: HashMap<VirtualKeyCode, bool>,
}

impl InputState {
    fn relative_mouse(&self, window_mode: &VideoMode) -> (f32, f32) {
        let size = window_mode.size();
        (
            self.mouse_position.0 as f32 / size.width as f32,
            self.mouse_position.1 as f32 / size.height as f32,
        )
    }

    fn is_just_pressed(&mut self, key: VirtualKeyCode) -> bool {
        let previous = self.pressed.get(&key).cloned().unwrap_or(false);
        *self.pressed.entry(key).or_insert(true) = true;
        !previous
    }

    fn released(&mut self, key: VirtualKeyCode) {
        *self.pressed.entry(key).or_insert(false) = false;
    }
}
