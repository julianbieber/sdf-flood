use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use wgpu::{Backends, InstanceFlags};
use winit::{
    event::{ElementState, Event, KeyEvent, WindowEvent},
    event_loop::EventLoop,
    keyboard::{Key, NamedKey},
    monitor::VideoMode,
    window::{Fullscreen, WindowBuilder},
};

use crate::{
    state::{State, WindowSize},
    util::Fps,
};

pub fn render_to_screen(
    show_fps: bool,
    pi: bool,
    srgb: bool,
    fragment_shader: &str,
    fft: &Arc<Mutex<Vec<f32>>>,
    time_offset: f32,
    eye_positions: Arc<Mutex<Vec<[f32; 2]>>>,
) {
    let event_loop = EventLoop::new().unwrap();
    let mut video_modes: Vec<_> = event_loop
        .available_monitors()
        .next()
        .unwrap()
        .video_modes()
        .collect();
    video_modes.sort_by_key(|a| a.size().height * a.size().width);
    let window_mode = video_modes.into_iter().last().unwrap().clone();
    dbg!(&window_mode);
    let window = Arc::new(
        WindowBuilder::new()
            .with_fullscreen(Some(Fullscreen::Exclusive(window_mode.clone())))
            .build(&event_loop)
            .unwrap(),
    );
    let mut fps = Fps::new();
    let mut input_state = InputState {
        mouse_position: (0.0, 0.0),
        pressed: HashMap::new(),
        is_clicked: false,
    };
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: if pi { Backends::GL } else { Backends::VULKAN },
        dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
        flags: InstanceFlags::empty(),
        gles_minor_version: wgpu::Gles3MinorVersion::Automatic,
    });
    let w2 = window.clone();
    let surface = Some(instance.create_surface(&w2).unwrap());
    let (mut render_state, _f, _t) = pollster::block_on(State::new(
        instance,
        surface,
        None,
        WindowSize {
            width: window.inner_size().width,
            height: window.inner_size().height,
        },
        fragment_shader,
        fft,
        time_offset,
        eye_positions,
        srgb,
        pi,
    ));
    event_loop
        .run(move |event, elwt| match event {
            Event::WindowEvent {
                ref event,
                window_id,
            } if window_id == window.id() => match event {
                WindowEvent::KeyboardInput {
                    event:
                        KeyEvent {
                            logical_key: Key::Named(NamedKey::Escape),
                            ..
                        },
                    ..
                } => elwt.exit(),
                WindowEvent::Resized(size) => render_state.resize(*size),
                // WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                //     state.resize(**new_inner_size)
                // }
                WindowEvent::KeyboardInput {
                    event:
                        KeyEvent {
                            logical_key, state, ..
                        },
                    ..
                } => match state {
                    ElementState::Pressed => {
                        let just_pressed = input_state.is_just_pressed(logical_key.clone());
                        if just_pressed {
                            render_state.report_just_pressed(logical_key.clone());
                        }
                    }
                    ElementState::Released => input_state.released(logical_key.clone()),
                },
                WindowEvent::MouseInput {
                    state: click_state, ..
                } => {
                    match click_state {
                        ElementState::Pressed => input_state.is_clicked = true,
                        ElementState::Released => input_state.is_clicked = false,
                    };
                }
                WindowEvent::CursorMoved { position, .. } => {
                    input_state.mouse_position = (position.x, position.y);
                }
                WindowEvent::RedrawRequested => {
                    if show_fps {
                        fps.presented();
                        dbg!(fps.fps());
                    }
                    if input_state.is_clicked {
                        render_state.report_click(input_state.relative_mouse(&window_mode));
                    }
                    match render_state.render(None, None) {
                        Ok(_) => window.request_redraw(),
                        // Err(wgpu::SurfaceError::Lost) => state.resize(todo!()),
                        Err(wgpu::SurfaceError::OutOfMemory) => elwt.exit(),
                        Err(e) => {
                            eprintln!("{e:?}");
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        })
        .unwrap();
}

#[derive(Debug)]
struct InputState {
    mouse_position: (f64, f64),
    pressed: HashMap<Key, bool>,
    is_clicked: bool,
}

impl InputState {
    fn relative_mouse(&self, window_mode: &VideoMode) -> (f32, f32) {
        let size = window_mode.size();
        (
            self.mouse_position.0 as f32 / size.width as f32,
            1.0 - self.mouse_position.1 as f32 / size.height as f32,
        )
    }

    fn is_just_pressed(&mut self, key: Key) -> bool {
        let previous = self.pressed.get(&key).cloned().unwrap_or(false);
        *self.pressed.entry(key).or_insert(true) = true;
        !previous
    }

    fn released(&mut self, key: Key) {
        *self.pressed.entry(key).or_insert(false) = false;
    }
}
