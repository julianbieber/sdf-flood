use std::collections::HashMap;

use winit::{
    event::{ElementState, Event, KeyboardInput, VirtualKeyCode, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    monitor::VideoMode,
    window::{Fullscreen, WindowBuilder},
};

use crate::util::Fps;

fn foo() {
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
    let mut fps = Fps::new();
    let mut input_state = InputState {
        mouse_position: (0.0, 0.0),
        pressed: HashMap::new(),
        is_clicked: false,
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
            WindowEvent::KeyboardInput { input, .. } => match input.state {
                ElementState::Pressed => {
                    if input.virtual_keycode.is_some() {
                        let just_pressed =
                            input_state.is_just_pressed(input.virtual_keycode.unwrap());
                        if just_pressed {
                            state.report_just_pressed(input.virtual_keycode.unwrap());
                        }
                    }
                }
                ElementState::Released => {
                    if input.virtual_keycode.is_some() {
                        input_state.released(input.virtual_keycode.unwrap())
                    }
                }
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
            _ => {}
        },
        Event::RedrawRequested(window_id) if window_id == window.id() => {
            if opt.fps {
                fps.presented();
                dbg!(fps.fps());
            }
            if input_state.is_clicked {
                state.report_click(input_state.relative_mouse(&window_mode));
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

    fn is_just_pressed(&mut self, key: VirtualKeyCode) -> bool {
        let previous = self.pressed.get(&key).cloned().unwrap_or(false);
        *self.pressed.entry(key).or_insert(true) = true;
        !previous
    }

    fn released(&mut self, key: VirtualKeyCode) {
        *self.pressed.entry(key).or_insert(false) = false;
    }
}
