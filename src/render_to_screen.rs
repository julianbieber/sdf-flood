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

use crate::{state::State, util::Fps};

pub fn render_to_screen(
    show_fps: bool,
    srgb: bool,
    fragment_shader: &str,
    fft: &Arc<Mutex<Vec<f32>>>,
) {
    let event_loop = EventLoop::new().unwrap();
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
    let mut fps = Fps::new();
    let mut input_state = InputState {
        mouse_position: (0.0, 0.0),
        pressed: HashMap::new(),
        is_clicked: false,
    };
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: Backends::VULKAN,
        dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
        flags: InstanceFlags::debugging(),
        gles_minor_version: wgpu::Gles3MinorVersion::Automatic,
    });
    let surface = Some(instance.create_surface(&window).unwrap());
    let (mut state, f, t) = pollster::block_on(State::new(
        instance,
        surface,
        None,
        window.inner_size().width,
        window.inner_size().height,
        &fragment_shader,
        fft,
        srgb,
    ));
    let window_id = window.id();
    event_loop
        .run(move |event, elwt| match event {
            Event::WindowEvent {
                ref event,
                window_id,
            } if window_id == window_id => match event {
                WindowEvent::CloseRequested
                | WindowEvent::KeyboardInput {
                    event:
                        KeyEvent {
                            logical_key: Key::Named(NamedKey::Escape),
                            ..
                        },
                    ..
                } => elwt.exit(),
                WindowEvent::Resized(size) => state.resize(*size),
                // WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                //     state.resize(**new_inner_size)
                // }
                // WindowEvent::KeyboardInput { input, .. } => match input.state {
                //     ElementState::Pressed => {
                //         if input.virtual_keycode.is_some() {
                //             let just_pressed =
                //                 input_state.is_just_pressed(input.virtual_keycode.unwrap());
                //             if just_pressed {
                //                 state.report_just_pressed(input.virtual_keycode.unwrap());
                //             }
                //         }
                //     }
                //     ElementState::Released => {
                //         if input.virtual_keycode.is_some() {
                //             input_state.released(input.virtual_keycode.unwrap())
                //         }
                //     }
                // },
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
                        state.report_click(input_state.relative_mouse(&window_mode));
                    }
                    match state.render(None, None) {
                        Ok(_) => {}
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
