mod audio;
mod model;
mod render_pipeline;
mod renderable;
mod util;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use clap::Parser;
use renderable::{MainDisplay, UIElements};
use util::Fps;
use wgpu::{Backends, BindGroup, BindGroupEntry, BindGroupLayout, Buffer, Device};
use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
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
    let window = WindowBuilder::new()
        .with_fullscreen(Some(Fullscreen::Exclusive(
            video_modes.last().unwrap().clone(),
        )))
        .build(&event_loop)
        .unwrap();
    let mut state = pollster::block_on(State::new(&window, &fragment_shader, &o, opt.srgb));
    let mut fps = Fps::new();
    event_loop.run(move |event, _, control_flow| match event {
        Event::WindowEvent {
            ref event,
            window_id,
        } if window_id == window.id() && !state.input(event) => match event {
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
            _ => {}
        },
        Event::RedrawRequested(window_id) if window_id == window.id() => {
            if opt.fps {
                fps.presented();
                dbg!(fps.fps());
            }
            match state.render() {
                Ok(_) => {}
                Err(wgpu::SurfaceError::Lost) => state.resize(state.size),
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

use winit::window::Window;

struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    main_display: MainDisplay,
    ui: UIElements,
}

impl State {
    // Creating some of the wgpu types requires async code
    async fn new(
        window: &Window,
        fragment_shader_s: &str,
        fft: &Arc<Mutex<Vec<f32>>>,
        srgb: bool,
    ) -> Self {
        let size = window.inner_size();
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: Backends::VULKAN,
            dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
        });
        let surface = unsafe { instance.create_surface(window).unwrap() };
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
            })
            .await
            .unwrap();
        let surface_caps = surface.get_capabilities(&adapter);
        // Shader code in this tutorial assumes an sRGB surface texture. Using a different
        // one will result all the colors coming out darker. If you want to support non
        // sRGB surfaces, you'll need to account for that when drawing to the frame.
        let surface_format = surface_caps
            .formats
            .iter()
            .find(|f| if srgb { f.is_srgb() } else { !f.is_srgb() })
            .copied()
            .unwrap_or(surface_caps.formats[0]);
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: None,
                    features: wgpu::Features::empty(),
                    limits: wgpu::Limits::default(),
                },
                None,
            )
            .await
            .unwrap();

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Immediate,
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
        };
        surface.configure(&device, &config);
        let main_display = MainDisplay::new(fft.clone(), &device, fragment_shader_s, config.format);
        let ui = UIElements::new(&device, config.format);

        Self {
            surface,
            device,
            queue,
            config,
            size,
            main_display,
            ui,
        }
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.size = new_size;
            self.config.width = self.size.width;
            self.config.height = self.size.height;
            self.surface.configure(&self.device, &self.config);
        }
    }

    fn input(&mut self, _event: &WindowEvent) -> bool {
        false
    }

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        let output = self.surface.get_current_texture()?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Render Encoder"),
            });
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLUE),
                        store: true,
                    },
                })],
                depth_stencil_attachment: None,
            });

            self.main_display.render(&mut render_pass);
            self.ui.render(&mut render_pass);
        }

        self.main_display.update_buffers(&self.queue);
        self.ui.update_buffers(&self.queue);
        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        Ok(())
    }
}

fn create_bind_group(device: &Device, layout: &BindGroupLayout, buffers: &[&Buffer]) -> BindGroup {
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries: &buffers
            .iter()
            .enumerate()
            .map(|(i, b)| BindGroupEntry {
                binding: i as u32,
                resource: b.as_entire_binding(),
            })
            .collect::<Vec<_>>(),
    });
    bind_group
}
